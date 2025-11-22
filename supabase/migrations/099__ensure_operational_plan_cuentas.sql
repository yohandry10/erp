-- 099__ensure_operational_plan_cuentas.sql
-- Garantiza que los planes contables tengan las cuentas básicas usadas por Integración Contable (201/2011 y 701/7011).

DO $$
BEGIN
  -- Cuentas de mercaderías (201 / 2011)
  INSERT INTO plan_cuentas (tenant_id, codigo, nombre, tipo, nivel, padre_id, activo, acepta_movimiento)
  SELECT pc.tenant_id, '201', 'Mercaderías', 'ACTIVO', 2, pc.id, true, true
  FROM plan_cuentas pc
  WHERE pc.codigo = '20'
  ON CONFLICT (tenant_id, codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        tipo = EXCLUDED.tipo,
        nivel = EXCLUDED.nivel,
        padre_id = EXCLUDED.padre_id,
        activo = true,
        acepta_movimiento = true;

  INSERT INTO plan_cuentas (tenant_id, codigo, nombre, tipo, nivel, padre_id, activo, acepta_movimiento)
  SELECT pc.tenant_id, '2011', 'Mercaderías en almacén', 'ACTIVO', 3, pc.id, true, true
  FROM plan_cuentas pc
  WHERE pc.codigo = '201'
  ON CONFLICT (tenant_id, codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        tipo = EXCLUDED.tipo,
        nivel = EXCLUDED.nivel,
        padre_id = EXCLUDED.padre_id,
        activo = true,
        acepta_movimiento = true;

  -- Cuentas de ingresos por ventas (701 / 7011)
  INSERT INTO plan_cuentas (tenant_id, codigo, nombre, tipo, nivel, padre_id, activo, acepta_movimiento)
  SELECT pc.tenant_id, '701', 'Ventas de mercaderías', 'INGRESO', 2, pc.id, true, true
  FROM plan_cuentas pc
  WHERE pc.codigo = '70'
  ON CONFLICT (tenant_id, codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        tipo = EXCLUDED.tipo,
        nivel = EXCLUDED.nivel,
        padre_id = EXCLUDED.padre_id,
        activo = true,
        acepta_movimiento = true;

  INSERT INTO plan_cuentas (tenant_id, codigo, nombre, tipo, nivel, padre_id, activo, acepta_movimiento)
  SELECT pc.tenant_id, '7011', 'Venta de mercaderías - mercado local', 'INGRESO', 3, pc.id, true, true
  FROM plan_cuentas pc
  WHERE pc.codigo = '701'
  ON CONFLICT (tenant_id, codigo) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        tipo = EXCLUDED.tipo,
        nivel = EXCLUDED.nivel,
        padre_id = EXCLUDED.padre_id,
        activo = true,
        acepta_movimiento = true;
END $$;
