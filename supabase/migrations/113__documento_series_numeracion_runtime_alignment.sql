-- ============================================================================
-- 113__documento_series_numeracion_runtime_alignment.sql
-- Alineación runtime de correlativos fiscales en documento_series.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- documento_series: columnas operativas de numeración.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.documento_series
  ADD COLUMN IF NOT EXISTS longitud_correlativo integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS reiniciar_por_periodo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS periodo_actual text;

ALTER TABLE IF EXISTS public.documento_series
  ALTER COLUMN correlativo_actual TYPE integer USING app.to_int_or_zero(correlativo_actual::text),
  ALTER COLUMN correlativo_maximo TYPE integer USING app.to_int_or_zero(correlativo_maximo::text),
  ALTER COLUMN longitud_correlativo TYPE integer USING app.to_int_or_zero(longitud_correlativo::text);

CREATE OR REPLACE FUNCTION app.normalize_documento_series_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.tipo_documento := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.tipo_documento, '')), ''), '01'));
  NEW.serie := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.serie, '')), ''), 'F001'));
  NEW.correlativo_actual := GREATEST(COALESCE(NEW.correlativo_actual, 0), 0);
  NEW.correlativo_maximo := GREATEST(COALESCE(NEW.correlativo_maximo, 99999999), 1);
  NEW.correlativo_maximo := GREATEST(NEW.correlativo_maximo, NEW.correlativo_actual);
  NEW.longitud_correlativo := GREATEST(LEAST(COALESCE(NEW.longitud_correlativo, 8), 12), 4);
  NEW.reiniciar_por_periodo := COALESCE(NEW.reiniciar_por_periodo, false);
  NEW.periodo_actual := NULLIF(btrim(COALESCE(NEW.periodo_actual, '')), '');

  NEW.activo := COALESCE(
    NEW.activo,
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  NEW.codigo := COALESCE(
    NULLIF(btrim(COALESCE(NEW.codigo, '')), ''),
    NEW.tipo_documento || '-' || NEW.serie
  );

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_documento_series_row ON public.documento_series;
CREATE TRIGGER trg_normalize_documento_series_row
BEFORE INSERT OR UPDATE ON public.documento_series
FOR EACH ROW
EXECUTE FUNCTION app.normalize_documento_series_row();

UPDATE public.documento_series
SET updated_at = COALESCE(updated_at, now())
WHERE true;

CREATE INDEX IF NOT EXISTS idx_documento_series_scope_activo_runtime
ON public.documento_series (tenant_id, tipo_documento, serie, activo, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_documento_series_tenant_tipo_runtime
ON public.documento_series (tenant_id, tipo_documento, activo, updated_at DESC);

-- ----------------------------------------------------------------------------
-- RPC: siguiente número por serie (con lock por fila y guardas de maximo).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_serie(
  p_tenant_id uuid,
  p_tipo_documento text,
  p_serie text
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tipo text := upper(COALESCE(NULLIF(btrim(COALESCE(p_tipo_documento, '')), ''), '01'));
  v_serie text := upper(COALESCE(NULLIF(btrim(COALESCE(p_serie, '')), ''), 'F001'));
  v_row_id uuid;
  v_actual integer;
  v_maximo integer;
  v_longitud integer;
  v_next integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED';
  END IF;

  INSERT INTO public.documento_series(
    id, tenant_id, tipo_documento, serie, correlativo_actual, correlativo_maximo,
    longitud_correlativo, activo, estado, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, v_tipo, v_serie, 0, 99999999,
    8, true, 'ACTIVO', now(), now()
  )
  ON CONFLICT DO NOTHING;

  SELECT ds.id, ds.correlativo_actual, ds.correlativo_maximo, ds.longitud_correlativo
  INTO v_row_id, v_actual, v_maximo, v_longitud
  FROM public.documento_series ds
  WHERE ds.tenant_id = p_tenant_id
    AND upper(COALESCE(ds.tipo_documento, '')) = v_tipo
    AND upper(COALESCE(ds.serie, '')) = v_serie
    AND COALESCE(ds.activo, true) = true
  ORDER BY COALESCE(ds.updated_at, ds.created_at, now()) DESC, ds.id::text DESC
  LIMIT 1
  FOR UPDATE;

  IF v_row_id IS NULL THEN
    INSERT INTO public.documento_series(
      id, tenant_id, tipo_documento, serie, correlativo_actual, correlativo_maximo,
      longitud_correlativo, activo, estado, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), p_tenant_id, v_tipo, v_serie, 0, 99999999,
      8, true, 'ACTIVO', now(), now()
    )
    RETURNING id, correlativo_actual, correlativo_maximo, longitud_correlativo
      INTO v_row_id, v_actual, v_maximo, v_longitud;
  END IF;

  v_next := COALESCE(v_actual, 0) + 1;
  IF v_maximo IS NOT NULL AND v_next > v_maximo THEN
    RAISE EXCEPTION 'DOCUMENTO_SERIE_MAX_REACHED: tenant=% tipo=% serie=% next=% max=%',
      p_tenant_id, v_tipo, v_serie, v_next, v_maximo;
  END IF;

  UPDATE public.documento_series
  SET correlativo_actual = v_next,
      updated_at = now()
  WHERE id = v_row_id;

  RETURN lpad(v_next::text, GREATEST(COALESCE(v_longitud, 8), 1), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_documento(
  p_tenant_id uuid,
  p_tipo_documento text,
  p_serie text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT public.obtener_siguiente_numero_serie(p_tenant_id, p_tipo_documento, p_serie);
$$;

COMMIT;
