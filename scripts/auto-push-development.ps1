# Push finished work to origin/development (the preview branch behind
# preview.michi-maker.com). Wired to Claude Code's Stop hook in
# .claude/settings.local.json, so it runs when a turn of work ends.
#
# It never creates a commit. A dirty tree means the work isn't finished being
# described yet, so it says so and pushes nothing -- every commit that reaches
# development has a real message written by hand.
#
# Order matters: the cheap identity check comes first, so the overwhelmingly
# common case (nothing new to push) costs two rev-parses and no type-check.
#
#   -Hook   emit a single JSON line for Claude Code instead of human progress.
#
# Run it by hand any time with no switches to see the same decisions narrated:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<repo>\scripts\auto-push-development.ps1"

param([switch]$Hook)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Say([string]$m) { if (-not $Hook) { Write-Host $m } }

# The hook's only channel to the user is a JSON systemMessage; anything else is
# transcript noise. Silence is deliberate for the uninteresting outcomes.
function Finish([string]$message) {
  if ($Hook) {
    if ($message) { Write-Output (@{ systemMessage = $message } | ConvertTo-Json -Compress) }
  } elseif ($message) {
    Write-Host $message
  }
  exit 0
}

# 1. Only main feeds development. A feature branch is checked out on purpose.
$branch = (git rev-parse --abbrev-ref HEAD)
if ($LASTEXITCODE -ne 0) { Say 'Not a git repository.'; exit 0 }
$branch = $branch.Trim()
if ($branch -ne 'main') {
  Say "On '$branch', not main - nothing pushed."
  Finish $null
}

# 2. Is there anything to push at all? Compared against the local
#    remote-tracking ref, with no fetch: our own pushes keep it current, and a
#    stale one only costs a non-fast-forward that step 5 reports out loud.
$head = (git rev-parse HEAD).Trim()
$dev = (git rev-parse --verify --quiet origin/development)
if ($dev) { $dev = $dev.Trim() }
if ($head -eq $dev) {
  Say 'development already matches HEAD - nothing to push.'
  Finish $null
}

# 3. A dirty tree is work that has not been described yet. Say so; push nothing.
$dirty = git status --porcelain
if ($dirty) {
  $files = (($dirty | ForEach-Object { $_.Substring(3) }) -join ', ')
  Say "Uncommitted changes - pushing nothing: $files"
  Finish "development not updated: uncommitted changes ($files). They need a commit first."
}

$ahead = '?'
if ($dev) { $ahead = (git rev-list --count "$dev..HEAD").Trim() }

# 4. The gate. development is what preview.michi-maker.com builds from, so it
#    never receives a tree that does not type-check.
Say "Type-checking $ahead commit(s) before pushing..."
$tscOut = & npx tsc --noEmit
$tscCode = $LASTEXITCODE
if ($tscCode -ne 0) {
  $first = ($tscOut | Where-Object { $_ -match 'error TS' } | Select-Object -First 1)
  if (-not $first) { $first = "tsc exited $tscCode" }
  Say ''
  Say "FAILED: tsc --noEmit exited with code $tscCode"
  Say $first
  Finish "development not updated: tsc --noEmit failed. $first"
}

# 5. Push.
Say 'Type-check clean. Pushing to origin/development...'
& git push origin 'HEAD:development' | Out-Null
$pushCode = $LASTEXITCODE
if ($pushCode -ne 0) {
  Say ''
  Say "FAILED: git push exited with code $pushCode"
  Finish "Push to development failed (exit $pushCode). If it is a non-fast-forward, origin/development moved - fetch and reconcile."
}

$short = $head.Substring(0, 7)
$plural = 'commits'
if ($ahead -eq '1') { $plural = 'commit' }
Say "Pushed $ahead $plural to development ($short)."
Finish "Pushed $ahead $plural to development ($short)."
