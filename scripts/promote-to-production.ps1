# Promote what is on development to production: push main, then deploy the
# Vercel production build (the same thing `npm run deploy` runs).
#
# Run it from any Windows terminal:
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\promote-to-production.ps1"
#
#   -Redeploy   deploy even when origin/main is already at this commit
#               (for an env-var or Vercel-side change with no new code).
#
# The counterpart to scripts/auto-push-development.ps1: that one keeps
# development (preview.michi-maker.com) level with local main after every piece
# of work; this one is the deliberate step that puts the same commits in front
# of real users. Nothing here is automatic, and nothing here is silent.

param([switch]$Redeploy)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Fail([string]$message, [int]$code) {
  Write-Host ''
  Write-Host "FAILED: $message (exit $code)"
  exit $code
}

Write-Host '=== Step 1/6: branch and working tree ==='
$branch = (git rev-parse --abbrev-ref HEAD)
if ($LASTEXITCODE -ne 0) { Fail 'not a git repository' 1 }
$branch = $branch.Trim()
Write-Host "Branch: $branch"
if ($branch -ne 'main') {
  Fail "production ships from main, but '$branch' is checked out" 1
}
$dirty = git status --porcelain
if ($dirty) {
  Write-Host $dirty
  Fail 'uncommitted changes - commit or stash them before deploying' 1
}
Write-Host 'Working tree clean.'

Write-Host ''
Write-Host '=== Step 2/6: what would ship ==='
git fetch origin --quiet
if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed' $LASTEXITCODE }
$head = (git rev-parse HEAD).Trim()
$prod = (git rev-parse --verify --quiet origin/main)
if ($prod) { $prod = $prod.Trim() }

# Refuse to ship a HEAD that is missing commits already on origin/main - that
# would take production BACKWARDS, and a force push is never the right recovery
# from a stale local checkout.
$behind = (git rev-list --count "HEAD..origin/main").Trim()
if ($behind -ne '0') {
  Fail "local main is $behind commit(s) behind origin/main - pull first" 1
}

if ($head -eq $prod) {
  Write-Host 'origin/main is already at this commit; nothing new to ship.'
  if (-not $Redeploy) {
    Write-Host 'Nothing to do. Re-run with -Redeploy to deploy the same commit again.'
    exit 0
  }
  Write-Host '-Redeploy given: deploying the same commit again.'
} else {
  Write-Host 'Commits going to production:'
  git log --oneline "origin/main..HEAD"
}

Write-Host ''
Write-Host '=== Step 3/6: type-check ==='
# Vercel builds with `expo export`, which does not type-check. This is the only
# gate between a type error and the live site.
& npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Fail 'npx tsc --noEmit reported errors' $LASTEXITCODE }
Write-Host 'Type-check clean.'

Write-Host ''
Write-Host '=== Step 4/6: push main ==='
& git push origin 'HEAD:main'
if ($LASTEXITCODE -ne 0) { Fail 'git push to main failed' $LASTEXITCODE }
Write-Host 'origin/main updated.'

Write-Host ''
Write-Host '=== Step 5/6: keep development level ==='
# Normally a no-op (the Stop hook has already pushed), but it matters when the
# hook was skipped or blocked: preview and production should not drift apart.
& git push origin 'HEAD:development'
if ($LASTEXITCODE -ne 0) {
  Write-Host "WARNING: could not fast-forward development (exit $LASTEXITCODE). Production is unaffected; reconcile that branch by hand."
} else {
  Write-Host 'origin/development updated.'
}

Write-Host ''
Write-Host '=== Step 6/6: vercel --prod ==='
# --yes because this runs with no TTY: a CLI prompt ("set up and deploy?") has no one to answer it,
# and an unanswered prompt is how a scripted deploy ends up attempting the wrong scope.
#
# GIT PUSHES DO NOT DEPLOY PRODUCTION for this project - the Vercel Git integration builds PREVIEWS
# only (verified 2026-08-28: the push above produced a Preview, and the newest Production
# deployment was hours older). This step is the only thing that moves michi-maker.com.
& npx vercel --prod --yes
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'If that said "Not authorized": the CLI token is readable but cannot deploy.'
  Write-Host '  npx vercel login          # re-auth, then re-run this script'
  Write-Host '  npx vercel link --yes     # if it still refuses: re-link the project, then re-run'
  Write-Host 'Nothing is half-done - main and development are already pushed; only the deploy is'
  Write-Host 'left, and re-running this script after fixing auth picks up exactly where it stopped.'
  Fail 'vercel --prod failed' $LASTEXITCODE
}

Write-Host ''
Write-Host "DONE: https://michi-maker.com is deploying $($head.Substring(0,7))."
