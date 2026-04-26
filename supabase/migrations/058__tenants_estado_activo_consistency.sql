-- ============================================================================
-- 058__tenants_estado_activo_consistency.sql
-- Normaliza y endurece consistencia entre tenants.estado y tenants.activo.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION app.normalize_tenants_estado_activo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_estado text;
BEGIN
  v_estado := upper(btrim(COALESCE(NEW.estado, '')));

  IF v_estado = '' THEN
    v_estado := CASE WHEN COALESCE(NEW.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END;
  END IF;

  NEW.estado := v_estado;
  NEW.activo := (v_estado = 'ACTIVO');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_tenants_estado_activo ON public.tenants;
CREATE TRIGGER trg_normalize_tenants_estado_activo
BEFORE INSERT OR UPDATE OF estado, activo
ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION app.normalize_tenants_estado_activo();

WITH normalized AS (
  SELECT
    t.id,
    CASE
      WHEN t.estado IS NULL OR btrim(t.estado) = ''
        THEN CASE WHEN COALESCE(t.activo, true) THEN 'ACTIVO' ELSE 'INACTIVO' END
      ELSE upper(btrim(t.estado))
    END AS estado_norm
  FROM public.tenants t
)
UPDATE public.tenants t
SET
  estado = n.estado_norm,
  activo = (n.estado_norm = 'ACTIVO'),
  updated_at = now()
FROM normalized n
WHERE n.id = t.id
  AND (
    COALESCE(t.estado, '') <> n.estado_norm
    OR COALESCE(t.activo, false) <> (n.estado_norm = 'ACTIVO')
  );

ALTER TABLE IF EXISTS public.tenants
  ALTER COLUMN estado SET DEFAULT 'ACTIVO',
  ALTER COLUMN activo SET DEFAULT true;

UPDATE public.tenants
SET
  estado = 'ACTIVO',
  activo = true,
  updated_at = now()
WHERE estado IS NULL OR btrim(estado) = '';

ALTER TABLE IF EXISTS public.tenants
  ALTER COLUMN estado SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_tenants_estado_upper_nonempty'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT ck_tenants_estado_upper_nonempty
      CHECK (btrim(estado) <> '' AND estado = upper(estado))
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_tenants_estado_activo_consistency'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT ck_tenants_estado_activo_consistency
      CHECK (activo = (estado = 'ACTIVO'))
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.tenants VALIDATE CONSTRAINT ck_tenants_estado_upper_nonempty;
ALTER TABLE public.tenants VALIDATE CONSTRAINT ck_tenants_estado_activo_consistency;

CREATE INDEX IF NOT EXISTS idx_tenants_estado_activo
ON public.tenants (estado, activo);

CREATE OR REPLACE VIEW public.v_tenants_estado_activo AS
SELECT
  t.id,
  t.codigo,
  t.nombre,
  t.estado,
  t.activo,
  (t.estado = 'ACTIVO') AS should_be_active,
  (t.activo = (t.estado = 'ACTIVO')) AS is_consistent,
  t.created_at,
  t.updated_at
FROM public.tenants t;

COMMIT;
