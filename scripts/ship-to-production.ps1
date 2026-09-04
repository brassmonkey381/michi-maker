# SHIP WHATEVER IS CHECKED OUT: fast-forward main to it, then promote main to production.
#
# The everyday case this is for: work has been landing on a feature branch (development builds
# from it, preview has been checked), and now it should be michi-maker.com. This does the two
# steps in order and stops loudly between them if anything is off:
#
#   1. main catches up to HEAD by fast-forward only. If main has commits this branch does not,
#      that is a real merge and a real decision, so this refuses rather than guessing.
#   2. scripts/promote-to-production.ps1 runs from main — pushes main and development, then
#      `vercel --prod`. Its own gates (clean tree, type-check, auth) still apply.
#
#   -NoDeploy   do step 1 only: main catches up and is pushed, nothing is deployed.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\ship-to-production.ps1"
param([switch]$NoDeploy)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Fail([string]$m, [int]$code = 1) { Write-Host "FAILED: $m (exit $code)"; exit $code }

Write-Host '=== Step 1/3: where we are ==='
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) { Fail 'not a git repository' }
$dirty = git status --porcelain
if ($dirty) { Fail "uncommitted changes - commit or stash them first:`n$($dirty -join "`n")" }
$head = (git rev-parse --short HEAD).Trim()
Write-Host "On '$branch' at $head, tree clean."

Write-Host '=== Step 2/3: main catches up (fast-forward only) ==='
git fetch -q origin main
if ($LASTEXITCODE -ne 0) { Fail 'git fetch origin main' }
if ($branch -ne 'main') {
  git merge-base --is-ancestor main HEAD
  if ($LASTEXITCODE -ne 0) {
    Fail "main has commits that '$branch' does not, so this is not a fast-forward. Merge main into '$branch' (or the other way) by hand, then run this again."
  }
  git checkout -q main
  if ($LASTEXITCODE -ne 0) { Fail 'git checkout main' }
  git merge --ff-only $branch | Out-Null
  if ($LASTEXITCODE -ne 0) { git checkout -q $branch; Fail "fast-forward of main to '$branch'" }
  Write-Host "main is now $((git rev-parse --short HEAD).Trim()) (was behind '$branch'; checked out main)."
} else {
  Write-Host 'Already on main.'
}

if ($NoDeploy) {
  Write-Host '=== Step 3/3: push main (no deploy) ==='
  git push origin main
  if ($LASTEXITCODE -ne 0) { Fail 'git push origin main' $LASTEXITCODE }
  Write-Host 'Done. main pushed; production untouched.'
  exit 0
}

Write-Host '=== Step 3/3: promote main to production ==='
# -Redeploy: origin/main may already be at this commit (the branch pushes went to development,
# and main is pushed by the promote script itself), and the deploy must run either way.
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'promote-to-production.ps1') -Redeploy
if ($LASTEXITCODE -ne 0) { Fail 'promote-to-production.ps1' $LASTEXITCODE }
Write-Host 'Shipped.'
