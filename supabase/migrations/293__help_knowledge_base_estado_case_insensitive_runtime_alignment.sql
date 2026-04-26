-- ============================================================================
-- 293__help_knowledge_base_estado_case_insensitive_runtime_alignment.sql
-- Alineacion runtime case-insensitive de estado en knowledge_base.
-- Tabla foco:
--   public.knowledge_base
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- Helper canonico de normalizacion de estado para knowledge_base.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_help_knowledge_base_estado_293(
  p_estado text,
  p_activo boolean DEFAULT NULL
)
RETURNS citext
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  v := upper(COALESCE(NULLIF(btrim(COALESCE(p_estado, '')), ''), ''));

  IF v IN ('ENABLED', 'HABILITADO', 'VIGENTE', 'PUBLICADO', 'DISPONIBLE') THEN
    v := 'ACTIVO';
  END IF;
  IF v IN ('DISABLED', 'DESHABILITADO', 'ARCHIVADO', 'OCULTO', 'BAJA') THEN
    v := 'INACTIVO';
  END IF;

  IF v = '' THEN
    v := CASE WHEN COALESCE(p_activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;

  IF v NOT IN ('ACTIVO', 'INACTIVO') THEN
    v := CASE WHEN COALESCE(p_activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;

  RETURN v::citext;
END;
$$;

-- ----------------------------------------------------------------------------
-- Garantizar columnas minimas de contrato.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.knowledge_base
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Normalizador runtime (reemplazo compatible de función existente).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_knowledge_base_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.pregunta := COALESCE(
    NULLIF(btrim(COALESCE(NEW.pregunta, '')), ''),
    NULLIF(btrim(COALESCE(NEW.nombre, '')), ''),
    'Pregunta sin título'
  );
  NEW.respuesta := COALESCE(
    NULLIF(btrim(COALESCE(NEW.respuesta, '')), ''),
    'Contenido pendiente de documentación.'
  );

  NEW.categoria := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.categoria, '')), ''), 'GENERAL'));
  NEW.rol := upper(NULLIF(btrim(COALESCE(NEW.rol, '')), ''));
  NEW.idioma := lower(COALESCE(NULLIF(btrim(COALESCE(NEW.idioma, '')), ''), 'es'));

  IF NEW.url_modulo IS NOT NULL AND btrim(NEW.url_modulo) <> '' THEN
    NEW.url_modulo := CASE
      WHEN left(NEW.url_modulo, 1) = '/' THEN NEW.url_modulo
      ELSE '/' || NEW.url_modulo
    END;
  END IF;
  NEW.url_modulo := NULLIF(btrim(COALESCE(NEW.url_modulo, '')), '');

  NEW.palabras_clave := COALESCE(NEW.palabras_clave, '{}'::text[]);
  NEW.pasos := COALESCE(NEW.pasos, '[]'::jsonb);
  NEW.orden := GREATEST(COALESCE(NEW.orden, 0), 0);
  NEW.usage_count := GREATEST(COALESCE(NEW.usage_count, 0), 0);

  NEW.activo := COALESCE(
    NEW.activo,
    lower(app.normalize_help_knowledge_base_estado_293(NEW.estado::text, true)::text) = 'activo'
  );
  NEW.estado := app.normalize_help_knowledge_base_estado_293(NEW.estado::text, NEW.activo);
  NEW.activo := (lower(NEW.estado::text) = 'activo');

  NEW.codigo := COALESCE(NULLIF(btrim(COALESCE(NEW.codigo, '')), ''), NEW.pregunta);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_knowledge_base_row ON public.knowledge_base;
CREATE TRIGGER trg_normalize_knowledge_base_row
BEFORE INSERT OR UPDATE ON public.knowledge_base
FOR EACH ROW
EXECUTE FUNCTION app.normalize_knowledge_base_row();

-- ----------------------------------------------------------------------------
-- Migracion de estado a citext + default canonico.
-- ----------------------------------------------------------------------------
ALTER TABLE public.knowledge_base
  ALTER COLUMN estado TYPE citext
  USING app.normalize_help_knowledge_base_estado_293(estado::text, COALESCE(activo, true)),
  ALTER COLUMN estado SET DEFAULT 'ACTIVO'::citext;

-- ----------------------------------------------------------------------------
-- Backfill defensivo y sincronia estado/activo.
-- ----------------------------------------------------------------------------
UPDATE public.knowledge_base
SET
  activo = COALESCE(
    activo,
    lower(app.normalize_help_knowledge_base_estado_293(estado::text, true)::text) = 'activo'
  ),
  estado = CASE
    WHEN COALESCE(
      activo,
      lower(app.normalize_help_knowledge_base_estado_293(estado::text, true)::text) = 'activo'
    ) THEN 'ACTIVO'::citext
    ELSE 'INACTIVO'::citext
  END,
  updated_at = COALESCE(updated_at, now());

-- ----------------------------------------------------------------------------
-- Indices runtime CI por estado.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kb_tenant_estado_ci_runtime_293
ON public.knowledge_base (tenant_id, estado, categoria, orden, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kb_global_estado_ci_runtime_293
ON public.knowledge_base (estado, categoria, orden, created_at DESC)
WHERE tenant_id IS NULL;

COMMIT;
