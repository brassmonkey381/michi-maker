# export-instagram.ps1 - a public binder as Instagram posts: 1080x1350 stills, and a Reel.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\export-instagram.ps1" -Binder <id>
#   ... -Pages 8          up to ten stills (a carousel holds ten); default 6
#   ... -Video            also record the page turns as a desktop-shaped Reel
#   ... -Seconds 13       how long the Reel runs first page to last, whatever the page count
#   ... -Base https://preview.michi-maker.com     export from preview instead of production
#
# Files land in michi-maker\state\instagram\<first 8 of the id>\. Nothing is signed in or written.
param(
  [Parameter(Mandatory = $true)][string]$Binder,
  [int]$Pages = 6,
  [switch]$Video,
  [int]$Seconds = 13,
  [string]$Base = 'https://michi-maker.com',
  [string]$Out
)
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$argv = @('scripts/export-instagram.mjs', '--binder', $Binder, '--pages', "$Pages", '--seconds', "$Seconds", '--base', $Base)
if ($Video) { $argv += '--video' }
if ($Out) { $argv += @('--out', $Out) }
& node @argv
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: export exited with code $LASTEXITCODE (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
