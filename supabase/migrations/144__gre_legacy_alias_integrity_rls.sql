-- ============================================================================
-- 144__gre_legacy_alias_integrity_rls.sql
-- Integridad, consistencia tenant y hardening RLS para alias GRE legacy.
-- Tablas: gre, gre_guias.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill de consistencia entre alias/canónico.
-- ----------------------------------------------------------------------------
UPDATE public.gre g
SET tenant_id = gg.tenant_id
FROM public.gre_guias gg
WHERE g.id = gg.id
  AND gg.tenant_id IS NOT NULL
  AND (g.tenant_id IS NULL OR g.tenant_id <> gg.tenant_id);

UPDATE public.gre_guias gg
SET tenant_id = g.tenant_id
FROM public.gre g
WHERE gg.id = g.id
  AND g.tenant_id IS NOT NULL
  AND gg.tenant_id IS NULL;

UPDATE public.gre g
SET
  cpe_relacionado = COALESCE(g.cpe_relacionado, gg.cpe_relacionado),
  retry_count = GREATEST(COALESCE(g.retry_count, gg.retry_count, 0), 0),
  next_retry_at = COALESCE(g.next_retry_at, gg.next_retry_at),
  idempotency_key = COALESCE(NULLIF(btrim(COALESCE(g.idempotency_key, '')), ''), NULLIF(btrim(COALESCE(gg.idempotency_key, '')), ''))
FROM public.gre_guias gg
WHERE g.id = gg.id
  AND (
    g.cpe_relacionado IS NULL
    OR g.next_retry_at IS NULL
    OR g.idempotency_key IS NULL
  );

-- ----------------------------------------------------------------------------
-- FKs para joins/embeds runtime.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('gre', 'tenant_id', 'tenants', 'id', 'gre_tenant_id_fkey');
SELECT app.add_fk_if_possible('gre', 'cpe_relacionado', 'cpe', 'id', 'gre_cpe_relacionado_fkey');

-- ----------------------------------------------------------------------------
-- Dedupe operativo antes de unicidades por scope.
-- ----------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    g.id,
    row_number() OVER (
      PARTITION BY g.tenant_id, upper(btrim(g.numero))
      ORDER BY COALESCE(g.updated_at, g.created_at, now()) DESC, g.id::text DESC
    ) AS rn
  FROM public.gre g
  WHERE g.tenant_id IS NOT NULL
    AND g.numero IS NOT NULL
    AND btrim(g.numero) <> ''
)
DELETE FROM public.gre g
USING ranked r
WHERE g.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    g.id,
    row_number() OVER (
      PARTITION BY g.tenant_id, btrim(g.idempotency_key)
      ORDER BY COALESCE(g.updated_at, g.created_at, now()) DESC, g.id::text DESC
    ) AS rn
  FROM public.gre g
  WHERE g.tenant_id IS NOT NULL
    AND g.idempotency_key IS NOT NULL
    AND btrim(g.idempotency_key) <> ''
)
DELETE FROM public.gre g
USING ranked r
WHERE g.id = r.id
  AND r.rn > 1;

-- ----------------------------------------------------------------------------
-- Trigger de consistencia tenant para alias legacy gre.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.enforce_gre_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_cpe_tenant uuid;
  v_gre_guias_tenant uuid;
BEGIN
  NEW.tenant_id := app.to_uuid_or_null(COALESCE(NEW.tenant_id::text, ''));
  NEW.cpe_relacionado := app.to_uuid_or_null(COALESCE(NEW.cpe_relacionado::text, ''));

  IF NEW.cpe_relacionado IS NOT NULL THEN
    SELECT c.tenant_id INTO v_cpe_tenant
    FROM public.cpe c
    WHERE c.id = NEW.cpe_relacionado;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = format('CPE relacionado no existe: %s', NEW.cpe_relacionado), ERRCODE = '23503';
    END IF;

    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_cpe_tenant;
    ELSIF v_cpe_tenant IS NOT NULL AND NEW.tenant_id <> v_cpe_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con cpe_relacionado en gre', ERRCODE = '23514';
    END IF;
  END IF;

  SELECT gg.tenant_id INTO v_gre_guias_tenant
  FROM public.gre_guias gg
  WHERE gg.id = NEW.id;

  IF FOUND THEN
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := v_gre_guias_tenant;
    ELSIF v_gre_guias_tenant IS NOT NULL AND NEW.tenant_id <> v_gre_guias_tenant THEN
      RAISE EXCEPTION USING MESSAGE = 'tenant_id no coincide con gre_guias en gre', ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'tenant_id es obligatorio en gre', ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_gre_tenant_consistency ON public.gre;
CREATE TRIGGER trg_enforce_gre_tenant_consistency
BEFORE INSERT OR UPDATE OF tenant_id, cpe_relacionado
ON public.gre
FOR EACH ROW
EXECUTE FUNCTION app.enforce_gre_tenant_consistency();

-- ----------------------------------------------------------------------------
-- Constraints de negocio para gre (idempotentes).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.gre') IS NOT NULL THEN
    ALTER TABLE public.gre
      ADD CONSTRAINT ck_gre_ids_required
      CHECK (tenant_id IS NOT NULL AND numero IS NOT NULL AND btrim(numero) <> '') NOT VALID;

    ALTER TABLE public.gre
      ADD CONSTRAINT ck_gre_estado_valid
      CHECK (estado IN ('PENDIENTE_ENVIO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR')) NOT VALID;

    ALTER TABLE public.gre
      ADD CONSTRAINT ck_gre_sunat_status_valid
      CHECK (sunat_status IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR')) NOT VALID;

    ALTER TABLE public.gre
      ADD CONSTRAINT ck_gre_retry_nonnegative
      CHECK (retry_count >= 0) NOT VALID;

    ALTER TABLE public.gre
      ADD CONSTRAINT ck_gre_correlativo_positive
      CHECK (correlativo IS NULL OR correlativo >= 1) NOT VALID;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE IF EXISTS public.gre VALIDATE CONSTRAINT ck_gre_ids_required;
ALTER TABLE IF EXISTS public.gre VALIDATE CONSTRAINT ck_gre_estado_valid;
ALTER TABLE IF EXISTS public.gre VALIDATE CONSTRAINT ck_gre_sunat_status_valid;
ALTER TABLE IF EXISTS public.gre VALIDATE CONSTRAINT ck_gre_retry_nonnegative;
ALTER TABLE IF EXISTS public.gre VALIDATE CONSTRAINT ck_gre_correlativo_positive;

-- ----------------------------------------------------------------------------
-- Unicidades operativas e índices de soporte.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_tenant_numero
ON public.gre (tenant_id, upper(numero))
WHERE tenant_id IS NOT NULL
  AND numero IS NOT NULL
  AND btrim(numero) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_gre_tenant_idempotency_key
ON public.gre (tenant_id, idempotency_key)
WHERE tenant_id IS NOT NULL
  AND idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';

CREATE INDEX IF NOT EXISTS idx_gre_tenant_cpe_relacionado_runtime
ON public.gre (tenant_id, cpe_relacionado, created_at DESC)
WHERE tenant_id IS NOT NULL
  AND cpe_relacionado IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Hardening RLS explícito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'gre');
SELECT app.apply_tenant_policy('public', 'gre_guias');

COMMIT;

