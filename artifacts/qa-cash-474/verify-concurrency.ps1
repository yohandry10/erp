param(
  [string]$Database = 'erp_cash_474',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 55433,
  [string]$UserName = 'postgres',
  [string]$Psql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'

$tenantId = [guid]::NewGuid().ToString()
$actorId = [guid]::NewGuid().ToString()
$warehouseId = [guid]::NewGuid().ToString()
$cashAccountId = [guid]::NewGuid().ToString()
$expenseAccountId = [guid]::NewGuid().ToString()
$cashRegisterId = [guid]::NewGuid().ToString()
$sessionId = [guid]::NewGuid().ToString()
$runId = ([guid]::NewGuid().ToString('N')).Substring(0, 12)
$tenantCode = "QA-CASH-474-RACE-$runId"
$tenantRuc = '20' + (Get-Random -Minimum 100000000 -Maximum 999999999).ToString()
$sameKey = "cash474-race-same-$runId"

function Invoke-Psql([string]$Sql) {
  $output = & $Psql -h $HostName -p $Port -U $UserName -d $Database `
    -w -v ON_ERROR_STOP=1 -qAt -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }
  return @($output)
}

function Invoke-Concurrent([string[]]$Calls) {
  $jobs = @($Calls | ForEach-Object {
    Start-Job -ScriptBlock {
      param($PsqlPath, $HostValue, $PortValue, $UserValue, $DatabaseValue, $SqlValue)
      $jobOutput = & $PsqlPath -h $HostValue -p $PortValue -U $UserValue `
        -d $DatabaseValue -w -v ON_ERROR_STOP=1 -qAt -c $SqlValue 2>&1
      if ($LASTEXITCODE -ne 0) {
        throw ($jobOutput -join [Environment]::NewLine)
      }
      @($jobOutput | Where-Object { $_ -match '^\{' } | Select-Object -Last 1)
    } -ArgumentList $Psql, $HostName, $Port, $UserName, $Database, $_
  })

  try {
    $jobs | Wait-Job | Out-Null
    $failed = @($jobs | Where-Object { $_.State -ne 'Completed' })
    if ($failed.Count -ne 0) {
      $details = @($failed | Receive-Job -ErrorAction SilentlyContinue) -join [Environment]::NewLine
      throw "Fallaron $($failed.Count) sesiones concurrentes: $details"
    }
    return @($jobs | Receive-Job)
  }
  finally {
    $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
  }
}

$databaseCheck = (Invoke-Psql 'SELECT current_database();' | Select-Object -Last 1).Trim()
if ($databaseCheck -ne 'erp_cash_474' -or $Database -ne 'erp_cash_474') {
  throw "QA 474 sólo puede ejecutarse contra erp_cash_474; actual=$databaseCheck"
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
WHERE singleton=true;
"@ | Select-Object -Last 1) | ConvertFrom-Json

# El contrato runtime sólo habilita mutaciones bajo una configuración PROD
# válida. Esto modifica exclusivamente la fila de la DB local aislada y se
# restaura en finally; no abre conexión alguna al proyecto remoto.
Invoke-Psql @"
UPDATE app.deployment_environment
SET environment='PROD', project_ref='wypnbcptofqdmoynlonq',
    allow_demo_data=true, configured_at=clock_timestamp(), updated_at=clock_timestamp()
WHERE singleton=true;
"@ | Out-Null

$setupSql = @"
BEGIN;
INSERT INTO public.tenants (id,codigo,nombre,ruc,pais,activo,estado)
VALUES ('$tenantId','$tenantCode','QA concurrencia Caja 474','$tenantRuc','PE',true,'ACTIVO');
INSERT INTO public.usuarios_sistema (
  id,tenant_id,email,nombre,apellido,activo,estado,is_super_admin
) VALUES (
  '$actorId','$tenantId','cash474-$runId@local.invalid','Actor','Caja 474',true,'ACTIVO',true
);
INSERT INTO public.almacenes (id,tenant_id,nombre,codigo,estado,activo,es_principal)
VALUES ('$warehouseId','$tenantId','Almacén race 474','ALM-$runId','ACTIVO',true,true);
INSERT INTO public.plan_cuentas (
  id,tenant_id,codigo,nombre,estado,activo,acepta_movimiento,tipo,tipo_cuenta,nivel
) VALUES
  ('$cashAccountId','$tenantId','10111','Caja race 474','ACTIVO',true,true,'ACTIVO','ACTIVO',5),
  ('$expenseAccountId','$tenantId','65999','Gasto race 474','ACTIVO',true,true,'GASTO','GASTO',5);
INSERT INTO public.cajas (
  id,tenant_id,nombre,codigo,almacen_id,tipo,estado,creado_por,metadata
) VALUES (
  '$cashRegisterId','$tenantId','Caja race 474','CAJA-$runId','$warehouseId',
  'TIENDA','ACTIVO','$actorId',jsonb_build_object('fixture','cash-474-concurrency')
);
INSERT INTO public.sesiones_caja (
  id,tenant_id,caja_id,cajero_id,usuario_id,abierto_por,usuario_apertura,
  estado,activo,monto_inicio,monto_inicial,monto_esperado,monto_contado,
  monto_cierre,total_efectivo,total_tarjeta,moneda,hora_apertura,
  fecha_apertura,congelada,metadata
) VALUES (
  '$sessionId','$tenantId','$cashRegisterId','$actorId','$actorId','$actorId','$actorId',
  'ABIERTA',true,1000,1000,1000,0,0,0,0,'PEN',clock_timestamp(),
  clock_timestamp(),false,jsonb_build_object('fixture','cash-474-concurrency')
);
COMMIT;
"@

try {
  Invoke-Psql $setupSql | Out-Null

  $samePayloadSql = @"
SET ROLE service_role;
SELECT public.registrar_movimiento_manual_caja_tx(
  '$tenantId'::uuid,
  '$sessionId'::uuid,
  jsonb_build_object(
    'tipo','GASTO','monto',1,'motivo','Carrera misma intención 474',
    'cuenta_contrapartida_id','$expenseAccountId'
  ),
  '$actorId'::uuid,
  '$sameKey'
)::text;
"@
  $sameResults = Invoke-Concurrent (@(1..8 | ForEach-Object { $samePayloadSql }))
  $sameMovementIds = @($sameResults | ForEach-Object {
    ($_ | ConvertFrom-Json).movimiento_id
  } | Sort-Object -Unique)
  if ($sameResults.Count -ne 8 -or $sameMovementIds.Count -ne 1) {
    throw "Retry concurrente no convergió: respuestas=$($sameResults.Count), movimientos=$($sameMovementIds.Count)"
  }

  $distinctCalls = @(1..8 | ForEach-Object {
    $distinctKey = "cash474-race-distinct-$runId-$_"
    @"
SET ROLE service_role;
SELECT public.registrar_movimiento_manual_caja_tx(
  '$tenantId'::uuid,
  '$sessionId'::uuid,
  jsonb_build_object(
    'tipo','GASTO','monto',1,'motivo','Carrera intención distinta 474 $_',
    'cuenta_contrapartida_id','$expenseAccountId'
  ),
  '$actorId'::uuid,
  '$distinctKey'
)::text;
"@
  })
  $distinctResults = Invoke-Concurrent $distinctCalls
  $distinctMovementIds = @($distinctResults | ForEach-Object {
    ($_ | ConvertFrom-Json).movimiento_id
  } | Sort-Object -Unique)
  if ($distinctResults.Count -ne 8 -or $distinctMovementIds.Count -ne 8) {
    throw "Intenciones distintas se fusionaron: respuestas=$($distinctResults.Count), movimientos=$($distinctMovementIds.Count)"
  }

  $assertSql = @"
SELECT concat_ws('|',
  (SELECT count(*) FROM public.caja_operaciones_474
    WHERE tenant_id='$tenantId'::uuid AND tipo='MOVIMIENTO_MANUAL'),
  (SELECT count(*) FROM public.movimientos_caja
    WHERE tenant_id='$tenantId'::uuid AND sesion_caja_id='$sessionId'::uuid),
  (SELECT count(DISTINCT secuencia) FROM public.movimientos_caja
    WHERE tenant_id='$tenantId'::uuid AND sesion_caja_id='$sessionId'::uuid),
  (SELECT min(secuencia) FROM public.movimientos_caja
    WHERE tenant_id='$tenantId'::uuid AND sesion_caja_id='$sessionId'::uuid),
  (SELECT max(secuencia) FROM public.movimientos_caja
    WHERE tenant_id='$tenantId'::uuid AND sesion_caja_id='$sessionId'::uuid),
  (SELECT saldo_nuevo FROM public.movimientos_caja
    WHERE tenant_id='$tenantId'::uuid AND sesion_caja_id='$sessionId'::uuid
    ORDER BY secuencia DESC LIMIT 1),
  (SELECT count(*) FROM public.outbox_events
    WHERE tenant_id='$tenantId'::uuid AND event_type='caja.movimiento_manual.registrado')
);
"@
  $counts = (Invoke-Psql $assertSql | Select-Object -Last 1).Trim()
  if ($counts -ne '9|9|9|1|9|991.00|9') {
    throw "Proyección concurrente inválida (ops|movs|seqs|min|max|saldo|outbox): $counts"
  }

  Write-Output 'VERIFY_474_CONCURRENCY_OK: 8 retries => 1 movimiento; 8 intenciones => 8 movimientos; secuencia 1..9, saldo 991.00 y 9 outbox'
}
finally {
  try {
    Invoke-Psql @"
BEGIN;
SELECT set_config('app.period_transition_458','on',true);
DELETE FROM public.tenants
WHERE id='$tenantId'::uuid AND codigo='$tenantCode';
COMMIT;
"@ | Out-Null
    $remaining = (Invoke-Psql "SELECT count(*) FROM public.tenants WHERE id='$tenantId'::uuid;" | Select-Object -Last 1).Trim()
    if ($remaining -ne '0') {
      throw 'El fixture de concurrencia Caja 474 no fue limpiado'
    }
  }
  finally {
    $environmentSql = if ($null -eq $environmentBefore.environment) {
      'NULL'
    } else {
      "'" + ([string]$environmentBefore.environment).Replace("'", "''") + "'"
    }
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
    $updatedSql = if ($null -eq $environmentBefore.updated_at) {
      'NULL'
    } else {
      "'" + ([string]$environmentBefore.updated_at).Replace("'", "''") + "'::timestamptz"
    }
    $allowSql = if ([bool]$environmentBefore.allow_demo_data) { 'true' } else { 'false' }
    Invoke-Psql @"
UPDATE app.deployment_environment
SET environment=$environmentSql, project_ref=$projectSql,
    allow_demo_data=$allowSql, configured_at=$configuredSql, updated_at=$updatedSql
WHERE singleton=true;
"@ | Out-Null
  }
}
