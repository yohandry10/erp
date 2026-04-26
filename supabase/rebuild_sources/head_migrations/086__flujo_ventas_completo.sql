-- =============================================
-- Migración 086: Flujo completo de ventas
-- Añade columnas de enlace entre pedidos, documentos, CPE y CxC
-- Crea tabla de plantillas contables y función para numeración segura
-- =============================================

-- 1. Enlaces pedidos -> documentos
ALTER TABLE pedidos_venta
ADD COLUMN IF NOT EXISTS factura_id UUID REFERENCES documentos(id) ON DELETE SET NULL;

ALTER TABLE documentos
ADD COLUMN IF NOT EXISTS pedido_id UUID REFERENCES pedidos_venta(id) ON DELETE SET NULL;

ALTER TABLE cpe
ADD COLUMN IF NOT EXISTS documento_id UUID REFERENCES documentos(id) ON DELETE CASCADE;

ALTER TABLE cuentas_por_cobrar
ADD COLUMN IF NOT EXISTS documento_id UUID REFERENCES documentos(id) ON DELETE CASCADE;

-- 2. Índices para nuevas FK
CREATE INDEX IF NOT EXISTS idx_documentos_pedido_id
  ON documentos(pedido_id);

CREATE INDEX IF NOT EXISTS idx_cpe_documento_id
  ON cpe(documento_id);

CREATE INDEX IF NOT EXISTS idx_cxc_documento_id
  ON cuentas_por_cobrar(documento_id);

-- 3. Tabla de plantillas contables por país
CREATE TABLE IF NOT EXISTS plantillas_asientos_ventas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pais_id INTEGER NOT NULL REFERENCES paises(id),
  tipo_documento VARCHAR(10) NOT NULL,
  cuenta_debe_codigo VARCHAR(20) NOT NULL,
  cuenta_haber_ventas_codigo VARCHAR(20) NOT NULL,
  cuenta_haber_impuesto_codigo VARCHAR(20) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pais_id, tipo_documento)
);

COMMENT ON TABLE plantillas_asientos_ventas IS 'Plantillas contables de venta por país y tipo de documento';

-- 3.1 Seeds Perú (IGV 18%)
WITH pais AS (
  SELECT id FROM paises WHERE codigo_iso = 'PE' LIMIT 1
)
INSERT INTO plantillas_asientos_ventas (
  pais_id,
  tipo_documento,
  cuenta_debe_codigo,
  cuenta_haber_ventas_codigo,
  cuenta_haber_impuesto_codigo,
  descripcion
)
SELECT
  pais.id,
  plantilla.tipo_documento,
  '12',
  '70',
  '40',
  CONCAT('Plantilla ventas Perú ', CASE plantilla.tipo_documento WHEN '01' THEN 'Factura' ELSE 'Boleta' END)
FROM pais
CROSS JOIN (VALUES ('01'), ('03')) AS plantilla(tipo_documento)
WHERE pais.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM plantillas_asientos_ventas pav
    WHERE pav.pais_id = pais.id
      AND pav.tipo_documento = plantilla.tipo_documento
  );

-- 3.2 Seeds Colombia (IVA 19%)
WITH pais AS (
  SELECT id FROM paises WHERE codigo_iso = 'CO' LIMIT 1
)
INSERT INTO plantillas_asientos_ventas (
  pais_id,
  tipo_documento,
  cuenta_debe_codigo,
  cuenta_haber_ventas_codigo,
  cuenta_haber_impuesto_codigo,
  descripcion
)
SELECT
  pais.id,
  plantilla.tipo_documento,
  '13',
  '41',
  '2408',
  CONCAT('Plantilla ventas Colombia ', CASE plantilla.tipo_documento WHEN '01' THEN 'Factura' ELSE 'Boleta' END)
FROM pais
CROSS JOIN (VALUES ('01'), ('03')) AS plantilla(tipo_documento)
WHERE pais.id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM plantillas_asientos_ventas pav
    WHERE pav.pais_id = pais.id
      AND pav.tipo_documento = plantilla.tipo_documento
  );

-- 4. Función para obtener/incrementar correlativo con bloqueo
CREATE OR REPLACE FUNCTION obtener_siguiente_numero_documento(
  p_tenant_id UUID,
  p_tipo_documento VARCHAR,
  p_serie VARCHAR
)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
  v_serie RECORD;
  v_correlativo BIGINT;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID requerido para numeración de documentos';
  END IF;

  SELECT id,
         COALESCE(correlativo_actual, 0) AS correlativo_actual,
         correlativo_maximo
  INTO v_serie
  FROM documento_series
  WHERE tenant_id = p_tenant_id
    AND tipo_documento = p_tipo_documento
    AND serie = p_serie
    AND activo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe serie activa % para el tipo % y tenant %', p_serie, p_tipo_documento, p_tenant_id;
  END IF;

  IF v_serie.correlativo_maximo IS NOT NULL
     AND v_serie.correlativo_actual + 1 > v_serie.correlativo_maximo THEN
    RAISE EXCEPTION 'La serie % alcanzó el correlativo máximo configurado', p_serie;
  END IF;

  UPDATE documento_series
  SET correlativo_actual = v_serie.correlativo_actual + 1,
      updated_at = NOW()
  WHERE id = v_serie.id
  RETURNING correlativo_actual INTO v_correlativo;

  RETURN LPAD(v_correlativo::text, 8, '0');
END;
$$;

COMMENT ON FUNCTION obtener_siguiente_numero_documento(UUID, VARCHAR, VARCHAR) IS
  'Obtiene el siguiente número correlativo de una serie de documentos aplicando bloqueo pesimista';
