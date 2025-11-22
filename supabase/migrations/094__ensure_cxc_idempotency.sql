-- 094__ensure_cxc_idempotency.sql
-- Garantiza que la tabla cuentas_por_cobrar tenga las columnas de idempotencia
-- necesarias para el flujo de integración Ventas → CxC.

BEGIN;

ALTER TABLE cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS event_source TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE UNIQUE INDEX IF NOT EXISTS cuentas_por_cobrar_tenant_idempotency_key_uidx
  ON cuentas_por_cobrar(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN cuentas_por_cobrar.idempotency_key IS 'Llave idempotente por documento/flujo que originó la CxC';
COMMENT ON COLUMN cuentas_por_cobrar.event_id IS 'ID del evento que creó la CxC para trazabilidad';
COMMENT ON COLUMN cuentas_por_cobrar.event_source IS 'Módulo o servicio que creó la CxC';

-- Backfill básico: asociar la CxC al documento fiscal si no se hubiera setado aún.
UPDATE cuentas_por_cobrar
SET idempotency_key = CONCAT('cxc.doc:', documento_id::text)
WHERE idempotency_key IS NULL
  AND documento_id IS NOT NULL;

COMMIT;
