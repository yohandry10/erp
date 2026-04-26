-- Migration 011: Pagos de CxC, retenciones/detracciones/percepciones y anticipos
-- Fecha: 2025-10-23

BEGIN;

-- =====================================================
-- TABLA DE PAGOS / MOVIMIENTOS DE CUENTAS POR COBRAR
-- =====================================================

CREATE TABLE IF NOT EXISTS cxc_pagos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  cuenta_id UUID NOT NULL REFERENCES cuentas_por_cobrar(id) ON DELETE CASCADE,
  pedido_id UUID REFERENCES pedidos_venta(id) ON DELETE SET NULL,
  documento_id UUID REFERENCES documentos(id) ON DELETE SET NULL,
  usuario_id UUID REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('PAGO','ANTICIPO','DETRACCION','PERCEPCION','RETENCION')),
  monto NUMERIC(12,2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'PEN',
  fecha_pago DATE NOT NULL,
  metodo_pago TEXT,
  referencia TEXT,
  notas TEXT,
  aplica_retencion BOOLEAN NOT NULL DEFAULT false,
  retencion_monto NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cxc_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cxc_pagos_rls ON cxc_pagos;
CREATE POLICY cxc_pagos_rls
  ON cxc_pagos
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_cuenta
  ON cxc_pagos(cuenta_id);

CREATE INDEX IF NOT EXISTS idx_cxc_pagos_pedido
  ON cxc_pagos(pedido_id);

-- =====================================================
-- CAMPOS ADICIONALES EN CUENTAS POR COBRAR
-- =====================================================

ALTER TABLE cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS retencion_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percepcion_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detraccion_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anticipo_total NUMERIC(12,2) NOT NULL DEFAULT 0;

-- =====================================================
-- CONFIGURACIÓN TRIBUTARIA A NIVEL EMPRESA
-- =====================================================

ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS aplicar_retencion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencion_tasa NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS aplicar_percepcion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS percepcion_tasa NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS aplicar_detraccion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detraccion_tasa NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS detraccion_codigo TEXT;

-- =====================================================
-- CONFIGURACIÓN TRIBUTARIA POR CLIENTE
-- =====================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS sujeto_retencion BOOLEAN,
  ADD COLUMN IF NOT EXISTS retencion_tasa NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sujeto_percepcion BOOLEAN,
  ADD COLUMN IF NOT EXISTS percepcion_tasa NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sujeto_detraccion BOOLEAN,
  ADD COLUMN IF NOT EXISTS detraccion_tasa NUMERIC(5,2);

COMMIT;
