# deploy-web.ps1 - ship the web app to production, then re-warm every shared link preview.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -SkipWarm
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -WarmOnly
#
# WHY A SCRIPT, when it is only two commands. The two commands must run in this ORDER and the
# second must not run if the first failed - warming publishes the new preview URL into a CDN that
# is still serving the OLD renderer, and that wrong image then sticks for up to 24 hours
# (stale-while-revalidate). Ordering that matters is exactly the thing not to leave to a person
# pasting two lines.
#
# It also removes a trap that already bit once. `npm run deploy  # comment` looks harmless, but in
# cmd.exe `#` is not a comment: npm forwards `# comment` to the script as arguments, the Vercel CLI
# reads them as deploy paths, and it fails with "Can't deploy more than one path" - an error that
# says nothing about the real cause. A script takes no trailing prose.
#
# WHAT WARMING IS FOR. Composing a binder's preview image fetches up to eighteen full-size card
# JPEGs and rasterises a 2880x1512 frame - seconds of work. No link scraper waits that long; it
# shows no image at all. So the render is paid for here, up front, into the CDN. The app warms a
# binder by itself whenever its share sheet opens, so this bulk pass is only needed after a deploy
# that changed OG_IMAGE_REV in api/_lib.js - that changes the image URL for EVERY binder at once
# and leaves all of them cold.
#
# No secrets are read or printed here. `npm run warm:og` loads the PUBLISHABLE (anon) Supabase key
# from .env itself, purely to list which binders are public.

param(
  [switch]$SkipWarm,
  [switch]$WarmOnly
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Fail($step, $msg, $code) {
  Write-Host ""
  Write-Host "FAILED at [$step]: $msg (exit $code)" -ForegroundColor Red
  exit $code
}

Set-Location $Repo
Write-Host ""
Write-Host "michi-maker web deploy - $Repo" -ForegroundColor Cyan

if (-not $WarmOnly) {
  # [0] THE CHECK THAT WOULD HAVE PREVENTED 2026-09-17, when michi-maker.com went white for
  # everyone. The shared kit had been re-pinned by editing the lockfile's sha; the entry kept the
  # PREVIOUS version + integrity, npm called it satisfied and installed the old package, and
  # catalogConfig then called a function that did not exist - at import time, on every route.
  # tsc and npm test both passed, because neither looks at what a BUILD installs. This does.
  Write-Host ""
  Write-Host "[0] Checking the shared browse kit is really installed (scripts/check-kit-integrity.mjs)" -ForegroundColor Cyan
  & node scripts/check-kit-integrity.mjs
  if ($LASTEXITCODE -ne 0) {
    Fail '0' 'the installed tcgscan-browse does not match the lockfile, or is missing an export the app calls. Fix with: npm install "github:brassmonkey381/tcgscan-browse#<sha>" - nothing was deployed' $LASTEXITCODE
  }

  Write-Host ""
  Write-Host "[1] Deploying to production (npx vercel --prod)" -ForegroundColor Cyan
  Write-Host "    A build takes a few minutes. Vercel may ask you to log in the first time."
  # Called directly, with no trailing arguments of any kind - see the note above.
  & npx vercel --prod
  if ($LASTEXITCODE -ne 0) { Fail '1' 'vercel --prod did not succeed; nothing was warmed' $LASTEXITCODE }
  Write-Host "    deploy ok" -ForegroundColor Green

  # [1b] And the same question of what actually SHIPPED. The deploy above builds on Vercel, from
  # the lockfile - so this reads the live bundle and fails loudly if the kit is missing from it,
  # while a rollback is still one click away.
  Write-Host ""
  Write-Host "[1b] Verifying the LIVE bundle carries the kit" -ForegroundColor Cyan
  & node scripts/check-kit-integrity.mjs --bundle https://michi-maker.com
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ROLL BACK NOW: Vercel -> Deployments -> the previous one -> Promote to Production" -ForegroundColor Red
    Write-Host "   (or: npx vercel rollback). The live bundle is missing kit code the app calls at boot." -ForegroundColor Red
    Fail '1b' 'the deployed bundle does not carry the expected tcgscan-browse exports' 1
  }
} else {
  Write-Host ""
  Write-Host "[1] Skipped (-WarmOnly)" -ForegroundColor DarkGray
}

if ($SkipWarm) {
  Write-Host ""
  Write-Host "[2] Skipped (-SkipWarm). Previews render on demand and the first scrape may miss." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "DONE." -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "[2] Warming every public binder's preview image (npm run warm:og)" -ForegroundColor Cyan
Write-Host "    Each cold render is several seconds; three run at a time."
& npm run warm:og
if ($LASTEXITCODE -ne 0) {
  # A partial warm is not a failed deploy - the site is live either way, and an unwarmed binder
  # simply renders on demand. Worth seeing, not worth pretending it undid the deploy.
  Write-Host ""
  Write-Host "WARNING: one or more binders did not warm (see the FAIL lines above)." -ForegroundColor Yellow
  Write-Host "The deploy is live. Re-run with -WarmOnly to retry just the warming." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "DONE. Deployed and every preview is warm." -ForegroundColor Green
Write-Host "Test with a binder you have not posted before - Discord caches embeds per URL." -ForegroundColor DarkGray
