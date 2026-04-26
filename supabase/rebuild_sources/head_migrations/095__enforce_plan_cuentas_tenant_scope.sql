-- 095__enforce_plan_cuentas_tenant_scope.sql
-- Asegura que plan_cuentas tenga columna tenant_id, políticas RLS y datos sembrados por tenant.

BEGIN;

-- 1. Crear columna tenant_id si no existiera
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'plan_cuentas'
      AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE plan_cuentas
      ADD COLUMN tenant_id UUID;
  END IF;
END $$;

-- 2. Asociar las cuentas existentes al tenant correcto antes de forzar NOT NULL
DO $$
DECLARE
  v_default_tenant UUID;
  v_asientos_tiene_tenant BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'asientos_contables'
      AND column_name = 'tenant_id'
  ) INTO v_asientos_tiene_tenant;

  IF v_asientos_tiene_tenant THEN
    -- Intentar mapear cada cuenta usando los asientos existentes
    WITH cuenta_por_tenant AS (
      SELECT DISTINCT da.cuenta_id, a.tenant_id
      FROM detalle_asientos da
      JOIN asientos_contables a ON a.id = da.asiento_id
      WHERE a.tenant_id IS NOT NULL
    ),
    cuenta_resuelta AS (
      SELECT DISTINCT ON (cuenta_id) cuenta_id, tenant_id
      FROM cuenta_por_tenant
      ORDER BY cuenta_id, tenant_id
    )
    UPDATE plan_cuentas pc
    SET tenant_id = cr.tenant_id
    FROM cuenta_resuelta cr
    WHERE pc.id = cr.cuenta_id
      AND pc.tenant_id IS NULL;
  END IF;

  -- Asignar un tenant por defecto (primer tenant registrado) a las cuentas restantes
  SELECT tenant_id
  INTO v_default_tenant
  FROM empresa_config
  WHERE tenant_id IS NOT NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_default_tenant IS NULL THEN
    RAISE EXCEPTION 'No se encontró ningún tenant para asociar plan_cuentas existente';
  END IF;

  UPDATE plan_cuentas
  SET tenant_id = v_default_tenant
  WHERE tenant_id IS NULL;
END $$;

ALTER TABLE plan_cuentas
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE plan_cuentas
  DROP CONSTRAINT IF EXISTS plan_cuentas_tenant_id_fkey;

-- Asegurar unicidad del tenant_id en empresa_config antes de crear la FK
CREATE UNIQUE INDEX IF NOT EXISTS empresa_config_tenant_id_uidx
  ON empresa_config(tenant_id);

ALTER TABLE plan_cuentas
  ADD CONSTRAINT plan_cuentas_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES empresa_config(tenant_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_tenant_id
  ON plan_cuentas(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS plan_cuentas_tenant_codigo_uidx
  ON plan_cuentas(tenant_id, codigo);

-- 4. RLS alineado al tenant actual
ALTER TABLE plan_cuentas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_cuentas_authenticated_access ON plan_cuentas;
CREATE POLICY plan_cuentas_authenticated_access ON plan_cuentas
  FOR ALL
  USING (tenant_id = app.current_tenant_id() OR app.is_superadmin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_superadmin());

-- 5. Resembrar plan de cuentas para todos los tenants existentes
DO $$
DECLARE
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT tenant_id
    FROM empresa_config
    WHERE tenant_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM seed_plan_cuentas_tenant(v_tenant.tenant_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'No se pudo sembrar plan de cuentas para tenant %: %', v_tenant.tenant_id, SQLERRM;
    END;
  END LOOP;
END $$;

COMMIT;
