# apply-contest-lock-fix.ps1 - REPAIR: binder edits, duplicates and deletes were being refused.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"
#
# WHAT WENT WRONG. The contest edit-lock trigger (contest_lock_guard, added by the stage-two
# migration) read `coalesce(new.x, old.x)`. In PL/pgSQL only one of those records exists per
# operation - OLD is unassigned on INSERT, NEW is unassigned on DELETE - and coalesce evaluates
# both arguments before it can choose. So the function raised on the unassigned record BEFORE it
# ever checked whether the binder was a contest finalist, and it did that for every binder in the
# database rather than for the sixty that will one day be locked.
#
# UPDATE was unaffected (both records are assigned there), which is why it looked like "editing is
# broken" instead of anything contest-shaped: renaming a binder worked, while placing a card,
# duplicating a binder and deleting one all failed. Deleting a binder failed through the cascade -
# the child deletes on binder_pages and binder_slots fire the same trigger.
#
# WHAT THIS DOES. Replaces the function with a version that picks its record once, up front, and
# never touches the other one. `create or replace` is enough: the three triggers reference it by
# name, so there is no moment where the lock is missing. It then proves the repair on a throwaway
# private binder - insert a page, insert a slot, update it, delete both, delete the binder - and
# removes the probe afterwards even if a check fails.
#
# Safe to re-run. Safe if the stage-two migration was never applied: it says so and exits 0.
#
# No secrets are printed. The management token is read from the workspace secrets file into memory
# and cleared from this shell afterwards.

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SecretsFile = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'

function Fail($step, $msg, $code) {
  Write-Host ""
  Write-Host "FAILED at [$step]: $msg (exit $code)" -ForegroundColor Red
  exit $code
}

Write-Host ""
Write-Host "Repairing the contest edit-lock trigger" -ForegroundColor Cyan

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
Write-Host "[2] Replacing the guard and proving it" -ForegroundColor Cyan
Set-Location $Repo
& node (Join-Path $Repo 'scripts\apply-contest-lock-fix.mjs')
$code = $LASTEXITCODE

# Never leave the token in this shell's environment.
$env:SUPABASE_ACCESS_TOKEN = $null

if ($code -ne 0) { Fail '2' 'the repair or one of its checks failed (see above)' $code }

Write-Host ""
Write-Host "DONE. Reload the app; edits, duplicates and deletes should work." -ForegroundColor Green
Write-Host "No finalists are frozen, so the lock has nothing to act on yet." -ForegroundColor DarkGray
