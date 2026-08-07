-- A demo is a ready-to-explore company, not an onboarding shell.  This
-- migration adds the business sample that the application-level bootstrap
-- could not create atomically: sales, purchasing, finance, accounting, HR and
-- logistics.  The RPC is service-role only and every write runs in one
-- PostgreSQL transaction.

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.demo_readiness_report(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  WITH counts AS (
    SELECT
      COALESCE((SELECT bool_or(configuracion_completa AND is_demo)
                FROM public.empresa_config WHERE tenant_id = p_tenant_id), false) AS config_ready,
      COALESCE((SELECT bool_or(completado)
                FROM public.wizard_progress WHERE tenant_id = p_tenant_id), false) AS wizard_ready,
      (SELECT count(*) FROM public.productos WHERE tenant_id = p_tenant_id AND activo) AS productos,
      (SELECT count(*) FROM public.categorias_producto WHERE tenant_id = p_tenant_id AND activo) AS categorias,
      (SELECT count(*) FROM public.almacenes WHERE tenant_id = p_tenant_id AND activo) AS almacenes,
      (SELECT count(*) FROM public.movimientos_inventario WHERE tenant_id = p_tenant_id) AS kardex,
      (SELECT count(*) FROM public.clientes WHERE tenant_id = p_tenant_id AND activo) AS clientes,
      (SELECT count(*) FROM public.proveedores WHERE tenant_id = p_tenant_id AND activo) AS proveedores,
      (SELECT count(*) FROM public.ventas_pos WHERE tenant_id = p_tenant_id) AS ventas_pos,
      (SELECT count(*) FROM public.cpe WHERE tenant_id = p_tenant_id) AS cpe,
      (SELECT count(*) FROM public.pedidos_venta WHERE tenant_id = p_tenant_id) AS pedidos,
      (SELECT count(*) FROM public.ordenes_compra WHERE tenant_id = p_tenant_id) AS compras,
      (SELECT count(*) FROM public.recepciones WHERE tenant_id = p_tenant_id) AS recepciones,
      (SELECT count(*) FROM public.cuentas_por_cobrar WHERE tenant_id = p_tenant_id) AS cxc,
      (SELECT count(*) FROM public.cuentas_por_pagar WHERE tenant_id = p_tenant_id) AS cxp,
      (SELECT count(*) FROM public.cuentas_bancarias WHERE tenant_id = p_tenant_id AND activo) AS bancos,
      (SELECT count(*) FROM public.movimientos_caja WHERE tenant_id = p_tenant_id) AS caja_movimientos,
      (SELECT count(*) FROM public.asientos_contables WHERE tenant_id = p_tenant_id) AS asientos,
      (SELECT count(*) FROM public.empleados WHERE tenant_id = p_tenant_id AND activo) AS empleados,
      (SELECT count(*) FROM public.asistencias WHERE tenant_id = p_tenant_id AND activo) AS asistencias,
      (SELECT count(*) FROM public.planillas WHERE tenant_id = p_tenant_id) AS planillas,
      (SELECT count(*) FROM public.vacantes WHERE tenant_id = p_tenant_id AND activo) AS vacantes,
      (SELECT count(*) FROM public.candidatos WHERE tenant_id = p_tenant_id AND activo) AS candidatos
  )
  SELECT to_jsonb(counts) || jsonb_build_object(
    'ready',
    config_ready AND wizard_ready
      AND productos >= 6 AND categorias >= 3 AND almacenes >= 1 AND kardex >= 6
      AND clientes >= 3 AND proveedores >= 2
      AND ventas_pos >= 1 AND cpe >= 1 AND pedidos >= 2
      AND compras >= 2 AND recepciones >= 1
      AND cxc >= 1 AND cxp >= 1 AND bancos >= 1 AND caja_movimientos >= 1
      AND asientos >= 2
      AND empleados >= 2 AND asistencias >= 4 AND planillas >= 1
      AND vacantes >= 1 AND candidatos >= 1
  )
  FROM counts;
$$;

CREATE OR REPLACE FUNCTION app.hydrate_demo_business_sample_tx(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_report jsonb;
  v_almacen uuid;
  v_sesion uuid;
  v_cliente_persona uuid;
  v_cliente_empresa uuid;
  v_proveedor_1 uuid;
  v_proveedor_2 uuid;
  v_producto_1 uuid;
  v_producto_2 uuid;
  v_producto_4 uuid;
  v_producto_5 uuid;
  v_empleado_1 uuid;
  v_empleado_2 uuid := gen_random_uuid();
  v_vacante uuid := gen_random_uuid();
  v_planilla uuid := gen_random_uuid();
  v_pedido_1 uuid := gen_random_uuid();
  v_pedido_2 uuid := gen_random_uuid();
  v_pos uuid := gen_random_uuid();
  v_documento uuid := gen_random_uuid();
  v_cpe uuid := gen_random_uuid();
  v_cxc uuid := gen_random_uuid();
  v_oc_1 uuid := gen_random_uuid();
  v_oc_2 uuid := gen_random_uuid();
  v_recepcion uuid := gen_random_uuid();
  v_recepcion_detalle uuid := gen_random_uuid();
  v_cxp uuid := gen_random_uuid();
  v_asiento_venta uuid := gen_random_uuid();
  v_asiento_compra uuid := gen_random_uuid();
  v_cuenta_10 uuid;
  v_cuenta_12 uuid;
  v_cuenta_42 uuid;
  v_cuenta_60 uuid;
  v_cuenta_70 uuid;
  v_metodo_efectivo uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'tenant y usuario son obligatorios para hidratar la demo';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 383));

  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_config
    WHERE tenant_id = p_tenant_id AND is_demo = true
  ) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa', p_tenant_id;
  END IF;

  UPDATE public.empresa_config
  SET ruc = '20123456786',
      razon_social = COALESCE(NULLIF(razon_social, ''), 'DEMO COMERCIAL S.A.C.'),
      nombre_comercial = COALESCE(NULLIF(nombre_comercial, ''), 'Demo Comercial'),
      direccion_fiscal = 'Av. Demo 123, Miraflores, Lima',
      direccion = 'Av. Demo 123, Miraflores, Lima',
      departamento = 'LIMA', provincia = 'LIMA', distrito = 'MIRAFLORES',
      ubigeo = '150122', pais = 'PE', pais_id = 1, moneda_defecto = 'PEN',
      configuracion_completa = true,
      regimen_tributario = 'GENERAL', igv_porcentaje = 18,
      serie_factura = 'F001', serie_boleta = 'B001', serie_nota_credito = 'FC01',
      sunat_environment = 'homologacion',
      sunat_username = '20123456786MODDATOS', sunat_password = 'MODDATOS',
      gre_automatico_habilitado = false, gre_obligatorio = false,
      usar_flujo_logistica = true,
      updated_at = now()
  WHERE tenant_id = p_tenant_id;

  INSERT INTO public.wizard_progress (
    tenant_id, paso_actual, pasos_completados, configuracion_temporal,
    completado, completado_at
  ) VALUES (
    p_tenant_id, 8, ARRAY[1,2,3,4,5,6,7,8],
    jsonb_build_object('source', 'demo_business_seed_v1', 'pais', 'PE'),
    true, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET paso_actual = 8,
      pasos_completados = ARRAY[1,2,3,4,5,6,7,8],
      configuracion_temporal = EXCLUDED.configuracion_temporal,
      completado = true,
      completado_at = COALESCE(public.wizard_progress.completado_at, now()),
      updated_at = now();

  INSERT INTO public.categorias_producto (tenant_id, nombre, codigo, descripcion, orden)
  SELECT p_tenant_id, x.nombre, x.codigo, x.descripcion, x.orden
  FROM (VALUES
    ('Alimentos', 'ALIMENTOS', 'Abarrotes y alimentos de la demo', 1),
    ('Oficina', 'OFICINA', 'Útiles y suministros de oficina', 2),
    ('Electrónica', 'ELECTRONICA', 'Accesorios electrónicos', 3),
    ('Hogar', 'HOGAR', 'Limpieza y hogar', 4)
  ) AS x(nombre, codigo, descripcion, orden)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categorias_producto c
    WHERE c.tenant_id = p_tenant_id AND upper(c.codigo) = x.codigo
  );

  SELECT id INTO v_almacen FROM public.almacenes
  WHERE tenant_id = p_tenant_id AND codigo = 'ALM-PRINCIPAL' AND activo LIMIT 1;
  SELECT id INTO v_sesion FROM public.sesiones_caja
  WHERE tenant_id = p_tenant_id AND lower(estado::text) = 'abierta' ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_cliente_persona FROM public.clientes
  WHERE tenant_id = p_tenant_id AND codigo = '12345678' LIMIT 1;
  SELECT id INTO v_cliente_empresa FROM public.clientes
  WHERE tenant_id = p_tenant_id AND ruc = '20600000013' LIMIT 1;
  SELECT id INTO v_proveedor_1 FROM public.proveedores
  WHERE tenant_id = p_tenant_id ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_proveedor_2 FROM public.proveedores
  WHERE tenant_id = p_tenant_id ORDER BY created_at, id OFFSET 1 LIMIT 1;
  SELECT id INTO v_producto_1 FROM public.productos WHERE tenant_id = p_tenant_id AND codigo = 'DEMO-001';
  SELECT id INTO v_producto_2 FROM public.productos WHERE tenant_id = p_tenant_id AND codigo = 'DEMO-002';
  SELECT id INTO v_producto_4 FROM public.productos WHERE tenant_id = p_tenant_id AND codigo = 'DEMO-004';
  SELECT id INTO v_producto_5 FROM public.productos WHERE tenant_id = p_tenant_id AND codigo = 'DEMO-005';
  SELECT id INTO v_empleado_1 FROM public.empleados
  WHERE tenant_id = p_tenant_id AND activo ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_cuenta_10 FROM public.plan_cuentas WHERE tenant_id = p_tenant_id AND codigo = '10' LIMIT 1;
  SELECT id INTO v_cuenta_12 FROM public.plan_cuentas WHERE tenant_id = p_tenant_id AND codigo = '12' LIMIT 1;
  SELECT id INTO v_cuenta_42 FROM public.plan_cuentas WHERE tenant_id = p_tenant_id AND codigo = '42' LIMIT 1;
  SELECT id INTO v_cuenta_60 FROM public.plan_cuentas WHERE tenant_id = p_tenant_id AND codigo = '60' LIMIT 1;
  SELECT id INTO v_cuenta_70 FROM public.plan_cuentas WHERE tenant_id = p_tenant_id AND codigo = '70' LIMIT 1;
  SELECT id INTO v_metodo_efectivo FROM public.metodos_pago
  WHERE tenant_id = p_tenant_id AND codigo = 'EFECTIVO' LIMIT 1;

  IF v_almacen IS NULL OR v_sesion IS NULL OR v_cliente_persona IS NULL OR
     v_cliente_empresa IS NULL OR v_proveedor_1 IS NULL OR v_proveedor_2 IS NULL OR
     v_producto_1 IS NULL OR v_producto_2 IS NULL OR v_producto_4 IS NULL OR
     v_producto_5 IS NULL OR v_empleado_1 IS NULL OR v_cuenta_10 IS NULL OR
     v_cuenta_12 IS NULL OR v_cuenta_42 IS NULL OR v_cuenta_60 IS NULL OR
     v_cuenta_70 IS NULL OR v_metodo_efectivo IS NULL THEN
    RAISE EXCEPTION 'La semilla base de la demo está incompleta; no se crearán datos parciales';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.planillas
    WHERE tenant_id = p_tenant_id AND metadata->>'source' = 'demo_business_seed_v1'
  ) THEN
    v_report := app.demo_readiness_report(p_tenant_id);
    IF COALESCE((v_report->>'ready')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'La demo ya fue sembrada pero no supera el contrato de preparación: %', v_report;
    END IF;
    RETURN v_report;
  END IF;

  INSERT INTO public.sucursales (tenant_id, nombre, codigo, estado, metadata)
  SELECT p_tenant_id, 'Sede Lima', 'LIM-001', 'ACTIVO', '{"source":"demo_business_seed_v1"}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.sucursales WHERE tenant_id = p_tenant_id);

  INSERT INTO public.empleados (
    id, tenant_id, nombres, apellidos, nombre, codigo, tipo_documento,
    numero_documento, email, telefono, puesto, fecha_ingreso, estado, activo,
    cuenta_bancaria, banco, tipo_cuenta, metadata
  ) VALUES (
    v_empleado_2, p_tenant_id, 'Carlos Alberto', 'Rojas Díaz', 'Carlos Alberto Rojas Díaz',
    'EMP-DEMO-002', 'DNI', '70889966', 'crojas@demo.local', '999888777',
    'Ejecutivo de Ventas', current_date - 420, 'activo', true,
    '194-7654321-0-11', 'BCP', 'AHORROS', '{"source":"demo_business_seed_v1"}'::jsonb
  );
  INSERT INTO public.contratos (
    tenant_id, empleado_id, id_empleado, tipo_contrato, fecha_inicio,
    sueldo_bruto, salario, moneda, regimen_pensionario, jornada_laboral,
    estado, activo, metadata
  ) VALUES (
    p_tenant_id, v_empleado_2, v_empleado_2, 'INDEFINIDO', current_date - 420,
    3200, 3200, 'PEN', 'AFP', 'COMPLETA', 'VIGENTE', true,
    '{"source":"demo_business_seed_v1"}'::jsonb
  );

  INSERT INTO public.asistencias (
    tenant_id, empleado_id, id_empleado, fecha, hora_entrada, hora_salida,
    horas_trabajadas, tardanza_minutos, turno, estado, origen, activo, metadata
  )
  SELECT p_tenant_id, e.id, e.id, d::date,
         CASE WHEN e.id = v_empleado_2 AND d::date = current_date - 1 THEN '08:12'::time ELSE '08:00'::time END,
         '17:00'::time,
         CASE WHEN e.id = v_empleado_2 AND d::date = current_date - 1 THEN 7.8 ELSE 8 END,
         CASE WHEN e.id = v_empleado_2 AND d::date = current_date - 1 THEN 12 ELSE 0 END,
         'manana',
         CASE WHEN e.id = v_empleado_2 AND d::date = current_date - 1 THEN 'tardanza' ELSE 'presente' END,
         'sistema', true, '{"source":"demo_business_seed_v1"}'::jsonb
  FROM (VALUES (v_empleado_1), (v_empleado_2)) e(id)
  CROSS JOIN generate_series(current_date - 5, current_date - 1, interval '1 day') d
  WHERE extract(isodow FROM d) < 6;

  INSERT INTO public.vacantes (
    id, tenant_id, titulo, puesto_solicitado, departamento, ubicacion,
    tipo_contrato, salario_minimo, salario_maximo, salario_min, salario_max,
    experiencia_requerida, requisitos, beneficios, fecha_publicacion,
    fecha_limite, estado, activo, metadata
  ) VALUES (
    v_vacante, p_tenant_id, 'Analista de Inventarios', 'Analista de Inventarios',
    'Operaciones', 'Lima - híbrido', 'INDEFINIDO', 2800, 3600, 2800, 3600,
    '2 años', 'Excel intermedio, control de stock y orientación al detalle',
    'EPS, capacitaciones y bono por desempeño', current_date - 4, current_date + 20,
    'ACTIVO', true, '{"source":"demo_business_seed_v1"}'::jsonb
  );
  INSERT INTO public.candidatos (
    tenant_id, id_vacante, vacante_id, nombres, apellidos, nombre, email,
    telefono, tipo_documento, numero_documento, experiencia_anos,
    pretension_salarial, estado, estado_proceso, disponibilidad_inmediata,
    activo, fecha_postulacion, metadata
  ) VALUES (
    p_tenant_id, v_vacante, v_vacante, 'Lucía Fernanda', 'Torres Vega',
    'Lucía Fernanda Torres Vega', 'ltorres@candidato.demo', '988776655',
    'DNI', '73334455', 3, 3300, 'ACTIVO', 'ENTREVISTA', true, true,
    now() - interval '2 days', '{"source":"demo_business_seed_v1"}'::jsonb
  );

  INSERT INTO public.planillas (
    id, tenant_id, nombre, codigo, periodo, estado, estado_pago,
    total_ingresos, total_descuentos, total_aportes, total_neto,
    pais_codigo, moneda, metadata
  ) VALUES (
    v_planilla, p_tenant_id, 'Planilla demo ' || to_char(current_date, 'YYYY-MM'),
    'PLAN-DEMO-' || to_char(current_date, 'YYYYMM'), to_char(current_date, 'YYYY-MM'),
    'calculada', 'pendiente', 5813, 755.69, 523.17, 5057.31,
    'PE', 'PEN', '{"source":"demo_business_seed_v1"}'::jsonb
  );
  INSERT INTO public.empleado_planilla (
    tenant_id, planilla_id, empleado_id, id_planilla, id_empleado,
    dias_trabajados, total_ingresos, total_descuentos, total_aportes,
    neto_pagar, estado_pago, metadata
  ) VALUES
    (p_tenant_id, v_planilla, v_empleado_1, v_planilla::text, v_empleado_1::text,
     30, 2613, 339.69, 235.17, 2273.31, 'pendiente', '{"source":"demo_business_seed_v1"}'::jsonb),
    (p_tenant_id, v_planilla, v_empleado_2, v_planilla::text, v_empleado_2::text,
     30, 3200, 416, 288, 2784, 'pendiente', '{"source":"demo_business_seed_v1"}'::jsonb);

  INSERT INTO public.pedidos_venta (
    id, tenant_id, numero, cliente_id, fecha, fecha_pedido, estado,
    estado_credito, moneda, subtotal, igv, total, tracking_estado,
    requiere_aprobacion, created_by, metadata
  ) VALUES
    (v_pedido_1, p_tenant_id, 'PED-DEMO-001', v_cliente_persona, current_date, current_date,
     'CONFIRMADO', 'APROBADO', 'PEN', 100, 18, 118, 'PENDIENTE', false, p_user_id,
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (v_pedido_2, p_tenant_id, 'PED-DEMO-002', v_cliente_empresa, current_date, current_date,
     'LISTO_DESPACHO', 'APROBADO', 'PEN', 65, 11.70, 76.70, 'PREPARADO', false, p_user_id,
     '{"source":"demo_business_seed_v1"}'::jsonb);
  INSERT INTO public.pedidos_venta_detalle (
    tenant_id, pedido_id, producto_id, descripcion, cantidad, precio_unitario,
    subtotal, estado_item, cantidad_despachada, cantidad_facturada, metadata
  ) VALUES
    (p_tenant_id, v_pedido_1, v_producto_1, 'Café Molido Premium 250g', 4, 25, 100, 'PENDIENTE', 0, 0,
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (p_tenant_id, v_pedido_2, v_producto_2, 'Azúcar Rubia 1kg', 10, 6.5, 65, 'PREPARADO', 0, 0,
     '{"source":"demo_business_seed_v1"}'::jsonb);
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id, p_producto_id := v_producto_1,
    p_almacen_id := v_almacen, p_tipo := 'RESERVA', p_cantidad := 4,
    p_referencia_tipo := 'PEDIDO_VENTA', p_referencia_id := v_pedido_1,
    p_notas := 'Reserva de pedido demo',
    p_metadata := jsonb_build_object('source', 'demo_business_seed_v1', 'costo_unitario', 18)
  );
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id, p_producto_id := v_producto_2,
    p_almacen_id := v_almacen, p_tipo := 'RESERVA', p_cantidad := 10,
    p_referencia_tipo := 'PEDIDO_VENTA', p_referencia_id := v_pedido_2,
    p_notas := 'Reserva de pedido listo para despacho demo',
    p_metadata := jsonb_build_object('source', 'demo_business_seed_v1', 'costo_unitario', 4.8)
  );

  INSERT INTO public.ventas_pos (
    id, tenant_id, numero_ticket, serie, correlativo, idempotency_key,
    cliente_id, cliente_documento, cliente_nombre, usuario_id, sesion_caja_id,
    fecha, subtotal, impuestos, total, metodo_pago, estado, activo,
    cpe_pendiente, cxc_pendiente, metadata
  ) VALUES (
    v_pos, p_tenant_id, 'T001-00000001', 'T001', '00000001',
    'demo-pos-' || p_tenant_id, v_cliente_persona, '12345678', 'Juan Pérez Demo',
    p_user_id, v_sesion, now() - interval '1 hour', 53.39, 9.61, 63,
    'EFECTIVO', 'ACTIVO', true, false, false,
    '{"source":"demo_business_seed_v1"}'::jsonb
  );
  INSERT INTO public.detalle_ventas_pos (
    tenant_id, venta_id, venta_pos_id, item_index, producto_id,
    nombre_producto, codigo_producto, cantidad, precio_unitario,
    impuesto, subtotal, total, unidad_medida, metadata
  ) VALUES
    (p_tenant_id, v_pos, v_pos, 1, v_producto_1, 'Café Molido Premium 250g', 'DEMO-001',
     2, 25, 7.63, 42.37, 50, 'NIU', '{"source":"demo_business_seed_v1"}'::jsonb),
    (p_tenant_id, v_pos, v_pos, 2, v_producto_2, 'Azúcar Rubia 1kg', 'DEMO-002',
     2, 6.5, 1.98, 11.02, 13, 'NIU', '{"source":"demo_business_seed_v1"}'::jsonb);
  INSERT INTO public.ventas_pos_pagos (
    tenant_id, venta_pos_id, metodo_pago_id, metodo_pago_codigo,
    metodo_pago_tipo, monto, moneda, metadata
  ) VALUES (
    p_tenant_id, v_pos, v_metodo_efectivo, 'EFECTIVO', 'EFECTIVO', 63, 'PEN',
    '{"source":"demo_business_seed_v1"}'::jsonb
  );
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id, p_producto_id := v_producto_1,
    p_almacen_id := v_almacen, p_tipo := 'SALIDA', p_cantidad := 2,
    p_referencia_tipo := 'VENTA_POS', p_referencia_id := v_pos,
    p_notas := 'Venta POS de ejemplo',
    p_metadata := jsonb_build_object('source', 'demo_business_seed_v1', 'costo_unitario', 18)
  );
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id, p_producto_id := v_producto_2,
    p_almacen_id := v_almacen, p_tipo := 'SALIDA', p_cantidad := 2,
    p_referencia_tipo := 'VENTA_POS', p_referencia_id := v_pos,
    p_notas := 'Venta POS de ejemplo',
    p_metadata := jsonb_build_object('source', 'demo_business_seed_v1', 'costo_unitario', 4.8)
  );
  INSERT INTO public.movimientos_caja (
    tenant_id, sesion_caja_id, tipo_movimiento, monto, saldo_anterior,
    saldo_nuevo, motivo, referencia_tipo, referencia_documento,
    usuario_id, secuencia, metadata
  ) VALUES (
    p_tenant_id, v_sesion, 'INGRESO', 63, 100, 163,
    'Venta POS demo', 'VENTA_POS', v_pos::text, p_user_id, 1,
    '{"source":"demo_business_seed_v1"}'::jsonb
  );
  UPDATE public.sesiones_caja
  SET total_efectivo = 63, monto_esperado = 163, updated_at = now()
  WHERE id = v_sesion AND tenant_id = p_tenant_id;

  INSERT INTO public.documentos (
    id, tenant_id, tipo_documento, serie, numero, estado, estado_sunat,
    fecha_emision, fecha_vencimiento, moneda, subtotal, impuesto_igv, total,
    emisor_ruc, emisor_razon_social, emisor_direccion,
    cliente_id, receptor_tipo_doc, receptor_numero_doc, receptor_razon_social,
    metodo_pago, created_by, total_gravadas, metadata
  ) VALUES (
    v_documento, p_tenant_id, 'FACTURA', 'F001', '00000001', 'EMITIDO', 'ACEPTADO',
    now() - interval '1 day', now() + interval '29 days', 'PEN', 152.37, 27.43, 179.80,
    '20123456786', 'DEMO COMERCIAL S.A.C.', 'Av. Demo 123, Miraflores, Lima',
    v_cliente_empresa, '6', '20600000013', 'COMERCIAL ANDINA DEMO S.A.C.',
    'CREDITO', p_user_id, 152.37,
    '{"source":"demo_business_seed_v1","simulated":true}'::jsonb
  );
  INSERT INTO public.cpe (
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
  );
  INSERT INTO public.ventas (
    tenant_id, fecha, numero_documento, tipo_documento, cliente_id, vendedor_id,
    metodo_pago, moneda, subtotal, igv, total, estado, activo,
    idempotency_key, metadata
  ) VALUES (
    p_tenant_id, current_date - 1, 'F001-00000001', 'FACTURA', v_cliente_empresa,
    p_user_id, 'CREDITO', 'PEN', 152.37, 27.43, 179.80, 'EMITIDA', true,
    'demo-venta-' || p_tenant_id, '{"source":"demo_business_seed_v1"}'::jsonb
  );
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id, p_producto_id := v_producto_4,
    p_almacen_id := v_almacen, p_tipo := 'SALIDA', p_cantidad := 2,
    p_referencia_tipo := 'CPE', p_referencia_id := v_cpe,
    p_notas := 'Factura demo aceptada en homologación',
    p_metadata := jsonb_build_object('source', 'demo_business_seed_v1', 'costo_unitario', 60)
  );
  INSERT INTO public.cuentas_por_cobrar (
    id, tenant_id, cliente_id, documento_id, fecha_emision, fecha_vencimiento,
    numero_documento, tipo_documento, serie, numero, moneda,
    monto_total, monto_original, total, monto_pendiente, saldo, saldo_pendiente,
    estado, dias_mora, event_id, event_source, idempotency_key, metadata
  ) VALUES (
    v_cxc, p_tenant_id, v_cliente_empresa, v_documento, current_date - 1, current_date + 29,
    'F001-00000001', 'FACTURA', 'F001', '00000001', 'PEN',
    179.80, 179.80, 179.80, 179.80, 179.80, 179.80,
    'PENDIENTE', 0, gen_random_uuid(), 'demo_business_seed',
    'demo-cxc-' || p_tenant_id, '{"source":"demo_business_seed_v1"}'::jsonb
  );

  INSERT INTO public.ordenes_compra (
    id, tenant_id, numero, numero_orden, proveedor_id, fecha, fecha_orden,
    fecha_entrega, fecha_entrega_esperada, almacen_destino_id, moneda,
    subtotal, igv, total, estado, activo, condiciones_pago, dias_credito,
    created_by, aprobado_by, aprobado_at, items, metadata
  ) VALUES
    (v_oc_1, p_tenant_id, 'OC-DEMO-001', 'OC-DEMO-001', v_proveedor_1,
     current_date - 3, current_date - 3, current_date + 5, current_date + 5,
     v_almacen, 'PEN', 300, 54, 354, 'APROBADA', true, 'CREDITO', 30,
     p_user_id, p_user_id, now() - interval '2 days',
     jsonb_build_array(jsonb_build_object('producto_id', v_producto_4, 'cantidad', 5, 'precio_unitario', 60)),
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (v_oc_2, p_tenant_id, 'OC-DEMO-002', 'OC-DEMO-002', v_proveedor_2,
     current_date - 8, current_date - 8, current_date - 2, current_date - 2,
     v_almacen, 'PEN', 100, 18, 118, 'RECIBIDA', true, 'CREDITO', 15,
     p_user_id, p_user_id, now() - interval '7 days',
     jsonb_build_array(jsonb_build_object('producto_id', v_producto_5, 'cantidad', 10, 'precio_unitario', 10)),
     '{"source":"demo_business_seed_v1"}'::jsonb);
  INSERT INTO public.orden_compra_detalles (
    id, tenant_id, orden_id, producto_id, descripcion, cantidad,
    cantidad_recibida, cantidad_pendiente, precio_unitario, subtotal, moneda, metadata
  ) VALUES
    (gen_random_uuid(), p_tenant_id, v_oc_1, v_producto_4, 'Audífonos Bluetooth', 5, 0, 5, 60, 300, 'PEN',
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (v_recepcion_detalle, p_tenant_id, v_oc_2, v_producto_5, 'Detergente Líquido 1L', 10, 10, 0, 10, 100, 'PEN',
     '{"source":"demo_business_seed_v1"}'::jsonb);
  INSERT INTO public.recepciones (
    id, tenant_id, numero, orden_id, fecha_recepcion, estado, activo,
    observaciones, created_by, cerrado_at, cerrado_por, metadata
  ) VALUES (
    v_recepcion, p_tenant_id, 'REC-DEMO-001', v_oc_2, now() - interval '2 days',
    'CERRADA', true, 'Recepción completa de mercadería demo', p_user_id,
    now() - interval '2 days', p_user_id::text,
    '{"source":"demo_business_seed_v1"}'::jsonb
  );
  INSERT INTO public.recepcion_items (
    tenant_id, recepcion_id, detalle_id, producto_id, almacen_id,
    cantidad_recibida, calidad, moneda, metadata
  ) VALUES (
    p_tenant_id, v_recepcion, v_recepcion_detalle, v_producto_5, v_almacen,
    10, 'CONFORME', 'PEN', '{"source":"demo_business_seed_v1"}'::jsonb
  );
  PERFORM public.aplicar_movimiento_inventario_tx(
    p_tenant_id := p_tenant_id, p_producto_id := v_producto_5,
    p_almacen_id := v_almacen, p_tipo := 'ENTRADA', p_cantidad := 10,
    p_referencia_tipo := 'RECEPCION_COMPRA', p_referencia_id := v_recepcion,
    p_notas := 'Recepción de compra demo',
    p_metadata := jsonb_build_object('source', 'demo_business_seed_v1', 'costo_unitario', 10)
  );
  INSERT INTO public.cuentas_por_pagar (
    id, tenant_id, proveedor_id, orden_id, recepcion_id,
    fecha_emision, fecha_vencimiento, numero_documento, tipo_documento,
    moneda, subtotal, igv, total, saldo, saldo_pendiente, estado,
    condiciones_pago, dias_credito, discrepancias, estado_comparacion,
    idempotency_key, created_by, metadata
  ) VALUES (
    v_cxp, p_tenant_id, v_proveedor_2, v_oc_2, v_recepcion,
    current_date - 2, current_date + 13, 'F001-900001', 'FACTURA',
    'PEN', 100, 18, 118, 118, 118, 'PENDIENTE', 'CREDITO', 15,
    '[]'::jsonb, 'OK', 'demo-cxp-' || p_tenant_id, p_user_id,
    '{"source":"demo_business_seed_v1"}'::jsonb
  );

  INSERT INTO public.asientos_contables (
    id, tenant_id, numero_asiento, fecha, tipo_asiento, concepto, descripcion,
    origen, referencia, total_debe, total_haber, estado, usuario_id, metadata
  ) VALUES
    (v_asiento_venta, p_tenant_id, 1, now() - interval '1 day', 'VENTA',
     'Factura demo F001-00000001', 'Venta a crédito de demostración', 'CPE',
     v_cpe::text, 179.80, 179.80, 'CONFIRMADO', p_user_id,
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (v_asiento_compra, p_tenant_id, 2, now() - interval '2 days', 'COMPRA',
     'Compra demo F001-900001', 'Recepción de compra a crédito', 'RECEPCION',
     v_recepcion::text, 118, 118, 'CONFIRMADO', p_user_id,
     '{"source":"demo_business_seed_v1"}'::jsonb);
  INSERT INTO public.detalle_asientos (
    tenant_id, asiento_id, cuenta_id, debe, haber, concepto, fecha, metadata
  ) VALUES
    (p_tenant_id, v_asiento_venta, v_cuenta_12, 179.80, 0, 'Cuenta por cobrar demo', now() - interval '1 day',
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (p_tenant_id, v_asiento_venta, v_cuenta_70, 0, 179.80, 'Venta demo', now() - interval '1 day',
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (p_tenant_id, v_asiento_compra, v_cuenta_60, 118, 0, 'Compra demo', now() - interval '2 days',
     '{"source":"demo_business_seed_v1"}'::jsonb),
    (p_tenant_id, v_asiento_compra, v_cuenta_42, 0, 118, 'Cuenta por pagar demo', now() - interval '2 days',
     '{"source":"demo_business_seed_v1"}'::jsonb);

  INSERT INTO public.cotizaciones (
    tenant_id, numero, cliente_id, fecha, fecha_cotizacion, fecha_vencimiento,
    estado, moneda, subtotal, igv, total, probabilidad, created_by, activo,
    items, metadata
  ) VALUES (
    p_tenant_id, 'COT-DEMO-001', v_cliente_empresa, current_date, current_date,
    current_date + 15, 'PENDIENTE', 'PEN', 350, 63, 413, 65, p_user_id, true,
    jsonb_build_array(jsonb_build_object('producto_id', v_producto_4, 'cantidad', 4, 'precio_unitario', 89.9)),
    '{"source":"demo_business_seed_v1"}'::jsonb
  );

  v_report := app.demo_readiness_report(p_tenant_id);
  IF COALESCE((v_report->>'ready')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El contrato de demo preparada no se cumplió: %', v_report;
  END IF;
  RETURN v_report;
END;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_demo_business_sample_tx(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.hydrate_demo_business_sample_tx(p_tenant_id, p_user_id);
$$;

-- Recovery is deliberately narrow: only a freshly-created demo can be
-- discarded. It is used when bootstrap fails so no partial tenant is handed to
-- a prospect or left behind as misleading data.
CREATE OR REPLACE FUNCTION public.rollback_failed_demo_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_is_fresh_demo boolean;
BEGIN
  SELECT is_demo = true AND demo_created_at >= now() - interval '30 minutes'
  INTO v_is_fresh_demo
  FROM public.empresa_config
  WHERE tenant_id = p_tenant_id;

  IF COALESCE(v_is_fresh_demo, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo se puede revertir una demo fallida creada en los últimos 30 minutos';
  END IF;

  DELETE FROM public.tenants WHERE id = p_tenant_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app.demo_readiness_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.hydrate_demo_business_sample_tx(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hydrate_demo_business_sample_tx(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_failed_demo_tenant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hydrate_demo_business_sample_tx(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_failed_demo_tenant(uuid) TO service_role;

COMMENT ON FUNCTION public.hydrate_demo_business_sample_tx(uuid, uuid) IS
  'Hidrata de forma transaccional una demo peruana ya configurada con datos coherentes de todos los módulos principales.';
COMMENT ON FUNCTION public.rollback_failed_demo_tenant(uuid) IS
  'Revierte exclusivamente un tenant demo recién creado cuyo bootstrap falló.';
