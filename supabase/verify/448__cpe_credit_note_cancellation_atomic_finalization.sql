\set ON_ERROR_STOP on

BEGIN;

UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
 configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;

-- Fail closed antes de crear funciones, triggers o fixtures.
DO $$
BEGIN
  IF current_database() <> 'erp_e2e' THEN
    RAISE EXCEPTION 'VERIFY 448 sólo puede ejecutarse en la base efímera erp_e2e';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.verify_448_seed_accounting(
  p_tenant_id uuid,
  p_event_id uuid,
  p_user_id uuid,
  p_reference text,
  p_total numeric
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
DECLARE
  v_asiento_id uuid;
BEGIN
  INSERT INTO public.asientos_contables (
    tenant_id, fecha, concepto, descripcion, referencia, total_debe,
    total_haber, estado, origen, source_event_id, usuario_id, created_by
  ) VALUES (
    p_tenant_id, now(), 'Venta original verify 448',
    'Venta original verify 448', p_reference, p_total, p_total,
    'CONFIRMADO', 'VERIFY_448', p_event_id, p_user_id, p_user_id::text
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, nombre, concepto, debe, haber
  ) VALUES
    (p_tenant_id, v_asiento_id, 'Debe original', 'Debe original', p_total, 0),
    (p_tenant_id, v_asiento_id, 'Haber original', 'Haber original', 0, p_total);

  RETURN v_asiento_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.verify_448_fail_late_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $$
BEGIN
  IF current_setting('app.verify_448_fail_late', true) = 'on'
     AND NEW.event_type = 'cpe.anulado' THEN
    RAISE EXCEPTION 'VERIFY_448_LATE_OUTBOX_FAILURE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_448_fail_late_outbox ON public.outbox_events;
CREATE TRIGGER trg_verify_448_fail_late_outbox
BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.verify_448_fail_late_outbox();

DO $$
DECLARE
  v_tenant_id uuid := gen_random_uuid();
  v_other_tenant_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_other_user_id uuid := gen_random_uuid();
  v_cliente_id uuid;
  v_almacen_id uuid;
  v_producto_id uuid;
  v_servicio_id uuid;
  v_pedido_id uuid;
  v_documento_id uuid;
  v_cxc_id uuid;
  v_cpe_id uuid := gen_random_uuid();
  v_cpe_event_id uuid := gen_random_uuid();
  v_nota_id uuid;
  v_result jsonb;
  v_request_fingerprint text;
  v_caja_id uuid;
  v_sesion_id uuid;
  v_reversal_sesion_id uuid;
  v_pos_id uuid;
  v_pos_cpe_id uuid := gen_random_uuid();
  v_pos_event_id uuid := gen_random_uuid();
  v_pos_nota_id uuid;
  v_failed boolean;
  v_table text;
BEGIN
  -- Fixture local explícita: no suplanta PROD ni usa seeds remotos.
  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado
  ) VALUES
    (v_tenant_id, 'VERIFY-448-' || left(v_tenant_id::text, 8),
     'Tenant verify 448', 'Fixture local transaccional', 'PE', 'test', true, 'ACTIVO'),
    (v_other_tenant_id, 'VERIFY-448-' || left(v_other_tenant_id::text, 8),
     'Otro tenant verify 448', 'Aislamiento de actor', 'PE', 'test', true, 'ACTIVO');

  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado
  ) VALUES
    (v_user_id, v_tenant_id, 'Actor', 'Verify 448',
     'actor-448-' || left(v_user_id::text, 8) || '@local.invalid',
     'actor448', 'unused-local-hash', true, 'ACTIVO'),
    (v_other_user_id, v_other_tenant_id, 'Actor', 'Tenant ajeno',
     'other-448-' || left(v_other_user_id::text, 8) || '@local.invalid',
     'other448', 'unused-local-hash', true, 'ACTIVO');

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = v_user_id AND tenant_id = v_tenant_id AND activo
  ) THEN
    RAISE EXCEPTION 'La identidad canónica no sincronizó el actor verify 448';
  END IF;

  INSERT INTO public.clientes (
    tenant_id, codigo, nombre, razon_social, documento_tipo, ruc, activo
  ) VALUES (
    v_tenant_id, 'CLI-448', 'Cliente verify 448',
    'Cliente verify 448', 'RUC', '20123456786', true
  ) RETURNING id INTO v_cliente_id;

  INSERT INTO public.almacenes (
    tenant_id, codigo, nombre, estado, activo, es_principal, pais
  ) VALUES (
    v_tenant_id, 'ALM-448', 'Almacén verify 448',
    'ACTIVO', true, true, 'PE'
  ) RETURNING id INTO v_almacen_id;

  SELECT (public.crear_producto_inventario_tx(
    v_tenant_id,
    jsonb_build_object(
      'codigo', 'PROD-448', 'nombre', 'Producto físico 448',
      'categoria', 'VERIFICACION', 'precio_venta', 100,
      'precio_compra', 10, 'afectacion_igv', '10'
    ),
    v_almacen_id, 10, 0, '[]'::jsonb
  )->>'id')::uuid INTO v_producto_id;

  INSERT INTO public.productos (
    tenant_id, codigo, nombre, estado, activo, es_servicio, controla_stock,
    precio_venta, precio_compra, afectacion_igv, stock, stock_actual,
    stock_reservado
  ) VALUES (
    v_tenant_id, 'SERV-448', 'Servicio 448', 'ACTIVO', true, true, false,
    50, 0, '10', 0, 0, 0
  ) RETURNING id INTO v_servicio_id;

  -- Venta de pedido: documento + CxC + stock físico + servicio sin stock.
  INSERT INTO public.pedidos_venta (
    tenant_id, cliente_id, numero, fecha, fecha_pedido, estado,
    subtotal, igv, total, moneda, created_by
  ) VALUES (
    v_tenant_id, v_cliente_id, 'PV-448-1', current_date, current_date,
    'FACTURADO', 350, 63, 413, 'PEN', v_user_id
  ) RETURNING id INTO v_pedido_id;

  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad,
    precio_unitario, subtotal, estado_item, cantidad_despachada,
    cantidad_facturada
  ) VALUES
    (v_tenant_id, v_pedido_id, v_producto_id, 'Producto físico', 3,
     100, 300, 'FACTURADO', 3, 3),
    (v_tenant_id, v_pedido_id, v_servicio_id, 'Servicio', 1,
     50, 50, 'FACTURADO', 0, 1);

  INSERT INTO public.documentos (
    tenant_id, tipo_documento, serie, numero, estado, fecha_emision,
    fecha_vencimiento, moneda, tipo_cambio, subtotal, impuesto_igv,
    total, total_gravadas, total_exoneradas, total_inafectas,
    total_exportacion, pedido_id, cliente_id, created_by
  ) VALUES (
    v_tenant_id, 'FACTURA', 'F448', '1', 'EMITIDO', now(),
    now() + interval '30 days', 'PEN', 1, 350, 63, 413,
    350, 0, 0, 0, v_pedido_id, v_cliente_id, v_user_id
  ) RETURNING id INTO v_documento_id;

  INSERT INTO public.cuentas_por_cobrar (
    tenant_id, cliente_id, documento_id, pedido_id, estado,
    monto_total, monto_original, monto_pendiente, saldo, saldo_pendiente,
    total, retencion_total, percepcion_total, detraccion_total,
    anticipo_total, fecha_emision, fecha_vencimiento, moneda,
    numero_documento, tipo_documento, idempotency_key, event_source
  ) VALUES (
    v_tenant_id, v_cliente_id, v_documento_id, v_pedido_id, 'PENDIENTE',
    413, 413, 413, 413, 413, 413, 0, 0, 0, 0,
    current_date, current_date + 30, 'PEN', 'F448-00000001',
    'FACTURA', 'verify-448-cxc', 'verify.448'
  ) RETURNING id INTO v_cxc_id;

  INSERT INTO public.cpe (
    id, tenant_id, documento_id, tipo_documento, serie, numero,
    ruc_emisor, razon_social_emisor, direccion_emisor,
    tipo_documento_receptor, documento_receptor, razon_social_receptor,
    direccion_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  ) VALUES (
    v_cpe_id, v_tenant_id, v_documento_id, '01', 'F448', '1',
    '20600000448', 'Empresa verify 448', 'Lima', '6', '20123456786',
    'Cliente verify 448', 'Lima', v_cliente_id, 'PEN', 350,
    0, 0, 0, 63, 413, 413,
    jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_producto_id, 'codigo', 'PROD-448',
        'descripcion', 'Producto físico', 'unidad', 'NIU',
        'cantidad', 3, 'precio_unitario', 100, 'valor_venta', 300,
        'impuesto_igv', 54, 'afectacion_igv', '10'
      ),
      jsonb_build_object(
        'producto_id', v_servicio_id, 'codigo', 'SERV-448',
        'descripcion', 'Servicio', 'unidad', 'ZZ', 'cantidad', 1,
        'precio_unitario', 50, 'valor_venta', 50,
        'impuesto_igv', 9, 'afectacion_igv', '10'
      )
    ),
    now(), current_date + 30, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
    v_user_id, v_cpe_event_id, true
  );

  UPDATE public.pedidos_venta
  SET factura_id = v_cpe_id
  WHERE id = v_pedido_id AND tenant_id = v_tenant_id;

  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant_id,
    p_producto_id := v_producto_id,
    p_almacen_id := v_almacen_id,
    p_tipo := 'SALIDA',
    p_cantidad := 3,
    p_referencia_tipo := 'PEDIDO_FACTURA_446',
    p_referencia_id := v_pedido_id,
    p_notas := 'Salida original verify 448',
    p_created_by := v_user_id::text,
    p_metadata := jsonb_build_object('source', 'verify.448')
  );

  PERFORM app.verify_448_seed_accounting(
    v_tenant_id, v_cpe_event_id, v_user_id, 'F448-00000001', 413
  );

  SELECT public.solicitar_anulacion_cpe_tx(
    v_cpe_id, v_tenant_id, v_user_id, 'Error total de operación',
    '01', 'verify-448-request-order'
  ) INTO v_result;
  v_nota_id := (v_result #>> '{nota_credito,id}')::uuid;
  v_request_fingerprint := v_result->>'request_fingerprint';

  IF v_nota_id IS NULL
     OR (v_result->>'idempotent')::boolean
     OR (SELECT nota_credito_id FROM public.cpe WHERE id = v_cpe_id)
        IS DISTINCT FROM v_nota_id
     OR (SELECT tipo_documento FROM public.cpe WHERE id = v_nota_id) <> '07'
     OR (SELECT estado::text FROM public.cpe WHERE id = v_nota_id) <> 'BORRADOR'
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id = v_tenant_id AND nota_credito_id = v_nota_id) <> 1
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant_id
         AND (aggregate_id = v_nota_id::text
           OR payload->>'cpeId' = v_nota_id::text
           OR payload->>'cpe_id' = v_nota_id::text)
         AND event_type IN ('factura.emitida', 'venta.procesada')
     ) THEN
    RAISE EXCEPTION 'La solicitud 448 no creó/vinculó una única nota 07 limpia: %', v_result;
  END IF;

  -- Retry exacto: misma nota, mismo fingerprint y ningún correlativo extra.
  SELECT public.solicitar_anulacion_cpe_tx(
    v_cpe_id, v_tenant_id, v_user_id, 'Error total de operación',
    '01', 'verify-448-request-order'
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (v_result #>> '{nota_credito,id}')::uuid <> v_nota_id
     OR v_result->>'request_fingerprint' <> v_request_fingerprint
     OR (SELECT count(*) FROM public.cpe
         WHERE tenant_id = v_tenant_id AND tipo_documento = '07') <> 1 THEN
    RAISE EXCEPTION 'El retry de solicitud 448 no fue estable: %', v_result;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.solicitar_anulacion_cpe_tx(
      v_cpe_id, v_tenant_id, v_user_id, 'Motivo diferente',
      '01', 'verify-448-request-order'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Misma key con payload distinto debió fallar';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.solicitar_anulacion_cpe_tx(
      v_cpe_id, v_tenant_id, v_user_id, 'Error total de operación',
      '01', 'verify-448-request-order-different'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Una segunda key sobre el mismo original debió fallar';
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.solicitar_anulacion_cpe_tx(
      v_cpe_id, v_tenant_id, v_other_user_id, 'Error total de operación',
      '01', 'verify-448-cross-actor'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Un actor de otro tenant debió ser rechazado';
  END IF;

  -- La aceptación sin CDR no toca ninguna proyección.
  SELECT public.finalizar_anulacion_cpe_tx(
    v_nota_id, v_tenant_id, NULL, 'verify-448-final-order'
  ) INTO v_result;
  IF v_result->>'estado' <> 'PENDIENTE_CDR'
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe_id) <> 'ACEPTADO'
     OR (SELECT estado::text FROM public.documentos WHERE id = v_documento_id) <> 'EMITIDO'
     OR (SELECT estado::text FROM public.cuentas_por_cobrar WHERE id = v_cxc_id) <> 'PENDIENTE'
     OR (SELECT estado::text FROM public.pedidos_venta WHERE id = v_pedido_id) <> 'FACTURADO'
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 7 THEN
    RAISE EXCEPTION 'La finalización sin CDR mutó proyecciones: %', v_result;
  END IF;

  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
      sunat_status = 'ACCEPTED', cdr_sunat = 'CDR-ACEPTADO-448'
  WHERE id = v_nota_id AND tenant_id = v_tenant_id;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_anulacion_cpe_tx(
      v_nota_id, v_tenant_id, v_other_user_id, 'verify-448-final-order'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Un actor final de otro tenant debió ser rechazado';
  END IF;

  -- Una CxC con dinero aplicado no puede ponerse en cero sin una reversa de
  -- banco/caja. El cierre debe fallar antes de tocar cualquier proyeccion.
  INSERT INTO public.cxc_pagos (
    tenant_id, cuenta_id, monto, moneda, fecha_pago, metodo_pago,
    referencia, tipo, usuario_id, event_id, idempotency_key, source, activo
  ) VALUES (
    v_tenant_id, v_cxc_id, 10, 'PEN', current_date, 'TRANSFERENCIA',
    'VERIFY-448-PAID', 'PAGO', v_user_id, gen_random_uuid(),
    'verify-448-applied-receivable', 'verify.448', true
  );
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_anulacion_cpe_tx(
      v_nota_id, v_tenant_id, v_user_id, 'verify-448-final-order'
    );
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%CPE_CANCELLATION_REFUND_REQUIRED_FOR_APPLIED_RECEIVABLE%' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_failed
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe_id) <> 'ACEPTADO'
     OR (SELECT estado::text FROM public.cuentas_por_cobrar WHERE id = v_cxc_id) <> 'PENDIENTE'
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_cxc_id) <> 413 THEN
    RAISE EXCEPTION 'Una CxC cobrada no bloqueo limpiamente la anulacion 448';
  END IF;
  DELETE FROM public.cxc_pagos
  WHERE tenant_id = v_tenant_id AND idempotency_key = 'verify-448-applied-receivable';

  -- Un efecto legacy aislado no se adopta silenciosamente: requiere
  -- reconciliación antes de poder ejecutar el cierre integral.
  UPDATE public.documentos SET estado = 'ANULADO'
  WHERE id = v_documento_id AND tenant_id = v_tenant_id;
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_anulacion_cpe_tx(
      v_nota_id, v_tenant_id, NULL, 'verify-448-final-order'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Un efecto parcial legacy debió bloquear el cierre 448';
  END IF;
  UPDATE public.documentos SET estado = 'EMITIDO'
  WHERE id = v_documento_id AND tenant_id = v_tenant_id;

  -- Falla inducida en la última escritura: todo lo anterior debe hacer rollback.
  PERFORM set_config('app.verify_448_fail_late', 'on', true);
  v_failed := false;
  BEGIN
    PERFORM public.finalizar_anulacion_cpe_tx(
      v_nota_id, v_tenant_id, NULL, 'verify-448-final-order'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%VERIFY_448_LATE_OUTBOX_FAILURE%' THEN
      v_failed := true;
    ELSE
      RAISE;
    END IF;
  END;
  PERFORM set_config('app.verify_448_fail_late', 'off', true);

  IF NOT v_failed
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe_id) <> 'ACEPTADO'
     OR (SELECT estado::text FROM public.documentos WHERE id = v_documento_id) <> 'EMITIDO'
     OR (SELECT estado::text FROM public.cuentas_por_cobrar WHERE id = v_cxc_id) <> 'PENDIENTE'
     OR (SELECT monto_pendiente FROM public.cuentas_por_cobrar WHERE id = v_cxc_id) <> 413
     OR (SELECT estado::text FROM public.pedidos_venta WHERE id = v_pedido_id) <> 'FACTURADO'
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 7
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario
       WHERE tenant_id = v_tenant_id AND referencia_id = v_nota_id
         AND referencia_tipo = 'REVERSO_VENTA_CPE_448'
     )
     OR EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant_id AND event_type = 'cpe.anulado'
         AND idempotency_key = 'verify-448-final-order'
     ) THEN
    RAISE EXCEPTION 'La falla tardía dejó efectos parciales';
  END IF;

  SELECT public.finalizar_anulacion_cpe_tx(
    v_nota_id, v_tenant_id, NULL, 'verify-448-final-order'
  ) INTO v_result;

  IF v_result->>'estado' <> 'ANULADO'
     OR (v_result->>'idempotent')::boolean
     OR (v_result->>'costo_ventas')::numeric <> 30
     OR (SELECT estado::text FROM public.cpe WHERE id = v_cpe_id) <> 'ANULADO'
     OR (SELECT estado FROM public.comprobantes_electronicos WHERE id = v_cpe_id) <> 'ANULADO'
     OR (SELECT estado::text FROM public.documentos WHERE id = v_documento_id) <> 'ANULADO'
     OR (SELECT estado::text FROM public.cuentas_por_cobrar WHERE id = v_cxc_id) <> 'ANULADA'
     OR EXISTS (
       SELECT 1 FROM public.cuentas_por_cobrar
       WHERE id = v_cxc_id
         AND (monto_pendiente <> 0 OR saldo <> 0 OR saldo_pendiente <> 0)
     )
     OR (SELECT estado::text FROM public.pedidos_venta WHERE id = v_pedido_id) <> 'CANCELADO'
     OR EXISTS (
       SELECT 1 FROM public.pedidos_venta_detalle
       WHERE pedido_id = v_pedido_id AND cantidad_facturada <> 0
     )
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 10
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id = v_tenant_id AND referencia_id = v_nota_id
           AND referencia_tipo = 'REVERSO_VENTA_CPE_448'
           AND producto_id = v_producto_id AND tipo = 'ENTRADA'
           AND cantidad = 3) <> 1
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario
       WHERE tenant_id = v_tenant_id AND referencia_id = v_nota_id
         AND producto_id = v_servicio_id
     )
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'cpe.anulado'
           AND idempotency_key = 'verify-448-final-order') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant_id AND event_type = 'cpe.anulado'
         AND idempotency_key = 'verify-448-final-order'
         AND (payload->>'base_imponible')::numeric = 350
         AND (payload->>'igv')::numeric = 63
         AND (payload->>'costo_ventas')::numeric = 30
         AND payload->>'asiento_original_id' IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'El cierre de pedido 448 no fue integral: %', v_result;
  END IF;

  -- Retry final exacto no repite stock ni outbox.
  SELECT public.finalizar_anulacion_cpe_tx(
    v_nota_id, v_tenant_id, NULL, 'verify-448-final-order'
  ) INTO v_result;
  IF NOT (v_result->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id = v_tenant_id AND referencia_id = v_nota_id
           AND referencia_tipo = 'REVERSO_VENTA_CPE_448') <> 1
     OR (SELECT count(*) FROM public.outbox_events
         WHERE tenant_id = v_tenant_id AND event_type = 'cpe.anulado'
           AND idempotency_key = 'verify-448-final-order') <> 1 THEN
    RAISE EXCEPTION 'El retry final volvió a mutar: %', v_result;
  END IF;

  v_failed := false;
  BEGIN
    PERFORM public.finalizar_anulacion_cpe_tx(
      v_nota_id, v_tenant_id, NULL, 'verify-448-final-different'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'Una key final distinta debió fallar';
  END IF;

  -- Venta POS: reversa caja y stock con los writers canónicos.
  INSERT INTO public.cajas (
    tenant_id, codigo, nombre, estado, almacen_id, tipo, creado_por
  ) VALUES (
    v_tenant_id, 'CAJA-448', 'Caja verify 448', 'ACTIVO',
    v_almacen_id, 'MOSTRADOR', v_user_id
  ) RETURNING id INTO v_caja_id;

  INSERT INTO public.sesiones_caja (
    tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
    usuario_apertura, estado, hora_apertura, fecha_apertura,
    monto_inicial, monto_inicio, monto_esperado, monto_contado,
    monto_cierre, total_efectivo, total_tarjeta, moneda
  ) VALUES (
    v_tenant_id, v_caja_id, v_user_id, v_user_id, v_user_id,
    v_user_id, 'ABIERTA', now(), now(), 100, 100, 100, 0,
    0, 0, 0, 'PEN'
  ) RETURNING id INTO v_sesion_id;

  INSERT INTO public.cpe (
    id, tenant_id, tipo_documento, serie, numero, ruc_emisor,
    razon_social_emisor, tipo_documento_receptor, documento_receptor,
    razon_social_receptor, cliente_id, moneda, total_gravadas,
    total_exoneradas, total_inafectas, total_exportacion, total_igv,
    total_venta, total, items, fecha_emision, fecha_vencimiento,
    estado, estado_sunat, sunat_status, created_by, event_id, activo
  ) VALUES (
    v_pos_cpe_id, v_tenant_id, '03', 'B448', '1', '20600000448',
    'Empresa verify 448', '6', '20123456786', 'Cliente verify 448',
    v_cliente_id, 'PEN', 50, 0, 0, 0, 9, 59, 59,
    jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_producto_id, 'codigo', 'PROD-448',
        'descripcion', 'Producto físico POS', 'unidad', 'NIU',
        'cantidad', 2, 'precio_unitario', 20, 'valor_venta', 40,
        'impuesto_igv', 7.20, 'afectacion_igv', '10'
      ),
      jsonb_build_object(
        'producto_id', v_servicio_id, 'codigo', 'SERV-448',
        'descripcion', 'Servicio POS', 'unidad', 'ZZ', 'cantidad', 1,
        'precio_unitario', 10, 'valor_venta', 10,
        'impuesto_igv', 1.80, 'afectacion_igv', '10'
      )
    ),
    now(), current_date, 'ACEPTADO', 'ACEPTADO', 'ACCEPTED',
    v_user_id, v_pos_event_id, true
  );

  INSERT INTO public.ventas_pos (
    tenant_id, estado, subtotal, impuestos, total, cliente_id,
    cliente_documento, cliente_nombre, cpe_id, sesion_caja_id,
    usuario_id, numero_ticket, serie, correlativo, metodo_pago,
    cxc_pendiente, cxc_reintentos
  ) VALUES (
    v_tenant_id, 'PAGADA', 50, 9, 59, v_cliente_id,
    '20123456786', 'Cliente verify 448', v_pos_cpe_id, v_sesion_id,
    v_user_id, 'B448-00000001', 'B448', '00000001', 'EFECTIVO',
    false, 0
  ) RETURNING id INTO v_pos_id;

  INSERT INTO public.detalle_ventas_pos (
    tenant_id, venta_pos_id, producto_id, item_index, cantidad,
    precio_unitario, descuento, impuesto, subtotal, total,
    nombre_producto, codigo_producto, estado
  ) VALUES
    (v_tenant_id, v_pos_id, v_producto_id, 1, 2, 20, 0, 7.20,
     40, 47.20, 'Producto físico POS', 'PROD-448', 'ACTIVO'),
    (v_tenant_id, v_pos_id, v_servicio_id, 2, 1, 10, 0, 1.80,
     10, 11.80, 'Servicio POS', 'SERV-448', 'ACTIVO');

  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := v_tenant_id,
    p_producto_id := v_producto_id,
    p_almacen_id := v_almacen_id,
    p_tipo := 'SALIDA',
    p_cantidad := 2,
    p_referencia_tipo := 'VENTA_POS',
    p_referencia_id := v_pos_id,
    p_notas := 'Salida POS original verify 448',
    p_created_by := v_user_id::text,
    p_metadata := jsonb_build_object('source', 'verify.448.pos')
  );

  PERFORM public.registrar_movimiento_caja(
    p_sesion_caja_id := v_sesion_id,
    p_tipo_movimiento := 'VENTA',
    p_monto := 59,
    p_referencia_documento := v_pos_id::text,
    p_referencia_tipo := 'venta_pos',
    p_motivo := 'Venta POS original verify 448',
    p_usuario_id := v_user_id,
    p_metadata := jsonb_build_object('source', 'verify.448.pos')
  );

  -- El turno de la venta puede haber cerrado. El egreso debe caer en la sesión
  -- abierta vigente sin reabrir ni alterar el arqueo histórico.
  UPDATE public.sesiones_caja
  SET estado = 'CERRADA', hora_cierre = now(), fecha_cierre = now()
  WHERE id = v_sesion_id AND tenant_id = v_tenant_id;
  INSERT INTO public.sesiones_caja (
    tenant_id, caja_id, cajero_id, usuario_id, abierto_por,
    usuario_apertura, estado, hora_apertura, fecha_apertura,
    monto_inicial, monto_inicio, monto_esperado, monto_contado,
    monto_cierre, total_efectivo, total_tarjeta, moneda
  ) VALUES (
    v_tenant_id, v_caja_id, v_user_id, v_user_id, v_user_id,
    v_user_id, 'ABIERTA', now() + interval '1 second', now(),
    100, 100, 100, 0, 0, 0, 0, 'PEN'
  ) RETURNING id INTO v_reversal_sesion_id;

  PERFORM app.verify_448_seed_accounting(
    v_tenant_id, v_pos_event_id, v_user_id, 'B448-00000001', 59
  );

  SELECT public.solicitar_anulacion_cpe_tx(
    v_pos_cpe_id, v_tenant_id, v_user_id, 'Anulación POS completa',
    '01', 'verify-448-request-pos'
  ) INTO v_result;
  v_pos_nota_id := (v_result #>> '{nota_credito,id}')::uuid;

  UPDATE public.cpe
  SET estado = 'ACEPTADO', estado_sunat = 'ACEPTADO',
      sunat_status = 'ACCEPTED', cdr_sunat = 'CDR-POS-448'
  WHERE id = v_pos_nota_id AND tenant_id = v_tenant_id;

  SELECT public.finalizar_anulacion_cpe_tx(
    v_pos_nota_id, v_tenant_id, NULL, 'verify-448-final-pos'
  ) INTO v_result;

  IF v_result->>'estado' <> 'ANULADO'
     OR (v_result->>'venta_pos_id')::uuid <> v_pos_id
     OR (v_result->>'costo_ventas')::numeric <> 20
     OR (SELECT estado FROM public.ventas_pos WHERE id = v_pos_id) <> 'ANULADA'
     OR (SELECT stock_actual FROM public.producto_existencias
         WHERE tenant_id = v_tenant_id AND producto_id = v_producto_id
           AND almacen_id = v_almacen_id) <> 10
     OR (SELECT count(*) FROM public.movimientos_caja
         WHERE tenant_id = v_tenant_id
           AND referencia_tipo = 'reverso_venta_pos'
           AND referencia_documento = v_pos_nota_id::text
           AND tipo_movimiento = 'AJUSTE' AND monto = -59
           AND sesion_caja_id = v_reversal_sesion_id
           AND (metadata->>'reverso_en_otra_sesion')::boolean
           AND metadata->>'sesion_caja_venta' = v_sesion_id::text) <> 1
     OR (SELECT count(*) FROM public.movimientos_inventario
         WHERE tenant_id = v_tenant_id AND referencia_id = v_pos_nota_id
           AND referencia_tipo = 'REVERSO_VENTA_CPE_448'
           AND producto_id = v_producto_id AND cantidad = 2) <> 1
     OR EXISTS (
       SELECT 1 FROM public.movimientos_inventario
       WHERE tenant_id = v_tenant_id AND referencia_id = v_pos_nota_id
         AND producto_id = v_servicio_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.outbox_events
       WHERE tenant_id = v_tenant_id AND event_type = 'cpe.anulado'
         AND idempotency_key = 'verify-448-final-pos'
         AND payload->>'source' = 'POS'
         AND (payload->>'costo_ventas')::numeric = 20
     ) THEN
    RAISE EXCEPTION 'El cierre POS/caja/stock 448 no fue integral: %', v_result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.outbox_events
    WHERE tenant_id = v_tenant_id
      AND event_type IN ('factura.emitida', 'venta.procesada')
      AND (
        aggregate_id IN (v_nota_id::text, v_pos_nota_id::text)
        OR payload->>'cpeId' IN (v_nota_id::text, v_pos_nota_id::text)
        OR payload->>'cpe_id' IN (v_nota_id::text, v_pos_nota_id::text)
      )
  ) THEN
    RAISE EXCEPTION 'Una nota 07 publicó un evento positivo de venta';
  END IF;

  -- Superficie de comando y ACL DML.
  IF has_function_privilege(
       'authenticated',
       'public.solicitar_anulacion_cpe_tx(uuid,uuid,uuid,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.solicitar_anulacion_cpe_tx(uuid,uuid,uuid,text,text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'app.finalizar_anulacion_cpe_tx(uuid,uuid,uuid,text)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'La superficie 448 no es service-role-only';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'cpe', 'comprobantes_electronicos', 'documentos',
    'cuentas_por_cobrar', 'pedidos_venta', 'pedidos_venta_detalle',
    'ventas_pos', 'movimientos_caja', 'movimientos_inventario',
    'producto_existencias', 'outbox_events'
  ]
  LOOP
    IF has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', v_table), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') THEN
      RAISE EXCEPTION 'DML directo sigue abierto sobre public.%', v_table;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
