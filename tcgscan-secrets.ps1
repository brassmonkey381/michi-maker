# tcgscan-secrets.ps1 - one place to read every local credential from.
#
# MIRRORED FILE: an identical copy lives in tcgscan-data-science/. Change one, change both (the workspace
# already works this way for the handoff.ts pair - see ../AGENTS.md "Declared mirrors").
#
# Dot-source it, then ask for what you need:
#     . "$PSScriptRoot\tcgscan-secrets.ps1"
#     $key = Get-TcgSecret -Name APP_SECRET_KEY -Prefix 'sb_secret_' -Required
#
# WHERE THE SECRETS LIVE. The workspace root (the folder holding tcgscan-app, michi-maker, ...) is
# NOT a git repository - AGENTS.md: "There is no root git repo here." A file there is therefore
# structurally impossible to commit, which is a stronger guarantee than .gitignore: this session
# has already committed a service_role key once because the editor saved it as .key.txt and the
# *.key rule did not match. Rules can miss a filename; "outside every repo" cannot.
#
#     C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets
#
# FORMAT - one KEY=value per line, # comments and blank lines ignored, values NOT quoted:
#
#     SUPABASE_ACCESS_TOKEN=sbp_...
#     APP_SECRET_KEY=sb_secret_...
#     APP_PUBLISHABLE_KEY=sb_publishable_...
#     APP_SERVICE_ROLE_KEY=eyJ...        # legacy, only until the rotation is finished
#
# Values are never printed by anything here. Get-TcgSecret validates a value's SHAPE (its prefix)
# and reports only that, so a wrong or unset value is caught before it reaches a CLI, where the
# error would be a confusing "invalid format" rather than "you did not set this".

$script:TcgSecretsCache = $null

<#
.SYNOPSIS Path to the workspace secrets file, or $null when it does not exist.
#>
function Get-TcgSecretsPath {
  # Walk up from this script until the folder that holds the sibling repos appears. Works whichever
  # repo the caller is in, and does not care how deep the script sits.
  $dir = $PSScriptRoot
  for ($i = 0; $i -lt 6 -and $dir; $i++) {
    $candidate = Join-Path $dir 'tcgscan.secrets'
    if (Test-Path $candidate) { return $candidate }
    # the workspace root is the folder containing both app repos
    if ((Test-Path (Join-Path $dir 'tcgscan-app')) -and (Test-Path (Join-Path $dir 'michi-maker'))) {
      $candidate = Join-Path $dir 'tcgscan.secrets'
      return $(if (Test-Path $candidate) { $candidate } else { $null })
    }
    $dir = Split-Path -Parent $dir
  }
  return $null
}

<#
.SYNOPSIS Parse the secrets file into a hashtable. Cached per session. Never prints a value.
#>
function Import-TcgSecrets {
  param([switch]$Force)
  if ($script:TcgSecretsCache -and -not $Force) { return $script:TcgSecretsCache }
  $table = @{}
  $path = Get-TcgSecretsPath
  if ($path) {
    foreach ($line in Get-Content $path) {
      $t = $line.Trim()
      if (-not $t -or $t.StartsWith('#')) { continue }
      $eq = $t.IndexOf('=')
      if ($eq -lt 1) { continue }                       # no name, or no '=' at all
      $name = $t.Substring(0, $eq).Trim()
      # Split on the FIRST '=' only: base64 and JWT values routinely contain more of them.
      $value = $t.Substring($eq + 1).Trim()
      # Tolerate quotes if they were pasted, but do not require them.
      if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or
                                    ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if ($name -and $value) { $table[$name] = $value }
    }
  }
  $script:TcgSecretsCache = $table
  return $table
}

<#
.SYNOPSIS  One credential, by name. Environment variable wins, then the secrets file.
.PARAMETER Fallback  Other names to accept, in order - e.g. the legacy name during a rotation.
.PARAMETER Prefix    Expected leading text (sbp_, sb_secret_, ...). Shape only; never the value.
.PARAMETER Required  Write a clear message and return $null if absent or misshapen.
#>
function Get-TcgSecret {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$Fallback = @(),
    [string]$Prefix,
    [switch]$Required,
    [switch]$Quiet
  )
  $table = Import-TcgSecrets
  $names = @($Name) + $Fallback
  foreach ($n in $names) {
    $v = [Environment]::GetEnvironmentVariable($n)
    $src = "`$env:$n"
    if ([string]::IsNullOrWhiteSpace($v) -and $table.ContainsKey($n)) {
      $v = $table[$n]; $src = "tcgscan.secrets ($n)"
    }
    if ([string]::IsNullOrWhiteSpace($v)) { continue }
    if ($Prefix -and -not $v.StartsWith($Prefix)) {
      Write-Host "  $n from $src does not start with '$Prefix' (length $($v.Length))." -ForegroundColor Red
      Write-Host "    A placeholder pasted literally looks exactly like this." -ForegroundColor Red
      continue
    }
    if (-not $Quiet) { Write-Host "  $n ok, from $src  (value not shown)" }
    return $v
  }
  if ($Required) {
    $path = Get-TcgSecretsPath
    Write-Host "  missing $Name." -ForegroundColor Yellow
    if ($path) { Write-Host "    add a line to $path :" -ForegroundColor Yellow }
    else {
      Write-Host '    create the workspace secrets file (it sits OUTSIDE every repo, so it' -ForegroundColor Yellow
      Write-Host '    cannot be committed):  C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets' -ForegroundColor Yellow
    }
    Write-Host "      $Name=$(if ($Prefix) { $Prefix } else { '<value>' })..." -ForegroundColor Yellow
  }
  return $null
}

<#
.SYNOPSIS Export every secret into the process environment, for tools that read env vars directly.
#>
function Set-TcgSecretsEnv {
  $table = Import-TcgSecrets
  foreach ($k in $table.Keys) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($k))) {
      Set-Item -Path "Env:$k" -Value $table[$k]
    }
  }
  return $table.Keys
}
