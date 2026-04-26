-- Migration 052: CXC Hardening multi-tenant e idempotencia
-- HARDENING: asegura que las cuentas por cobrar se creen una sola vez por factura.

BEGIN;

-- HARDENING: agregar columnas de trazabilidad a cuentas_por_cobrar.
ALTER TABLE cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS event_source TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- HARDENING: poblar valores para registros existentes.
UPDATE cuentas_por_cobrar
SET
  idempotency_key = COALESCE(idempotency_key, CONCAT(''legacy:'', id::text)),
  event_id = COALESCE(event_id, gen_random_uuid()),
  event_source = COALESCE(event_source, ''legacy'')
WHERE idempotency_key IS NULL
   OR event_id IS NULL
   OR event_source IS NULL;

-- HARDENING: constraint única por tenant + idempotencia.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = ''public''
      AND indexname = ''uniq_cxc_tenant_idempotency''
  ) THEN
    CREATE UNIQUE INDEX uniq_cxc_tenant_idempotency
      ON cuentas_por_cobrar(tenant_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN cuentas_por_cobrar.idempotency_key IS ''HARDENING: evita duplicados generando llave única por factura/evento.'';
COMMENT ON COLUMN cuentas_por_cobrar.event_id IS ''HARDENING: referencia al evento que creó la CxC para idempotencia contable.'';
COMMENT ON COLUMN cuentas_por_cobrar.event_source IS ''HARDENING: módulo origen que generó la cuenta por cobrar.'';
COMMENT ON COLUMN cuentas_por_cobrar.created_by IS ''Usuario que generó la CxC cuando aplica.'';

COMMIT;
