-- Migration 035: Crear tablas del módulo de Compras
-- Fecha: 2025-10-24
-- Descripción: Crea todas las tablas necesarias para el módulo de compras completo
-- Incluye: cotizaciones_compra, ordenes_compra, recepciones, devoluciones

-- =====================================================
-- ENUMS NECESARIOS
-- =====================================================

-- Enum para estados de cotizaciones de compra
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_cotizacion_compra') THEN
    CREATE TYPE estado_cotizacion_compra AS ENUM (
      'BORRADOR',
      'ENVIADA',
      'APROBADA',
      'RECHAZADA',
      'VENCIDA'
    );
  END IF;
END $$;

-- Enum para estados de órdenes de compra
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_orden_compra') THEN
    CREATE TYPE estado_orden_compra AS ENUM (
      'BORRADOR',
      'APROBACION',
      'APROBADA',
      'PARCIAL',
      'RECIBIDA',
      'CERRADA',
      'ANULADA'
    );
  END IF;
END $$;

-- Enum para estados de recepción
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_recepcion') THEN
    CREATE TYPE estado_recepcion AS ENUM (
      'BORRADOR',
      'CERRADA'
    );
  END IF;
END $$;

-- Enum para calidad de recepción
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calidad_recepcion') THEN
    CREATE TYPE calidad_recepcion AS ENUM (
      'OK',
      'OBSERVADO',
      'RECHAZADO'
    );
  END IF;
END $$;

-- Enum para estados de devolución a proveedor
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_devolucion_proveedor') THEN
    CREATE TYPE estado_devolucion_proveedor AS ENUM (
      'PENDIENTE',
      'EMITIDA',
      'ACEPTADA',
      'RECHAZADA'
    );
  END IF;
END $$;

-- =====================================================
-- ACTUALIZAR TABLA PROVEEDORES (si existe)
-- =====================================================

DO $$ 
BEGIN
  -- Agregar condiciones_pago si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='proveedores' AND column_name='condiciones_pago') THEN
    ALTER TABLE proveedores ADD COLUMN condiciones_pago VARCHAR(50) DEFAULT 'CONTADO';
  END IF;
  
  -- Agregar limite_credito si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='proveedores' AND column_name='limite_credito') THEN
    ALTER TABLE proveedores ADD COLUMN limite_credito NUMERIC(12,2) DEFAULT 0 CHECK (limite_credito >= 0);
  END IF;
  
  -- Agregar dias_credito si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='proveedores' AND column_name='dias_credito') THEN
    ALTER TABLE proveedores ADD COLUMN dias_credito INTEGER DEFAULT 0 CHECK (dias_credito >= 0);
  END IF;
END $$;

-- =====================================================
-- TABLA: cotizaciones_compra
-- =====================================================

CREATE TABLE IF NOT EXISTS cotizaciones_compra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  numero VARCHAR(50) NOT NULL,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  fecha_cotizacion DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  validez_dias INTEGER DEFAULT 30,
  estado estado_cotizacion_compra NOT NULL DEFAULT 'BORRADOR',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  igv NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  orden_compra_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  UNIQUE(tenant_id, numero)
);

COMMENT ON TABLE cotizaciones_compra IS 'Cotizaciones de compra solicitadas a proveedores';
COMMENT ON COLUMN cotizaciones_compra.validez_dias IS 'Días de validez de la cotización desde fecha_cotizacion';
COMMENT ON COLUMN cotizaciones_compra.orden_compra_id IS 'Referencia a la OC generada si fue convertida';

-- Índices para cotizaciones_compra
CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_tenant ON cotizaciones_compra(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_proveedor ON cotizaciones_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_estado ON cotizaciones_compra(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_fecha ON cotizaciones_compra(fecha_cotizacion DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_compra_numero ON cotizaciones_compra(tenant_id, numero);

-- RLS para cotizaciones_compra
ALTER TABLE cotizaciones_compra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cotizaciones_compra_tenant_isolation" ON cotizaciones_compra;
CREATE POLICY "cotizaciones_compra_tenant_isolation"
  ON cotizaciones_compra FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: cotizacion_compra_detalles
-- =====================================================

CREATE TABLE IF NOT EXISTS cotizacion_compra_detalles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cotizacion_id UUID NOT NULL REFERENCES cotizaciones_compra(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  descripcion VARCHAR(255) NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE cotizacion_compra_detalles IS 'Detalle de productos en cotizaciones de compra';

-- Índices para cotizacion_compra_detalles
CREATE INDEX IF NOT EXISTS idx_cotizacion_compra_detalles_cotizacion ON cotizacion_compra_detalles(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_compra_detalles_producto ON cotizacion_compra_detalles(producto_id);

-- RLS para cotizacion_compra_detalles
ALTER TABLE cotizacion_compra_detalles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cotizacion_compra_detalles_tenant_isolation" ON cotizacion_compra_detalles;
CREATE POLICY "cotizacion_compra_detalles_tenant_isolation"
  ON cotizacion_compra_detalles FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM cotizaciones_compra 
      WHERE cotizaciones_compra.id = cotizacion_compra_detalles.cotizacion_id 
      AND cotizaciones_compra.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM cotizaciones_compra 
      WHERE cotizaciones_compra.id = cotizacion_compra_detalles.cotizacion_id 
      AND cotizaciones_compra.tenant_id = app.current_tenant_id()
    )
  );

-- =====================================================
-- TRIGGERS PARA ACTUALIZACIÓN DE TOTALES
-- =====================================================

-- Función para calcular totales de cotización de compra
CREATE OR REPLACE FUNCTION calcular_totales_cotizacion_compra()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cotizaciones_compra
  SET 
    subtotal = (
      SELECT COALESCE(SUM(subtotal), 0)
      FROM cotizacion_compra_detalles
      WHERE cotizacion_id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id)
    ),
    igv = (
      SELECT COALESCE(SUM(subtotal), 0) * 0.18
      FROM cotizacion_compra_detalles
      WHERE cotizacion_id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id)
    ),
    total = (
      SELECT COALESCE(SUM(subtotal), 0) * 1.18
      FROM cotizacion_compra_detalles
      WHERE cotizacion_id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.cotizacion_id, OLD.cotizacion_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar totales en INSERT/UPDATE/DELETE de detalles
DROP TRIGGER IF EXISTS trigger_calcular_totales_cotizacion_compra ON cotizacion_compra_detalles;
CREATE TRIGGER trigger_calcular_totales_cotizacion_compra
  AFTER INSERT OR UPDATE OR DELETE ON cotizacion_compra_detalles
  FOR EACH ROW
  EXECUTE FUNCTION calcular_totales_cotizacion_compra();

-- =====================================================
-- FUNCIÓN PARA VALIDAR VIGENCIA DE COTIZACIÓN
-- =====================================================

CREATE OR REPLACE FUNCTION validar_vigencia_cotizacion_compra()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular fecha de vencimiento si no está establecida
  IF NEW.fecha_vencimiento IS NULL AND NEW.validez_dias IS NOT NULL THEN
    NEW.fecha_vencimiento := NEW.fecha_cotizacion + (NEW.validez_dias || ' days')::INTERVAL;
  END IF;
  
  -- Marcar como vencida si la fecha de vencimiento ha pasado
  IF NEW.estado IN ('ENVIADA', 'BORRADOR') AND NEW.fecha_vencimiento < CURRENT_DATE THEN
    NEW.estado := 'VENCIDA';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_vigencia_cotizacion_compra ON cotizaciones_compra;
CREATE TRIGGER trigger_validar_vigencia_cotizacion_compra
  BEFORE INSERT OR UPDATE ON cotizaciones_compra
  FOR EACH ROW
  EXECUTE FUNCTION validar_vigencia_cotizacion_compra();

-- =====================================================
-- TABLA: ordenes_compra (ACTUALIZAR EXISTENTE)
-- =====================================================

-- Agregar columnas faltantes a la tabla existente ordenes_compra
DO $$ 
BEGIN
  -- Agregar cotizacion_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='cotizacion_id') THEN
    ALTER TABLE ordenes_compra ADD COLUMN cotizacion_id UUID REFERENCES cotizaciones_compra(id) ON DELETE SET NULL;
  END IF;
  
  -- Agregar fecha_entrega_esperada si no existe (mapear desde fecha_entrega)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='fecha_entrega_esperada') THEN
    ALTER TABLE ordenes_compra ADD COLUMN fecha_entrega_esperada DATE;
    -- Copiar datos de fecha_entrega si existe
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='ordenes_compra' AND column_name='fecha_entrega') THEN
      EXECUTE 'UPDATE ordenes_compra SET fecha_entrega_esperada = fecha_entrega';
    END IF;
  END IF;
  
  -- Agregar condiciones_pago si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='condiciones_pago') THEN
    ALTER TABLE ordenes_compra ADD COLUMN condiciones_pago VARCHAR(50);
  END IF;
  
  -- Agregar dias_credito si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='dias_credito') THEN
    ALTER TABLE ordenes_compra ADD COLUMN dias_credito INTEGER DEFAULT 0;
  END IF;
  
  -- Agregar almacen_destino_id si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='almacen_destino_id') THEN
    ALTER TABLE ordenes_compra ADD COLUMN almacen_destino_id UUID REFERENCES almacenes(id) ON DELETE RESTRICT;
  END IF;
  
  -- Agregar created_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='created_by') THEN
    ALTER TABLE ordenes_compra ADD COLUMN created_by UUID;
  END IF;
  
  -- Agregar aprobado_at si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='aprobado_at') THEN
    ALTER TABLE ordenes_compra ADD COLUMN aprobado_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- Agregar aprobado_by si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ordenes_compra' AND column_name='aprobado_by') THEN
    ALTER TABLE ordenes_compra ADD COLUMN aprobado_by UUID;
  END IF;
END $$;

-- Actualizar comentarios
COMMENT ON TABLE ordenes_compra IS 'Órdenes de compra a proveedores';
COMMENT ON COLUMN ordenes_compra.cotizacion_id IS 'Referencia a cotización de origen si fue convertida';
COMMENT ON COLUMN ordenes_compra.fecha_entrega_esperada IS 'Fecha esperada de entrega de la orden';
COMMENT ON COLUMN ordenes_compra.condiciones_pago IS 'Condiciones de pago acordadas con el proveedor';
COMMENT ON COLUMN ordenes_compra.dias_credito IS 'Días de crédito otorgados por el proveedor';
COMMENT ON COLUMN ordenes_compra.almacen_destino_id IS 'Almacén de destino para la recepción de mercancía';

-- Crear índices adicionales si no existen
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_cotizacion ON ordenes_compra(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_almacen ON ordenes_compra(almacen_destino_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_fecha_entrega ON ordenes_compra(fecha_entrega_esperada);

-- RLS para ordenes_compra (actualizar política existente)
ALTER TABLE ordenes_compra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ordenes_compra_tenant_isolation" ON ordenes_compra;
CREATE POLICY "ordenes_compra_tenant_isolation"
  ON ordenes_compra FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: orden_compra_detalles (ACTUALIZAR EXISTENTE)
-- =====================================================

-- Actualizar tabla orden_compra_detalles existente
DO $$ 
BEGIN
  -- Agregar columnas faltantes si no existen
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='orden_compra_detalles' AND column_name='descripcion') THEN
    ALTER TABLE orden_compra_detalles ADD COLUMN descripcion VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='orden_compra_detalles' AND column_name='cantidad_recibida') THEN
    ALTER TABLE orden_compra_detalles ADD COLUMN cantidad_recibida NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cantidad_recibida >= 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='orden_compra_detalles' AND column_name='cantidad_pendiente') THEN
    ALTER TABLE orden_compra_detalles ADD COLUMN cantidad_pendiente NUMERIC(12,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='orden_compra_detalles' AND column_name='created_at') THEN
    ALTER TABLE orden_compra_detalles ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='orden_compra_detalles' AND column_name='updated_at') THEN
    ALTER TABLE orden_compra_detalles ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- Actualizar comentarios
COMMENT ON TABLE orden_compra_detalles IS 'Detalle de productos en órdenes de compra';
COMMENT ON COLUMN orden_compra_detalles.descripcion IS 'Descripción del producto en la orden';
COMMENT ON COLUMN orden_compra_detalles.subtotal IS 'Calculado como cantidad * precio_unitario';
COMMENT ON COLUMN orden_compra_detalles.cantidad_recibida IS 'Cantidad total recibida hasta el momento';
COMMENT ON COLUMN orden_compra_detalles.cantidad_pendiente IS 'Cantidad pendiente de recibir (calculada)';

-- Crear índices adicionales si no existen
CREATE INDEX IF NOT EXISTS idx_orden_compra_detalles_orden ON orden_compra_detalles(orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_compra_detalles_producto ON orden_compra_detalles(producto_id);

-- RLS para orden_compra_detalles (actualizar política existente)
ALTER TABLE orden_compra_detalles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orden_compra_detalles_tenant_isolation" ON orden_compra_detalles;
CREATE POLICY "orden_compra_detalles_tenant_isolation"
  ON orden_compra_detalles FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM ordenes_compra 
      WHERE ordenes_compra.id = orden_compra_detalles.orden_id 
      AND ordenes_compra.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM ordenes_compra 
      WHERE ordenes_compra.id = orden_compra_detalles.orden_id 
      AND ordenes_compra.tenant_id = app.current_tenant_id()
    )
  );

-- =====================================================
-- TABLA: oc_aprobaciones
-- =====================================================

CREATE TABLE IF NOT EXISTS oc_aprobaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  nivel INTEGER NOT NULL CHECK (nivel > 0),
  aprobador_id UUID NOT NULL,
  aprobador_nombre VARCHAR(255) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  fecha_aprobacion TIMESTAMP WITH TIME ZONE,
  comentarios TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(orden_id, nivel, aprobador_id)
);

COMMENT ON TABLE oc_aprobaciones IS 'Registro de aprobaciones de órdenes de compra por nivel';
COMMENT ON COLUMN oc_aprobaciones.nivel IS 'Nivel de aprobación (1, 2, 3, etc.) según monto configurado';
COMMENT ON COLUMN oc_aprobaciones.aprobador_id IS 'ID del usuario aprobador';
COMMENT ON COLUMN oc_aprobaciones.aprobador_nombre IS 'Nombre del aprobador para histórico';
COMMENT ON COLUMN oc_aprobaciones.estado IS 'Estados: PENDIENTE, APROBADA, RECHAZADA';
COMMENT ON COLUMN oc_aprobaciones.fecha_aprobacion IS 'Fecha y hora en que se aprobó o rechazó';
COMMENT ON COLUMN oc_aprobaciones.comentarios IS 'Comentarios del aprobador';

-- Índices para oc_aprobaciones
CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_orden ON oc_aprobaciones(orden_id);
CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_aprobador ON oc_aprobaciones(aprobador_id);
CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_estado ON oc_aprobaciones(estado);
CREATE INDEX IF NOT EXISTS idx_oc_aprobaciones_nivel ON oc_aprobaciones(orden_id, nivel);

-- RLS para oc_aprobaciones
ALTER TABLE oc_aprobaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_aprobaciones_tenant_isolation" ON oc_aprobaciones;
CREATE POLICY "oc_aprobaciones_tenant_isolation"
  ON oc_aprobaciones FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM ordenes_compra 
      WHERE ordenes_compra.id = oc_aprobaciones.orden_id 
      AND ordenes_compra.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM ordenes_compra 
      WHERE ordenes_compra.id = oc_aprobaciones.orden_id 
      AND ordenes_compra.tenant_id = app.current_tenant_id()
    )
  );

-- =====================================================
-- TRIGGERS PARA ACTUALIZACIÓN DE TOTALES ORDENES_COMPRA
-- =====================================================

-- Función para calcular cantidad_pendiente en orden_compra_detalles
CREATE OR REPLACE FUNCTION calcular_cantidad_pendiente_oc()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular cantidad pendiente = cantidad - cantidad_recibida
  NEW.cantidad_pendiente := NEW.cantidad - COALESCE(NEW.cantidad_recibida, 0);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular cantidad_pendiente antes de INSERT/UPDATE
DROP TRIGGER IF EXISTS trigger_calcular_cantidad_pendiente_oc ON orden_compra_detalles;
CREATE TRIGGER trigger_calcular_cantidad_pendiente_oc
  BEFORE INSERT OR UPDATE ON orden_compra_detalles
  FOR EACH ROW
  EXECUTE FUNCTION calcular_cantidad_pendiente_oc();

-- Función para calcular totales de orden de compra
CREATE OR REPLACE FUNCTION calcular_totales_orden_compra()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ordenes_compra
  SET 
    subtotal = (
      SELECT COALESCE(SUM(subtotal), 0)
      FROM orden_compra_detalles
      WHERE orden_id = COALESCE(NEW.orden_id, OLD.orden_id)
    ),
    igv = (
      SELECT COALESCE(SUM(subtotal), 0) * 0.18
      FROM orden_compra_detalles
      WHERE orden_id = COALESCE(NEW.orden_id, OLD.orden_id)
    ),
    total = (
      SELECT COALESCE(SUM(subtotal), 0) * 1.18
      FROM orden_compra_detalles
      WHERE orden_id = COALESCE(NEW.orden_id, OLD.orden_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.orden_id, OLD.orden_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar totales en INSERT/UPDATE/DELETE de detalles
DROP TRIGGER IF EXISTS trigger_calcular_totales_orden_compra ON orden_compra_detalles;
CREATE TRIGGER trigger_calcular_totales_orden_compra
  AFTER INSERT OR UPDATE OR DELETE ON orden_compra_detalles
  FOR EACH ROW
  EXECUTE FUNCTION calcular_totales_orden_compra();

-- =====================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================

COMMENT ON COLUMN cotizaciones_compra.estado IS 'Estados: BORRADOR → ENVIADA → APROBADA/RECHAZADA/VENCIDA';
COMMENT ON COLUMN cotizacion_compra_detalles.subtotal IS 'Calculado como cantidad * precio_unitario';
COMMENT ON FUNCTION calcular_totales_cotizacion_compra() IS 'Actualiza automáticamente subtotal, IGV (18%) y total de la cotización';
COMMENT ON FUNCTION validar_vigencia_cotizacion_compra() IS 'Calcula fecha_vencimiento y marca como VENCIDA si corresponde';
COMMENT ON FUNCTION calcular_totales_orden_compra() IS 'Actualiza automáticamente subtotal, IGV (18%) y total de la orden de compra';

-- =====================================================
-- TABLA: recepciones
-- =====================================================

CREATE TABLE IF NOT EXISTS recepciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  numero VARCHAR(50) NOT NULL,
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE RESTRICT,
  fecha_recepcion TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  estado estado_recepcion NOT NULL DEFAULT 'BORRADOR',
  observaciones TEXT,
  created_by UUID,
  cerrado_por UUID,
  cerrado_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, numero)
);

COMMENT ON TABLE recepciones IS 'Recepciones de mercancía de órdenes de compra';
COMMENT ON COLUMN recepciones.numero IS 'Número único de recepción (REC-YYYY-NNNN)';
COMMENT ON COLUMN recepciones.orden_id IS 'Referencia a la orden de compra';
COMMENT ON COLUMN recepciones.estado IS 'Estados: BORRADOR, CERRADA';
COMMENT ON COLUMN recepciones.cerrado_por IS 'Usuario que cerró la recepción';
COMMENT ON COLUMN recepciones.cerrado_at IS 'Fecha y hora de cierre de la recepción';

-- Índices para recepciones
CREATE INDEX IF NOT EXISTS idx_recepciones_tenant ON recepciones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_orden ON recepciones(orden_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_estado ON recepciones(estado);
CREATE INDEX IF NOT EXISTS idx_recepciones_fecha ON recepciones(fecha_recepcion DESC);
CREATE INDEX IF NOT EXISTS idx_recepciones_numero ON recepciones(tenant_id, numero);

-- RLS para recepciones
ALTER TABLE recepciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recepciones_tenant_isolation" ON recepciones;
CREATE POLICY "recepciones_tenant_isolation"
  ON recepciones FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: recepcion_items
-- =====================================================

CREATE TABLE IF NOT EXISTS recepcion_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recepcion_id UUID NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  detalle_id UUID NOT NULL REFERENCES orden_compra_detalles(id) ON DELETE RESTRICT,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad_recibida NUMERIC(12,2) NOT NULL CHECK (cantidad_recibida > 0),
  calidad calidad_recepcion NOT NULL DEFAULT 'OK',
  almacen_id UUID REFERENCES almacenes(id) ON DELETE RESTRICT,
  ubicacion_id UUID,
  lote VARCHAR(100),
  serie VARCHAR(100),
  fecha_expiracion DATE,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE recepcion_items IS 'Detalle de items recibidos en cada recepción';
COMMENT ON COLUMN recepcion_items.cantidad_recibida IS 'Cantidad recibida en esta recepción';
COMMENT ON COLUMN recepcion_items.calidad IS 'Calidad de la recepción: OK, OBSERVADO, RECHAZADO';
COMMENT ON COLUMN recepcion_items.almacen_id IS 'Almacén donde se recibió la mercancía';
COMMENT ON COLUMN recepcion_items.ubicacion_id IS 'Ubicación específica dentro del almacén';
COMMENT ON COLUMN recepcion_items.lote IS 'Número de lote del producto recibido';
COMMENT ON COLUMN recepcion_items.serie IS 'Número de serie del producto recibido';
COMMENT ON COLUMN recepcion_items.fecha_expiracion IS 'Fecha de expiración del lote';

-- Índices para recepcion_items
CREATE INDEX IF NOT EXISTS idx_recepcion_items_recepcion ON recepcion_items(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_items_detalle ON recepcion_items(detalle_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_items_producto ON recepcion_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_items_almacen ON recepcion_items(almacen_id);
CREATE INDEX IF NOT EXISTS idx_recepcion_items_lote ON recepcion_items(lote);

-- RLS para recepcion_items
ALTER TABLE recepcion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recepcion_items_tenant_isolation" ON recepcion_items;
CREATE POLICY "recepcion_items_tenant_isolation"
  ON recepcion_items FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM recepciones 
      WHERE recepciones.id = recepcion_items.recepcion_id 
      AND recepciones.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM recepciones 
      WHERE recepciones.id = recepcion_items.recepcion_id 
      AND recepciones.tenant_id = app.current_tenant_id()
    )
  );

-- =====================================================
-- COMENTARIOS FINALES
-- =====================================================

COMMENT ON FUNCTION calcular_totales_orden_compra() IS 'Actualiza automáticamente subtotal, IGV (18%) y total de la orden de compra';
COMMENT ON FUNCTION calcular_cantidad_pendiente_oc() IS 'Calcula la cantidad pendiente de recibir en cada detalle de orden de compra';

-- =====================================================
-- TABLA: devoluciones_proveedor
-- =====================================================

CREATE TABLE IF NOT EXISTS devoluciones_proveedor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  numero VARCHAR(50) NOT NULL,
  recepcion_id UUID REFERENCES recepciones(id) ON DELETE RESTRICT,
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id) ON DELETE RESTRICT,
  proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
  fecha_devolucion DATE NOT NULL DEFAULT CURRENT_DATE,
  estado estado_devolucion_proveedor NOT NULL DEFAULT 'PENDIENTE',
  motivo TEXT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  igv NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  emitido_por UUID,
  emitido_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,
  UNIQUE(tenant_id, numero)
);

COMMENT ON TABLE devoluciones_proveedor IS 'Devoluciones de mercancía rechazada o defectuosa a proveedores';
COMMENT ON COLUMN devoluciones_proveedor.numero IS 'Número único de devolución (DEV-YYYY-NNNN)';
COMMENT ON COLUMN devoluciones_proveedor.recepcion_id IS 'Referencia a la recepción de origen (opcional)';
COMMENT ON COLUMN devoluciones_proveedor.orden_id IS 'Referencia a la orden de compra';
COMMENT ON COLUMN devoluciones_proveedor.proveedor_id IS 'Proveedor al que se devuelve la mercancía';
COMMENT ON COLUMN devoluciones_proveedor.estado IS 'Estados: PENDIENTE, EMITIDA, ACEPTADA, RECHAZADA';
COMMENT ON COLUMN devoluciones_proveedor.motivo IS 'Motivo de la devolución (requerido)';
COMMENT ON COLUMN devoluciones_proveedor.emitido_por IS 'Usuario que emitió la devolución';
COMMENT ON COLUMN devoluciones_proveedor.emitido_at IS 'Fecha y hora de emisión de la devolución';

-- Índices para devoluciones_proveedor
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_tenant ON devoluciones_proveedor(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_recepcion ON devoluciones_proveedor(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_orden ON devoluciones_proveedor(orden_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_proveedor ON devoluciones_proveedor(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_estado ON devoluciones_proveedor(estado);
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_fecha ON devoluciones_proveedor(fecha_devolucion DESC);
CREATE INDEX IF NOT EXISTS idx_devoluciones_proveedor_numero ON devoluciones_proveedor(tenant_id, numero);

-- RLS para devoluciones_proveedor
ALTER TABLE devoluciones_proveedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devoluciones_proveedor_tenant_isolation" ON devoluciones_proveedor;
CREATE POLICY "devoluciones_proveedor_tenant_isolation"
  ON devoluciones_proveedor FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- =====================================================
-- TABLA: devolucion_items
-- =====================================================

CREATE TABLE IF NOT EXISTS devolucion_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  devolucion_id UUID NOT NULL REFERENCES devoluciones_proveedor(id) ON DELETE CASCADE,
  recepcion_item_id UUID REFERENCES recepcion_items(id) ON DELETE RESTRICT,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  descripcion VARCHAR(255) NOT NULL,
  cantidad NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(12,2) NOT NULL,
  almacen_id UUID REFERENCES almacenes(id) ON DELETE RESTRICT,
  lote VARCHAR(100),
  serie VARCHAR(100),
  motivo_detalle TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE devolucion_items IS 'Detalle de items devueltos a proveedores';
COMMENT ON COLUMN devolucion_items.devolucion_id IS 'Referencia a la devolución';
COMMENT ON COLUMN devolucion_items.recepcion_item_id IS 'Referencia al item de recepción original (opcional)';
COMMENT ON COLUMN devolucion_items.producto_id IS 'Producto devuelto';
COMMENT ON COLUMN devolucion_items.descripcion IS 'Descripción del producto';
COMMENT ON COLUMN devolucion_items.cantidad IS 'Cantidad devuelta';
COMMENT ON COLUMN devolucion_items.precio_unitario IS 'Precio unitario del producto';
COMMENT ON COLUMN devolucion_items.subtotal IS 'Calculado como cantidad * precio_unitario';
COMMENT ON COLUMN devolucion_items.almacen_id IS 'Almacén desde donde se devuelve';
COMMENT ON COLUMN devolucion_items.lote IS 'Número de lote del producto devuelto';
COMMENT ON COLUMN devolucion_items.serie IS 'Número de serie del producto devuelto';
COMMENT ON COLUMN devolucion_items.motivo_detalle IS 'Motivo específico de devolución del item';

-- Índices para devolucion_items
CREATE INDEX IF NOT EXISTS idx_devolucion_items_devolucion ON devolucion_items(devolucion_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_items_recepcion_item ON devolucion_items(recepcion_item_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_items_producto ON devolucion_items(producto_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_items_almacen ON devolucion_items(almacen_id);
CREATE INDEX IF NOT EXISTS idx_devolucion_items_lote ON devolucion_items(lote);

-- RLS para devolucion_items
ALTER TABLE devolucion_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devolucion_items_tenant_isolation" ON devolucion_items;
CREATE POLICY "devolucion_items_tenant_isolation"
  ON devolucion_items FOR ALL
  USING (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM devoluciones_proveedor 
      WHERE devoluciones_proveedor.id = devolucion_items.devolucion_id 
      AND devoluciones_proveedor.tenant_id = app.current_tenant_id()
    )
  )
  WITH CHECK (
    app.is_superadmin() OR
    EXISTS (
      SELECT 1 FROM devoluciones_proveedor 
      WHERE devoluciones_proveedor.id = devolucion_items.devolucion_id 
      AND devoluciones_proveedor.tenant_id = app.current_tenant_id()
    )
  );

-- =====================================================
-- TRIGGERS PARA ACTUALIZACIÓN DE TOTALES DEVOLUCIONES
-- =====================================================

-- Función para calcular totales de devolución a proveedor
CREATE OR REPLACE FUNCTION calcular_totales_devolucion_proveedor()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE devoluciones_proveedor
  SET 
    subtotal = (
      SELECT COALESCE(SUM(subtotal), 0)
      FROM devolucion_items
      WHERE devolucion_id = COALESCE(NEW.devolucion_id, OLD.devolucion_id)
    ),
    igv = (
      SELECT COALESCE(SUM(subtotal), 0) * 0.18
      FROM devolucion_items
      WHERE devolucion_id = COALESCE(NEW.devolucion_id, OLD.devolucion_id)
    ),
    total = (
      SELECT COALESCE(SUM(subtotal), 0) * 1.18
      FROM devolucion_items
      WHERE devolucion_id = COALESCE(NEW.devolucion_id, OLD.devolucion_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.devolucion_id, OLD.devolucion_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar totales en INSERT/UPDATE/DELETE de devolucion_items
DROP TRIGGER IF EXISTS trigger_calcular_totales_devolucion_proveedor ON devolucion_items;
CREATE TRIGGER trigger_calcular_totales_devolucion_proveedor
  AFTER INSERT OR UPDATE OR DELETE ON devolucion_items
  FOR EACH ROW
  EXECUTE FUNCTION calcular_totales_devolucion_proveedor();

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista de órdenes de compra abiertas (con pendientes de recibir)
CREATE OR REPLACE VIEW vw_ordenes_compra_abiertas AS
SELECT 
  oc.id,
  oc.tenant_id,
  oc.numero,
  oc.proveedor_id,
  oc.fecha_orden,
  oc.fecha_entrega_esperada,
  oc.estado,
  oc.total,
  COUNT(DISTINCT ocd.id) AS total_items,
  SUM(CASE WHEN ocd.cantidad_pendiente > 0 THEN 1 ELSE 0 END) AS items_pendientes,
  SUM(ocd.cantidad) AS cantidad_total,
  SUM(ocd.cantidad_recibida) AS cantidad_recibida,
  SUM(ocd.cantidad_pendiente) AS cantidad_pendiente
FROM ordenes_compra oc
LEFT JOIN orden_compra_detalles ocd ON ocd.orden_id = oc.id
WHERE oc.estado IN ('APROBADA', 'PARCIAL')
GROUP BY oc.id, oc.tenant_id, oc.numero, oc.proveedor_id, 
         oc.fecha_orden, oc.fecha_entrega_esperada, oc.estado, oc.total
HAVING SUM(ocd.cantidad_pendiente) > 0;

COMMENT ON VIEW vw_ordenes_compra_abiertas IS 'Vista de órdenes de compra con pendientes de recibir';

-- Vista de recepciones con detalle
CREATE OR REPLACE VIEW vw_recepciones_detalle AS
SELECT 
  r.id AS recepcion_id,
  r.tenant_id,
  r.numero AS recepcion_numero,
  r.fecha_recepcion,
  r.estado AS recepcion_estado,
  oc.id AS orden_id,
  oc.numero AS orden_numero,
  oc.proveedor_id,
  ri.id AS item_id,
  prod.id AS producto_id,
  prod.nombre AS producto_nombre,
  ri.cantidad_recibida,
  ri.calidad,
  ri.almacen_id,
  a.nombre AS almacen_nombre,
  ri.lote,
  ri.serie,
  ri.fecha_expiracion
FROM recepciones r
INNER JOIN ordenes_compra oc ON oc.id = r.orden_id
LEFT JOIN recepcion_items ri ON ri.recepcion_id = r.id
LEFT JOIN productos prod ON prod.id = ri.producto_id
LEFT JOIN almacenes a ON a.id = ri.almacen_id;

COMMENT ON VIEW vw_recepciones_detalle IS 'Vista detallada de recepciones con información de orden, proveedor y productos';

-- Vista de devoluciones con detalle
CREATE OR REPLACE VIEW vw_devoluciones_detalle AS
SELECT 
  d.id AS devolucion_id,
  d.tenant_id,
  d.numero AS devolucion_numero,
  d.fecha_devolucion,
  d.estado AS devolucion_estado,
  d.motivo,
  oc.id AS orden_id,
  oc.numero AS orden_numero,
  d.proveedor_id,
  di.id AS item_id,
  prod.id AS producto_id,
  prod.nombre AS producto_nombre,
  di.cantidad,
  di.precio_unitario,
  di.subtotal,
  di.almacen_id,
  a.nombre AS almacen_nombre,
  di.lote,
  di.serie,
  di.motivo_detalle
FROM devoluciones_proveedor d
INNER JOIN ordenes_compra oc ON oc.id = d.orden_id
LEFT JOIN devolucion_items di ON di.devolucion_id = d.id
LEFT JOIN productos prod ON prod.id = di.producto_id
LEFT JOIN almacenes a ON a.id = di.almacen_id;

COMMENT ON VIEW vw_devoluciones_detalle IS 'Vista detallada de devoluciones con información de orden, proveedor y productos';

-- =====================================================
-- COMENTARIOS FINALES
-- =====================================================

COMMENT ON FUNCTION calcular_totales_devolucion_proveedor() IS 'Actualiza automáticamente subtotal, IGV (18%) y total de la devolución a proveedor';
