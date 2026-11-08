BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

-- Sólo cambia la fábrica PE. No hay DML sobre muestras ya creadas, renumeración
-- ni aceptación fiscal. Catálogo SUNAT01: factura01; el core conserva FACTURA.
DO $patch$
DECLARE
 v_definition text;
 v_old text := $old$  INSERT INTO public.cpe (
    id, tenant_id, documento_id, cliente_id, tipo_documento, serie, numero,
    numero_comprobante, estado, estado_sunat, sunat_status, fecha_emision,
    moneda, total_gravadas, total_igv, total_venta, total,
    ruc_emisor, razon_social_emisor, documento_receptor, razon_social_receptor,
    idempotency_key, activo, created_by, metadata
  ) VALUES (
    v_cpe, p_tenant_id, v_documento, v_cliente_empresa, 'FACTURA', 'F001', '00000001', 1,
    'ACEPTADO', 'ACEPTADO', 'accepted', now() - interval '1 day', 'PEN',
    152.37, 27.43, 179.80, 179.80, '20123456786', 'DEMO COMERCIAL S.A.C.',
    '20600000013', 'COMERCIAL ANDINA DEMO S.A.C.', 'demo-cpe-' || p_tenant_id,
    true, p_user_id, '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  );$old$;
 v_new text := $new$  -- canonical_demo_cpe_611: borrador fiscal codificado, sin evidencia.
  INSERT INTO public.cpe (
    id, tenant_id, documento_id, cliente_id, tipo_documento, serie, numero,
    numero_comprobante, estado, estado_sunat, sunat_status, fecha_emision,
    moneda, total_gravadas, total_igv, total_venta, total,
    ruc_emisor, razon_social_emisor, documento_receptor, razon_social_receptor,
    idempotency_key, activo, created_by, metadata
  ) VALUES (
    v_cpe, p_tenant_id, v_documento, v_cliente_empresa, '01', 'F001', '00000001', 1,
    'BORRADOR', 'PENDIENTE', 'NOT_SENT', now() - interval '1 day', 'PEN',
    152.37, 27.43, 179.80, 179.80, '20123456786', 'DEMO COMERCIAL S.A.C.',
    '20600000013', 'COMERCIAL ANDINA DEMO S.A.C.', 'demo-cpe-' || p_tenant_id,
    true, p_user_id, '{"source":"demo_business_seed_v1","simulated":true,"fiscal_evidence":"NONE","sunat_sent":false,"sample_kind":"COMMERCIAL_ONLY"}'::jsonb
  );$new$;
BEGIN
 v_definition:=pg_get_functiondef('app.hydrate_demo_business_sample_tx(uuid,uuid)'::regprocedure);
 -- Conservar el formato del cuerpo almacenado, incluso en cadenas Windows.
 IF strpos(v_definition,E'\r\n  INSERT INTO public.cpe (')>0 THEN
  v_old:=replace(v_old,E'\n',E'\r\n');v_new:=replace(v_new,E'\n',E'\r\n');
 END IF;
 IF strpos(v_definition,'canonical_demo_cpe_611')>0 THEN
  IF (length(v_definition)-length(replace(v_definition,v_new,'')))/length(v_new)<>1
   OR strpos(v_definition,v_old)>0 THEN
   RAISE EXCEPTION 'DEMO_611_PATCHED_DEFINITION_UNEXPECTED';
  END IF;
 ELSE
  IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
   RAISE EXCEPTION 'DEMO_611_SOURCE_DEFINITION_UNEXPECTED';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
 END IF;
END;
$patch$;
-- Sin GRANT/REVOKE ni nuevos objetos. Rollback: restaurar la definición completa
-- de la fábrica capturada en610, que incluye595; no reaplicar498 aisladamente.
-- El binario anterior debe preceder a una retirada del piso611 en producción.
COMMIT;
