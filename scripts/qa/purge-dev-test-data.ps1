[CmdletBinding()]
param(
  [switch]$Commit,
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

$sqlFile = Join-Path $PSScriptRoot 'purge-dev-test-data.sql'
$commitValue = if ($Commit) { 'true' } else { 'false' }
& psql -X -v ON_ERROR_STOP=1 -v "commit_cleanup=$commitValue" -d $values['DATABASE_URL'] -f $sqlFile
if ($LASTEXITCODE -ne 0) {
  throw 'La purga DEV fallo y la transaccion fue revertida'
}

