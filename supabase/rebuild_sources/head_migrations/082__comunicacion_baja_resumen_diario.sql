-- =============================================
-- Migration 082: Comunicación de Baja y Resumen Diario
-- =============================================
-- Implementa tablas para:
-- 1. Comunicación de Baja (RA-) para facturas
-- 2. Resumen Diario (RC-) para boletas
-- Según normativa SUNAT
-- =============================================

-- =============================================
-- TABLA: comunicaciones_baja
-- =============================================
-- Almacena comunicaciones de baja (RA-) para facturas
CREATE TABLE IF NOT EXISTS comunicaciones_baja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Identificación del documento RA-
  numero_comunicacion VARCHAR(50) NOT NULL, -- RA-YYYYMMDD-###
  fecha_generacion DATE NOT NULL,
  fecha_comunicacion DATE NOT NULL,
  
  -- Comprobantes incluidos
  comprobantes_ids UUID[] NOT NULL, -- Array de IDs de CPE
  cantidad_comprobantes INTEGER NOT NULL DEFAULT 0,
  
  -- Estado del proceso
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  -- PENDIENTE, GENERADO, ENVIADO, ACEPTADO, RECHAZADO, ERROR
  
  -- Datos SUNAT
  ticket_sunat VARCHAR(100),
  codigo_respuesta VARCHAR(10),
  descripcion_respuesta TEXT,
  fecha_envio TIMESTAMPTZ,
  fecha_respuesta TIMESTAMPTZ,
  
  -- XML y CDR
  xml_generado TEXT,
  xml_firmado TEXT,
  hash_xml VARCHAR(100),
  cdr_sunat TEXT,
  
  -- Auditoría
  generado_por UUID REFERENCES usuarios_sistema(id),
  enviado_por UUID REFERENCES usuarios_sistema(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT uk_comunicacion_baja_numero UNIQUE (tenant_id, numero_comunicacion),
  CONSTRAINT ck_comunicacion_baja_estado CHECK (estado IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ERROR'))
);

-- Índices
CREATE INDEX idx_comunicaciones_baja_tenant ON comunicaciones_baja(tenant_id);
CREATE INDEX idx_comunicaciones_baja_estado ON comunicaciones_baja(estado);
CREATE INDEX idx_comunicaciones_baja_fecha ON comunicaciones_baja(fecha_generacion);
CREATE INDEX idx_comunicaciones_baja_ticket ON comunicaciones_baja(ticket_sunat) WHERE ticket_sunat IS NOT NULL;

-- RLS
ALTER TABLE comunicaciones_baja ENABLE ROW LEVEL SECURITY;

CREATE POLICY comunicaciones_baja_tenant_isolation ON comunicaciones_baja
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Comentarios
COMMENT ON TABLE comunicaciones_baja IS 'Comunicaciones de baja (RA-) para anular facturas según SUNAT';
COMMENT ON COLUMN comunicaciones_baja.numero_comunicacion IS 'Número de comunicación formato RA-YYYYMMDD-###';
COMMENT ON COLUMN comunicaciones_baja.comprobantes_ids IS 'Array de UUIDs de comprobantes a dar de baja';
COMMENT ON COLUMN comunicaciones_baja.ticket_sunat IS 'Ticket de SUNAT para consulta asíncrona';

-- =============================================
-- TABLA: resumenes_diarios
-- =============================================
-- Almacena resúmenes diarios (RC-) para boletas
CREATE TABLE IF NOT EXISTS resumenes_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Identificación del documento RC-
  numero_resumen VARCHAR(50) NOT NULL, -- RC-YYYYMMDD-###
  fecha_generacion DATE NOT NULL,
  fecha_referencia DATE NOT NULL, -- Fecha de las boletas incluidas
  
  -- Comprobantes incluidos
  comprobantes_ids UUID[] NOT NULL,
  cantidad_comprobantes INTEGER NOT NULL DEFAULT 0,
  
  -- Totales
  total_gravadas DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_exoneradas DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_inafectas DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_igv DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_general DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  -- Estado del proceso
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  -- PENDIENTE, GENERADO, ENVIADO, ACEPTADO, RECHAZADO, ERROR
  
  -- Datos SUNAT
  ticket_sunat VARCHAR(100),
  codigo_respuesta VARCHAR(10),
  descripcion_respuesta TEXT,
  fecha_envio TIMESTAMPTZ,
  fecha_respuesta TIMESTAMPTZ,
  
  -- XML y CDR
  xml_generado TEXT,
  xml_firmado TEXT,
  hash_xml VARCHAR(100),
  cdr_sunat TEXT,
  
  -- Auditoría
  generado_por UUID REFERENCES usuarios_sistema(id),
  enviado_por UUID REFERENCES usuarios_sistema(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT uk_resumen_diario_numero UNIQUE (tenant_id, numero_resumen),
  CONSTRAINT ck_resumen_diario_estado CHECK (estado IN ('PENDIENTE', 'GENERADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ERROR'))
);

-- Índices
CREATE INDEX idx_resumenes_diarios_tenant ON resumenes_diarios(tenant_id);
CREATE INDEX idx_resumenes_diarios_estado ON resumenes_diarios(estado);
CREATE INDEX idx_resumenes_diarios_fecha_ref ON resumenes_diarios(fecha_referencia);
CREATE INDEX idx_resumenes_diarios_ticket ON resumenes_diarios(ticket_sunat) WHERE ticket_sunat IS NOT NULL;

-- RLS
ALTER TABLE resumenes_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY resumenes_diarios_tenant_isolation ON resumenes_diarios
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- Comentarios
COMMENT ON TABLE resumenes_diarios IS 'Resúmenes diarios (RC-) para boletas según SUNAT';
COMMENT ON COLUMN resumenes_diarios.numero_resumen IS 'Número de resumen formato RC-YYYYMMDD-###';
COMMENT ON COLUMN resumenes_diarios.fecha_referencia IS 'Fecha de emisión de las boletas incluidas';
COMMENT ON COLUMN resumenes_diarios.ticket_sunat IS 'Ticket de SUNAT para consulta asíncrona';

-- =============================================
-- TABLA: detalle_comunicacion_baja
-- =============================================
-- Detalle de comprobantes en cada comunicación de baja
CREATE TABLE IF NOT EXISTS detalle_comunicacion_baja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comunicacion_id UUID NOT NULL REFERENCES comunicaciones_baja(id) ON DELETE CASCADE,
  cpe_id UUID NOT NULL,
  
  -- Datos del comprobante
  tipo_documento VARCHAR(2) NOT NULL,
  serie VARCHAR(4) NOT NULL,
  numero INTEGER NOT NULL,
  motivo_baja TEXT NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detalle_com_baja_comunicacion ON detalle_comunicacion_baja(comunicacion_id);
CREATE INDEX idx_detalle_com_baja_cpe ON detalle_comunicacion_baja(cpe_id);

COMMENT ON TABLE detalle_comunicacion_baja IS 'Detalle de comprobantes incluidos en comunicación de baja';

-- =============================================
-- TABLA: detalle_resumen_diario
-- =============================================
-- Detalle de comprobantes en cada resumen diario
CREATE TABLE IF NOT EXISTS detalle_resumen_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resumen_id UUID NOT NULL REFERENCES resumenes_diarios(id) ON DELETE CASCADE,
  cpe_id UUID NOT NULL,
  
  -- Datos del comprobante
  tipo_documento VARCHAR(2) NOT NULL,
  serie VARCHAR(4) NOT NULL,
  numero INTEGER NOT NULL,
  tipo_operacion VARCHAR(1) NOT NULL, -- 1=Adicionar, 2=Modificar, 3=Anular
  
  -- Montos
  total_gravadas DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_exoneradas DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_inafectas DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_igv DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_detalle_resumen_resumen ON detalle_resumen_diario(resumen_id);
CREATE INDEX idx_detalle_resumen_cpe ON detalle_resumen_diario(cpe_id);

COMMENT ON TABLE detalle_resumen_diario IS 'Detalle de comprobantes incluidos en resumen diario';
COMMENT ON COLUMN detalle_resumen_diario.tipo_operacion IS '1=Adicionar, 2=Modificar, 3=Anular';

-- =============================================
-- FUNCIÓN: Generar número de comunicación de baja
-- =============================================
CREATE OR REPLACE FUNCTION generar_numero_comunicacion_baja(p_tenant_id UUID, p_fecha DATE)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fecha_str VARCHAR(8);
  v_correlativo INTEGER;
  v_numero VARCHAR(50);
BEGIN
  -- Formato: RA-YYYYMMDD-###
  v_fecha_str := TO_CHAR(p_fecha, 'YYYYMMDD');
  
  -- Obtener último correlativo del día
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(numero_comunicacion FROM 13) AS INTEGER)
  ), 0) + 1
  INTO v_correlativo
  FROM comunicaciones_baja
  WHERE tenant_id = p_tenant_id
    AND fecha_generacion = p_fecha;
  
  v_numero := 'RA-' || v_fecha_str || '-' || LPAD(v_correlativo::TEXT, 3, '0');
  
  RETURN v_numero;
END;
$$;

-- =============================================
-- FUNCIÓN: Generar número de resumen diario
-- =============================================
CREATE OR REPLACE FUNCTION generar_numero_resumen_diario(p_tenant_id UUID, p_fecha DATE)
RETURNS VARCHAR(50)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fecha_str VARCHAR(8);
  v_correlativo INTEGER;
  v_numero VARCHAR(50);
BEGIN
  -- Formato: RC-YYYYMMDD-###
  v_fecha_str := TO_CHAR(p_fecha, 'YYYYMMDD');
  
  -- Obtener último correlativo del día
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(numero_resumen FROM 13) AS INTEGER)
  ), 0) + 1
  INTO v_correlativo
  FROM resumenes_diarios
  WHERE tenant_id = p_tenant_id
    AND fecha_generacion = p_fecha;
  
  v_numero := 'RC-' || v_fecha_str || '-' || LPAD(v_correlativo::TEXT, 3, '0');
  
  RETURN v_numero;
END;
$$;

-- =============================================
-- TRIGGER: Actualizar updated_at
-- =============================================
CREATE TRIGGER trigger_comunicaciones_baja_updated_at
  BEFORE UPDATE ON comunicaciones_baja
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_resumenes_diarios_updated_at
  BEFORE UPDATE ON resumenes_diarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VERIFICACIÓN
-- =============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Migración 082 completada:';
  RAISE NOTICE '  - Tabla comunicaciones_baja creada';
  RAISE NOTICE '  - Tabla resumenes_diarios creada';
  RAISE NOTICE '  - Tablas de detalle creadas';
  RAISE NOTICE '  - Funciones de numeración creadas';
  RAISE NOTICE '  - RLS habilitado en todas las tablas';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Sistema listo para Comunicación de Baja (RA-) y Resumen Diario (RC-)';
END $$;
