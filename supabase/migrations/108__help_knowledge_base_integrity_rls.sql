-- ============================================================================
-- 108__help_knowledge_base_integrity_rls.sql
-- Integridad, dedupe y hardening RLS para knowledge_base.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill defensivo previo a constraints.
-- ----------------------------------------------------------------------------
UPDATE public.knowledge_base kb
SET
  pregunta = COALESCE(
    NULLIF(btrim(COALESCE(kb.pregunta, '')), ''),
    NULLIF(btrim(COALESCE(kb.nombre, '')), ''),
    'Pregunta sin título'
  ),
  respuesta = COALESCE(
    NULLIF(btrim(COALESCE(kb.respuesta, '')), ''),
    'Contenido pendiente de documentación.'
  ),
  categoria = upper(COALESCE(NULLIF(btrim(COALESCE(kb.categoria, '')), ''), 'GENERAL')),
  rol = upper(NULLIF(btrim(COALESCE(kb.rol, '')), '')),
  idioma = lower(COALESCE(NULLIF(btrim(COALESCE(kb.idioma, '')), ''), 'es')),
  url_modulo = CASE
    WHEN NULLIF(btrim(COALESCE(kb.url_modulo, '')), '') IS NULL THEN NULL
    WHEN left(btrim(kb.url_modulo), 1) = '/' THEN btrim(kb.url_modulo)
    ELSE '/' || btrim(kb.url_modulo)
  END,
  palabras_clave = COALESCE(
    (
      SELECT array_agg(s.kw)
      FROM (
        SELECT DISTINCT lower(btrim(x.kw)) AS kw
        FROM unnest(COALESCE(kb.palabras_clave, '{}'::text[])) AS x(kw)
        WHERE x.kw IS NOT NULL
          AND btrim(x.kw) <> ''
        ORDER BY lower(btrim(x.kw))
      ) s
    ),
    '{}'::text[]
  ),
  pasos = CASE
    WHEN kb.pasos IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(kb.pasos) = 'array' THEN kb.pasos
    ELSE jsonb_build_array(kb.pasos)
  END,
  orden = GREATEST(COALESCE(kb.orden, 0), 0),
  usage_count = GREATEST(COALESCE(kb.usage_count, 0), 0),
  activo = COALESCE(
    kb.activo,
    CASE
      WHEN upper(COALESCE(kb.estado, 'ACTIVO')) = 'INACTIVO' THEN false
      ELSE true
    END
  ),
  estado = CASE
    WHEN COALESCE(
      kb.activo,
      CASE
        WHEN upper(COALESCE(kb.estado, 'ACTIVO')) = 'INACTIVO' THEN false
        ELSE true
      END
    ) THEN 'ACTIVO'
    ELSE COALESCE(NULLIF(upper(btrim(COALESCE(kb.estado, ''))), ''), 'INACTIVO')
  END,
  codigo = COALESCE(
    NULLIF(btrim(COALESCE(kb.codigo, '')), ''),
    COALESCE(
      NULLIF(btrim(COALESCE(kb.pregunta, '')), ''),
      NULLIF(btrim(COALESCE(kb.nombre, '')), ''),
      'Pregunta sin título'
    )
  ),
  updated_at = now()
WHERE true;

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
  WHERE COALESCE(kb.activo, true) = true
)
UPDATE public.knowledge_base kb
SET
  activo = false,
  estado = 'INACTIVO',
  metadata = COALESCE(kb.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'dedupe_migration',
      '108__help_knowledge_base_integrity_rls',
      'dedupe_kept_id',
      r.kept_id::text
    ),
  updated_at = now()
FROM ranked r
WHERE kb.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Constraints de calidad y consistencia.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.knowledge_base') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_pregunta_nonempty'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_pregunta_nonempty
    CHECK (pregunta IS NOT NULL AND btrim(pregunta) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_respuesta_nonempty'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_respuesta_nonempty
    CHECK (respuesta IS NOT NULL AND btrim(respuesta) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_estado_nonempty'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_estado_nonempty
    CHECK (estado IS NOT NULL AND btrim(estado) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_orden_nonnegative'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_orden_nonnegative
    CHECK (orden >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_usage_count_nonnegative'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_usage_count_nonnegative
    CHECK (usage_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_url_modulo_shape'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_url_modulo_shape
    CHECK (url_modulo IS NULL OR left(url_modulo, 1) = '/');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_pasos_array'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_pasos_array
    CHECK (pasos IS NULL OR jsonb_typeof(pasos) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_idioma_shape'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_idioma_shape
    CHECK (idioma IS NOT NULL AND idioma ~ '^[a-z]{2}(-[a-z]{2})?$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_kb_activo_estado_consistency'
      AND conrelid = 'public.knowledge_base'::regclass
  ) THEN
    ALTER TABLE public.knowledge_base
    ADD CONSTRAINT ck_kb_activo_estado_consistency
    CHECK (COALESCE(activo, false) = false OR upper(COALESCE(estado, '')) = 'ACTIVO');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Unicidad operativa para evitar duplicados activos en el bot de ayuda.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_kb_scope_categoria_rol_pregunta_activa
ON public.knowledge_base (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(COALESCE(NULLIF(btrim(categoria), ''), 'GENERAL')),
  upper(COALESCE(NULLIF(btrim(rol), ''), '*')),
  upper(COALESCE(NULLIF(btrim(pregunta), ''), 'PREGUNTA SIN TITULO'))
)
WHERE COALESCE(activo, true) = true;

-- ----------------------------------------------------------------------------
-- Hardening RLS: global+tenant con guard de contexto.
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
