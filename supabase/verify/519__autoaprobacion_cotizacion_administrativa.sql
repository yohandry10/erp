\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 519 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END;
$$;

DO $$
DECLARE
  v_proc oid := to_regprocedure(
    'public.cambiar_estado_cotizacion_tx(uuid,uuid,text,uuid,text)'
  );
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_admin_role_id uuid;
  v_admin_real_role_id uuid;
  v_vendedor_role_id uuid;
  v_permiso_aprobar_id uuid;
  v_cliente_id uuid;
  v_almacen_id uuid;
  v_producto_id uuid;
  v_cotizacion_admin_id uuid;
  v_cotizacion_admin_real_id uuid;
  v_cotizacion_sin_permiso_id uuid;
  v_cotizacion_vendedor_id uuid;
  v_cotizacion_rechazo_id uuid;
  v_detalle jsonb;
  v_failed boolean;
  v_seed_cpe_id uuid;
  v_seed_documento_id uuid;
  v_seed_asiento_id uuid;
  v_seed_costo numeric(14,2);
  v_seed_line_result jsonb;
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION 'No existe cambiar_estado_cotizacion_tx con la firma publica esperada';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = v_proc
      AND prosecdef
      AND provolatile = 'v'
      AND proconfig @> ARRAY['search_path=pg_catalog, public, app, pg_temp']
  ) THEN
    RAISE EXCEPTION 'El RPC no conserva SECURITY DEFINER, VOLATILE o search_path seguro';
  END IF;

  IF has_function_privilege('anon', v_proc, 'EXECUTE')
     OR has_function_privilege('authenticated', v_proc, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Los privilegios del RPC no están cerrados a service_role';
  END IF;

  UPDATE app.deployment_environment
  SET environment = 'PROD',
      project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true,
      configured_at = now(),
      updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant_ready_tx(
    'VERIFY COTIZACION ADMIN 519', 1, 'PE',
    'verify-519-ready-' || gen_random_uuid()::text,
    NULL, NULL, NULL, 'COMERCIO'
  )
  INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  SELECT c.id, c.documento_id
  INTO v_seed_cpe_id, v_seed_documento_id
  FROM public.cpe c
  WHERE c.tenant_id = v_tenant_id
    AND c.idempotency_key = 'demo-cpe-' || v_tenant_id::text
    AND c.metadata @> '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  LIMIT 1;
  IF v_seed_cpe_id IS NULL OR v_seed_documento_id IS NULL THEN
    RAISE EXCEPTION 'La demo perdió su muestra comercial histórica';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cpe c
    WHERE c.id = v_seed_cpe_id
      AND c.tenant_id = v_tenant_id
      AND (
        upper(c.estado::text) <> 'BORRADOR'
        OR upper(coalesce(c.estado_sunat::text, '')) <> 'PENDIENTE'
        OR upper(c.sunat_status::text) <> 'NOT_SENT'
        OR nullif(btrim(coalesce(c.xml_firmado, '')), '') IS NOT NULL
        OR nullif(btrim(coalesce(c.cdr_sunat, '')), '') IS NOT NULL
        OR nullif(btrim(coalesce(c.hash, '')), '') IS NOT NULL
        OR nullif(btrim(coalesce(c.hash_firma, '')), '') IS NOT NULL
        OR nullif(btrim(coalesce(c.hash_code, '')), '') IS NOT NULL
        OR c.fecha_envio IS NOT NULL
        OR c.metadata->>'fiscal_evidence' IS DISTINCT FROM 'NONE'
        OR lower(coalesce(c.metadata->>'sunat_sent', 'true')) <> 'false'
        OR c.metadata->>'sample_kind' IS DISTINCT FROM 'COMMERCIAL_ONLY'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.documentos d
    WHERE d.id = v_seed_documento_id
      AND d.tenant_id = v_tenant_id
      AND (
        upper(d.estado::text) <> 'EMITIDO'
        OR upper(coalesce(d.estado_sunat::text, '')) <> 'PENDIENTE'
        OR nullif(btrim(coalesce(d.xml_content, '')), '') IS NOT NULL
        OR d.cdr_content IS NOT NULL
        OR nullif(btrim(coalesce(d.codigo_hash, '')), '') IS NOT NULL
        OR d.metadata->>'fiscal_evidence' IS DISTINCT FROM 'NONE'
        OR lower(coalesce(d.metadata->>'sunat_sent', 'true')) <> 'false'
        OR d.metadata->>'sample_kind' IS DISTINCT FROM 'COMMERCIAL_ONLY'
      )
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.comprobantes_electronicos ce
    WHERE ce.id = v_seed_cpe_id
      AND ce.tenant_id = v_tenant_id
      AND upper(ce.estado::text) = 'BORRADOR'
  ) THEN
    RAISE EXCEPTION 'La muestra comercial demo fabricó estado o evidencia fiscal';
  END IF;

  -- El alta ejecutada después de 519 debe salir lista para visualizarse: una
  -- línea fiscal canónica (base neta + IGV) y el precio unitario de venta que
  -- el usuario reconoce en el catálogo (2 x S/ 89,90 = S/ 179,80).
  IF jsonb_array_length(coalesce(
       (SELECT c.items FROM public.cpe c
        WHERE c.id = v_seed_cpe_id AND c.tenant_id = v_tenant_id),
       '[]'::jsonb
     )) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.cpe c
       CROSS JOIN LATERAL jsonb_array_elements(c.items) item
       WHERE c.id = v_seed_cpe_id
         AND c.tenant_id = v_tenant_id
         AND item->>'codigo' = 'DEMO-004'
         AND item->>'descripcion' = 'Audífonos Bluetooth'
         AND item->>'unidad' = 'NIU'
         AND (item->>'cantidad')::numeric = 2
         AND (item->>'precio_unitario')::numeric = 76.185
         AND (item->>'precio_venta')::numeric = 89.90
         AND (item->>'valor_venta')::numeric = 152.37
         AND (item->>'igv')::numeric = 27.43
         AND (item->>'total')::numeric = 179.80
         AND item->>'afectacion_igv' = '10'
     )
     OR (SELECT count(*) FROM public.documento_detalles dd
         WHERE dd.tenant_id = v_tenant_id
           AND dd.documento_id = v_seed_documento_id) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.documento_detalles dd
       JOIN public.productos p
         ON p.id = dd.producto_id
        AND p.tenant_id = dd.tenant_id
       WHERE dd.tenant_id = v_tenant_id
         AND dd.documento_id = v_seed_documento_id
         AND dd.orden = 1
         AND p.codigo = 'DEMO-004'
         AND dd.codigo_producto = 'DEMO-004'
         AND dd.descripcion = 'Audífonos Bluetooth'
         AND dd.unidad_medida = 'NIU'
         AND dd.cantidad = 2
         AND dd.precio_unitario = 76.185
         AND dd.valor_venta = 152.37
         AND dd.impuesto_igv = 27.43
         AND dd.impuesto_isc = 0
         AND dd.total_item = 179.80
         AND dd.metadata @> '{"source":"demo_business_seed_v1","sample_kind":"COMMERCIAL_ONLY","line_contract":"519"}'::jsonb
     ) THEN
    RAISE EXCEPTION 'VERIFY_519_DEMO_CPE_LINES_NOT_READY_ON_CREATE';
  END IF;

  -- Simula una demo creada antes de 519 y comprueba tanto el backfill como su
  -- segunda pasada idempotente. Todo queda dentro de la transacción efímera.
  UPDATE public.cpe
  SET items = '[]'::jsonb
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  DELETE FROM public.documento_detalles
  WHERE documento_id = v_seed_documento_id AND tenant_id = v_tenant_id;

  SELECT app.normalize_legacy_demo_seed_519() INTO v_seed_line_result;
  IF coalesce((v_seed_line_result->>'cpe_line_sets_repaired')::integer, 0) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_519_LEGACY_DEMO_LINES_NOT_REPAIRED:%', v_seed_line_result;
  END IF;
  SELECT app.normalize_legacy_demo_seed_519() INTO v_seed_line_result;
  IF coalesce((v_seed_line_result->>'cpe_line_sets_repaired')::integer, -1) <> 0
     OR (SELECT count(*) FROM public.documento_detalles dd
         WHERE dd.tenant_id = v_tenant_id
           AND dd.documento_id = v_seed_documento_id) <> 1
     OR jsonb_array_length((SELECT c.items FROM public.cpe c
                            WHERE c.id = v_seed_cpe_id
                              AND c.tenant_id = v_tenant_id)) <> 1 THEN
    RAISE EXCEPTION 'VERIFY_519_DEMO_CPE_LINES_NOT_IDEMPOTENT:%', v_seed_line_result;
  END IF;

  -- El writer contable canónico sigue siendo el de 422; 519 corrige únicamente
  -- cómo encuentra el POS sembrado por 498. Dos pasadas deben conservar cinco
  -- líneas, no crear una segunda variante del asiento.
  PERFORM app.ensure_demo_operational_accounting(v_tenant_id);
  PERFORM app.ensure_demo_operational_accounting(v_tenant_id);
  SELECT round(coalesce(sum(coalesce(
           nullif(mi.metadata->>'valor_total', '')::numeric,
           mi.cantidad * coalesce(nullif(mi.metadata->>'costo_unitario', '')::numeric, 0)
         )), 0), 2)
  INTO v_seed_costo
  FROM public.movimientos_inventario mi
  WHERE mi.tenant_id = v_tenant_id
    AND upper(mi.referencia_tipo) = 'CPE'
    AND mi.referencia_id = v_seed_cpe_id
    AND upper(mi.tipo::text) = 'SALIDA';

  SELECT a.id INTO v_seed_asiento_id
  FROM public.asientos_contables a
  WHERE a.tenant_id = v_tenant_id
    AND a.metadata->>'source' = 'demo_business_seed_v1'
    AND upper(a.tipo_asiento::text) = 'VENTA'
    AND a.metadata->>'accounting_contract' = 'runtime-sale-v1'
  ORDER BY a.created_at, a.id
  LIMIT 1;

  IF v_seed_asiento_id IS NULL
     OR v_seed_costo <= 0
     OR (SELECT count(*) FROM public.detalle_asientos da
         WHERE da.tenant_id = v_tenant_id
           AND da.asiento_id = v_seed_asiento_id) <> 5
     OR (SELECT coalesce(sum(da.debe), 0)
         FROM public.detalle_asientos da
         JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id AND pc.tenant_id = da.tenant_id
         WHERE da.tenant_id = v_tenant_id AND da.asiento_id = v_seed_asiento_id
           AND pc.codigo = '12') <> 179.80
     OR (SELECT coalesce(sum(da.debe), 0)
         FROM public.detalle_asientos da
         JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id AND pc.tenant_id = da.tenant_id
         WHERE da.tenant_id = v_tenant_id AND da.asiento_id = v_seed_asiento_id
           AND pc.codigo = '69') <> v_seed_costo
     OR (SELECT coalesce(sum(da.haber), 0)
         FROM public.detalle_asientos da
         JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id AND pc.tenant_id = da.tenant_id
         WHERE da.tenant_id = v_tenant_id AND da.asiento_id = v_seed_asiento_id
           AND pc.codigo = '70') <> 152.37
     OR (SELECT coalesce(sum(da.haber), 0)
         FROM public.detalle_asientos da
         JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id AND pc.tenant_id = da.tenant_id
         WHERE da.tenant_id = v_tenant_id AND da.asiento_id = v_seed_asiento_id
           AND pc.codigo = '40') <> 27.43
     OR (SELECT coalesce(sum(da.haber), 0)
         FROM public.detalle_asientos da
         JOIN public.plan_cuentas pc ON pc.id = da.cuenta_id AND pc.tenant_id = da.tenant_id
         WHERE da.tenant_id = v_tenant_id AND da.asiento_id = v_seed_asiento_id
           AND pc.codigo = '20') <> v_seed_costo
     OR NOT EXISTS (
       SELECT 1 FROM public.asientos_contables a
       WHERE a.id = v_seed_asiento_id
         AND a.tenant_id = v_tenant_id
         AND a.total_debe = round(179.80 + v_seed_costo, 2)
         AND a.total_haber = round(179.80 + v_seed_costo, 2)
     ) THEN
    RAISE EXCEPTION 'VERIFY_519_DEMO_CPE_ACCOUNTING_NOT_RECONCILED costo=% asiento=%',
      v_seed_costo, v_seed_asiento_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ventas v
    WHERE v.tenant_id = v_tenant_id
      AND v.idempotency_key = 'demo-venta-' || v_tenant_id::text
      AND upper(v.estado::text) = 'EMITIDA'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cuentas_por_cobrar cxc
    WHERE cxc.tenant_id = v_tenant_id
      AND cxc.documento_id = v_seed_documento_id
      AND cxc.idempotency_key = 'demo-cxc-' || v_tenant_id::text
      AND upper(cxc.estado::text) = 'PENDIENTE'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.asientos_contables ac
    WHERE ac.tenant_id = v_tenant_id
      AND ac.id = v_seed_asiento_id
      AND upper(ac.origen) = 'CPE'
      AND upper(ac.estado::text) = 'CONFIRMADO'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.movimientos_inventario mi
    WHERE mi.tenant_id = v_tenant_id
      AND upper(mi.referencia_tipo) = 'CPE'
      AND mi.referencia_id = v_seed_cpe_id
      AND mi.cantidad = 2
      AND mi.notas = 'Salida comercial del ejemplo histórico demo (sin envío fiscal)'
  ) THEN
    RAISE EXCEPTION 'La normalización fiscal alteró efectos comerciales de la muestra demo';
  END IF;

  -- Reproduce el UPDATE histórico con el mismo agregado en tres estados:
  -- candidato seguro, documento con evidencia y CPE con operación fiscal.
  -- Los triggers sólo se suspenden dentro de esta base efímera y transacción.
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.documentos
  SET estado = 'EMITIDO', estado_sunat = 'ACEPTADO',
      xml_content = NULL, cdr_content = NULL, codigo_hash = NULL, error_sunat = NULL,
      metadata = '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  WHERE id = v_seed_documento_id AND tenant_id = v_tenant_id;
  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', sunat_status = 'ACCEPTED',
      xml_firmado = NULL, cdr_sunat = NULL, hash = NULL, hash_firma = NULL,
      hash_code = NULL, fecha_envio = NULL,
      numero_comprobante_sunat = NULL, error_message = NULL,
      retry_count = 0, next_retry_at = NULL,
      metadata = '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  UPDATE public.comprobantes_electronicos
  SET estado = 'ACEPTADO'
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM app.normalize_legacy_demo_seed_519();
  IF EXISTS (
    SELECT 1 FROM public.cpe c
    WHERE c.id = v_seed_cpe_id
      AND (upper(c.estado::text) <> 'BORRADOR' OR upper(c.sunat_status::text) <> 'NOT_SENT')
  ) OR EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.id = v_seed_documento_id
      AND upper(coalesce(d.estado_sunat::text, '')) <> 'PENDIENTE'
  ) OR EXISTS (
    SELECT 1 FROM public.comprobantes_electronicos ce
    WHERE ce.id = v_seed_cpe_id AND upper(ce.estado::text) <> 'BORRADOR'
  ) THEN
    RAISE EXCEPTION 'VERIFY_519_BACKFILL_SAFE_CANDIDATE_NOT_NORMALIZED';
  END IF;

  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.documentos
  SET estado = 'EMITIDO', estado_sunat = 'ACEPTADO',
      xml_content = '<Invoice>evidencia-real</Invoice>',
      cdr_content = NULL, codigo_hash = NULL, error_sunat = NULL,
      metadata = '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  WHERE id = v_seed_documento_id AND tenant_id = v_tenant_id;
  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', sunat_status = 'ACCEPTED',
      xml_firmado = NULL, cdr_sunat = NULL, hash = NULL, hash_firma = NULL,
      hash_code = NULL, fecha_envio = NULL,
      numero_comprobante_sunat = NULL, error_message = NULL,
      retry_count = 0, next_retry_at = NULL,
      metadata = '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM app.normalize_legacy_demo_seed_519();
  IF NOT EXISTS (
    SELECT 1
    FROM public.cpe c
    JOIN public.documentos d
      ON d.id = c.documento_id AND d.tenant_id = c.tenant_id
    WHERE c.id = v_seed_cpe_id
      AND upper(c.estado::text) = 'ACEPTADO'
      AND upper(c.sunat_status::text) = 'ACCEPTED'
      AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
      AND d.xml_content = '<Invoice>evidencia-real</Invoice>'
  ) THEN
    RAISE EXCEPTION 'VERIFY_519_BACKFILL_OVERWROTE_DOCUMENT_EVIDENCE';
  END IF;

  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.documentos
  SET xml_content = NULL,
      metadata = '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  WHERE id = v_seed_documento_id AND tenant_id = v_tenant_id;
  UPDATE public.cpe
  SET hash_code = 'HASH-FISCAL-LEGADO', fecha_envio = now()
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM app.normalize_legacy_demo_seed_519();
  IF NOT EXISTS (
    SELECT 1
    FROM public.cpe c
    JOIN public.documentos d
      ON d.id = c.documento_id AND d.tenant_id = c.tenant_id
    WHERE c.id = v_seed_cpe_id
      AND upper(c.estado::text) = 'ACEPTADO'
      AND upper(c.sunat_status::text) = 'ACCEPTED'
      AND c.hash_code = 'HASH-FISCAL-LEGADO'
      AND c.fecha_envio IS NOT NULL
      AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_519_BACKFILL_OVERWROTE_LEGACY_CPE_EVIDENCE';
  END IF;

  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.cpe
  SET hash_code = NULL, fecha_envio = NULL,
      metadata = '{"source":"demo_business_seed_v1","simulated":true,"signed_xml_sha256":"HASH-METADATA-REAL"}'::jsonb
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM app.normalize_legacy_demo_seed_519();
  IF NOT EXISTS (
    SELECT 1
    FROM public.cpe c
    JOIN public.documentos d
      ON d.id = c.documento_id AND d.tenant_id = c.tenant_id
    WHERE c.id = v_seed_cpe_id
      AND upper(c.estado::text) = 'ACEPTADO'
      AND upper(c.sunat_status::text) = 'ACCEPTED'
      AND c.metadata->>'signed_xml_sha256' = 'HASH-METADATA-REAL'
      AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_519_BACKFILL_OVERWROTE_CPE_METADATA_EVIDENCE';
  END IF;

  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.cpe
  SET metadata = '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  PERFORM set_config('session_replication_role', 'origin', true);
  INSERT INTO public.cpe_operaciones (
    tenant_id, cpe_id, action, idempotency_key, request_fingerprint,
    state, origin, result_kind, response_code
  ) VALUES (
    v_tenant_id, v_seed_cpe_id, 'SEND', 'verify-519-operation-evidence', repeat('0', 64),
    'COMPLETED', 'SYSTEM', 'TECHNICAL_ERROR', 'VERIFY'
  );

  PERFORM app.normalize_legacy_demo_seed_519();
  IF NOT EXISTS (
    SELECT 1
    FROM public.cpe c
    JOIN public.documentos d
      ON d.id = c.documento_id AND d.tenant_id = c.tenant_id
    WHERE c.id = v_seed_cpe_id
      AND upper(c.estado::text) = 'ACEPTADO'
      AND upper(c.sunat_status::text) = 'ACCEPTED'
      AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_519_BACKFILL_OVERWROTE_OPERATION_EVIDENCE';
  END IF;

  DELETE FROM public.cpe_operaciones
  WHERE tenant_id = v_tenant_id AND cpe_id = v_seed_cpe_id
    AND idempotency_key = 'verify-519-operation-evidence';

  -- Una solicitud de anulación ya es actividad real del usuario aunque el CPE
  -- original siga en el triple estado histórico ACEPTADO y aún no tenga CDR.
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.documentos
  SET estado = 'EMITIDO', estado_sunat = 'ACEPTADO',
      xml_content = NULL, cdr_content = NULL, codigo_hash = NULL, error_sunat = NULL,
      metadata = '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  WHERE id = v_seed_documento_id AND tenant_id = v_tenant_id;
  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO', sunat_status = 'ACCEPTED',
      xml_firmado = NULL, cdr_sunat = NULL, hash = NULL, hash_firma = NULL,
      hash_code = NULL, fecha_envio = NULL,
      numero_comprobante_sunat = NULL, error_message = NULL,
      retry_count = 0, next_retry_at = NULL,
      motivo_anulacion = 'Cliente solicitó anulación',
      metadata = '{"source":"demo_business_seed_v1","simulated":true,"cancellation_request_key":"verify-519-cancel","cancellation_requested_at":"2026-08-25T12:00:00Z"}'::jsonb
  WHERE id = v_seed_cpe_id AND tenant_id = v_tenant_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  PERFORM app.normalize_legacy_demo_seed_519();
  IF NOT EXISTS (
    SELECT 1
    FROM public.cpe c
    JOIN public.documentos d
      ON d.id = c.documento_id AND d.tenant_id = c.tenant_id
    WHERE c.id = v_seed_cpe_id
      AND upper(c.estado::text) = 'ACEPTADO'
      AND upper(c.sunat_status::text) = 'ACCEPTED'
      AND c.motivo_anulacion = 'Cliente solicitó anulación'
      AND c.metadata->>'cancellation_request_key' = 'verify-519-cancel'
      AND upper(coalesce(d.estado_sunat::text, '')) = 'ACEPTADO'
  ) THEN
    RAISE EXCEPTION 'VERIFY_519_BACKFILL_OVERWROTE_CANCELLATION_REQUEST';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.actualizar_empresa_config_tx(
      v_tenant_id,
      v_user_id,
      'verify-519-demo-ruc-immutable',
      'EMPRESA',
      jsonb_build_object('ruc', '20600000013')
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'DEMO_FISCAL_IDENTITY_IMMUTABLE' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'VERIFY_519_ACEPTO_CAMBIO_RUC_DEMO';
  END IF;
  IF (SELECT ruc FROM public.empresa_config WHERE tenant_id = v_tenant_id)
     IS DISTINCT FROM '20123456786' THEN
    RAISE EXCEPTION 'El RUC canónico de la demo cambió tras el rechazo';
  END IF;

  SELECT r.id INTO v_admin_role_id
  FROM public.roles r
  WHERE r.tenant_id = v_tenant_id
    AND upper(btrim(r.nombre)) = 'ADMIN_DEMO'
    AND coalesce(r.is_system_role, false)
    AND coalesce(r.activo, true)
  LIMIT 1;

  SELECT r.id INTO v_vendedor_role_id
  FROM public.roles r
  WHERE r.tenant_id = v_tenant_id
    AND upper(btrim(r.nombre)) = 'VENDEDOR'
    AND coalesce(r.is_system_role, false)
    AND coalesce(r.activo, true)
  LIMIT 1;

  SELECT r.id INTO v_admin_real_role_id
  FROM public.roles r
  WHERE r.tenant_id = v_tenant_id
    AND upper(btrim(r.nombre)) = 'ADMIN'
    AND coalesce(r.is_system_role, false)
    AND coalesce(r.activo, true)
  LIMIT 1;

  SELECT p.id INTO v_permiso_aprobar_id
  FROM public.permisos p
  WHERE p.tenant_id = v_tenant_id
    AND lower(coalesce(
      nullif(btrim(p.codigo), ''),
      p.modulo || '.' || p.recurso || '.' || p.accion
    )) = 'ventas.cotizaciones.approve'
    AND coalesce(p.activo, true)
  LIMIT 1;

  IF v_admin_role_id IS NULL OR v_admin_real_role_id IS NULL
     OR v_vendedor_role_id IS NULL
     OR v_permiso_aprobar_id IS NULL THEN
    RAISE EXCEPTION 'La demo no sembró los roles o el permiso canónico de aprobación';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    WHERE rp.role_id = v_admin_role_id
      AND rp.permiso_id = v_permiso_aprobar_id
      AND coalesce(rp.concedido, false)
  ) THEN
    RAISE EXCEPTION 'ADMIN_DEMO no recibió el permiso explícito de aprobación';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rol_permisos rp
    WHERE rp.role_id = v_admin_real_role_id
      AND rp.permiso_id = v_permiso_aprobar_id
      AND coalesce(rp.concedido, false)
  ) THEN
    RAISE EXCEPTION 'ADMIN no recibió el permiso explícito de aprobación';
  END IF;

  -- Deja una sola membresía controlada para que ninguna asignación heredada
  -- convierta la prueba de permiso o de rol en un falso positivo.
  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_role_id, v_tenant_id
  );

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-VERIFY-519', 'Cliente Verify 519',
    'Cliente Verify 519', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-VERIFY-519', 'Almacén Verify 519',
    'ACTIVO', true, false, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-VERIFY-519',
      'nombre', 'Producto Verify 519',
      'categoria', 'VERIFICACION',
      'precio_venta', 25,
      'precio_compra', 10,
      'afectacion_igv', '10'
    ),
    v_almacen_id,
    10,
    0,
    '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;

  v_detalle := jsonb_build_array(jsonb_build_object(
    'producto_id', v_producto_id,
    'descripcion', 'Producto Verify 519',
    'cantidad', 1,
    'precio_unitario', 25,
    'orden', 1
  ));

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 519', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_admin_id;

  PERFORM public.cambiar_estado_cotizacion_tx(
    v_cotizacion_admin_id, v_tenant_id, 'APROBADA', v_user_id, NULL
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.cotizaciones c
    WHERE c.id = v_cotizacion_admin_id
      AND c.tenant_id = v_tenant_id
      AND upper(c.estado::text) = 'APROBADA'
      AND c.aprobado_por = v_user_id
      AND c.fecha_aprobacion IS NOT NULL
      AND c.observaciones_aprobacion = 'Autoaprobación administrativa'
  ) THEN
    RAISE EXCEPTION 'La autoaprobación administrativa no quedó trazada por completo';
  END IF;

  -- La misma excepción aplica al ADMIN canónico de tenants reales, conservando
  -- exactamente el motivo escrito por el actor cuando sí lo proporciona.
  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_real_role_id, v_tenant_id
  );

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 519', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_admin_real_id;

  PERFORM public.cambiar_estado_cotizacion_tx(
    v_cotizacion_admin_real_id, v_tenant_id, 'APROBADA', v_user_id,
    'Aprobación directa del administrador'
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.cotizaciones c
    WHERE c.id = v_cotizacion_admin_real_id
      AND c.tenant_id = v_tenant_id
      AND upper(c.estado::text) = 'APROBADA'
      AND c.aprobado_por = v_user_id
      AND c.fecha_aprobacion IS NOT NULL
      AND c.observaciones_aprobacion = 'Aprobación directa del administrador'
  ) THEN
    RAISE EXCEPTION 'La autoaprobación del ADMIN canónico no conservó su motivo';
  END IF;

  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_role_id, v_tenant_id
  );

  -- El nombre del rol no basta: sin concesión explícita, el administrador debe
  -- volver a requerir un segundo aprobador.
  UPDATE public.rol_permisos
  SET concedido = false
  WHERE role_id = v_admin_role_id
    AND permiso_id = v_permiso_aprobar_id;

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 519', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_sin_permiso_id;

  BEGIN
    PERFORM public.cambiar_estado_cotizacion_tx(
      v_cotizacion_sin_permiso_id, v_tenant_id, 'APROBADA', v_user_id, NULL
    );
    RAISE EXCEPTION 'VERIFY_519_ACEPTO_ADMIN_SIN_PERMISO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_519_ACEPTO_ADMIN_SIN_PERMISO' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'La cotización requiere un aprobador distinto del creador' THEN
      RAISE EXCEPTION 'Error inesperado para ADMIN sin permiso: %', SQLERRM;
    END IF;
  END;

  IF (SELECT upper(estado::text) FROM public.cotizaciones
      WHERE id = v_cotizacion_sin_permiso_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'La cotización del ADMIN sin permiso cambió de estado';
  END IF;

  UPDATE public.rol_permisos
  SET concedido = true
  WHERE role_id = v_admin_role_id
    AND permiso_id = v_permiso_aprobar_id;

  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_vendedor_role_id, v_tenant_id
  );

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Vendedor Verify 519', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_vendedor_id;

  BEGIN
    PERFORM public.cambiar_estado_cotizacion_tx(
      v_cotizacion_vendedor_id, v_tenant_id, 'APROBADA', v_user_id, NULL
    );
    RAISE EXCEPTION 'VERIFY_519_ACEPTO_VENDEDOR';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_519_ACEPTO_VENDEDOR' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'La cotización requiere un aprobador distinto del creador' THEN
      RAISE EXCEPTION 'Error inesperado para VENDEDOR autocreador: %', SQLERRM;
    END IF;
  END;

  IF (SELECT upper(estado::text) FROM public.cotizaciones
      WHERE id = v_cotizacion_vendedor_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'La cotización del VENDEDOR cambió pese al rechazo';
  END IF;

  DELETE FROM public.user_roles
  WHERE tenant_id = v_tenant_id
    AND usuario_sistema_id = v_user_id;
  INSERT INTO public.user_roles (
    usuario_sistema_id, role_id, tenant_id
  ) VALUES (
    v_user_id, v_admin_role_id, v_tenant_id
  );

  SELECT (public.crear_cotizacion_tx(
    v_tenant_id, v_user_id, v_cliente_id, app.hoy_tenant(v_tenant_id) + 7,
    NULL, 'Administrador Verify 519', 'PEN', 25, 4.50, 29.50, v_detalle
  )->'cotizacion'->>'id')::uuid INTO v_cotizacion_rechazo_id;

  BEGIN
    PERFORM public.cambiar_estado_cotizacion_tx(
      v_cotizacion_rechazo_id, v_tenant_id, 'RECHAZADA', v_user_id, NULL
    );
    RAISE EXCEPTION 'VERIFY_519_ACEPTO_AUTORRECHAZO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'VERIFY_519_ACEPTO_AUTORRECHAZO' THEN
      RAISE;
    END IF;
    IF SQLERRM <> 'El creador no puede rechazar su propia cotización' THEN
      RAISE EXCEPTION 'Error inesperado para autorrechazo ADMIN: %', SQLERRM;
    END IF;
  END;

  IF (SELECT upper(estado::text) FROM public.cotizaciones
      WHERE id = v_cotizacion_rechazo_id) <> 'BORRADOR' THEN
    RAISE EXCEPTION 'La cotización cambió pese a prohibir el autorrechazo';
  END IF;
END;
$$;

ROLLBACK;
