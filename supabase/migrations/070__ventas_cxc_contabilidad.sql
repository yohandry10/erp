-- =============================================
-- Migration 070: Hardening flujo Ventas → CxC → Contabilidad
-- =============================================
-- 1. Refuerza tabla cxc_pagos con metadatos de eventos/idempotencia
-- 2. Normaliza permisos de finanzas (finanzas.cxc.read / finanzas.cxc.cobros.write)
-- 3. Ajusta nomenclatura de eventos de cobro para contabilidad
-- =============================================

DO $$
BEGIN
  -- cxc_pagos.event_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cxc_pagos' AND column_name = 'event_id'
  ) THEN
    ALTER TABLE cxc_pagos ADD COLUMN event_id uuid;
    COMMENT ON COLUMN cxc_pagos.event_id IS 'Identificador del evento que originó el cobro (source_event_id).';
  END IF;

  -- cxc_pagos.idempotency_key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cxc_pagos' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE cxc_pagos ADD COLUMN idempotency_key text;
    COMMENT ON COLUMN cxc_pagos.idempotency_key IS 'Llave de idempotencia para reintentos seguros de cobros.';
  END IF;

  -- cxc_pagos.source
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cxc_pagos' AND column_name = 'source'
  ) THEN
    ALTER TABLE cxc_pagos ADD COLUMN source text;
    COMMENT ON COLUMN cxc_pagos.source IS 'Origen funcional del cobro (finanzas.cxc, tesoreria, etc).';
  END IF;
END $$;

-- Índices de idempotencia
CREATE UNIQUE INDEX IF NOT EXISTS idx_cxc_pagos_event_id
  ON cxc_pagos(event_id) WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cxc_pagos_idempotency_key
  ON cxc_pagos(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Marcar source por defecto
UPDATE cxc_pagos
SET source = COALESCE(source, 'finanzas.cxc')
WHERE source IS NULL;

-- =============================================
-- Permisos: normalizar nomenclatura
-- =============================================
UPDATE permisos
SET accion = 'read'
WHERE modulo = 'finanzas'
  AND recurso = 'cxc'
  AND accion IN ('ver', 'read');

UPDATE permisos
SET recurso = 'cxc.cobros',
    accion = 'write'
WHERE modulo = 'finanzas'
  AND recurso = 'cxc'
  AND accion IN ('gestionar', 'write');

-- =============================================
-- Outbox events: usar snake_case consistente
-- =============================================
UPDATE outbox_events
SET event_type = 'cobro.registrado'
WHERE event_type = 'CobroRegistrado';
