-- Ajustes de QA para demos colombianas: escala COP y catálogo contable visible.
-- Sólo alcanza tenants sintéticos DEV/demo; no modifica cuentas reales.

BEGIN;

WITH co_demo AS (
  SELECT tenant_id
  FROM public.empresa_config
  WHERE is_demo = true
    AND (upper(COALESCE(pais, '')) = 'CO' OR pais_id = 2)
)
UPDATE public.productos p
SET precio_venta = precio_venta * 1000,
    precio_compra = precio_compra * 1000,
    updated_at = now()
FROM co_demo d
WHERE p.tenant_id = d.tenant_id
  AND p.codigo LIKE 'DEMO-%'
  AND GREATEST(COALESCE(p.precio_venta, 0), COALESCE(p.precio_compra, 0)) < 1000;

WITH co_demo AS (
  SELECT tenant_id
  FROM public.empresa_config
  WHERE is_demo = true
    AND (upper(COALESCE(pais, '')) = 'CO' OR pais_id = 2)
)
UPDATE public.sesiones_caja s
SET monto_inicio = 100000,
    updated_at = now()
FROM co_demo d
WHERE s.tenant_id = d.tenant_id
  AND s.moneda = 'COP'
  AND s.monto_inicio < 1000;

WITH co_demo AS (
  SELECT tenant_id
  FROM public.empresa_config
  WHERE is_demo = true
    AND (upper(COALESCE(pais, '')) = 'CO' OR pais_id = 2)
), puc(codigo, nombre, tipo) AS (
  VALUES
    ('1105', 'Caja', 'ACTIVO'),
    ('1110', 'Bancos', 'ACTIVO'),
    ('1305', 'Clientes', 'ACTIVO'),
    ('1435', 'Mercancías no fabricadas por la empresa', 'ACTIVO'),
    ('2205', 'Proveedores nacionales', 'PASIVO'),
    ('2365', 'Retención en la fuente', 'PASIVO'),
    ('2370', 'Retenciones y aportes de nómina', 'PASIVO'),
    ('2380', 'Acreedores varios - PILA y parafiscales', 'PASIVO'),
    ('2408', 'Impuesto sobre las ventas por pagar', 'PASIVO'),
    ('2505', 'Salarios por pagar', 'PASIVO'),
    ('2510', 'Cesantías consolidadas', 'PASIVO'),
    ('2515', 'Intereses sobre cesantías', 'PASIVO'),
    ('2520', 'Prima de servicios', 'PASIVO'),
    ('2525', 'Vacaciones consolidadas', 'PASIVO'),
    ('3105', 'Capital suscrito y pagado', 'PATRIMONIO'),
    ('4135', 'Comercio al por mayor y al por menor', 'INGRESO'),
    ('5105', 'Gastos de personal', 'GASTO'),
    ('5135', 'Servicios', 'GASTO'),
    ('5195', 'Diversos', 'GASTO'),
    ('6135', 'Costo de ventas - comercio', 'GASTO')
)
INSERT INTO public.plan_cuentas (
  tenant_id, codigo, nombre, tipo, tipo_cuenta, nivel,
  acepta_movimiento, activo, estado, metadata, created_at, updated_at
)
SELECT
  d.tenant_id, p.codigo, p.nombre, p.tipo, p.tipo, 2,
  true, true, 'ACTIVO',
  jsonb_build_object('source', '369__colombia_demo_qa_catalog_and_scale', 'pais_codigo', 'CO'),
  now(), now()
FROM co_demo d
CROSS JOIN puc p
WHERE NOT EXISTS (
  SELECT 1 FROM public.plan_cuentas existing
  WHERE existing.tenant_id = d.tenant_id AND existing.codigo = p.codigo
);

WITH co_demo AS (
  SELECT tenant_id
  FROM public.empresa_config
  WHERE is_demo = true
    AND (upper(COALESCE(pais, '')) = 'CO' OR pais_id = 2)
), equivalencias(codigo, puc_codigo) AS (
  VALUES
    ('10', '1105'), ('101', '1105'), ('104', '1110'), ('12', '1305'),
    ('20', '1435'), ('39', '5195'), ('40', '2408'), ('401', '2365'),
    ('403', '2370'), ('407', '2380'),
    ('411', '2505'), ('415', '2510'), ('42', '2205'), ('50', '3105'),
    ('60', '6135'), ('621', '5105'), ('627', '5105'), ('629', '5105'),
    ('68', '5195'), ('69', '6135'), ('70', '4135'), ('76', '4135'), ('94', '5195')
)
UPDATE public.plan_cuentas pc
SET metadata = COALESCE(pc.metadata, '{}'::jsonb) || jsonb_build_object(
      'internal_equivalence', true,
      'puc_codigo', e.puc_codigo,
      'pais_codigo', 'CO'
    ),
    updated_at = now()
FROM co_demo d
JOIN equivalencias e ON true
WHERE pc.tenant_id = d.tenant_id
  AND pc.codigo = e.codigo;

COMMIT;
