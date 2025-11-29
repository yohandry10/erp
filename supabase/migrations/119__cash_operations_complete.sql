-- Migración: Operaciones completas de caja POS
-- Prioridad: Sistema de trazabilidad, denominaciones, retiros y cambios de turno
-- Crea tabla movimientos_caja con triggers de inmutabilidad
-- Agrega campos a sesiones_caja para hash de integridad y denominaciones
-- Crea tablas para retiros y cambios de turno

-- =====================================================
-- 1. TABLA: movimientos_caja (Trazabilidad de transacciones)
-- =====================================================

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id) ON DELETE CASCADE,
  secuencia INT NOT NULL,
  tipo_movimiento VARCHAR(30) NOT NULL CHECK (tipo_movimiento IN ('VENTA', 'RETIRO', 'INGRESO', 'AJUSTE', 'CAMBIO_TURNO', 'APERTURA')),
  monto NUMERIC(18,2) NOT NULL,
  saldo_anterior NUMERIC(18,2) NOT NULL,
  saldo_nuevo NUMERIC(18,2) NOT NULL,
  referencia_documento VARCHAR(50),
  referencia_tipo VARCHAR(30),
  motivo TEXT,
  usuario_id uuid,
  supervisor_id uuid,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  metadata JSONB,
  tenant_id uuid NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_secuencia_por_sesion UNIQUE(sesion_caja_id, secuencia),
  CONSTRAINT saldo_cuadrado CHECK (saldo_anterior + monto = saldo_nuevo)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_sesion ON movimientos_caja(sesion_caja_id, secuencia);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tipo ON movimientos_caja(tenant_id, tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_timestamp ON movimientos_caja(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_tenant ON movimientos_caja(tenant_id);

-- Trigger para inmutabilidad (NO se permite UPDATE ni DELETE)
CREATE OR REPLACE FUNCTION prevent_cash_movement_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'No se permite modificar movimientos de caja. Son inmutables.';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se permite eliminar movimientos de caja. Son inmutables.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_modification_cash_movements ON movimientos_caja;
CREATE TRIGGER no_modification_cash_movements
BEFORE UPDATE OR DELETE ON movimientos_caja
FOR EACH ROW EXECUTE FUNCTION prevent_cash_movement_modification();

COMMENT ON TABLE movimientos_caja IS 'Registro inmutable de todos los movimientos de efectivo por sesión de caja con secuencia consecutiva y validación matemática';
COMMENT ON COLUMN movimientos_caja.secuencia IS 'Número consecutivo por sesión, usado para detectar gaps';
COMMENT ON COLUMN movimientos_caja.saldo_anterior IS 'Saldo antes del movimiento, para auditoría matemática';
COMMENT ON COLUMN movimientos_caja.saldo_nuevo IS 'Saldo después del movimiento, debe cumplir: saldo_anterior + monto = saldo_nuevo';

-- =====================================================
-- 2. AGREGAR CAMPOS A sesiones_caja
-- =====================================================

ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS hash_integridad VARCHAR(64);
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS denominaciones_apertura JSONB;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS denominaciones_cierre JSONB;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS supervisor_apertura_id uuid;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS supervisor_cierre_id uuid;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS razon_autorizacion TEXT;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS congelada BOOLEAN DEFAULT false;

COMMENT ON COLUMN sesiones_caja.hash_integridad IS 'Hash SHA-256 de todos los movimientos, calculado al cierre para detectar manipulación';
COMMENT ON COLUMN sesiones_caja.denominaciones_apertura IS 'Detalle de billetes y monedas al abrir (JSON)';
COMMENT ON COLUMN sesiones_caja.denominaciones_cierre IS 'Detalle de billetes y monedas al cerrar (JSON)';
COMMENT ON COLUMN sesiones_caja.supervisor_apertura_id IS 'Supervisor que autorizó apertura (si monto fuera de rango)';
COMMENT ON COLUMN sesiones_caja.supervisor_cierre_id IS 'Supervisor que autorizócryptographic diferencia en cierre';
COMMENT ON COLUMN sesiones_caja.razon_autorizacion IS 'Motivo de autorización especial en apertura o cierre';
COMMENT ON COLUMN sesiones_caja.congelada IS 'True durante cambio de turno (no permite nuevas transacciones)';

-- =====================================================
-- 3. TABLA: retiros_caja (Retiros de efectivo con aprobación)
-- =====================================================

CREATE TABLE IF NOT EXISTS retiros_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id) ON DELETE CASCADE,
  movimiento_caja_id uuid REFERENCES movimientos_caja(id),
  monto NUMERIC(18,2) NOT NULL CHECK (monto > 0),
  motivo VARCHAR(50) NOT NULL CHECK (motivo IN ('DEPOSITO_BANCARIO', 'COMPRA_EMERGENCIA', 'BÓVEDA', 'OTRO')),
  motivo_detalle TEXT,
  autorizado_por uuid,
  codigo_autorizacion VARCHAR(10),
  foto_comprobante TEXT,
  estado_conciliacion VARCHAR(20) DEFAULT 'PENDIENTE' CHECK (estado_conciliacion IN ('PENDIENTE', 'CONCILIADO', 'RECHAZADO')),
  fecha_conciliacion TIMESTAMPTZ,
  banco_destino VARCHAR(100),
  numero_operacion VARCHAR(50),
  tenant_id uuid NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retiros_caja_sesion ON retiros_caja(sesion_caja_id);
CREATE INDEX IF NOT EXISTS idx_retiros_caja_estado ON retiros_caja(tenant_id, estado_conciliacion);
CREATE INDEX IF NOT EXISTS idx_retiros_caja_tenant ON retiros_caja(tenant_id);

COMMENT ON TABLE retiros_caja IS 'Retiros de efectivo con motivo, autorización y conciliación bancaria';
COMMENT ON COLUMN retiros_caja.codigo_autorizacion IS 'PIN del supervisor (requerido si monto > límite configurado)';
COMMENT ON COLUMN retiros_caja.foto_comprobante IS 'URL de foto del comprobante bancario o recibo';

-- =====================================================
-- 4. TABLA: cambios_turno (Relevo de cajeros con arqueo)
-- =====================================================

CREATE TABLE IF NOT EXISTS cambios_turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id) ON DELETE CASCADE,
  usuario_saliente_id uuid NOT NULL,
  usuario_entrante_id uuid NOT NULL,
  saldo_sistema NUMERIC(18,2) NOT NULL,
  saldo_contado NUMERIC(18,2) NOT NULL,
  diferencia NUMERIC(18,2) GENERATED ALWAYS AS (saldo_contado - saldo_sistema) STORED,
  denominaciones JSONB,
  foto_arqueo TEXT,
  firma_digital_saliente TEXT,
  firma_digital_entrante TEXT,
  timestamp_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamp_fin TIMESTAMPTZ,
  estado VARCHAR(20) DEFAULT 'EN_PROCESO' CHECK (estado IN ('EN_PROCESO', 'COMPLETADO', 'CANCELADO')),
  tenant_id uuid NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cambios_turno_sesion ON cambios_turno(sesion_caja_id);
CREATE INDEX IF NOT EXISTS idx_cambios_turno_estado ON cambios_turno(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_cambios_turno_tenant ON cambios_turno(tenant_id);

COMMENT ON TABLE cambios_turno IS 'Cambios de turno con arqueo obligatorio y firmas digitales de ambos usuarios';
COMMENT ON COLUMN cambios_turno.diferencia IS 'Calculada automáticamente: saldo_contado - saldo_sistema (sobrante si >0, faltante si <0)';
COMMENT ON COLUMN cambios_turno.foto_arqueo IS 'URL de foto del dinero contado con ambos usuarios presentes';

-- =====================================================
-- 5. TABLA: configuracion_caja (Parámetros configurables)
-- =====================================================

CREATE TABLE IF NOT EXISTS configuracion_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  monto_apertura_min NUMERIC(18,2) DEFAULT 100.00,
  monto_apertura_max NUMERIC(18,2) DEFAULT 2000.00,
  retiro_max_sin_autorizacion NUMERIC(18,2) DEFAULT 500.00,
  saldo_minimo_operativo NUMERIC(18,2) DEFAULT 200.00,
  tolerancia_diferencia_cierre NUMERIC(18,2) DEFAULT 10.00,
  retencion_auditoria_dias INT DEFAULT 2555, -- 7 años
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_configuracion_caja_tenant ON configuracion_caja(tenant_id);

COMMENT ON TABLE configuracion_caja IS 'Configuración global de parámetros de caja por tenant';
COMMENT ON COLUMN configuracion_caja.tolerancia_diferencia_cierre IS 'Diferencia aceptable en cierre sin requerir supervisor';
COMMENT ON COLUMN configuracion_caja.retencion_auditoria_dias IS 'Días de retención de registros de auditoría (default: 7 años)';

-- Insertar configuración por defecto para cada tenant existente
INSERT INTO configuracion_caja (tenant_id)
SELECT id 
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM configuracion_caja WHERE configuracion_caja.tenant_id = tenants.id
);

-- =====================================================
-- 6. AUDITORÍA: Extensión de tabla de auditoría existente
-- =====================================================

-- Nota: Asumimos que ya existe una tabla 'audit_log' genérica
-- Solo agregamos eventos específicos de caja como ENUM si no existe

-- Si quisiéramos una tabla dedicada (opcional):
CREATE TABLE IF NOT EXISTS caja_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento VARCHAR(50) NOT NULL,
  sesion_caja_id uuid REFERENCES sesiones_caja(id),
  usuario_id uuid,
  ip_address INET,
  user_agent TEXT,
  parametros JSONB,
  resultado VARCHAR(20),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caja_audit_log_sesion ON caja_audit_log(sesion_caja_id);
CREATE INDEX IF NOT EXISTS idx_caja_audit_log_evento ON caja_audit_log(tenant_id, evento);
CREATE INDEX IF NOT EXISTS idx_caja_audit_log_timestamp ON caja_audit_log(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_caja_audit_log_tenant ON caja_audit_log(tenant_id);

COMMENT ON TABLE caja_audit_log IS 'Auditoría dedicada para operaciones de caja con retención extendida (7 años)';

-- =====================================================
-- 7. RLS (Row Level Security) para nuevas tablas
-- =====================================================

ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE retiros_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE cambios_turno ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_audit_log ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas (ajustar según autenticación del sistema)
DROP POLICY IF EXISTS movimientos_caja_tenant_isolation ON movimientos_caja;
CREATE POLICY movimientos_caja_tenant_isolation
  ON movimientos_caja
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

DROP POLICY IF EXISTS retiros_caja_tenant_isolation ON retiros_caja;
CREATE POLICY retiros_caja_tenant_isolation
  ON retiros_caja
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

DROP POLICY IF EXISTS cambios_turno_tenant_isolation ON cambios_turno;
CREATE POLICY cambios_turno_tenant_isolation
  ON cambios_turno
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

DROP POLICY IF EXISTS configuracion_caja_tenant_isolation ON configuracion_caja;
CREATE POLICY configuracion_caja_tenant_isolation
  ON configuracion_caja
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

DROP POLICY IF EXISTS caja_audit_log_tenant_isolation ON caja_audit_log;
CREATE POLICY caja_audit_log_tenant_isolation
  ON caja_audit_log
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- 8. FUNCIÓN: Registrar movimiento de caja con validación
-- =====================================================

CREATE OR REPLACE FUNCTION registrar_movimiento_caja(
  p_sesion_caja_id uuid,
  p_tipo_movimiento varchar,
  p_monto numeric,
  p_referencia_documento varchar DEFAULT NULL,
  p_referencia_tipo varchar DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_supervisor_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS movimientos_caja AS $$
DECLARE
  v_sesion sesiones_caja;
  v_ultimo_movimiento movimientos_caja;
  v_nueva_secuencia int;
  v_saldo_anterior numeric;
  v_saldo_nuevo numeric;
  v_nuevo_movimiento movimientos_caja;
BEGIN
  -- Obtener sesión y validar que esté abierta
  SELECT * INTO v_sesion FROM sesiones_caja WHERE id = p_sesion_caja_id;
  
  IF v_sesion IS NULL THEN
    RAISE EXCEPTION 'Sesión de caja no encontrada';
  END IF;
  
  IF v_sesion.estado != 'ABIERTA' THEN
    RAISE EXCEPTION 'La sesión de caja no está abierta (estado: %)', v_sesion.estado;
  END IF;
  
  IF v_sesion.congelada = true THEN
    RAISE EXCEPTION 'La caja está congelada (cambio de turno en proceso)';
  END IF;
  
  -- Obtener último movimiento y calcular nueva secuencia
  SELECT * INTO v_ultimo_movimiento
  FROM movimientos_caja
  WHERE sesion_caja_id = p_sesion_caja_id
  ORDER BY secuencia DESC
  LIMIT 1;
  
  IF v_ultimo_movimiento IS NULL THEN
    -- Primer movimiento de la sesión
    v_nueva_secuencia := 1;
    v_saldo_anterior := v_sesion.monto_inicial;
  ELSE
    v_nueva_secuencia := v_ultimo_movimiento.secuencia + 1;
    v_saldo_anterior := v_ultimo_movimiento.saldo_nuevo;
  END IF;
  
  -- Calcular nuevo saldo
  v_saldo_nuevo := v_saldo_anterior + p_monto;
  
  -- Insertar movimiento
  INSERT INTO movimientos_caja (
    sesion_caja_id,
    secuencia,
    tipo_movimiento,
    monto,
    saldo_anterior,
    saldo_nuevo,
    referencia_documento,
    referencia_tipo,
    motivo,
    usuario_id,
    supervisor_id,
    timestamp,
    ip_address,
    metadata,
    tenant_id
  ) VALUES (
    p_sesion_caja_id,
    v_nueva_secuencia,
    p_tipo_movimiento,
    p_monto,
    v_saldo_anterior,
    v_saldo_nuevo,
    p_referencia_documento,
    p_referencia_tipo,
    p_motivo,
    p_usuario_id,
    p_supervisor_id,
    NOW(),
    p_ip_address,
    p_metadata,
    v_sesion.tenant_id
  ) RETURNING * INTO v_nuevo_movimiento;
  
  RETURN v_nuevo_movimiento;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION registrar_movimiento_caja IS 'Registra movimiento de caja con validación de estado, secuencia consecutiva y cuadre matemático automático';

-- =====================================================
-- 9. FUNCIÓN: Validar integridad de sesión
-- =====================================================

CREATE OR REPLACE FUNCTION validar_integridad_sesion(p_sesion_caja_id uuid)
RETURNS TABLE (
  valido boolean,
  errores text[]
) AS $$
DECLARE
  v_errores text[] := ARRAY[]::text[];
  v_sesion sesiones_caja;
  v_count_movimientos int;
  v_secuencias_consecutivas boolean;
  v_saldo_calculado numeric;
BEGIN
  SELECT * INTO v_sesion FROM sesiones_caja WHERE id = p_sesion_caja_id;
  
  IF v_sesion IS NULL THEN
    v_errores := array_append(v_errores, 'Sesión no encontrada');
    RETURN QUERY SELECT false, v_errores;
    RETURN;
  END IF;
  
  -- Validar secuencia consecutiva sin gaps
  SELECT COUNT(*) INTO v_count_movimientos
  FROM movimientos_caja
  WHERE sesion_caja_id = p_sesion_caja_id;
  
  SELECT NOT EXISTS (
    SELECT 1 FROM generate_series(1, v_count_movimientos) AS seq
    WHERE NOT EXISTS (
      SELECT 1 FROM movimientos_caja
      WHERE sesion_caja_id = p_sesion_caja_id AND secuencia = seq
    )
  ) INTO v_secuencias_consecutivas;
  
  IF NOT v_secuencias_consecutivas THEN
    v_errores := array_append(v_errores, 'Gaps detectados en secuencia de movimientos');
  END IF;
  
  -- Validar cuadre matemático
  SELECT v_sesion.monto_inicial + COALESCE(SUM(monto), 0)
  INTO v_saldo_calculado
  FROM movimientos_caja
  WHERE sesion_caja_id = p_sesion_caja_id;
  
  IF v_sesion.estado = 'CERRADA' THEN
    IF v_saldo_calculado != v_sesion.monto_esperado THEN
      v_errores := array_append(v_errores,
        format('Saldo esperado no cuadra: calculado=%s, registrado=%s',
          v_saldo_calculado, v_sesion.monto_esperado)
      );
    END IF;
  END IF;
  
  -- Retornar resultado
  RETURN QUERY SELECT (array_length(v_errores, 1) IS NULL OR array_length(v_errores, 1) = 0), v_errores;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validar_integridad_sesion IS 'Valida que no haya gaps en secuencia y que el cuadre matemático sea correcto';

-- =====================================================
-- 10. VISTA: Resumen de sesiones con totales
-- =====================================================

CREATE OR REPLACE VIEW vw_sesiones_caja_resumen AS
SELECT
  sc.id,
  sc.caja_id,
  sc.tenant_id,
  sc.usuario_id AS cajero_id,
  sc.usuario_apertura AS abierto_por,
  sc.usuario_cierre AS cerrado_por,
  sc.monto_inicial AS monto_inicio,
  sc.monto_esperado AS monto_cierre,
  sc.monto_esperado,
  sc.monto_contado,
  sc.diferencia,
  sc.estado,
  sc.congelada,
  sc.fecha_apertura AS hora_apertura,
  sc.fecha_cierre AS hora_cierre,
  sc.hash_integridad,
  COUNT(DISTINCT mc.id) AS total_movimientos,
  COALESCE(SUM(CASE WHEN mc.tipo_movimiento = 'VENTA' THEN mc.monto ELSE 0 END), 0) AS total_ventas,
  COALESCE(SUM(CASE WHEN mc.tipo_movimiento = 'RETIRO' THEN ABS(mc.monto) ELSE 0 END), 0) AS total_retiros,
  COALESCE(SUM(CASE WHEN mc.tipo_movimiento = 'INGRESO' THEN mc.monto ELSE 0 END), 0) AS total_ingresos,
  COALESCE(SUM(CASE WHEN mc.tipo_movimiento = 'AJUSTE' THEN mc.monto ELSE 0 END), 0) AS total_ajustes,
  COUNT(DISTINCT rc.id) AS cantidad_retiros,
  COUNT(DISTINCT ct.id) AS cantidad_cambios_turno
FROM sesiones_caja sc
LEFT JOIN movimientos_caja mc ON sc.id = mc.sesion_caja_id
LEFT JOIN retiros_caja rc ON sc.id = rc.sesion_caja_id
LEFT JOIN cambios_turno ct ON sc.id = ct.sesion_caja_id
GROUP BY sc.id;

COMMENT ON VIEW vw_sesiones_caja_resumen IS 'Vista con totales calculados de movimientos, retiros y cambios de turno por sesión';
