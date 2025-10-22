-- Migration 010: Aprobaciones de pedidos, control de crédito y CxC
-- Fecha: 2025-10-21
-- Descripción:
--   * Añade nuevos estados y metadatos para approvals/logística en pedidos
--   * Define configuraciones de aprobación/credito por tenant y cliente
--   * Crea tabla de aprobaciones y cuentas por cobrar con RLS multi-tenant
--   * Registra eventos logísticos para picking/packing/tracking

BEGIN;

-- =====================================================
-- PEDIDOS: NUEVOS ESTADOS Y METADATOS
-- =====================================================

ALTER TABLE pedidos_venta DROP CONSTRAINT IF EXISTS pedidos_venta_estado_check;
ALTER TABLE pedidos_venta
  ADD CONSTRAINT pedidos_venta_estado_check CHECK (
    estado IN (
      'PENDIENTE',
      'PENDIENTE_APROBACION',
      'CONFIRMADO',
      'EN_PREPARACION',
      'LISTO_DESPACHO',
      'LISTO_FACTURAR',
      'FACTURADO',
      'COMPLETADO',
      'COMPLETADO_CON_GRE',
      'CANCELADO'
    )
  );

ALTER TABLE pedidos_venta
  ADD COLUMN IF NOT EXISTS requiere_aprobacion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_requiere_aprobacion TEXT,
  ADD COLUMN IF NOT EXISTS aprobado_por UUID,
  ADD COLUMN IF NOT EXISTS aprobado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estado_credito TEXT NOT NULL DEFAULT 'SIN_EVALUAR',
  ADD COLUMN IF NOT EXISTS tracking_estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS tracking_actualizado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_notas TEXT;

ALTER TABLE pedidos_venta DROP CONSTRAINT IF EXISTS pedidos_venta_tracking_estado_check;
ALTER TABLE pedidos_venta
  ADD CONSTRAINT pedidos_venta_tracking_estado_check CHECK (
    tracking_estado IN ('PENDIENTE','EN_PREPARACION','LISTO_DESPACHO','EN_TRANSITO','ENTREGADO','INCIDENCIA')
  );

-- =====================================================
-- CONFIGURACIÓN DEL TENANT Y CLIENTE
-- =====================================================

ALTER TABLE empresa_config
  ADD COLUMN IF NOT EXISTS monto_maximo_sin_aprobacion NUMERIC(12,2) NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS porcentaje_descuento_maximo NUMERIC(5,2) NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS requiere_aprobacion_descuento BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aplicar_limite_credito BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dias_gracia_morosidad INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_vencimiento_factura INTEGER NOT NULL DEFAULT 30;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS limite_credito NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS permite_morosidad BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dias_morosidad INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('public.cuentas_por_cobrar') IS NOT NULL THEN
    ALTER TABLE cuentas_por_cobrar
      ADD COLUMN IF NOT EXISTS tenant_id UUID,
      ADD COLUMN IF NOT EXISTS pedido_id UUID;

    UPDATE cuentas_por_cobrar c
    SET tenant_id = cp.tenant_id
    FROM cpe cp
    WHERE c.tenant_id IS NULL
      AND c.cpe_id = cp.id;

    UPDATE cuentas_por_cobrar c
    SET tenant_id = d.tenant_id
    FROM documentos d
    WHERE c.tenant_id IS NULL
      AND c.factura_id = d.id;

    UPDATE cuentas_por_cobrar c
    SET tenant_id = cl.tenant_id::uuid
    FROM clientes cl
    WHERE c.tenant_id IS NULL
      AND (cl.id::text = c.cliente_id OR cl.numero_documento = c.cliente_id);

    IF EXISTS (SELECT 1 FROM cuentas_por_cobrar WHERE tenant_id IS NULL) THEN
      RAISE EXCEPTION 'No se pudo determinar tenant_id para todas las cuentas por cobrar existentes';
    END IF;

    ALTER TABLE cuentas_por_cobrar
      ALTER COLUMN tenant_id SET NOT NULL;

    ALTER TABLE cuentas_por_cobrar
      ADD CONSTRAINT cuentas_por_cobrar_pedido_fk
        FOREIGN KEY (pedido_id) REFERENCES pedidos_venta(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- =====================================================
-- TABLA DE APROBACIONES DE PEDIDOS
-- =====================================================

CREATE TABLE IF NOT EXISTS pedido_aprobaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('APROBADO','RECHAZADO')),
  motivos TEXT,
  aprobado_por UUID,
  aprobado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pedido_aprobaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_aprobaciones_rls ON pedido_aprobaciones;
CREATE POLICY pedido_aprobaciones_rls
  ON pedido_aprobaciones
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_pedido_aprobaciones_pedido
  ON pedido_aprobaciones(pedido_id);

-- =====================================================
-- TABLA CUENTAS POR COBRAR
-- =====================================================

CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id),
  pedido_id UUID REFERENCES pedidos_venta(id) ON DELETE SET NULL,
  documento_id UUID REFERENCES documentos(id) ON DELETE SET NULL,
  serie TEXT,
  numero TEXT,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'PEN',
  monto_total NUMERIC(12,2) NOT NULL,
  monto_pendiente NUMERIC(12,2) NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('PENDIENTE','PARCIAL','CANCELADO','VENCIDO')),
  dias_mora INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cuentas_por_cobrar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cuentas_por_cobrar_rls ON cuentas_por_cobrar;
CREATE POLICY cuentas_por_cobrar_rls
  ON cuentas_por_cobrar
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_cxc_cliente_estado
  ON cuentas_por_cobrar(cliente_id, estado);

-- =====================================================
-- EVENTOS LOGÍSTICOS (PICKING/PACKING/TRACKING)
-- =====================================================

CREATE TABLE IF NOT EXISTS logistica_eventos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  pedido_id UUID NOT NULL REFERENCES pedidos_venta(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('PICKING','PACKING','DESPACHO','TRANSITO','ENTREGA')),
  datos JSONB,
  registrado_por UUID,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE logistica_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logistica_eventos_rls ON logistica_eventos;
CREATE POLICY logistica_eventos_rls
  ON logistica_eventos
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_logistica_eventos_pedido
  ON logistica_eventos(pedido_id, tipo);

COMMIT;
