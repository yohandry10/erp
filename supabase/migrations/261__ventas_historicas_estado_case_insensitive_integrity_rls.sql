-- ============================================================================
-- 261__ventas_historicas_estado_case_insensitive_integrity_rls.sql
-- Integridad + hardening RLS para estados case-insensitive en ventas historicas.
-- Tablas foco:
--   public.ventas
--   public.venta_detalles
--   public.pagos_ventas
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions, app, pg_temp;

-- ----------------------------------------------------------------------------
-- Backfill defensivo.
-- ----------------------------------------------------------------------------
UPDATE public.ventas
SET estado = app.normalize_ventas_estado_260(estado::text)
WHERE id IS NOT NULL;

UPDATE public.venta_detalles
SET estado = app.normalize_venta_detalles_estado_260(estado::text)
WHERE id IS NOT NULL;

UPDATE public.pagos_ventas
SET estado = app.normalize_pagos_ventas_estado_260(estado::text)
WHERE id IS NOT NULL;

UPDATE public.pagos_ventas
SET aplicado_en = COALESCE(aplicado_en, updated_at, created_at, now())
WHERE lower(estado::text) = 'aplicado'
  AND aplicado_en IS NULL;

-- ----------------------------------------------------------------------------
-- Constraints de estado en modo case-insensitive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ventas DROP CONSTRAINT IF EXISTS ck_ventas_estado_runtime;
ALTER TABLE public.ventas
  ADD CONSTRAINT ck_ventas_estado_runtime
  CHECK (lower(estado::text) IN ('borrador', 'emitida', 'pagada', 'confirmada', 'anulada')) NOT VALID;

ALTER TABLE public.venta_detalles DROP CONSTRAINT IF EXISTS ck_venta_detalles_estado_runtime;
ALTER TABLE public.venta_detalles
  ADD CONSTRAINT ck_venta_detalles_estado_runtime
  CHECK (lower(estado::text) IN ('registrado', 'anulado')) NOT VALID;

ALTER TABLE public.pagos_ventas DROP CONSTRAINT IF EXISTS ck_pagos_ventas_estado_runtime;
ALTER TABLE public.pagos_ventas
  ADD CONSTRAINT ck_pagos_ventas_estado_runtime
  CHECK (lower(estado::text) IN ('registrado', 'aplicado', 'anulado')) NOT VALID;

ALTER TABLE public.pagos_ventas DROP CONSTRAINT IF EXISTS ck_pagos_ventas_aplicado_runtime;
ALTER TABLE public.pagos_ventas
  ADD CONSTRAINT ck_pagos_ventas_aplicado_runtime
  CHECK (lower(estado::text) <> 'aplicado' OR aplicado_en IS NOT NULL) NOT VALID;

-- ----------------------------------------------------------------------------
-- Not null contractual para columnas estado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ventas ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.venta_detalles ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.pagos_ventas ALTER COLUMN estado SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Unicidades activas con predicados CI.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_ventas_tenant_tipo_numero;
CREATE UNIQUE INDEX ux_ventas_tenant_tipo_numero
ON public.ventas (tenant_id, upper(btrim(tipo_documento)), upper(btrim(numero_documento)))
WHERE tenant_id IS NOT NULL
  AND tipo_documento IS NOT NULL
  AND btrim(tipo_documento) <> ''
  AND numero_documento IS NOT NULL
  AND btrim(numero_documento) <> ''
  AND lower(estado::text) <> 'anulada';

DROP INDEX IF EXISTS public.ux_pagos_ventas_tenant_referencia;
CREATE UNIQUE INDEX ux_pagos_ventas_tenant_referencia
ON public.pagos_ventas (tenant_id, upper(btrim(referencia)))
WHERE tenant_id IS NOT NULL
  AND referencia IS NOT NULL
  AND btrim(referencia) <> '';

DROP INDEX IF EXISTS public.ux_pagos_ventas_tenant_idempotency;
CREATE UNIQUE INDEX ux_pagos_ventas_tenant_idempotency
ON public.pagos_ventas (tenant_id, lower(btrim(idempotency_key)))
WHERE tenant_id IS NOT NULL
  AND idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';

-- ----------------------------------------------------------------------------
-- Validacion de constraints.
-- ----------------------------------------------------------------------------
ALTER TABLE public.ventas VALIDATE CONSTRAINT ck_ventas_estado_runtime;
ALTER TABLE public.venta_detalles VALIDATE CONSTRAINT ck_venta_detalles_estado_runtime;
ALTER TABLE public.pagos_ventas VALIDATE CONSTRAINT ck_pagos_ventas_estado_runtime;
ALTER TABLE public.pagos_ventas VALIDATE CONSTRAINT ck_pagos_ventas_aplicado_runtime;

-- ----------------------------------------------------------------------------
-- Reaplicacion explicita de politicas RLS.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'ventas');
SELECT app.apply_tenant_policy('public', 'venta_detalles');
SELECT app.apply_tenant_policy('public', 'pagos_ventas');

COMMIT;
