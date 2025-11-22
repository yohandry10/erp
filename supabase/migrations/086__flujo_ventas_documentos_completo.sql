-- =============================================
-- Migration 086: Flujo completo Ventas → Documentos → CPE → CxC → Contabilidad
-- =============================================
-- Descripción: Agrega campos faltantes para conectar el flujo completo
-- Fecha: 2025-01-20
-- =============================================

-- =============================================
-- 1. AGREGAR CAMPOS DE RELACIÓN
-- =============================================

-- pedidos_venta.factura_id (referencia al documento generado)
ALTER TABLE pedidos_venta ADD COLUMN IF NOT EXISTS factura_id UUID REFERENCES documentos(id) ON DELETE SET NULL;
COMMENT ON COLUMN pedidos_venta.factura_id IS 'Referencia al documento fiscal generado desde este pedido';

-- documentos.pedido_id (referencia al pedido origen)
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES pedidos_venta(id) ON DELETE SET NULL;
COMMENT ON COLUMN documentos.pedido_id IS 'Referencia al pedido de venta que originó este documento';

-- cpe.documento_id (referencia al documento fiscal)
ALTER TABLE cpe ADD COLUMN IF NOT EXISTS documento_id UUID REFERENCES documentos(id) ON DELETE SET NULL;
COMMENT ON COLUMN cpe.documento_id IS 'Referencia al documento fiscal asociado a este CPE';

-- cuentas_por_cobrar.documento_id (ya existe según el código, pero verificamos)
ALTER TABLE cuentas_por_cobrar ADD COLUMN IF NOT EXISTS documento_id UUID REFERENCES documentos(id) ON DELETE SET NULL;
COMMENT ON COLUMN cuentas_por_cobrar.documento_id IS 'Referencia al documento fiscal que originó esta cuenta por cobrar';

-- =============================================
-- 2. CREAR ÍNDICES PARA PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_pedidos_venta_factura_id 
  ON pedidos_venta(factura_id) WHERE factura_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_pedido_id 
  ON documentos(pedido_id) WHERE pedido_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cpe_documento_id 
  ON cpe(documento_id) WHERE documento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_por_cobrar_documento_id 
  ON cuentas_por_cobrar(documento_id) WHERE documento_id IS NOT NULL;

-- =============================================
-- 3. FUNCIÓN PARA OBTENER Y ACTUALIZAR NÚMERO DE SERIE
-- =============================================

CREATE OR REPLACE FUNCTION obtener_siguiente_numero_documento(
  p_tenant_id UUID,
  p_tipo_documento VARCHAR,
  p_serie VARCHAR
) RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
  v_numero_actual INTEGER;
  v_siguiente_numero VARCHAR;
BEGIN
  -- Obtener y bloquear la serie para evitar concurrencia
  SELECT correlativo_actual INTO v_numero_actual
  FROM documento_series
  WHERE tenant_id = p_tenant_id
    AND tipo_documento = p_tipo_documento
    AND serie = p_serie
    AND activo = true
  FOR UPDATE;

  -- Si no existe la serie, crearla
  IF v_numero_actual IS NULL THEN
    INSERT INTO documento_series (
      tenant_id,
      tipo_documento,
      serie,
      correlativo_actual,
      correlativo_maximo,
      activo
    ) VALUES (
      p_tenant_id,
      p_tipo_documento,
      p_serie,
      1,
      99999999,
      true
    );
    v_numero_actual := 1;
  ELSE
    -- Incrementar el correlativo
    v_numero_actual := v_numero_actual + 1;
    
    UPDATE documento_series
    SET correlativo_actual = v_numero_actual,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND tipo_documento = p_tipo_documento
      AND serie = p_serie;
  END IF;

  -- Formatear el número con ceros a la izquierda (8 dígitos)
  v_siguiente_numero := LPAD(v_numero_actual::TEXT, 8, '0');

  RETURN v_siguiente_numero;
END;
$$;

COMMENT ON FUNCTION obtener_siguiente_numero_documento IS 
  'Obtiene el siguiente número de serie para un documento fiscal con lock para evitar duplicados';

-- =============================================
-- 4. TABLA DE PLANTILLAS CONTABLES POR PAÍS (OPCIONAL)
-- =============================================

CREATE TABLE IF NOT EXISTS plantillas_asientos_ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID,
  pais_id INTEGER NOT NULL REFERENCES paises(id),
  tipo_documento VARCHAR(10) NOT NULL,
  cuenta_debe_codigo VARCHAR(20) NOT NULL,
  cuenta_haber_ventas_codigo VARCHAR(20) NOT NULL,
  cuenta_haber_impuesto_codigo VARCHAR(20) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar tenant_id si la tabla ya existe pero no tiene la columna
ALTER TABLE plantillas_asientos_ventas ADD COLUMN IF NOT EXISTS tenant_id UUID;

COMMENT ON TABLE plantillas_asientos_ventas IS 
  'Plantillas de asientos contables para ventas según país y tipo de documento';

-- Índices para plantillas
CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_pais 
  ON plantillas_asientos_ventas(pais_id, tipo_documento) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_tenant 
  ON plantillas_asientos_ventas(tenant_id) WHERE activo = true AND tenant_id IS NOT NULL;

-- Constraint único para plantillas globales (tenant_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_global_unique
  ON plantillas_asientos_ventas(pais_id, tipo_documento)
  WHERE tenant_id IS NULL AND activo = true;

-- Constraint único para plantillas por tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_tenant_unique
  ON plantillas_asientos_ventas(tenant_id, pais_id, tipo_documento)
  WHERE tenant_id IS NOT NULL AND activo = true;

-- RLS para plantillas
ALTER TABLE plantillas_asientos_ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plantillas_asientos_ventas_tenant_isolation" ON plantillas_asientos_ventas;
CREATE POLICY "plantillas_asientos_ventas_tenant_isolation"
  ON plantillas_asientos_ventas FOR ALL
  USING (
    tenant_id IS NULL OR 
    tenant_id = current_setting('app.current_tenant_id', true)::uuid OR 
    current_setting('app.is_superadmin', true)::boolean = true
  )
  WITH CHECK (
    tenant_id IS NULL OR 
    tenant_id = current_setting('app.current_tenant_id', true)::uuid OR 
    current_setting('app.is_superadmin', true)::boolean = true
  );

-- =============================================
-- 5. SEED DE PLANTILLAS CONTABLES
-- =============================================

-- Plantillas para Perú (IGV 18%)
INSERT INTO plantillas_asientos_ventas (
  pais_id, 
  tipo_documento, 
  cuenta_debe_codigo, 
  cuenta_haber_ventas_codigo, 
  cuenta_haber_impuesto_codigo,
  descripcion
)
SELECT 
  p.id,
  tipo,
  '12',
  '70',
  '40',
  'Plantilla de asiento para ' || 
  CASE tipo 
    WHEN '01' THEN 'Facturas' 
    WHEN '03' THEN 'Boletas' 
  END || ' en Perú'
FROM paises p
CROSS JOIN (VALUES ('01'), ('03')) AS tipos(tipo)
WHERE p.codigo_iso = 'PE'
  AND NOT EXISTS (
    SELECT 1 FROM plantillas_asientos_ventas 
    WHERE pais_id = p.id 
      AND tipo_documento = tipo 
      AND tenant_id IS NULL
  );

-- Plantillas para Colombia (IVA 19%)
INSERT INTO plantillas_asientos_ventas (
  pais_id, 
  tipo_documento, 
  cuenta_debe_codigo, 
  cuenta_haber_ventas_codigo, 
  cuenta_haber_impuesto_codigo,
  descripcion
)
SELECT 
  p.id,
  tipo,
  '13',
  '41',
  '2408',
  'Plantilla de asiento para ' || 
  CASE tipo 
    WHEN '01' THEN 'Facturas' 
    WHEN '03' THEN 'Documentos equivalentes' 
  END || ' en Colombia'
FROM paises p
CROSS JOIN (VALUES ('01'), ('03')) AS tipos(tipo)
WHERE p.codigo_iso = 'CO'
  AND NOT EXISTS (
    SELECT 1 FROM plantillas_asientos_ventas 
    WHERE pais_id = p.id 
      AND tipo_documento = tipo 
      AND tenant_id IS NULL
  );

-- Plantillas para Chile (IVA 19%)
INSERT INTO plantillas_asientos_ventas (
  pais_id, 
  tipo_documento, 
  cuenta_debe_codigo, 
  cuenta_haber_ventas_codigo, 
  cuenta_haber_impuesto_codigo,
  descripcion
)
SELECT 
  p.id,
  tipo,
  '11201',
  '41101',
  '21401',
  'Plantilla de asiento para ' || 
  CASE tipo 
    WHEN '01' THEN 'Facturas' 
    WHEN '03' THEN 'Boletas' 
  END || ' en Chile'
FROM paises p
CROSS JOIN (VALUES ('01'), ('03')) AS tipos(tipo)
WHERE p.codigo_iso = 'CL'
  AND NOT EXISTS (
    SELECT 1 FROM plantillas_asientos_ventas 
    WHERE pais_id = p.id 
      AND tipo_documento = tipo 
      AND tenant_id IS NULL
  );

-- Plantillas para México (IVA 16%)
INSERT INTO plantillas_asientos_ventas (
  pais_id, 
  tipo_documento, 
  cuenta_debe_codigo, 
  cuenta_haber_ventas_codigo, 
  cuenta_haber_impuesto_codigo,
  descripcion
)
SELECT 
  p.id,
  tipo,
  '105',
  '401',
  '208',
  'Plantilla de asiento para ' || 
  CASE tipo 
    WHEN '01' THEN 'Facturas' 
    WHEN '03' THEN 'Notas de venta' 
  END || ' en México'
FROM paises p
CROSS JOIN (VALUES ('01'), ('03')) AS tipos(tipo)
WHERE p.codigo_iso = 'MX'
  AND NOT EXISTS (
    SELECT 1 FROM plantillas_asientos_ventas 
    WHERE pais_id = p.id 
      AND tipo_documento = tipo 
      AND tenant_id IS NULL
  );

-- =============================================
-- 6. COMENTARIOS Y DOCUMENTACIÓN
-- =============================================

COMMENT ON COLUMN pedidos_venta.factura_id IS 
  'UUID del documento fiscal generado. Se actualiza cuando se genera la factura/boleta desde el pedido';

COMMENT ON COLUMN documentos.pedido_id IS 
  'UUID del pedido de venta origen. Permite rastrear qué pedido generó este documento';

COMMENT ON COLUMN cpe.documento_id IS 
  'UUID del documento fiscal. Conecta el CPE con el documento en la tabla documentos';

COMMENT ON FUNCTION obtener_siguiente_numero_documento IS 
  'Función thread-safe para obtener el siguiente número de serie. Usa SELECT FOR UPDATE para evitar race conditions';
