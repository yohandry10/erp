-- Cierra RPC SECURITY DEFINER reintroducidas después del hardening 345.
-- El backend las consume con service_role; no deben aceptar llamadas directas
-- de anon/authenticated con tenant_id o identificadores de otro tenant.

BEGIN;

REVOKE ALL ON FUNCTION app.seed_peru_cuentas_diferidos_empresa_config()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_peru_cuentas_diferidos_empresa_config()
TO service_role;

REVOKE ALL ON FUNCTION app.seed_rrhh_argentina_from_empresa_config()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_rrhh_argentina_from_empresa_config()
TO service_role;

REVOKE ALL ON FUNCTION app.seed_rrhh_colombia_from_empresa_config()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.seed_rrhh_colombia_from_empresa_config()
TO service_role;

REVOKE ALL ON FUNCTION app.sembrar_permisos_asientos_ciclo_vida(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_asientos_ciclo_vida(uuid)
TO service_role;

REVOKE ALL ON FUNCTION app.sembrar_permisos_contabilidad_activos(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_activos(uuid)
TO service_role;

REVOKE ALL ON FUNCTION app.sembrar_permisos_contabilidad_analitica(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_analitica(uuid)
TO service_role;

REVOKE ALL ON FUNCTION app.sembrar_permisos_contabilidad_conciliacion(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_conciliacion(uuid)
TO service_role;

REVOKE ALL ON FUNCTION app.sembrar_permisos_contabilidad_multimoneda(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_multimoneda(uuid)
TO service_role;

REVOKE ALL ON FUNCTION app.sembrar_permisos_contabilidad_plantillas(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sembrar_permisos_contabilidad_plantillas(uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.descontar_stock_y_liberar_reserva_en_almacen(
  uuid, uuid, uuid, numeric, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_stock_y_liberar_reserva_en_almacen(
  uuid, uuid, uuid, numeric, text, text, text, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.liberar_stock_atomico(
  uuid, numeric, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_stock_atomico(
  uuid, numeric, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.reservar_stock_atomico(
  uuid, numeric, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_stock_atomico(
  uuid, numeric, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.validar_rrhh_argentina_readiness(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_rrhh_argentina_readiness(uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.validar_rrhh_colombia_readiness(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_rrhh_colombia_readiness(uuid)
TO service_role;

COMMIT;
