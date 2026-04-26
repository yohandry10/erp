-- ============================================================================
-- 117__core_aux_tables_integrity_rls.sql
-- Integridad, dedupe y hardening RLS para tablas auxiliares críticas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- fe_configuracion: evitar múltiples activos por tenant.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    fc.id,
    row_number() OVER (
      PARTITION BY fc.tenant_id
      ORDER BY
        COALESCE(fc.updated_at, fc.created_at, now()) DESC,
        fc.id::text DESC
    ) AS rn
  FROM public.fe_configuracion fc
  WHERE fc.tenant_id IS NOT NULL
    AND COALESCE(fc.activo, true) = true
)
UPDATE public.fe_configuracion fc
SET
  activo = false,
  estado = 'INACTIVO',
  metadata = COALESCE(fc.metadata, '{}'::jsonb) || jsonb_build_object(
    'dedupe_migration',
    '117__core_aux_tables_integrity_rls'
  ),
  updated_at = now()
FROM ranked r
WHERE fc.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF to_regclass('public.fe_configuracion') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_fe_configuracion_ruc_shape'
        AND conrelid = 'public.fe_configuracion'::regclass
    ) THEN
      ALTER TABLE public.fe_configuracion
      ADD CONSTRAINT ck_fe_configuracion_ruc_shape
      CHECK (ruc IS NULL OR ruc ~ '^[0-9]{11}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_fe_configuracion_ambiente'
        AND conrelid = 'public.fe_configuracion'::regclass
    ) THEN
      ALTER TABLE public.fe_configuracion
      ADD CONSTRAINT ck_fe_configuracion_ambiente
      CHECK (upper(COALESCE(ambiente, 'BETA')) IN ('BETA', 'PRODUCCION', 'HOMOLOGACION'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_fe_configuracion_activo_estado_consistency'
        AND conrelid = 'public.fe_configuracion'::regclass
    ) THEN
      ALTER TABLE public.fe_configuracion
      ADD CONSTRAINT ck_fe_configuracion_activo_estado_consistency
      CHECK (COALESCE(activo, false) = false OR upper(COALESCE(estado, '')) = 'ACTIVO');
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fe_configuracion_tenant_active
ON public.fe_configuracion (tenant_id)
WHERE tenant_id IS NOT NULL
  AND COALESCE(activo, true) = true;

-- ----------------------------------------------------------------------------
-- asientos_contables_rrhh: constraints de consistencia numérica y forma.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.asientos_contables_rrhh') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_asientos_rrhh_cuenta_nonempty'
        AND conrelid = 'public.asientos_contables_rrhh'::regclass
    ) THEN
      ALTER TABLE public.asientos_contables_rrhh
      ADD CONSTRAINT ck_asientos_rrhh_cuenta_nonempty
      CHECK (cuenta IS NOT NULL AND btrim(cuenta) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_asientos_rrhh_montos_nonnegative'
        AND conrelid = 'public.asientos_contables_rrhh'::regclass
    ) THEN
      ALTER TABLE public.asientos_contables_rrhh
      ADD CONSTRAINT ck_asientos_rrhh_montos_nonnegative
      CHECK (COALESCE(debe, 0) >= 0 AND COALESCE(haber, 0) >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_asientos_rrhh_fecha_not_null'
        AND conrelid = 'public.asientos_contables_rrhh'::regclass
    ) THEN
      ALTER TABLE public.asientos_contables_rrhh
      ADD CONSTRAINT ck_asientos_rrhh_fecha_not_null
      CHECK (fecha IS NOT NULL);
    END IF;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- feriados: dedupe operativo y calidad de país/fecha.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    f.id,
    row_number() OVER (
      PARTITION BY
        COALESCE(f.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        upper(COALESCE(NULLIF(btrim(f.pais), ''), 'PE')),
        f.fecha
      ORDER BY
        COALESCE(f.updated_at, f.created_at, now()) DESC,
        f.id::text DESC
    ) AS rn
  FROM public.feriados f
  WHERE f.fecha IS NOT NULL
    AND COALESCE(f.activo, true) = true
)
UPDATE public.feriados f
SET
  activo = false,
  estado = 'INACTIVO',
  metadata = COALESCE(f.metadata, '{}'::jsonb) || jsonb_build_object(
    'dedupe_migration',
    '117__core_aux_tables_integrity_rls'
  ),
  updated_at = now()
FROM ranked r
WHERE f.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF to_regclass('public.feriados') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_feriados_pais_shape'
        AND conrelid = 'public.feriados'::regclass
    ) THEN
      ALTER TABLE public.feriados
      ADD CONSTRAINT ck_feriados_pais_shape
      CHECK (pais IS NOT NULL AND pais ~ '^[A-Z]{2}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_feriados_fecha_not_null'
        AND conrelid = 'public.feriados'::regclass
    ) THEN
      ALTER TABLE public.feriados
      ADD CONSTRAINT ck_feriados_fecha_not_null
      CHECK (fecha IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_feriados_activo_estado_consistency'
        AND conrelid = 'public.feriados'::regclass
    ) THEN
      ALTER TABLE public.feriados
      ADD CONSTRAINT ck_feriados_activo_estado_consistency
      CHECK (COALESCE(activo, false) = false OR upper(COALESCE(estado, '')) = 'ACTIVO');
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_feriados_scope_pais_fecha_active
ON public.feriados (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(pais),
  fecha
)
WHERE fecha IS NOT NULL
  AND COALESCE(activo, true) = true;

-- ----------------------------------------------------------------------------
-- profiles: normalización de identidad y unicidad por tenant+usuario.
-- ----------------------------------------------------------------------------
UPDATE public.profiles
SET
  user_id = COALESCE(user_id, id),
  updated_at = now()
WHERE user_id IS DISTINCT FROM COALESCE(user_id, id);

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_profiles_user_id_not_null'
        AND conrelid = 'public.profiles'::regclass
    ) THEN
      ALTER TABLE public.profiles
      ADD CONSTRAINT ck_profiles_user_id_not_null
      CHECK (user_id IS NOT NULL);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_profiles_email_shape'
        AND conrelid = 'public.profiles'::regclass
    ) THEN
      ALTER TABLE public.profiles
      ADD CONSTRAINT ck_profiles_email_shape
      CHECK (email IS NULL OR email ~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_profiles_activo_estado_consistency'
        AND conrelid = 'public.profiles'::regclass
    ) THEN
      ALTER TABLE public.profiles
      ADD CONSTRAINT ck_profiles_activo_estado_consistency
      CHECK (COALESCE(activo, false) = false OR upper(COALESCE(estado, '')) = 'ACTIVO');
    END IF;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_tenant_user
ON public.profiles (tenant_id, user_id)
WHERE tenant_id IS NOT NULL
  AND user_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- RLS explícito para las tablas del pack.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'fe_configuracion');
SELECT app.apply_tenant_policy('public', 'asientos_contables_rrhh');
SELECT app.apply_tenant_policy('public', 'feriados');
SELECT app.apply_tenant_policy('public', 'profiles');

COMMIT;
