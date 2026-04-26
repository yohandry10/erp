-- Migration 013: Campos de reprogramación para backorders
-- Objetivo: permitir reagendar compromisos de entrega y priorizar pendientes

BEGIN;

ALTER TABLE pedido_backorders
  ADD COLUMN IF NOT EXISTS proxima_fecha_compromiso DATE,
  ADD COLUMN IF NOT EXISTS ultimo_compromiso_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prioridad SMALLINT DEFAULT 3 CHECK (prioridad BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_pedido_backorders_estado_prioridad
  ON pedido_backorders(estado, prioridad DESC, proxima_fecha_compromiso NULLS FIRST);

COMMENT ON COLUMN pedido_backorders.proxima_fecha_compromiso IS 'Fecha comprometida para el siguiente despacho parcial.';
COMMENT ON COLUMN pedido_backorders.ultimo_compromiso_en IS 'Timestamp del último reagendamiento realizado.';
COMMENT ON COLUMN pedido_backorders.prioridad IS 'Prioridad operativa (1 = urgente, 5 = baja).';

COMMIT;
