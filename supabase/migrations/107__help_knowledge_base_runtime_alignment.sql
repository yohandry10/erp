-- ============================================================================
-- 107__help_knowledge_base_runtime_alignment.sql
-- Alineación runtime del módulo de ayuda (knowledge_base + RPC de help bot).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Columnas operativas para priorización y métricas de uso.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.knowledge_base
  ADD COLUMN IF NOT EXISTS idioma text DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- ----------------------------------------------------------------------------
-- Normalización de knowledge_base.
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
    CASE WHEN upper(COALESCE(NEW.estado, 'ACTIVO')) = 'INACTIVO' THEN false ELSE true END
  );
  NEW.estado := CASE
    WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO'
    ELSE COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'INACTIVO')
  END;

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
-- Backfill de normalización.
-- ----------------------------------------------------------------------------
UPDATE public.knowledge_base
SET updated_at = COALESCE(updated_at, now())
WHERE true;

-- ----------------------------------------------------------------------------
-- Índices runtime del help bot.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kb_scope_activo_categoria_rol_orden_runtime
ON public.knowledge_base (tenant_id, activo, categoria, rol, orden, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kb_global_activo_orden_runtime
ON public.knowledge_base (categoria, rol, orden, created_at DESC)
WHERE tenant_id IS NULL
  AND COALESCE(activo, true) = true;

CREATE INDEX IF NOT EXISTS idx_kb_tenant_activo_orden_runtime
ON public.knowledge_base (tenant_id, categoria, rol, orden, created_at DESC)
WHERE tenant_id IS NOT NULL
  AND COALESCE(activo, true) = true;

-- ----------------------------------------------------------------------------
-- RPC: buscar_ayuda (mantiene firma actual, mejora filtro por tenant/global).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buscar_ayuda(
  p_query text,
  p_rol varchar DEFAULT NULL,
  p_categoria varchar DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_limite int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  pregunta text,
  respuesta text,
  pasos jsonb,
  url_modulo varchar,
  categoria varchar,
  relevancia float
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(p_tenant_id, app.resolve_request_tenant_id(), app.current_tenant_id());
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.pregunta,
    kb.respuesta,
    kb.pasos,
    kb.url_modulo::varchar,
    kb.categoria::varchar,
    ts_rank(
      to_tsvector('spanish', COALESCE(kb.pregunta, '') || ' ' || COALESCE(array_to_string(kb.palabras_clave, ' '), '')),
      plainto_tsquery('spanish', COALESCE(p_query, ''))
    )::float AS relevancia
  FROM public.knowledge_base kb
  WHERE COALESCE(kb.activo, true) = true
    AND (
      (v_tenant_id IS NOT NULL AND (kb.tenant_id IS NULL OR kb.tenant_id = v_tenant_id))
      OR (v_tenant_id IS NULL AND kb.tenant_id IS NULL)
    )
    AND (p_rol IS NULL OR kb.rol IS NULL OR upper(kb.rol) = upper(p_rol))
    AND (p_categoria IS NULL OR upper(kb.categoria) = upper(p_categoria))
    AND (
      to_tsvector('spanish', COALESCE(kb.pregunta, '') || ' ' || COALESCE(array_to_string(kb.palabras_clave, ' '), ''))
        @@ plainto_tsquery('spanish', COALESCE(p_query, ''))
      OR kb.pregunta ILIKE '%' || COALESCE(p_query, '') || '%'
    )
  ORDER BY
    relevancia DESC,
    COALESCE(kb.usage_count, 0) DESC,
    COALESCE(kb.orden, 0),
    kb.created_at DESC
  LIMIT GREATEST(COALESCE(p_limite, 5), 1);
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: obtener_sugerencias_ayuda (mantiene firma actual).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_sugerencias_ayuda(
  p_rol varchar DEFAULT NULL,
  p_categoria varchar DEFAULT NULL,
  p_limite int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  pregunta text,
  categoria varchar,
  url_modulo varchar
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id());
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.pregunta,
    kb.categoria::varchar,
    kb.url_modulo::varchar
  FROM public.knowledge_base kb
  WHERE COALESCE(kb.activo, true) = true
    AND (
      (v_tenant_id IS NOT NULL AND (kb.tenant_id IS NULL OR kb.tenant_id = v_tenant_id))
      OR (v_tenant_id IS NULL AND kb.tenant_id IS NULL)
    )
    AND (p_rol IS NULL OR kb.rol IS NULL OR upper(kb.rol) = upper(p_rol))
    AND (p_categoria IS NULL OR upper(kb.categoria) = upper(p_categoria))
  ORDER BY
    COALESCE(kb.usage_count, 0) DESC,
    COALESCE(kb.orden, 0),
    kb.created_at DESC
  LIMIT GREATEST(COALESCE(p_limite, 5), 1);
END;
$$;

COMMIT;
