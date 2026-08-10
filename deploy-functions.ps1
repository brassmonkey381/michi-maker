# deploy-functions.ps1 - set the new API-key secrets and deploy the edge functions.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"            # secrets + deploy
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -DeployOnly
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -SecretsOnly
#
# WHY A SCRIPT. The inline version of this is a trap: `set VAR=value` is cmd.exe syntax and silently
# does nothing in PowerShell (there, `set` is an alias for Set-Variable), so the CLI reads an empty
# token and reports "Invalid access token format" - which looks like a bad token rather than a shell
# mistake. This sets things the one way that works in both shells and validates before acting.
#
# CREDENTIALS are read SILENTLY from environment variables, else from gitignored files beside this
# script (*.key is already ignored in this repo). Values are NEVER printed.
#
#   SUPABASE_ACCESS_TOKEN  or  supabase-access-token.key   personal token, starts sbp_
#   APP_SECRET_KEY         or  app-secret.key              new secret key,      starts sb_secret_
#   APP_PUBLISHABLE_KEY    or  app-publishable.key         new publishable key, starts sb_publishable_
#
# ORDERING. Deploying is safe BEFORE the secrets exist: _shared/keys.ts falls back to the legacy
# injected values, so a deploy with no APP_* set changes nothing. Only revoking the legacy JWT key
# is irreversible, and this script deliberately does not do that.

param(
  [switch]$DeployOnly,
  [switch]$SecretsOnly
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRef = 'piikwvntldytjejxmcla'
# Plain deploys only. Per docs/GO-LIVE-BILLING.md the per-function verify_jwt settings must stay
# payments-webhook=false and the rest=true; a plain `functions deploy` preserves them, and passing
# --no-verify-jwt to checkout or auth-handoff would open them up.
$Functions = @('auth-handoff', 'stripe-checkout', 'delete-account', 'payments-webhook')

function Fail($step, $msg) {
  Write-Host ''
  Write-Host "FAILED at $step : $msg" -ForegroundColor Red
  exit 1
}
function Step($n, $what) { Write-Host ''; Write-Host "STEP $n : $what" -ForegroundColor Cyan }
function Invoke-Native($file, $argList) {
  $ErrorActionPreference = 'Continue'
  & $file @argList | Out-Host        # Out-Host: a function returns everything it writes, which
  $code = $LASTEXITCODE              # would otherwise make this return a string array, not an int
  $script:ErrorActionPreference = 'Stop'
  return $code
}
function Read-Secret($envName, $fileName, $prefix, $label) {
  $v = [Environment]::GetEnvironmentVariable($envName)
  $src = "`$env:$envName"
  if ([string]::IsNullOrWhiteSpace($v)) {
    $p = Join-Path $Repo $fileName
    if (Test-Path $p) {
      $v = ((Get-Content $p) | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1).Trim()
      $src = $fileName
    }
  }
  if ([string]::IsNullOrWhiteSpace($v)) {
    Write-Host "  missing $label." -ForegroundColor Yellow
    Write-Host "    set `$env:$envName = '<value>'   (PowerShell)" -ForegroundColor Yellow
    Write-Host "    or save it to $(Join-Path $Repo $fileName)" -ForegroundColor Yellow
    return $null
  }
  # Validate the SHAPE, never the value. This is the check that would have caught the shell mistake.
  if ($prefix -and -not $v.StartsWith($prefix)) {
    Write-Host "  $label from $src does not start with '$prefix' (length $($v.Length))." -ForegroundColor Red
    Write-Host "    A placeholder like sbp_[...] pasted literally looks exactly like this." -ForegroundColor Red
    return $null
  }
  Write-Host "  $label ok, from $src  (value not shown)"
  return $v
}

Set-Location $Repo
if (-not (Test-Path (Join-Path $Repo 'supabase\functions'))) {
  Fail 'STEP 0' "no supabase\functions here - run this from the michi-maker repo"
}

Step '1/4' 'credentials'
$token = Read-Secret 'SUPABASE_ACCESS_TOKEN' 'supabase-access-token.key' 'sbp_' 'access token'
if (-not $token) { Fail 'STEP 1/4' 'no valid access token' }
$env:SUPABASE_ACCESS_TOKEN = $token

$secret = $null; $publishable = $null
if (-not $DeployOnly) {
  $secret = Read-Secret 'APP_SECRET_KEY' 'app-secret.key' 'sb_secret_' 'secret key'
  $publishable = Read-Secret 'APP_PUBLISHABLE_KEY' 'app-publishable.key' 'sb_publishable_' 'publishable key'
  if (-not $secret -or -not $publishable) {
    Write-Host ''
    Write-Host '  No new keys yet? Deploying alone is safe and changes nothing -' -ForegroundColor Yellow
    Write-Host '  the functions fall back to the legacy values. Re-run with -DeployOnly.' -ForegroundColor Yellow
    Fail 'STEP 1/4' 'missing one or both new API keys'
  }
}

Step '2/4' "linking project $ProjectRef"
$code = Invoke-Native 'supabase' @('link', '--project-ref', $ProjectRef)
if ($code -ne 0) { Fail 'STEP 2/4' "supabase link exited $code" }

if (-not $DeployOnly) {
  Step '3/4' 'setting function secrets'
  foreach ($pair in @(@('APP_SECRET_KEY', $secret), @('APP_PUBLISHABLE_KEY', $publishable))) {
    # "NAME=value" as ONE argument: PowerShell would otherwise split on the '=' in some quoting
    # forms, and the CLI would receive a truncated value.
    $code = Invoke-Native 'supabase' @('secrets', 'set', ("{0}={1}" -f $pair[0], $pair[1]))
    if ($code -ne 0) { Fail 'STEP 3/4' "secrets set failed for $($pair[0]) (exit $code)" }
    Write-Host "  set $($pair[0])"
  }
  Write-Host '  current secrets (names only):'
  Invoke-Native 'supabase' @('secrets', 'list') | Out-Null
} else {
  Step '3/4' 'skipping secrets (-DeployOnly)'
}

if ($SecretsOnly) {
  Step '4/4' 'skipping deploy (-SecretsOnly)'
  Write-Host '  DONE.' -ForegroundColor Green
  exit 0
}

Step '4/4' 'deploying functions (plain deploys - verify_jwt defaults preserved)'
foreach ($fn in $Functions) {
  $code = Invoke-Native 'supabase' @('functions', 'deploy', $fn)
  if ($code -ne 0) { Fail 'STEP 4/4' "deploy failed for $fn (exit $code)" }
  Write-Host "  deployed $fn" -ForegroundColor Green
}

Write-Host ''
Write-Host 'DONE.' -ForegroundColor Green
Write-Host '  Before revoking the legacy JWT key, verify all four paths:' -ForegroundColor Yellow
Write-Host '    1. sign in (any app)          3. cross-app handoff'
Write-Host '    2. start a checkout           4. one Stripe webhook delivery'
Write-Host '  Also confirm verify_jwt is unchanged: payments-webhook=false, the other three=true.'
Write-Host '  Revoking is the only irreversible step, and it is what finally kills the leaked key.'
