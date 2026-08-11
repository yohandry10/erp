\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 463 solo puede ejecutarse en la base local efimera erp_e2e';
  END IF;
END;
$$;

UPDATE app.deployment_environment
SET environment = 'PROD',
    project_ref = 'wypnbcptofqdmoynlonq',
    allow_demo_data = true,
    configured_at = now(),
    updated_at = now()
WHERE singleton = true;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_other_tenant uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_other_actor uuid := gen_random_uuid();
  v_gre jsonb;
  v_gre_retry jsonb;
  v_gre_2 jsonb;
  v_sign jsonb;
  v_send jsonb;
  v_query jsonb;
  v_sire jsonb;
  v_sire_retry jsonb;
  v_accept jsonb;
  v_accept_final jsonb;
  v_ticket_query jsonb;
  v_failed boolean;
  v_before_headers bigint;
  v_before_ledger bigint;
  v_before_stock bigint;
  v_report_id uuid;
  v_operation_id uuid;
  v_claim uuid;
  v_cpe_id uuid := gen_random_uuid();
  v_late_cpe_id uuid := gen_random_uuid();
  v_sire_event jsonb;
  v_sire_event_final jsonb;
  v_sire_late jsonb;
BEGIN
  INSERT INTO public.tenants (id, codigo, nombre, descripcion, pais, plan, activo, estado)
  VALUES
    (v_tenant, 'VERIFY-463-' || left(v_tenant::text, 8), 'Tenant verify 463',
     'Fixture GRE SIRE local transaccional', 'PE', 'test', true, 'ACTIVO'),
    (v_other_tenant, 'VERIFY-463-' || left(v_other_tenant::text, 8), 'Tenant ajeno verify 463',
     'Fixture de aislamiento', 'PE', 'test', true, 'ACTIVO');

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_actor, v_tenant, 'Actor', 'Verify 463',
     'actor-463-' || left(v_actor::text, 8) || '@local.invalid',
     'actor463', 'unused-local-hash', true, 'ACTIVO'),
    (v_other_actor, v_other_tenant, 'Otro', 'Actor 463',
     'other-463-' || left(v_other_actor::text, 8) || '@local.invalid',
     'other463', 'unused-local-hash', true, 'ACTIVO');

  INSERT INTO public.empresa_config (
    tenant_id, ruc, razon_social, pais, moneda_defecto, estado,
    configuracion_completa, is_demo, sire_activo, serie_guia_remision
  ) VALUES (
    v_tenant, '20600000463', 'Empresa verify 463', 'PE', 'PEN', 'ACTIVO',
    true, false, true, 'T463'
  );

  SELECT count(*) INTO v_before_headers FROM public.gre_guias WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_ledger FROM public.asientos_contables WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_before_stock FROM public.movimientos_inventario WHERE tenant_id = v_tenant;

  v_gre := public.crear_gre_tx(
    v_tenant,
    v_actor,
    jsonb_build_object(
      'destinatario', 'Cliente local 463',
      'direccion_destino', 'Av. Prueba 463, Lima',
      'fecha_traslado', '2026-08-10T10:00:00-05:00',
      'modalidad', 'TRANSPORTE_PRIVADO',
      'motivo', 'VENTA',
      'peso_total', 5.5,
      'placa_vehiculo', 'ABC123',
      'datos_adicionales', jsonb_build_object('origen', 'VERIFY_463')
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'Producto manual uno', 'cantidad', 2, 'unidad_medida', 'NIU', 'peso', 3),
      jsonb_build_object('descripcion', 'Producto manual dos', 'cantidad', 1.5, 'unidad_medida', 'KGM', 'peso', 2.5)
    ),
    'verify-463-gre-create-1'
  );

  IF v_gre->>'estado' <> 'BORRADOR'
     OR v_gre->>'sunat_status' <> 'NOT_SENT'
     OR (v_gre->>'item_count')::integer <> 2
     OR v_gre->>'created_by' <> v_actor::text THEN
    RAISE EXCEPTION 'Alta GRE atómica no preservó BORRADOR, actor o líneas: %', v_gre;
  END IF;

  v_gre_retry := public.crear_gre_tx(
    v_tenant,
    v_actor,
    jsonb_build_object(
      'destinatario', 'Cliente local 463',
      'direccion_destino', 'Av. Prueba 463, Lima',
      'fecha_traslado', '2026-08-10T10:00:00-05:00',
      'modalidad', 'TRANSPORTE_PRIVADO',
      'motivo', 'VENTA',
      'peso_total', 5.5,
      'placa_vehiculo', 'ABC123',
      'datos_adicionales', jsonb_build_object('origen', 'VERIFY_463')
    ),
    jsonb_build_array(
      jsonb_build_object('descripcion', 'Producto manual uno', 'cantidad', 2, 'unidad_medida', 'NIU', 'peso', 3),
      jsonb_build_object('descripcion', 'Producto manual dos', 'cantidad', 1.5, 'unidad_medida', 'KGM', 'peso', 2.5)
    ),
    'verify-463-gre-create-1'
  );
  IF v_gre_retry->>'id' <> v_gre->>'id' OR (v_gre_retry->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Retry exacto GRE duplicó o perdió idempotencia: %', v_gre_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_gre_tx(
      v_tenant, v_actor,
      jsonb_build_object(
        'destinatario', 'COLISION', 'direccion_destino', 'Av. Prueba 463, Lima',
        'fecha_traslado', '2026-08-10T10:00:00-05:00', 'modalidad', 'TRANSPORTE_PRIVADO',
        'motivo', 'VENTA', 'peso_total', 5.5
      ),
      jsonb_build_array(jsonb_build_object('descripcion', 'Producto', 'cantidad', 1)),
      'verify-463-gre-create-1'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'GRE permitió colisión de idempotencia'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_gre_tx(
      v_tenant, v_other_actor,
      jsonb_build_object(
        'destinatario', 'Actor ajeno', 'direccion_destino', 'Lima',
        'fecha_traslado', '2026-08-10T10:00:00-05:00', 'modalidad', 'TRANSPORTE_PRIVADO',
        'motivo', 'VENTA', 'peso_total', 1
      ),
      jsonb_build_array(jsonb_build_object('descripcion', 'Producto', 'cantidad', 1)),
      'verify-463-gre-actor-ajeno'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'GRE permitió actor de otro tenant'; END IF;

  v_failed := false;
  BEGIN
    PERFORM public.crear_gre_tx(
      v_tenant, v_actor,
      jsonb_build_object(
        'destinatario', 'Rollback', 'direccion_destino', 'Lima',
        'fecha_traslado', '2026-08-10T10:00:00-05:00', 'modalidad', 'TRANSPORTE_PRIVADO',
        'motivo', 'VENTA', 'peso_total', 1
      ),
      jsonb_build_array(jsonb_build_object('descripcion', '', 'cantidad', 1)),
      'verify-463-gre-invalid-item'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed := true;
  END;
  IF NOT v_failed OR EXISTS (
    SELECT 1 FROM public.gre_guias WHERE tenant_id=v_tenant AND idempotency_key='verify-463-gre-invalid-item'
  ) THEN
    RAISE EXCEPTION 'Fallo tardío GRE dejó cabecera parcial';
  END IF;

  v_gre_2 := public.crear_gre_tx(
    v_tenant, v_actor,
    jsonb_build_object(
      'destinatario', 'Segundo cliente', 'direccion_destino', 'Callao',
      'fecha_traslado', '2026-08-11T10:00:00-05:00', 'modalidad', 'TRANSPORTE_PUBLICO',
      'motivo', 'VENTA', 'peso_total', 1, 'transportista', 'Transportes 463'
    ),
    jsonb_build_array(jsonb_build_object('descripcion', 'Producto', 'cantidad', 1, 'peso', 1)),
    'verify-463-gre-create-2'
  );
  IF (v_gre_2->>'correlativo')::integer <> (v_gre->>'correlativo')::integer + 1 THEN
    RAISE EXCEPTION 'Correlativo GRE no fue secuencial bajo lock: %, %', v_gre, v_gre_2;
  END IF;

  v_sign := public.guardar_firma_gre_tx(
    v_tenant, v_actor, (v_gre->>'id')::uuid,
    '<DespatchAdvice id="T463-1"/>', '<SignedDespatchAdvice id="T463-1"/>',
    repeat('a', 64), 'verify-463-gre-sign-1'
  );
  IF v_sign->>'estado' <> 'FIRMADO' OR v_sign->>'xml_ubl' IS NULL OR v_sign->>'xml_firmado' IS NULL THEN
    RAISE EXCEPTION 'Firma GRE no congeló XML/estado: %', v_sign;
  END IF;

  v_send := public.reservar_envio_gre_tx(
    v_tenant, v_actor, (v_gre->>'id')::uuid, 'verify-463-gre-send-1', 'USUARIO'
  );
  IF (v_send->>'claimed')::boolean IS NOT TRUE OR v_send#>>'{gre,estado}' <> 'ENVIADO' THEN
    RAISE EXCEPTION 'Reserva GRE no obtuvo claim o no marcó SENDING: %', v_send;
  END IF;
  PERFORM public.finalizar_envio_gre_tx(
    v_tenant,
    (v_send#>>'{operation,id}')::uuid,
    (v_send#>>'{operation,claim_token}')::uuid,
    true, false, '0', 'Ticket recibido', 'TICKET463', NULL, repeat('b',64), NULL,
    jsonb_build_object('fixture', true)
  );

  v_query := public.reservar_consulta_gre_tx(
    v_tenant, v_actor, (v_gre->>'id')::uuid, 'verify-463-gre-query-1', 'USUARIO'
  );
  PERFORM public.finalizar_consulta_gre_tx(
    v_tenant,
    (v_query#>>'{operation,id}')::uuid,
    (v_query#>>'{operation,claim_token}')::uuid,
    true, false, false, '0', 'Aceptado', '<cdr/>', jsonb_build_object('fixture', true)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.gre_guias
    WHERE id=(v_gre->>'id')::uuid AND tenant_id=v_tenant
      AND estado='ACEPTADO' AND sunat_status='ACCEPTED' AND cdr_sunat='<cdr/>'
  ) THEN
    RAISE EXCEPTION 'Consulta GRE no finalizó estado aceptado de forma atómica';
  END IF;

  PERFORM public.anular_gre_tx(
    v_tenant, v_actor, (v_gre_2->>'id')::uuid,
    'Error material antes del envío', 'verify-463-gre-cancel-2'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.gre_guias
    WHERE id=(v_gre_2->>'id')::uuid AND tenant_id=v_tenant
      AND estado='ANULADO' AND anulado_por=v_actor
  ) THEN
    RAISE EXCEPTION 'Anulación interna GRE no registró actor/estado';
  END IF;

  IF (SELECT count(*) FROM public.gre_guias WHERE tenant_id=v_tenant) <> v_before_headers + 2 THEN
    RAISE EXCEPTION 'Número de cabeceras GRE inesperado';
  END IF;
  IF (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=v_tenant) <> v_before_ledger
     OR (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id=v_tenant) <> v_before_stock THEN
    RAISE EXCEPTION 'GRE alteró contabilidad o stock; debe ser sólo documento logístico';
  END IF;

  INSERT INTO public.cpe (
    id, tenant_id, nombre, codigo, estado, sunat_status,
    tipo_documento, serie, numero, numero_comprobante,
    fecha_emision, documento_receptor, razon_social_receptor,
    total_gravadas, total_igv, total_venta, total, moneda
  ) VALUES (
    v_cpe_id, v_tenant, 'CPE verify SIRE', 'CPE-VERIFY-463-1',
    'ACEPTADO', 'ACCEPTED', '01', 'F463', '00000001', 1,
    '2026-08-10 10:00:00-05', '20500000463', 'Cliente SIRE 463',
    100, 18, 118, 118, 'PEN'
  );

  v_sire_event := public.registrar_comprobante_sire_tx(
    v_tenant, v_cpe_id, gen_random_uuid()
  );
  v_report_id := (v_sire_event#>>'{report,id}')::uuid;
  v_sire_event_final := public.finalizar_generacion_sire_evento_tx(
    v_tenant, v_report_id
  );
  IF (v_sire_event->>'inserted')::boolean IS NOT TRUE
     OR v_sire_event_final->>'estado' <> 'GENERADO'
     OR v_sire_event_final->>'contenido_sha256' IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.sire_registros_detalle d
       WHERE d.tenant_id=v_tenant AND d.cpe_id=v_cpe_id AND d.reporte_id=v_report_id
     ) THEN
    RAISE EXCEPTION 'Evento comprobante.creado no quedó proyectado/congelado atómicamente: %, %',
      v_sire_event, v_sire_event_final;
  END IF;

  v_sire_event := public.registrar_comprobante_sire_tx(
    v_tenant, v_cpe_id, gen_random_uuid()
  );
  IF (v_sire_event->>'inserted')::boolean IS TRUE
     OR (SELECT count(*) FROM public.sire_registros_detalle d
         WHERE d.tenant_id=v_tenant AND d.cpe_id=v_cpe_id) <> 1 THEN
    RAISE EXCEPTION 'Retry del evento comprobante.creado duplicó detalle: %', v_sire_event;
  END IF;

  v_sire := public.generar_reporte_sire_tx(
    v_tenant, v_actor, 'REG_VEN', '2026-08',
    jsonb_build_object('incluirAnulados', false, 'origen', 'VERIFY_463'),
    'verify-463-sire-generate-1'
  );
  IF v_sire->>'estado' <> 'GENERADO' OR v_sire->>'status' <> 'COMPLETED'
     OR v_sire->>'contenido_sha256' IS NULL OR v_sire->>'created_by' <> v_actor::text THEN
    RAISE EXCEPTION 'Generación local SIRE no congeló contenido/actor: %', v_sire;
  END IF;
  v_sire_retry := public.generar_reporte_sire_tx(
    v_tenant, v_actor, 'REG_VEN', '2026-08',
    jsonb_build_object('incluirAnulados', false, 'origen', 'VERIFY_463'),
    'verify-463-sire-generate-1'
  );
  IF v_sire_retry->>'id' <> v_sire->>'id' OR (v_sire_retry->>'idempotent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Retry exacto SIRE duplicó reporte: %', v_sire_retry;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.generar_reporte_sire_tx(
      v_tenant, v_actor, 'REG_VEN', '2026-08', '{}'::jsonb,
      'verify-463-sire-generate-1'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'SIRE permitió colisión de idempotencia'; END IF;

  v_report_id := (v_sire->>'id')::uuid;
  v_accept := public.reservar_aceptacion_sire_tx(
    v_tenant, v_actor, v_report_id, 'verify-463-sire-accept-1'
  );
  IF (v_accept->>'claimed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Aceptación SIRE no obtuvo claim: %', v_accept;
  END IF;
  v_operation_id := (v_accept#>>'{operation,id}')::uuid;
  v_claim := (v_accept#>>'{operation,claim_token}')::uuid;
  v_accept_final := public.finalizar_aceptacion_sire_tx(
    v_tenant, v_operation_id, v_claim, '202608463001', 200, jsonb_build_object('fixture', true)
  );
  IF v_accept_final#>>'{report,estado}' <> 'PENDIENTE'
     OR v_accept_final#>>'{report,sunat_ticket}' <> '202608463001' THEN
    RAISE EXCEPTION 'Ticket SIRE no quedó PENDIENTE y persistido atómicamente: %', v_accept_final;
  END IF;

  v_ticket_query := public.reservar_consulta_sire_tx(
    v_tenant, v_actor, v_report_id, 'verify-463-sire-query-1'
  );
  PERFORM public.finalizar_consulta_sire_tx(
    v_tenant,
    (v_ticket_query#>>'{operation,id}')::uuid,
    (v_ticket_query#>>'{operation,claim_token}')::uuid,
    '02', 'Procesando', 200, jsonb_build_object('fixture', true)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.sire_files
    WHERE id=v_report_id AND tenant_id=v_tenant AND estado='PENDIENTE'
      AND sunat_codigo_estado='02' AND sunat_aceptado_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Código SIRE distinto de 06 fue tratado como aceptado';
  END IF;

  v_ticket_query := public.reservar_consulta_sire_tx(
    v_tenant, v_actor, v_report_id, 'verify-463-sire-query-2'
  );
  PERFORM public.finalizar_consulta_sire_tx(
    v_tenant,
    (v_ticket_query#>>'{operation,id}')::uuid,
    (v_ticket_query#>>'{operation,claim_token}')::uuid,
    '06', 'Terminado', 200, jsonb_build_object('fixture', true)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.sire_files
    WHERE id=v_report_id AND tenant_id=v_tenant AND estado='ENVIADO'
      AND status='SENT' AND sunat_codigo_estado='06' AND sunat_aceptado_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Código SIRE 06 no finalizó reporte y operación atómicamente';
  END IF;

  INSERT INTO public.cpe (
    id, tenant_id, nombre, codigo, estado, sunat_status,
    tipo_documento, serie, numero, numero_comprobante,
    fecha_emision, documento_receptor, razon_social_receptor,
    total_gravadas, total_igv, total_venta, total, moneda
  ) VALUES (
    v_late_cpe_id, v_tenant, 'CPE tardío verify SIRE', 'CPE-VERIFY-463-2',
    'ACEPTADO', 'ACCEPTED', '01', 'F463', '00000002', 2,
    '2026-08-20 10:00:00-05', '20500000463', 'Cliente tardío SIRE 463',
    200, 36, 236, 236, 'PEN'
  );
  v_sire_late := public.registrar_comprobante_sire_tx(
    v_tenant, v_late_cpe_id, gen_random_uuid()
  );
  IF v_sire_late->>'reason' <> 'REPORT_FROZEN'
     OR (v_sire_late->>'correction_required')::boolean IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.sire_incidencias i
       WHERE i.tenant_id=v_tenant AND i.cpe_id=v_late_cpe_id
         AND i.codigo='CPE_AFTER_REPORT_FROZEN' AND i.estado='PENDIENTE'
     ) THEN
    RAISE EXCEPTION 'CPE posterior al período congelado no generó incidencia accionable: %', v_sire_late;
  END IF;

  IF (SELECT count(*) FROM public.asientos_contables WHERE tenant_id=v_tenant) <> v_before_ledger
     OR (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id=v_tenant) <> v_before_stock THEN
    RAISE EXCEPTION 'SIRE alteró contabilidad o stock; es comparación/registro fiscal';
  END IF;

  IF has_function_privilege('authenticated', 'public.crear_gre_tx(uuid,uuid,jsonb,jsonb,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.generar_reporte_sire_tx(uuid,uuid,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC fiscal crítica quedó ejecutable por authenticated';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.crear_gre_tx(uuid,uuid,jsonb,jsonb,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.generar_reporte_sire_tx(uuid,uuid,text,text,jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdió acceso a RPC fiscal crítica';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.gre_guias','public.gre_detalles','public.pedido_gres','public.gre_operaciones',
      'public.sire_files','public.sire_registros_detalle','public.sire_operaciones','public.sire_incidencias'
    ]) AS t(tabla)
    WHERE has_table_privilege('service_role', t.tabla, 'INSERT')
       OR has_table_privilege('service_role', t.tabla, 'UPDATE')
       OR has_table_privilege('service_role', t.tabla, 'DELETE')
  ) THEN
    RAISE EXCEPTION 'service_role conserva DML directo en tablas GRE/SIRE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.gre_guias','public.gre_detalles','public.pedido_gres','public.gre_operaciones',
      'public.sire_files','public.sire_registros_detalle','public.sire_operaciones','public.sire_incidencias'
    ]) AS t(tabla)
    WHERE NOT has_table_privilege('service_role', t.tabla, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'service_role perdió lectura requerida en tablas GRE/SIRE';
  END IF;
  IF has_function_privilege(
       'service_role', 'app.assert_fiscal_actor_463(uuid,uuid,boolean)', 'EXECUTE'
     ) OR has_function_privilege(
       'service_role', 'app.build_sire_snapshot_463(uuid,text,text,jsonb)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role conserva acceso a helpers internos GRE/SIRE';
  END IF;
END;
$$;

ROLLBACK;
