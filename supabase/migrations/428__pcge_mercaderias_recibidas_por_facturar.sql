-- ============================================================================
-- 428__pcge_mercaderias_recibidas_por_facturar.sql
-- Separa el hecho físico (recepción) del tributario (factura proveedor).
-- 4699 funciona como pasivo transitorio hasta recibir el comprobante.
-- ============================================================================

BEGIN;

INSERT INTO public.plan_cuentas (
  tenant_id, codigo, nombre, tipo, tipo_cuenta,
  nivel, acepta_movimiento, activo, estado, metadata
)
SELECT
  t.id,
  '4699',
  'Mercaderías recibidas por facturar',
  'PASIVO',
  'PASIVO',
  4,
  true,
  true,
  'ACTIVO',
  jsonb_build_object('origen', 'migration_428', 'pcge_uso', 'recepcion_sin_factura')
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.plan_cuentas pc
  WHERE pc.tenant_id = t.id AND pc.codigo = '4699'
);

COMMIT;
