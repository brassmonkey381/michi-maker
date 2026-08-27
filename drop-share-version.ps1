# drop-share-version.ps1 - retire the share-link edit counter, now that the fingerprint is live.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"
#
# Applies supabase/migrations/20260826180000_drop_share_version.sql.
#
# THIS ONE IS ORDER-SENSITIVE, unlike apply-share-key.ps1. Dropping a column the deployed code
# still selects makes PostgREST reject the whole select, and every shared binder would unfurl as
# the generic fallback until a deploy fixed it. So this REFUSES TO RUN unless production is already
# serving share_key - checked, not assumed, by reading a live share link and looking at its ?v=.
# An integer there means the old build is still up.
#
# The token is read from the workspace secrets file into memory and is never printed.

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SecretsFile = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'
$ProjectRef = 'piikwvntldytjejxmcla'
$Probe = 'https://michi-maker.com/binder/34542460-bbfd-4a7f-8356-db42d4cb86f6'

function Fail($step, $msg, $code) {
  Write-Host ""
  Write-Host "FAILED at [$step]: $msg (exit $code)" -ForegroundColor Red
  exit $code
}

# Invoke-RestMethod throws on a 4xx and $_.Exception.Message is only ever "Bad Request" — the
# server's actual explanation is in the response BODY, which is thrown away unless it is read off
# the stream. This script once reported a bare 400 for what was a mangled request body; without the
# body there was nothing to go on.
function ErrorBody($err) {
  try {
    $resp = $err.Exception.Response
    if (-not $resp) { return $err.Exception.Message }
    $reader = New-Object IO.StreamReader($resp.GetResponseStream())
    $text = $reader.ReadToEnd()
    $reader.Close()
    if ([string]::IsNullOrWhiteSpace($text)) { return $err.Exception.Message }
    return "$($err.Exception.Message) :: $text"
  } catch {
    return $err.Exception.Message
  }
}

# [string] IS LOAD-BEARING. `Get-Content -Raw` does not return a bare String: it returns one
# WRAPPED IN A PSOBJECT carrying note properties (PSPath, PSParentPath, ReadCount, ...). ConvertTo-
# Json serialises the wrapper, so the body goes out as
#
#     {"query":{"value":"-- tcgscan...","PSPath":"...", ...}}
#
# instead of {"query":"-- tcgscan..."} — query is an OBJECT, the API rejects it, and the 400 comes
# back with an EMPTY body, so nothing on the wire says what is wrong.
#
# It is a genuinely nasty one to see: `$raw -ceq $unwrapped` reports True, because -ceq compares
# the underlying values and ignores the wrapper. Only the emitted JSON gives it away. Anything that
# returns a fresh String (a -replace, a .ToString(), a [string] cast) makes the symptom vanish,
# which is what makes it so easy to "fix" by coincidence and record the wrong reason.
function PostSql($url, $headers, $sql) {
  $json = @{ query = [string]$sql } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Method POST -Uri $url -Headers $headers -Body $json -ContentType 'application/json'
}

Write-Host ""
Write-Host "[1] Is production already serving share_key?" -ForegroundColor Cyan
try {
  $html = Invoke-RestMethod -Uri $Probe -Headers @{ 'User-Agent' = 'Discordbot/2.0' }
} catch {
  Fail '1' "could not read $Probe : $($_.Exception.Message)" 1
}
$m = [regex]::Match([string]$html, 'og:url" content="[^"]*\?v=([^"&]+)"')
if (-not $m.Success) {
  Fail '1' 'that share link carries no ?v= at all - the deploy carrying share_key is not live' 1
}
$v = $m.Groups[1].Value
if ($v -match '^[0-9]+$') {
  Fail '1' "production still emits an integer (?v=$v), so the old build is up. Deploy first." 1
}
Write-Host "    ok - production emits ?v=$v (a fingerprint)"

Write-Host ""
Write-Host "[2] Loading the management token (value not shown)" -ForegroundColor Cyan
if (-not (Test-Path $SecretsFile)) { Fail '2' "no secrets file at $SecretsFile" 2 }
$token = $null
foreach ($line in Get-Content $SecretsFile) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$') { $token = $Matches[1] }
}
if ([string]::IsNullOrWhiteSpace($token)) { Fail '2' 'SUPABASE_ACCESS_TOKEN not found' 2 }
$headers = @{ Authorization = "Bearer $token" }
$queryUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
Write-Host "    ok"

Write-Host ""
Write-Host "[3] Dropping binders.share_version" -ForegroundColor Cyan
$sqlFile = Join-Path $Repo 'supabase\migrations\20260826180000_drop_share_version.sql'
if (-not (Test-Path $sqlFile)) { Fail '3' "migration not found at $sqlFile" 3 }
$sql = Get-Content $sqlFile -Raw -Encoding UTF8
try {
  $null = PostSql $queryUrl $headers $sql
} catch {
  Fail '3' "the drop failed: $(ErrorBody $_)" 3
}
Write-Host "    applied"

Write-Host ""
Write-Host "[4] Verifying" -ForegroundColor Cyan
$check = @"
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='binders' and column_name='share_version')::int as counter_left,
  (select count(*) from public.binders where share_key is null)::int as keys_missing,
  (select count(*) from public.binders
    where share_key is distinct from public.binder_share_key(updated_at, share_page_ids))::int as drifted;
"@
try {
  $r = PostSql $queryUrl $headers $check
} catch {
  Fail '4' "could not verify: $(ErrorBody $_)" 4
}
$row = $r[0]
Write-Host "    share_version columns left : $($row.counter_left)"
Write-Host "    binders missing a key      : $($row.keys_missing)"
Write-Host "    keys drifted from their row: $($row.drifted)"
if ($row.counter_left -ne 0) { Fail '4' 'share_version is still present' 4 }
if ($row.keys_missing -ne 0 -or $row.drifted -ne 0) { Fail '4' 'share_key is not intact' 4 }

# Never leave the token in this shell's environment.
$token = $null

Write-Host ""
Write-Host "DONE. ?v= is a fingerprint, and the counter is gone." -ForegroundColor Green
