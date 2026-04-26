-- ============================================================================
-- 055__ventas_pos_pagos_runtime_alignment.sql
-- Alinea pagos POS para reportes de caja y joins PostgREST con ventas_pos.
-- ============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.ventas_pos_pagos
  ADD COLUMN IF NOT EXISTS venta_pos_id uuid,
  ADD COLUMN IF NOT EXISTS metodo_pago_id uuid,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS autorizado_por uuid;

ALTER TABLE IF EXISTS public.ventas_pos_pagos
  ALTER COLUMN monto TYPE numeric(14,2) USING app.to_numeric_or_zero(monto::text),
  ALTER COLUMN monto SET DEFAULT 0;

-- Backfill defensivo de venta_pos_id cuando exista payload legacy utilizable
UPDATE public.ventas_pos_pagos
SET venta_pos_id = COALESCE(
  venta_pos_id,
  app.to_uuid_or_null(metadata->>'venta_pos_id'),
  app.to_uuid_or_null(codigo)
)
WHERE venta_pos_id IS NULL;

SELECT app.add_fk_if_possible('ventas_pos_pagos', 'venta_pos_id', 'ventas_pos', 'id', 'fk_ventas_pos_pagos_venta_pos_id');
SELECT app.add_fk_if_possible('ventas_pos_pagos', 'metodo_pago_id', 'metodos_pago', 'id', 'fk_ventas_pos_pagos_metodo_pago_id');
SELECT app.add_fk_if_possible('ventas_pos_pagos', 'autorizado_por', 'usuarios_sistema', 'id', 'fk_ventas_pos_pagos_autorizado_por');

-- Enforce tenant coherente con la venta POS asociada
CREATE OR REPLACE FUNCTION app.enforce_tenant_ventas_pos_pagos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_venta uuid;
BEGIN
  IF NEW.venta_pos_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vp.tenant_id
  INTO v_tenant_venta
  FROM public.ventas_pos vp
  WHERE vp.id = NEW.venta_pos_id;

  IF v_tenant_venta IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.tenant_id := COALESCE(NEW.tenant_id, v_tenant_venta);

  IF NEW.tenant_id IS DISTINCT FROM v_tenant_venta THEN
    RAISE EXCEPTION 'tenant_id no coincide con ventas_pos (% != %)', NEW.tenant_id, v_tenant_venta;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_ventas_pos_pagos ON public.ventas_pos_pagos;

CREATE TRIGGER trg_enforce_tenant_ventas_pos_pagos
BEFORE INSERT OR UPDATE OF tenant_id, venta_pos_id
ON public.ventas_pos_pagos
FOR EACH ROW
EXECUTE FUNCTION app.enforce_tenant_ventas_pos_pagos();

CREATE INDEX IF NOT EXISTS idx_ventas_pos_pagos_tenant_venta_pos
ON public.ventas_pos_pagos (tenant_id, venta_pos_id);

CREATE INDEX IF NOT EXISTS idx_ventas_pos_pagos_tenant_created
ON public.ventas_pos_pagos (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_pos_pagos_tenant_metodo
ON public.ventas_pos_pagos (tenant_id, metodo_pago_tipo, metodo_pago_codigo);

COMMIT;
