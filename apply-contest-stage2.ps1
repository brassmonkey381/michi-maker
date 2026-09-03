# apply-contest-stage2.ps1 - the binder contest's second stage: schema now, snapshot on the day.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -Snapshot
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -Snapshot -Force
#
# RUN IT TWICE, WEEKS APART.
#
#   1. Now, with no switches. Applies supabase/migrations/20260903120000_contest_stage_two.sql:
#      the finalists table, the separate finals ballot, the edit-lock triggers and the finals
#      leaderboard RPC. Nothing visible changes - with no finalist rows the triggers never fire
#      and the app stays in round 1. Safe to re-run, and safe before or after a deploy.
#
#   2. At the round-1 cutoff, with -Snapshot. Ranks the entries by their round-1 likes, freezes
#      the top of each category into contest_finalists, and prints the field it froze. The edit
#      lock takes hold the instant those rows land.
#
# ORDER MATTERS between them, and against the deploy: ship the app first (it needs the new tables
# to render the Final), then snapshot at the cutoff. Snapshotting before the app is deployed would
# lock binders whose owners are looking at a UI with no explanation on it.
#
# -Snapshot REFUSES to run over an existing field. Re-cutting is a deliberate act: add -Force,
# which clears the previous finalists AND every stage-2 vote cast for them.
#
# The window instants and the field size are read from src/data/contest.ts, so the database cannot
# disagree with the countdown the app is showing.
#
# No secrets are printed. The management token is read from the workspace secrets file into memory
# and cleared from this shell afterwards.

param(
  [switch]$Snapshot,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SecretsFile = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'

function Fail($step, $msg, $code) {
  Write-Host ""
  Write-Host "FAILED at [$step]: $msg (exit $code)" -ForegroundColor Red
  exit $code
}

Write-Host ""
if ($Snapshot) {
  Write-Host "Binder contest - FREEZING THE FIELD (round 1 is over)" -ForegroundColor Cyan
} else {
  Write-Host "Binder contest - applying the stage-two schema" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "[1] Loading the management token (value not shown)" -ForegroundColor Cyan
if (-not (Test-Path $SecretsFile)) { Fail '1' "no secrets file at $SecretsFile" 1 }
$token = $null
foreach ($line in Get-Content $SecretsFile) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$') { $token = $Matches[1] }
}
if ([string]::IsNullOrWhiteSpace($token)) { Fail '1' 'SUPABASE_ACCESS_TOKEN not found in the secrets file' 1 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host "    ok"

Write-Host ""
Write-Host "[2] Running" -ForegroundColor Cyan
Set-Location $Repo
$argsList = @((Join-Path $Repo 'scripts\apply-contest-stage2.mjs'))
if ($Snapshot) { $argsList += '--snapshot' }
if ($Force) { $argsList += '--force' }
& node $argsList
$code = $LASTEXITCODE

# Never leave the token in this shell's environment.
$env:SUPABASE_ACCESS_TOKEN = $null

if ($code -eq 3) { Fail '2' 'a field is already frozen; re-cut with -Snapshot -Force if that is wrong' $code }
if ($code -ne 0) { Fail '2' 'the migration or the snapshot failed (see above)' $code }

Write-Host ""
Write-Host "DONE." -ForegroundColor Green
if (-not $Snapshot) {
  Write-Host "Round 1 is unaffected. Re-run with -Snapshot at the cutoff to freeze the field." -ForegroundColor DarkGray
} else {
  Write-Host "Every binder listed above is now locked against edits until you unlock it." -ForegroundColor DarkGray
}
