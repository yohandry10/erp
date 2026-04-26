-- Migration 081: Métodos de Pago por Tenant
-- Fecha: 2025-11-04
-- Descripción: Habilita RLS y permite que cada tenant tenga sus propios métodos de pago
--              manteniendo métodos globales como fallback
-- Objetivo: Resolver H05 - metodos_pago sin tenant_id
-- Referencia: REPORTE_AUDITORIA_TECNICA_EXHAUSTIVA.md - Hallazgo H05

BEGIN;

-- =====================================================
-- PASO 1: MODIFICAR CONSTRAINT UNIQUE
-- =====================================================

-- Eliminar constraint unique en codigo (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'metodos_pago_codigo_key'
  ) THEN
    ALTER TABLE metodos_pago DROP CONSTRAINT metodos_pago_codigo_key;
  END IF;
END $$;

-- Crear constraint unique compuesto (codigo + tenant_id)
-- Permite mismo código para diferentes tenants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'metodos_pago_codigo_tenant_key'
  ) THEN
    ALTER TABLE metodos_pago 
      ADD CONSTRAINT metodos_pago_codigo_tenant_key 
      UNIQUE NULLS NOT DISTINCT (codigo, tenant_id);
  END IF;
END $$;

COMMENT ON CONSTRAINT metodos_pago_codigo_tenant_key ON metodos_pago IS
  'Permite mismo código para diferentes tenants. NULL en tenant_id = método global';

-- =====================================================
-- PASO 2: HABILITAR RLS
-- =====================================================

ALTER TABLE metodos_pago ENABLE ROW LEVEL SECURITY;

-- Política 1: SELECT - Ver métodos globales + métodos de su tenant
DROP POLICY IF EXISTS metodos_pago_select_tenant ON metodos_pago;

CREATE POLICY metodos_pago_select_tenant
  ON metodos_pago
  FOR SELECT
  USING (
    tenant_id IS NULL  -- Métodos globales visibles para todos
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

COMMENT ON POLICY metodos_pago_select_tenant ON metodos_pago IS
  'Permite ver métodos globales (tenant_id NULL) y métodos del tenant actual';

-- Política 2: INSERT - Solo en su tenant
DROP POLICY IF EXISTS metodos_pago_insert_tenant ON metodos_pago;

CREATE POLICY metodos_pago_insert_tenant
  ON metodos_pago
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

COMMENT ON POLICY metodos_pago_insert_tenant ON metodos_pago IS
  'Solo puede insertar métodos para su propio tenant';

-- Política 3: UPDATE - Solo métodos de su tenant
DROP POLICY IF EXISTS metodos_pago_update_tenant ON metodos_pago;

CREATE POLICY metodos_pago_update_tenant
  ON metodos_pago
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

COMMENT ON POLICY metodos_pago_update_tenant ON metodos_pago IS
  'Solo puede actualizar métodos de su propio tenant (no globales)';

-- Política 4: DELETE - Solo métodos de su tenant
DROP POLICY IF EXISTS metodos_pago_delete_tenant ON metodos_pago;

CREATE POLICY metodos_pago_delete_tenant
  ON metodos_pago
  FOR DELETE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

COMMENT ON POLICY metodos_pago_delete_tenant ON metodos_pago IS
  'Solo puede eliminar métodos de su propio tenant (no globales)';

-- =====================================================
-- PASO 3: FUNCIÓN PARA COPIAR MÉTODOS GLOBALES
-- =====================================================

CREATE OR REPLACE FUNCTION copiar_metodos_pago_globales_a_tenant(
  p_tenant_id uuid
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_metodo RECORD;
BEGIN
  -- Copiar métodos globales al tenant (si no existen)
  FOR v_metodo IN 
    SELECT codigo, nombre, tipo, requiere_referencia, comision_porcentaje, activo
    FROM metodos_pago
    WHERE tenant_id IS NULL
      AND activo = true
  LOOP
    -- Insertar solo si no existe
    INSERT INTO metodos_pago (
      tenant_id, codigo, nombre, tipo, 
      requiere_referencia, comision_porcentaje, activo
    )
    SELECT 
      p_tenant_id, 
      v_metodo.codigo, 
      v_metodo.nombre, 
      v_metodo.tipo,
      v_metodo.requiere_referencia, 
      v_metodo.comision_porcentaje, 
      v_metodo.activo
    WHERE NOT EXISTS (
      SELECT 1 FROM metodos_pago
      WHERE tenant_id = p_tenant_id
        AND codigo = v_metodo.codigo
    );
    
    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION copiar_metodos_pago_globales_a_tenant IS
  'Copia métodos de pago globales a un tenant específico';

-- =====================================================
-- PASO 4: COPIAR MÉTODOS A TENANTS EXISTENTES
-- =====================================================

DO $$
DECLARE
  v_tenant RECORD;
  v_total_copiados INTEGER := 0;
  v_copiados INTEGER;
BEGIN
  -- Obtener todos los tenants desde empresa_config
  FOR v_tenant IN 
    SELECT DISTINCT tenant_id 
    FROM empresa_config 
    WHERE tenant_id IS NOT NULL
  LOOP
    BEGIN
      -- Copiar métodos globales al tenant
      v_copiados := copiar_metodos_pago_globales_a_tenant(v_tenant.tenant_id);
      v_total_copiados := v_total_copiados + v_copiados;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error copiando métodos de pago para tenant %: %', 
        v_tenant.tenant_id, SQLERRM;
    END;
  END LOOP;
END $$;

-- =====================================================
-- PASO 5: TRIGGER PARA NUEVOS TENANTS
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_copiar_metodos_pago_nuevo_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Copiar métodos de pago globales automáticamente
  PERFORM copiar_metodos_pago_globales_a_tenant(NEW.tenant_id);
  RETURN NEW;
END;
$$;

-- Crear trigger en empresa_config
DROP TRIGGER IF EXISTS trigger_copiar_metodos_pago_on_tenant_create ON empresa_config;

CREATE TRIGGER trigger_copiar_metodos_pago_on_tenant_create
  AFTER INSERT ON empresa_config
  FOR EACH ROW
  EXECUTE FUNCTION trigger_copiar_metodos_pago_nuevo_tenant();

COMMENT ON TRIGGER trigger_copiar_metodos_pago_on_tenant_create ON empresa_config IS
  'Copia métodos de pago globales cuando se crea un nuevo tenant';

-- =====================================================
-- PASO 6: ÍNDICES PARA OPTIMIZACIÓN
-- =====================================================

-- Índice para búsquedas por tenant
CREATE INDEX IF NOT EXISTS idx_metodos_pago_tenant_activo 
  ON metodos_pago(tenant_id, activo) 
  WHERE activo = true;

-- Índice para métodos globales
CREATE INDEX IF NOT EXISTS idx_metodos_pago_global_activo 
  ON metodos_pago(activo) 
  WHERE tenant_id IS NULL AND activo = true;

-- =====================================================
-- PASO 7: ACTUALIZAR COMENTARIOS
-- =====================================================

COMMENT ON TABLE metodos_pago IS
  'Métodos de pago disponibles. 
  - tenant_id NULL = método global (visible para todos)
  - tenant_id NOT NULL = método específico del tenant
  RLS habilitado: cada tenant ve métodos globales + sus propios métodos';

COMMENT ON COLUMN metodos_pago.tenant_id IS
  'NULL = método global, NOT NULL = método específico del tenant';

-- =====================================================
-- PASO 8: VERIFICACIÓN
-- =====================================================

DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_policy_count INTEGER;
  v_metodos_globales INTEGER;
  v_metodos_tenant INTEGER;
BEGIN
  -- Verificar RLS
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'metodos_pago'
    AND relnamespace = 'public'::regnamespace;

  -- Contar políticas
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE tablename = 'metodos_pago';

  -- Contar métodos
  SELECT COUNT(*) INTO v_metodos_globales
  FROM metodos_pago
  WHERE tenant_id IS NULL;

  SELECT COUNT(*) INTO v_metodos_tenant
  FROM metodos_pago
  WHERE tenant_id IS NOT NULL;

  -- Verificar
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'RLS no está habilitado en metodos_pago';
  END IF;

  IF v_policy_count < 4 THEN
    RAISE EXCEPTION 'Solo % políticas creadas (esperado: 4)', v_policy_count;
  END IF;
END $$;

COMMIT;
