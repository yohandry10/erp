-- ============================================================================
-- 042__stock_movimientos_legacy_sync.sql
-- Sincroniza tabla legacy movimientos_stock desde stock_movimientos.
-- Objetivo: evitar divergencia de métricas/consultas entre nombres históricos.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Trigger de sincronización (canónico -> legacy)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.sync_movimientos_stock_from_stock_movimientos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.movimientos_stock (
    id,
    tenant_id,
    nombre,
    codigo,
    estado,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.tenant_id,
    NEW.nombre,
    NEW.codigo,
    COALESCE(NULLIF(btrim(NEW.estado), ''), 'ACTIVO'),
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    nombre = EXCLUDED.nombre,
    codigo = EXCLUDED.codigo,
    estado = EXCLUDED.estado,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_movimientos_stock_from_stock_movimientos
ON public.stock_movimientos;

CREATE TRIGGER trg_sync_movimientos_stock_from_stock_movimientos
AFTER INSERT OR UPDATE
ON public.stock_movimientos
FOR EACH ROW
EXECUTE FUNCTION app.sync_movimientos_stock_from_stock_movimientos();

-- ----------------------------------------------------------------------------
-- Backfill inicial para reconstrucción: replica histórico canónico existente.
-- ----------------------------------------------------------------------------
INSERT INTO public.movimientos_stock (
  id,
  tenant_id,
  nombre,
  codigo,
  estado,
  metadata,
  created_at,
  updated_at
)
SELECT
  sm.id,
  sm.tenant_id,
  sm.nombre,
  sm.codigo,
  COALESCE(NULLIF(btrim(sm.estado), ''), 'ACTIVO'),
  COALESCE(sm.metadata, '{}'::jsonb),
  COALESCE(sm.created_at, now()),
  COALESCE(sm.updated_at, now())
FROM public.stock_movimientos sm
ON CONFLICT (id) DO UPDATE
SET
  tenant_id = EXCLUDED.tenant_id,
  nombre = EXCLUDED.nombre,
  codigo = EXCLUDED.codigo,
  estado = EXCLUDED.estado,
  metadata = EXCLUDED.metadata,
  updated_at = now();

COMMIT;

