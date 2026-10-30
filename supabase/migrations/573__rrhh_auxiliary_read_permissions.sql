-- Lecturas ofrecidas por RRHH: el writer475 ya conserva todas las escrituras
-- detrás de la RPC autorizada. Esta migración sólo habilita SELECT al backend;
-- no modifica filas, políticas, ownership, ni concede acceso a clientes SQL.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';
GRANT SELECT ON TABLE
  public.beneficios,
  public.capacitaciones,
  public.empleado_beneficios,
  public.empleado_capacitaciones,
  public.expediente_documentos
TO service_role;
COMMIT;
