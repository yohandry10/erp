-- =============================================
-- Migration 078: Fix CPE - Integridad con Documentos
-- =============================================
-- Corrige problema crítico:
-- Los CPEs se crean sin documento base en tabla documentos
-- Esto rompe la trazabilidad documental
-- =============================================

-- =============================================
-- PARTE 1: VERIFICAR Y AGREGAR COLUMNA documento_id EN cpe
-- =============================================

DO $$
BEGIN
  -- Agregar documento_id si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cpe' AND column_name = 'documento_id'
  ) THEN
    ALTER TABLE cpe ADD COLUMN documento_id uuid;
    COMMENT ON COLUMN cpe.documento_id IS 'FK al documento base en tabla documentos';
  END IF;

  -- Agregar índice
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_cpe_documento_id'
  ) THEN
    CREATE INDEX idx_cpe_documento_id ON cpe(documento_id);
  END IF;
END $$;

-- =============================================
-- PARTE 2: FUNCIÓN PARA CREAR DOCUMENTO DESDE CPE
-- =============================================

CREATE OR REPLACE FUNCTION crear_documento_desde_cpe(p_cpe_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cpe RECORD;
  v_documento_id uuid;
  v_serie_config RECORD;
BEGIN
  -- Obtener datos del CPE
  SELECT * INTO v_cpe
  FROM cpe
  WHERE id = p_cpe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CPE no encontrado: %', p_cpe_id;
  END IF;

  -- Verificar si ya tiene documento
  IF v_cpe.documento_id IS NOT NULL THEN
    RETURN v_cpe.documento_id;
  END IF;

  -- Obtener o crear configuración de serie
  SELECT * INTO v_serie_config
  FROM documento_series
  WHERE tenant_id = v_cpe.tenant_id
    AND tipo_documento = v_cpe.tipo_documento
    AND serie = v_cpe.serie
  LIMIT 1;

  -- Si no existe la serie, crearla
  IF NOT FOUND THEN
    INSERT INTO documento_series (
      tenant_id,
      tipo_documento,
      serie,
      numero_actual,
      activo
    ) VALUES (
      v_cpe.tenant_id,
      v_cpe.tipo_documento,
      v_cpe.serie,
      COALESCE(v_cpe.numero::integer, 1),
      true
    )
    RETURNING * INTO v_serie_config;
  END IF;

  -- Crear documento usando solo columnas básicas que existen en documentos
  -- Insertar solo campos mínimos necesarios
  INSERT INTO documentos (
    tenant_id,
    tipo_documento,
    serie,
    numero,
    fecha_emision,
    moneda,
    total,
    estado,
    observaciones,
    created_at
  ) VALUES (
    v_cpe.tenant_id,
    v_cpe.tipo_documento,
    v_cpe.serie,
    v_cpe.numero::text,
    COALESCE(v_cpe.fecha_emision, v_cpe.created_at::date),
    COALESCE(v_cpe.moneda, 'PEN'),
    COALESCE(v_cpe.total_venta, 0),
    CASE 
      WHEN v_cpe.sunat_status = 'ACCEPTED' THEN 'EMITIDO'
      WHEN v_cpe.sunat_status = 'REJECTED' THEN 'ANULADO'
      WHEN v_cpe.estado = 'ACEPTADO' THEN 'EMITIDO'
      WHEN v_cpe.estado = 'RECHAZADO' THEN 'ANULADO'
      ELSE 'BORRADOR'
    END,
    format('Documento creado desde CPE %s - Cliente: %s', 
      v_cpe.id, 
      COALESCE(v_cpe.razon_social_receptor, 'N/A')
    ),
    v_cpe.created_at
  )
  RETURNING id INTO v_documento_id;

  -- Actualizar CPE con documento_id
  UPDATE cpe
  SET documento_id = v_documento_id
  WHERE id = p_cpe_id;

  RETURN v_documento_id;
END;
$$;

COMMENT ON FUNCTION crear_documento_desde_cpe(uuid) IS 
  'Crea un documento en tabla documentos a partir de un CPE existente';

-- =============================================
-- PARTE 3: FUNCIÓN PARA MIGRAR TODOS LOS CPEs
-- =============================================

CREATE OR REPLACE FUNCTION migrar_cpes_a_documentos()
RETURNS TABLE(
  cpes_procesados integer,
  documentos_creados integer,
  errores text[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cpe RECORD;
  v_cpes_count integer := 0;
  v_docs_count integer := 0;
  v_errores text[] := ARRAY[]::text[];
  v_documento_id uuid;
BEGIN
  -- Iterar sobre CPEs sin documento_id
  FOR v_cpe IN 
    SELECT id, serie, numero, tipo_documento
    FROM cpe
    WHERE documento_id IS NULL
    ORDER BY created_at
  LOOP
    BEGIN
      v_cpes_count := v_cpes_count + 1;
      
      -- Crear documento desde CPE
      v_documento_id := crear_documento_desde_cpe(v_cpe.id);
      
      IF v_documento_id IS NOT NULL THEN
        v_docs_count := v_docs_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_errores := array_append(v_errores, 
        format('Error en CPE %s (%s-%s): %s', 
          v_cpe.id, v_cpe.serie, v_cpe.numero, SQLERRM)
      );
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_cpes_count, v_docs_count, v_errores;
END;
$$;

COMMENT ON FUNCTION migrar_cpes_a_documentos() IS 
  'Migra todos los CPEs existentes creando sus documentos base';

-- =============================================
-- PARTE 4: TRIGGER PARA CREAR DOCUMENTO AUTOMÁTICAMENTE
-- =============================================

CREATE OR REPLACE FUNCTION trigger_crear_documento_para_cpe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_documento_id uuid;
BEGIN
  -- Solo crear documento si no tiene uno asignado
  IF NEW.documento_id IS NULL THEN
    BEGIN
      v_documento_id := crear_documento_desde_cpe(NEW.id);
      NEW.documento_id := v_documento_id;
    EXCEPTION WHEN OTHERS THEN
      -- Log error pero no bloquear la inserción del CPE
      RAISE WARNING 'No se pudo crear documento para CPE %: %', NEW.id, SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger (solo si no existe)
DROP TRIGGER IF EXISTS trigger_cpe_crear_documento ON cpe;
CREATE TRIGGER trigger_cpe_crear_documento
  AFTER INSERT ON cpe
  FOR EACH ROW
  EXECUTE FUNCTION trigger_crear_documento_para_cpe();

COMMENT ON FUNCTION trigger_crear_documento_para_cpe() IS 
  'Trigger que crea automáticamente un documento cuando se inserta un CPE';

-- =============================================
-- PARTE 5: VISTA DE AUDITORÍA CPE-DOCUMENTOS
-- =============================================

-- Vista de auditoría usando solo columnas que existen en ambas tablas
CREATE OR REPLACE VIEW vw_cpe_documentos_auditoria AS
SELECT 
  c.id as cpe_id,
  c.tenant_id,
  c.tipo_documento,
  c.serie,
  c.numero,
  c.razon_social_receptor as cpe_cliente,
  c.total_venta as cpe_total,
  c.estado as cpe_estado,
  c.sunat_status as cpe_sunat_status,
  c.documento_id,
  c.created_at as cpe_created_at,
  d.id as documento_existe,
  d.estado as documento_estado,
  d.created_at as documento_created_at,
  CASE 
    WHEN c.documento_id IS NOT NULL AND d.id IS NOT NULL THEN '✅ VINCULADO'
    WHEN c.documento_id IS NOT NULL AND d.id IS NULL THEN '❌ DOCUMENTO PERDIDO'
    WHEN c.documento_id IS NULL THEN '⚠️ SIN DOCUMENTO'
    ELSE '❓ DESCONOCIDO'
  END as estado_integridad
FROM cpe c
LEFT JOIN documentos d ON d.id = c.documento_id
ORDER BY c.created_at DESC;

COMMENT ON VIEW vw_cpe_documentos_auditoria IS 
  'Vista de auditoría que muestra la integridad entre CPEs y documentos';

-- =============================================
-- PARTE 6: FUNCIÓN DE DIAGNÓSTICO
-- =============================================

CREATE OR REPLACE FUNCTION diagnostico_cpe_documentos()
RETURNS TABLE(
  metrica text,
  valor text,
  estado text
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Total CPEs
  RETURN QUERY
  SELECT 
    'Total CPEs'::text,
    COUNT(*)::text,
    '📊 INFO'::text
  FROM cpe;

  -- CPEs con documento
  RETURN QUERY
  SELECT 
    'CPEs con Documento'::text,
    COUNT(*)::text,
    CASE 
      WHEN COUNT(*) > 0 THEN '✅ OK'
      ELSE '⚠️ NINGUNO'
    END::text
  FROM cpe
  WHERE documento_id IS NOT NULL;

  -- CPEs sin documento
  RETURN QUERY
  SELECT 
    'CPEs sin Documento'::text,
    COUNT(*)::text,
    CASE 
      WHEN COUNT(*) = 0 THEN '✅ OK'
      ELSE '❌ MIGRAR'
    END::text
  FROM cpe
  WHERE documento_id IS NULL;

  -- Total documentos
  RETURN QUERY
  SELECT 
    'Total Documentos'::text,
    COUNT(*)::text,
    CASE 
      WHEN COUNT(*) > 0 THEN '✅ OK'
      ELSE '⚠️ VACÍO'
    END::text
  FROM documentos;

  -- Documentos vinculados a CPE
  RETURN QUERY
  SELECT 
    'Documentos con CPE'::text,
    COUNT(DISTINCT d.id)::text,
    '📊 INFO'::text
  FROM documentos d
  INNER JOIN cpe c ON c.documento_id = d.id;

  -- Integridad
  RETURN QUERY
  SELECT 
    'Integridad CPE-Documento'::text,
    CASE 
      WHEN COUNT(*) FILTER (WHERE documento_id IS NULL) = 0 THEN '100%'
      ELSE ROUND(
        (COUNT(*) FILTER (WHERE documento_id IS NOT NULL)::numeric / COUNT(*)::numeric) * 100, 
        2
      )::text || '%'
    END,
    CASE 
      WHEN COUNT(*) FILTER (WHERE documento_id IS NULL) = 0 THEN '✅ PERFECTO'
      WHEN COUNT(*) FILTER (WHERE documento_id IS NOT NULL)::numeric / COUNT(*)::numeric > 0.8 THEN '⚠️ BUENO'
      ELSE '❌ CRÍTICO'
    END::text
  FROM cpe;

END;
$$;

COMMENT ON FUNCTION diagnostico_cpe_documentos() IS 
  'Diagnóstico de integridad entre CPEs y documentos';

-- =============================================
-- PARTE 7: ÍNDICES ADICIONALES
-- =============================================

-- Índice en documentos por tipo, serie, numero
CREATE INDEX IF NOT EXISTS idx_documentos_tipo_serie_numero 
  ON documentos(tenant_id, tipo_documento, serie, numero);

-- Índice en cpe por tipo, serie, numero
CREATE INDEX IF NOT EXISTS idx_cpe_tipo_serie_numero 
  ON cpe(tenant_id, tipo_documento, serie, numero);

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

-- Mostrar diagnóstico
SELECT * FROM diagnostico_cpe_documentos();

-- Mostrar resumen
DO $$
DECLARE
  v_cpes_sin_doc integer;
BEGIN
  SELECT COUNT(*) INTO v_cpes_sin_doc
  FROM cpe
  WHERE documento_id IS NULL;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Migración 078 completada:';
  RAISE NOTICE '  1. Columna documento_id agregada a cpe';
  RAISE NOTICE '  2. Función crear_documento_desde_cpe() creada';
  RAISE NOTICE '  3. Función migrar_cpes_a_documentos() creada';
  RAISE NOTICE '  4. Trigger automático creado';
  RAISE NOTICE '  5. Vista de auditoría creada';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️ CPEs sin documento: %', v_cpes_sin_doc;
  RAISE NOTICE '';
  RAISE NOTICE '📝 Para migrar CPEs existentes ejecutar:';
  RAISE NOTICE '   SELECT * FROM migrar_cpes_a_documentos();';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Para ver auditoría ejecutar:';
  RAISE NOTICE '   SELECT * FROM vw_cpe_documentos_auditoria;';
END $$;
