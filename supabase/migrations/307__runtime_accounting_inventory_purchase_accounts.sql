-- 307__runtime_accounting_inventory_purchase_accounts.sql
-- Completa cuentas contables runtime usadas por eventos de compras, ventas e inventario.

insert into public.plan_cuentas (
  tenant_id,
  codigo,
  nombre,
  tipo,
  tipo_cuenta,
  nivel,
  acepta_movimiento,
  activo,
  estado,
  metadata
)
select
  t.id,
  c.codigo,
  c.nombre,
  c.tipo,
  c.tipo_cuenta,
  c.nivel,
  true,
  true,
  'ACTIVO',
  jsonb_build_object('source', 'migration_307_runtime_accounting_accounts')
from public.tenants t
cross join (
  values
    ('201', 'Mercaderias', 'ACTIVO', 'ACTIVO', 3),
    ('401', 'Gobierno central / IGV', 'PASIVO', 'PASIVO', 3),
    ('421', 'Facturas, boletas y otros comprobantes por pagar', 'PASIVO', 'PASIVO', 3),
    ('601', 'Compras de mercaderias', 'GASTO', 'GASTO', 3),
    ('691', 'Costo de ventas - mercaderias', 'GASTO', 'GASTO', 3),
    ('701', 'Ventas de mercaderias', 'INGRESO', 'INGRESO', 3),
    ('791', 'Cargas imputables a cuentas de costos y gastos', 'INGRESO', 'INGRESO', 3)
) as c(codigo, nombre, tipo, tipo_cuenta, nivel)
where not exists (
  select 1
  from public.plan_cuentas pc
  where pc.tenant_id = t.id
    and pc.codigo = c.codigo
);
