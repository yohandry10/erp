\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 461 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.verify_461_fail_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.verify_461_fail_audit', true) = 'on' THEN
    RAISE EXCEPTION 'VERIFY_461_LATE_AUDIT_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_461_fail_audit ON public.documento_auditoria;
CREATE TRIGGER trg_verify_461_fail_audit
BEFORE INSERT ON public.documento_auditoria
FOR EACH ROW EXECUTE FUNCTION app.verify_461_fail_audit();

DO $$
DECLARE
  v_demo jsonb;
  v_tenant_id uuid;
  v_user_id uuid;
  v_other_actor uuid := gen_random_uuid();
  v_cliente_id uuid;
  v_serie_id uuid;
  v_result jsonb;
  v_retry jsonb;
  v_documento_id uuid;
  v_boleta_id uuid;
  v_contrato_id uuid;
  v_cpe_id uuid;
  v_boleta_cpe_id uuid;
  v_ra_id uuid;
  v_rc_id uuid;
  v_send_token uuid;
  v_items jsonb;
  v_cpe jsonb;
  v_detalles jsonb;
  v_outbox_before integer;
  v_cxc_before integer;
  v_failed boolean;
BEGIN
  UPDATE app.deployment_environment
  SET environment = 'PROD', project_ref = 'wypnbcptofqdmoynlonq',
      allow_demo_data = true, configured_at = now(), updated_at = now()
  WHERE singleton = true;

  SELECT public.create_demo_tenant('VERIFY DOCUMENT CENTER 461', 1, 'PE') INTO v_demo;
  v_tenant_id := (v_demo->>'tenant_id')::uuid;
  v_user_id := (v_demo->>'user_id')::uuid;

  UPDATE public.empresa_config
  SET pais = 'PE', ruc = '20600000461', razon_social = 'Empresa Verify 461',
      direccion_fiscal = 'Lima', igv_porcentaje = 18,
      serie_factura = 'F461', serie_boleta = 'B461'
  WHERE tenant_id = v_tenant_id;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-461', 'Cliente Verify 461',
    'Cliente Verify 461', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  -- Alta de series: una sola frontera, retry estable, fingerprint y auditoría.
  v_result := public.crear_serie_documento_tx(
    v_tenant_id, v_user_id, 'FACTURA', 'F9A1', 9999,
    'verify-461-create-series'
  );
  v_serie_id := (v_result->'serie'->>'id')::uuid;
  v_retry := public.crear_serie_documento_tx(
    v_tenant_id, v_user_id, 'FACTURA', 'F9A1', 9999,
    'verify-461-create-series'
  );
  IF NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->'serie'->>'id')::uuid IS DISTINCT FROM v_serie_id
     OR (SELECT count(*) FROM public.documento_series
         WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-461-create-series') <> 1
     OR (SELECT count(*) FROM public.audit_log
         WHERE tenant_id = v_tenant_id AND table_name = 'documento_series'
           AND record_id = v_serie_id::text) <> 1 THEN
    RAISE EXCEPTION 'El alta/retry/auditoría de serie no fue atómico: %, %', v_result, v_retry;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_serie_documento_tx(
      v_tenant_id, v_user_id, 'FACTURA', 'F9A1', 10000,
      'verify-461-create-series'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'La serie aceptó la misma key con otro fingerprint'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_serie_documento_tx(
      v_tenant_id, v_user_id, 'FACTURA', 'F9A1', 9999,
      'verify-461-create-series-second-key'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed OR (SELECT count(*) FROM public.documento_series
      WHERE tenant_id = v_tenant_id AND upper(tipo_documento) = 'FACTURA'
        AND upper(serie) = 'F9A1') <> 1 THEN
    RAISE EXCEPTION 'Dos keys distintas dieron de alta la misma serie lógica';
  END IF;
  PERFORM public.crear_serie_documento_tx(
    v_tenant_id, v_user_id, 'FACTURA', 'F461', 99999999,
    'verify-461-series-invoice'
  );
  PERFORM public.crear_serie_documento_tx(
    v_tenant_id, v_user_id, 'BOLETA', 'B461', 99999999,
    'verify-461-series-receipt'
  );
  PERFORM public.crear_serie_documento_tx(
    v_tenant_id, v_user_id, 'CONTRATO', 'C461', 99999999,
    'verify-461-series-contract'
  );

  -- Documentos.create no puede auto-crear una serie saltándose series.write.
  v_failed := false;
  BEGIN
    PERFORM public.crear_documento_manual_tx(
      v_tenant_id, v_user_id,
      jsonb_build_object(
        'tipo_documento', 'FACTURA', 'serie', 'F404',
        'receptor_tipo_doc', 'RUC', 'receptor_numero_doc', '20123456786',
        'receptor_razon_social', 'Serie inexistente',
        'fecha_emision', app.hoy_tenant(v_tenant_id), 'moneda', 'PEN'
      ),
      jsonb_build_array(jsonb_build_object(
        'descripcion', 'No debe persistir', 'unidad_medida', 'ZZ',
        'cantidad', 1, 'precio_unitario', 1
      )),
      'verify-461-unconfigured-series'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed
     OR EXISTS (SELECT 1 FROM public.documento_series
                WHERE tenant_id = v_tenant_id AND serie = 'F404')
     OR EXISTS (SELECT 1 FROM public.documentos
                WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-461-unconfigured-series') THEN
    RAISE EXCEPTION 'documentos.create auto-creó o usó una serie no configurada';
  END IF;

  -- Un fallo al final de la auditoría revierte cabecera, detalle y correlativo.
  PERFORM set_config('app.verify_461_fail_audit', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.crear_documento_manual_tx(
      v_tenant_id,
      v_user_id,
      jsonb_build_object(
        'tipo_documento', 'FACTURA', 'serie', 'F461',
        'cliente_id', v_cliente_id, 'receptor_tipo_doc', 'RUC',
        'receptor_numero_doc', '20123456786',
        'receptor_razon_social', 'Cliente Verify 461',
        'fecha_emision', app.hoy_tenant(v_tenant_id), 'moneda', 'PEN',
        'condicion_pago', 'CONTADO'
      ),
      jsonb_build_array(jsonb_build_object(
        'codigo_producto', 'SERV-461', 'descripcion', 'Servicio atómico',
        'unidad_medida', 'ZZ', 'cantidad', 2, 'precio_unitario', 100,
        'descuento_unitario', 10, 'afectacion_igv', '10'
      )),
      'verify-461-late-failure'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM LIKE '%VERIFY_461_LATE_AUDIT_FAILURE%';
  END;
  PERFORM set_config('app.verify_461_fail_audit', 'off', true);
  IF NOT v_failed OR EXISTS (
    SELECT 1 FROM public.documentos
    WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-461-late-failure'
  ) OR EXISTS (
    SELECT 1 FROM public.documento_auditoria
    WHERE tenant_id = v_tenant_id
      AND metadata->>'idempotency_key' = 'verify-461-late-failure'
  ) THEN
    RAISE EXCEPTION 'El fallo tardío dejó una proyección parcial del documento manual';
  END IF;

  v_result := public.crear_documento_manual_tx(
    v_tenant_id,
    v_user_id,
    jsonb_build_object(
      'tipo_documento', 'FACTURA', 'serie', 'F461',
      'cliente_id', v_cliente_id, 'receptor_tipo_doc', 'RUC',
      'receptor_numero_doc', '20123456786',
      'receptor_razon_social', 'Cliente Verify 461',
      'receptor_direccion', 'Lima', 'fecha_emision', app.hoy_tenant(v_tenant_id),
      'fecha_vencimiento', app.hoy_tenant(v_tenant_id) + 30, 'moneda', 'PEN',
      'condicion_pago', 'CONTADO'
    ),
    jsonb_build_array(jsonb_build_object(
      'codigo_producto', 'SERV-461', 'descripcion', 'Servicio atómico',
      'unidad_medida', 'ZZ', 'cantidad', 2, 'precio_unitario', 100,
      'descuento_unitario', 10, 'afectacion_igv', '10'
    )),
    'verify-461-create-invoice'
  );
  v_documento_id := (v_result->'documento'->>'id')::uuid;
  IF v_documento_id IS NULL
     OR v_result->'documento'->>'numero' <> '00000001'
     OR (v_result->'documento'->>'estado') <> 'BORRADOR'
     OR (v_result->'documento'->>'subtotal')::numeric <> 180
     OR (v_result->'documento'->>'descuentos')::numeric <> 20
     OR (v_result->'documento'->>'impuesto_igv')::numeric <> 32.40
     OR (v_result->'documento'->>'total')::numeric <> 212.40
     OR (SELECT count(*) FROM public.documento_detalles
         WHERE tenant_id = v_tenant_id AND documento_id = v_documento_id) <> 1
     OR (SELECT count(*) FROM public.documento_auditoria
         WHERE tenant_id = v_tenant_id AND documento_id = v_documento_id
           AND accion = 'CREADO') <> 1 THEN
    RAISE EXCEPTION 'El alta manual no cerró correlativo/totales/detalle/auditoría: %', v_result;
  END IF;

  v_retry := public.crear_documento_manual_tx(
    v_tenant_id, v_user_id,
    jsonb_build_object(
      'tipo_documento', 'FACTURA', 'serie', 'F461',
      'cliente_id', v_cliente_id, 'receptor_tipo_doc', 'RUC',
      'receptor_numero_doc', '20123456786',
      'receptor_razon_social', 'Cliente Verify 461',
      'receptor_direccion', 'Lima', 'fecha_emision', app.hoy_tenant(v_tenant_id),
      'fecha_vencimiento', app.hoy_tenant(v_tenant_id) + 30, 'moneda', 'PEN',
      'condicion_pago', 'CONTADO'
    ),
    jsonb_build_array(jsonb_build_object(
      'codigo_producto', 'SERV-461', 'descripcion', 'Servicio atómico',
      'unidad_medida', 'ZZ', 'cantidad', 2, 'precio_unitario', 100,
      'descuento_unitario', 10, 'afectacion_igv', '10'
    )),
    'verify-461-create-invoice'
  );
  IF NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->'documento'->>'id')::uuid IS DISTINCT FROM v_documento_id
     OR (SELECT count(*) FROM public.documentos
         WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-461-create-invoice') <> 1 THEN
    RAISE EXCEPTION 'El retry de alta manual duplicó o perdió identidad: %', v_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_documento_manual_tx(
      v_tenant_id, v_user_id,
      jsonb_build_object(
        'tipo_documento', 'FACTURA', 'serie', 'F461',
        'cliente_id', v_cliente_id, 'receptor_tipo_doc', 'RUC',
        'receptor_numero_doc', '20123456786',
        'receptor_razon_social', 'Cliente Verify 461',
        'fecha_emision', app.hoy_tenant(v_tenant_id), 'moneda', 'PEN'
      ),
      jsonb_build_array(jsonb_build_object(
        'descripcion', 'Payload distinto', 'unidad_medida', 'ZZ',
        'cantidad', 1, 'precio_unitario', 999
      )),
      'verify-461-create-invoice'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'La key de alta aceptó otro fingerprint'; END IF;

  v_result := public.actualizar_documento_manual_tx(
    v_documento_id, v_tenant_id, v_user_id,
    jsonb_build_object(
      'tipo_documento', 'FACTURA', 'serie', 'F461',
      'cliente_id', v_cliente_id, 'receptor_tipo_doc', 'RUC',
      'receptor_numero_doc', '20123456786',
      'receptor_razon_social', 'Cliente Verify 461 actualizado',
      'fecha_emision', app.hoy_tenant(v_tenant_id),
      'fecha_vencimiento', app.hoy_tenant(v_tenant_id) + 30,
      'moneda', 'PEN', 'condicion_pago', 'CONTADO'
    ),
    jsonb_build_array(jsonb_build_object(
      'codigo_producto', 'SERV-461', 'descripcion', 'Servicio actualizado',
      'unidad_medida', 'ZZ', 'cantidad', 1, 'precio_unitario', 200,
      'descuento_unitario', 0, 'afectacion_igv', '10'
    )),
    'verify-461-update-invoice'
  );
  IF (v_result->'documento'->>'total')::numeric <> 236
     OR (SELECT count(*) FROM public.documento_detalles WHERE documento_id = v_documento_id) <> 1
     OR (SELECT total_item FROM public.documento_detalles
         WHERE documento_id = v_documento_id AND orden = 1) <> 236 THEN
    RAISE EXCEPTION 'La actualización no reemplazó/recalculó el borrador: %', v_result;
  END IF;

  v_items := jsonb_build_array(jsonb_build_object(
    'codigo', 'SERV-461', 'descripcion', 'Servicio actualizado',
    'cantidad', 1, 'unidad', 'ZZ', 'precio_unitario', 200,
    'valor_venta', 200, 'igv', 36, 'precio_venta', 236,
    'afectacion_igv', '10'
  ));
  v_detalles := jsonb_build_array(jsonb_build_object(
    'orden', 1, 'codigo_producto', 'SERV-461',
    'descripcion', 'Servicio actualizado', 'unidad_medida', 'ZZ',
    'cantidad', 1, 'precio_unitario', 200, 'descuento_unitario', 0,
    'valor_venta', 200, 'impuesto_igv', 36, 'impuesto_isc', 0,
    'total_item', 236, 'afectacion_igv', '10'
  ));
  v_cpe := jsonb_build_object(
    'tipo_documento', '01', 'serie', 'F461', 'numero', 1,
    'ruc_emisor', '20600000461', 'razon_social_emisor', 'Empresa Verify 461',
    'direccion_emisor', 'Lima', 'tipo_documento_receptor', '6',
    'documento_receptor', '20123456786',
    'razon_social_receptor', 'Cliente Verify 461 actualizado',
    'direccion_receptor', 'Lima', 'cliente_id', v_cliente_id,
    'moneda', 'PEN', 'total_gravadas', 200, 'total_exoneradas', 0,
    'total_inafectas', 0, 'total_exportacion', 0,
    'total_igv', 36, 'total_venta', 236, 'items', v_items,
    'fecha_emision', app.hoy_tenant(v_tenant_id),
    'fecha_vencimiento', app.hoy_tenant(v_tenant_id) + 30,
    'estado', 'FIRMADO', 'sunat_status', 'READY',
    'xml_firmado', '<Invoice><Signature>verify-461</Signature></Invoice>',
    'hash', 'hash-461', 'hash_firma', 'hash-461', 'created_by', v_user_id
  );
  SELECT count(*) INTO v_outbox_before FROM public.outbox_events WHERE tenant_id = v_tenant_id;
  SELECT count(*) INTO v_cxc_before FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant_id;
  v_result := public.emitir_factura_cliente_tx(
    v_tenant_id, v_cpe,
    jsonb_build_object('subtotal', 200, 'impuesto_igv', 36,
      'impuesto_isc', 0, 'total', 236, 'tipo_cambio', 1),
    v_detalles, NULL, gen_random_uuid(), 'verify-461-emit-invoice'
  );
  v_cpe_id := (v_result->>'cpe_id')::uuid;
  IF (v_result->>'documento_id')::uuid IS DISTINCT FROM v_documento_id
     OR (SELECT estado::text FROM public.documentos WHERE id = v_documento_id) <> 'EMITIDO'
     OR (SELECT xml_content FROM public.documentos WHERE id = v_documento_id)
        NOT LIKE '%Signature%'
     OR (SELECT count(*) FROM public.cuentas_por_cobrar
         WHERE tenant_id = v_tenant_id) <> v_cxc_before
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id) <> v_outbox_before + 2 THEN
    RAISE EXCEPTION '443 no adoptó el borrador manual o duplicó CxC: %', v_result;
  END IF;
  UPDATE public.cpe
  SET estado = 'RECHAZADO', sunat_status = 'ERROR',
      error_message = 'Timeout mock local'
  WHERE id = v_cpe_id;
  IF (SELECT estado::text FROM public.documentos WHERE id = v_documento_id) <> 'EMITIDO'
     OR (SELECT estado_sunat::text FROM public.documentos WHERE id = v_documento_id)
        <> 'ERROR_REINTENTABLE' THEN
    RAISE EXCEPTION 'Un error técnico no dejó el documento firmado disponible para retry';
  END IF;
  UPDATE public.cpe
  SET estado = 'FIRMADO', sunat_status = 'READY', error_message = NULL
  WHERE id = v_cpe_id;
  IF (SELECT estado_sunat::text FROM public.documentos WHERE id = v_documento_id) <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'El retry no restauró la proyección fiscal pendiente del documento';
  END IF;

  -- Boleta manual: mismo camino, sin writer alternativo.
  v_result := public.crear_documento_manual_tx(
    v_tenant_id, v_user_id,
    jsonb_build_object(
      'tipo_documento', 'BOLETA', 'serie', 'B461',
      'receptor_tipo_doc', 'DNI', 'receptor_numero_doc', '12345678',
      'receptor_razon_social', 'Cliente boleta 461',
      'fecha_emision', app.hoy_tenant(v_tenant_id),
      'moneda', 'PEN', 'condicion_pago', 'CONTADO'
    ),
    jsonb_build_array(jsonb_build_object(
      'codigo_producto', 'SERV-B461', 'descripcion', 'Servicio boleta',
      'unidad_medida', 'ZZ', 'cantidad', 1, 'precio_unitario', 50,
      'afectacion_igv', '10'
    )),
    'verify-461-create-receipt'
  );
  v_boleta_id := (v_result->'documento'->>'id')::uuid;
  v_result := public.emitir_factura_cliente_tx(
    v_tenant_id,
    jsonb_build_object(
      'tipo_documento', '03', 'serie', 'B461', 'numero', 1,
      'ruc_emisor', '20600000461', 'razon_social_emisor', 'Empresa Verify 461',
      'direccion_emisor', 'Lima', 'tipo_documento_receptor', '1',
      'documento_receptor', '12345678', 'razon_social_receptor', 'Cliente boleta 461',
      'moneda', 'PEN', 'total_gravadas', 50, 'total_exoneradas', 0,
      'total_inafectas', 0, 'total_exportacion', 0, 'total_igv', 9,
      'total_venta', 59,
      'items', jsonb_build_array(jsonb_build_object(
        'codigo', 'SERV-B461', 'descripcion', 'Servicio boleta', 'cantidad', 1,
        'unidad', 'ZZ', 'precio_unitario', 50, 'valor_venta', 50,
        'igv', 9, 'precio_venta', 59, 'afectacion_igv', '10'
      )),
      'fecha_emision', app.hoy_tenant(v_tenant_id),
      'estado', 'FIRMADO', 'sunat_status', 'READY',
      'xml_firmado', '<Invoice><Signature>verify-b461</Signature></Invoice>',
      'hash', 'hash-b461', 'hash_firma', 'hash-b461', 'created_by', v_user_id
    ),
    jsonb_build_object('subtotal', 50, 'impuesto_igv', 9,
      'impuesto_isc', 0, 'total', 59, 'tipo_cambio', 1),
    jsonb_build_array(jsonb_build_object(
      'orden', 1, 'codigo_producto', 'SERV-B461', 'descripcion', 'Servicio boleta',
      'unidad_medida', 'ZZ', 'cantidad', 1, 'precio_unitario', 50,
      'descuento_unitario', 0, 'valor_venta', 50, 'impuesto_igv', 9,
      'impuesto_isc', 0, 'total_item', 59, 'afectacion_igv', '10'
    )),
    NULL, gen_random_uuid(), 'verify-461-emit-receipt'
  );
  v_boleta_cpe_id := (v_result->>'cpe_id')::uuid;
  IF (v_result->>'documento_id')::uuid IS DISTINCT FROM v_boleta_id
     OR (SELECT estado::text FROM public.documentos WHERE id = v_boleta_id) <> 'EMITIDO' THEN
    RAISE EXCEPTION '443 no adoptó la boleta manual: %', v_result;
  END IF;

  -- Contrato: permanece operativo, jamás crea un CPE.
  v_result := public.crear_documento_manual_tx(
    v_tenant_id, v_user_id,
    jsonb_build_object(
      'tipo_documento', 'CONTRATO', 'serie', 'C461',
      'receptor_tipo_doc', 'RUC', 'receptor_numero_doc', '20123456786',
      'receptor_razon_social', 'Cliente Verify 461',
      'fecha_emision', app.hoy_tenant(v_tenant_id), 'moneda', 'PEN'
    ),
    jsonb_build_array(jsonb_build_object(
      'descripcion', 'Contrato de servicio', 'unidad_medida', 'ZZ',
      'cantidad', 1, 'precio_unitario', 100
    )),
    'verify-461-create-contract'
  );
  v_contrato_id := (v_result->'documento'->>'id')::uuid;
  IF EXISTS (
    SELECT 1 FROM public.cpe WHERE tenant_id = v_tenant_id AND documento_id = v_contrato_id
  ) THEN RAISE EXCEPTION 'El contrato generó un CPE indebido'; END IF;
  v_result := public.anular_documento_borrador_tx(
    v_contrato_id, v_tenant_id, v_user_id,
    'Contrato reemplazado', 'verify-461-cancel-contract'
  );
  v_retry := public.anular_documento_borrador_tx(
    v_contrato_id, v_tenant_id, v_user_id,
    'Contrato reemplazado', 'verify-461-cancel-contract'
  );
  IF (v_result->>'estado') <> 'ANULADO' OR NOT (v_retry->>'idempotent')::boolean THEN
    RAISE EXCEPTION 'La anulación del borrador no fue durable/idempotente';
  END IF;

  -- RA es una confirmación fiscal administrativa: antes de la señal durable de
  -- 448 debe fallar cerrado y no reservar lote alguno.
  SELECT count(*) INTO v_outbox_before FROM public.outbox_events WHERE tenant_id = v_tenant_id;
  SELECT count(*) INTO v_cxc_before FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant_id;
  v_failed := false;
  BEGIN
    PERFORM public.crear_comunicacion_baja_tx(
      v_tenant_id, v_user_id, ARRAY[v_cpe_id], 'Error en datos',
      app.hoy_tenant(v_tenant_id),
      'verify-461-ra-before-reversal'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed OR EXISTS (
    SELECT 1 FROM public.comunicaciones_baja
    WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-461-ra-before-reversal'
  ) THEN
    RAISE EXCEPTION 'RA reservó un CPE cuya reversa comercial 448 no estaba confirmada';
  END IF;

  -- Simula exactamente la mutación terminal propiedad de 448. El trigger 461
  -- debe convertirla en una precondición durable que RA puede consumir.
  UPDATE public.cpe c
  SET estado = 'ANULADO', estado_sunat = 'ANULADO', anulado_at = now(),
      anulado_por = v_user_id,
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_finalization_key', 'verify-461-448-final-invoice',
        'cancellation_finalization_fingerprint', repeat('4', 64),
        'atomic_rpc', 'finalizar_anulacion_cpe_tx'
      )
  WHERE c.id = v_cpe_id AND c.tenant_id = v_tenant_id;
  IF lower(coalesce((SELECT metadata->>'commercial_reversal_handled'
                     FROM public.cpe WHERE id = v_cpe_id), 'false')) <> 'true'
     OR (SELECT estado::text FROM public.documentos WHERE id = v_documento_id) <> 'ANULADO'
     OR lower(coalesce((SELECT metadata->>'commercial_reversal_handled'
                        FROM public.documentos WHERE id = v_documento_id), 'false')) <> 'true' THEN
    RAISE EXCEPTION 'La finalización 448 no propagó su señal comercial durable a CPE/documento';
  END IF;

  v_result := public.crear_comunicacion_baja_tx(
    v_tenant_id, v_user_id, ARRAY[v_cpe_id], 'Error en datos',
    app.hoy_tenant(v_tenant_id),
    'verify-461-create-ra'
  );
  v_ra_id := (v_result->'lote'->>'id')::uuid;
  v_retry := public.crear_comunicacion_baja_tx(
    v_tenant_id, v_user_id, ARRAY[v_cpe_id], 'Error en datos',
    app.hoy_tenant(v_tenant_id),
    'verify-461-create-ra'
  );
  IF NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->'lote'->>'id')::uuid IS DISTINCT FROM v_ra_id THEN
    RAISE EXCEPTION 'El retry de RA no reutilizó el lote reservado';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_comunicacion_baja_tx(
      v_tenant_id, v_user_id, ARRAY[v_cpe_id], 'Motivo distinto',
      app.hoy_tenant(v_tenant_id),
      'verify-461-create-ra'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RA aceptó la misma clave con otro fingerprint'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_comunicacion_baja_tx(
      v_tenant_id, v_user_id, ARRAY[v_cpe_id], 'Error en datos',
      app.hoy_tenant(v_tenant_id),
      'verify-461-create-ra-second-key'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Dos intenciones RA distintas reservaron el mismo CPE activo';
  END IF;
  IF (SELECT count(*) FROM public.detalle_comunicacion_baja
      WHERE comunicacion_id = v_ra_id) <> 1 THEN
    RAISE EXCEPTION 'RA no reservó cabecera+detalle';
  END IF;
  PERFORM public.marcar_resumen_fiscal_generado_tx(
    'RA', v_ra_id, v_tenant_id, v_user_id,
    '<VoidedDocuments/>', '<VoidedDocuments><Signature/></VoidedDocuments>',
    repeat('a', 64), 'verify-461-create-ra'
  );
  v_result := public.preparar_envio_resumen_fiscal_tx(
    'RA', v_ra_id, v_tenant_id, v_user_id, 'verify-461-send-ra'
  );
  v_send_token := (v_result->>'send_token')::uuid;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_resumen_fiscal_tx(
      'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
      'ACEPTADO', NULL, NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RA aceptó un callback sin ticket/código/CDR'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_resumen_fiscal_tx(
      'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
      'TICKET', NULL, '98', 'Ticket pendiente', NULL, NULL
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RA persistió TICKET sin ticket durable'; END IF;

  PERFORM public.finalizar_envio_resumen_fiscal_tx(
    'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
    'TICKET', 'T-RA-461', '98', 'Ticket pendiente', NULL, NULL
  );
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_resumen_fiscal_tx(
      'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
      'ACEPTADO', NULL, '0', 'Aceptado mock local', NULL, NULL
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RA aceptó un callback terminal sin CDR'; END IF;

  v_result := public.finalizar_envio_resumen_fiscal_tx(
    'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
    'ACEPTADO', NULL, '0', 'Aceptado mock local', '<CDR>RA-461</CDR>', NULL
  );
  v_retry := public.finalizar_envio_resumen_fiscal_tx(
    'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
    'ACEPTADO', NULL, '0', 'Aceptado mock local', '<CDR>RA-461</CDR>', NULL
  );
  IF NOT (v_retry->>'idempotent')::boolean
     OR nullif(v_retry->'lote'->>'terminal_fingerprint', '') IS NULL THEN
    RAISE EXCEPTION 'El replay exacto de ACEPTADO no fue idempotente: %', v_retry;
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_resumen_fiscal_tx(
      'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
      'RECHAZADO', NULL, '1234', 'Rechazo contradictorio', NULL, NULL
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RA reescribió ACEPTADO con RECHAZADO'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_envio_resumen_fiscal_tx(
      'RA', v_ra_id, v_tenant_id, v_user_id, v_send_token,
      'RETRY', NULL, 'TIMEOUT', 'Retry contradictorio', NULL, now() + interval '5 minutes'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RA reabrió un resultado terminal ACEPTADO'; END IF;

  IF (SELECT estado::text FROM public.documentos WHERE id = v_documento_id) <> 'ANULADO'
     OR (SELECT estado_sunat::text FROM public.documentos WHERE id = v_documento_id) <> 'ANULADO_RA'
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe_id) <> 'ANULADO'
     OR (SELECT estado_sunat::text FROM public.cpe WHERE id = v_cpe_id) <> 'ANULADO'
     OR lower(coalesce((SELECT metadata->>'commercial_reversal_handled'
                        FROM public.cpe WHERE id = v_cpe_id), 'false')) <> 'true'
     OR (SELECT terminal_result FROM public.comunicaciones_baja WHERE id = v_ra_id) <> 'ACEPTADO'
     OR (SELECT count(*) FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant_id) <> v_cxc_before
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id = v_tenant_id) <> v_outbox_before THEN
    RAISE EXCEPTION 'RA perdió terminalidad o alteró la reversa comercial/CxC/outbox';
  END IF;

  -- RC usa tipo_operacion=3 (baja), por lo que comparte la misma precondición
  -- comercial y nunca se interpreta como resumen de altas.
  SELECT count(*) INTO v_outbox_before FROM public.outbox_events WHERE tenant_id = v_tenant_id;
  SELECT count(*) INTO v_cxc_before FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant_id;
  v_failed := false;
  BEGIN
    PERFORM public.crear_resumen_diario_tx(
      v_tenant_id, v_user_id, ARRAY[v_boleta_cpe_id],
      app.hoy_tenant(v_tenant_id),
      'verify-461-rc-before-reversal'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed OR EXISTS (
    SELECT 1 FROM public.resumenes_diarios
    WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-461-rc-before-reversal'
  ) THEN
    RAISE EXCEPTION 'RC reservó una boleta cuya reversa comercial 448 no estaba confirmada';
  END IF;
  UPDATE public.cpe c
  SET estado = 'ANULADO', estado_sunat = 'ANULADO', anulado_at = now(),
      anulado_por = v_user_id,
      metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
        'cancellation_finalization_key', 'verify-461-448-final-receipt',
        'cancellation_finalization_fingerprint', repeat('5', 64),
        'atomic_rpc', 'finalizar_anulacion_cpe_tx'
      )
  WHERE c.id = v_boleta_cpe_id AND c.tenant_id = v_tenant_id;
  IF lower(coalesce((SELECT metadata->>'commercial_reversal_handled'
                     FROM public.cpe WHERE id = v_boleta_cpe_id), 'false')) <> 'true'
     OR (SELECT estado::text FROM public.documentos WHERE id = v_boleta_id) <> 'ANULADO' THEN
    RAISE EXCEPTION 'La señal comercial 448 de la boleta no quedó durable';
  END IF;
  v_result := public.crear_resumen_diario_tx(
    v_tenant_id, v_user_id, ARRAY[v_boleta_cpe_id],
    app.hoy_tenant(v_tenant_id),
    'verify-461-create-rc'
  );
  v_rc_id := (v_result->'lote'->>'id')::uuid;
  v_retry := public.crear_resumen_diario_tx(
    v_tenant_id, v_user_id, ARRAY[v_boleta_cpe_id],
    app.hoy_tenant(v_tenant_id),
    'verify-461-create-rc'
  );
  IF NOT (v_retry->>'idempotent')::boolean
     OR (v_retry->'lote'->>'id')::uuid IS DISTINCT FROM v_rc_id THEN
    RAISE EXCEPTION 'El retry de RC no reutilizó el lote reservado';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_resumen_diario_tx(
      v_tenant_id, v_user_id, ARRAY[v_boleta_cpe_id],
      app.hoy_tenant(v_tenant_id) - 1,
      'verify-461-create-rc'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RC aceptó la misma clave con otro fingerprint'; END IF;
  v_failed := false;
  BEGIN
    PERFORM public.crear_resumen_diario_tx(
      v_tenant_id, v_user_id, ARRAY[v_boleta_cpe_id],
      app.hoy_tenant(v_tenant_id),
      'verify-461-create-rc-second-key'
    );
  EXCEPTION WHEN unique_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Dos intenciones RC distintas reservaron el mismo CPE activo';
  END IF;
  PERFORM public.marcar_resumen_fiscal_generado_tx(
    'RC', v_rc_id, v_tenant_id, v_user_id,
    '<SummaryDocuments/>', '<SummaryDocuments><Signature/></SummaryDocuments>',
    repeat('b', 64), 'verify-461-create-rc'
  );
  v_result := public.preparar_envio_resumen_fiscal_tx(
    'RC', v_rc_id, v_tenant_id, v_user_id, 'verify-461-send-rc'
  );
  v_send_token := (v_result->>'send_token')::uuid;
  PERFORM public.finalizar_envio_resumen_fiscal_tx(
    'RC', v_rc_id, v_tenant_id, v_user_id, v_send_token,
    'TICKET', 'T-RC-461', '98', 'Ticket pendiente', NULL, NULL
  );
  v_result := public.finalizar_envio_resumen_fiscal_tx(
    'RC', v_rc_id, v_tenant_id, v_user_id, v_send_token,
    'ACEPTADO', NULL, '0', 'Aceptado mock local', '<CDR>RC-461</CDR>', NULL
  );
  IF (SELECT estado::text FROM public.documentos WHERE id = v_boleta_id) <> 'ANULADO'
     OR (SELECT estado_sunat::text FROM public.documentos WHERE id = v_boleta_id) <> 'ANULADO_RC'
     OR (SELECT estado::text FROM public.cpe WHERE id = v_boleta_cpe_id) <> 'ANULADO'
     OR lower(coalesce((SELECT metadata->>'commercial_reversal_handled'
                        FROM public.cpe WHERE id = v_boleta_cpe_id), 'false')) <> 'true'
     OR (SELECT count(*) FROM public.cuentas_por_cobrar WHERE tenant_id = v_tenant_id) <> v_cxc_before
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id = v_tenant_id) <> v_outbox_before THEN
    RAISE EXCEPTION 'RC perdió coherencia fiscal/comercial o duplicó CxC/outbox';
  END IF;

  -- Evidencia estructural de la serialización multi-key: ambas reservas bloquean
  -- el conjunto de CPE en orden determinista antes del check de lote activo.
  IF position('order by c.id' IN lower(pg_get_functiondef(
       'app.crear_comunicacion_baja_tx(uuid,uuid,uuid[],text,date,text)'::regprocedure))) = 0
     OR position('for update' IN lower(pg_get_functiondef(
       'app.crear_comunicacion_baja_tx(uuid,uuid,uuid[],text,date,text)'::regprocedure))) = 0
     OR position('order by c.id' IN lower(pg_get_functiondef(
       'app.crear_resumen_diario_tx(uuid,uuid,uuid[],date,text)'::regprocedure))) = 0
     OR position('for update' IN lower(pg_get_functiondef(
       'app.crear_resumen_diario_tx(uuid,uuid,uuid[],date,text)'::regprocedure))) = 0 THEN
    RAISE EXCEPTION 'RA/RC no contienen el lock determinista requerido para requests concurrentes';
  END IF;

  -- Actor ajeno: todo writer falla cerrado.
  v_failed := false;
  BEGIN
    PERFORM public.crear_documento_manual_tx(
      v_tenant_id, v_other_actor,
      jsonb_build_object(
        'tipo_documento', 'CONTRATO', 'serie', 'C462',
        'receptor_tipo_doc', 'RUC', 'receptor_numero_doc', '20123456786',
        'receptor_razon_social', 'Actor ajeno',
        'fecha_emision', app.hoy_tenant(v_tenant_id),
        'moneda', 'PEN'
      ),
      jsonb_build_array(jsonb_build_object(
        'descripcion', 'No autorizado', 'unidad_medida', 'ZZ',
        'cantidad', 1, 'precio_unitario', 1
      )),
      'verify-461-cross-tenant'
    );
  EXCEPTION WHEN check_violation THEN v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Un actor ajeno creó un documento'; END IF;

  IF has_function_privilege('authenticated',
       'public.crear_documento_manual_tx(uuid,uuid,jsonb,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.crear_serie_documento_tx(uuid,uuid,text,text,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.crear_comunicacion_baja_tx(uuid,uuid,uuid[],text,date,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.finalizar_envio_resumen_fiscal_tx(text,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz)', 'EXECUTE')
     OR has_table_privilege('authenticated', 'public.documentos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.documento_series', 'INSERT')
     OR has_table_privilege('authenticated', 'public.comunicaciones_baja', 'UPDATE') THEN
    RAISE EXCEPTION 'La superficie 461 no quedó restringida a service_role';
  END IF;
END;
$$;

ROLLBACK;
