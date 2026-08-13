-- 496: Alinea el consolidado comercial a diez fuentes y hace que el saldo del
-- kardex incluya el inventario anterior al rango consultado.

BEGIN;

SET LOCAL lock_timeout = '10s';

-- El producto promete bloques de hasta diez ventas. La restriccion se deja
-- NOT VALID si existiera evidencia historica mayor, pero siempre protege filas
-- nuevas. En instalaciones limpias queda validada inmediatamente.
ALTER TABLE public.ventas_consolidados
  DROP CONSTRAINT IF EXISTS ck_ventas_consolidados_count_469;
ALTER TABLE public.ventas_consolidados
  ADD CONSTRAINT ck_ventas_consolidados_count_469
  CHECK (cantidad_fuentes BETWEEN 1 AND 10) NOT VALID;

DO $validate_batch_limit$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ventas_consolidados WHERE cantidad_fuentes NOT BETWEEN 1 AND 10
  ) THEN
    ALTER TABLE public.ventas_consolidados
      VALIDATE CONSTRAINT ck_ventas_consolidados_count_469;
  END IF;
END;
$validate_batch_limit$;

CREATE OR REPLACE FUNCTION app.guard_ventas_consolidado_max_10_496()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  IF NEW.cantidad_fuentes NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'COMMERCIAL_BATCH_MAX_TEN_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_ventas_consolidado_max_10_496
  ON public.ventas_consolidados;
CREATE TRIGGER trg_guard_ventas_consolidado_max_10_496
BEFORE INSERT OR UPDATE OF cantidad_fuentes ON public.ventas_consolidados
FOR EACH ROW EXECUTE FUNCTION app.guard_ventas_consolidado_max_10_496();

REVOKE ALL ON FUNCTION app.guard_ventas_consolidado_max_10_496()
  FROM PUBLIC, anon, authenticated, service_role;

-- Conserva la implementación 469 como detalle interno y repone el mismo nombre
-- público con un preguard barato. Así once fuentes se rechazan antes de tomar
-- locks, leer ventas o reservar correlativos, sin romper callers existentes.
DO $move_batch_impl$
BEGIN
  IF to_regprocedure(
       'app.crear_consolidado_ventas_impl_496(uuid,uuid,text,jsonb,text)'
     ) IS NULL THEN
    ALTER FUNCTION public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)
      SET SCHEMA app;
    ALTER FUNCTION app.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)
      RENAME TO crear_consolidado_ventas_impl_496;
  END IF;
END;
$move_batch_impl$;

CREATE OR REPLACE FUNCTION public.crear_consolidado_ventas_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_idempotency_key text,
  p_fuentes jsonb,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_fuentes jsonb;
  v_fingerprint text;
  v_existing public.ventas_consolidados%ROWTYPE;
BEGIN
  IF p_fuentes IS NULL OR jsonb_typeof(p_fuentes) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_fuentes) < 1 THEN
    RAISE EXCEPTION 'COMMERCIAL_BATCH_MAX_TEN_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_fuentes) > 10 THEN
    -- Compatibilidad estrictamente de lectura para lotes 469 históricos: una
    -- intención nueva >10 continúa prohibida, pero una respuesta perdida puede
    -- recuperar su snapshot sin volver a inspeccionar ni bloquear las fuentes.
    IF NOT app.actor_comercial_valido_469(p_tenant_id, p_actor_id)
       OR length(v_key) NOT BETWEEN 8 AND 255 THEN
      RAISE EXCEPTION 'COMMERCIAL_BATCH_INPUT_INVALID' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_fuentes) f
      WHERE upper(COALESCE(f->>'tipo', '')) NOT IN ('POS', 'DOCUMENTO')
        OR app.to_uuid_or_null(f->>'id') IS NULL
    ) THEN
      RAISE EXCEPTION 'COMMERCIAL_BATCH_SOURCE_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'id', id) ORDER BY tipo, id)
      INTO v_fuentes
    FROM (
      SELECT DISTINCT upper(f->>'tipo') AS tipo, (f->>'id')::uuid AS id
      FROM jsonb_array_elements(p_fuentes) f
    ) normalized;
    IF jsonb_array_length(v_fuentes) <> jsonb_array_length(p_fuentes) THEN
      RAISE EXCEPTION 'COMMERCIAL_BATCH_DUPLICATE_SOURCE' USING ERRCODE = '22023';
    END IF;
    v_fingerprint := app.commercial_fingerprint_469(jsonb_build_object(
      'fuentes', v_fuentes,
      'notas', NULLIF(btrim(COALESCE(p_notas, '')), '')
    ));
    SELECT * INTO v_existing
    FROM public.ventas_consolidados
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_key
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'COMMERCIAL_BATCH_MAX_TEN_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF v_existing.created_by IS DISTINCT FROM p_actor_id
       OR v_existing.source_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'COMMERCIAL_BATCH_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'consolidado', to_jsonb(v_existing),
      'detalles', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.orden), '[]'::jsonb)
        FROM public.ventas_consolidado_detalles d WHERE d.consolidado_id = v_existing.id),
      'idempotent', true,
      'accounting_events_created', 0
    );
  END IF;

  RETURN app.crear_consolidado_ventas_impl_496(
    p_tenant_id, p_actor_id, p_idempotency_key, p_fuentes, p_notas
  );
END;
$fn$;

REVOKE ALL ON FUNCTION app.crear_consolidado_ventas_impl_496(uuid,uuid,text,jsonb,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text)
  TO service_role;

COMMENT ON FUNCTION public.crear_consolidado_ventas_tx(uuid,uuid,text,jsonb,text) IS
  'Preguard canónico 496: admite 1..10 fuentes nuevas; para lotes legacy mayores sólo recupera el replay exacto del mismo actor y huella, sin bloquear fuentes ni crear efectos.';

CREATE OR REPLACE FUNCTION app.product_unit_supported_496(p_unit text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT upper(NULLIF(btrim(p_unit), '')) = ANY (
    ARRAY['NIU', 'KGM', 'LTR', 'MTR', 'ZZ']::text[]
  );
$fn$;

REVOKE ALL ON FUNCTION app.product_unit_supported_496(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- El maestro ofrece deliberadamente el subconjunto de unidades que todas las
-- superficies actuales (inventario, POS y CPE) saben representar. Un código
-- que sólo "parece" válido no debe convertirse en un código fiscal inventado.
CREATE OR REPLACE FUNCTION app.guard_product_unit_supported_496()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app, pg_temp
AS $fn$
BEGIN
  -- Filas legacy con códigos anteriores siguen siendo legibles/editables en
  -- otros campos; sólo una unidad nueva o cambiada debe satisfacer el contrato.
  IF NEW.unidad_medida IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.unidad_medida IS DISTINCT FROM OLD.unidad_medida)
     AND NOT app.product_unit_supported_496(NEW.unidad_medida) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_UNIT_UNSUPPORTED'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_product_unit_supported_496
  ON public.productos;
CREATE TRIGGER trg_guard_product_unit_supported_496
BEFORE INSERT OR UPDATE OF unidad_medida ON public.productos
FOR EACH ROW EXECUTE FUNCTION app.guard_product_unit_supported_496();

REVOKE ALL ON FUNCTION app.guard_product_unit_supported_496()
  FROM PUBLIC, anon, authenticated, service_role;

-- El maestro 460 era la frontera canónica de producto, pero la unidad enviada
-- por API no llegaba a `productos.unidad_medida`. Se endurece la función ya
-- instalada (469 también la amplía con marca) para que la unidad forme parte de
-- la huella, la auditoría y la respuesta. Una unidad con historial de kardex no
-- puede cambiar: hacerlo reinterpretaría retroactivamente movimientos antiguos.
DO $patch_product_unit_460$
DECLARE
  v_create text;
  v_update text;
  v_create_payload_needle text := $needle$
    'es_servicio', v_es_servicio,
    'controla_stock', v_controla_stock,
    'afectacion_igv', COALESCE(NULLIF(btrim(p_payload->>'afectacion_igv'), ''), '10'),
$needle$;
  v_create_payload_replacement text := $replacement$
    'es_servicio', v_es_servicio,
    'controla_stock', v_controla_stock,
    'unidad_medida', upper(COALESCE(
      NULLIF(btrim(p_payload->>'unidad_medida'), ''),
      CASE WHEN v_es_servicio THEN 'ZZ' ELSE 'NIU' END
    )),
    'afectacion_igv', COALESCE(NULLIF(btrim(p_payload->>'afectacion_igv'), ''), '10'),
$replacement$;
  v_create_update_needle text := $needle$
  SET marca = NULLIF(btrim(COALESCE(p_payload->>'marca', '')), ''),
      created_by = p_actor_id,
$needle$;
  v_create_update_replacement text := $replacement$
  SET marca = NULLIF(btrim(COALESCE(p_payload->>'marca', '')), ''),
      unidad_medida = v_producto_payload->>'unidad_medida',
      created_by = p_actor_id,
$replacement$;
  v_create_validation_needle text := $needle$
     OR length(COALESCE(v_producto_payload->>'marca', '')) > 120 THEN
$needle$;
  v_create_validation_replacement text := $replacement$
     OR length(COALESCE(v_producto_payload->>'marca', '')) > 120
     OR COALESCE(v_producto_payload->>'unidad_medida', '') !~ '^[A-Z0-9]{2,5}$' THEN
$replacement$;
  v_update_guard_needle text := $needle$
  UPDATE public.productos p
$needle$;
  v_update_guard_replacement text := $replacement$
  IF p_cambios ? 'unidad_medida'
     AND NULLIF(btrim(v_old.unidad_medida), '') IS NOT NULL
     AND upper(COALESCE(NULLIF(btrim(p_cambios->>'unidad_medida'), ''), ''))
       IS DISTINCT FROM upper(NULLIF(btrim(v_old.unidad_medida), ''))
     AND EXISTS (
       SELECT 1 FROM public.movimientos_inventario mi
       WHERE mi.tenant_id = p_tenant_id AND mi.producto_id = p_producto_id
     ) THEN
    RAISE EXCEPTION 'INVENTORY_MASTER_PRODUCT_UNIT_WITH_HISTORY_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.productos p
$replacement$;
  v_update_set_needle text := $needle$
      marca = CASE WHEN p_cambios ? 'marca' THEN NULLIF(btrim(p_cambios->>'marca'), '') ELSE p.marca END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE p.descripcion END,
$needle$;
  v_update_set_replacement text := $replacement$
      marca = CASE WHEN p_cambios ? 'marca' THEN NULLIF(btrim(p_cambios->>'marca'), '') ELSE p.marca END,
      unidad_medida = CASE WHEN p_cambios ? 'unidad_medida'
        THEN upper(NULLIF(btrim(p_cambios->>'unidad_medida'), '')) ELSE p.unidad_medida END,
      descripcion = CASE WHEN p_cambios ? 'descripcion' THEN NULLIF(btrim(p_cambios->>'descripcion'), '') ELSE p.descripcion END,
$replacement$;
  v_update_validation_needle text := $needle$
     OR length(COALESCE(v_new.marca, '')) > 120
     OR jsonb_typeof(COALESCE(v_new.atributos_extra, '{}'::jsonb)) <> 'object' THEN
$needle$;
  v_update_validation_replacement text := $replacement$
     OR length(COALESCE(v_new.marca, '')) > 120
     OR COALESCE(v_new.unidad_medida, '') !~ '^[A-Z0-9]{2,5}$'
     OR jsonb_typeof(COALESCE(v_new.atributos_extra, '{}'::jsonb)) <> 'object' THEN
$replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.crear_producto_maestro_tx(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_create;
  IF strpos(v_create, '''unidad_medida'', upper(COALESCE(') > 0
     OR strpos(v_create, 'unidad_medida = v_producto_payload->>''unidad_medida''') > 0
     OR strpos(v_create, 'INVENTORY_MASTER_PRODUCT_UNIT_WITH_HISTORY_IMMUTABLE') > 0 THEN
    IF strpos(v_create, '''unidad_medida'', upper(COALESCE(') = 0
       OR strpos(v_create, 'unidad_medida = v_producto_payload->>''unidad_medida''') = 0 THEN
      RAISE EXCEPTION 'KARDEX_UNIT_496_PRODUCT_CREATE_PARTIALLY_PATCHED';
    END IF;
  ELSE
    IF strpos(v_create, v_create_payload_needle) = 0
       OR strpos(substr(v_create, strpos(v_create, v_create_payload_needle) + 1), v_create_payload_needle) > 0
       OR strpos(v_create, v_create_update_needle) = 0
       OR strpos(substr(v_create, strpos(v_create, v_create_update_needle) + 1), v_create_update_needle) > 0
       OR strpos(v_create, v_create_validation_needle) = 0
       OR strpos(substr(v_create, strpos(v_create, v_create_validation_needle) + 1), v_create_validation_needle) > 0 THEN
      RAISE EXCEPTION 'KARDEX_UNIT_496_CANNOT_PATCH_PRODUCT_CREATE_460';
    END IF;
    v_create := replace(v_create, v_create_payload_needle, v_create_payload_replacement);
    v_create := replace(v_create, v_create_update_needle, v_create_update_replacement);
    v_create := replace(v_create, v_create_validation_needle, v_create_validation_replacement);
    EXECUTE v_create;
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.actualizar_producto_maestro_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_update;
  IF strpos(v_update, 'INVENTORY_MASTER_PRODUCT_UNIT_WITH_HISTORY_IMMUTABLE') > 0
     OR strpos(v_update, 'unidad_medida = CASE WHEN p_cambios ? ''unidad_medida''') > 0 THEN
    IF strpos(v_update, 'INVENTORY_MASTER_PRODUCT_UNIT_WITH_HISTORY_IMMUTABLE') = 0
       OR strpos(v_update, 'unidad_medida = CASE WHEN p_cambios ? ''unidad_medida''') = 0
       OR strpos(v_update, 'COALESCE(v_new.unidad_medida') = 0 THEN
      RAISE EXCEPTION 'KARDEX_UNIT_496_PRODUCT_UPDATE_PARTIALLY_PATCHED';
    END IF;
  ELSE
    IF strpos(v_update, v_update_guard_needle) = 0
       OR strpos(substr(v_update, strpos(v_update, v_update_guard_needle) + 1), v_update_guard_needle) > 0
       OR strpos(v_update, v_update_set_needle) = 0
       OR strpos(substr(v_update, strpos(v_update, v_update_set_needle) + 1), v_update_set_needle) > 0
       OR strpos(v_update, v_update_validation_needle) = 0
       OR strpos(substr(v_update, strpos(v_update, v_update_validation_needle) + 1), v_update_validation_needle) > 0 THEN
      RAISE EXCEPTION 'KARDEX_UNIT_496_CANNOT_PATCH_PRODUCT_UPDATE_460';
    END IF;
    v_update := replace(v_update, v_update_guard_needle, v_update_guard_replacement);
    v_update := replace(v_update, v_update_set_needle, v_update_set_replacement);
    v_update := replace(v_update, v_update_validation_needle, v_update_validation_replacement);
    EXECUTE v_update;
  END IF;
END;
$patch_product_unit_460$;

-- Upgrade idempotente de una revisión 496 intermedia: los productos legacy con
-- unidad NULL necesitan una regularización explícita y auditada. Sólo después
-- de asignarla se vuelve inmutable frente a su historial de kardex.
DO $upgrade_product_unit_null_496$
DECLARE
  v_update text;
  v_old text := $needle$
  IF p_cambios ? 'unidad_medida'
     AND upper(COALESCE(NULLIF(btrim(p_cambios->>'unidad_medida'), ''), ''))
       IS DISTINCT FROM upper(COALESCE(NULLIF(btrim(v_old.unidad_medida), ''), 'NIU'))
$needle$;
  v_new text := $replacement$
  IF p_cambios ? 'unidad_medida'
     AND NULLIF(btrim(v_old.unidad_medida), '') IS NOT NULL
     AND upper(COALESCE(NULLIF(btrim(p_cambios->>'unidad_medida'), ''), ''))
       IS DISTINCT FROM upper(NULLIF(btrim(v_old.unidad_medida), ''))
$replacement$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.actualizar_producto_maestro_tx(uuid,uuid,uuid,text,jsonb)'::regprocedure
  ) INTO v_update;
  IF strpos(v_update, v_old) > 0 THEN
    IF strpos(substr(v_update, strpos(v_update, v_old) + 1), v_old) > 0 THEN
      RAISE EXCEPTION 'KARDEX_UNIT_496_LEGACY_NULL_GUARD_DUPLICATED';
    END IF;
    EXECUTE replace(v_update, v_old, v_new);
  ELSIF strpos(v_update, v_new) = 0 THEN
    RAISE EXCEPTION 'KARDEX_UNIT_496_LEGACY_NULL_GUARD_UNKNOWN';
  END IF;
END;
$upgrade_product_unit_null_496$;

COMMENT ON COLUMN public.productos.unidad_medida IS
  'Código de unidad soportado por el ERP (NIU/KGM/LTR/MTR/ZZ). Desde 496 forma parte del alta/edición canónica; un legacy NULL se regulariza una vez y luego no cambia si ya tiene kardex.';

CREATE OR REPLACE FUNCTION public.reporte_kardex_valorizado_470(
  p_tenant_id uuid,
  p_producto_id uuid DEFAULT NULL,
  p_almacen_id uuid DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_limit integer DEFAULT 250
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, app, pg_temp
AS $fn$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_tenant_base_currency text;
  v_timezone text;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'KARDEX_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde > p_hasta THEN
    RAISE EXCEPTION 'KARDEX_DATE_RANGE_INVALID' USING ERRCODE = '22007';
  END IF;

  SELECT upper(NULLIF(btrim(ec.moneda_defecto), '')),
         app.zona_horaria_pais(t.pais)
    INTO v_tenant_base_currency, v_timezone
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE t.id = p_tenant_id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KARDEX_TENANT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT k.*,
           upper(NULLIF(btrim(prod.unidad_medida), '')) AS producto_unidad_medida,
           (k.fecha_recepcion AT TIME ZONE v_timezone)::date AS fecha_local
    FROM public.vw_kardex_valorizado k
    LEFT JOIN public.productos prod
      ON prod.id = k.producto_id AND prod.tenant_id = k.tenant_id
    WHERE k.tenant_id = p_tenant_id
      AND (p_producto_id IS NULL OR k.producto_id = p_producto_id)
      AND (p_almacen_id IS NULL OR k.almacen_id = p_almacen_id)
      AND (p_hasta IS NULL OR (k.fecha_recepcion AT TIME ZONE v_timezone)::date <= p_hasta)
  ), running AS MATERIALIZED (
    SELECT s.*,
      CASE
        WHEN count(*) FILTER (WHERE cantidad_firmada IS NULL) OVER quantity_window > 0
          THEN NULL
        ELSE round(sum(cantidad_firmada) OVER quantity_window, 2)
      END AS saldo_cantidad_posterior,
      CASE
        WHEN count(*) FILTER (
          WHERE valor_firmado_base IS NULL OR moneda_base IS NULL
        ) OVER value_window > 0
          OR min(moneda_base) OVER value_window IS DISTINCT FROM max(moneda_base) OVER value_window
          THEN NULL
        ELSE round(sum(valor_firmado_base) OVER value_window, 2)
      END AS saldo_valorizado_base_posterior,
      CASE
        WHEN min(moneda_base) OVER value_window IS NOT DISTINCT FROM max(moneda_base) OVER value_window
          THEN max(moneda_base) OVER value_window
        ELSE NULL
      END AS saldo_moneda_base
    FROM scoped s
    WINDOW
      quantity_window AS (
        PARTITION BY producto_id, almacen_id
        ORDER BY fecha_recepcion, movimiento_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ),
      value_window AS (
        PARTITION BY producto_id, almacen_id
        ORDER BY fecha_recepcion, movimiento_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )
  ), period AS MATERIALIZED (
    SELECT * FROM running
    WHERE p_desde IS NULL OR fecha_local >= p_desde
  ), details AS (
    SELECT * FROM period
    ORDER BY fecha_recepcion DESC, movimiento_id DESC
    LIMIT v_limit
  ), period_stats AS (
    SELECT
      count(*) AS movements,
      count(DISTINCT producto_id) FILTER (WHERE producto_id IS NOT NULL) AS products,
      count(DISTINCT producto_unidad_medida) FILTER (
        WHERE producto_unidad_medida IS NOT NULL
      ) AS quantity_units,
      count(*) FILTER (WHERE producto_unidad_medida IS NULL) AS missing_unit,
      count(*) FILTER (WHERE cantidad_firmada IS NULL) AS missing_direction,
      count(*) FILTER (WHERE valor_firmado_base IS NULL) AS missing_value,
      count(DISTINCT moneda_base) FILTER (WHERE moneda_base IS NOT NULL) AS base_currencies,
      round(coalesce(sum(greatest(cantidad_firmada, 0)), 0), 2) AS entries,
      round(coalesce(sum(abs(least(cantidad_firmada, 0))), 0), 2) AS exits,
      round(coalesce(sum(cantidad_firmada), 0), 2) AS quantity_net,
      round(coalesce(sum(valor_firmado_base), 0), 2) AS value_net,
      round(coalesce(sum(greatest(valor_firmado_base, 0)), 0), 2) AS value_entries,
      round(coalesce(sum(abs(least(valor_firmado_base, 0))), 0), 2) AS value_exits,
      round(coalesce(sum(cantidad_firmada) FILTER (WHERE tipo = 'AJUSTE'), 0), 2) AS adjustments,
      round(coalesce(sum(cantidad_firmada) FILTER (WHERE tipo = 'DEVOLUCION'), 0), 2) AS returns,
      count(*) FILTER (WHERE valuacion_estado IS DISTINCT FROM 'CONFIRMADA') AS pending_valuation
    FROM period
  ), opening_stats AS (
    SELECT
      count(*) AS movements,
      count(DISTINCT producto_id) FILTER (WHERE producto_id IS NOT NULL) AS products,
      count(DISTINCT producto_unidad_medida) FILTER (
        WHERE producto_unidad_medida IS NOT NULL
      ) AS quantity_units,
      count(*) FILTER (WHERE producto_unidad_medida IS NULL) AS missing_unit,
      count(*) FILTER (WHERE cantidad_firmada IS NULL) AS missing_direction,
      count(*) FILTER (WHERE valor_firmado_base IS NULL) AS missing_value,
      count(DISTINCT moneda_base) FILTER (WHERE moneda_base IS NOT NULL) AS base_currencies,
      round(coalesce(sum(cantidad_firmada), 0), 2) AS quantity_balance,
      round(coalesce(sum(valor_firmado_base), 0), 2) AS value_balance
    FROM scoped
    WHERE p_desde IS NOT NULL AND fecha_local < p_desde
  ), closing_stats AS (
    SELECT
      count(*) AS movements,
      count(DISTINCT producto_id) FILTER (WHERE producto_id IS NOT NULL) AS products,
      count(DISTINCT producto_unidad_medida) FILTER (
        WHERE producto_unidad_medida IS NOT NULL
      ) AS quantity_units,
      count(*) FILTER (WHERE producto_unidad_medida IS NULL) AS missing_unit,
      count(*) FILTER (WHERE cantidad_firmada IS NULL) AS missing_direction,
      count(*) FILTER (WHERE valor_firmado_base IS NULL) AS missing_value,
      count(DISTINCT moneda_base) FILTER (WHERE moneda_base IS NOT NULL) AS base_currencies,
      round(coalesce(sum(cantidad_firmada), 0), 2) AS quantity_balance,
      round(coalesce(sum(valor_firmado_base), 0), 2) AS value_balance,
      count(*) FILTER (WHERE valuacion_estado IS DISTINCT FROM 'CONFIRMADA') AS pending_valuation
    FROM scoped
  ), closing_currency_totals AS (
    SELECT moneda_detalle AS moneda, round(sum(valor_firmado), 2) AS total
    FROM scoped
    WHERE moneda_detalle IS NOT NULL AND valor_firmado IS NOT NULL
    GROUP BY moneda_detalle
  ), closing_base_totals AS (
    SELECT moneda_base AS moneda, round(sum(valor_firmado_base), 2) AS total
    FROM scoped
    WHERE moneda_base IS NOT NULL AND valor_firmado_base IS NOT NULL
    GROUP BY moneda_base
  ), period_currency_totals AS (
    SELECT moneda_detalle AS moneda, round(sum(valor_firmado), 2) AS total
    FROM period
    WHERE moneda_detalle IS NOT NULL AND valor_firmado IS NOT NULL
    GROUP BY moneda_detalle
  ), detail_json AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', movimiento_id,
      'tipo', tipo,
      'sentido', sentido,
      'fecha', fecha_recepcion,
      'fechaLocal', fecha_local,
      'documento', recepcion_numero,
      'estado', recepcion_estado,
      'cantidad', cantidad_movimiento,
      'cantidadFirmada', cantidad_firmada,
      'costoUnitario', costo_unitario,
      'valorTotal', valor_total,
      'valorFirmado', valor_firmado,
      'moneda', moneda_detalle,
      'monedaBase', moneda_base,
      'tipoCambio', tipo_cambio,
      'valorTotalBase', valor_total_base,
      'valorFirmadoBase', valor_firmado_base,
      'saldoCantidadPosterior', saldo_cantidad_posterior,
      'saldoValorizadoBasePosterior', saldo_valorizado_base_posterior,
      'saldoMonedaBase', saldo_moneda_base,
      'valuacionEstado', valuacion_estado,
      'metodoCosteo', metodo_costeo,
      'producto', jsonb_build_object('id', producto_id, 'nombre', producto_nombre,
        'codigo', producto_codigo, 'sku', producto_sku,
        'unidadMedida', producto_unidad_medida),
      'almacen', CASE WHEN almacen_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', almacen_id, 'nombre', almacen_nombre) END,
      'ubicacion', CASE WHEN ubicacion_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ubicacion_id, 'codigo', ubicacion_codigo) END,
      'lote', lote, 'serie', serie, 'fechaExpiracion', fecha_expiracion,
      'recepcionId', recepcion_id, 'referenciaTipo', referencia_tipo,
      'referenciaId', referencia_id, 'motivo', notas
    ) ORDER BY fecha_recepcion DESC, movimiento_id DESC), '[]'::jsonb) AS data
    FROM details
  )
  SELECT jsonb_build_object(
    'success', true,
    'data', (SELECT data FROM detail_json),
    'resumen', jsonb_build_object(
      'totalMovimientos', ps.movements,
      'totalEntradas', CASE
        WHEN ps.missing_unit > 0 OR ps.products > 1 OR ps.quantity_units > 1 THEN NULL ELSE ps.entries END,
      'totalSalidas', CASE
        WHEN ps.missing_unit > 0 OR ps.products > 1 OR ps.quantity_units > 1 THEN NULL ELSE ps.exits END,
      'totalAjustes', CASE
        WHEN ps.missing_unit > 0 OR ps.products > 1 OR ps.quantity_units > 1 THEN NULL ELSE ps.adjustments END,
      'totalDevoluciones', CASE
        WHEN ps.missing_unit > 0 OR ps.products > 1 OR ps.quantity_units > 1 THEN NULL ELSE ps.returns END,
      'saldoInicialCantidad', CASE
        WHEN os.missing_unit > 0 OR os.missing_direction > 0 OR os.products > 1 OR os.quantity_units > 1 THEN NULL
        ELSE os.quantity_balance END,
      'movimientoNetoCantidad', CASE
        WHEN ps.missing_unit > 0 OR ps.missing_direction > 0 OR ps.products > 1 OR ps.quantity_units > 1 THEN NULL
        ELSE ps.quantity_net END,
      'saldoCantidad', CASE
        WHEN cs.missing_unit > 0 OR cs.missing_direction > 0 OR cs.products > 1 OR cs.quantity_units > 1 THEN NULL
        ELSE cs.quantity_balance END,
      'saldoInicialValorizadoBase', CASE
        WHEN os.missing_value > 0 OR os.missing_direction > 0 OR os.base_currencies > 1 THEN NULL
        ELSE os.value_balance END,
      'movimientoNetoValorizadoBase', CASE
        WHEN ps.missing_value > 0 OR ps.missing_direction > 0 OR ps.base_currencies > 1 THEN NULL
        ELSE ps.value_net END,
      'saldoValorizadoBase', CASE
        WHEN cs.missing_value > 0 OR cs.missing_direction > 0 OR cs.base_currencies > 1 THEN NULL
        ELSE cs.value_balance END,
      'valorEntradasBase', CASE
        WHEN ps.missing_value > 0 OR ps.base_currencies > 1 THEN NULL ELSE ps.value_entries END,
      'valorSalidasBase', CASE
        WHEN ps.missing_value > 0 OR ps.base_currencies > 1 THEN NULL ELSE ps.value_exits END,
      'monedaBase', CASE WHEN cs.movements = 0 THEN v_tenant_base_currency
        WHEN cs.base_currencies = 1 THEN (SELECT max(moneda_base) FROM scoped) ELSE NULL END,
      'pendientesValorizacion', ps.pending_valuation,
      'pendientesSentido', ps.missing_direction,
      'pendientesSaldoValorizacion', cs.pending_valuation,
      'pendientesSaldoSentido', cs.missing_direction,
      'movimientosSaldoHistorico', cs.movements,
      'multiplesMonedasBase', cs.base_currencies > 1,
      'cantidadAgregable', cs.missing_unit = 0 AND cs.products <= 1 AND cs.quantity_units <= 1,
      'productosEnSaldo', cs.products,
      'unidadesEnSaldo', cs.quantity_units,
      'movimientosSinUnidad', cs.missing_unit,
      'resumenConfiable', cs.missing_value = 0 AND cs.missing_direction = 0
        AND cs.base_currencies <= 1,
      'valorPorMoneda', CASE
        WHEN cs.missing_value > 0 OR cs.missing_direction > 0 THEN NULL
        ELSE coalesce((SELECT jsonb_object_agg(moneda, total ORDER BY moneda)
          FROM closing_currency_totals), '{}'::jsonb) END,
      'valorBasePorMoneda', CASE
        WHEN cs.missing_value > 0 OR cs.missing_direction > 0 THEN NULL
        ELSE coalesce((SELECT jsonb_object_agg(moneda, total ORDER BY moneda)
          FROM closing_base_totals), '{}'::jsonb) END,
      'movimientoValorPorMoneda', CASE
        WHEN ps.missing_value > 0 OR ps.missing_direction > 0 THEN NULL
        ELSE coalesce((SELECT jsonb_object_agg(moneda, total ORDER BY moneda)
          FROM period_currency_totals), '{}'::jsonb) END,
      'desde', p_desde,
      'hasta', p_hasta,
      'limiteDetalle', v_limit
    )
  ) INTO v_result
  FROM period_stats ps CROSS JOIN opening_stats os CROSS JOIN closing_stats cs;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reporte_kardex_valorizado_470(
  uuid, uuid, uuid, date, date, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reporte_kardex_valorizado_470(
  uuid, uuid, uuid, date, date, integer
) TO service_role;

COMMENT ON FUNCTION public.reporte_kardex_valorizado_470(uuid,uuid,uuid,date,date,integer) IS
  'Kardex canonico: el detalle y los flujos respetan el rango; saldoInicial considera lo anterior a desde y saldoCantidad/saldoValorizadoBase representan el cierre real hasta hasta. Cada linea incluye saldo posterior por producto/almacen.';

COMMIT;
