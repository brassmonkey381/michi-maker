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
# CREDENTIALS come from ONE workspace file, via tcgscan-secrets.ps1:
#
#   C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets
#     SUPABASE_ACCESS_TOKEN=sbp_...
#     APP_SECRET_KEY=sb_secret_...
#     APP_PUBLISHABLE_KEY=sb_publishable_...
#
# That folder is not a git repo, so the file cannot be committed from anywhere - a stronger
# guarantee than .gitignore, which already let a key through once. Values are NEVER printed;
# an environment variable of the same name still wins if one is set.
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
# THE verify_jwt SETTINGS NOW LIVE IN supabase/config.toml, AND THEY HAVE TO.
#
# This comment used to say "a plain `functions deploy` preserves them". IT DOES NOT. With no
# config.toml the CLI applies its own default of verify_jwt = true to every function it deploys,
# overwriting whatever the dashboard held. On 2026-09-22 02:07 UTC a routine run of this script
# turned JWT verification ON for payments-webhook, and Stripe — which sends a `stripe-signature`
# header and no Supabase JWT — was answered 401 by the edge gateway for five minutes. Nothing was
# lost only because no billing event happened to fire in that window.
#
# supabase/config.toml now pins verify_jwt = false for payments-webhook and the other four
# functions that must accept an unauthenticated caller, so a deploy reads the setting from the repo
# instead of erasing it. Do not pass --no-verify-jwt here: it would apply to every function in the
# list, including checkout and auth-handoff, which must keep verification on.
#
# If this ever drifts again, ../fix-webhook-jwt.ps1 repairs it and verifies from outside by POSTing
# to the endpoint: 400 "missing signature" means Stripe can reach the handler, 401 means it cannot.
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
. (Join-Path $PSScriptRoot 'tcgscan-secrets.ps1')
Set-Location $Repo
if (-not (Test-Path (Join-Path $Repo 'supabase\functions'))) {
  Fail 'STEP 0' "no supabase\functions here - run this from the michi-maker repo"
}

Step '1/4' 'credentials'
$token = Get-TcgSecret -Name SUPABASE_ACCESS_TOKEN -Prefix 'sbp_' -Required
if (-not $token) { Fail 'STEP 1/4' 'no valid access token' }
$env:SUPABASE_ACCESS_TOKEN = $token

$secret = $null; $publishable = $null
if (-not $DeployOnly) {
  $secret = Get-TcgSecret -Name APP_SECRET_KEY -Prefix 'sb_secret_' -Required
  $publishable = Get-TcgSecret -Name APP_PUBLISHABLE_KEY -Prefix 'sb_publishable_' -Required
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
