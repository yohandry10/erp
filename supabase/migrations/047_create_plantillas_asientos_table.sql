-- Migration 047: Crear tabla plantillas_asientos
-- Fecha: 2025-10-27
-- Descripción: Tabla para gestionar plantillas de asientos contables recurrentes
-- Módulo: Contabilidad - Fase 4

BEGIN;

-- =====================================================
-- TABLA: plantillas_asientos
-- =====================================================
-- Descripción: Almacena plantillas de asientos contables que se repiten
--              periódicamente (ej: alquileres, servicios, depreciaciones)
-- Uso: Permite generar asientos automáticamente basados en plantillas predefinidas

CREATE TABLE IF NOT EXISTS plantillas_asientos (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Información de la plantilla
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  
  -- Configuración de recurrencia
  tipo_recurrencia VARCHAR(20) NOT NULL CHECK (tipo_recurrencia IN (
    'MENSUAL',      -- Se genera cada mes
    'TRIMESTRAL',   -- Se genera cada 3 meses
    'SEMESTRAL',    -- Se genera cada 6 meses
    'ANUAL',        -- Se genera cada año
    'MANUAL'        -- Se genera manualmente cuando se solicite
  )),
  
  -- Día del mes para generación automática (1-31, NULL para MANUAL)
  dia_generacion INT CHECK (dia_generacion IS NULL OR (dia_generacion >= 1 AND dia_generacion <= 31)),
  
  -- Configuración contable
  tipo_documento VARCHAR(50) DEFAULT 'ASIENTO_TIPO',
  glosa_plantilla TEXT NOT NULL, -- Plantilla de glosa con variables: {mes}, {anio}, {periodo}
  
  -- Referencias opcionales
  centro_costo_id UUID, -- Centro de costo por defecto
  
  -- Control de estado
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'INACTIVO', 'ARCHIVADO')),
  
  -- Control de generación
  ultima_generacion_fecha DATE, -- Última fecha en que se generó un asiento desde esta plantilla
  ultima_generacion_periodo_id UUID, -- Último período en que se generó
  proxima_generacion_fecha DATE, -- Próxima fecha programada de generación
  
  -- Metadata
  notas TEXT,
  
  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  -- Constraints
  CONSTRAINT plantillas_asientos_unique_codigo 
    UNIQUE (tenant_id, codigo)
);

-- =====================================================
-- TABLA: plantillas_asientos_detalle
-- =====================================================
-- Descripción: Detalle de las líneas contables de cada plantilla
-- Uso: Define los movimientos debe/haber de la plantilla

CREATE TABLE IF NOT EXISTS plantillas_asientos_detalle (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  plantilla_id UUID NOT NULL,
  
  -- Orden de las líneas
  orden INT NOT NULL DEFAULT 1,
  
  -- Cuenta contable
  cuenta_id UUID NOT NULL,
  
  -- Tipo de movimiento
  tipo_movimiento VARCHAR(10) NOT NULL CHECK (tipo_movimiento IN ('DEBE', 'HABER')),
  
  -- Monto (puede ser fijo o variable)
  monto_tipo VARCHAR(20) NOT NULL CHECK (monto_tipo IN (
    'FIJO',        -- Monto fijo definido en monto_valor
    'VARIABLE',    -- Monto se proporciona al generar el asiento
    'FORMULA'      -- Monto se calcula con una fórmula (ej: porcentaje de otro monto)
  )),
  
  monto_valor DECIMAL(15, 2), -- Valor si es FIJO
  monto_formula TEXT, -- Fórmula si es FORMULA (ej: "linea_1 * 0.18" para IGV)
  
  -- Glosa específica de la línea (opcional, si difiere de la plantilla)
  glosa TEXT,
  
  -- Centro de costo específico (opcional, sobrescribe el de la plantilla)
  centro_costo_id UUID,
  
  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT plantillas_detalle_unique_orden 
    UNIQUE (plantilla_id, orden)
);

-- =====================================================
-- TABLA: plantillas_asientos_historial
-- =====================================================
-- Descripción: Historial de asientos generados desde plantillas
-- Uso: Permite rastrear qué asientos fueron generados desde qué plantilla

CREATE TABLE IF NOT EXISTS plantillas_asientos_historial (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Referencias
  plantilla_id UUID NOT NULL,
  asiento_contable_id UUID NOT NULL,
  periodo_contable_id UUID NOT NULL,
  
  -- Información de generación
  fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generado_por UUID,
  tipo_generacion VARCHAR(20) NOT NULL CHECK (tipo_generacion IN (
    'AUTOMATICA',  -- Generado por proceso automático
    'MANUAL'       -- Generado manualmente por usuario
  )),
  
  -- Metadata
  notas TEXT,
  
  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ÍNDICES - plantillas_asientos
-- =====================================================

-- Índice para aislamiento multi-tenant (requerido para RLS)
CREATE INDEX IF NOT EXISTS plantillas_asientos_tenant_id_idx 
  ON plantillas_asientos(tenant_id);

-- Índice para búsquedas por código
CREATE INDEX IF NOT EXISTS plantillas_asientos_codigo_idx 
  ON plantillas_asientos(tenant_id, codigo);

-- Índice para búsquedas por estado
CREATE INDEX IF NOT EXISTS plantillas_asientos_estado_idx 
  ON plantillas_asientos(estado) WHERE estado = 'ACTIVO';

-- Índice para generación automática
CREATE INDEX IF NOT EXISTS plantillas_asientos_proxima_generacion_idx 
  ON plantillas_asientos(proxima_generacion_fecha, estado) 
  WHERE estado = 'ACTIVO' AND proxima_generacion_fecha IS NOT NULL;

-- Índice para búsquedas por tipo de recurrencia
CREATE INDEX IF NOT EXISTS plantillas_asientos_tipo_recurrencia_idx 
  ON plantillas_asientos(tipo_recurrencia, estado) 
  WHERE estado = 'ACTIVO';

-- =====================================================
-- ÍNDICES - plantillas_asientos_detalle
-- =====================================================

-- Índice para aislamiento multi-tenant
CREATE INDEX IF NOT EXISTS plantillas_detalle_tenant_id_idx 
  ON plantillas_asientos_detalle(tenant_id);

-- Índice para búsquedas por plantilla
CREATE INDEX IF NOT EXISTS plantillas_detalle_plantilla_id_idx 
  ON plantillas_asientos_detalle(plantilla_id);

-- Índice para búsquedas por cuenta
CREATE INDEX IF NOT EXISTS plantillas_detalle_cuenta_id_idx 
  ON plantillas_asientos_detalle(cuenta_id);

-- Índice compuesto para ordenamiento
CREATE INDEX IF NOT EXISTS plantillas_detalle_plantilla_orden_idx 
  ON plantillas_asientos_detalle(plantilla_id, orden);

-- =====================================================
-- ÍNDICES - plantillas_asientos_historial
-- =====================================================

-- Índice para aislamiento multi-tenant
CREATE INDEX IF NOT EXISTS plantillas_historial_tenant_id_idx 
  ON plantillas_asientos_historial(tenant_id);

-- Índice para búsquedas por plantilla
CREATE INDEX IF NOT EXISTS plantillas_historial_plantilla_id_idx 
  ON plantillas_asientos_historial(plantilla_id);

-- Índice para búsquedas por asiento
CREATE INDEX IF NOT EXISTS plantillas_historial_asiento_id_idx 
  ON plantillas_asientos_historial(asiento_contable_id);

-- Índice para búsquedas por período
CREATE INDEX IF NOT EXISTS plantillas_historial_periodo_id_idx 
  ON plantillas_asientos_historial(periodo_contable_id);

-- Índice para búsquedas por fecha
CREATE INDEX IF NOT EXISTS plantillas_historial_fecha_idx 
  ON plantillas_asientos_historial(fecha_generacion DESC);

-- =====================================================
-- FOREIGN KEYS
-- =====================================================

-- FK: plantillas_asientos_detalle -> plantillas_asientos
ALTER TABLE plantillas_asientos_detalle 
  ADD CONSTRAINT fk_plantillas_detalle_plantilla 
  FOREIGN KEY (plantilla_id) 
  REFERENCES plantillas_asientos(id) 
  ON DELETE CASCADE;

-- FK: plantillas_asientos_historial -> plantillas_asientos
ALTER TABLE plantillas_asientos_historial 
  ADD CONSTRAINT fk_plantillas_historial_plantilla 
  FOREIGN KEY (plantilla_id) 
  REFERENCES plantillas_asientos(id) 
  ON DELETE RESTRICT;

-- Nota: Las FK a otras tablas se agregarán cuando existan
-- 
-- ALTER TABLE plantillas_asientos 
--   ADD CONSTRAINT fk_plantillas_centro_costo 
--   FOREIGN KEY (centro_costo_id) REFERENCES centros_costo(id) ON DELETE SET NULL;
--
-- ALTER TABLE plantillas_asientos_detalle 
--   ADD CONSTRAINT fk_plantillas_detalle_cuenta 
--   FOREIGN KEY (cuenta_id) REFERENCES plan_cuentas(id) ON DELETE RESTRICT;
--
-- ALTER TABLE plantillas_asientos_historial 
--   ADD CONSTRAINT fk_plantillas_historial_asiento 
--   FOREIGN KEY (asiento_contable_id) REFERENCES asientos_contables(id) ON DELETE RESTRICT;
--
-- ALTER TABLE plantillas_asientos_historial 
--   ADD CONSTRAINT fk_plantillas_historial_periodo 
--   FOREIGN KEY (periodo_contable_id) REFERENCES periodos_contables(id) ON DELETE RESTRICT;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en las tablas
ALTER TABLE plantillas_asientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_asientos_detalle ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_asientos_historial ENABLE ROW LEVEL SECURITY;

-- Políticas de aislamiento por tenant
CREATE POLICY plantillas_asientos_tenant_isolation ON plantillas_asientos
  FOR ALL
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY plantillas_detalle_tenant_isolation ON plantillas_asientos_detalle
  FOR ALL
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY plantillas_historial_tenant_isolation ON plantillas_asientos_historial
  FOR ALL
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

-- =====================================================
-- TRIGGERS: updated_at
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_plantillas_asientos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para plantillas_asientos
CREATE TRIGGER trigger_plantillas_asientos_updated_at
  BEFORE UPDATE ON plantillas_asientos
  FOR EACH ROW
  EXECUTE FUNCTION update_plantillas_asientos_updated_at();

-- Triggers para plantillas_asientos_detalle
CREATE TRIGGER trigger_plantillas_detalle_updated_at
  BEFORE UPDATE ON plantillas_asientos_detalle
  FOR EACH ROW
  EXECUTE FUNCTION update_plantillas_asientos_updated_at();

-- =====================================================
-- FUNCIONES AUXILIARES
-- =====================================================

-- Función para calcular la próxima fecha de generación
CREATE OR REPLACE FUNCTION calcular_proxima_generacion(
  p_tipo_recurrencia VARCHAR,
  p_dia_generacion INT,
  p_fecha_base DATE DEFAULT CURRENT_DATE
)
RETURNS DATE AS $$
DECLARE
  v_proxima_fecha DATE;
  v_mes_siguiente INT;
  v_anio_siguiente INT;
BEGIN
  -- Si es MANUAL, no hay próxima generación automática
  IF p_tipo_recurrencia = 'MANUAL' THEN
    RETURN NULL;
  END IF;
  
  -- Calcular según tipo de recurrencia
  CASE p_tipo_recurrencia
    WHEN 'MENSUAL' THEN
      -- Próximo mes, mismo día
      v_proxima_fecha := (DATE_TRUNC('month', p_fecha_base) + INTERVAL '1 month')::DATE + (p_dia_generacion - 1);
      
    WHEN 'TRIMESTRAL' THEN
      -- Próximo trimestre (3 meses)
      v_proxima_fecha := (DATE_TRUNC('month', p_fecha_base) + INTERVAL '3 months')::DATE + (p_dia_generacion - 1);
      
    WHEN 'SEMESTRAL' THEN
      -- Próximo semestre (6 meses)
      v_proxima_fecha := (DATE_TRUNC('month', p_fecha_base) + INTERVAL '6 months')::DATE + (p_dia_generacion - 1);
      
    WHEN 'ANUAL' THEN
      -- Próximo año, mismo mes y día
      v_proxima_fecha := (DATE_TRUNC('year', p_fecha_base) + INTERVAL '1 year')::DATE + (p_dia_generacion - 1);
      
    ELSE
      RETURN NULL;
  END CASE;
  
  RETURN v_proxima_fecha;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Función para validar balance de plantilla
CREATE OR REPLACE FUNCTION validar_balance_plantilla(p_plantilla_id UUID)
RETURNS TABLE(
  es_valido BOOLEAN,
  total_debe DECIMAL(15, 2),
  total_haber DECIMAL(15, 2),
  diferencia DECIMAL(15, 2),
  mensaje TEXT
) AS $$
DECLARE
  v_total_debe DECIMAL(15, 2);
  v_total_haber DECIMAL(15, 2);
  v_tiene_variables BOOLEAN;
BEGIN
  -- Verificar si hay montos variables o fórmulas
  SELECT EXISTS(
    SELECT 1 FROM plantillas_asientos_detalle
    WHERE plantilla_id = p_plantilla_id
      AND monto_tipo IN ('VARIABLE', 'FORMULA')
  ) INTO v_tiene_variables;
  
  -- Si hay variables, no se puede validar el balance
  IF v_tiene_variables THEN
    RETURN QUERY SELECT 
      NULL::BOOLEAN,
      NULL::DECIMAL(15, 2),
      NULL::DECIMAL(15, 2),
      NULL::DECIMAL(15, 2),
      'La plantilla contiene montos variables o fórmulas. El balance se validará al generar el asiento.'::TEXT;
    RETURN;
  END IF;
  
  -- Calcular totales de debe y haber (solo montos fijos)
  SELECT 
    COALESCE(SUM(CASE WHEN tipo_movimiento = 'DEBE' THEN monto_valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo_movimiento = 'HABER' THEN monto_valor ELSE 0 END), 0)
  INTO v_total_debe, v_total_haber
  FROM plantillas_asientos_detalle
  WHERE plantilla_id = p_plantilla_id
    AND monto_tipo = 'FIJO';
  
  -- Validar balance
  IF v_total_debe = v_total_haber THEN
    RETURN QUERY SELECT 
      TRUE,
      v_total_debe,
      v_total_haber,
      0::DECIMAL(15, 2),
      'La plantilla está balanceada correctamente.'::TEXT;
  ELSE
    RETURN QUERY SELECT 
      FALSE,
      v_total_debe,
      v_total_haber,
      ABS(v_total_debe - v_total_haber),
      FORMAT('La plantilla NO está balanceada. Diferencia: %s', ABS(v_total_debe - v_total_haber))::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON TABLE plantillas_asientos IS 
  'Plantillas de asientos contables recurrentes - RLS habilitado';

COMMENT ON TABLE plantillas_asientos_detalle IS 
  'Detalle de líneas contables de cada plantilla - RLS habilitado';

COMMENT ON TABLE plantillas_asientos_historial IS 
  'Historial de asientos generados desde plantillas - RLS habilitado';

COMMENT ON COLUMN plantillas_asientos.codigo IS 
  'Código único de la plantilla dentro del tenant';

COMMENT ON COLUMN plantillas_asientos.tipo_recurrencia IS 
  'Frecuencia de generación: MENSUAL, TRIMESTRAL, SEMESTRAL, ANUAL, MANUAL';

COMMENT ON COLUMN plantillas_asientos.dia_generacion IS 
  'Día del mes para generación automática (1-31)';

COMMENT ON COLUMN plantillas_asientos.glosa_plantilla IS 
  'Plantilla de glosa con variables: {mes}, {anio}, {periodo}';

COMMENT ON COLUMN plantillas_asientos_detalle.monto_tipo IS 
  'Tipo de monto: FIJO (valor fijo), VARIABLE (se proporciona al generar), FORMULA (se calcula)';

COMMENT ON COLUMN plantillas_asientos_detalle.monto_formula IS 
  'Fórmula para calcular el monto (ej: "linea_1 * 0.18")';

COMMENT ON FUNCTION calcular_proxima_generacion IS 
  'Calcula la próxima fecha de generación según tipo de recurrencia';

COMMENT ON FUNCTION validar_balance_plantilla IS 
  'Valida que el balance de debe y haber de una plantilla sea correcto';

-- =====================================================
-- VALIDACIÓN
-- =====================================================

DO $$
BEGIN
  -- Verificar que las tablas fueron creadas
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'plantillas_asientos'
  ) THEN
    RAISE NOTICE '✓ Tabla plantillas_asientos creada exitosamente';
  ELSE
    RAISE EXCEPTION 'ERROR: Tabla plantillas_asientos no fue creada';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'plantillas_asientos_detalle'
  ) THEN
    RAISE NOTICE '✓ Tabla plantillas_asientos_detalle creada exitosamente';
  ELSE
    RAISE EXCEPTION 'ERROR: Tabla plantillas_asientos_detalle no fue creada';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'plantillas_asientos_historial'
  ) THEN
    RAISE NOTICE '✓ Tabla plantillas_asientos_historial creada exitosamente';
  ELSE
    RAISE EXCEPTION 'ERROR: Tabla plantillas_asientos_historial no fue creada';
  END IF;
  
  -- Verificar que RLS está habilitado
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename IN ('plantillas_asientos', 'plantillas_asientos_detalle', 'plantillas_asientos_historial')
      AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ RLS habilitado en todas las tablas de plantillas';
  ELSE
    RAISE WARNING 'ATENCIÓN: RLS NO está habilitado en todas las tablas';
  END IF;
  
  -- Verificar funciones
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'calcular_proxima_generacion'
  ) THEN
    RAISE NOTICE '✓ Función calcular_proxima_generacion creada';
  ELSE
    RAISE WARNING 'ATENCIÓN: Función calcular_proxima_generacion NO existe';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'validar_balance_plantilla'
  ) THEN
    RAISE NOTICE '✓ Función validar_balance_plantilla creada';
  ELSE
    RAISE WARNING 'ATENCIÓN: Función validar_balance_plantilla NO existe';
  END IF;
  
  RAISE NOTICE '=== MIGRACIÓN 047 COMPLETADA ===';
END $$;

COMMIT;
