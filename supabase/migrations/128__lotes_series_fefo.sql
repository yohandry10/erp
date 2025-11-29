-- =====================================================
-- MIGRACIÓN 128: Sistema de Lotes y Series con FEFO
-- =====================================================
-- Implementa trazabilidad completa de lotes/series para
-- productos regulados (medicamentos, alimentos) con:
-- - Gestión de lotes con fecha de vencimiento
-- - Política FEFO (First Expire First Out)
-- - Bloqueo de venta de lotes vencidos
-- - Alertas de productos próximos a vencer
-- =====================================================

-- 0. Agregar campos faltantes a movimientos_inventario si no existen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'movimientos_inventario' AND column_name = 'almacen_id'
  ) THEN
    ALTER TABLE movimientos_inventario ADD COLUMN almacen_id UUID REFERENCES almacenes(id);
    CREATE INDEX IF NOT EXISTS idx_mov_inv_almacen ON movimientos_inventario(almacen_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'movimientos_inventario' AND column_name = 'lote'
  ) THEN
    ALTER TABLE movimientos_inventario ADD COLUMN lote VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'movimientos_inventario' AND column_name = 'fecha_expiracion'
  ) THEN
    ALTER TABLE movimientos_inventario ADD COLUMN fecha_expiracion DATE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'movimientos_inventario' AND column_name = 'ubicacion_id'
  ) THEN
    ALTER TABLE movimientos_inventario ADD COLUMN ubicacion_id UUID;
  END IF;
END $$;

-- 1. Tabla principal de lotes de productos
CREATE TABLE IF NOT EXISTS lotes_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  almacen_id UUID REFERENCES almacenes(id) ON DELETE SET NULL,
  
  -- Identificación del lote
  numero_lote VARCHAR(100) NOT NULL,
  numero_serie VARCHAR(100), -- Para productos con serie individual
  
  -- Fechas críticas
  fecha_fabricacion DATE,
  fecha_vencimiento DATE NOT NULL,
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
  
  -- Cantidades
  cantidad_inicial NUMERIC(15,4) NOT NULL DEFAULT 0,
  cantidad_disponible NUMERIC(15,4) NOT NULL DEFAULT 0,
  cantidad_reservada NUMERIC(15,4) NOT NULL DEFAULT 0,
  
  -- Ubicación física
  ubicacion_almacen VARCHAR(100), -- Ej: "Pasillo A, Estante 3, Nivel 2"
  
  -- Estado del lote
  estado VARCHAR(20) DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'AGOTADO', 'VENCIDO', 'BLOQUEADO', 'CUARENTENA')),
  
  -- Trazabilidad
  proveedor_id UUID REFERENCES proveedores(id),
  orden_compra_id UUID,
  recepcion_id UUID,
  costo_unitario NUMERIC(15,4),
  
  -- Metadatos
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  -- Constraints
  CONSTRAINT uq_lote_producto_tenant UNIQUE (tenant_id, producto_id, numero_lote),
  CONSTRAINT chk_cantidad_disponible_no_negativa CHECK (cantidad_disponible >= 0),
  CONSTRAINT chk_cantidad_reservada_no_negativa CHECK (cantidad_reservada >= 0),
  CONSTRAINT chk_fecha_vencimiento_futura CHECK (fecha_vencimiento >= fecha_fabricacion OR fecha_fabricacion IS NULL)
);

-- 2. Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_lotes_tenant_producto ON lotes_productos(tenant_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento ON lotes_productos(tenant_id, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_lotes_estado ON lotes_productos(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_lotes_almacen ON lotes_productos(tenant_id, almacen_id);
CREATE INDEX IF NOT EXISTS idx_lotes_disponible ON lotes_productos(tenant_id, producto_id, cantidad_disponible) 
  WHERE cantidad_disponible > 0 AND estado = 'ACTIVO';

-- 3. Tabla de movimientos de lotes (trazabilidad completa)
CREATE TABLE IF NOT EXISTS movimientos_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lote_id UUID NOT NULL REFERENCES lotes_productos(id) ON DELETE CASCADE,
  
  -- Tipo de movimiento
  tipo_movimiento VARCHAR(30) NOT NULL CHECK (tipo_movimiento IN (
    'ENTRADA', 'SALIDA', 'RESERVA', 'LIBERACION', 
    'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'VENCIMIENTO', 'TRANSFERENCIA'
  )),
  
  -- Cantidades
  cantidad NUMERIC(15,4) NOT NULL,
  cantidad_anterior NUMERIC(15,4) NOT NULL,
  cantidad_nueva NUMERIC(15,4) NOT NULL,
  
  -- Referencia al documento origen
  documento_tipo VARCHAR(50), -- VENTA_POS, PEDIDO, RECEPCION, AJUSTE, etc.
  documento_id UUID,
  documento_numero VARCHAR(50),
  
  -- Trazabilidad de venta
  venta_pos_id UUID,
  cliente_id UUID,
  
  -- Auditoría
  usuario_id UUID,
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mov_lotes_tenant ON movimientos_lotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mov_lotes_lote ON movimientos_lotes(lote_id);
CREATE INDEX IF NOT EXISTS idx_mov_lotes_fecha ON movimientos_lotes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mov_lotes_documento ON movimientos_lotes(documento_tipo, documento_id);

-- 4. Configuración de alertas de vencimiento por tenant
CREATE TABLE IF NOT EXISTS config_alertas_vencimiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  
  -- Días de anticipación para alertas
  dias_alerta_critica INTEGER DEFAULT 7,   -- Alerta roja: vence en 7 días
  dias_alerta_warning INTEGER DEFAULT 30,  -- Alerta amarilla: vence en 30 días
  dias_alerta_info INTEGER DEFAULT 90,     -- Alerta informativa: vence en 90 días
  
  -- Acciones automáticas
  bloquear_venta_vencidos BOOLEAN DEFAULT TRUE,
  bloquear_venta_proximos_vencer BOOLEAN DEFAULT FALSE,
  dias_bloqueo_previo INTEGER DEFAULT 0, -- Bloquear X días antes de vencer
  
  -- Notificaciones
  notificar_email BOOLEAN DEFAULT TRUE,
  notificar_dashboard BOOLEAN DEFAULT TRUE,
  emails_notificacion TEXT[], -- Array de emails
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Función FEFO: Obtener lotes disponibles ordenados por vencimiento
CREATE OR REPLACE FUNCTION obtener_lotes_fefo(
  p_tenant_id UUID,
  p_producto_id UUID,
  p_cantidad_requerida NUMERIC,
  p_almacen_id UUID DEFAULT NULL
)
RETURNS TABLE (
  lote_id UUID,
  numero_lote VARCHAR,
  fecha_vencimiento DATE,
  cantidad_disponible NUMERIC,
  cantidad_a_usar NUMERIC,
  dias_para_vencer INTEGER
) AS $$
DECLARE
  v_cantidad_pendiente NUMERIC := p_cantidad_requerida;
  v_config config_alertas_vencimiento%ROWTYPE;
  v_lote RECORD;
BEGIN
  -- Obtener configuración del tenant
  SELECT * INTO v_config FROM config_alertas_vencimiento WHERE tenant_id = p_tenant_id;
  
  -- Iterar lotes ordenados por fecha de vencimiento (FEFO)
  FOR v_lote IN 
    SELECT 
      lp.id,
      lp.numero_lote,
      lp.fecha_vencimiento,
      lp.cantidad_disponible,
      (lp.fecha_vencimiento - CURRENT_DATE) as dias_restantes
    FROM lotes_productos lp
    WHERE lp.tenant_id = p_tenant_id
      AND lp.producto_id = p_producto_id
      AND lp.estado = 'ACTIVO'
      AND lp.cantidad_disponible > 0
      AND (p_almacen_id IS NULL OR lp.almacen_id = p_almacen_id)
      -- Excluir vencidos si está configurado
      AND (
        NOT COALESCE(v_config.bloquear_venta_vencidos, TRUE) 
        OR lp.fecha_vencimiento >= CURRENT_DATE
      )
      -- Excluir próximos a vencer si está configurado
      AND (
        NOT COALESCE(v_config.bloquear_venta_proximos_vencer, FALSE)
        OR lp.fecha_vencimiento >= (CURRENT_DATE + COALESCE(v_config.dias_bloqueo_previo, 0))
      )
    ORDER BY lp.fecha_vencimiento ASC, lp.created_at ASC
  LOOP
    EXIT WHEN v_cantidad_pendiente <= 0;
    
    lote_id := v_lote.id;
    numero_lote := v_lote.numero_lote;
    fecha_vencimiento := v_lote.fecha_vencimiento;
    cantidad_disponible := v_lote.cantidad_disponible;
    dias_para_vencer := v_lote.dias_restantes;
    
    IF v_lote.cantidad_disponible >= v_cantidad_pendiente THEN
      cantidad_a_usar := v_cantidad_pendiente;
      v_cantidad_pendiente := 0;
    ELSE
      cantidad_a_usar := v_lote.cantidad_disponible;
      v_cantidad_pendiente := v_cantidad_pendiente - v_lote.cantidad_disponible;
    END IF;
    
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Función para reservar stock de lotes (FEFO)
CREATE OR REPLACE FUNCTION reservar_stock_lote_fefo(
  p_tenant_id UUID,
  p_producto_id UUID,
  p_cantidad NUMERIC,
  p_documento_tipo VARCHAR,
  p_documento_id UUID,
  p_usuario_id UUID DEFAULT NULL,
  p_almacen_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  lotes_reservados JSONB,
  cantidad_reservada NUMERIC,
  cantidad_faltante NUMERIC,
  mensaje TEXT
) AS $$
DECLARE
  v_lote RECORD;
  v_cantidad_pendiente NUMERIC := p_cantidad;
  v_lotes_reservados JSONB := '[]'::JSONB;
  v_cantidad_total_reservada NUMERIC := 0;
BEGIN
  -- Obtener lotes FEFO y reservar
  FOR v_lote IN 
    SELECT * FROM obtener_lotes_fefo(p_tenant_id, p_producto_id, p_cantidad, p_almacen_id)
  LOOP
    -- Actualizar lote
    UPDATE lotes_productos
    SET 
      cantidad_disponible = cantidad_disponible - v_lote.cantidad_a_usar,
      cantidad_reservada = cantidad_reservada + v_lote.cantidad_a_usar,
      updated_at = NOW()
    WHERE id = v_lote.lote_id;
    
    -- Registrar movimiento
    INSERT INTO movimientos_lotes (
      tenant_id, lote_id, tipo_movimiento, cantidad,
      cantidad_anterior, cantidad_nueva,
      documento_tipo, documento_id, usuario_id
    ) VALUES (
      p_tenant_id, v_lote.lote_id, 'RESERVA', v_lote.cantidad_a_usar,
      v_lote.cantidad_disponible, v_lote.cantidad_disponible - v_lote.cantidad_a_usar,
      p_documento_tipo, p_documento_id, p_usuario_id
    );
    
    -- Agregar a resultado
    v_lotes_reservados := v_lotes_reservados || jsonb_build_object(
      'lote_id', v_lote.lote_id,
      'numero_lote', v_lote.numero_lote,
      'cantidad', v_lote.cantidad_a_usar,
      'fecha_vencimiento', v_lote.fecha_vencimiento
    );
    
    v_cantidad_total_reservada := v_cantidad_total_reservada + v_lote.cantidad_a_usar;
    v_cantidad_pendiente := v_cantidad_pendiente - v_lote.cantidad_a_usar;
  END LOOP;
  
  success := v_cantidad_pendiente <= 0;
  lotes_reservados := v_lotes_reservados;
  cantidad_reservada := v_cantidad_total_reservada;
  cantidad_faltante := GREATEST(v_cantidad_pendiente, 0);
  
  IF v_cantidad_pendiente > 0 THEN
    mensaje := format('Stock insuficiente. Reservado: %s, Faltante: %s', 
      v_cantidad_total_reservada, v_cantidad_pendiente);
  ELSE
    mensaje := format('Reserva exitosa de %s unidades en %s lote(s)', 
      v_cantidad_total_reservada, jsonb_array_length(v_lotes_reservados));
  END IF;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Función para confirmar venta de lotes reservados
CREATE OR REPLACE FUNCTION confirmar_venta_lotes(
  p_tenant_id UUID,
  p_lotes_reservados JSONB,
  p_venta_pos_id UUID,
  p_cliente_id UUID DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_lote JSONB;
  v_lote_id UUID;
  v_cantidad NUMERIC;
BEGIN
  FOR v_lote IN SELECT * FROM jsonb_array_elements(p_lotes_reservados)
  LOOP
    v_lote_id := (v_lote->>'lote_id')::UUID;
    v_cantidad := (v_lote->>'cantidad')::NUMERIC;
    
    -- Convertir reserva en salida
    UPDATE lotes_productos
    SET 
      cantidad_reservada = cantidad_reservada - v_cantidad,
      estado = CASE WHEN cantidad_disponible = 0 AND cantidad_reservada - v_cantidad = 0 THEN 'AGOTADO' ELSE estado END,
      updated_at = NOW()
    WHERE id = v_lote_id AND tenant_id = p_tenant_id;
    
    -- Registrar movimiento de salida
    INSERT INTO movimientos_lotes (
      tenant_id, lote_id, tipo_movimiento, cantidad,
      cantidad_anterior, cantidad_nueva,
      documento_tipo, documento_id, venta_pos_id, cliente_id, usuario_id
    )
    SELECT 
      p_tenant_id, v_lote_id, 'SALIDA', v_cantidad,
      cantidad_reservada + v_cantidad, cantidad_reservada,
      'VENTA_POS', p_venta_pos_id, p_venta_pos_id, p_cliente_id, p_usuario_id
    FROM lotes_productos WHERE id = v_lote_id;
  END LOOP;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Vista de lotes próximos a vencer
CREATE OR REPLACE VIEW v_lotes_proximos_vencer AS
SELECT 
  lp.tenant_id,
  lp.id as lote_id,
  lp.numero_lote,
  lp.producto_id,
  p.nombre as producto_nombre,
  p.codigo as producto_codigo,
  lp.almacen_id,
  a.nombre as almacen_nombre,
  lp.fecha_vencimiento,
  lp.cantidad_disponible,
  lp.ubicacion_almacen,
  (lp.fecha_vencimiento - CURRENT_DATE) as dias_para_vencer,
  CASE 
    WHEN lp.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO'
    WHEN (lp.fecha_vencimiento - CURRENT_DATE) <= COALESCE(cav.dias_alerta_critica, 7) THEN 'CRITICO'
    WHEN (lp.fecha_vencimiento - CURRENT_DATE) <= COALESCE(cav.dias_alerta_warning, 30) THEN 'WARNING'
    WHEN (lp.fecha_vencimiento - CURRENT_DATE) <= COALESCE(cav.dias_alerta_info, 90) THEN 'INFO'
    ELSE 'OK'
  END as nivel_alerta
FROM lotes_productos lp
JOIN productos p ON p.id = lp.producto_id
LEFT JOIN almacenes a ON a.id = lp.almacen_id
LEFT JOIN config_alertas_vencimiento cav ON cav.tenant_id = lp.tenant_id
WHERE lp.estado = 'ACTIVO' 
  AND lp.cantidad_disponible > 0
  AND lp.fecha_vencimiento <= (CURRENT_DATE + COALESCE(cav.dias_alerta_info, 90));

-- 9. Job para marcar lotes vencidos automáticamente
CREATE OR REPLACE FUNCTION marcar_lotes_vencidos()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE lotes_productos
  SET 
    estado = 'VENCIDO',
    updated_at = NOW()
  WHERE estado = 'ACTIVO'
    AND fecha_vencimiento < CURRENT_DATE
    AND cantidad_disponible > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Registrar movimientos de vencimiento
  INSERT INTO movimientos_lotes (
    tenant_id, lote_id, tipo_movimiento, cantidad,
    cantidad_anterior, cantidad_nueva, motivo
  )
  SELECT 
    tenant_id, id, 'VENCIMIENTO', cantidad_disponible,
    cantidad_disponible, 0, 'Lote marcado como vencido automáticamente'
  FROM lotes_productos
  WHERE estado = 'VENCIDO' 
    AND updated_at >= NOW() - INTERVAL '1 minute';
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Habilitar RLS
ALTER TABLE lotes_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_alertas_vencimiento ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "tenant_isolation_lotes" ON lotes_productos
  FOR ALL USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

CREATE POLICY "tenant_isolation_mov_lotes" ON movimientos_lotes
  FOR ALL USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

CREATE POLICY "tenant_isolation_config_alertas" ON config_alertas_vencimiento
  FOR ALL USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);

-- 11. Agregar campo a productos para indicar si requiere lotes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'productos' AND column_name = 'requiere_lote'
  ) THEN
    ALTER TABLE productos ADD COLUMN requiere_lote BOOLEAN DEFAULT FALSE;
    COMMENT ON COLUMN productos.requiere_lote IS 'Si true, el producto requiere selección de lote al vender (FEFO)';
  END IF;
END $$;

-- 12. Comentarios de documentación
COMMENT ON TABLE lotes_productos IS 'Gestión de lotes de productos con trazabilidad y FEFO';
COMMENT ON TABLE movimientos_lotes IS 'Historial de movimientos de lotes para trazabilidad completa';
COMMENT ON TABLE config_alertas_vencimiento IS 'Configuración de alertas de vencimiento por tenant';
COMMENT ON FUNCTION obtener_lotes_fefo IS 'Obtiene lotes disponibles ordenados por FEFO (First Expire First Out)';
COMMENT ON FUNCTION reservar_stock_lote_fefo IS 'Reserva stock de lotes usando política FEFO';
COMMENT ON FUNCTION confirmar_venta_lotes IS 'Confirma la venta y registra salida de lotes';
COMMENT ON VIEW v_lotes_proximos_vencer IS 'Vista de lotes próximos a vencer con nivel de alerta';

-- 13. Insertar configuración default para tenants existentes
INSERT INTO config_alertas_vencimiento (tenant_id)
SELECT DISTINCT tenant_id FROM empresa_config
WHERE tenant_id NOT IN (SELECT tenant_id FROM config_alertas_vencimiento)
ON CONFLICT (tenant_id) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE '✅ Migración 128: Sistema de Lotes y Series con FEFO completado';
END $$;
