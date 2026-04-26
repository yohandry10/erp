-- ============================================================================
-- 294__help_knowledge_base_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estado case-insensitive en knowledge_base.
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo de estado/activo previo a constraints.
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
-- Dedupe de filas activas por scope + categoria + rol + pregunta.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    kb.id,
    first_value(kb.id) OVER (
      PARTITION BY
        COALESCE(kb.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        upper(COALESCE(NULLIF(btrim(kb.categoria), ''), 'GENERAL')),
        upper(COALESCE(NULLIF(btrim(kb.rol), ''), '*')),
        upper(COALESCE(NULLIF(btrim(kb.pregunta), ''), 'PREGUNTA SIN TITULO'))
      ORDER BY
        COALESCE(kb.usage_count, 0) DESC,
        COALESCE(kb.updated_at, kb.created_at, now()) DESC,
        kb.id::text DESC
    ) AS kept_id,
    row_number() OVER (
      PARTITION BY
        COALESCE(kb.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        upper(COALESCE(NULLIF(btrim(kb.categoria), ''), 'GENERAL')),
        upper(COALESCE(NULLIF(btrim(kb.rol), ''), '*')),
        upper(COALESCE(NULLIF(btrim(kb.pregunta), ''), 'PREGUNTA SIN TITULO'))
      ORDER BY
        COALESCE(kb.usage_count, 0) DESC,
        COALESCE(kb.updated_at, kb.created_at, now()) DESC,
        kb.id::text DESC
    ) AS rn
  FROM public.knowledge_base kb
  WHERE lower(COALESCE(kb.estado::text, 'activo')) = 'activo'
)
UPDATE public.knowledge_base kb
SET
  activo = false,
  estado = 'INACTIVO'::citext,
  metadata = COALESCE(kb.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'dedupe_migration',
      '294__help_knowledge_base_estado_case_insensitive_integrity_rls',
      'dedupe_kept_id',
      r.kept_id::text
    ),
  updated_at = now()
FROM ranked r
WHERE kb.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints case-insensitive de dominio/consistencia.
-- ----------------------------------------------------------------------------
ALTER TABLE public.knowledge_base DROP CONSTRAINT IF EXISTS ck_kb_estado_valid_293;
ALTER TABLE public.knowledge_base
  ADD CONSTRAINT ck_kb_estado_valid_293
  CHECK (lower(estado::text) IN ('activo', 'inactivo')) NOT VALID;

ALTER TABLE public.knowledge_base DROP CONSTRAINT IF EXISTS ck_kb_activo_estado_consistency;
ALTER TABLE public.knowledge_base DROP CONSTRAINT IF EXISTS ck_kb_activo_estado_consistency_293;
ALTER TABLE public.knowledge_base
  ADD CONSTRAINT ck_kb_activo_estado_consistency_293
  CHECK (
    (activo = true AND lower(estado::text) = 'activo')
    OR (activo = false AND lower(estado::text) = 'inactivo')
  ) NOT VALID;

-- ----------------------------------------------------------------------------
-- Contrato NOT NULL para estado/activo.
-- ----------------------------------------------------------------------------
ALTER TABLE public.knowledge_base ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.knowledge_base ALTER COLUMN activo SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.knowledge_base VALIDATE CONSTRAINT ck_kb_estado_valid_293;
ALTER TABLE public.knowledge_base VALIDATE CONSTRAINT ck_kb_activo_estado_consistency_293;

-- ----------------------------------------------------------------------------
-- Reforzar unicidad activa con predicado case-insensitive.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_kb_scope_categoria_rol_pregunta_activa;
CREATE UNIQUE INDEX IF NOT EXISTS ux_kb_scope_categoria_rol_pregunta_activa
ON public.knowledge_base (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(COALESCE(NULLIF(btrim(categoria), ''), 'GENERAL')),
  upper(COALESCE(NULLIF(btrim(rol), ''), '*')),
  upper(COALESCE(NULLIF(btrim(pregunta), ''), 'PREGUNTA SIN TITULO'))
)
WHERE lower(estado::text) = 'activo';

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de RLS (global + tenant con guard de contexto).
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.knowledge_base FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.knowledge_base;
DROP POLICY IF EXISTS knowledge_base_tenant_or_global_select ON public.knowledge_base;
DROP POLICY IF EXISTS knowledge_base_tenant_write ON public.knowledge_base;

CREATE POLICY knowledge_base_tenant_or_global_select
ON public.knowledge_base
FOR SELECT
USING (
  app.is_superadmin()
  OR tenant_id = COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
  OR (
    tenant_id IS NULL
    AND COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id()) IS NOT NULL
  )
);

CREATE POLICY knowledge_base_tenant_write
ON public.knowledge_base
FOR ALL
USING (
  app.is_superadmin()
  OR tenant_id = COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
)
WITH CHECK (
  app.is_superadmin()
  OR tenant_id = COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
