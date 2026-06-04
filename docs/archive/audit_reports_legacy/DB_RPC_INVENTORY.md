# Inventario de RPCs (Postgres) — desde supabase/migrations

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_auditoria_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Generado: 2025-12-13 08:21:13

## CREATE [OR REPLACE] FUNCTION
supabase/migrations\009_multi_tenant_context_stock.sql:19:CREATE OR REPLACE FUNCTION app.current_tenant_id()
supabase/migrations\009_multi_tenant_context_stock.sql:57:CREATE OR REPLACE FUNCTION app.current_user_id()
supabase/migrations\009_multi_tenant_context_stock.sql:99:CREATE OR REPLACE FUNCTION app.current_tenant_id_safe()
supabase/migrations\009_multi_tenant_context_stock.sql:143:CREATE OR REPLACE FUNCTION app.has_tenant_context()
supabase/migrations\009_multi_tenant_context_stock.sql:157:CREATE OR REPLACE FUNCTION app.is_superadmin()
supabase/migrations\009_multi_tenant_context_stock.sql:190:CREATE OR REPLACE FUNCTION app.log_no_tenant_access(
supabase/migrations\009_multi_tenant_context_stock.sql:241:CREATE OR REPLACE FUNCTION incrementar_stock_reservado(
supabase/migrations\009_multi_tenant_context_stock.sql:273:CREATE OR REPLACE FUNCTION decrementar_stock_reservado(
supabase/migrations\009_multi_tenant_context_stock.sql:305:CREATE OR REPLACE FUNCTION descontar_stock_y_liberar_reserva(
supabase/migrations\009_multi_tenant_context_stock.sql:550:CREATE OR REPLACE FUNCTION get_current_tenant_id()
supabase/migrations\009_multi_tenant_context_stock.sql:558:CREATE OR REPLACE FUNCTION get_current_user_id()
supabase/migrations\006_funciones_stock.sql:10:CREATE OR REPLACE FUNCTION stock_disponible(p_producto_id UUID)
supabase/migrations\006_funciones_stock.sql:35:CREATE OR REPLACE FUNCTION verificar_stock_disponible(
supabase/migrations\006_funciones_stock.sql:55:CREATE OR REPLACE FUNCTION obtener_stock_info(p_producto_id UUID)
supabase/migrations\006_funciones_stock.sql:82:CREATE OR REPLACE FUNCTION actualizar_stock_reservado(
supabase/migrations\006_funciones_stock.sql:114:CREATE OR REPLACE FUNCTION descontar_stock(
supabase/migrations\016_p3_rma_multialmacen_dashboards.sql:206:CREATE OR REPLACE FUNCTION registrar_movimiento_almacen(
supabase/migrations\016_p3_rma_multialmacen_dashboards.sql:306:CREATE OR REPLACE FUNCTION rma_retorno_inventario(
supabase/migrations\021_pago_lote_transaction.sql:5:CREATE OR REPLACE FUNCTION procesar_pago_lote(
supabase/migrations\025_fix_rls_all_tables.sql:29:CREATE OR REPLACE FUNCTION add_tenant_id_if_missing(p_table_name text)
supabase/migrations\025_fix_rls_all_tables.sql:135:CREATE OR REPLACE FUNCTION enable_rls_tenant_isolation(p_table_name text)
supabase/migrations\012_parciales_backorder.sql:14:CREATE OR REPLACE FUNCTION incrementar_stock_reservado(
supabase/migrations\012_parciales_backorder.sql:48:CREATE OR REPLACE FUNCTION decrementar_stock_reservado(
supabase/migrations\012_parciales_backorder.sql:82:CREATE OR REPLACE FUNCTION descontar_stock_y_liberar_reserva(
supabase/migrations\033_audit_rls_violations.sql:92:CREATE OR REPLACE FUNCTION log_rls_violation(
supabase/migrations\033_audit_rls_violations.sql:187:CREATE OR REPLACE FUNCTION audit_rls_access()
supabase/migrations\033_audit_rls_violations.sql:257:CREATE OR REPLACE FUNCTION add_rls_audit_trigger(p_table_name TEXT)
supabase/migrations\033_audit_rls_violations.sql:443:CREATE OR REPLACE FUNCTION cleanup_old_rls_audit_logs(
supabase/migrations\033_audit_rls_violations.sql:472:CREATE OR REPLACE FUNCTION generate_rls_security_report(
supabase/migrations\034_configure_rls_alerts.sql:97:CREATE OR REPLACE FUNCTION send_rls_alert(
supabase/migrations\034_configure_rls_alerts.sql:192:CREATE OR REPLACE FUNCTION trigger_rls_alert()
supabase/migrations\034_configure_rls_alerts.sql:365:CREATE OR REPLACE FUNCTION acknowledge_rls_alert(
supabase/migrations\034_configure_rls_alerts.sql:393:CREATE OR REPLACE FUNCTION enable_rls_alert(p_alert_name TEXT)
supabase/migrations\034_configure_rls_alerts.sql:410:CREATE OR REPLACE FUNCTION disable_rls_alert(p_alert_name TEXT)
supabase/migrations\034_configure_rls_alerts.sql:427:CREATE OR REPLACE FUNCTION get_alert_statistics(p_days INTEGER DEFAULT 7)
supabase/migrations\034_configure_rls_alerts.sql:489:CREATE OR REPLACE FUNCTION cleanup_old_rls_alerts(
supabase/migrations\035_compras_completo.sql:194:CREATE OR REPLACE FUNCTION calcular_totales_cotizacion_compra()
supabase/migrations\035_compras_completo.sql:232:CREATE OR REPLACE FUNCTION validar_vigencia_cotizacion_compra()
supabase/migrations\035_compras_completo.sql:466:CREATE OR REPLACE FUNCTION calcular_cantidad_pendiente_oc()
supabase/migrations\035_compras_completo.sql:484:CREATE OR REPLACE FUNCTION calcular_totales_orden_compra()
supabase/migrations\035_compras_completo.sql:759:CREATE OR REPLACE FUNCTION calcular_totales_devolucion_proveedor()
supabase/migrations\037_add_idempotency_pago_lote.sql:49:CREATE OR REPLACE FUNCTION procesar_pago_lote(
supabase/migrations\038b_create_conciliaciones_bancarias.sql:68:CREATE OR REPLACE FUNCTION update_conciliaciones_bancarias_updated_at()
supabase/migrations\046_create_presupuestos_table.sql:124:CREATE OR REPLACE FUNCTION update_presupuestos_updated_at()
supabase/migrations\047_create_plantillas_asientos_table.sql:279:CREATE OR REPLACE FUNCTION update_plantillas_asientos_updated_at()
supabase/migrations\047_create_plantillas_asientos_table.sql:304:CREATE OR REPLACE FUNCTION calcular_proxima_generacion(
supabase/migrations\047_create_plantillas_asientos_table.sql:347:CREATE OR REPLACE FUNCTION validar_balance_plantilla(p_plantilla_id UUID)
supabase/migrations\048_create_materialized_views_estados_financieros.sql:204:CREATE OR REPLACE FUNCTION refrescar_estados_financieros(
supabase/migrations\048_create_materialized_views_estados_financieros.sql:253:CREATE OR REPLACE FUNCTION trigger_refresh_estados_financieros()
supabase/migrations\050_add_calcular_resultado_ejercicio_function.sql:5:CREATE OR REPLACE FUNCTION calcular_resultado_ejercicio(
supabase/migrations\055_fix_rls_alert_tenant_id.sql:22:CREATE OR REPLACE FUNCTION send_rls_alert(
supabase/migrations\055_fix_rls_alert_tenant_id.sql:131:CREATE OR REPLACE FUNCTION trigger_rls_alert()
supabase/migrations\056_atomic_stock_reservation.sql:20:CREATE OR REPLACE FUNCTION reservar_stock_atomico(
supabase/migrations\056_fix_rls_context_and_auth_policies.sql:20:CREATE OR REPLACE FUNCTION app.set_tenant_context(
supabase/migrations\056_fix_rls_context_and_auth_policies.sql:249:CREATE OR REPLACE FUNCTION app.is_superadmin()
supabase/migrations\057_payment_idempotency_locking.sql:20:CREATE OR REPLACE FUNCTION procesar_pago_cxc_atomico(
supabase/migrations\057_payment_idempotency_locking.sql:295:CREATE OR REPLACE FUNCTION procesar_pago_cxp_atomico(
supabase/migrations\058_db_audit_triggers_core.sql:22:CREATE OR REPLACE FUNCTION audit_table_changes()
supabase/migrations\059_create_outbox_events.sql:57:CREATE OR REPLACE FUNCTION update_outbox_events_updated_at()
supabase/migrations\059_create_outbox_events.sql:120:CREATE OR REPLACE FUNCTION get_pending_outbox_events(
supabase/migrations\059_create_outbox_events.sql:154:CREATE OR REPLACE FUNCTION mark_outbox_event_processing(p_event_id UUID)
supabase/migrations\059_create_outbox_events.sql:166:CREATE OR REPLACE FUNCTION mark_outbox_event_completed(p_event_id UUID)
supabase/migrations\059_create_outbox_events.sql:179:CREATE OR REPLACE FUNCTION mark_outbox_event_failed(
supabase/migrations\062_atomic_stock_entry.sql:19:CREATE OR REPLACE FUNCTION registrar_entrada_stock_atomico(
supabase/migrations\064_add_missing_indices_tenant_created.sql:28:CREATE OR REPLACE FUNCTION create_index_if_not_exists(
supabase/migrations\064_add_missing_indices_tenant_created.sql:72:CREATE OR REPLACE FUNCTION table_has_column(
supabase/migrations\063_audit_log_rotation.sql:67:CREATE OR REPLACE FUNCTION rotar_logs_auditoria(
supabase/migrations\063_audit_log_rotation.sql:161:CREATE OR REPLACE FUNCTION obtener_estadisticas_logs_auditoria()
supabase/migrations\074__tesoreria_pago_outbox.sql:11:CREATE OR REPLACE FUNCTION procesar_pago_lote(
supabase/migrations\077__habilitar_rls_users_audit_archive.sql:103:CREATE OR REPLACE FUNCTION diagnostico_seguridad_rls()
supabase/migrations\076__fix_pos_stock_y_detalle.sql:134:CREATE OR REPLACE FUNCTION migrar_detalles_ventas_pos_desde_observaciones()
supabase/migrations\076__fix_pos_stock_y_detalle.sql:233:CREATE OR REPLACE FUNCTION validar_stock_antes_detalle_venta()
supabase/migrations\076__fix_pos_stock_y_detalle.sql:351:CREATE OR REPLACE FUNCTION diagnostico_pos(p_tenant_id uuid DEFAULT NULL)
supabase/migrations\080__habilitar_rls_audit_log.sql:73:CREATE OR REPLACE FUNCTION cleanup_old_rls_audit_logs(
supabase/migrations\079__seed_catalogos_maestros.sql:172:CREATE OR REPLACE FUNCTION seed_plan_cuentas_tenant(p_tenant_id uuid)
supabase/migrations\079__seed_catalogos_maestros.sql:250:CREATE OR REPLACE FUNCTION trigger_seed_catalogos_nuevo_tenant()
supabase/migrations\078__fix_cpe_documentos_integridad.sql:37:CREATE OR REPLACE FUNCTION crear_documento_desde_cpe(p_cpe_id uuid)
supabase/migrations\078__fix_cpe_documentos_integridad.sql:139:CREATE OR REPLACE FUNCTION migrar_cpes_a_documentos()
supabase/migrations\078__fix_cpe_documentos_integridad.sql:190:CREATE OR REPLACE FUNCTION trigger_crear_documento_para_cpe()
supabase/migrations\078__fix_cpe_documentos_integridad.sql:261:CREATE OR REPLACE FUNCTION diagnostico_cpe_documentos()
supabase/migrations\082__comunicacion_baja_resumen_diario.sql:204:CREATE OR REPLACE FUNCTION generar_numero_comunicacion_baja(p_tenant_id UUID, p_fecha DATE)
supabase/migrations\082__comunicacion_baja_resumen_diario.sql:234:CREATE OR REPLACE FUNCTION generar_numero_resumen_diario(p_tenant_id UUID, p_fecha DATE)
supabase/migrations\086__flujo_ventas_completo.sql:104:CREATE OR REPLACE FUNCTION obtener_siguiente_numero_documento(
supabase/migrations\081__metodos_pago_por_tenant.sql:105:CREATE OR REPLACE FUNCTION copiar_metodos_pago_globales_a_tenant(
supabase/migrations\081__metodos_pago_por_tenant.sql:186:CREATE OR REPLACE FUNCTION trigger_copiar_metodos_pago_nuevo_tenant()
supabase/migrations\086__flujo_ventas_documentos_completo.sql:48:CREATE OR REPLACE FUNCTION obtener_siguiente_numero_documento(
supabase/migrations\101__fix_crear_documento_desde_cpe.sql:4:CREATE OR REPLACE FUNCTION crear_documento_desde_cpe(p_cpe_id uuid)
supabase/migrations\091__fix_stock_actual_references.sql:16:CREATE OR REPLACE FUNCTION reservar_stock_atomico(
supabase/migrations\091__fix_stock_actual_references.sql:124:CREATE OR REPLACE FUNCTION descontar_stock_y_liberar_reserva(
supabase/migrations\093__fix_wizard_rls_and_validation.sql:99:CREATE OR REPLACE FUNCTION validate_wizard_completion(p_tenant_id UUID)
supabase/migrations\093__fix_wizard_rls_and_validation.sql:128:CREATE OR REPLACE FUNCTION check_wizard_completion_validity()
supabase/migrations\111__pos_tx_outbox.sql:16:CREATE OR REPLACE FUNCTION app.pos_registrar_venta_tx(
supabase/migrations\112__rls_pos_tables.sql:2:CREATE OR REPLACE FUNCTION public._ensure_rls_if_tenant(p_table regclass)
supabase/migrations\115__pos_advisory_lock.sql:4:CREATE OR REPLACE FUNCTION app.acquire_pos_lock(p_tenant_id uuid, p_lock_key text)
supabase/migrations\115__pos_advisory_lock.sql:15:CREATE OR REPLACE FUNCTION app.release_pos_lock(p_tenant_id uuid, p_lock_key text)
supabase/migrations\118_atomic_order_creation.sql:16:CREATE OR REPLACE FUNCTION crear_pedido_completo(
supabase/migrations\122_autorizaciones_caja.sql:88:CREATE OR REPLACE FUNCTION generar_firma_autorizacion(
supabase/migrations\125_sesiones_caja_forensic_fields.sql:24:CREATE OR REPLACE FUNCTION validar_geolocalizacion(geo JSONB)
supabase/migrations\121_configuracion_caja.sql:83:CREATE OR REPLACE FUNCTION obtener_configuracion_efectiva_caja(
supabase/migrations\127_eventos_pos_auditoria.sql:57:CREATE OR REPLACE FUNCTION registrar_evento_pos(
supabase/migrations\127_eventos_pos_auditoria.sql:130:CREATE OR REPLACE FUNCTION detectar_patrones_sospechosos_pos(
supabase/migrations\126_turnos_analytics.sql:132:CREATE OR REPLACE FUNCTION obtener_metricas_cajero(
supabase/migrations\124_shift_analytics.sql:69:-- 2. CREATE FUNCTION TO GET SHIFT SUMMARY FOR PERIOD
supabase/migrations\124_shift_analytics.sql:70:CREATE OR REPLACE FUNCTION obtener_resumen_turnos(
supabase/migrations\124_shift_analytics.sql:106:-- 3. CREATE FUNCTION TO GET TOP PERFORMERS
supabase/migrations\124_shift_analytics.sql:107:CREATE OR REPLACE FUNCTION obtener_top_cajeros(
supabase/migrations\119__cash_operations_complete.sql:40:CREATE OR REPLACE FUNCTION prevent_cash_movement_modification()
supabase/migrations\119__cash_operations_complete.sql:244:CREATE OR REPLACE FUNCTION registrar_movimiento_caja(
supabase/migrations\119__cash_operations_complete.sql:344:CREATE OR REPLACE FUNCTION validar_integridad_sesion(p_sesion_caja_id uuid)
supabase/migrations\128__lotes_series_fefo.sql:161:CREATE OR REPLACE FUNCTION obtener_lotes_fefo(
supabase/migrations\128__lotes_series_fefo.sql:233:CREATE OR REPLACE FUNCTION reservar_stock_lote_fefo(
supabase/migrations\128__lotes_series_fefo.sql:308:CREATE OR REPLACE FUNCTION confirmar_venta_lotes(
supabase/migrations\128__lotes_series_fefo.sql:382:CREATE OR REPLACE FUNCTION marcar_lotes_vencidos()
supabase/migrations\129__stock_constraints.sql:112:  CREATE OR REPLACE FUNCTION validar_stock_suficiente(
supabase/migrations\129__stock_constraints.sql:165:  CREATE OR REPLACE FUNCTION trigger_prevenir_stock_negativo()
supabase/migrations\130__secret_rotation_state.sql:56:CREATE OR REPLACE FUNCTION cleanup_old_rotation_records(retention_days INTEGER DEFAULT 365)
supabase/migrations\131__pii_encryption_support.sql:88:CREATE OR REPLACE FUNCTION buscar_por_pii_hash(
supabase/migrations\133__fix_sesiones_caja_columns.sql:129:CREATE OR REPLACE FUNCTION sync_sesiones_caja_columns()
supabase/migrations\132__adaptive_rate_limiting.sql:293:CREATE OR REPLACE FUNCTION app.calcular_baseline_usuario(
supabase/migrations\132__adaptive_rate_limiting.sql:333:CREATE OR REPLACE FUNCTION app.detectar_anomalia_rate_limit(
supabase/migrations\132__adaptive_rate_limiting.sql:396:CREATE OR REPLACE FUNCTION app.limpiar_request_logs_antiguos()
supabase/migrations\136__fix_configuracion_caja.sql:8:CREATE OR REPLACE FUNCTION obtener_configuracion_efectiva_caja(
supabase/migrations\140__fix_pos_function_ventas_pos.sql:4:CREATE OR REPLACE FUNCTION pos_registrar_venta_tx(
supabase/migrations\138__fix_pos_function_schema.sql:11:CREATE OR REPLACE FUNCTION app.pos_registrar_venta_tx(
supabase/migrations\139__fix_pos_function_public_schema.sql:12:CREATE OR REPLACE FUNCTION acquire_pos_lock(p_tenant_id uuid, p_lock_key text)
supabase/migrations\139__fix_pos_function_public_schema.sql:23:CREATE OR REPLACE FUNCTION release_pos_lock(p_tenant_id uuid, p_lock_key text)
supabase/migrations\139__fix_pos_function_public_schema.sql:40:CREATE OR REPLACE FUNCTION pos_registrar_venta_tx(
supabase/migrations\142__demo_tenant_support.sql:30:CREATE OR REPLACE FUNCTION cleanup_expired_demo_tenants()
supabase/migrations\142__demo_tenant_support.sql:63:CREATE OR REPLACE FUNCTION is_demo_expired(p_tenant_id UUID)
supabase/migrations\142__demo_tenant_support.sql:82:CREATE OR REPLACE FUNCTION get_demo_days_remaining(p_tenant_id UUID)
supabase/migrations\140__fix_stock_trigger.sql:5:CREATE OR REPLACE FUNCTION public.trigger_prevenir_stock_negativo()
supabase/migrations\144__demo_create_tenant_rpc.sql:7:CREATE OR REPLACE FUNCTION create_demo_tenant(
supabase/migrations\143__demo_seed_data.sql:9:CREATE OR REPLACE FUNCTION seed_demo_tenant(p_tenant_id UUID)
supabase/migrations\146__cotizaciones_stock_reserva_transaccional.sql:12:CREATE OR REPLACE FUNCTION reservar_stock_cotizacion(
supabase/migrations\146__cotizaciones_stock_reserva_transaccional.sql:75:CREATE OR REPLACE FUNCTION liberar_stock_cotizacion(
supabase/migrations\146__cotizaciones_stock_reserva_transaccional.sql:116:CREATE OR REPLACE FUNCTION convertir_cotizacion_a_pedido(
supabase/migrations\146__cotizaciones_stock_reserva_transaccional.sql:275:CREATE OR REPLACE FUNCTION trigger_liberar_stock_cotizacion()
supabase/migrations\147__seed_roles_permisos_tenant.sql:16:CREATE OR REPLACE FUNCTION seed_permisos_tenant(p_tenant_id UUID)
supabase/migrations\147__seed_roles_permisos_tenant.sql:440:CREATE OR REPLACE FUNCTION seed_roles_tenant(p_tenant_id UUID)
supabase/migrations\147__seed_roles_permisos_tenant.sql:481:CREATE OR REPLACE FUNCTION seed_rol_permisos_tenant(p_tenant_id UUID)
supabase/migrations\147__seed_roles_permisos_tenant.sql:647:CREATE OR REPLACE FUNCTION seed_roles_permisos_tenant(p_tenant_id UUID)
supabase/migrations\147__seed_roles_permisos_tenant.sql:713:CREATE OR REPLACE FUNCTION asignar_rol_admin_usuario(p_tenant_id UUID, p_user_id UUID)
supabase/migrations\147__seed_roles_permisos_tenant.sql:762:CREATE OR REPLACE FUNCTION trigger_seed_roles_permisos_on_tenant_create()
supabase/migrations\147__seed_roles_permisos_tenant.sql:797:CREATE OR REPLACE FUNCTION create_demo_tenant(
supabase/migrations\148__knowledge_base_help_system.sql:35:CREATE OR REPLACE FUNCTION buscar_ayuda(
supabase/migrations\148__knowledge_base_help_system.sql:85:CREATE OR REPLACE FUNCTION obtener_sugerencias_ayuda(
supabase/migrations\148__knowledge_base_help_system.sql:115:CREATE OR REPLACE FUNCTION update_knowledge_base_timestamp()
supabase/migrations\151__notificaciones_por_rol.sql:59:CREATE OR REPLACE FUNCTION get_user_role_ids(p_usuario_id UUID)
supabase/migrations\151__notificaciones_por_rol.sql:73:CREATE OR REPLACE FUNCTION puede_ver_notificacion(
supabase/migrations\153__add_security_audit_permission.sql:19:CREATE OR REPLACE FUNCTION seed_permisos_tenant(p_tenant_id UUID)
supabase/migrations\162__fix_inventory_rpcs_stock_column.sql:14:CREATE OR REPLACE FUNCTION reservar_stock_atomico(
supabase/migrations\162__fix_inventory_rpcs_stock_column.sql:139:CREATE OR REPLACE FUNCTION registrar_entrada_stock_atomico(
supabase/migrations\161__e2e_rpc_tenant_context.sql:16:CREATE OR REPLACE FUNCTION crear_pedido_completo(
supabase/migrations\161__e2e_rpc_tenant_context.sql:120:CREATE OR REPLACE FUNCTION reservar_stock_atomico(
supabase/migrations\161__e2e_rpc_tenant_context.sql:229:CREATE OR REPLACE FUNCTION registrar_entrada_stock_atomico(
supabase/migrations\161__e2e_rpc_tenant_context.sql:392:CREATE OR REPLACE FUNCTION create_indices_pedidos()
supabase/migrations\161__e2e_rpc_tenant_context.sql:425:CREATE OR REPLACE FUNCTION get_table_indexes(p_table_name TEXT)
