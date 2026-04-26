-- ============================================================================
-- 272__catalogos_fiscales_pago_estado_case_insensitive_runtime_alignment.sql
-- Runtime alignment para estado case-insensitive en catalogos fiscales/pago.
-- Tablas foco:
--   public.paises
--   public.metodos_pago
--   public.tipos_documentos_fiscales
--   public.tipos_impuestos
--   public.tipos_cambio
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper de normalizacion canonica de estado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_estado_activo_inactivo_272(p_input text)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_input, '')), ''), 'ACTIVO'));

  IF v IN ('ENABLED', 'HABILITADO', 'VIGENTE', 'ACTIVA') THEN
    v := 'ACTIVO';
  END IF;

  IF v IN ('DISABLED', 'DESHABILITADO', 'INACTIVA', 'BAJA', 'ARCHIVADO', 'SUSPENDIDO') THEN
    v := 'INACTIVO';
  END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO') THEN
    v := 'ACTIVO';
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Trigger generico para mantener sincronia estado/activo.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_catalogo_estado_row_272()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.estado := app.normalize_estado_activo_inactivo_272(NEW.estado::text);

  IF NEW.activo IS NULL THEN
    NEW.activo := (lower(NEW.estado::text) = 'activo');
  END IF;

  NEW.estado := CASE
    WHEN NEW.activo THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END;

  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columnas minimas de contrato.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'paises',
    'metodos_pago',
    'tipos_documentos_fiscales',
    'tipos_impuestos',
    'tipos_cambio'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS estado text DEFAULT ''ACTIVO''',
      v_table
    );

    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true',
      v_table
    );

    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()',
      v_table
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext + defaults canonicos.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'paises',
    'metodos_pago',
    'tipos_documentos_fiscales',
    'tipos_impuestos',
    'tipos_cambio'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I
         ALTER COLUMN estado TYPE citext
         USING app.normalize_estado_activo_inactivo_272(estado::text)',
      v_table
    );

    EXECUTE format(
      'ALTER TABLE public.%I
         ALTER COLUMN estado SET DEFAULT ''ACTIVO''::citext',
      v_table
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Backfill defensivo para sincronizar estado/activo.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'paises',
    'metodos_pago',
    'tipos_documentos_fiscales',
    'tipos_impuestos',
    'tipos_cambio'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.%I
       SET
         activo = COALESCE(activo, lower(app.normalize_estado_activo_inactivo_272(estado::text)::text) = ''activo''),
         estado = CASE
           WHEN COALESCE(activo, lower(app.normalize_estado_activo_inactivo_272(estado::text)::text) = ''activo'')
             THEN ''ACTIVO''::citext
           ELSE ''INACTIVO''::citext
         END,
         updated_at = COALESCE(updated_at, now())',
      v_table
    );
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- Triggers solo para tablas sin trigger funcional equivalente previo.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_normalize_paises_row_272 ON public.paises;
CREATE TRIGGER trg_normalize_paises_row_272
BEFORE INSERT OR UPDATE ON public.paises
FOR EACH ROW
EXECUTE FUNCTION app.normalize_catalogo_estado_row_272();

DROP TRIGGER IF EXISTS trg_normalize_metodos_pago_row_272 ON public.metodos_pago;
CREATE TRIGGER trg_normalize_metodos_pago_row_272
BEFORE INSERT OR UPDATE ON public.metodos_pago
FOR EACH ROW
EXECUTE FUNCTION app.normalize_catalogo_estado_row_272();

DROP TRIGGER IF EXISTS trg_normalize_tipos_cambio_row_272 ON public.tipos_cambio;
CREATE TRIGGER trg_normalize_tipos_cambio_row_272
BEFORE INSERT OR UPDATE ON public.tipos_cambio
FOR EACH ROW
EXECUTE FUNCTION app.normalize_catalogo_estado_row_272();

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado para filtros frecuentes.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_paises_estado_ci_runtime_272
ON public.paises (estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_metodos_pago_tenant_estado_ci_runtime_272
ON public.metodos_pago (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tipos_documentos_fiscales_tenant_pais_estado_ci_runtime_272
ON public.tipos_documentos_fiscales (tenant_id, pais_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_tenant_pais_estado_ci_runtime_272
ON public.tipos_impuestos (tenant_id, pais_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tipos_cambio_tenant_estado_ci_runtime_272
ON public.tipos_cambio (tenant_id, estado, updated_at DESC);

COMMIT;
