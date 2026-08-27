# fix-auth-urls.ps1 - point Supabase auth at the live site instead of localhost.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"           # show, then apply
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -DryRun   # show only
#
# WHAT IS WRONG. The michi-maker project's auth config still carries its local defaults:
#
#   SITE_URL   = http://localhost:3000
#   allow list = ... https://michi-maker.com/auth-callback ...   (apex only)
#
# SITE URL IS NOT COSMETIC. It is the FALLBACK Supabase uses whenever the redirect an app asks for
# is not on the allow-list, and the rejection is silent - no error, the user is simply sent to Site
# URL. Signing in from www.michi-maker.com asked for https://www.michi-maker.com/auth-callback,
# which was not listed, so people landed on http://localhost:3000/?code=... with a valid code and
# nothing to receive it. Site URL is also what email confirmation and recovery links are built
# from, so every one of those sent from production has been pointing at localhost too.
#
# WHAT THIS CHANGES. Two fields, and it only ever ADDS to the allow-list - existing entries
# (including the other products' schemes) are read back and preserved, never replaced:
#
#   1. site_url      -> https://michi-maker.com
#   2. uri_allow_list += https://www.michi-maker.com/auth-callback
#                        https://preview.michi-maker.com/auth-callback
#
# preview.michi-maker.com needs its own entry because it is a real serving origin (see the
# X-Robots-Tag rule in vercel.json). www is belt-and-braces: vercel.json now redirects it to the
# apex host, so the app should never ask for it - but if that redirect is ever removed, this stops
# the same bug coming back.
#
# The token is read from the workspace secrets file into memory and is never printed.

param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProjectRef = 'piikwvntldytjejxmcla'
$SecretsFile = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'
$SiteUrl = 'https://michi-maker.com'
$Additions = @(
  'https://www.michi-maker.com/auth-callback',
  'https://preview.michi-maker.com/auth-callback'
)

function Fail($step, $msg, $code) {
  Write-Host ""
  Write-Host "FAILED at [$step]: $msg (exit $code)" -ForegroundColor Red
  exit $code
}

Write-Host ""
Write-Host "[1] Loading the management token (value not shown)" -ForegroundColor Cyan
if (-not (Test-Path $SecretsFile)) { Fail '1' "no secrets file at $SecretsFile" 1 }
$token = $null
foreach ($line in Get-Content $SecretsFile) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$') { $token = $Matches[1] }
}
if ([string]::IsNullOrWhiteSpace($token)) { Fail '1' 'SUPABASE_ACCESS_TOKEN not found in the secrets file' 1 }
Write-Host "    ok"

$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
$configUrl = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"

Write-Host ""
Write-Host "[2] Reading the current configuration" -ForegroundColor Cyan
try {
  $before = Invoke-RestMethod -Method GET -Uri $configUrl -Headers $headers
} catch {
  Fail '2' "could not read auth config: $($_.Exception.Message)" 2
}
$existing = @()
if ($before.uri_allow_list) {
  $existing = $before.uri_allow_list.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
Write-Host "    site_url   : $($before.site_url)"
Write-Host "    allow list :"
foreach ($u in $existing) { Write-Host "        $u" }

# Union, preserving what is already there. Nothing is ever removed by this script.
$final = New-Object System.Collections.Generic.List[string]
foreach ($u in $existing) { if (-not $final.Contains($u)) { $final.Add($u) } }
$added = @()
foreach ($u in $Additions) { if (-not $final.Contains($u)) { $final.Add($u); $added += $u } }

Write-Host ""
Write-Host "[3] Proposed change" -ForegroundColor Cyan
Write-Host "    site_url   : $($before.site_url)  ->  $SiteUrl"
if ($added.Count -eq 0) {
  Write-Host "    allow list : already contains every entry needed; no additions"
} else {
  Write-Host "    allow list : adding"
  foreach ($u in $added) { Write-Host "        + $u" }
}

if ($DryRun) {
  Write-Host ""
  Write-Host "DRY RUN - nothing was changed." -ForegroundColor Yellow
  exit 0
}

if ($before.site_url -eq $SiteUrl -and $added.Count -eq 0) {
  Write-Host ""
  Write-Host "Nothing to do; already correct." -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "[4] Applying" -ForegroundColor Cyan
$body = @{ site_url = $SiteUrl; uri_allow_list = ($final -join ',') } | ConvertTo-Json -Compress
try {
  $null = Invoke-RestMethod -Method PATCH -Uri $configUrl -Headers $headers -Body $body
} catch {
  Fail '4' "could not update auth config: $($_.Exception.Message)" 4
}
Write-Host "    applied"

Write-Host ""
Write-Host "[5] Reading it back" -ForegroundColor Cyan
try {
  $after = Invoke-RestMethod -Method GET -Uri $configUrl -Headers $headers
} catch {
  Fail '5' "could not re-read auth config: $($_.Exception.Message)" 5
}
Write-Host "    site_url   : $($after.site_url)"
Write-Host "    allow list :"
foreach ($u in $after.uri_allow_list.Split(',')) { Write-Host "        $($u.Trim())" }

if ($after.site_url -ne $SiteUrl) { Fail '5' "site_url did not stick (still $($after.site_url))" 5 }
Write-Host ""
Write-Host "DONE. Auth takes effect immediately - no deploy needed for this part." -ForegroundColor Green
Write-Host "The www -> apex redirect is a separate code change and DOES need a deploy." -ForegroundColor DarkGray
