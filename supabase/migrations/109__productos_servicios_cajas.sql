-- Prioridad 2: Catálogo unificado (productos/servicios) y base de cajas/sesiones para POS
-- Añade campos de servicio y multi-sucursal al catálogo de productos y crea tablas de precios/stock por sucursal.
-- Crea estructura inicial para cajas y sesiones de caja (apertura/cierre por cajero).

-- 1) Catálogo: productos con flags de servicio y afectación
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS es_servicio boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS controla_stock boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS afectacion_igv varchar(10) DEFAULT '10', -- 10: Gravado IGV (SUNAT)
  ADD COLUMN IF NOT EXISTS tipo_operacion varchar(30),              -- Operación gravada/exonerada/inafecta
  ADD COLUMN IF NOT EXISTS clasificador_sunat varchar(16),          -- Código SUNAT de bienes/servicios
  ADD COLUMN IF NOT EXISTS favorito boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_reservado numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_minimo numeric(18,2) DEFAULT 0;

-- 2) Precios por sucursal
CREATE TABLE IF NOT EXISTS producto_precios_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  moneda varchar(3) NOT NULL DEFAULT 'PEN',
  precio numeric(18,2) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, sucursal_id, moneda)
);

-- 3) Stock por sucursal/almacén (para productos que controlan stock)
CREATE TABLE IF NOT EXISTS producto_stock_sucursal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  almacen_id uuid REFERENCES almacenes(id) ON DELETE SET NULL,
  stock numeric(18,2) NOT NULL DEFAULT 0,
  reservado numeric(18,2) NOT NULL DEFAULT 0,
  minimo numeric(18,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, almacen_id),
  UNIQUE (producto_id, sucursal_id, almacen_id)
);

-- 4) Cajas (catálogo de cajas por sucursal/almacén/dispositivo)
CREATE TABLE IF NOT EXISTS cajas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nombre varchar(80) NOT NULL,
  descripcion varchar(255),
  sucursal_id uuid REFERENCES sucursales(id) ON DELETE SET NULL,
  almacen_id uuid REFERENCES almacenes(id) ON DELETE SET NULL,
  dispositivo varchar(120),
  tipo varchar(30) DEFAULT 'TIENDA',       -- TIENDA / MOSTRADOR / KIOSKO
  estado varchar(20) DEFAULT 'ACTIVO',     -- ACTIVO / INACTIVO
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cajas_tenant ON cajas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cajas_sucursal ON cajas(sucursal_id);

-- 5) Sesiones de caja (apertura/cierre por cajero)
CREATE TABLE IF NOT EXISTS sesiones_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_id uuid NOT NULL REFERENCES cajas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  cajero_id uuid,               -- usuario asignado
  abierto_por uuid,
  cerrado_por uuid,
  monto_inicio numeric(18,2) NOT NULL DEFAULT 0,
  monto_cierre numeric(18,2),
  estado varchar(20) NOT NULL DEFAULT 'ABIERTA', -- ABIERTA / CERRADA
  dispositivo varchar(120),
  hora_apertura timestamptz NOT NULL DEFAULT now(),
  hora_cierre timestamptz,
  moneda varchar(3) NOT NULL DEFAULT 'PEN',
  notas text,
  resumen jsonb,                -- totales por medio de pago / cajero
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sesiones_caja_caja ON sesiones_caja(caja_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_tenant ON sesiones_caja(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_caja_estado ON sesiones_caja(estado);

COMMENT ON TABLE producto_precios_sucursal IS 'Precios por sucursal y moneda para POS y ventas';
COMMENT ON TABLE producto_stock_sucursal IS 'Stock y reservado por sucursal/almacén (solo productos que controlan stock)';
COMMENT ON TABLE cajas IS 'Catálogo de cajas POS por sucursal/almacén/dispositivo';
COMMENT ON TABLE sesiones_caja IS 'Sesiones de caja (apertura/cierre) con cajero y montos';
