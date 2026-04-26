-- ============================================================================
-- 024__seed_minimum_operational_catalogs.sql
-- Seed mínimo operativo para catálogos fiscales y métodos de pago globales.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Configuración fiscal base por país (tenant_id NULL = catálogo global)
-- ----------------------------------------------------------------------------
INSERT INTO public.configuracion_fiscal (
  tenant_id,
  pais_id,
  codigo,
  nombre,
  activo,
  impuesto_principal_nombre,
  impuesto_principal_porcentaje,
  documento_identidad_empresa,
  longitud_documento_empresa,
  formato_fecha,
  separador_decimal,
  separador_miles,
  requiere_libro_diario,
  requiere_libro_mayor,
  requiere_libro_inventarios,
  requiere_libro_compras,
  requiere_libro_ventas,
  requiere_kardex_valorizado,
  requiere_libro_mayor_balances,
  requiere_libros_societarios,
  max_items_por_documento,
  monto_maximo_documento,
  estado,
  created_at,
  updated_at
)
SELECT
  NULL::uuid,
  s.pais_id,
  s.codigo,
  s.nombre,
  true,
  s.impuesto_nombre,
  s.impuesto_porcentaje,
  s.doc_empresa,
  s.doc_longitud,
  'DD/MM/YYYY',
  '.',
  ',',
  s.req_libro_diario,
  s.req_libro_mayor,
  s.req_libro_inventarios,
  s.req_libro_compras,
  s.req_libro_ventas,
  s.req_kardex,
  s.req_libro_mayor_balances,
  s.req_libros_societarios,
  999,
  999999999.99,
  'ACTIVO',
  now(),
  now()
FROM (
  VALUES
    (1::bigint, 'PE', 'Peru', 'IGV', 0.18::numeric, 'RUC', 11, true, true, true, true, true, true, false, false),
    (2::bigint, 'CO', 'Colombia', 'IVA', 0.19::numeric, 'NIT', 9, true, true, false, true, true, false, false, false),
    (3::bigint, 'CL', 'Chile', 'IVA', 0.19::numeric, 'RUT', 9, true, true, false, true, true, false, false, false),
    (4::bigint, 'MX', 'Mexico', 'IVA', 0.16::numeric, 'RFC', 13, true, true, false, true, true, false, false, false)
) AS s(
  pais_id,
  codigo,
  nombre,
  impuesto_nombre,
  impuesto_porcentaje,
  doc_empresa,
  doc_longitud,
  req_libro_diario,
  req_libro_mayor,
  req_libro_inventarios,
  req_libro_compras,
  req_libro_ventas,
  req_kardex,
  req_libro_mayor_balances,
  req_libros_societarios
)
WHERE EXISTS (
  SELECT 1
  FROM public.paises p
  WHERE p.id = s.pais_id
)
AND NOT EXISTS (
  SELECT 1
  FROM public.configuracion_fiscal cf
  WHERE cf.tenant_id IS NULL
    AND cf.pais_id = s.pais_id
);

-- ----------------------------------------------------------------------------
-- Tipos de documentos fiscales base por país
-- ----------------------------------------------------------------------------
INSERT INTO public.tipos_documentos_fiscales (
  tenant_id,
  pais_id,
  codigo,
  nombre,
  activo,
  estado,
  created_at,
  updated_at
)
SELECT
  NULL::uuid,
  s.pais_id,
  s.codigo,
  s.nombre,
  true,
  'ACTIVO',
  now(),
  now()
FROM (
  VALUES
    (1::bigint, '01', 'Factura'),
    (1::bigint, '03', 'Boleta'),
    (1::bigint, '07', 'Nota de Credito'),
    (1::bigint, '08', 'Nota de Debito'),
    (2::bigint, '01', 'Factura Electronica'),
    (2::bigint, '91', 'Nota de Credito'),
    (2::bigint, '92', 'Nota de Debito'),
    (3::bigint, '33', 'Factura Electronica'),
    (3::bigint, '39', 'Boleta Electronica'),
    (3::bigint, '61', 'Nota de Credito'),
    (4::bigint, 'I', 'Ingreso'),
    (4::bigint, 'E', 'Egreso'),
    (4::bigint, 'T', 'Traslado')
) AS s(pais_id, codigo, nombre)
WHERE EXISTS (
  SELECT 1
  FROM public.paises p
  WHERE p.id = s.pais_id
)
AND NOT EXISTS (
  SELECT 1
  FROM public.tipos_documentos_fiscales tdf
  WHERE tdf.tenant_id IS NULL
    AND tdf.pais_id = s.pais_id
    AND upper(coalesce(tdf.codigo, '')) = upper(s.codigo)
);

-- ----------------------------------------------------------------------------
-- Tipos de impuestos base por país
-- ----------------------------------------------------------------------------
INSERT INTO public.tipos_impuestos (
  tenant_id,
  pais_id,
  codigo,
  nombre,
  porcentaje,
  activo,
  estado,
  created_at,
  updated_at
)
SELECT
  NULL::uuid,
  s.pais_id,
  s.codigo,
  s.nombre,
  s.porcentaje,
  true,
  'ACTIVO',
  now(),
  now()
FROM (
  VALUES
    (1::bigint, 'IGV', 'Impuesto General a las Ventas', 18.00::numeric),
    (1::bigint, 'ISC', 'Impuesto Selectivo al Consumo', 0.00::numeric),
    (2::bigint, 'IVA', 'Impuesto al Valor Agregado', 19.00::numeric),
    (2::bigint, 'RETEIVA', 'Retencion de IVA', 15.00::numeric),
    (3::bigint, 'IVA', 'Impuesto al Valor Agregado', 19.00::numeric),
    (4::bigint, 'IVA', 'Impuesto al Valor Agregado', 16.00::numeric),
    (4::bigint, 'IEPS', 'Impuesto Especial sobre Produccion y Servicios', 0.00::numeric)
) AS s(pais_id, codigo, nombre, porcentaje)
WHERE EXISTS (
  SELECT 1
  FROM public.paises p
  WHERE p.id = s.pais_id
)
AND NOT EXISTS (
  SELECT 1
  FROM public.tipos_impuestos ti
  WHERE ti.tenant_id IS NULL
    AND ti.pais_id = s.pais_id
    AND upper(coalesce(ti.codigo, '')) = upper(s.codigo)
);

-- ----------------------------------------------------------------------------
-- Métodos de pago globales
-- ----------------------------------------------------------------------------
INSERT INTO public.metodos_pago (
  tenant_id,
  codigo,
  nombre,
  tipo,
  activo,
  estado,
  created_at,
  updated_at
)
SELECT
  NULL::uuid,
  s.codigo,
  s.nombre,
  s.tipo,
  true,
  'ACTIVO',
  now(),
  now()
FROM (
  VALUES
    ('efectivo', 'Efectivo', 'EFECTIVO'),
    ('tarjeta', 'Tarjeta', 'TARJETA'),
    ('transferencia', 'Transferencia Bancaria', 'TRANSFERENCIA'),
    ('yape', 'Yape', 'BILLETERA_DIGITAL'),
    ('plin', 'Plin', 'BILLETERA_DIGITAL')
) AS s(codigo, nombre, tipo)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.metodos_pago mp
  WHERE mp.tenant_id IS NULL
    AND lower(coalesce(mp.codigo, '')) = lower(s.codigo)
);

COMMIT;
