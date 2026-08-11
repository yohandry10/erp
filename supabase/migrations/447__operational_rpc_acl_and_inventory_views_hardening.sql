-- Superficie operativa: clientes autenticados leen según RLS, pero toda
-- escritura sensible atraviesa el backend/RPC service-role. También restaura
-- semántica security-invoker y valorización correcta de vistas posteriores a
-- los hardenings históricos.
BEGIN;

SET LOCAL lock_timeout = '10s';

DO $acl$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'cotizaciones', 'cotizacion_detalles',
    'pedidos_venta', 'pedidos_venta_detalle', 'pedido_aprobaciones',
    'recepciones', 'recepcion_items',
    'ordenes_compra', 'orden_compra_detalles',
    'movimientos_inventario', 'producto_existencias',
    'documentos', 'documento_detalles', 'cpe',
    'cuentas_por_cobrar', 'cxc_pagos', 'outbox_events'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION '447 requiere public.%', v_table;
    END IF;
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated',
      v_table
    );
  END LOOP;
END;
$acl$;

-- Una vista security_invoker necesita permisos en sus relaciones base. Estos
-- grants son sólo para el backend service_role; no reabren acceso de cliente.
GRANT SELECT ON TABLE
  public.movimientos_inventario,
  public.recepciones,
  public.productos,
  public.almacenes,
  public.almacen_ubicaciones,
  public.ordenes_compra,
  public.producto_existencias,
  public.cajas
TO service_role;

CREATE OR REPLACE VIEW public.vw_kardex_valorizado
WITH (security_invoker = true) AS
SELECT
  coalesce(app.to_uuid_or_null(mov.metadata->>'recepcion_item_id'), mov.id)
    AS recepcion_item_id,
  ref.recepcion_id,
  mov.tenant_id,
  coalesce(
    nullif(btrim(rec.numero), ''),
    nullif(btrim(rec.codigo), ''),
    nullif(btrim(mov.referencia_tipo), ''),
    'MOVIMIENTO'
  ) AS recepcion_numero,
  mov.created_at AS fecha_recepcion,
  coalesce(nullif(btrim(rec.estado::text), ''), 'REGISTRADO') AS recepcion_estado,
  mov.producto_id,
  coalesce(
    nullif(btrim(prod.codigo), ''),
    nullif(btrim(prod.sku), ''),
    mov.producto_id::text
  ) AS producto_codigo,
  coalesce(nullif(btrim(prod.nombre), ''), 'Producto') AS producto_nombre,
  nullif(btrim(prod.sku), '') AS producto_sku,
  app.to_numeric_or_zero(coalesce(mov.cantidad, 0)::text)::numeric(14, 2)
    AS cantidad_recibida,
  costo.costo_unitario,
  (app.to_numeric_or_zero(coalesce(mov.cantidad, 0)::text) * costo.costo_unitario)::numeric(14, 2)
    AS valor_total,
  mov.almacen_id,
  alm.nombre AS almacen_nombre,
  mov.ubicacion_id,
  ubi.codigo AS ubicacion_codigo,
  mov.lote,
  NULL::text AS serie,
  mov.fecha_expiracion::date AS fecha_expiracion,
  upper(coalesce(nullif(btrim(oc.moneda), ''), 'PEN')) AS moneda_detalle
FROM public.movimientos_inventario mov
LEFT JOIN LATERAL (
  SELECT CASE
    WHEN upper(coalesce(mov.referencia_tipo, '')) = 'RECEPCION'
      THEN coalesce(
        app.to_uuid_or_null(mov.metadata->>'recepcion_id'),
        mov.referencia_id
      )
    ELSE NULL::uuid
  END AS recepcion_id
) ref ON true
LEFT JOIN public.recepciones rec
  ON rec.id = ref.recepcion_id AND rec.tenant_id = mov.tenant_id
LEFT JOIN public.ordenes_compra oc
  ON oc.id = rec.orden_id AND oc.tenant_id = rec.tenant_id
LEFT JOIN public.productos prod
  ON prod.id = mov.producto_id AND prod.tenant_id = mov.tenant_id
LEFT JOIN public.almacenes alm
  ON alm.id = mov.almacen_id AND alm.tenant_id = mov.tenant_id
LEFT JOIN public.almacen_ubicaciones ubi
  ON ubi.id = mov.ubicacion_id AND ubi.tenant_id = mov.tenant_id
LEFT JOIN LATERAL (
  SELECT (
    CASE
      WHEN nullif(btrim(mov.metadata->>'costo_unitario'), '') IS NOT NULL
        THEN app.to_numeric_or_zero(mov.metadata->>'costo_unitario')
      ELSE coalesce(nullif(prod.precio_compra, 0), nullif(prod.costo, 0), 0)
    END
  )::numeric(14, 2) AS costo_unitario
) costo ON true
WHERE upper(coalesce(mov.tipo, mov.tipo_movimiento, '')) = 'ENTRADA';

REVOKE ALL ON TABLE public.vw_kardex_valorizado
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_kardex_valorizado TO service_role;

CREATE OR REPLACE VIEW public.v_inventory_single_ledger_status_actual
WITH (security_invoker = true) AS
SELECT * FROM public.validar_inventory_single_ledger_runtime(NULL);

REVOKE ALL ON TABLE public.v_inventory_single_ledger_status_actual
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_inventory_single_ledger_status_actual TO service_role;
REVOKE ALL ON FUNCTION public.validar_inventory_single_ledger_runtime(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_inventory_single_ledger_runtime(uuid)
  TO service_role;

COMMENT ON VIEW public.vw_kardex_valorizado IS
  'Kardex invoker/service-only; costo explícito o fallback de catálogo y moneda histórica de la OC.';
COMMENT ON VIEW public.v_inventory_single_ledger_status_actual IS
  'Diagnóstico invoker/service-only del writer único de inventario.';

COMMIT;
