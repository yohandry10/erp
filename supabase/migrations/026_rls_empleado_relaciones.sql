-- Migration 026: Aplicar RLS a tablas de relación empleado_*
-- Fecha: 2025-10-23
-- Descripción: Implementa RLS en las 5 tablas de relación del módulo RRHH
-- Fase 1: Seguridad Multi-Tenant - Tablas de Relación Empleado

BEGIN;

-- =====================================================
-- MÓDULO RRHH - TABLAS DE RELACIÓN (5 TABLAS)
-- =====================================================

-- Aplicar RLS a las tablas de relación del módulo RRHH
-- Estas son tablas que vinculan empleados con otras entidades
-- Incluye: empleado_beneficios, empleado_capacitaciones, empleado_horarios,
--          empleado_planilla_conceptos, expediente_documentos

DO $$
BEGIN
  RAISE NOTICE '=== INICIANDO APLICACIÓN DE RLS EN TABLAS DE RELACIÓN EMPLEADO_* ===';
  
  -- Tabla 1: empleado_beneficios
  -- Tabla de relación que vincula empleados con beneficios asignados
  RAISE NOTICE 'Procesando tabla de relación: empleado_beneficios';
  PERFORM add_tenant_id_if_missing('empleado_beneficios');
  PERFORM enable_rls_tenant_isolation('empleado_beneficios');
  
  -- Tabla 2: empleado_capacitaciones
  -- Tabla de relación que vincula empleados con capacitaciones recibidas
  RAISE NOTICE 'Procesando tabla de relación: empleado_capacitaciones';
  PERFORM add_tenant_id_if_missing('empleado_capacitaciones');
  PERFORM enable_rls_tenant_isolation('empleado_capacitaciones');
  
  -- Tabla 3: empleado_horarios
  -- Tabla de relación que vincula empleados con horarios de trabajo
  RAISE NOTICE 'Procesando tabla de relación: empleado_horarios';
  PERFORM add_tenant_id_if_missing('empleado_horarios');
  PERFORM enable_rls_tenant_isolation('empleado_horarios');
  
  -- Tabla 4: empleado_planilla_conceptos
  -- Tabla de relación que vincula empleados con conceptos de planilla
  RAISE NOTICE 'Procesando tabla de relación: empleado_planilla_conceptos';
  PERFORM add_tenant_id_if_missing('empleado_planilla_conceptos');
  PERFORM enable_rls_tenant_isolation('empleado_planilla_conceptos');
  
  -- Tabla 5: expediente_documentos
  -- Tabla de relación que vincula empleados con documentos de expediente
  RAISE NOTICE 'Procesando tabla de relación: expediente_documentos';
  PERFORM add_tenant_id_if_missing('expediente_documentos');
  PERFORM enable_rls_tenant_isolation('expediente_documentos');
  
  RAISE NOTICE '=== RLS APLICADO EXITOSAMENTE EN 5 TABLAS DE RELACIÓN EMPLEADO_* ===';
END
$$;

-- Comentarios descriptivos para las tablas de relación
COMMENT ON TABLE empleado_beneficios IS 'Relación empleado-beneficios por tenant - RLS habilitado';
COMMENT ON TABLE empleado_capacitaciones IS 'Relación empleado-capacitaciones por tenant - RLS habilitado';
COMMENT ON TABLE empleado_horarios IS 'Relación empleado-horarios por tenant - RLS habilitado';
COMMENT ON TABLE empleado_planilla_conceptos IS 'Relación empleado-conceptos planilla por tenant - RLS habilitado';
COMMENT ON TABLE expediente_documentos IS 'Documentos de expediente por tenant - RLS habilitado';

-- =====================================================
-- VALIDACIÓN: TABLAS DE RELACIÓN EMPLEADO_*
-- =====================================================

-- Validar que las tablas de relación tienen RLS correctamente configurado
-- y que mantienen integridad referencial con las tablas relacionadas

DO $$
DECLARE
  table_name text;
  row_count integer;
  null_tenant_count integer;
  fk_info record;
  fk_count integer := 0;
BEGIN
  RAISE NOTICE '=== INICIANDO VALIDACIÓN DE TABLAS DE RELACIÓN EMPLEADO_* ===';
  
  -- Array de tablas de relación empleado_*
  FOR table_name IN 
    SELECT unnest(ARRAY[
      'empleado_beneficios',
      'empleado_capacitaciones',
      'empleado_horarios',
      'empleado_planilla_conceptos',
      'expediente_documentos'
    ])
  LOOP
    RAISE NOTICE '--- Validando tabla de relación: % ---', table_name;
    
    -- 1. Verificar cantidad de registros existentes
    EXECUTE format('SELECT COUNT(*) FROM %I', table_name) INTO row_count;
    RAISE NOTICE 'Total de registros en %: %', table_name, row_count;
    
    -- 2. Verificar registros con tenant_id NULL (no debería haber)
    EXECUTE format(
      'SELECT COUNT(*) FROM %I WHERE tenant_id IS NULL',
      table_name
    ) INTO null_tenant_count;
    
    IF null_tenant_count > 0 THEN
      RAISE WARNING 'ATENCIÓN: % tiene % registros con tenant_id NULL', 
        table_name, null_tenant_count;
      RAISE NOTICE 'ACCIÓN REQUERIDA: Ejecutar backfill de tenant_id para registros existentes';
    ELSE
      RAISE NOTICE '✓ Todos los registros en % tienen tenant_id asignado', table_name;
    END IF;
    
    -- 3. Verificar que RLS está habilitado
    IF EXISTS (
      SELECT 1 FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename = table_name 
        AND rowsecurity = true
    ) THEN
      RAISE NOTICE '✓ RLS habilitado en %', table_name;
    ELSE
      RAISE WARNING 'ATENCIÓN: RLS NO está habilitado en %', table_name;
    END IF;
    
    -- 4. Verificar que existe la política tenant_isolation
    IF EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
        AND tablename = table_name 
        AND policyname = table_name || '_tenant_isolation'
    ) THEN
      RAISE NOTICE '✓ Política tenant_isolation existe en %', table_name;
    ELSE
      RAISE WARNING 'ATENCIÓN: Política tenant_isolation NO existe en %', table_name;
    END IF;
    
    -- 5. Verificar que existe índice en tenant_id
    IF EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename = table_name 
        AND indexname LIKE '%tenant_id%'
    ) THEN
      RAISE NOTICE '✓ Índice tenant_id existe en %', table_name;
    ELSE
      RAISE WARNING 'ATENCIÓN: Índice tenant_id NO existe en %', table_name;
    END IF;
    
  END LOOP;
  
  -- 6. Validar relaciones FK que involucran tablas de relación empleado_*
  -- Esto es crítico porque estas tablas conectan empleados con otras entidades
  RAISE NOTICE '--- Validando relaciones FK de tablas de relación empleado_* ---';
  
  FOR fk_info IN
    SELECT
      tc.table_name AS tabla_origen,
      kcu.column_name AS columna_fk,
      ccu.table_name AS tabla_referenciada,
      ccu.column_name AS columna_referenciada,
      tc.constraint_name AS nombre_constraint
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND (
        tc.table_name IN (
          'empleado_beneficios',
          'empleado_capacitaciones',
          'empleado_horarios',
          'empleado_planilla_conceptos',
          'expediente_documentos'
        )
        OR ccu.table_name IN (
          'empleado_beneficios',
          'empleado_capacitaciones',
          'empleado_horarios',
          'empleado_planilla_conceptos',
          'expediente_documentos'
        )
      )
    ORDER BY tc.table_name, ccu.table_name
  LOOP
    fk_count := fk_count + 1;
    RAISE NOTICE 'FK #%: %.% -> %.% (%)',
      fk_count,
      fk_info.tabla_origen,
      fk_info.columna_fk,
      fk_info.tabla_referenciada,
      fk_info.columna_referenciada,
      fk_info.nombre_constraint;
  END LOOP;
  
  IF fk_count = 0 THEN
    RAISE NOTICE 'No se encontraron relaciones FK para las tablas de relación empleado_*';
  ELSE
    RAISE NOTICE 'Total de relaciones FK encontradas: %', fk_count;
    RAISE NOTICE 'IMPORTANTE: Verificar que las tablas relacionadas también tengan RLS habilitado';
  END IF;
  
  RAISE NOTICE '=== VALIDACIÓN DE TABLAS DE RELACIÓN EMPLEADO_* COMPLETADA ===';
  RAISE NOTICE 'Revisar los mensajes de WARNING arriba si los hay';
  
END
$$;

-- Crear vista de resumen de RLS para tablas de relación empleado_*
CREATE OR REPLACE VIEW v_rls_status_empleado_relaciones AS
SELECT 
  t.tablename,
  t.rowsecurity AS rls_habilitado,
  COUNT(DISTINCT p.policyname) AS num_politicas,
  COUNT(DISTINCT i.indexname) FILTER (WHERE i.indexname LIKE '%tenant_id%') AS tiene_indice_tenant,
  pg_size_pretty(pg_total_relation_size(t.schemaname||'.'||t.tablename)) AS tamaño_tabla,
  (
    SELECT COUNT(*) 
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = t.tablename
      AND tc.constraint_type = 'FOREIGN KEY'
  ) AS num_fk_salientes
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
LEFT JOIN pg_indexes i ON i.tablename = t.tablename AND i.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'empleado_beneficios',
    'empleado_capacitaciones',
    'empleado_horarios',
    'empleado_planilla_conceptos',
    'expediente_documentos'
  )
GROUP BY t.schemaname, t.tablename, t.rowsecurity
ORDER BY t.tablename;

COMMENT ON VIEW v_rls_status_empleado_relaciones IS 
  'Vista de resumen del estado de RLS en tablas de relación empleado_* con información de relaciones FK';

-- Consulta de ejemplo para verificar el estado
-- SELECT * FROM v_rls_status_empleado_relaciones;

-- =====================================================
-- VALIDACIÓN ESPECÍFICA: INTEGRIDAD REFERENCIAL
-- =====================================================

-- Validar que las relaciones entre empleados y otras entidades
-- mantienen consistencia de tenant_id

DO $$
BEGIN
  RAISE NOTICE '=== VALIDACIÓN ESPECÍFICA: INTEGRIDAD REFERENCIAL EMPLEADO_* ===';
  
  -- Verificar que todas las tablas de relación tienen RLS habilitado
  RAISE NOTICE '--- Verificando RLS en tablas de relación ---';
  
  -- 1. empleado_beneficios
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename = 'empleado_beneficios' 
      AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ empleado_beneficios: RLS habilitado';
  ELSE
    RAISE WARNING '✗ empleado_beneficios: RLS NO habilitado';
  END IF;
  
  -- 2. empleado_capacitaciones
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename = 'empleado_capacitaciones' 
      AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ empleado_capacitaciones: RLS habilitado';
  ELSE
    RAISE WARNING '✗ empleado_capacitaciones: RLS NO habilitado';
  END IF;
  
  -- 3. empleado_horarios
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename = 'empleado_horarios' 
      AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ empleado_horarios: RLS habilitado';
  ELSE
    RAISE WARNING '✗ empleado_horarios: RLS NO habilitado';
  END IF;
  
  -- 4. empleado_planilla_conceptos
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename = 'empleado_planilla_conceptos' 
      AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ empleado_planilla_conceptos: RLS habilitado';
  ELSE
    RAISE WARNING '✗ empleado_planilla_conceptos: RLS NO habilitado';
  END IF;
  
  -- 5. expediente_documentos
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename = 'expediente_documentos' 
      AND rowsecurity = true
  ) THEN
    RAISE NOTICE '✓ expediente_documentos: RLS habilitado';
  ELSE
    RAISE WARNING '✗ expediente_documentos: RLS NO habilitado';
  END IF;
  
  RAISE NOTICE '=== VALIDACIÓN DE INTEGRIDAD REFERENCIAL COMPLETADA ===';
  RAISE NOTICE '';
  RAISE NOTICE 'PRÓXIMOS PASOS:';
  RAISE NOTICE '1. Probar asignación de beneficios a empleados';
  RAISE NOTICE '2. Verificar que solo se ven relaciones del tenant actual';
  RAISE NOTICE '3. Probar asignación de horarios a empleados';
  RAISE NOTICE '4. Validar flujo de planillas con conceptos';
  RAISE NOTICE '5. Probar carga de documentos a expedientes';
  
END
$$;

-- =====================================================
-- NOTAS IMPORTANTES PARA TABLAS DE RELACIÓN EMPLEADO_*
-- =====================================================

/*
  TABLAS DE RELACIÓN EMPLEADO_* - CONSIDERACIONES ESPECIALES
  ===========================================================

  Las tablas de relación conectan empleados con otras entidades del sistema.
  Son críticas para mantener la integridad referencial y el aislamiento multi-tenant.

  TABLAS IMPLEMENTADAS:
  ---------------------
  
  1. EMPLEADO_BENEFICIOS:
     - Vincula empleados con beneficios asignados
     - Crítico: Empleado y beneficio deben ser del mismo tenant
     - Relacionado con: empleados, beneficios
     - Ejemplo: Seguro médico, bono alimentación, etc.
  
  2. EMPLEADO_CAPACITACIONES:
     - Vincula empleados con capacitaciones recibidas
     - Crítico: Empleado y capacitación deben ser del mismo tenant
     - Relacionado con: empleados, capacitaciones
     - Ejemplo: Curso de Excel, capacitación en seguridad, etc.
  
  3. EMPLEADO_HORARIOS:
     - Vincula empleados con horarios de trabajo asignados
     - Crítico: Empleado y horario deben ser del mismo tenant
     - Relacionado con: empleados, horarios_trabajo
     - Ejemplo: Horario 8am-5pm, turno nocturno, etc.
  
  4. EMPLEADO_PLANILLA_CONCEPTOS:
     - Vincula empleados con conceptos de planilla (haberes, descuentos, aportes)
     - Crítico: Empleado, planilla y concepto deben ser del mismo tenant
     - Relacionado con: empleados, planillas, conceptos_planilla
     - Ejemplo: Sueldo base, AFP, ONP, adelantos, etc.
  
  5. EXPEDIENTE_DOCUMENTOS:
     - Almacena documentos del expediente de empleados
     - Crítico: Documentos sensibles que deben estar aislados por tenant
     - Relacionado con: empleados
     - Ejemplo: CV, contrato, certificados, evaluaciones, etc.

  INTEGRIDAD REFERENCIAL CON RLS:
  --------------------------------
  
  Con RLS habilitado, es CRÍTICO que las relaciones mantengan consistencia:
  
  1. EMPLEADO_BENEFICIOS:
     - empleado_beneficios.tenant_id = empleados.tenant_id
     - empleado_beneficios.tenant_id = beneficios.tenant_id
     - Si no coinciden, la relación será invisible o fallará
  
  2. EMPLEADO_CAPACITACIONES:
     - empleado_capacitaciones.tenant_id = empleados.tenant_id
     - empleado_capacitaciones.tenant_id = capacitaciones.tenant_id
  
  3. EMPLEADO_HORARIOS:
     - empleado_horarios.tenant_id = empleados.tenant_id
     - empleado_horarios.tenant_id = horarios_trabajo.tenant_id
  
  4. EMPLEADO_PLANILLA_CONCEPTOS:
     - empleado_planilla_conceptos.tenant_id = empleados.tenant_id
     - empleado_planilla_conceptos.tenant_id = planillas.tenant_id
     - empleado_planilla_conceptos.tenant_id = conceptos_planilla.tenant_id
  
  5. EXPEDIENTE_DOCUMENTOS:
     - expediente_documentos.tenant_id = empleados.tenant_id

  FLUJOS DE NEGOCIO CON RLS:
  ---------------------------
  
  1. ASIGNAR BENEFICIO A EMPLEADO:
     ```sql
     -- Verificar que empleado y beneficio son del mismo tenant
     INSERT INTO empleado_beneficios (empleado_id, beneficio_id, fecha_inicio, tenant_id)
     SELECT e.id, b.id, CURRENT_DATE, app.current_tenant_id()
     FROM empleados e, beneficios b
     WHERE e.id = $1 AND b.id = $2
       AND e.tenant_id = app.current_tenant_id()
       AND b.tenant_id = app.current_tenant_id();
     ```
  
  2. ASIGNAR HORARIO A EMPLEADO:
     ```sql
     INSERT INTO empleado_horarios (empleado_id, horario_id, fecha_inicio, tenant_id)
     VALUES ($1, $2, CURRENT_DATE, app.current_tenant_id());
     ```
  
  3. AGREGAR CONCEPTO A PLANILLA DE EMPLEADO:
     ```sql
     INSERT INTO empleado_planilla_conceptos 
       (empleado_id, planilla_id, concepto_id, monto, tenant_id)
     VALUES ($1, $2, $3, $4, app.current_tenant_id());
     ```
  
  4. SUBIR DOCUMENTO A EXPEDIENTE:
     ```sql
     INSERT INTO expediente_documentos 
       (empleado_id, tipo_documento, archivo_url, tenant_id)
     VALUES ($1, $2, $3, app.current_tenant_id());
     ```

  VALIDACIÓN POST-IMPLEMENTACIÓN:
  --------------------------------
  
  Después de aplicar RLS, validar estos flujos:
  
  1. Asignación de beneficios:
     ✓ Crear beneficio
     ✓ Asignar a empleado
     ✓ Verificar que solo se ven beneficios del tenant
     ✓ Intentar asignar beneficio de otro tenant (debe fallar)
  
  2. Asignación de horarios:
     ✓ Crear horario
     ✓ Asignar a empleado
     ✓ Verificar que solo se ven horarios del tenant
  
  3. Procesamiento de planillas:
     ✓ Crear planilla
     ✓ Agregar conceptos a empleados
     ✓ Calcular montos
     ✓ Verificar que solo se procesan empleados del tenant
  
  4. Gestión de expedientes:
     ✓ Subir documento
     ✓ Listar documentos de empleado
     ✓ Verificar que solo se ven documentos del tenant

  QUERIES DE VALIDACIÓN:
  ----------------------
  
  -- Verificar consistencia de tenant_id en empleado_beneficios
  SELECT eb.id, eb.tenant_id as eb_tenant, e.tenant_id as emp_tenant, b.tenant_id as ben_tenant
  FROM empleado_beneficios eb
  JOIN empleados e ON e.id = eb.empleado_id
  JOIN beneficios b ON b.id = eb.beneficio_id
  WHERE eb.tenant_id != e.tenant_id OR eb.tenant_id != b.tenant_id;
  -- No debería retornar ninguna fila
  
  -- Verificar consistencia de tenant_id en empleado_horarios
  SELECT eh.id, eh.tenant_id as eh_tenant, e.tenant_id as emp_tenant, h.tenant_id as hor_tenant
  FROM empleado_horarios eh
  JOIN empleados e ON e.id = eh.empleado_id
  JOIN horarios_trabajo h ON h.id = eh.horario_id
  WHERE eh.tenant_id != e.tenant_id OR eh.tenant_id != h.tenant_id;
  -- No debería retornar ninguna fila
  
  -- Verificar consistencia de tenant_id en empleado_planilla_conceptos
  SELECT epc.id, epc.tenant_id as epc_tenant, e.tenant_id as emp_tenant, 
         p.tenant_id as pla_tenant, c.tenant_id as con_tenant
  FROM empleado_planilla_conceptos epc
  JOIN empleados e ON e.id = epc.empleado_id
  JOIN planillas p ON p.id = epc.planilla_id
  JOIN conceptos_planilla c ON c.id = epc.concepto_id
  WHERE epc.tenant_id != e.tenant_id 
     OR epc.tenant_id != p.tenant_id 
     OR epc.tenant_id != c.tenant_id;
  -- No debería retornar ninguna fila

  BACKFILL DE DATOS EXISTENTES:
  ------------------------------
  
  Si hay datos existentes sin tenant_id, ejecutar backfill:
  
  -- Para empleado_beneficios (asignar tenant_id basado en empleado)
  UPDATE empleado_beneficios eb
  SET tenant_id = (
    SELECT e.tenant_id 
    FROM empleados e 
    WHERE e.id = eb.empleado_id 
    LIMIT 1
  )
  WHERE eb.tenant_id IS NULL;
  
  -- Para empleado_capacitaciones
  UPDATE empleado_capacitaciones ec
  SET tenant_id = (
    SELECT e.tenant_id 
    FROM empleados e 
    WHERE e.id = ec.empleado_id 
    LIMIT 1
  )
  WHERE ec.tenant_id IS NULL;
  
  -- Para empleado_horarios
  UPDATE empleado_horarios eh
  SET tenant_id = (
    SELECT e.tenant_id 
    FROM empleados e 
    WHERE e.id = eh.empleado_id 
    LIMIT 1
  )
  WHERE eh.tenant_id IS NULL;
  
  -- Para empleado_planilla_conceptos
  UPDATE empleado_planilla_conceptos epc
  SET tenant_id = (
    SELECT e.tenant_id 
    FROM empleados e 
    WHERE e.id = epc.empleado_id 
    LIMIT 1
  )
  WHERE epc.tenant_id IS NULL;
  
  -- Para expediente_documentos
  UPDATE expediente_documentos ed
  SET tenant_id = (
    SELECT e.tenant_id 
    FROM empleados e 
    WHERE e.id = ed.empleado_id 
    LIMIT 1
  )
  WHERE ed.tenant_id IS NULL;

  PERFORMANCE:
  ------------
  
  Las tablas de relación suelen tener muchos registros.
  Los índices en tenant_id son CRÍTICOS:
  
  - empleado_beneficios_tenant_id_idx
  - empleado_capacitaciones_tenant_id_idx
  - empleado_horarios_tenant_id_idx
  - empleado_planilla_conceptos_tenant_id_idx
  - expediente_documentos_tenant_id_idx
  
  Considerar índices compuestos para queries frecuentes:
  
  CREATE INDEX empleado_beneficios_tenant_empleado_idx 
    ON empleado_beneficios(tenant_id, empleado_id);
  
  CREATE INDEX empleado_horarios_tenant_empleado_idx 
    ON empleado_horarios(tenant_id, empleado_id);
  
  CREATE INDEX empleado_planilla_conceptos_tenant_planilla_idx 
    ON empleado_planilla_conceptos(tenant_id, planilla_id);
  
  CREATE INDEX expediente_documentos_tenant_empleado_idx 
    ON expediente_documentos(tenant_id, empleado_id);

  SEGURIDAD:
  ----------
  
  Las tablas de relación empleado_* contienen información sensible:
  
  - empleado_beneficios: Información de compensación y beneficios
  - empleado_planilla_conceptos: Detalles de sueldos y descuentos
  - expediente_documentos: Documentos personales y confidenciales
  - evaluaciones: Información de desempeño
  
  Es CRÍTICO que RLS esté habilitado y funcionando correctamente
  para evitar fugas de información entre tenants.

  TESTING:
  --------
  
  Probar exhaustivamente:
  
  1. Como Tenant A:
     - Crear empleado A
     - Asignar beneficio a empleado A
     - Verificar que se ve la relación
  
  2. Como Tenant B:
     - Intentar ver empleado A (no debe verse)
     - Intentar ver beneficios de empleado A (no debe verse)
     - Crear empleado B
     - Asignar beneficio a empleado B
     - Verificar que solo se ve empleado B y sus beneficios
  
  3. Validar que no hay cross-tenant leakage:
     - Queries que unen empleados con beneficios
     - Queries que unen empleados con horarios
     - Queries que unen empleados con planillas
     - Queries que acceden a expedientes

  ROLLBACK:
  ---------
  
  Si es necesario revertir:
  
  -- Deshabilitar RLS
  ALTER TABLE empleado_beneficios DISABLE ROW LEVEL SECURITY;
  ALTER TABLE empleado_capacitaciones DISABLE ROW LEVEL SECURITY;
  ALTER TABLE empleado_horarios DISABLE ROW LEVEL SECURITY;
  ALTER TABLE empleado_planilla_conceptos DISABLE ROW LEVEL SECURITY;
  ALTER TABLE expediente_documentos DISABLE ROW LEVEL SECURITY;
  
  -- Eliminar políticas
  DROP POLICY IF EXISTS empleado_beneficios_tenant_isolation ON empleado_beneficios;
  DROP POLICY IF EXISTS empleado_capacitaciones_tenant_isolation ON empleado_capacitaciones;
  DROP POLICY IF EXISTS empleado_horarios_tenant_isolation ON empleado_horarios;
  DROP POLICY IF EXISTS empleado_planilla_conceptos_tenant_isolation ON empleado_planilla_conceptos;
  DROP POLICY IF EXISTS expediente_documentos_tenant_isolation ON expediente_documentos;

*/

COMMIT;
