-- CASE-14 hardening: pagos de CxP deben ser idempotentes a nivel persistencia.

ALTER TABLE IF EXISTS public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.movimientos_bancarios
SET idempotency_key = NULL
WHERE idempotency_key IS NOT NULL
  AND btrim(idempotency_key) = '';

ALTER TABLE IF EXISTS public.movimientos_bancarios
  DROP CONSTRAINT IF EXISTS ck_movimientos_bancarios_idempotency_key_not_blank;

ALTER TABLE IF EXISTS public.movimientos_bancarios
  ADD CONSTRAINT ck_movimientos_bancarios_idempotency_key_not_blank
  CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS ux_movimientos_bancarios_tenant_idempotency_key_307
ON public.movimientos_bancarios (tenant_id, lower(btrim(idempotency_key)))
WHERE idempotency_key IS NOT NULL
  AND btrim(idempotency_key) <> '';
