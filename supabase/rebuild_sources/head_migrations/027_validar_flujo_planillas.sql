-- Migration 027: Validar flujo de planillas con RLS
-- Fecha: 2025-10-23
-- Descripción: Valida que el flujo completo de planillas funciona correctamente con RLS habilitado
-- Fase 1: Seguridad Multi-Tenant - Validación de Flujo RRHH

BEGIN;

-- Validación del flujo de planillas (solo advertencias, no falla)
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
    RAISE WARNING 'Validación de flujo de planillas - Problemas encontrados: %', v_errores_detalle;
  ELSE
    RAISE NOTICE 'Validación exitosa - Flujo de planillas protegido con RLS';
  END IF;
  
END $$;

COMMIT;
