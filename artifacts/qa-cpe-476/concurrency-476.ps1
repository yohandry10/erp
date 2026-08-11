$ErrorActionPreference = 'Stop'

$database = 'erp_cpe_476'
$tenantId = '00000000-0000-4760-8000-000000000001'
$actorId = '00000000-0000-4760-8000-000000000002'
$sendDocumentId = '00000000-0000-4760-8000-000000000010'
$sendCpeId = '00000000-0000-4760-8000-000000000011'
$posDocumentId = '00000000-0000-4760-8000-000000000020'
$posSaleId = '00000000-0000-4760-8000-000000000021'
$env:PGPASSWORD = 'postgres'

function Invoke-Cpe476Psql {
  param([Parameter(Mandatory = $true)][string]$Sql)
  $result = $Sql | & psql -h 127.0.0.1 -p 55433 -U postgres -d $database -X -v ON_ERROR_STOP=1 -qAt -f -
  if ($LASTEXITCODE -ne 0) {
    throw "psql fallo con codigo $LASTEXITCODE"
  }
  return ($result | Out-String).Trim()
}

function Remove-Cpe476Fixture {
  Invoke-Cpe476Psql -Sql @"
BEGIN;
DELETE FROM public.ventas_pos WHERE id = '$posSaleId'::uuid;
DELETE FROM public.cpe WHERE tenant_id = '$tenantId'::uuid;
DELETE FROM public.documento_detalles WHERE tenant_id = '$tenantId'::uuid;
DELETE FROM public.documento_auditoria WHERE tenant_id = '$tenantId'::uuid;
DELETE FROM public.documento_archivos WHERE tenant_id = '$tenantId'::uuid;
DELETE FROM public.documentos WHERE tenant_id = '$tenantId'::uuid;
DELETE FROM public.outbox_events WHERE tenant_id = '$tenantId'::uuid;
DELETE FROM public.usuarios_sistema WHERE id = '$actorId'::uuid;
DELETE FROM public.tenants WHERE id = '$tenantId'::uuid;
COMMIT;
"@ | Out-Null
}

$actualDatabase = Invoke-Cpe476Psql -Sql 'SELECT current_database()'
if ($actualDatabase -ne $database) {
  throw "Guard de base fallo: $actualDatabase"
}
$deployment = Invoke-Cpe476Psql -Sql "SELECT environment || '|' || coalesce(project_ref, '') FROM app.deployment_environment WHERE singleton"
if ($deployment -ne 'UNCONFIGURED|') {
  throw "Guard de entorno local fallo: $deployment"
}

Remove-Cpe476Fixture
Invoke-Cpe476Psql -Sql @"
UPDATE app.deployment_environment
SET environment='PROD', project_ref='wypnbcptofqdmoynlonq', allow_demo_data=true,
    configured_at=now(), updated_at=now()
WHERE singleton;
"@ | Out-Null

try {
  Invoke-Cpe476Psql -Sql @"
BEGIN;
INSERT INTO public.tenants (id, codigo, nombre, pais, plan, activo, estado)
VALUES ('$tenantId', 'QA476', 'QA concurrencia CPE 476', 'PE', 'free', true, 'ACTIVO');

INSERT INTO public.usuarios_sistema (
  id, tenant_id, email, nombre, apellido, activo, estado, is_super_admin
) VALUES (
  '$actorId', '$tenantId', 'qa-cpe-476@local.invalid', 'QA', 'CPE476', true, 'ACTIVO', false
);

INSERT INTO public.documentos (
  id, tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
  moneda, subtotal, impuesto_igv, total, total_gravadas,
  emisor_ruc, emisor_razon_social, receptor_tipo_doc, receptor_numero_doc,
  receptor_documento, receptor_razon_social, receptor_nombre,
  estado, estado_sunat, created_by, updated_by, metadata
) VALUES (
  '$sendDocumentId', '$tenantId', 'FACTURA', 'F476C', '00000001', now(), now(),
  'PEN', 100, 18, 118, 100, '20600000476', 'Empresa QA 476', '6',
  '20123456789', '20123456789', 'Cliente QA 476', 'Cliente QA 476',
  'EMITIDO', 'PENDIENTE', '$actorId', '$actorId', '{"source":"qa.concurrent.476"}'::jsonb
);

INSERT INTO public.documento_detalles (
  tenant_id, documento_id, orden, codigo_producto, descripcion, unidad_medida,
  cantidad, precio_unitario, descuento_unitario, valor_venta,
  impuesto_igv, impuesto_isc, total_item
) VALUES (
  '$tenantId', '$sendDocumentId', 1, 'SEND476', 'Item SEND 476', 'NIU',
  1, 118, 0, 100, 18, 0, 118
);

INSERT INTO public.cpe (
  id, tenant_id, documento_id, tipo_documento, serie, numero, numero_comprobante,
  ruc_emisor, razon_social_emisor, tipo_documento_receptor, documento_receptor,
  razon_social_receptor, moneda, total_gravadas, total_igv, total_venta, total,
  items, fecha_emision, idempotency_key, estado, estado_sunat, sunat_status,
  hash, hash_firma, xml_firmado, created_by, activo
) VALUES (
  '$sendCpeId', '$tenantId', '$sendDocumentId', '01', 'F476C', '00000001', 1,
  '20600000476', 'Empresa QA 476', '6', '20123456789', 'Cliente QA 476', 'PEN',
  100, 18, 118, 118,
  '[{"codigo":"SEND476","descripcion":"Item SEND 476","cantidad":1,"unidad":"NIU","precio_unitario":118,"valor_venta":100,"igv":18,"precio_venta":118}]'::jsonb,
  now(), 'qa.seed.send.476', 'FIRMADO', 'PENDIENTE', 'READY',
  'HASH476', 'HASH476', '<Invoice>qa-send-476</Invoice>', '$actorId', true
);

INSERT INTO public.documentos (
  id, tenant_id, tipo_documento, serie, numero, fecha_emision, fecha_vencimiento,
  moneda, subtotal, impuesto_igv, total, total_gravadas,
  emisor_ruc, emisor_razon_social, receptor_tipo_doc, receptor_numero_doc,
  receptor_documento, receptor_razon_social, receptor_nombre,
  estado, estado_sunat, created_by, updated_by, metadata
) VALUES (
  '$posDocumentId', '$tenantId', 'BOLETA', 'B476C', '00000002', now(), now(),
  'PEN', 100, 18, 118, 100, '20600000476', 'Empresa QA 476', '1',
  '12345678', '12345678', 'Cliente POS QA', 'Cliente POS QA',
  'EMITIDO', 'PENDIENTE', '$actorId', '$actorId',
  jsonb_build_object('source', 'pos.atomic.451', 'venta_pos_id', '$posSaleId')
);

INSERT INTO public.ventas_pos (
  id, tenant_id, cliente_documento, cliente_nombre, usuario_id,
  subtotal, impuestos, total, moneda, estado, cpe_pendiente, cpe_data,
  documento_id, tipo_emision, idempotency_key, request_fingerprint,
  accounting_event_id, atomic_result, metadata
) VALUES (
  '$posSaleId', '$tenantId', '12345678', 'Cliente POS QA', '$actorId',
  100, 18, 118, 'PEN', 'PAGADA', true,
  jsonb_build_object(
    'tipo_documento', '03', 'serie', 'B476C', 'numero', 2,
    'idempotency_key', 'qa.pos.finalize.476', 'documento_id', '$posDocumentId',
    'venta_pos_id', '$posSaleId', 'ruc_emisor', '20600000476',
    'razon_social_emisor', 'Empresa QA 476', 'tipo_documento_receptor', '1',
    'documento_receptor', '12345678', 'razon_social_receptor', 'Cliente POS QA',
    'moneda', 'PEN', 'total_gravadas', 100, 'total_exoneradas', 0,
    'total_inafectas', 0, 'total_exportacion', 0, 'total_igv', 18,
    'total_venta', 118,
    'items', '[{"codigo":"POS476","descripcion":"Item POS 476","unidad":"NIU","cantidad":1,"precio_unitario":118,"descuento_unitario":0,"valor_venta":100,"igv":18,"total":118,"precio_venta":118,"afectacion_igv":"10"}]'::jsonb
  ),
  '$posDocumentId', 'FISCAL_INMEDIATO', 'qa.pos.sale.476', repeat('a', 64),
  gen_random_uuid(), '{"atomic":true}'::jsonb, '{"source":"pos.atomic.451"}'::jsonb
);
COMMIT;
"@ | Out-Null

  $sendSql = "SELECT public.reservar_envio_cpe_tx('$tenantId','$actorId','$sendCpeId','qa.send.race.476','WORKER')->>'claimed'"
  $sendJobs = 1..2 | ForEach-Object {
    Start-Job -ScriptBlock {
      param($db, $sql)
      $env:PGPASSWORD = 'postgres'
      ($sql | & psql -h 127.0.0.1 -p 55433 -U postgres -d $db -X -v ON_ERROR_STOP=1 -qAt -f - | Out-String).Trim()
      if ($LASTEXITCODE -ne 0) { throw "send psql fallo: $LASTEXITCODE" }
    } -ArgumentList $database, $sendSql
  }
  $sendJobs | Wait-Job | Out-Null
  $sendResults = @($sendJobs | Receive-Job)
  $sendJobs | Remove-Job
  $sendClaims = @($sendResults | Where-Object { $_ -eq 'true' -or $_ -eq 't' }).Count
  if ($sendClaims -ne 1) {
    throw "La carrera SEND produjo $sendClaims claims: $($sendResults -join ',')"
  }

  $posSql = @"
SELECT public.finalizar_cpe_pos_tx(
  '$tenantId','$actorId','$posSaleId',
  jsonb_build_object(
    'tipo_documento','03','serie','B476C','numero',2,
    'ruc_emisor','20600000476','razon_social_emisor','Empresa QA 476',
    'tipo_documento_receptor','1','documento_receptor','12345678',
    'razon_social_receptor','Cliente POS QA','moneda','PEN',
    'total_gravadas',100,'total_exoneradas',0,'total_inafectas',0,
    'total_exportacion',0,'total_igv',18,'total_venta',118,
    'items','[{"codigo":"POS476","descripcion":"Item POS 476","unidad":"NIU","cantidad":1,"precio_unitario":118,"descuento_unitario":0,"valor_venta":100,"igv":18,"total":118,"precio_venta":118,"afectacion_igv":"10"}]'::jsonb,
    'xml_firmado','<Invoice>qa-pos-476</Invoice>',
    'hash',upper(substr(encode(extensions.digest(convert_to('<Invoice>qa-pos-476</Invoice>','UTF8'),'sha256'),'hex'),1,32)),
    'hash_firma',upper(substr(encode(extensions.digest(convert_to('<Invoice>qa-pos-476</Invoice>','UTF8'),'sha256'),'hex'),1,32)),
    'fecha_emision',current_date,'fecha_vencimiento',current_date
  ),
  'qa.pos.finalize.476'
)->>'cpe_id'
"@
  $posJobs = 1..2 | ForEach-Object {
    Start-Job -ScriptBlock {
      param($db, $sql)
      $env:PGPASSWORD = 'postgres'
      ($sql | & psql -h 127.0.0.1 -p 55433 -U postgres -d $db -X -v ON_ERROR_STOP=1 -qAt -f - | Out-String).Trim()
      if ($LASTEXITCODE -ne 0) { throw "POS psql fallo: $LASTEXITCODE" }
    } -ArgumentList $database, $posSql
  }
  $posJobs | Wait-Job | Out-Null
  $posResults = @($posJobs | Receive-Job)
  $posJobs | Remove-Job
  if (@($posResults | Sort-Object -Unique).Count -ne 1) {
    throw "La carrera POS devolvio CPE distintos: $($posResults -join ',')"
  }

  $postconditions = Invoke-Cpe476Psql -Sql @"
SELECT jsonb_build_object(
  'send_claims', (SELECT count(*) FROM public.cpe_operaciones WHERE tenant_id='$tenantId' AND idempotency_key='qa.send.race.476' AND state='CLAIMED'),
  'pos_cpe_count', (SELECT count(*) FROM public.cpe WHERE tenant_id='$tenantId' AND idempotency_key='qa.pos.finalize.476'),
  'pos_linked', (SELECT cpe_id IS NOT NULL AND NOT cpe_pendiente FROM public.ventas_pos WHERE id='$posSaleId'),
  'pos_event_count', (SELECT count(*) FROM public.outbox_events WHERE tenant_id='$tenantId' AND event_type='comprobante.creado'),
  'pos_detail_count', (SELECT count(*) FROM public.documento_detalles WHERE documento_id='$posDocumentId')
)
"@
  $post = $postconditions | ConvertFrom-Json
  if ($post.send_claims -ne 1 -or $post.pos_cpe_count -ne 1 -or -not $post.pos_linked -or
      $post.pos_event_count -ne 1 -or $post.pos_detail_count -ne 1) {
    throw "Postcondiciones invalidas: $postconditions"
  }

  [pscustomobject]@{
    database = $database
    sendConnections = 2
    sendClaimed = $sendClaims
    simulatedExternalCalls = $sendClaims
    posConnections = 2
    posCpeIds = $posResults
    postconditions = $post
  } | ConvertTo-Json -Depth 5
}
finally {
  Remove-Cpe476Fixture
  Invoke-Cpe476Psql -Sql @"
UPDATE app.deployment_environment
SET environment='UNCONFIGURED', project_ref=NULL, allow_demo_data=false,
    configured_at=NULL, updated_at=now()
WHERE singleton;
"@ | Out-Null
}
