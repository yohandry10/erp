[CmdletBinding()]
param(
  [string]$EnvFile = '.env.local'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedEnvFile = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile
} else {
  Join-Path $repoRoot $EnvFile
}

& (Join-Path $repoRoot 'scripts/db-environment-preflight.ps1') -Environment DEV -EnvFile $resolvedEnvFile

$values = @{}
Get-Content -LiteralPath $resolvedEnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
    $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}

if (-not $values['DATABASE_URL']) {
  throw 'DATABASE_URL no esta definido'
}

$contractFile = Join-Path $PSScriptRoot 'inventory-single-ledger-contract.sql'
& psql -X -v ON_ERROR_STOP=1 -d $values['DATABASE_URL'] -f $contractFile
if ($LASTEXITCODE -ne 0) {
  throw 'Contrato single-ledger de inventario fallido'
}

