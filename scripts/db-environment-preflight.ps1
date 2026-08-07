[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('PROD')]
  [string]$Environment,

  [string]$EnvFile
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$requiredRef = 'wypnbcptofqdmoynlonq'

if (-not $EnvFile) {
  $EnvFile = '.env.production'
}

$resolvedEnvFile = if ([System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile
} else {
  Join-Path $repoRoot $EnvFile
}

if (-not (Test-Path -LiteralPath $resolvedEnvFile)) {
  throw "No existe el archivo de entorno: $resolvedEnvFile"
}

$values = @{}
Get-Content -LiteralPath $resolvedEnvFile | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
    $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}

if ($values['DEPLOYMENT_ENV'] -ne $Environment) {
  throw "DEPLOYMENT_ENV no coincide: esperado=$Environment"
}
if ($values['EXPECTED_SUPABASE_PROJECT_REF'] -ne $requiredRef) {
  throw "EXPECTED_SUPABASE_PROJECT_REF no coincide con el contrato canonico de $Environment"
}
if (-not $values['DATABASE_URL']) {
  throw 'DATABASE_URL no esta definido'
}
if (-not $values['SUPABASE_URL']) {
  throw 'SUPABASE_URL no esta definido'
}

$supabaseHost = ([Uri]$values['SUPABASE_URL']).Host
$actualUrlRef = $supabaseHost.Split('.')[0]
if ($actualUrlRef -ne $requiredRef) {
  throw "SUPABASE_URL no apunta al project_ref canonico de $Environment"
}

if ($values['DEMO_API_ENABLED'] -notin @('true', 'false')) {
  throw 'PROD requiere DEMO_API_ENABLED=true|false de forma explicita'
}

$sql = @"
SELECT environment || '|' || project_ref || '|' || allow_demo_data::text || '|' ||
       COALESCE((SELECT bool_and(ok)::text
                 FROM public.validar_deployment_environment_runtime('$Environment', '$requiredRef')
                 WHERE check_name IN (
                   'environment_configured',
                   'environment_matches',
                   'project_ref_matches'
                 )), 'false')
FROM app.deployment_environment
WHERE singleton = true;
"@

$result = (& psql -X -A -t -v ON_ERROR_STOP=1 -c $sql $values['DATABASE_URL'] 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Fallo el preflight SQL: $result"
}

$parts = $result.Split('|')
if ($parts.Count -ne 4 -or $parts[0] -ne $Environment -or $parts[1] -ne $requiredRef -or $parts[3] -ne 'true') {
  throw "La marca interna de la base no coincide o su validador fallo: $result"
}
if ($parts[2] -ne $values['DEMO_API_ENABLED']) {
  throw 'La politica demo de PROD no coincide entre DEMO_API_ENABLED y allow_demo_data'
}

Write-Output "OK: $Environment -> $requiredRef; marca interna y politica demo=$($parts[2]) validadas."
