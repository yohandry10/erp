-- ============================================================================
-- 081__usuario_configuracion_integrity_rls.sql
-- Integridad referencial, constraints y hardening RLS en usuario_configuracion.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Integridad referencial con usuario y país canónico.
-- Nota: se mantiene FK en pais_id (no en pais_preferido_id) para evitar
-- ambigüedad en embebidos PostgREST al usar `paises(...)` sin hint de FK.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible(
  'usuario_configuracion',
  'usuario_id',
  'usuarios_sistema',
  'id',
  'fk_usuario_configuracion_usuario_id'
);

SELECT app.add_fk_if_possible(
  'usuario_configuracion',
  'pais_id',
  'paises',
  'id',
  'fk_usuario_configuracion_pais_id'
);

-- ----------------------------------------------------------------------------
-- Constraints de calidad de datos.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.usuario_configuracion') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuario_configuracion_estado_upper_nonempty'
        AND conrelid = 'public.usuario_configuracion'::regclass
    ) THEN
      ALTER TABLE public.usuario_configuracion
      ADD CONSTRAINT ck_usuario_configuracion_estado_upper_nonempty
      CHECK (estado = upper(btrim(estado)) AND btrim(estado) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuario_configuracion_idioma_format'
        AND conrelid = 'public.usuario_configuracion'::regclass
    ) THEN
      ALTER TABLE public.usuario_configuracion
      ADD CONSTRAINT ck_usuario_configuracion_idioma_format
      CHECK (idioma IS NULL OR idioma ~ '^[a-z]{2}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuario_configuracion_zona_horaria_nonempty'
        AND conrelid = 'public.usuario_configuracion'::regclass
    ) THEN
      ALTER TABLE public.usuario_configuracion
      ADD CONSTRAINT ck_usuario_configuracion_zona_horaria_nonempty
      CHECK (zona_horaria IS NULL OR btrim(zona_horaria) <> '');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuario_configuracion_pais_positive'
        AND conrelid = 'public.usuario_configuracion'::regclass
    ) THEN
      ALTER TABLE public.usuario_configuracion
      ADD CONSTRAINT ck_usuario_configuracion_pais_positive
      CHECK (
        (pais_id IS NULL OR pais_id > 0)
        AND (pais_preferido_id IS NULL OR pais_preferido_id > 0)
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'ck_usuario_configuracion_pais_consistency'
        AND conrelid = 'public.usuario_configuracion'::regclass
    ) THEN
      ALTER TABLE public.usuario_configuracion
      ADD CONSTRAINT ck_usuario_configuracion_pais_consistency
      CHECK (
        pais_id IS NULL
        OR pais_preferido_id IS NULL
        OR pais_id = pais_preferido_id
      );
    END IF;
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.usuario_configuracion
  VALIDATE CONSTRAINT ck_usuario_configuracion_estado_upper_nonempty;
ALTER TABLE IF EXISTS public.usuario_configuracion
  VALIDATE CONSTRAINT ck_usuario_configuracion_idioma_format;
ALTER TABLE IF EXISTS public.usuario_configuracion
  VALIDATE CONSTRAINT ck_usuario_configuracion_zona_horaria_nonempty;
ALTER TABLE IF EXISTS public.usuario_configuracion
  VALIDATE CONSTRAINT ck_usuario_configuracion_pais_positive;
ALTER TABLE IF EXISTS public.usuario_configuracion
  VALIDATE CONSTRAINT ck_usuario_configuracion_pais_consistency;

-- ----------------------------------------------------------------------------
-- Unicidad por usuario (idempotente y null-safe).
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_configuracion_usuario_not_null
ON public.usuario_configuracion (usuario_id)
WHERE usuario_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito para tabla de preferencias de usuario.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'usuario_configuracion');

COMMIT;
