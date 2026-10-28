-- ============================================================================
-- 579__supply_dashboards_bi.sql
-- F07 ALKHOFAR: tablero de suministro, cortes conciliables y lectura para BI.
--
-- El tablero se calcula de los mismos datos que el expediente (entregas,
-- recepciones, estado de cuenta 576, lotes 574 y penalidades 578). Un corte es
-- la instantánea inmutable de todos los conjuntos de una empresa con su hash:
-- la pantalla, el Excel y Power BI leen el mismo corte y por eso concilian. Cada
-- exportación registra su corte y una tarea diaria registra el automático.
-- Power BI lee con una credencial propia de la empresa (no de un usuario):
-- conjuntos acotados, vencimiento, revocación y registro de cada acceso.
-- ============================================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE public.tablero_cortes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  fecha_corte date NOT NULL,
  origen text NOT NULL CHECK (origen IN ('EXPORTACION', 'AUTOMATICO')),
  generado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  generado_por uuid REFERENCES public.usuarios_sistema(id),
  datos jsonb NOT NULL,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  filas jsonb NOT NULL,
  CHECK ((origen = 'AUTOMATICO') = (generado_por IS NULL))
);
CREATE UNIQUE INDEX tablero_corte_automatico_579 ON public.tablero_cortes (tenant_id, fecha_corte) WHERE origen = 'AUTOMATICO';
CREATE INDEX tablero_cortes_tenant_579 ON public.tablero_cortes (tenant_id, generado_en DESC);

CREATE TABLE public.bi_credenciales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 3 AND 120),
  prefijo text NOT NULL CHECK (prefijo ~ '^[0-9a-f]{8}$'),
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  datasets text[] NOT NULL CHECK (cardinality(datasets) > 0
    AND datasets <@ ARRAY['contratos', 'entregas', 'stock', 'vencimientos', 'cobranza', 'penalidades']),
  expira_en date NOT NULL,
  creado_por uuid NOT NULL REFERENCES public.usuarios_sistema(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revocado_en timestamptz,
  revocado_por uuid REFERENCES public.usuarios_sistema(id),
  motivo_revocacion text,
  ultimo_uso_en timestamptz,
  CHECK ((revocado_en IS NULL) = (revocado_por IS NULL) AND (revocado_en IS NULL) = (motivo_revocacion IS NULL))
);
CREATE INDEX bi_credenciales_tenant_579 ON public.bi_credenciales (tenant_id, created_at DESC);

CREATE TABLE public.bi_accesos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  credencial_id uuid NOT NULL REFERENCES public.bi_credenciales(id),
  dataset text NOT NULL,
  corte_id uuid REFERENCES public.tablero_cortes(id),
  resultado text NOT NULL CHECK (resultado IN ('OK', 'CREDENCIAL_INACTIVA', 'DATASET_NO_PERMITIDO', 'CORTE_NO_ENCONTRADO')),
  filas integer,
  hash text,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  origen jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bi_accesos_tenant_579 ON public.bi_accesos (tenant_id, created_at DESC);

-- Un corte es historia; una credencial sólo registra su uso y su revocación.
CREATE FUNCTION app.tablero_inmutable_579() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'bi_credenciales' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['ultimo_uso_en', 'revocado_en', 'revocado_por', 'motivo_revocacion'])
         = (to_jsonb(OLD) - ARRAY['ultimo_uso_en', 'revocado_en', 'revocado_por', 'motivo_revocacion'])
       AND (OLD.revocado_en IS NULL OR (NEW.revocado_en, NEW.revocado_por, NEW.motivo_revocacion)
         IS NOT DISTINCT FROM (OLD.revocado_en, OLD.revocado_por, OLD.motivo_revocacion)) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'DASHBOARD_RECORD_IMMUTABLE' USING ERRCODE = '23514';
END $fn$;
CREATE TRIGGER tablero_cortes_inmutable_579 BEFORE UPDATE OR DELETE ON public.tablero_cortes
FOR EACH ROW EXECUTE FUNCTION app.tablero_inmutable_579();
CREATE TRIGGER bi_credenciales_inmutable_579 BEFORE UPDATE OR DELETE ON public.bi_credenciales
FOR EACH ROW EXECUTE FUNCTION app.tablero_inmutable_579();
CREATE TRIGGER bi_accesos_inmutable_579 BEFORE UPDATE OR DELETE ON public.bi_accesos
FOR EACH ROW EXECUTE FUNCTION app.tablero_inmutable_579();

DO $secure$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tablero_cortes', 'bi_credenciales', 'bi_accesos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE POLICY tablero_private_579 ON public.%I USING (false) WITH CHECK (false)', t);
  END LOOP;
END $secure$;

-- Conjuntos de detalle de una empresa a una fecha. Cada fila lleva los
-- identificadores de su documento origen. No escribe.
CREATE FUNCTION app.tablero_datos_579(p_tenant_id uuid, p_hoy date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  WITH contratos AS (
    SELECT c.id, c.numero, c.moneda, c.cliente_id, coalesce(cl.razon_social, cl.nombre) AS cliente
    FROM public.suministro_contratos c
    LEFT JOIN public.clientes cl ON cl.id = c.cliente_id AND cl.tenant_id = c.tenant_id
    WHERE c.tenant_id = p_tenant_id AND c.estado = 'ACTIVO'
  ), base AS (
    SELECT e.id, e.contrato_id, k.numero AS contrato_numero, k.cliente_id, k.cliente, k.moneda,
      o.id AS orden_cliente_id, o.numero AS oc_numero, cl.producto_id, cl.codigo_producto, cl.descripcion, cl.unidad_medida,
      e.destino, e.fecha_original, e.fecha_programada, e.cantidad, ol.precio_unitario,
      coalesce((SELECT sum(pd.cantidad) FROM public.suministro_pedido_lineas l
        JOIN public.suministro_pedidos v ON v.id = l.vinculo_id AND v.tenant_id = l.tenant_id AND v.estado = 'VINCULADO'
        JOIN public.pedido_despachos pd ON pd.tenant_id = l.tenant_id AND pd.pedido_id = v.pedido_id
          AND pd.detalle_id = l.pedido_detalle_id AND upper(coalesce(pd.estado, 'REGISTRADO')) <> 'ANULADO'
        WHERE l.tenant_id = e.tenant_id AND l.entrega_id = e.id), 0) AS despachado,
      coalesce((SELECT sum(rl.cantidad_aceptada) FROM public.suministro_recepcion_lineas rl
        JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
        WHERE rl.tenant_id = e.tenant_id AND rl.entrega_id = e.id AND r.fecha_recepcion <= p_hoy), 0) AS aceptado,
      coalesce((SELECT sum(rl.cantidad_rechazada) FROM public.suministro_recepcion_lineas rl
        JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
        WHERE rl.tenant_id = e.tenant_id AND rl.entrega_id = e.id AND r.fecha_recepcion <= p_hoy), 0) AS rechazado,
      -- Fecha en que lo aceptado alcanzó lo programado.
      (SELECT min(x.fecha_recepcion) FROM (
        SELECT r.fecha_recepcion, sum(rl.cantidad_aceptada) OVER (ORDER BY r.fecha_recepcion, r.numero) AS acumulado
        FROM public.suministro_recepcion_lineas rl
        JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
        WHERE rl.tenant_id = e.tenant_id AND rl.entrega_id = e.id AND r.fecha_recepcion <= p_hoy) x
        WHERE x.acumulado >= e.cantidad) AS fecha_cumplimiento,
      (SELECT string_agg(DISTINCT pv.numero, ', ') FROM public.suministro_pedido_lineas l
        JOIN public.suministro_pedidos v ON v.id = l.vinculo_id AND v.tenant_id = l.tenant_id AND v.estado = 'VINCULADO'
        JOIN public.pedidos_venta pv ON pv.id = v.pedido_id AND pv.tenant_id = v.tenant_id
        WHERE l.tenant_id = e.tenant_id AND l.entrega_id = e.id) AS pedidos,
      (SELECT string_agg(DISTINCT r.numero::text, ', ') FROM public.suministro_recepcion_lineas rl
        JOIN public.suministro_recepciones r ON r.id = rl.recepcion_id AND r.tenant_id = rl.tenant_id AND r.estado = 'REGISTRADA'
        WHERE rl.tenant_id = e.tenant_id AND rl.entrega_id = e.id AND r.fecha_recepcion <= p_hoy) AS recepciones
    FROM public.suministro_entregas_programadas e
    JOIN contratos k ON k.id = e.contrato_id
    JOIN public.suministro_orden_lineas ol ON ol.id = e.orden_linea_id AND ol.tenant_id = e.tenant_id
    JOIN public.suministro_ordenes_cliente o ON o.id = ol.orden_cliente_id AND o.tenant_id = ol.tenant_id
    JOIN public.suministro_contrato_lineas cl ON cl.id = ol.contrato_linea_id AND cl.tenant_id = ol.tenant_id
    WHERE e.tenant_id = p_tenant_id AND e.estado = 'PROGRAMADA'
  ), entregas AS (
    SELECT b.*,
      CASE WHEN b.fecha_cumplimiento <= b.fecha_programada THEN 'A_TIEMPO_COMPLETA'
        WHEN b.fecha_cumplimiento IS NOT NULL THEN 'TARDIA_COMPLETA'
        WHEN b.fecha_programada < p_hoy THEN 'ATRASADA'
        ELSE 'EN_PLAZO' END AS cumplimiento,
      CASE WHEN b.fecha_cumplimiento IS NOT NULL THEN greatest(b.fecha_cumplimiento - b.fecha_programada, 0)
        WHEN b.fecha_programada < p_hoy THEN p_hoy - b.fecha_programada ELSE 0 END AS dias_atraso
    FROM base b
  ), cuentas AS (
    SELECT k.*, app.suministro_estado_cuenta_576(p_tenant_id, k.id) AS ec FROM contratos k
  ), pendiente AS (
    SELECT e.producto_id, sum(greatest(e.cantidad - e.despachado, 0)) AS pendiente_total,
      coalesce(sum(greatest(e.cantidad - e.despachado, 0)) FILTER (WHERE e.fecha_programada <= p_hoy + 30), 0) AS pendiente_30,
      jsonb_agg(DISTINCT e.contrato_id) AS contrato_ids, jsonb_agg(DISTINCT e.cliente_id) AS cliente_ids
    FROM entregas e GROUP BY e.producto_id
  ), stock AS (
    SELECT p.id AS producto_id, p.codigo, p.nombre, p.unidad_medida, pe.pendiente_total, pe.pendiente_30,
      pe.contrato_ids, pe.cliente_ids,
      coalesce((SELECT sum(x.stock_actual) FROM public.producto_existencias x
        WHERE x.tenant_id = p_tenant_id AND x.producto_id = p.id), 0) AS fisico,
      coalesce((SELECT sum(x.stock_reservado) FROM public.producto_existencias x
        WHERE x.tenant_id = p_tenant_id AND x.producto_id = p.id), 0) AS reservado,
      coalesce((SELECT sum(s.stock_actual) FROM public.inventario_lote_saldos s
        JOIN public.inventario_lotes l ON l.id = s.lote_id AND l.tenant_id = s.tenant_id
        WHERE s.tenant_id = p_tenant_id AND s.producto_id = p.id AND l.fecha_vencimiento < p_hoy), 0) AS vencido
    FROM pendiente pe JOIN public.productos p ON p.id = pe.producto_id AND p.tenant_id = p_tenant_id
  )
  SELECT jsonb_build_object(
    'contratos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'contrato_id', k.id, 'contrato_numero', k.numero, 'cliente_id', k.cliente_id, 'cliente', k.cliente, 'moneda', k.moneda,
        'orden_cliente_id', o.id, 'oc_numero', o.numero, 'oc_fecha', o.fecha_emision,
        'cantidad_oc', coalesce((SELECT sum(ol.cantidad) FROM public.suministro_orden_lineas ol
          WHERE ol.tenant_id = p_tenant_id AND ol.orden_cliente_id = o.id), 0),
        'programado', coalesce((SELECT sum(e.cantidad) FROM entregas e WHERE e.orden_cliente_id = o.id), 0),
        'despachado', coalesce((SELECT sum(e.despachado) FROM entregas e WHERE e.orden_cliente_id = o.id), 0),
        'aceptado', coalesce((SELECT sum(e.aceptado) FROM entregas e WHERE e.orden_cliente_id = o.id), 0),
        'valor_oc', coalesce((x.r->>'valor')::numeric, 0),
        'facturado_valor', coalesce((x.r->>'facturado_valor')::numeric, 0),
        'por_facturar_valor', coalesce((x.r->>'por_facturar_valor')::numeric, 0)
      ) ORDER BY k.numero, o.fecha_emision, o.numero)
      FROM cuentas k
      JOIN public.suministro_ordenes_cliente o ON o.tenant_id = p_tenant_id AND o.contrato_id = k.id AND o.estado = 'ACTIVA'
      LEFT JOIN LATERAL (SELECT r FROM jsonb_array_elements(k.ec->'ordenes') r
        WHERE r->>'orden_cliente_id' = o.id::text) x ON true), '[]'::jsonb),
    'entregas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'entrega_id', e.id, 'contrato_id', e.contrato_id, 'contrato_numero', e.contrato_numero, 'cliente_id', e.cliente_id,
        'cliente', e.cliente, 'orden_cliente_id', e.orden_cliente_id, 'oc_numero', e.oc_numero, 'producto_id', e.producto_id,
        'codigo_producto', e.codigo_producto, 'descripcion', e.descripcion, 'unidad_medida', e.unidad_medida,
        'destino', e.destino, 'fecha_original', e.fecha_original, 'fecha_programada', e.fecha_programada,
        'cantidad', e.cantidad, 'despachado', e.despachado, 'aceptado', e.aceptado, 'rechazado', e.rechazado,
        'fecha_cumplimiento', e.fecha_cumplimiento, 'cumplimiento', e.cumplimiento, 'dias_atraso', e.dias_atraso,
        'pedidos', e.pedidos, 'recepciones', e.recepciones
      ) ORDER BY e.fecha_programada, e.contrato_numero, e.id) FROM entregas e), '[]'::jsonb),
    'stock', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'producto_id', s.producto_id, 'codigo_producto', s.codigo, 'descripcion', s.nombre, 'unidad_medida', s.unidad_medida,
        'contrato_ids', s.contrato_ids, 'cliente_ids', s.cliente_ids,
        'stock_fisico', s.fisico, 'stock_reservado', s.reservado, 'stock_vencido', s.vencido,
        'stock_utilizable', greatest(s.fisico - s.vencido, 0),
        'pendiente_30_dias', s.pendiente_30, 'pendiente_total', s.pendiente_total,
        'cobertura_pct', CASE WHEN s.pendiente_30 > 0 THEN round(greatest(s.fisico - s.vencido, 0) * 100 / s.pendiente_30, 2) END,
        'estado', CASE WHEN greatest(s.fisico - s.vencido, 0) < s.pendiente_30 THEN 'SIN_COBERTURA' ELSE 'CUBIERTO' END
      ) ORDER BY s.codigo) FROM stock s), '[]'::jsonb),
    'vencimientos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'lote_id', v.lote_id, 'lote', v.codigo, 'producto_id', v.producto_id, 'codigo_producto', v.producto_codigo,
        'descripcion', v.producto_nombre, 'fecha_vencimiento', v.fecha_vencimiento, 'dias_para_vencer', v.fecha_vencimiento - p_hoy,
        'stock', v.stock, 'stock_reservado', v.reservado,
        'estado', app.lote_estado_574(v.fecha_vencimiento, p_hoy, v.dias_minimos, 90),
        'contrato_ids', coalesce(pe.contrato_ids, '[]'::jsonb), 'cliente_ids', coalesce(pe.cliente_ids, '[]'::jsonb)
      ) ORDER BY v.fecha_vencimiento, v.producto_codigo, v.codigo)
      FROM (SELECT l.id AS lote_id, l.codigo, l.producto_id, p.codigo AS producto_codigo, p.nombre AS producto_nombre,
          l.fecha_vencimiento, sum(s.stock_actual) AS stock, sum(s.stock_reservado) AS reservado,
          (SELECT pol.dias_minimos_vida_util FROM public.inventario_lote_politicas pol
            WHERE pol.tenant_id = p_tenant_id AND pol.producto_id = l.producto_id) AS dias_minimos
        FROM public.inventario_lotes l
        JOIN public.inventario_lote_saldos s ON s.lote_id = l.id AND s.tenant_id = l.tenant_id
        JOIN public.productos p ON p.id = l.producto_id AND p.tenant_id = l.tenant_id
        WHERE l.tenant_id = p_tenant_id AND l.fecha_vencimiento <= p_hoy + 90
        GROUP BY l.id, l.codigo, l.producto_id, p.codigo, p.nombre, l.fecha_vencimiento
        HAVING sum(s.stock_actual) > 0) v
      LEFT JOIN pendiente pe ON pe.producto_id = v.producto_id), '[]'::jsonb),
    'cobranza', coalesce((
      SELECT jsonb_agg(d.r || jsonb_build_object('contrato_id', k.id, 'contrato_numero', k.numero, 'cliente_id', k.cliente_id,
          'cliente', k.cliente,
          'dias_vencido', CASE WHEN (d.r->>'saldo')::numeric > 0 AND (d.r->>'fecha_vencimiento')::date < p_hoy
            THEN p_hoy - (d.r->>'fecha_vencimiento')::date ELSE 0 END,
          'situacion', CASE WHEN (d.r->>'saldo')::numeric <= 0 THEN 'PAGADO'
            WHEN (d.r->>'fecha_vencimiento')::date < p_hoy THEN 'VENCIDO' ELSE 'PENDIENTE' END)
        ORDER BY k.numero, d.r->>'fecha_emision', d.r->>'documento')
      FROM cuentas k CROSS JOIN LATERAL jsonb_array_elements(k.ec->'documentos') d(r)), '[]'::jsonb),
    'penalidades', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'calculo_id', x.id, 'contrato_id', x.contrato_id, 'contrato_numero', k.numero, 'cliente_id', k.cliente_id,
        'cliente', k.cliente, 'entrega_id', x.entrega_id, 'fecha_programada', e.fecha_programada, 'regla', r.nombre,
        'regla_version', r.version, 'fecha_corte_calculo', x.fecha_corte, 'dias_atraso', x.dias_atraso, 'moneda', x.moneda,
        'monto_estimado', x.monto_estimado, 'estado', x.estado, 'monto_aprobado', x.monto_aprobado
      ) ORDER BY k.numero, e.fecha_programada, r.nombre)
      -- Sólo el último corte vigente de cada regla y entrega, como el resumen de 578.
      FROM (SELECT DISTINCT ON (pc.regla_id, pc.entrega_id) pc.*
          FROM public.penalidad_calculos pc
          WHERE pc.tenant_id = p_tenant_id AND pc.estado <> 'DESCARTADO' AND pc.fecha_corte <= p_hoy
          ORDER BY pc.regla_id, pc.entrega_id, pc.fecha_corte DESC, pc.created_at DESC) x
      JOIN contratos k ON k.id = x.contrato_id
      JOIN public.penalidad_reglas r ON r.id = x.regla_id
      JOIN public.suministro_entregas_programadas e ON e.id = x.entrega_id AND e.tenant_id = x.tenant_id), '[]'::jsonb)
  )
$fn$;

-- Filtra los conjuntos por contrato, cliente y rango de fechas del documento.
CREATE FUNCTION app.tablero_filtrar_579(p_datos jsonb, p_filtros jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_contrato text; v_cliente text; v_desde date; v_hasta date;
  v_res jsonb := '{}'::jsonb; d record; v_campo text;
BEGIN
  IF jsonb_typeof(f) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(f) k
       WHERE k NOT IN ('contrato_id', 'cliente_id', 'desde', 'hasta')) THEN
    RAISE EXCEPTION 'DASHBOARD_FILTER_INVALID' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_contrato := (nullif(f->>'contrato_id', '')::uuid)::text;
    v_cliente := (nullif(f->>'cliente_id', '')::uuid)::text;
    v_desde := nullif(f->>'desde', '')::date;
    v_hasta := nullif(f->>'hasta', '')::date;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'DASHBOARD_FILTER_INVALID' USING ERRCODE = '22023';
  END;
  IF v_desde > v_hasta THEN RAISE EXCEPTION 'DASHBOARD_FILTER_INVALID' USING ERRCODE = '22023'; END IF;
  FOR d IN SELECT key, value FROM jsonb_each(p_datos) LOOP
    v_campo := CASE d.key WHEN 'contratos' THEN 'oc_fecha' WHEN 'entregas' THEN 'fecha_programada'
      WHEN 'cobranza' THEN 'fecha_emision' WHEN 'penalidades' THEN 'fecha_programada' END;
    v_res := v_res || jsonb_build_object(d.key, coalesce((
      SELECT jsonb_agg(x.r ORDER BY x.n) FROM jsonb_array_elements(d.value) WITH ORDINALITY x(r, n)
      WHERE (v_contrato IS NULL OR x.r->>'contrato_id' = v_contrato OR coalesce(x.r->'contrato_ids', '[]'::jsonb) ? v_contrato)
        AND (v_cliente IS NULL OR x.r->>'cliente_id' = v_cliente OR coalesce(x.r->'cliente_ids', '[]'::jsonb) ? v_cliente)
        AND (v_campo IS NULL OR v_desde IS NULL OR (x.r->>v_campo)::date >= v_desde)
        AND (v_campo IS NULL OR v_hasta IS NULL OR (x.r->>v_campo)::date <= v_hasta)), '[]'::jsonb));
  END LOOP;
  RETURN v_res;
END $fn$;

-- Indicadores calculados de los mismos conjuntos que se muestran y exportan.
CREATE FUNCTION app.tablero_resumen_579(p_datos jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  WITH c AS (SELECT r FROM jsonb_array_elements(coalesce(p_datos->'contratos', '[]')) r),
  e AS (SELECT r FROM jsonb_array_elements(coalesce(p_datos->'entregas', '[]')) r),
  s AS (SELECT r FROM jsonb_array_elements(coalesce(p_datos->'stock', '[]')) r),
  v AS (SELECT r FROM jsonb_array_elements(coalesce(p_datos->'vencimientos', '[]')) r),
  x AS (SELECT r FROM jsonb_array_elements(coalesce(p_datos->'cobranza', '[]')) r),
  p AS (SELECT r FROM jsonb_array_elements(coalesce(p_datos->'penalidades', '[]')) r)
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'cumplimiento', CASE WHEN p_datos ? 'contratos' THEN (SELECT jsonb_build_object(
      'ordenes', count(*), 'cantidad_oc', coalesce(sum((r->>'cantidad_oc')::numeric), 0),
      'aceptado', coalesce(sum((r->>'aceptado')::numeric), 0),
      'porcentaje', round(sum((r->>'aceptado')::numeric) * 100 / nullif(sum((r->>'cantidad_oc')::numeric), 0), 2)) FROM c) END,
    'entregas', CASE WHEN p_datos ? 'entregas' THEN (SELECT jsonb_build_object(
      'exigibles', count(*) FILTER (WHERE r->>'cumplimiento' <> 'EN_PLAZO'),
      'a_tiempo_completas', count(*) FILTER (WHERE r->>'cumplimiento' = 'A_TIEMPO_COMPLETA'),
      'tardias', count(*) FILTER (WHERE r->>'cumplimiento' = 'TARDIA_COMPLETA'),
      'atrasadas', count(*) FILTER (WHERE r->>'cumplimiento' = 'ATRASADA'),
      'en_plazo', count(*) FILTER (WHERE r->>'cumplimiento' = 'EN_PLAZO'),
      'porcentaje', round(count(*) FILTER (WHERE r->>'cumplimiento' = 'A_TIEMPO_COMPLETA') * 100.0
        / nullif(count(*) FILTER (WHERE r->>'cumplimiento' <> 'EN_PLAZO'), 0), 2),
      'dias_atraso_promedio', round(avg((r->>'dias_atraso')::numeric)
        FILTER (WHERE r->>'cumplimiento' IN ('ATRASADA', 'TARDIA_COMPLETA')), 1)) FROM e) END,
    'stock', CASE WHEN p_datos ? 'stock' THEN (SELECT jsonb_build_object('productos', count(*),
      'sin_cobertura', count(*) FILTER (WHERE r->>'estado' = 'SIN_COBERTURA')) FROM s) END,
    'vencimientos', CASE WHEN p_datos ? 'vencimientos' THEN (SELECT jsonb_build_object(
      'vencidos', count(*) FILTER (WHERE r->>'estado' = 'VENCIDO'),
      'por_vencer', count(*) FILTER (WHERE r->>'estado' <> 'VENCIDO'),
      'stock_vencido', coalesce(sum((r->>'stock')::numeric) FILTER (WHERE r->>'estado' = 'VENCIDO'), 0)) FROM v) END,
    'facturacion', CASE WHEN p_datos ? 'contratos' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('moneda', m.moneda,
      'facturado', m.facturado, 'por_facturar', m.por_facturar) ORDER BY m.moneda) FROM (
        SELECT r->>'moneda' AS moneda, round(sum((r->>'facturado_valor')::numeric), 2) AS facturado,
          round(sum((r->>'por_facturar_valor')::numeric), 2) AS por_facturar FROM c GROUP BY 1) m), '[]'::jsonb) END,
    'cobranza', CASE WHEN p_datos ? 'cobranza' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('moneda', m.moneda,
      'documentos', m.n, 'saldo', m.saldo, 'vencido', m.vencido) ORDER BY m.moneda) FROM (
        SELECT r->>'moneda' AS moneda, count(*) AS n, round(sum((r->>'saldo')::numeric), 2) AS saldo,
          round(coalesce(sum((r->>'saldo')::numeric) FILTER (WHERE r->>'situacion' = 'VENCIDO'), 0), 2) AS vencido
        FROM x GROUP BY 1) m), '[]'::jsonb) END,
    'penalidades', CASE WHEN p_datos ? 'penalidades' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('moneda', m.moneda,
      'pendiente', m.pendiente, 'aprobado', m.aprobado) ORDER BY m.moneda) FROM (
        SELECT r->>'moneda' AS moneda,
          round(coalesce(sum((r->>'monto_estimado')::numeric) FILTER (WHERE r->>'estado' <> 'APROBADO'), 0), 2) AS pendiente,
          round(coalesce(sum((r->>'monto_aprobado')::numeric) FILTER (WHERE r->>'estado' = 'APROBADO'), 0), 2) AS aprobado
        FROM p GROUP BY 1) m), '[]'::jsonb) END
  ))
$fn$;

-- Conjuntos que el actor puede ver según los permisos de cada módulo origen.
CREATE FUNCTION app.tablero_visibles_579(p_tenant_id uuid, p_actor_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  SELECT coalesce(array_agg(d.nombre ORDER BY d.orden), ARRAY[]::text[]) FROM (VALUES
    (1, 'contratos', 'ventas.contratos.ver'), (2, 'entregas', 'ventas.contratos.ver'),
    (3, 'stock', 'inventario.lotes.read'), (4, 'vencimientos', 'inventario.lotes.read'),
    (5, 'cobranza', 'finanzas.cxc.read'), (6, 'penalidades', 'ventas.penalidades.ver')) d(orden, nombre, permiso)
  WHERE app.suministro_puede_575(p_tenant_id, p_actor_id, d.permiso)
$fn$;

CREATE FUNCTION app.tablero_hash_579(p_datos jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, extensions, pg_temp AS $fn$
  SELECT encode(extensions.digest(convert_to(p_datos::text, 'UTF8'), 'sha256'), 'hex')
$fn$;

CREATE FUNCTION app.tablero_filas_579(p_datos jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(jsonb_object_agg(key, jsonb_array_length(value)), '{}'::jsonb) FROM jsonb_each(p_datos)
$fn$;

CREATE FUNCTION app.tablero_corte_meta_579(c public.tablero_cortes) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
  SELECT jsonb_build_object('id', c.id, 'fecha_corte', c.fecha_corte, 'origen', c.origen, 'generado_en', c.generado_en,
    'generado_por', c.generado_por, 'generado_por_nombre',
    (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios_sistema u WHERE u.id = c.generado_por),
    'hash', c.hash, 'filas', c.filas)
$fn$;

-- Tablero en vivo (sin corte) o de un corte registrado, con filtros.
CREATE FUNCTION public.consultar_tablero_suministro_579(
  p_tenant_id uuid, p_actor_id uuid, p_corte_id uuid, p_filtros jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  v_hoy date; v_corte public.tablero_cortes; v_datos jsonb; v_meta jsonb; v_visibles text[]; v_filtrados jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'reports.suministro.read');
  v_hoy := app.hoy_tenant(p_tenant_id);
  IF p_corte_id IS NULL THEN
    v_datos := app.tablero_datos_579(p_tenant_id, v_hoy);
    v_meta := jsonb_build_object('id', NULL, 'fecha_corte', v_hoy, 'origen', 'EN_VIVO', 'generado_en', clock_timestamp(),
      'hash', app.tablero_hash_579(v_datos), 'filas', app.tablero_filas_579(v_datos));
  ELSE
    SELECT * INTO v_corte FROM public.tablero_cortes WHERE tenant_id = p_tenant_id AND id = p_corte_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'DASHBOARD_CUTOFF_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    v_datos := v_corte.datos;
    v_meta := app.tablero_corte_meta_579(v_corte);
  END IF;
  v_visibles := app.tablero_visibles_579(p_tenant_id, p_actor_id);
  v_filtrados := app.tablero_filtrar_579((SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(v_datos) WHERE key = ANY (v_visibles)), p_filtros);
  RETURN jsonb_build_object(
    'corte', v_meta,
    'filtros', coalesce(p_filtros, '{}'::jsonb),
    'datasets', v_filtrados,
    'resumen', app.tablero_resumen_579(v_filtrados),
    'ocultos', to_jsonb(ARRAY(SELECT k FROM unnest(ARRAY['contratos', 'entregas', 'stock', 'vencimientos', 'cobranza', 'penalidades']) k
      WHERE NOT k = ANY (v_visibles))),
    'cortes', coalesce((SELECT jsonb_agg(app.tablero_corte_meta_579(c) ORDER BY c.generado_en DESC)
      FROM (SELECT * FROM public.tablero_cortes WHERE tenant_id = p_tenant_id ORDER BY generado_en DESC LIMIT 30) c), '[]'::jsonb)
  );
END $fn$;

-- Registra la instantánea de la empresa para exportarla; idempotente por clave.
CREATE FUNCTION public.registrar_corte_tablero_579(p_tenant_id uuid, p_actor_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := 'tablero:' || btrim(coalesce(p_idempotency_key, '')); v_op public.suministro_operaciones;
  v_hash text; v_datos jsonb; v_corte public.tablero_cortes; v_result jsonb;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'reports.suministro.export');
  IF length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 8 AND 170 THEN
    RAISE EXCEPTION 'DASHBOARD_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_hash := encode(extensions.digest(convert_to('REGISTRAR_CORTE', 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':suministro:' || v_key, 570));
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;
  v_datos := app.tablero_datos_579(p_tenant_id, app.hoy_tenant(p_tenant_id));
  INSERT INTO public.tablero_cortes (tenant_id, fecha_corte, origen, generado_por, datos, hash, filas)
  VALUES (p_tenant_id, app.hoy_tenant(p_tenant_id), 'EXPORTACION', p_actor_id, v_datos, app.tablero_hash_579(v_datos),
    app.tablero_filas_579(v_datos))
  RETURNING * INTO v_corte;
  v_result := app.tablero_corte_meta_579(v_corte) || jsonb_build_object('idempotent', false);
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'tablero_cortes', 'INSERT', v_corte.id::text,
    jsonb_build_object('fecha_corte', v_corte.fecha_corte, 'hash', v_corte.hash, 'filas', v_corte.filas),
    jsonb_build_object('source', 'registrar_corte_tablero_579', 'idempotency_key', v_key));
  INSERT INTO public.suministro_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, v_result);
  RETURN v_result;
END $fn$;

-- Corte automático diario para empresas con contratos activos.
CREATE FUNCTION public.registrar_cortes_automaticos_579() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE t uuid; v_hoy date; v_datos jsonb; v_n integer := 0;
BEGIN
  FOR t IN SELECT DISTINCT c.tenant_id FROM public.suministro_contratos c WHERE c.estado = 'ACTIVO' ORDER BY 1 LOOP
    v_hoy := app.hoy_tenant(t);
    PERFORM pg_advisory_xact_lock(hashtextextended(t::text || ':tablero-automatico', 579));
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.tablero_cortes WHERE tenant_id = t AND fecha_corte = v_hoy AND origen = 'AUTOMATICO');
    v_datos := app.tablero_datos_579(t, v_hoy);
    INSERT INTO public.tablero_cortes (tenant_id, fecha_corte, origen, datos, hash, filas)
    VALUES (t, v_hoy, 'AUTOMATICO', v_datos, app.tablero_hash_579(v_datos), app.tablero_filas_579(v_datos));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $fn$;

-- Credenciales de lectura BI: el token lo genera la API y sólo llega su hash.
CREATE FUNCTION public.operar_credenciales_bi_579(
  p_tenant_id uuid, p_actor_id uuid, p_accion text, p_payload jsonb, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, extensions, pg_temp AS $fn$
DECLARE
  v_key text := 'bi:' || btrim(coalesce(p_idempotency_key, '')); v_op public.suministro_operaciones; v_hash text;
  v_cred public.bi_credenciales; v_datasets text[]; v_expira date; v_result jsonb; v_hoy date;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'integraciones.bi.gestionar');
  IF length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 8 AND 170 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_accion IS NULL OR p_accion NOT IN ('CREAR', 'REVOCAR') THEN
    RAISE EXCEPTION 'BI_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  -- El token no forma parte de la huella: un reintento con otro token es la misma operación.
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('accion', p_accion,
    'payload', p_payload - ARRAY['token_digest', 'prefijo'])::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':suministro:' || v_key, 570));
  SELECT * INTO v_op FROM public.suministro_operaciones WHERE tenant_id = p_tenant_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_op.actor_id IS DISTINCT FROM p_actor_id OR v_op.fingerprint IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_op.resultado || jsonb_build_object('idempotent', true);
  END IF;
  v_hoy := app.hoy_tenant(p_tenant_id);
  IF p_accion = 'CREAR' THEN
    BEGIN
      v_datasets := ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_payload->'datasets') ORDER BY 1);
      v_expira := (p_payload->>'expira_en')::date;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BI_INPUT_INVALID' USING ERRCODE = '22023';
    END;
    IF cardinality(v_datasets) = 0
       OR NOT v_datasets <@ ARRAY['contratos', 'entregas', 'stock', 'vencimientos', 'cobranza', 'penalidades'] THEN
      RAISE EXCEPTION 'BI_INPUT_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_expira IS NULL OR v_expira <= v_hoy OR v_expira > v_hoy + 366 THEN
      RAISE EXCEPTION 'BI_EXPIRY_INVALID' USING ERRCODE = '22023';
    END IF;
    -- Quien crea la credencial debe poder ver cada conjunto que entrega.
    IF EXISTS (SELECT 1 FROM unnest(v_datasets) d WHERE NOT d = ANY (app.tablero_visibles_579(p_tenant_id, p_actor_id))) THEN
      RAISE EXCEPTION 'BI_DATASET_PERMISSION_REQUIRED' USING ERRCODE = '42501';
    END IF;
    BEGIN
      INSERT INTO public.bi_credenciales (tenant_id, nombre, prefijo, token_digest, datasets, expira_en, creado_por)
      VALUES (p_tenant_id, btrim(coalesce(p_payload->>'nombre', '')), p_payload->>'prefijo', p_payload->>'token_digest',
        v_datasets, v_expira, p_actor_id)
      RETURNING * INTO v_cred;
    EXCEPTION WHEN check_violation OR not_null_violation THEN
      RAISE EXCEPTION 'BI_INPUT_INVALID' USING ERRCODE = '22023';
    END;
  ELSE
    SELECT * INTO v_cred FROM public.bi_credenciales WHERE tenant_id = p_tenant_id
      AND id = app.to_uuid_or_null(p_payload->>'credencial_id') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_cred.revocado_en IS NOT NULL THEN RAISE EXCEPTION 'BI_CREDENTIAL_REVOKED' USING ERRCODE = '23514'; END IF;
    IF length(btrim(coalesce(p_payload->>'motivo', ''))) NOT BETWEEN 5 AND 1000 THEN
      RAISE EXCEPTION 'SUPPLY_REASON_REQUIRED' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bi_credenciales SET revocado_en = now(), revocado_por = p_actor_id, motivo_revocacion = btrim(p_payload->>'motivo')
    WHERE id = v_cred.id RETURNING * INTO v_cred;
  END IF;
  v_result := jsonb_build_object('id', v_cred.id, 'accion', p_accion, 'nombre', v_cred.nombre, 'prefijo', v_cred.prefijo,
    'datasets', to_jsonb(v_cred.datasets), 'expira_en', v_cred.expira_en, 'revocado_en', v_cred.revocado_en, 'idempotent', false);
  INSERT INTO public.audit_log (tenant_id, user_id, table_name, operation, record_id, new_values, metadata)
  VALUES (p_tenant_id, p_actor_id, 'bi_credenciales', CASE WHEN p_accion = 'CREAR' THEN 'INSERT' ELSE 'UPDATE' END,
    v_cred.id::text, v_result, jsonb_build_object('source', 'operar_credenciales_bi_579', 'accion', p_accion,
      'motivo', p_payload->>'motivo', 'idempotency_key', v_key));
  INSERT INTO public.suministro_operaciones (tenant_id, idempotency_key, actor_id, fingerprint, resultado)
  VALUES (p_tenant_id, v_key, p_actor_id, v_hash, v_result);
  RETURN v_result;
END $fn$;

CREATE FUNCTION public.consultar_credenciales_bi_579(p_tenant_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE v_hoy date;
BEGIN
  PERFORM app.assert_actor_permission_466(p_tenant_id, p_actor_id, 'integraciones.bi.gestionar');
  v_hoy := app.hoy_tenant(p_tenant_id);
  RETURN jsonb_build_object(
    'visibles', to_jsonb(app.tablero_visibles_579(p_tenant_id, p_actor_id)),
    'credenciales', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo,
        'datasets', to_jsonb(c.datasets), 'expira_en', c.expira_en, 'created_at', c.created_at,
        'creado_por_nombre', (SELECT concat_ws(' ', u.nombre, u.apellido) FROM public.usuarios_sistema u WHERE u.id = c.creado_por),
        'revocado_en', c.revocado_en, 'motivo_revocacion', c.motivo_revocacion, 'ultimo_uso_en', c.ultimo_uso_en,
        'estado', CASE WHEN c.revocado_en IS NOT NULL THEN 'REVOCADA' WHEN c.expira_en < v_hoy THEN 'VENCIDA' ELSE 'ACTIVA' END)
      ORDER BY c.created_at DESC) FROM public.bi_credenciales c WHERE c.tenant_id = p_tenant_id), '[]'::jsonb),
    'accesos', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'credencial_id', a.credencial_id,
        'credencial', c.nombre, 'dataset', a.dataset, 'corte_id', a.corte_id, 'resultado', a.resultado, 'filas', a.filas,
        'hash', a.hash, 'created_at', a.created_at) ORDER BY a.created_at DESC, a.id DESC)
      FROM (SELECT * FROM public.bi_accesos WHERE tenant_id = p_tenant_id ORDER BY created_at DESC, id DESC LIMIT 50) a
      JOIN public.bi_credenciales c ON c.id = a.credencial_id), '[]'::jsonb)
  );
END $fn$;

-- Lectura de Power BI: identidad por credencial, alcance de su empresa y
-- registro de cada acceso, también de los rechazados.
CREATE FUNCTION public.leer_dataset_bi_579(
  p_token_digest text, p_dataset text, p_corte text, p_filtros jsonb, p_origen jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
DECLARE
  v_cred public.bi_credenciales; v_corte public.tablero_cortes; v_filas jsonb; v_n integer;
  v_origen jsonb := CASE WHEN jsonb_typeof(p_origen) = 'object'
    THEN jsonb_build_object('ip', left(p_origen->>'ip', 64), 'agente', left(p_origen->>'agente', 200)) ELSE '{}'::jsonb END;
BEGIN
  SELECT * INTO v_cred FROM public.bi_credenciales WHERE token_digest = p_token_digest;
  IF NOT FOUND THEN RETURN jsonb_build_object('resultado', 'CREDENCIAL_INVALIDA'); END IF;
  IF v_cred.revocado_en IS NOT NULL OR v_cred.expira_en < app.hoy_tenant(v_cred.tenant_id) THEN
    INSERT INTO public.bi_accesos (tenant_id, credencial_id, dataset, resultado, origen)
    VALUES (v_cred.tenant_id, v_cred.id, left(coalesce(p_dataset, ''), 40), 'CREDENCIAL_INACTIVA', v_origen);
    RETURN jsonb_build_object('resultado', 'CREDENCIAL_INACTIVA');
  END IF;
  IF p_dataset IS NULL OR NOT p_dataset = ANY (v_cred.datasets) THEN
    INSERT INTO public.bi_accesos (tenant_id, credencial_id, dataset, resultado, origen)
    VALUES (v_cred.tenant_id, v_cred.id, left(coalesce(p_dataset, ''), 40), 'DATASET_NO_PERMITIDO', v_origen);
    RETURN jsonb_build_object('resultado', 'DATASET_NO_PERMITIDO');
  END IF;
  IF coalesce(p_corte, 'ultimo') = 'ultimo' THEN
    SELECT * INTO v_corte FROM public.tablero_cortes WHERE tenant_id = v_cred.tenant_id ORDER BY generado_en DESC, id LIMIT 1;
  ELSE
    SELECT * INTO v_corte FROM public.tablero_cortes WHERE tenant_id = v_cred.tenant_id AND id = app.to_uuid_or_null(p_corte);
  END IF;
  IF v_corte.id IS NULL THEN
    INSERT INTO public.bi_accesos (tenant_id, credencial_id, dataset, resultado, origen)
    VALUES (v_cred.tenant_id, v_cred.id, p_dataset, 'CORTE_NO_ENCONTRADO', v_origen);
    RETURN jsonb_build_object('resultado', 'CORTE_NO_ENCONTRADO');
  END IF;
  v_filas := coalesce(app.tablero_filtrar_579(jsonb_build_object(p_dataset, coalesce(v_corte.datos->p_dataset, '[]'::jsonb)),
    p_filtros)->p_dataset, '[]'::jsonb);
  v_n := jsonb_array_length(v_filas);
  INSERT INTO public.bi_accesos (tenant_id, credencial_id, dataset, corte_id, resultado, filas, hash, filtros, origen)
  VALUES (v_cred.tenant_id, v_cred.id, p_dataset, v_corte.id, 'OK', v_n, v_corte.hash, coalesce(p_filtros, '{}'::jsonb), v_origen);
  UPDATE public.bi_credenciales SET ultimo_uso_en = now() WHERE id = v_cred.id;
  RETURN jsonb_build_object('resultado', 'OK', 'corte', jsonb_build_object('id', v_corte.id, 'fecha_corte', v_corte.fecha_corte,
      'origen', v_corte.origen, 'generado_en', v_corte.generado_en, 'hash', v_corte.hash),
    'dataset', p_dataset, 'total', v_n,
    -- Cada fila lleva su corte para que Power BI pueda acumular cortes sin mezclarlos.
    'filas', coalesce((SELECT jsonb_agg(r || jsonb_build_object('corte_id', v_corte.id, 'fecha_corte', v_corte.fecha_corte) ORDER BY n)
      FROM jsonb_array_elements(v_filas) WITH ORDINALITY x(r, n)), '[]'::jsonb));
END $fn$;

-- Permisos: lectura y exportación del tablero; gestión de credenciales BI.
CREATE FUNCTION app.seed_tablero_permissions_579(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN
  INSERT INTO public.permisos (tenant_id, modulo, recurso, accion, codigo, descripcion, activo)
  SELECT p_tenant_id, s.modulo, s.recurso, s.accion, s.codigo, s.descripcion, true
  FROM (VALUES
    ('reports', 'suministro', 'read', 'reports.suministro.read', 'Consultar el tablero de suministro y sus cortes'),
    ('reports', 'suministro', 'export', 'reports.suministro.export', 'Registrar cortes y exportar el tablero de suministro a Excel'),
    ('integraciones', 'bi', 'gestionar', 'integraciones.bi.gestionar', 'Crear y revocar credenciales de lectura para Power BI')
  ) s(modulo, recurso, accion, codigo, descripcion)
  WHERE NOT EXISTS (SELECT 1 FROM public.permisos p WHERE p.tenant_id = p_tenant_id AND p.codigo = s.codigo);
  INSERT INTO public.rol_permisos (role_id, permiso_id, concedido)
  SELECT r.id, p.id, true FROM public.roles r JOIN public.permisos p ON p.tenant_id = r.tenant_id
  WHERE r.tenant_id = p_tenant_id AND r.activo AND p.activo
    AND p.codigo IN ('reports.suministro.read', 'reports.suministro.export', 'integraciones.bi.gestionar')
    AND (upper(r.nombre) IN ('ADMIN', 'ADMIN_DEMO')
      OR (upper(r.nombre) = 'GERENCIA' AND p.codigo IN ('reports.suministro.read', 'reports.suministro.export'))
      OR (upper(r.nombre) IN ('CONTADOR', 'FINANZAS', 'AUDITOR') AND p.codigo = 'reports.suministro.read'))
    AND NOT EXISTS (SELECT 1 FROM public.rol_permisos rp WHERE rp.role_id = r.id AND rp.permiso_id = p.id);
END $fn$;
CREATE FUNCTION app.seed_tablero_role_579() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp AS $fn$
BEGIN PERFORM app.seed_tablero_permissions_579(NEW.tenant_id); RETURN NEW; END $fn$;
CREATE TRIGGER seed_tablero_role_579 AFTER INSERT OR UPDATE OF nombre, activo ON public.roles
FOR EACH ROW EXECUTE FUNCTION app.seed_tablero_role_579();
DO $seed$ DECLARE t uuid; BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP PERFORM app.seed_tablero_permissions_579(t); END LOOP;
END $seed$;

REVOKE ALL ON FUNCTION app.tablero_datos_579(uuid, date), app.tablero_filtrar_579(jsonb, jsonb), app.tablero_resumen_579(jsonb),
  app.tablero_visibles_579(uuid, uuid), app.tablero_hash_579(jsonb), app.tablero_filas_579(jsonb),
  app.tablero_corte_meta_579(public.tablero_cortes), app.tablero_inmutable_579(), app.seed_tablero_permissions_579(uuid),
  app.seed_tablero_role_579()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.consultar_tablero_suministro_579(uuid, uuid, uuid, jsonb),
  public.registrar_corte_tablero_579(uuid, uuid, text), public.registrar_cortes_automaticos_579(),
  public.operar_credenciales_bi_579(uuid, uuid, text, jsonb, text), public.consultar_credenciales_bi_579(uuid, uuid),
  public.leer_dataset_bi_579(text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_tablero_suministro_579(uuid, uuid, uuid, jsonb),
  public.registrar_corte_tablero_579(uuid, uuid, text), public.registrar_cortes_automaticos_579(),
  public.operar_credenciales_bi_579(uuid, uuid, text, jsonb, text), public.consultar_credenciales_bi_579(uuid, uuid),
  public.leer_dataset_bi_579(text, text, text, jsonb, jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
