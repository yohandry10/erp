-- ============================================================================
-- 340__securitydefiner_rpc_grant_hardening.sql
-- Hardening de EXECUTE para RPC SECURITY DEFINER introducidas en esta rama
-- (auditoria de seguridad 2026-05-29).
--
-- Motivo:
-- - 334 concedio registrar_cxc_pago_tx, conciliar_movimientos_bancarios_tx y
--   validar_tesoreria_caja_bancos_runtime a authenticated. Son SECURITY DEFINER
--   y filtran por el p_tenant_id provisto por el caller, sin contrastarlo contra
--   app.current_tenant_id(). Por RPC directa permitirian operaciones cross-tenant.
-- - 333/335 dejaron descontar_stock_y_liberar_reserva (SECURITY DEFINER) sin
--   GRANT/REVOKE explicito -> EXECUTE a PUBLIC por defecto. No usa p_tenant_id
--   (deriva tenant del producto), pero conociendo un UUID de producto ajeno seria
--   una primitiva de escritura de inventario cross-tenant.
-- - El backend invoca todas estas RPC con cliente service_role
--   (cxc.service.ts, conciliacion.service.ts, pos/pedidos/logistica/inventario),
--   por lo que NO necesitan exposicion directa a usuarios finales.
--
-- Se alinea con el criterio ya aplicado en 337/338/339 (ejecucion solo service_role).
-- ============================================================================

BEGIN;

-- --- Tesoreria / CxC (334) -------------------------------------------------
REVOKE ALL ON FUNCTION public.registrar_cxc_pago_tx(uuid, uuid, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.registrar_cxc_pago_tx(uuid, uuid, jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_cxc_pago_tx(uuid, uuid, jsonb, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_cxc_pago_tx(uuid, uuid, jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.conciliar_movimientos_bancarios_tx(uuid, uuid, uuid, uuid, boolean, boolean, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.conciliar_movimientos_bancarios_tx(uuid, uuid, uuid, uuid, boolean, boolean, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conciliar_movimientos_bancarios_tx(uuid, uuid, uuid, uuid, boolean, boolean, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_movimientos_bancarios_tx(uuid, uuid, uuid, uuid, boolean, boolean, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.validar_tesoreria_caja_bancos_runtime(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validar_tesoreria_caja_bancos_runtime(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validar_tesoreria_caja_bancos_runtime(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validar_tesoreria_caja_bancos_runtime(uuid) TO service_role;

-- --- Inventario (333/335) --------------------------------------------------
REVOKE ALL ON FUNCTION public.descontar_stock_y_liberar_reserva(uuid, numeric, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.descontar_stock_y_liberar_reserva(uuid, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.descontar_stock_y_liberar_reserva(uuid, numeric, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.descontar_stock_y_liberar_reserva(uuid, numeric, text, text, text) TO service_role;

-- --- Documentacion ---------------------------------------------------------
COMMENT ON FUNCTION public.registrar_cxc_pago_tx(uuid, uuid, jsonb, uuid) IS
  'Registra pago de CxC de forma transaccional. Ejecucion restringida a service_role para evitar escrituras SECURITY DEFINER cross-tenant por RPC directa (p_tenant_id es provisto por el caller).';

COMMENT ON FUNCTION public.conciliar_movimientos_bancarios_tx(uuid, uuid, uuid, uuid, boolean, boolean, numeric) IS
  'Concilia movimientos bancarios de forma transaccional. Ejecucion restringida a service_role para evitar escrituras SECURITY DEFINER cross-tenant por RPC directa (p_tenant_id es provisto por el caller).';

COMMENT ON FUNCTION public.validar_tesoreria_caja_bancos_runtime(uuid) IS
  'Valida cuadre de tesoreria caja/bancos. Ejecucion restringida a service_role para evitar consultas SECURITY DEFINER cross-tenant por RPC directa (p_tenant_id es provisto por el caller).';

COMMENT ON FUNCTION public.descontar_stock_y_liberar_reserva(uuid, numeric, text, text, text) IS
  'Salida atomica de inventario. Ejecucion restringida a service_role para evitar escrituras SECURITY DEFINER cross-tenant por RPC directa (tenant derivado del producto, sin chequeo contra el tenant del caller).';

COMMIT;
