-- 497__demo_pos_canonical_writer_and_supervisor_pin.sql
--
-- Bloqueador: la sesión de caja de la demo peruana no podía cerrarse nunca.
--
-- Causa raíz. `app.hydrate_demo_business_sample_tx` creaba la venta POS con un
-- INSERT directo sobre `ventas_pos` en lugar de usar el writer canónico. Ese
-- INSERT dejaba `accounting_event_id`, `atomic_result` y `documento_id` en NULL
-- y, peor, marcaba `cpe_pendiente = true` sobre un ticket interno `T001` puro.
-- `docs/MODULES.md` establece que "un ticket interno puro no es un CPE pendiente
-- y no bloquea el cierre", así que ese flag era además una violación directa del
-- invariante documentado. Con la fila así, `cerrar_caja_tx` fallaba primero con
-- CASH_CLOSE_HAS_PENDING_CPE y, corregido eso, con
-- CASH_CLOSE_HAS_INCOMPLETE_POS_SALE. La demo nacía con una caja que ningún
-- flujo podía cuadrar.
--
-- Arreglo de fondo, no parche. El seed deja de tener una vía propia para crear
-- ventas POS: llama a `public.pos_registrar_venta_atomic_tx` con
-- `emitir_cpe = false`, exactamente igual que el POS real. Se eliminan las
-- escrituras que el seed duplicaba a mano y que el writer ya realiza (detalle,
-- pagos, dos movimientos de inventario, movimiento de caja y el UPDATE de
-- totales de la sesión). Queda una sola forma de crear una venta POS en todo el
-- sistema, de modo que el dato demo no puede volver a divergir del productivo.
--
-- Nota sobre importes. El seed escribía 53.39 / 9.61 / 63 tratando el precio de
-- catálogo como IGV incluido, mientras el motor de precios (writer y POS web) lo
-- trata como neto. Ahora los importes se derivan del catálogo y de la tasa del
-- tenant, así que la demo deja de contradecir al propio sistema. Para el
-- catálogo vigente la venta pasa a ser subtotal 63.00, IGV 11.34, total 74.34.
-- Ningún test ni verificador dependía de los valores anteriores.
--
-- Segunda parte: autorización real de supervisor. `cerrar_caja_tx` ya exige un
-- `supervisor_id` cuando la diferencia supera la tolerancia
-- (CASH_CLOSE_SUPERVISOR_REQUIRED), pero el backend aceptaba como válido
-- cualquier código de seis dígitos: comprobaba formato y rol, y dejaba la
-- verificación real como TODO.
--
-- La tabla `supervisor_pins` ya estaba completamente modelada desde las
-- migraciones 185 y 186 (hash_pin, algoritmo, pin_version, intentos_fallidos,
-- ultimo_intento_at, bloqueado_hasta, índice único de un PIN activo por usuario,
-- CHECK de runtime y RLS forzada). Lo que faltaba no era esquema sino el código
-- que lo usara. Por eso esta migración no añade columnas, índices ni constraints
-- a esa tabla: sólo agrega las dos RPC que faltaban, escritas contra el modelo
-- existente. Duplicar el contrato habría dejado dos definiciones compitiendo.

BEGIN;

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
  v_pos uuid;
  v_pos_result jsonb;
  v_pos_tasa_igv numeric;
  v_pos_precio_1 numeric;
  v_pos_precio_2 numeric;
  v_pos_subtotal_1 numeric;
  v_pos_subtotal_2 numeric;
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

  -- La venta POS de la demo pasa por el writer canónico, no por un INSERT
  -- directo. El INSERT crudo dejaba la venta sin accounting_event_id, sin
  -- atomic_result y sin documento interno, y además marcaba cpe_pendiente en un
  -- ticket Txxx puro. Con eso `cerrar_caja_tx` rechazaba el cierre de la sesión
  -- demo (CASH_CLOSE_HAS_PENDING_CPE primero y CASH_CLOSE_HAS_INCOMPLETE_POS_SALE
  -- después) y la caja quedaba imposible de cuadrar.
  --
  -- Al pasar por el writer, el dato demo es por construcción indistinguible del
  -- productivo: mismo documento interno, mismo asiento, mismo outbox, mismo
  -- movimiento de caja con su secuencia y mismos movimientos de inventario. No
  -- hay una segunda forma de crear una venta POS que pueda volver a divergir.
  --
  -- `emitir_cpe = false` produce el ticket interno T001 canjeable que la demo
  -- quiere mostrar, y que MODULES.md define como "ticket interno puro": no es un
  -- CPE pendiente y no bloquea el cierre.
  --
  -- Los importes se derivan del catálogo y de la tasa del tenant. El seed ya no
  -- fija dinero a mano: antes escribía 53.39 / 9.61 / 63 tratando el precio como
  -- IGV incluido, mientras el motor de precios lo trata como neto. Derivarlos
  -- evita que la demo vuelva a contradecir al propio sistema.
  SELECT round(GREATEST(COALESCE(igv_porcentaje, 18), 0) / 100, 6)
    INTO v_pos_tasa_igv
  FROM public.empresa_config
  WHERE tenant_id = p_tenant_id;

  SELECT round(COALESCE(NULLIF(precio_venta, 0), 0), 6)
    INTO v_pos_precio_1
  FROM public.productos
  WHERE id = v_producto_1 AND tenant_id = p_tenant_id;

  SELECT round(COALESCE(NULLIF(precio_venta, 0), 0), 6)
    INTO v_pos_precio_2
  FROM public.productos
  WHERE id = v_producto_2 AND tenant_id = p_tenant_id;

  IF COALESCE(v_pos_tasa_igv, 0) <= 0
     OR COALESCE(v_pos_precio_1, 0) <= 0
     OR COALESCE(v_pos_precio_2, 0) <= 0 THEN
    RAISE EXCEPTION 'La semilla demo no puede construir la venta POS sin tasa fiscal ni precios de catálogo';
  END IF;

  v_pos_subtotal_1 := round(2 * v_pos_precio_1, 2);
  v_pos_subtotal_2 := round(2 * v_pos_precio_2, 2);

  v_pos_result := public.pos_registrar_venta_atomic_tx(
    p_tenant_id,
    p_user_id,
    v_sesion,
    'demo-pos-' || p_tenant_id,
    jsonb_build_object(
      'emitir_cpe', false,
      'ticket_serie', 'T001',
      'moneda', 'PEN',
      'cliente_id', v_cliente_persona,
      'cliente_documento', '12345678',
      'cliente_tipo_documento', '1',
      'cliente_nombre', 'Juan Pérez Demo',
      'metodo_pago', 'EFECTIVO',
      'items', jsonb_build_array(
        jsonb_build_object(
          'producto_id', v_producto_1,
          'cantidad', 2,
          'precio_unitario', v_pos_precio_1,
          'descuento_monto', 0,
          'subtotal', v_pos_subtotal_1,
          'igv', round(v_pos_subtotal_1 * v_pos_tasa_igv, 2)
        ),
        jsonb_build_object(
          'producto_id', v_producto_2,
          'cantidad', 2,
          'precio_unitario', v_pos_precio_2,
          'descuento_monto', 0,
          'subtotal', v_pos_subtotal_2,
          'igv', round(v_pos_subtotal_2 * v_pos_tasa_igv, 2)
        )
      )
    )
  );

  v_pos := app.to_uuid_or_null(COALESCE(v_pos_result->>'venta_id', ''));
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'La venta POS demo no fue registrada por el writer canónico';
  END IF;

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

-- ---------------------------------------------------------------------------
-- Autorización de supervisor: se conecta el modelo que ya existía
-- ---------------------------------------------------------------------------
--
-- `supervisor_pins` ya estaba completamente modelada desde las migraciones 185 y
-- 186: hash_pin, algoritmo, pin_version, intentos_fallidos, ultimo_intento_at,
-- bloqueado_hasta, ultimo_cambio_at, un índice único de un PIN activo por
-- usuario, el CHECK `ck_supervisor_pins_runtime` y RLS forzada. Lo único que
-- faltaba era el código que la usara: `cash-authorization.service.ts` aceptaba
-- como válido cualquier código de seis dígitos y dejaba la verificación como TODO.
--
-- Por eso aquí no se toca el esquema. Añadir columnas, índices o constraints
-- propios habría duplicado un contrato que ya estaba definido. Se agregan sólo
-- las dos RPC que faltaban, escritas contra las columnas existentes.
--
-- Nota sobre `codigo`: no es el PIN. El normalizador de la 185 lo autogenera como
-- etiqueta `SPIN-XXXXXXXX`. El secreto vive únicamente en `hash_pin`.

-- Un PIN débil no protege nada: seis dígitos, ni todos iguales ni una secuencia
-- corrida ascendente o descendente.
CREATE OR REPLACE FUNCTION app.pin_supervisor_es_debil_497(p_pin text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
  SELECT p_pin !~ '^[0-9]{6}$'
     OR p_pin ~ '^(.)\1{5}$'
     OR strpos('01234567890', p_pin) > 0
     OR strpos('09876543210', p_pin) > 0;
$fn$;

CREATE OR REPLACE FUNCTION public.registrar_pin_supervisor_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_usuario_id uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $fn$
DECLARE
  v_pin text := btrim(COALESCE(p_pin, ''));
  v_id uuid;
  v_version integer;
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_actor_id);
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_usuario_id);

  IF app.pin_supervisor_es_debil_497(v_pin) THEN
    RAISE EXCEPTION 'SUPERVISOR_PIN_WEAK' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'supervisor.pin:' || p_tenant_id::text || ':' || p_usuario_id::text, 497));

  -- El índice único `ux_supervisor_pins_tenant_usuario_activo_runtime` se apoya en
  -- `activo`, así que rotar exige bajar ambos campos del PIN anterior. Se retiran
  -- todas las versiones previas, incluidas las que el normalizador de la 185 dejó
  -- en BLOQUEADO (ésas ya tienen `activo = false` y no colisionan con el índice,
  -- pero seguirían apareciendo en la búsqueda de la verificación).
  SELECT max(pin_version) INTO v_version
  FROM public.supervisor_pins
  WHERE tenant_id = p_tenant_id AND usuario_id = p_usuario_id;

  UPDATE public.supervisor_pins
  SET estado = 'INACTIVO', activo = false, bloqueado_hasta = NULL, updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND usuario_id = p_usuario_id
    AND lower(COALESCE(estado::text, 'activo')) <> 'inactivo';

  INSERT INTO public.supervisor_pins (
    tenant_id, usuario_id, hash_pin, algoritmo, pin_version, estado, activo,
    intentos_fallidos, ultimo_intento_at, bloqueado_hasta, ultimo_cambio_at, metadata
  ) VALUES (
    p_tenant_id, p_usuario_id,
    extensions.crypt(v_pin, extensions.gen_salt('bf')), 'BCRYPT',
    COALESCE(v_version, 0) + 1, 'ACTIVO', true,
    0, NULL, NULL, now(),
    jsonb_build_object('schema_version', 497, 'rotado_por', p_actor_id)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id, 'usuario_id', p_usuario_id, 'pin_version', COALESCE(v_version, 0) + 1
  );
END;
$fn$;

-- La verificación vive en SQL y no en Node porque el contador de intentos es un
-- read-modify-write: resolverlo en la aplicación abre una carrera que permite
-- probar PIN en paralelo sin que el bloqueo llegue a contar.
--
-- Devuelve el veredicto en vez de lanzarlo, y esto es deliberado. En PL/pgSQL un
-- RAISE revierte la subtransacción de la función, así que lanzar el error de PIN
-- inválido deshacía el mismo UPDATE que acababa de sumar el intento: el contador
-- nunca avanzaba y el bloqueo por fuerza bruta jamás llegaba a activarse. Al
-- retornar, el incremento persiste.
--
-- Por eso el llamador DEBE exigir `valido = true`; un resultado ignorado
-- equivale a autorizar. `cash-authorization.service.ts` lo comprueba de forma
-- estricta.
CREATE OR REPLACE FUNCTION public.verificar_pin_supervisor_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $fn$
DECLARE
  v_pin text := btrim(COALESCE(p_pin, ''));
  v_row public.supervisor_pins%ROWTYPE;
  v_intentos integer;
  v_expirado boolean;
  v_base integer;
  v_max_intentos constant integer := 5;
  v_bloqueo constant interval := interval '15 minutes';
BEGIN
  PERFORM app.assert_pos_actor_451(p_tenant_id, p_usuario_id);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'supervisor.pin:' || p_tenant_id::text || ':' || p_usuario_id::text, 497));

  -- Se buscan ACTIVO y BLOQUEADO, no sólo ACTIVO. El normalizador de la 185 pone
  -- `estado = 'BLOQUEADO'` y `activo = false` en cuanto `bloqueado_hasta` queda a
  -- futuro; filtrar sólo por activo dejaría el PIN bloqueado invisible, se
  -- informaría "no registrado" en vez de "bloqueado" y —lo importante— el bloqueo
  -- sería permanente en lugar de durar quince minutos, porque nadie volvería a
  -- mirar esa fila para reactivarla al vencer.
  SELECT * INTO v_row
  FROM public.supervisor_pins sp
  WHERE sp.tenant_id = p_tenant_id
    AND sp.usuario_id = p_usuario_id
    AND lower(COALESCE(sp.estado::text, 'activo')) IN ('activo', 'bloqueado')
  ORDER BY sp.pin_version DESC, sp.created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- Sin PIN registrado se falla cerrado: no se autoriza por ausencia de control.
  IF NOT FOUND OR nullif(btrim(COALESCE(v_row.hash_pin, '')), '') IS NULL THEN
    RETURN jsonb_build_object('valido', false, 'motivo', 'SUPERVISOR_PIN_NOT_REGISTERED');
  END IF;

  IF v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta > now() THEN
    RETURN jsonb_build_object(
      'valido', false, 'motivo', 'SUPERVISOR_PIN_LOCKED',
      'bloqueado_hasta', v_row.bloqueado_hasta
    );
  END IF;

  -- Vencido el bloqueo, el contador arranca de cero: si no, el primer intento
  -- posterior volvería a superar el umbral y el bloqueo nunca terminaría.
  v_expirado := v_row.bloqueado_hasta IS NOT NULL AND v_row.bloqueado_hasta <= now();
  v_base := CASE WHEN v_expirado THEN 0 ELSE COALESCE(v_row.intentos_fallidos, 0) END;

  IF v_pin !~ '^[0-9]{6}$'
     OR extensions.crypt(v_pin, v_row.hash_pin) IS DISTINCT FROM v_row.hash_pin THEN
    -- `ck_supervisor_pins_runtime` acota los intentos a 100; se respeta ese techo.
    v_intentos := LEAST(v_base + 1, 100);
    UPDATE public.supervisor_pins
    SET intentos_fallidos = v_intentos,
        ultimo_intento_at = now(),
        bloqueado_hasta = CASE
          WHEN v_intentos >= v_max_intentos THEN now() + v_bloqueo
          ELSE NULL END,
        estado = CASE WHEN v_intentos >= v_max_intentos THEN 'BLOQUEADO' ELSE 'ACTIVO' END,
        activo = v_intentos < v_max_intentos,
        updated_at = now()
    WHERE id = v_row.id;
    RETURN jsonb_build_object(
      'valido', false,
      'motivo', CASE WHEN v_intentos >= v_max_intentos
                     THEN 'SUPERVISOR_PIN_LOCKED' ELSE 'SUPERVISOR_PIN_INVALID' END
    );
  END IF;

  -- Acierto: se limpia el bloqueo vencido y el PIN vuelve a quedar operativo.
  UPDATE public.supervisor_pins
  SET intentos_fallidos = 0,
      bloqueado_hasta = NULL,
      estado = 'ACTIVO',
      activo = true,
      ultimo_intento_at = now(),
      updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'valido', true, 'usuario_id', p_usuario_id, 'pin_version', v_row.pin_version
  );
END;
$fn$;

REVOKE ALL ON FUNCTION app.pin_supervisor_es_debil_497(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verificar_pin_supervisor_tx(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verificar_pin_supervisor_tx(uuid,uuid,text) TO service_role;

COMMENT ON FUNCTION public.verificar_pin_supervisor_tx(uuid,uuid,text) IS
  'Verifica el PIN de un supervisor contra su hash bcrypt. Cuenta intentos y bloquea 15 minutos tras 5 fallos, dentro de la transaccion. Falla cerrado si no hay PIN registrado.';
COMMENT ON FUNCTION public.registrar_pin_supervisor_tx(uuid,uuid,uuid,text) IS
  'Registra o rota el PIN de un supervisor sobre el modelo existente de supervisor_pins. Desactiva el anterior y guarda solo el hash.';

COMMIT;
