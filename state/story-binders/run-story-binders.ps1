# Builds the two 30th-anniversary story binders in your michi account.
# Pass through any flags: --dry-run, --rebuild, --public
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location (Split-Path -Parent (Split-Path -Parent $here))
try {
  node "$here\build-story-binders.mjs" @args
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: build-story-binders.mjs exited $LASTEXITCODE" -ForegroundColor Red; exit $LASTEXITCODE }
} finally { Pop-Location }
