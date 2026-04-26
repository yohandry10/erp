-- Re-crea vistas sensibles con security_invoker y filtro por tenant_id
-- para evitar fugas cross-tenant.

-- Asegurar recreación limpia
DROP VIEW IF EXISTS public.vw_inventario_kardex_resumen;
DROP VIEW IF EXISTS public.vw_kardex_valorizado;
DROP VIEW IF EXISTS public.vw_inventario_recepciones_detalle;
DROP VIEW IF EXISTS public.vw_inventario_recepciones;
DROP VIEW IF EXISTS public.vw_devoluciones_detalle;
DROP VIEW IF EXISTS public.vw_recepciones_detalle;
DROP VIEW IF EXISTS public.vw_ordenes_compra_abiertas;
DROP VIEW IF EXISTS public.vista_kardex_valorizado;
DROP VIEW IF EXISTS public.vista_balance_comprobacion;
DROP VIEW IF EXISTS public.vw_ventas_pos_completas;
DROP VIEW IF EXISTS public.vista_registro_compras;
DROP VIEW IF EXISTS public.vw_cpe_documentos_auditoria;

-- Ventas POS completas
CREATE OR REPLACE VIEW public.vw_ventas_pos_completas
WITH (security_invoker = on) AS
SELECT
  vp.id AS venta_id,
  vp.tenant_id,
  vp.numero_venta,
  vp.numero_ticket,
  vp.fecha,
  vp.cliente_nombre,
  vp.cliente_documento,
  vp.subtotal,
  vp.impuestos,
  vp.descuentos,
  vp.total,
  vp.metodo_pago,
  vp.estado,
  vp.vendedor,
  vp.cpe_pendiente,
  vp.intentos_facturacion,
  vp.created_at,
  count(dvp.id) AS num_items,
  COALESCE(sum(dvp.cantidad), 0::numeric) AS total_unidades,
  CASE
    WHEN count(dvp.id) = 0 THEN 'TABLA'::text
    WHEN vp.observaciones IS NOT NULL AND vp.observaciones ~~ '%items%'::text THEN 'OBSERVACIONES'::text
    ELSE 'DETALLES'::text
  END AS origen_detalles
FROM ventas_pos vp
LEFT JOIN detalle_ventas_pos dvp ON dvp.venta_id = vp.id
WHERE vp.tenant_id = app.current_tenant_id()
GROUP BY vp.id, vp.tenant_id, vp.numero_venta, vp.numero_ticket, vp.fecha, vp.cliente_nombre, vp.cliente_documento, vp.subtotal,
         vp.impuestos, vp.descuentos, vp.total, vp.metodo_pago, vp.estado, vp.vendedor, vp.cpe_pendiente,
         vp.intentos_facturacion, vp.created_at, vp.observaciones;

-- Balance de comprobación
CREATE OR REPLACE VIEW public.vista_balance_comprobacion
WITH (security_invoker = on) AS
SELECT
  pc.id AS cuenta_id,
  pc.codigo,
  pc.nombre,
  pc.tipo,
  pc.naturaleza,
  COALESCE(si.saldo_inicial, 0::numeric) AS saldo_anterior,
  COALESCE(sum(da.debe), 0::numeric) AS total_debe,
  COALESCE(sum(da.haber), 0::numeric) AS total_haber,
  count(da.id) AS cantidad_movimientos,
  CASE
    WHEN pc.naturaleza = 'DEUDORA'::text
      THEN COALESCE(si.saldo_inicial, 0::numeric) + COALESCE(sum(da.debe), 0::numeric) - COALESCE(sum(da.haber), 0::numeric)
    ELSE COALESCE(si.saldo_inicial, 0::numeric) + COALESCE(sum(da.haber), 0::numeric) - COALESCE(sum(da.debe), 0::numeric)
  END AS saldo_actual
FROM plan_cuentas pc
LEFT JOIN saldos_iniciales_cuentas si ON pc.id = si.cuenta_id
LEFT JOIN detalle_asientos da ON pc.id = da.cuenta_id
LEFT JOIN asientos_contables ac ON da.asiento_id = ac.id
WHERE pc.acepta_movimiento = true
  AND pc.tenant_id = app.current_tenant_id()
GROUP BY pc.id, pc.codigo, pc.nombre, pc.tipo, pc.naturaleza, si.saldo_inicial
ORDER BY pc.codigo;

-- Kardex valorizado detalle
CREATE OR REPLACE VIEW public.vista_kardex_valorizado
WITH (security_invoker = on) AS
SELECT
  p.id AS producto_id,
  p.codigo,
  p.nombre,
  p.categoria,
  p.precio AS precio_unitario,
  sm.motivo AS tipo_movimiento,
  sm.motivo,
  sm.cantidad,
  p.precio AS costo_unitario,
  (sm.cantidad * p.precio) AS valor_movimiento,
  sm.created_at,
  p.tenant_id
FROM productos p
LEFT JOIN stock_movimientos sm ON p.id = sm.producto_id AND sm.tenant_id = p.tenant_id
WHERE sm.id IS NOT NULL
  AND p.tenant_id = app.current_tenant_id()
ORDER BY p.codigo, sm.created_at;

-- Ordenes de compra abiertas
CREATE OR REPLACE VIEW public.vw_ordenes_compra_abiertas
WITH (security_invoker = on) AS
SELECT
  oc.id,
  oc.tenant_id,
  oc.numero,
  oc.proveedor_id,
  oc.fecha_orden,
  oc.fecha_entrega_esperada,
  oc.estado,
  oc.total,
  count(DISTINCT ocd.id) AS total_items,
  sum(CASE WHEN ocd.cantidad_pendiente > 0::numeric THEN 1 ELSE 0 END) AS items_pendientes,
  sum(ocd.cantidad) AS cantidad_total,
  sum(ocd.cantidad_recibida) AS cantidad_recibida,
  sum(ocd.cantidad_pendiente) AS cantidad_pendiente
FROM ordenes_compra oc
LEFT JOIN orden_compra_detalles ocd ON ocd.orden_id = oc.id
WHERE oc.estado::text = ANY (ARRAY['APROBADA'::varchar, 'PARCIAL'::varchar]::text[])
  AND oc.tenant_id = app.current_tenant_id()
GROUP BY oc.id, oc.tenant_id, oc.numero, oc.proveedor_id, oc.fecha_orden, oc.fecha_entrega_esperada, oc.estado, oc.total
HAVING sum(ocd.cantidad_pendiente) > 0::numeric;

-- Recepciones detalle
CREATE OR REPLACE VIEW public.vw_recepciones_detalle
WITH (security_invoker = on) AS
SELECT
  r.id AS recepcion_id,
  r.tenant_id,
  r.numero AS recepcion_numero,
  r.fecha_recepcion,
  r.estado AS recepcion_estado,
  oc.id AS orden_id,
  oc.numero AS orden_numero,
  oc.proveedor_id,
  ri.id AS item_id,
  prod.id AS producto_id,
  prod.nombre AS producto_nombre,
  ri.cantidad_recibida,
  ri.calidad,
  ri.almacen_id,
  a.nombre AS almacen_nombre,
  ri.lote,
  ri.serie,
  ri.fecha_expiracion
FROM recepciones r
JOIN ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN recepcion_items ri ON ri.recepcion_id = r.id
LEFT JOIN productos prod ON prod.id = ri.producto_id
LEFT JOIN almacenes a ON a.id = ri.almacen_id
WHERE r.tenant_id = app.current_tenant_id();

-- Devoluciones a proveedor detalle
CREATE OR REPLACE VIEW public.vw_devoluciones_detalle
WITH (security_invoker = on) AS
SELECT
  d.id AS devolucion_id,
  d.tenant_id,
  d.numero AS devolucion_numero,
  d.fecha_devolucion,
  d.estado AS devolucion_estado,
  d.motivo,
  oc.id AS orden_id,
  oc.numero AS orden_numero,
  d.proveedor_id,
  di.id AS item_id,
  prod.id AS producto_id,
  prod.nombre AS producto_nombre,
  di.cantidad,
  di.precio_unitario,
  di.subtotal,
  di.almacen_id,
  a.nombre AS almacen_nombre,
  di.lote,
  di.serie,
  di.motivo_detalle
FROM devoluciones_proveedor d
JOIN ordenes_compra oc ON oc.id = d.orden_id
LEFT JOIN devolucion_items di ON di.devolucion_id = d.id
LEFT JOIN productos prod ON prod.id = di.producto_id
LEFT JOIN almacenes a ON a.id = di.almacen_id
WHERE d.tenant_id = app.current_tenant_id();

-- Inventario recepciones (resumen por proveedor/almacén)
CREATE OR REPLACE VIEW public.vw_inventario_recepciones
WITH (security_invoker = on) AS
SELECT
  r.id AS recepcion_id,
  r.tenant_id,
  r.numero AS recepcion_numero,
  r.fecha_recepcion,
  r.estado,
  r.observaciones,
  r.orden_id,
  r.created_at,
  r.updated_at,
  p.id AS proveedor_id,
  p.razon_social AS proveedor_nombre,
  p.ruc AS proveedor_ruc,
  count(ri.id) AS total_items,
  COALESCE(sum(COALESCE(prod.precio, 0::numeric) * ri.cantidad_recibida), 0::numeric)::numeric(18,6) AS valor_total
FROM recepciones r
LEFT JOIN ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN proveedores p ON p.id = oc.proveedor_id
LEFT JOIN recepcion_items ri ON ri.recepcion_id = r.id
LEFT JOIN productos prod ON prod.id = ri.producto_id
WHERE r.tenant_id = app.current_tenant_id()
GROUP BY r.id, r.tenant_id, r.numero, r.fecha_recepcion, r.estado, r.observaciones, r.orden_id, r.created_at, r.updated_at, p.id, p.razon_social, p.ruc;

-- Inventario recepciones (detalle por ítem)
CREATE OR REPLACE VIEW public.vw_inventario_recepciones_detalle
WITH (security_invoker = on) AS
SELECT
  ri.id AS recepcion_item_id,
  r.id AS recepcion_id,
  r.tenant_id,
  r.numero AS recepcion_numero,
  r.fecha_recepcion,
  r.estado AS recepcion_estado,
  ri.producto_id,
  prod.codigo AS producto_codigo,
  prod.nombre AS producto_nombre,
  ri.cantidad_recibida,
  COALESCE(prod.precio, 0::numeric)::numeric(18,6) AS costo_unitario,
  COALESCE(prod.precio, 0::numeric) * ri.cantidad_recibida::numeric(18,6) AS valor_total,
  ri.almacen_id,
  a.nombre AS almacen_nombre,
  ri.ubicacion_id,
  ub.codigo AS ubicacion_codigo,
  ri.lote,
  ri.serie,
  ri.fecha_expiracion,
  oc.moneda AS moneda_detalle
FROM recepcion_items ri
LEFT JOIN recepciones r ON r.id = ri.recepcion_id
LEFT JOIN ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN productos prod ON prod.id = ri.producto_id
LEFT JOIN almacenes a ON a.id = ri.almacen_id
LEFT JOIN almacen_ubicaciones ub ON ub.id = ri.ubicacion_id
WHERE r.tenant_id = app.current_tenant_id();

-- Kardex valorizado (detalle) con columnas de recepciones
CREATE OR REPLACE VIEW public.vw_kardex_valorizado
WITH (security_invoker = on) AS
SELECT
  ri.id AS recepcion_item_id,
  r.id AS recepcion_id,
  r.tenant_id,
  r.numero AS recepcion_numero,
  r.fecha_recepcion,
  r.estado AS recepcion_estado,
  ri.producto_id,
  prod.codigo AS producto_codigo,
  prod.nombre AS producto_nombre,
  ri.cantidad_recibida,
  COALESCE(prod.precio, 0::numeric)::numeric(18,6) AS costo_unitario,
  (COALESCE(prod.precio, 0::numeric) * ri.cantidad_recibida::numeric(18,6)) AS valor_total,
  ri.almacen_id,
  a.nombre AS almacen_nombre,
  ri.ubicacion_id,
  ub.codigo AS ubicacion_codigo,
  ri.lote,
  ri.serie,
  ri.fecha_expiracion,
  oc.moneda AS moneda_detalle
FROM recepcion_items ri
LEFT JOIN recepciones r ON r.id = ri.recepcion_id
LEFT JOIN ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN productos prod ON prod.id = ri.producto_id
LEFT JOIN almacenes a ON a.id = ri.almacen_id
LEFT JOIN almacen_ubicaciones ub ON ub.id = ri.ubicacion_id
WHERE r.tenant_id = app.current_tenant_id();

-- Kardex valorizado (resumen)
CREATE OR REPLACE VIEW public.vw_inventario_kardex_resumen
WITH (security_invoker = on) AS
SELECT
  r.tenant_id,
  prod.id AS producto_id,
  prod.codigo AS producto_codigo,
  prod.nombre AS producto_nombre,
  a.id AS almacen_id,
  a.nombre AS almacen_nombre,
  sum(ri.cantidad_recibida)::numeric(18,6) AS total_cantidad,
  sum(COALESCE(prod.precio, 0::numeric) * ri.cantidad_recibida)::numeric(18,6) AS total_valor
FROM recepciones r
LEFT JOIN recepcion_items ri ON ri.recepcion_id = r.id
LEFT JOIN productos prod ON prod.id = ri.producto_id
LEFT JOIN almacenes a ON a.id = ri.almacen_id
WHERE r.tenant_id = app.current_tenant_id()
GROUP BY r.tenant_id, prod.id, prod.codigo, prod.nombre, a.id, a.nombre;

-- Registro de compras (audit)
CREATE OR REPLACE VIEW public.vista_registro_compras
WITH (security_invoker = on) AS
SELECT
  oc.id,
  'OC-'::text || oc.id::text AS numero_orden,
  COALESCE(p.razon_social, 'PROVEEDOR SIN NOMBRE'::varchar) AS proveedor,
  COALESCE(p.ruc, '00000000000'::varchar) AS ruc,
  '6'::text AS tipo_documento,
  COALESCE(oc.subtotal, CASE WHEN oc.total IS NOT NULL THEN oc.total / 1.18 ELSE 0::numeric END) AS subtotal,
  COALESCE(oc.igv, CASE WHEN oc.total IS NOT NULL THEN oc.total - oc.total / 1.18 ELSE 0::numeric END) AS igv,
  COALESCE(oc.total, 0::numeric) AS total,
  COALESCE(oc.estado, 'DESCONOCIDO'::varchar) AS estado,
  oc.created_at
FROM ordenes_compra oc
LEFT JOIN proveedores p ON oc.proveedor_id = p.id
WHERE oc.estado::text = 'ENTREGADO'::text
  AND oc.tenant_id = app.current_tenant_id();

-- Auditoría CPE vs documentos
CREATE OR REPLACE VIEW public.vw_cpe_documentos_auditoria
WITH (security_invoker = on) AS
SELECT
  c.id AS cpe_id,
  c.tenant_id,
  c.tipo_documento,
  c.serie,
  c.numero,
  c.razon_social_receptor AS cpe_cliente,
  COALESCE(d.total, 0::numeric) AS cpe_total,
  c.estado AS cpe_estado,
  c.created_at AS cpe_created_at,
  d.id AS documento_existe,
  d.created_at AS documento_created_at,
  CASE
    WHEN c.documento_id IS NOT NULL AND d.id IS NOT NULL THEN '✅ VINCULADO'::text
    WHEN c.documento_id IS NOT NULL AND d.id IS NULL THEN '❌ DOCUMENTO PERDIDO'::text
    WHEN c.documento_id IS NULL THEN '⚠️ SIN DOCUMENTO'::text
    ELSE 'DESCONOCIDO'::text
  END AS estado_integridad
FROM cpe c
LEFT JOIN documentos d ON d.id = c.documento_id
WHERE c.tenant_id = app.current_tenant_id()
ORDER BY c.created_at DESC;
