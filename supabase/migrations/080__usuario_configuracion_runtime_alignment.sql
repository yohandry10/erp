-- ============================================================================
-- 080__usuario_configuracion_runtime_alignment.sql
-- Alinea usuario_configuracion al contrato runtime de PaisesService.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Shape mínimo de columnas usadas por API.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.usuario_configuracion
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS usuario_id uuid,
  ADD COLUMN IF NOT EXISTS pais_id bigint,
  ADD COLUMN IF NOT EXISTS pais_preferido_id bigint,
  ADD COLUMN IF NOT EXISTS idioma text DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS zona_horaria text DEFAULT 'America/Lima',
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'ACTIVO',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- Promover columnas de país a bigint cuando vienen de esquemas legacy.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_udt text;
BEGIN
  SELECT c.udt_name
  INTO v_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'usuario_configuracion'
    AND c.column_name = 'pais_id';

  IF v_udt = 'int4' THEN
    ALTER TABLE public.usuario_configuracion
      ALTER COLUMN pais_id TYPE bigint USING pais_id::bigint;
  ELSIF v_udt IS NOT NULL AND v_udt NOT IN ('int8', 'int4') THEN
    ALTER TABLE public.usuario_configuracion
      ALTER COLUMN pais_id TYPE bigint
      USING CASE
        WHEN btrim(pais_id::text) ~ '^[0-9]+$' THEN btrim(pais_id::text)::bigint
        ELSE NULL
      END;
  END IF;

  SELECT c.udt_name
  INTO v_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'usuario_configuracion'
    AND c.column_name = 'pais_preferido_id';

  IF v_udt = 'int4' THEN
    ALTER TABLE public.usuario_configuracion
      ALTER COLUMN pais_preferido_id TYPE bigint USING pais_preferido_id::bigint;
  ELSIF v_udt IS NOT NULL AND v_udt NOT IN ('int8', 'int4') THEN
    ALTER TABLE public.usuario_configuracion
      ALTER COLUMN pais_preferido_id TYPE bigint
      USING CASE
        WHEN btrim(pais_preferido_id::text) ~ '^[0-9]+$' THEN btrim(pais_preferido_id::text)::bigint
        ELSE NULL
      END;
  END IF;
END
$$;

-- Backfill desde alias UUID histórico si existe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuario_configuracion'
      AND column_name = 'pais_id_uuid'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'paises'
      AND column_name = 'id_uuid'
  ) THEN
    UPDATE public.usuario_configuracion uc
    SET pais_id = p.id
    FROM public.paises p
    WHERE uc.pais_id IS NULL
      AND uc.pais_id_uuid IS NOT NULL
      AND p.id_uuid = uc.pais_id_uuid;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Normalización + consistencia tenant/usuario y alias país.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.normalize_usuario_configuracion_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_user uuid;
  v_default_pais bigint;
BEGIN
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));

  NEW.idioma := lower(NULLIF(btrim(COALESCE(NEW.idioma, '')), ''));
  IF NEW.idioma IS NOT NULL THEN
    NEW.idioma := split_part(replace(NEW.idioma, '_', '-'), '-', 1);
  END IF;
  IF NEW.idioma IS NULL OR NEW.idioma !~ '^[a-z]{2}$' THEN
    NEW.idioma := 'es';
  END IF;

  NEW.zona_horaria := NULLIF(btrim(COALESCE(NEW.zona_horaria, '')), '');
  IF NEW.zona_horaria IS NULL THEN
    NEW.zona_horaria := 'America/Lima';
  END IF;

  NEW.pais_preferido_id := COALESCE(NEW.pais_preferido_id, NEW.pais_id);
  NEW.pais_id := COALESCE(NEW.pais_id, NEW.pais_preferido_id);

  IF NEW.pais_id IS NULL THEN
    SELECT p.id
    INTO v_default_pais
    FROM public.paises p
    WHERE upper(p.codigo_iso) = 'PE'
    ORDER BY p.id
    LIMIT 1;

    NEW.pais_id := COALESCE(NEW.pais_id, v_default_pais);
    NEW.pais_preferido_id := COALESCE(NEW.pais_preferido_id, NEW.pais_id);
  END IF;

  IF NEW.usuario_id IS NOT NULL THEN
    SELECT us.tenant_id
    INTO v_tenant_user
    FROM public.usuarios_sistema us
    WHERE us.id = NEW.usuario_id
    LIMIT 1;

    NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_user);

    IF v_tenant_user IS NOT NULL
       AND NEW.tenant_id IS DISTINCT FROM v_tenant_user THEN
      RAISE EXCEPTION 'tenant_id no coincide con usuario en usuario_configuracion (% != %)',
        NEW.tenant_id, v_tenant_user;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_usuario_configuracion_row ON public.usuario_configuracion;
CREATE TRIGGER trg_normalize_usuario_configuracion_row
BEFORE INSERT OR UPDATE
ON public.usuario_configuracion
FOR EACH ROW
EXECUTE FUNCTION app.normalize_usuario_configuracion_row();

-- ----------------------------------------------------------------------------
-- Backfill de normalización.
-- ----------------------------------------------------------------------------
UPDATE public.usuario_configuracion
SET updated_at = COALESCE(updated_at, now());

UPDATE public.usuario_configuracion uc
SET tenant_id = us.tenant_id
FROM public.usuarios_sistema us
WHERE uc.usuario_id = us.id
  AND uc.tenant_id IS NULL;

UPDATE public.usuario_configuracion
SET pais_preferido_id = pais_id
WHERE pais_preferido_id IS NULL
  AND pais_id IS NOT NULL;

UPDATE public.usuario_configuracion
SET pais_id = pais_preferido_id
WHERE pais_id IS NULL
  AND pais_preferido_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Índices de acceso runtime por usuario/tenant/pais.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_usuario_configuracion_tenant_usuario
ON public.usuario_configuracion (tenant_id, usuario_id);

CREATE INDEX IF NOT EXISTS idx_usuario_configuracion_tenant_pais_preferido
ON public.usuario_configuracion (tenant_id, pais_preferido_id);

CREATE INDEX IF NOT EXISTS idx_usuario_configuracion_idioma
ON public.usuario_configuracion (idioma);

COMMIT;
