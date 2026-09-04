# apply-promo-coupon.ps1 - point STRIPE_PROMO_COUPON at a new coupon and redeploy the checkout.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -CouponId OFF20NOV
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>" -CouponId OFF20NOV -SecretOnly
#
# WHY THIS EXISTS. A Stripe coupon's redeem_by CANNOT be changed - POST /v1/coupons/:id edits only
# name, metadata and currency_options, and the docs say the rest is "by design, not editable". So
# extending a sale means creating a NEW coupon and repointing the secret at it. This is the second
# half of that: create the coupon in the Dashboard (both modes), then run this.
#
# ORDER MATTERS. src/data/promo.ts already says the sale is running, so until this has run the app
# quotes 20% off while stripe-checkout attaches a coupon Stripe has expired. That is the exact
# failure the promo.ts header calls the worst one a promotion has: advertising a price we do not
# honour. Run it promptly, or revert ENDS_AT until you are ready.
#
# The deploy is not optional. Edge functions read secrets at boot, so a secret set without a
# redeploy leaves the OLD coupon id running until something else redeploys the function.
#
# No secrets are printed. The Supabase token comes from the workspace file via tcgscan-secrets.ps1.

param(
  [Parameter(Mandatory = $true)][string]$CouponId,
  [switch]$SecretOnly
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRef = 'piikwvntldytjejxmcla'

function Fail($step, $msg) {
  Write-Host ''
  Write-Host "FAILED at $step : $msg" -ForegroundColor Red
  exit 1
}
function Step($n, $what) { Write-Host ''; Write-Host "STEP $n : $what" -ForegroundColor Cyan }
function Invoke-Native($file, $argList) {
  $ErrorActionPreference = 'Continue'
  & $file @argList | Out-Host
  $code = $LASTEXITCODE
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
Write-Host "  ok"

Step '2/4' "linking $ProjectRef"
$code = Invoke-Native 'supabase' @('link', '--project-ref', $ProjectRef)
if ($code -ne 0) { Fail 'STEP 2/4' "supabase link exited $code" }

Step '3/4' "STRIPE_PROMO_COUPON = $CouponId"
# The coupon id is not a secret - it is a public discount code name - so printing it is fine and
# is the only way to see that the right one went in.
$code = Invoke-Native 'supabase' @('secrets', 'set', ("STRIPE_PROMO_COUPON={0}" -f $CouponId))
if ($code -ne 0) { Fail 'STEP 3/4' "secrets set failed (exit $code)" }

if ($SecretOnly) {
  Write-Host ''
  Write-Host 'DONE (secret only). stripe-checkout still runs the OLD coupon id until it is' -ForegroundColor Yellow
  Write-Host 'redeployed - functions read their secrets at boot. Re-run without -SecretOnly.' -ForegroundColor Yellow
  exit 0
}

Step '4/4' 'redeploying stripe-checkout'
$code = Invoke-Native 'supabase' @('functions', 'deploy', 'stripe-checkout')
if ($code -ne 0) { Fail 'STEP 4/4' "functions deploy exited $code" }

Write-Host ''
Write-Host 'DONE.' -ForegroundColor Green
Write-Host 'Verify with a real checkout: the Stripe Checkout page should show the 20% off line.' -ForegroundColor DarkGray
Write-Host 'The old coupon had times_redeemed 0, so nothing depends on it.' -ForegroundColor DarkGray
