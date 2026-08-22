-- 500__moneda_sin_defecto_peruano.sql
--
-- Treinta y cuatro columnas `moneda` del esquema llevan DEFAULT 'PEN'. Es el mismo respaldo
-- peruano que se ha ido retirando del codigo durante toda esta auditoria --el
-- adaptador fiscal, el calculador de impuestos, la emision, el POS, los hooks de
-- la web-- pero una capa mas abajo: en el propio esquema. Cualquier insercion que
-- omita la columna convierte el dinero de un contribuyente argentino o colombiano
-- en soles, sin error y sin rastro.
--
-- Y una si la omitia: `pos_registrar_venta_tx`, el writer que registra cada venta
-- del POS, inserta en `ventas_pos` sin declarar `moneda`. Sus dos sobrecargas, y
-- la palabra no aparece en ninguna de las dos. Las 60 ventas POS de produccion son
-- de contribuyentes peruanos, asi que hoy la moneda coincide por casualidad; la
-- primera venta argentina o colombiana habria quedado registrada en soles.
--
-- Orden de las dos partes: primero el writer pasa a fijar la moneda, y solo
-- despues se quita el defecto de la columna. Al reves, entre una sentencia y la
-- siguiente una venta se habria quedado sin moneda.
--
-- La funcion se reescribe partiendo de su definicion viva, con dos anadidos y sin
-- tocar una linea mas: resolver la moneda de `empresa_config` --fallando cerrado
-- si no la declara, como el resto de la auditoria-- y nombrar la columna en el
-- INSERT. La sobrecarga corta solo delega, asi que no cambia.
--
-- Quitar el defecto es seguro y se comprobo de las dos formas: los 15 INSERT de
-- los writers sobre las tablas de dinero declaran `moneda`, las 6 inserciones del
-- API tambien, y no hay una sola fila con moneda nula o vacia en produccion.

BEGIN;

-- 1. El writer del POS fija la moneda del contribuyente.

CREATE OR REPLACE FUNCTION public.pos_registrar_venta_tx(p_tenant_id uuid, p_usuario_id uuid, p_cliente_id uuid DEFAULT NULL::uuid, p_cliente_documento text DEFAULT NULL::text, p_cliente_nombre text DEFAULT NULL::text, p_metodo_pago text DEFAULT 'efectivo'::text, p_items jsonb DEFAULT '[]'::jsonb, p_serie text DEFAULT 'B001'::text, p_sesion_caja_id uuid DEFAULT NULL::uuid, p_vendedor text DEFAULT NULL::text, p_max_descuento_pct numeric DEFAULT 0, p_idempotency_key text DEFAULT NULL::text, p_pagos jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(venta_id uuid, numero_ticket text, subtotal numeric, impuestos numeric, total numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'app', 'pg_temp'
AS $function$
DECLARE
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_igv numeric := 0;
  v_igv_items numeric := NULL;
  v_correlativo text;
  v_ticket text;
  v_venta_id uuid;
  v_serie text := upper(COALESCE(NULLIF(btrim(COALESCE(p_serie, '')), ''), 'B001'));
  v_caja_id uuid := NULL;
  v_moneda text;
BEGIN
  -- La moneda de la venta es la del contribuyente. Este INSERT no la declaraba,
  -- asi que cada venta de POS tomaba el DEFAULT de la columna, que era soles:
  -- la primera venta argentina o colombiana habria quedado registrada en PEN.
  SELECT upper(btrim(COALESCE(ec.moneda_defecto, '')))
  INTO v_moneda
  FROM public.empresa_config ec
  WHERE ec.tenant_id = p_tenant_id
  LIMIT 1;

  IF v_moneda IS NULL OR v_moneda = '' THEN
    RAISE EXCEPTION 'POS_MONEDA_NO_CONFIGURADA: la empresa % no declara moneda_defecto', p_tenant_id
      USING ERRCODE = '23514';
  END IF;

  IF p_sesion_caja_id IS NOT NULL THEN
    SELECT sc.caja_id
    INTO v_caja_id
    FROM public.sesiones_caja sc
    WHERE sc.id = p_sesion_caja_id
      AND sc.tenant_id = p_tenant_id
    LIMIT 1;

    IF v_caja_id IS NULL THEN
      RAISE EXCEPTION 'SESION_CAJA_NOT_FOUND: %', p_sesion_caja_id;
    END IF;
  END IF;

  SELECT
    COALESCE(SUM(app.to_numeric_or_zero(i->>'subtotal')), 0),
    SUM(CASE WHEN i ? 'igv' THEN app.to_numeric_or_zero(i->>'igv') ELSE NULL END)
  INTO v_subtotal, v_igv_items
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i;

  -- El IGV llega repartido por ítem según su afectación del Catálogo 07. Solo
  -- si ningún ítem lo declara se cae al 18% plano histórico.
  IF v_igv_items IS NULL THEN
    v_igv := round(v_subtotal * 0.18, 2);
  ELSE
    v_igv := round(v_igv_items, 2);
  END IF;

  v_total := round(v_subtotal + v_igv, 2);
  v_correlativo := public.obtener_siguiente_numero_pos(p_tenant_id, v_serie, 'TICKET', v_caja_id);
  v_ticket := v_serie || '-' || v_correlativo;

  INSERT INTO public.ventas_pos(
    id, tenant_id, cliente_id, usuario_id, cliente_documento, cliente_nombre,
    metodo_pago, sesion_caja_id, subtotal, impuestos, total, moneda, cpe_pendiente,
    estado, numero_ticket, serie, correlativo, idempotency_key, fecha, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, p_cliente_id, p_usuario_id, p_cliente_documento,
    p_cliente_nombre, p_metodo_pago, p_sesion_caja_id, v_subtotal, v_igv, v_total,
    v_moneda, true, 'PAGADA', v_ticket, v_serie, v_correlativo,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''), now(), now(), now()
  )
  RETURNING id INTO v_venta_id;

  INSERT INTO public.outbox_events(
    id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, idempotency_key, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, 'venta_pos', v_venta_id::text, 'venta_pos.registrada',
    jsonb_build_object(
      'ventaId', v_venta_id,
      'tenantId', p_tenant_id,
      'usuarioId', p_usuario_id,
      'clienteId', p_cliente_id,
      'total', v_total,
      'numeroTicket', v_ticket,
      'items', COALESCE(p_items, '[]'::jsonb)
    ),
    'pending', NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''), now(), now()
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_venta_id, v_ticket, v_subtotal, v_igv, v_total;
END;
$function$
;

-- 2. Fuera el defecto peruano de las 34 columnas `moneda` del esquema.

ALTER TABLE public.activos_fijos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.asignacion_costos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.beneficios ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.compras ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.comprobantes_electronicos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.configuracion_caja ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.contratos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.cortes_caja ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.cotizaciones ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.cuentas_bancarias ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.cuentas_por_cobrar ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.cuentas_por_pagar ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.cxc_pagos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.demo_conversiones_pendientes ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.depositos_cts ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.devoluciones_proveedor ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.documentos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.egresos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.gastos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.historial_pagos_planilla ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.inventarios_permanentes ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.ordenes_compra ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.pagos_facturas ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.pagos_ventas ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.pedidos_venta ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.plantillas_asientos_ventas ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.producto_precios_sucursal ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.recepcion_items ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.registro_consignaciones ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.saldos_iniciales_cuentas ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.sesiones_caja ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.ventas ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.ventas_pos ALTER COLUMN moneda DROP DEFAULT;
ALTER TABLE public.ventas_pos_pagos ALTER COLUMN moneda DROP DEFAULT;

-- 3. Donde el importe es el dato, la moneda es obligatoria. Si quedara alguna
--    fila sin ella la sentencia falla, que es lo que se quiere: en que moneda
--    estaba ese importe no lo puede decidir una migracion.
ALTER TABLE public.cuentas_por_cobrar ALTER COLUMN moneda SET NOT NULL;
ALTER TABLE public.cuentas_por_pagar ALTER COLUMN moneda SET NOT NULL;
ALTER TABLE public.cuentas_bancarias ALTER COLUMN moneda SET NOT NULL;
ALTER TABLE public.cxc_pagos ALTER COLUMN moneda SET NOT NULL;
ALTER TABLE public.cpe ALTER COLUMN moneda SET NOT NULL;

COMMIT;
