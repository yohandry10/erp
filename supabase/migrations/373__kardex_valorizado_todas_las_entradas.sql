-- El Kardex Valorizado se construia solo sobre recepcion_items, asi que unicamente
-- veia la mercaderia que entro por una recepcion de compra. Todo lo demas —stock
-- inicial de un producto nuevo, ajustes, reversos de venta— quedaba fuera.
--
-- El efecto era una contradiccion en pantalla: Inventario declaraba S/ 5.370,50
-- valorizados y el Kardex, cero.
--
-- `movimientos_inventario` ya es la fuente canonica: recepciones, POS, ajustes y
-- stock inicial pasan todos por aplicar_movimiento_inventario_tx, asi que las
-- recepciones siguen contadas una sola vez. Se mantienen las mismas columnas de
-- salida para no romper a los dos consumidores (la pantalla de kardex y el libro
-- contable), y se siguen listando solo las ENTRADAS, que es lo que ambos
-- describen y suman.

CREATE OR REPLACE VIEW public.vw_kardex_valorizado AS
SELECT
  mov.id AS recepcion_item_id,
  CASE WHEN upper(COALESCE(mov.referencia_tipo, '')) = 'RECEPCION'
       THEN mov.referencia_id END AS recepcion_id,
  mov.tenant_id,
  COALESCE(
    NULLIF(btrim(rec.numero), ''),
    NULLIF(btrim(rec.codigo), ''),
    NULLIF(btrim(mov.referencia_tipo), ''),
    'MOVIMIENTO'
  ) AS recepcion_numero,
  mov.created_at AS fecha_recepcion,
  COALESCE(NULLIF(btrim(rec.estado::text), ''), 'REGISTRADO') AS recepcion_estado,
  mov.producto_id,
  COALESCE(
    NULLIF(btrim(prod.codigo), ''),
    NULLIF(btrim(prod.sku), ''),
    mov.producto_id::text
  ) AS producto_codigo,
  COALESCE(NULLIF(btrim(prod.nombre), ''), 'Producto') AS producto_nombre,
  NULLIF(btrim(prod.sku), '') AS producto_sku,
  app.to_numeric_or_zero(COALESCE(mov.cantidad, 0)::text)::numeric(14, 2) AS cantidad_recibida,
  costo.costo_unitario,
  (app.to_numeric_or_zero(COALESCE(mov.cantidad, 0)::text) * costo.costo_unitario)::numeric(14, 2) AS valor_total,
  mov.almacen_id,
  alm.nombre AS almacen_nombre,
  mov.ubicacion_id,
  ubi.codigo AS ubicacion_codigo,
  mov.lote,
  NULL::text AS serie,
  mov.fecha_expiracion::date AS fecha_expiracion,
  'PEN'::text AS moneda_detalle
FROM public.movimientos_inventario mov
LEFT JOIN public.recepciones rec
  ON upper(COALESCE(mov.referencia_tipo, '')) = 'RECEPCION'
 AND rec.id = mov.referencia_id
LEFT JOIN public.productos prod ON prod.id = mov.producto_id
LEFT JOIN public.almacenes alm ON alm.id = mov.almacen_id
LEFT JOIN public.almacen_ubicaciones ubi ON ubi.id = mov.ubicacion_id
LEFT JOIN LATERAL (
  SELECT COALESCE(
    -- El writer transaccional guarda el costo real de la entrada; el precio de
    -- compra del catalogo es solo el ultimo recurso.
    app.to_numeric_or_zero(mov.metadata ->> 'costo_unitario'),
    app.to_numeric_or_zero(prod.precio_compra::text),
    0
  )::numeric(14, 2) AS costo_unitario
) costo ON true
WHERE upper(COALESCE(mov.tipo, mov.tipo_movimiento, '')) = 'ENTRADA';

COMMENT ON VIEW public.vw_kardex_valorizado IS
  'Entradas de inventario valorizadas de todas las procedencias, no solo de recepciones de compra.';
