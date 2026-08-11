param(
  [string]$Database = 'erp_rrhh_475',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55433,
  [string]$UserName = 'postgres',
  [string]$Psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'

$tenantId = [guid]::NewGuid().ToString()
$actorId = [guid]::NewGuid().ToString()
$roleId = [guid]::NewGuid().ToString()
$permissionId = [guid]::NewGuid().ToString()
$runId = ([guid]::NewGuid().ToString('N')).Substring(0, 12)
$key = "verify475-concurrent-$runId"
$departmentName = "Concurrent RRHH 475 $runId"

function Invoke-Psql([string]$Sql) {
  $output = & $Psql -h $HostName -p $Port -U $UserName -d $Database -w -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }
  return $output
}

$environmentBefore = (Invoke-Psql @"
SELECT jsonb_build_object(
  'environment', environment,
  'project_ref', project_ref,
  'allow_demo_data', allow_demo_data,
  'configured_at', configured_at,
  'updated_at', updated_at
)::text
FROM app.deployment_environment
WHERE singleton = true;
"@ | Select-Object -Last 1) | ConvertFrom-Json

$setupSql = @"
BEGIN;
UPDATE app.deployment_environment
SET environment='PROD', project_ref='wypnbcptofqdmoynlonq',
    allow_demo_data=true, configured_at=now(), updated_at=now()
WHERE singleton=true;
INSERT INTO public.tenants (id,codigo,nombre,pais,plan,activo,estado)
VALUES ('$tenantId','VERIFY-475-$runId','Concurrency RRHH 475','PE','test',true,'ACTIVO');
INSERT INTO public.usuarios_sistema (
  id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado
) VALUES (
  '$actorId','$tenantId','Actor','Concurrency',
  'rrhh475-$runId@local.invalid','rrhh475-$runId','unused-local-hash',true,'ACTIVO'
);
INSERT INTO public.roles (id,tenant_id,nombre,descripcion,activo)
VALUES ('$roleId','$tenantId','VERIFY_RRHH_475','Fixture concurrencia',true);
INSERT INTO public.permisos (
  id,tenant_id,modulo,recurso,accion,codigo,descripcion,activo
) VALUES (
  '$permissionId','$tenantId','rrhh','__global__','access','rrhh.access',
  'Fixture concurrencia RRHH 475',true
);
INSERT INTO public.rol_permisos (role_id,permiso_id,concedido,assigned_by)
VALUES ('$roleId','$permissionId',true,'$actorId');
INSERT INTO public.user_roles (usuario_sistema_id,role_id,tenant_id,assigned_by)
VALUES ('$actorId','$roleId','$tenantId','$actorId');
COMMIT;
"@

$callSql = @"
SELECT public.ejecutar_operacion_rrhh_tx(
  '$tenantId'::uuid,
  '$actorId'::uuid,
  'DEPARTMENT_CREATE',
  jsonb_build_object('nombre','$departmentName','codigo','CON-$runId'),
  '$key'
)::text;
"@

try {
  Invoke-Psql $setupSql | Out-Null

  $jobs = 1..12 | ForEach-Object {
    Start-Job -ScriptBlock {
      param($PsqlPath, $HostValue, $PortValue, $UserValue, $DatabaseValue, $SqlValue)
      $jobOutput = & $PsqlPath -h $HostValue -p $PortValue -U $UserValue -d $DatabaseValue `
        -w -v ON_ERROR_STOP=1 -At -c $SqlValue 2>&1
      if ($LASTEXITCODE -ne 0) { throw ($jobOutput -join [Environment]::NewLine) }
      $jobOutput
    } -ArgumentList $Psql, $HostName, $Port, $UserName, $Database, $callSql
  }

  $jobs | Wait-Job | Out-Null
  $failedJobs = @($jobs | Where-Object { $_.State -ne 'Completed' })
  $results = @($jobs | Receive-Job)
  $jobs | Remove-Job -Force

  if ($failedJobs.Count -ne 0) {
    throw "Fallaron $($failedJobs.Count) invocaciones concurrentes"
  }

  $checkSql = @"
SELECT
  (SELECT count(*) FROM public.rrhh_operaciones_475
   WHERE tenant_id='$tenantId'::uuid AND operacion='DEPARTMENT_CREATE'
     AND idempotency_key='$key'),
  (SELECT count(*) FROM public.departamentos
   WHERE tenant_id='$tenantId'::uuid AND nombre='$departmentName'),
  (SELECT count(DISTINCT response->>'id') FROM public.rrhh_operaciones_475
   WHERE tenant_id='$tenantId'::uuid AND operacion='DEPARTMENT_CREATE'
     AND idempotency_key='$key');
"@
  $counts = (Invoke-Psql $checkSql | Select-Object -Last 1).Trim()
  if ($counts -ne '1|1|1') {
    throw "Concurrencia no convergió a una sola intención/fila/respuesta: $counts"
  }
  if ($results.Count -ne 12) {
    throw "No se recibieron las 12 respuestas: $($results.Count)"
  }

  Write-Output "VERIFY_475_CONCURRENCY_OK: 12 llamadas => 1 intención, 1 departamento, 1 respuesta"
}
finally {
  try {
    Invoke-Psql @"
BEGIN;
DELETE FROM public.audit_log WHERE tenant_id='$tenantId'::uuid;
DELETE FROM public.rrhh_operaciones_475 WHERE tenant_id='$tenantId'::uuid;
DELETE FROM public.departamentos WHERE tenant_id='$tenantId'::uuid;
DELETE FROM public.rol_permisos WHERE role_id='$roleId'::uuid;
DELETE FROM public.user_roles WHERE tenant_id='$tenantId'::uuid;
DELETE FROM public.permisos WHERE tenant_id='$tenantId'::uuid;
DELETE FROM public.roles WHERE tenant_id='$tenantId'::uuid;
DELETE FROM public.usuarios_sistema WHERE tenant_id='$tenantId'::uuid;
DELETE FROM public.tenants WHERE id='$tenantId'::uuid;
COMMIT;
"@ | Out-Null
  }
  finally {
    $environmentSql = "'" + ([string]$environmentBefore.environment).Replace("'", "''") + "'"
    $projectSql = if ($null -eq $environmentBefore.project_ref) {
      'NULL'
    } else {
      "'" + ([string]$environmentBefore.project_ref).Replace("'", "''") + "'"
    }
    $configuredSql = if ($null -eq $environmentBefore.configured_at) {
      'NULL'
    } else {
      "'" + ([string]$environmentBefore.configured_at).Replace("'", "''") + "'::timestamptz"
    }
    $updatedSql = "'" + ([string]$environmentBefore.updated_at).Replace("'", "''") + "'::timestamptz"
    $allowSql = if ([bool]$environmentBefore.allow_demo_data) { 'true' } else { 'false' }
    Invoke-Psql @"
UPDATE app.deployment_environment
SET environment=$environmentSql, project_ref=$projectSql,
    allow_demo_data=$allowSql, configured_at=$configuredSql, updated_at=$updatedSql
WHERE singleton=true;
"@ | Out-Null
  }
}
