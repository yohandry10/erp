-- Lecturas ofrecidas por RRHH: el writer475 ya conserva todas las escrituras
-- detrás de la RPC autorizada. Esta migración sólo habilita SELECT al backend y
-- retira los permisos que Supabase concede por defecto a clientes SQL y al
-- servicio; no modifica filas, políticas ni ownership.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';
REVOKE ALL ON TABLE
  public.beneficios,
  public.capacitaciones,
  public.empleado_beneficios,
  public.empleado_capacitaciones,
  public.expediente_documentos
FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.beneficios,
  public.capacitaciones,
  public.empleado_beneficios,
  public.empleado_capacitaciones,
  public.expediente_documentos
FROM service_role;
GRANT SELECT ON TABLE
  public.beneficios,
  public.capacitaciones,
  public.empleado_beneficios,
  public.empleado_capacitaciones,
  public.expediente_documentos
TO service_role;
COMMIT;
