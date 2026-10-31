# Runs the phone crawler (qa/crawl) against a dev server on :8090, starting one if none is up
# and stopping it after. Not scheduled anywhere, by the owner's decision (2026-10-30).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\crawl-phone.ps1"
#   ... -Persona free -Budget 150 -Scenario seeded -FileItems
#
param(
  [string]$Persona = 'guest',
  [int]$Budget = 300,
  [string]$Scenario = '',
  [string]$Routes = '',
  [switch]$FileItems
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
$started = $null
try {
  Write-Host "[1/3] Dev server on :8090"
  $up = (netstat -ano | Select-String ':8090 ' | Select-String 'LISTENING')
  if (-not $up) {
    Write-Host "      starting (CI=1 npx expo start --web --port 8090 --clear)"
    $env:CI = '1'
    $started = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npx expo start --web --port 8090 --clear' -PassThru -WindowStyle Hidden
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 3
      try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8090/' -TimeoutSec 5; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}
    }
    if (-not $ok) { Write-Host "FAILED: the dev server did not answer within 3 minutes"; exit 2 }
  } else { Write-Host "      already up" }

  Write-Host "[2/3] Crawling ($Persona, budget $Budget$(if ($Scenario) { ", scenario $Scenario" }))"
  $crawlArgs = @('qa/crawl/crawl.mjs', '--persona', $Persona, '--budget', "$Budget")
  if ($Scenario) { $crawlArgs += @('--scenario', $Scenario) }
  if ($Routes) { $crawlArgs += @('--routes', $Routes) }
  if ($FileItems) { $crawlArgs += '--file-items' }
  & node @crawlArgs
  $code = $LASTEXITCODE
  if ($code -eq 4) { Write-Host "FAILED: the network airlock tripped; the run is void (exit 4)"; exit 4 }
  if ($code -ne 0) { Write-Host "FAILED: crawl exited $code"; exit $code }

  Write-Host "[3/3] Report"
  $latest = Get-ChildItem (Join-Path $repo 'qa\crawl\out') -Directory | Sort-Object Name | Select-Object -Last 1
  Write-Host "      $($latest.FullName)\report.md"
  Write-Host "DONE"
} finally {
  if ($started) { try { Stop-Process -Id $started.Id -Force -ErrorAction Stop } catch {}; Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-30) -and (netstat -ano | Select-String ':8090 ' | Select-String "\s$($_.Id)$") } | ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} } }
  Pop-Location
}
