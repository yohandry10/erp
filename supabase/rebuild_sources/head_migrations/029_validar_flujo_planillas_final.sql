-- Migration 029: Corrección y validación final del flujo de planillas
-- Fecha: 2025-10-23
-- Descripción: Corrige registros sin tenant_id y valida que el flujo está completamente protegido
-- Fase 1: Seguridad Multi-Tenant - Corrección y Validación Final

BEGIN;

-- Paso 1: Corregir registros huérfanos asignándoles tenant_id
DO $$
DECLARE
  v_default_tenant_id uuid;
  v_registros_actualizados integer := 0;
BEGIN
  
  -- Obtener el primer tenant_id disponible como default
  SELECT id INTO v_default_tenant_id 
  FROM tenants 
  ORDER BY created_at ASC 
  LIMIT 1;
  
  IF v_default_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No hay tenants disponibles para asignar a registros huérfanos';
  END IF;
  
  RAISE NOTICE 'Usando tenant_id por defecto: %', v_default_tenant_id;
  
  -- Corregir empleado_planilla
  UPDATE empleado_planilla 
  SET tenant_id = v_default_tenant_id 
  WHERE tenant_id IS NULL;
  GET DIAGNOSTICS v_registros_actualizados = ROW_COUNT;
  IF v_registros_actualizados > 0 THEN
    RAISE NOTICE 'empleado_planilla: % registros actualizados', v_registros_actualizados;
  END IF;
  
  -- Corregir empleado_planilla_conceptos
  UPDATE empleado_planilla_conceptos 
  SET tenant_id = v_default_tenant_id 
  WHERE tenant_id IS NULL;
  GET DIAGNOSTICS v_registros_actualizados = ROW_COUNT;
  IF v_registros_actualizados > 0 THEN
    RAISE NOTICE 'empleado_planilla_conceptos: % registros actualizados', v_registros_actualizados;
  END IF;
  
  -- Corregir historial_pagos_planilla
  UPDATE historial_pagos_planilla 
  SET tenant_id = v_default_tenant_id 
  WHERE tenant_id IS NULL;
  GET DIAGNOSTICS v_registros_actualizados = ROW_COUNT;
  IF v_registros_actualizados > 0 THEN
    RAISE NOTICE 'historial_pagos_planilla: % registros actualizados', v_registros_actualizados;
  END IF;
  
  -- Corregir empleado_beneficios
  UPDATE empleado_beneficios 
  SET tenant_id = v_default_tenant_id 
  WHERE tenant_id IS NULL;
  GET DIAGNOSTICS v_registros_actualizados = ROW_COUNT;
  IF v_registros_actualizados > 0 THEN
    RAISE NOTICE 'empleado_beneficios: % registros actualizados', v_registros_actualizados;
  END IF;
  
  -- Corregir empleado_capacitaciones
  UPDATE empleado_capacitaciones 
  SET tenant_id = v_default_tenant_id 
  WHERE tenant_id IS NULL;
  GET DIAGNOSTICS v_registros_actualizados = ROW_COUNT;
  IF v_registros_actualizados > 0 THEN
    RAISE NOTICE 'empleado_capacitaciones: % registros actualizados', v_registros_actualizados;
  END IF;
  
  -- Corregir empleado_horarios
  UPDATE empleado_horarios 
  SET tenant_id = v_default_tenant_id 
  WHERE tenant_id IS NULL;
  GET DIAGNOSTICS v_registros_actualizados = ROW_COUNT;
  IF v_registros_actualizados > 0 THEN
    RAISE NOTICE 'empleado_horarios: % registros actualizados', v_registros_actualizados;
  END IF;
  
  RAISE NOTICE '✓ Corrección de registros huérfanos completada';
  
END $$;

-- Paso 2: Validación final estricta
DO $$
DECLARE
  v_tabla text;
  v_rls_habilitado boolean;
  v_tiene_tenant_id boolean;
  v_tiene_indice boolean;
  v_tiene_politica boolean;
  v_registros_sin_tenant integer;
  v_errores_detalle text := '';
BEGIN
  
  FOR v_tabla IN 
    SELECT unnest(ARRAY[
      'empleado_planilla',
      'empleado_planilla_conceptos',
      'historial_pagos_planilla',
      'empleado_beneficios',
      'empleado_capacitaciones',
      'empleado_horarios'
    ])
  LOOP
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = v_tabla
    ) THEN
      v_errores_detalle := v_errores_detalle || v_tabla || ': tabla no existe; ';
      CONTINUE;
    END IF;
    
    SELECT rowsecurity INTO v_rls_habilitado
    FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = v_tabla;
    
    IF NOT v_rls_habilitado THEN
      v_errores_detalle := v_errores_detalle || v_tabla || ': RLS no habilitado; ';
    END IF;
    
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = v_tabla 
        AND column_name = 'tenant_id'
    ) INTO v_tiene_tenant_id;
    
    IF NOT v_tiene_tenant_id THEN
      v_errores_detalle := v_errores_detalle || v_tabla || ': sin tenant_id; ';
    END IF;
    
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' 
        AND tablename = v_tabla 
        AND indexname LIKE '%tenant_id%'
    ) INTO v_tiene_indice;
    
    IF NOT v_tiene_indice THEN
      v_errores_detalle := v_errores_detalle || v_tabla || ': sin índice; ';
    END IF;
    
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' 
        AND tablename = v_tabla 
        AND policyname = v_tabla || '_tenant_isolation'
    ) INTO v_tiene_politica;
    
    IF NOT v_tiene_politica THEN
      v_errores_detalle := v_errores_detalle || v_tabla || ': sin política; ';
    END IF;
    
    IF v_tiene_tenant_id THEN
      EXECUTE format('SELECT COUNT(*) FROM %I WHERE tenant_id IS NULL', v_tabla) 
        INTO v_registros_sin_tenant;
      
      IF v_registros_sin_tenant > 0 THEN
        v_errores_detalle := v_errores_detalle || v_tabla || ': ' || v_registros_sin_tenant || ' registros sin tenant_id; ';
      END IF;
    END IF;
    
  END LOOP;
  
  IF v_errores_detalle != '' THEN
    RAISE EXCEPTION 'Validación final falló: %', v_errores_detalle;
  END IF;
  
  RAISE NOTICE '✓✓✓ VALIDACIÓN EXITOSA ✓✓✓';
  RAISE NOTICE 'El flujo de planillas está completamente protegido con RLS';
  
END $$;

COMMIT;
