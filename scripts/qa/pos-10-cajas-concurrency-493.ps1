param(
  [string]$Database = 'erp_qa10',
  [string]$Server = '127.0.0.1',
  [int]$Port = 55434,
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\16\bin'
)

$ErrorActionPreference = 'Stop'
$psql = Join-Path $PostgresBin 'psql.exe'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$worker = Join-Path $PSScriptRoot 'sql\pos-10-cajas-concurrency-493-worker.sql'
$outputRoot = Join-Path $repoRoot 'tmp\pos-493-race'

if (-not (Test-Path -LiteralPath $psql)) { throw "psql no encontrado: $psql" }
if (-not (Test-Path -LiteralPath $worker)) { throw "worker SQL no encontrado: $worker" }
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

function Invoke-PsqlText([string]$Sql) {
  $result = & $psql -h $Server -p $Port -U postgres -d $Database -X -A -t -v ON_ERROR_STOP=1 -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($result | Out-String) }
  return (($result | Out-String).Trim())
}

$safety = Invoke-PsqlText "select current_database() || '|' || coalesce((select environment from app.deployment_environment where singleton),'');"
if ($safety -ne "$Database|DEV" -or $Database -notin @('erp_qa10', 'erp_pos_493')) {
  throw "Carrera 493 bloqueada fuera de base local efímera: $safety"
}

$fixtureSql = @"
with candidate as (
  select s.tenant_id
  from public.sesiones_caja s
  join public.usuarios_sistema u on u.id=coalesce(s.cajero_id,s.usuario_id) and u.tenant_id=s.tenant_id
  where upper(s.estado::text)='ABIERTA' and s.hora_cierre is null and s.fecha_cierre is null
  group by s.tenant_id having count(distinct u.id)>=10
  order by s.tenant_id limit 1
)
select s.tenant_id,u.id,s.id,s.caja_id,u.email
from candidate c
join public.sesiones_caja s on s.tenant_id=c.tenant_id
join public.usuarios_sistema u on u.id=coalesce(s.cajero_id,s.usuario_id) and u.tenant_id=s.tenant_id
where upper(s.estado::text)='ABIERTA' and s.hora_cierre is null and s.fecha_cierre is null
order by u.email limit 10;
"@
$fixtureText = Invoke-PsqlText $fixtureSql
$fixtureRows = @($fixtureText -split "`r?`n" | Where-Object { $_ })
if ($fixtureRows.Count -ne 10) { throw "Se requieren exactamente 10 actores/cajas abiertas; encontrados: $($fixtureRows.Count)" }
$actors = @($fixtureRows | ForEach-Object {
  $parts = $_ -split '\|'
  [pscustomobject]@{ Tenant=$parts[0]; Actor=$parts[1]; Session=$parts[2]; Caja=$parts[3]; Email=$parts[4] }
})
$tenant = $actors[0].Tenant
if (($actors.Actor | Sort-Object -Unique).Count -ne 10 -or ($actors.Caja | Sort-Object -Unique).Count -ne 10) {
  throw 'La fixture no contiene 10 actores y 10 cajas distintos'
}

$productRow = Invoke-PsqlText @"
select pe.producto_id || '|' || p.precio_venta || '|' || pe.stock_actual
from public.producto_existencias pe
join public.productos p on p.id=pe.producto_id and p.tenant_id=pe.tenant_id
where pe.tenant_id='$tenant'::uuid and pe.stock_actual>=20 and p.precio_venta>0
  and p.afectacion_igv='10'
order by pe.stock_actual desc,pe.producto_id limit 1;
"@
$productParts = $productRow -split '\|'
$productId = $productParts[0]
$price = $productParts[1]
$stockBefore = [decimal]$productParts[2]
$run = "verify493-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

function Invoke-Race([string]$Phase) {
  $processes = @()
  for ($index = 0; $index -lt 10; $index += 1) {
    $actor = $actors[$index]
    $slot = $index + 1
    $stdout = Join-Path $outputRoot "$run-$Phase-$slot.out"
    $stderr = Join-Path $outputRoot "$run-$Phase-$slot.err"
    $arguments = @(
      '-h', $Server, '-p', $Port, '-U', 'postgres', '-d', $Database,
      '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-v', "tenant_id=$tenant", '-v', "actor_id=$($actor.Actor)",
      '-v', "session_id=$($actor.Session)", '-v', "producto_id=$productId",
      '-v', "precio_unitario=$price", '-v', "idempotency_key=$run`:sale`:$slot",
      '-v', "cliente_documento=$([string](70000000 + $slot))",
      '-v', "cliente_nombre=Cliente-carrera-493-$slot",
      '-f', $worker
    )
    $processes += [pscustomobject]@{
      Slot = $slot
      Process = Start-Process -FilePath $psql -ArgumentList $arguments -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
      Stdout = $stdout
      Stderr = $stderr
    }
  }
  foreach ($item in $processes) {
    $item.Process.WaitForExit()
    $item.Process.Refresh()
    $exitCode = [int]$item.Process.ExitCode
    if ($exitCode -ne 0) {
      $errorText = if ((Get-Item -LiteralPath $item.Stderr).Length -gt 0) {
        (Get-Content -Raw -LiteralPath $item.Stderr).Trim()
      } else {
        "psql terminó con código $exitCode sin stderr"
      }
      throw "Fallo $Phase slot=$($item.Slot): $errorText"
    }
  }
  return @($processes | ForEach-Object {
    $raw = (Get-Content -Raw -LiteralPath $_.Stdout).Trim()
    [pscustomobject]@{ Slot=$_.Slot; Result=($raw | ConvertFrom-Json) }
  })
}

$sales = Invoke-Race 'sale'
$retries = Invoke-Race 'retry'

if (($sales.Result.venta_id | Sort-Object -Unique).Count -ne 10) { throw 'La carrera no creó 10 ventas distintas' }
if (($sales.Result.numero_ticket | Sort-Object -Unique).Count -ne 10) { throw 'La carrera generó tickets duplicados' }
if (@($retries | Where-Object { -not $_.Result.idempotent }).Count -ne 0) { throw 'Un retry no fue idempotente' }
for ($index = 0; $index -lt 10; $index += 1) {
  if ($sales[$index].Result.venta_id -ne $retries[$index].Result.venta_id) {
    throw "Retry cambió venta en slot $($index + 1)"
  }
}

$postcheck = Invoke-PsqlText @"
select jsonb_build_object(
  'ventas',count(*),
  'tickets_unicos',count(distinct numero_ticket),
  'documentos_ticket',(select count(*) from public.documentos d where d.tenant_id='$tenant'::uuid and d.metadata->>'venta_pos_id' in (select id::text from public.ventas_pos where tenant_id='$tenant'::uuid and idempotency_key like '${run}:%')),
  'detalles',(select count(*) from public.detalle_ventas_pos d where d.tenant_id='$tenant'::uuid and coalesce(d.venta_pos_id,d.venta_id) in (select id from public.ventas_pos where tenant_id='$tenant'::uuid and idempotency_key like '${run}:%')),
  'pagos',(select count(*) from public.ventas_pos_pagos p where p.tenant_id='$tenant'::uuid and p.venta_pos_id in (select id from public.ventas_pos where tenant_id='$tenant'::uuid and idempotency_key like '${run}:%')),
  'stock_antes',$stockBefore,
  'stock_despues',(select stock_actual from public.producto_existencias where tenant_id='$tenant'::uuid and producto_id='$productId'::uuid limit 1),
  'marcadas_493',count(*) filter(where metadata->>'ticket_sequence_version'='493')
)
from public.ventas_pos
where tenant_id='$tenant'::uuid and idempotency_key like '${run}:%';
"@ | ConvertFrom-Json

if ($postcheck.ventas -ne 10 -or $postcheck.tickets_unicos -ne 10 -or
    $postcheck.documentos_ticket -ne 10 -or $postcheck.detalles -ne 10 -or
    $postcheck.pagos -ne 10 -or $postcheck.marcadas_493 -ne 10 -or
    [decimal]$postcheck.stock_despues -ne ($stockBefore - 10)) {
  throw "Postcondiciones de carrera inválidas: $($postcheck | ConvertTo-Json -Compress)"
}

[pscustomobject]@{
  run = $run
  tenant = $tenant
  distinctActors = ($actors.Actor | Sort-Object -Unique).Count
  distinctCashRegisters = ($actors.Caja | Sort-Object -Unique).Count
  sales = $sales.Result
  retries = $retries.Result
  postcheck = $postcheck
} | ConvertTo-Json -Depth 12
