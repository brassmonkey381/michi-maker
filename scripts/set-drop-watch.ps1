# Registers (or runs) the set-drop watcher as a daily Task Scheduler job at 06:00, after the
# data server's 05:30 lane. Owner-run; prints progress; never echoes secrets (the watcher reads
# .env itself).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "...\scripts\set-drop-watch.ps1"            register the task
#   powershell -NoProfile -ExecutionPolicy Bypass -File "...\scripts\set-drop-watch.ps1" -Now      run the watcher once, now
param([switch]$Now)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'FAILED: node is not on PATH'; exit 1 }
$log = Join-Path $repo 'state\set-drop.log'

if ($Now) {
  Write-Host "Step 1/1: running the watcher"
  & $node (Join-Path $repo 'scripts\set-drop-watch.mjs')
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: watcher exit $LASTEXITCODE"; exit $LASTEXITCODE }
  exit 0
}

Write-Host "Step 1/2: composing the task (daily 06:00, logs to state\set-drop.log)"
$cmd = "/c cd /d `"$repo`" && `"$node`" scripts\set-drop-watch.mjs >> `"$log`" 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd
$trigger = New-ScheduledTaskTrigger -Daily -At 06:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

Write-Host "Step 2/2: registering 'michi set-drop watch'"
Register-ScheduledTask -TaskName 'michi set-drop watch' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Done. Read state\set-drop.log each morning; a NEW SET or IMAGES LANDED line is the go."
