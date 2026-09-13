-- Lecturas que usa el backend de compras al abrir órdenes, recepciones,
-- cotizaciones, devoluciones y facturas del proveedor. Comprobadas contra la
-- API real y una reconstrucción local; no depender de las ACL del proveedor.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

GRANT SELECT ON TABLE
  public.orden_compra_detalles,
  public.oc_aprobaciones,
  public.recepcion_items,
  public.devoluciones_proveedor,
  public.devolucion_items,
  public.cotizaciones_compra,
  public.cotizacion_compra_detalles,
  public.cuentas_por_pagar
TO service_role;

-- Sin backfill, cambios de RLS, DML ni permisos nuevos al navegador.
-- Rollback: restaurar las ACL previas desde el respaldo de esquema. No revocar
-- a ciegas privilegios que ya existieran antes de aplicar esta migración.
COMMIT;
