# Re-capture the welcome_v2 hero clip end to end.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\cap-welcome-hero.ps1"
#
# Builds the web export, films the hero binder framed on the binder itself, and installs the
# results into public/welcome_v2-assets. The mp4 step needs a real ffmpeg on PATH; without one the
# webm and the poster still install and the existing mp4 stays as the Safari fallback.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Fail($step, $code) {
  Write-Host ""
  Write-Host "FAILED: $step (exit code $code)" -ForegroundColor Red
  exit $code
}

Write-Host "[1/5] building the web export (this takes a couple of minutes)"
& npx expo export -p web
if ($LASTEXITCODE -ne 0) { Fail "expo export" $LASTEXITCODE }

Write-Host "[2/5] filming the hero binder"
& node state/cap-welcome-hero.mjs
if ($LASTEXITCODE -ne 0) { Fail "cap-welcome-hero.mjs" $LASTEXITCODE }

Write-Host "[3/5] installing hero.webm and hero.jpg"
Copy-Item state/out/hero.webm public/welcome_v2-assets/hero.webm -Force
Copy-Item state/out/hero.jpg  public/welcome_v2-assets/hero.jpg  -Force

Write-Host "[4/5] mp4 fallback"
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue)
if ($null -eq $ffmpeg) {
  Write-Host "      SKIPPED: no ffmpeg on PATH, so hero.mp4 is unchanged and Safari keeps the old clip."
  Write-Host "      Install one, then re-run this script:"
  Write-Host "        winget install --id Gyan.FFmpeg -e"
  Write-Host "      (Playwright ships an ffmpeg, but it is a VP8-only build with no h264 in it.)"
} else {
  & ffmpeg -y -i state/out/hero.webm -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -movflags +faststart -an state/out/hero.mp4
  if ($LASTEXITCODE -ne 0) { Fail "ffmpeg transcode" $LASTEXITCODE }
  Copy-Item state/out/hero.mp4 public/welcome_v2-assets/hero.mp4 -Force
  Write-Host "      hero.mp4 rebuilt and installed"
}

Write-Host "[5/5] done. Commit public/welcome_v2-assets and public/welcome_v2.html."
Write-Host ""
Write-Host "Frame used (also written to state/out/hero-frame.json):"
Get-Content state/out/hero-frame.json
