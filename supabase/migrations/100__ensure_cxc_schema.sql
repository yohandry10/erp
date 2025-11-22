-- 100__ensure_cxc_schema.sql
-- Normaliza la tabla cuentas_por_cobrar para que coincida con lo esperado por CxcService.

ALTER TABLE cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS numero_documento TEXT,
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS serie TEXT,
  ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS monto_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS monto_pendiente NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS dias_mora INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas TEXT,
  ADD COLUMN IF NOT EXISTS documento_id UUID REFERENCES documentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES pedidos_venta(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS event_source TEXT;

-- Normalizar valores existentes
UPDATE cuentas_por_cobrar
SET monto_pendiente = COALESCE(monto_pendiente, monto_total),
    dias_mora = COALESCE(dias_mora, 0)
WHERE monto_pendiente IS NULL OR dias_mora IS NULL;

ALTER TABLE cuentas_por_cobrar
  ALTER COLUMN monto_pendiente SET NOT NULL,
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_cxc_idempotency_key ON cuentas_por_cobrar(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_cxc_event_source ON cuentas_por_cobrar(event_source);
