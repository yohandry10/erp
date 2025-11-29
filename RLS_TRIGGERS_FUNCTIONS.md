Database Functions
Docs

schema

public

Search for a function

Return Type

Security

Create a new function

Name	Arguments	Return type	Security	

_ensure_rls_if_tenant
p_table regclass

void

Invoker



acknowledge_rls_alert
p_alert_id uuid, p_acknowledged_by uuid DEFAULT NULL::uuid

boolean

Definer



acquire_job_lock
p_lock_key text, p_lock_ttl_seconds integer DEFAULT 300

boolean

Definer



actualizar_stock_reservado
p_producto_id uuid, p_cantidad numeric, p_operacion character varying

void

Invoker



add_rls_audit_trigger
p_table_name text

void

Definer



add_tenant_id_if_missing
p_table_name text

void

Definer



algorithm_sign
signables text, secret text, algorithm text

text

Invoker



audit_rls_access
–

trigger	
Definer



audit_table_changes
–

trigger	
Definer



audit_trigger_function
–

trigger	
Invoker



calcular_cantidad_pendiente_oc
–

trigger	
Invoker



calcular_proxima_generacion
p_tipo_recurrencia character varying, p_dia_generacion integer, p_fecha_base date DEFAULT CURRENT_DATE

date

Invoker



calcular_totales_cotizacion_compra
–

trigger	
Invoker



calcular_totales_devolucion_proveedor
–

trigger	
Invoker



calcular_totales_orden_compra
–

trigger	
Invoker



check_wizard_completion_validity
–

trigger	
Invoker



cleanup_expired_sessions
–

integer

Invoker



cleanup_old_audit_logs
days_to_keep integer DEFAULT 365

integer

Invoker



cleanup_old_rls_alerts
p_retention_days integer DEFAULT 90

integer

Definer



cleanup_old_rls_audit_logs
p_retention_days integer DEFAULT 90

integer

Definer



cleanup_processed_events
–

integer

Invoker



copiar_metodos_pago_globales_a_tenant
p_tenant_id uuid

integer

Definer



crear_documento_desde_cpe
p_cpe_id uuid

uuid

Definer



create_index_if_not_exists
p_index_name text, p_table_name text, p_columns text, p_where_clause text DEFAULT NULL::text

void

Definer



create_tenant_isolation_policy
p_table_name text, p_policy_suffix text DEFAULT 'tenant_isolation'::text

boolean

Invoker



create_user_session
p_user_id uuid, p_usuario_sistema_id uuid, p_tenant_id uuid, p_session_token text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_expires_in_hours integer DEFAULT 8

uuid

Definer



debug_tenant_context
–

TABLE(setting_name text, setting_value text)

Definer



decrementar_stock_reservado
p_producto_id uuid, p_cantidad numeric

void

Definer



descontar_stock
p_producto_id uuid, p_cantidad numeric

void

Invoker



descontar_stock_y_liberar_reserva
p_producto_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text

uuid

Definer



diagnostico_cpe_documentos
–

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_pos
p_tenant_id uuid DEFAULT NULL::uuid

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_seguridad_rls
–

TABLE(tabla text, rls_habilitado boolean, num_politicas bigint, estado text)

Invoker



disable_rls_alert
p_alert_name text

boolean

Definer



drop_all_policies
p_table_name text

integer

Invoker



enable_rls_alert
p_alert_name text

boolean

Definer



enable_rls_on_table
p_table_name text

boolean

Invoker



enable_rls_tenant_isolation
p_table_name text

void

Definer



evaluar_crecimiento
–

text

Invoker



evaluar_liquidez
efectivo numeric, cuentas_por_pagar numeric

text

Invoker



evaluar_rentabilidad
margen_bruto numeric

text

Invoker



generar_numero_comunicacion_baja
p_tenant_id uuid, p_fecha date

character varying

Invoker



generar_numero_resumen_diario
p_tenant_id uuid, p_fecha date

character varying

Invoker



generate_gre_numero
–

trigger	
Invoker



generate_rls_security_report
p_days integer DEFAULT 7

TABLE(metric text, value text)

Definer



get_alert_statistics
p_days integer DEFAULT 7

TABLE(metric text, value text)

Definer



get_current_tenant_id
–

uuid

Invoker



get_current_user_id
–

uuid

Invoker



get_datos_historicos_completos
meses integer DEFAULT 12

TABLE(periodo text, ventas numeric, gastos numeric, utilidad numeric, cuentas_por_cobrar numeric, cuentas_por_pagar numeric)

Definer



get_kpis_financieros
–

TABLE(efectivo_disponible numeric, ventas_ultimos_30dias numeric, gastos_ultimos_30dias numeric, utilidad_ultimos_30dias numeric, cuentas_por_cobrar numeric, cuentas_por_pagar numeric, rotacion_inventario numeric, margen_bruto numeric, liquidez text, rentabilidad text, crecimiento text)

Definer



get_pending_outbox_events
p_limit integer DEFAULT 100, p_tenant_id uuid DEFAULT NULL::uuid

TABLE(id uuid, tenant_id uuid, event_type character varying, event_data jsonb, retry_count integer, max_retries integer)

Invoker



incrementar_stock_reservado
p_producto_id uuid, p_cantidad numeric

void

Definer



is_super_admin
p_user_id uuid

boolean

Definer



log_audit_action
p_table_name text, p_operation text, p_resource_id uuid, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_action_description text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text

uuid

Definer



log_rls_violation
p_table_name text, p_operation text, p_attempted_tenant_id uuid DEFAULT NULL::uuid, p_violation_type text DEFAULT 'cross_tenant'::text, p_severity text DEFAULT 'WARNING'::text, p_metadata jsonb DEFAULT NULL::jsonb

uuid

Definer



mark_outbox_event_completed
p_event_id uuid

void

Invoker



mark_outbox_event_failed
p_event_id uuid, p_error_message text

void

Invoker



mark_outbox_event_processing
p_event_id uuid

void

Invoker



migrar_cpes_a_documentos
–

TABLE(cpes_procesados integer, documentos_creados integer, errores text[])

Invoker



migrar_detalles_ventas_pos_desde_observaciones
–

TABLE(ventas_procesadas integer, detalles_creados integer, errores text[])

Invoker



obtener_costos_fijos_mes_actual
–

numeric

Invoker



obtener_estadisticas_logs_auditoria
–

jsonb

Definer



obtener_siguiente_numero_documento
p_tenant_id uuid, p_tipo_documento character varying, p_serie character varying

character varying

Invoker



obtener_siguiente_numero_serie
p_tenant_id uuid, p_tipo_documento character varying, p_serie character varying

character varying

Invoker



obtener_stock_info
p_producto_id uuid

TABLE(producto_id uuid, stock_total numeric, stock_reservado numeric, stock_disponible numeric)

Invoker



prevent_system_role_deletion
–

trigger	
Invoker



procesar_pago_cxc_atomico
p_tenant_id uuid, p_cxc_id uuid, p_monto numeric, p_fecha_pago date, p_metodo_pago text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_cuenta_bancaria_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT 'PAGO'::text, p_aplica_retencion boolean DEFAULT false, p_retencion_monto numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text

jsonb

Definer



procesar_pago_cxp_atomico
p_tenant_id uuid, p_cxp_id uuid, p_monto numeric, p_fecha_pago date, p_metodo_pago text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_cuenta_bancaria_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text

jsonb

Definer



procesar_pago_lote
p_tenant_id uuid, p_cuenta_bancaria_id uuid, p_fecha_pago date, p_metodo_pago text, p_referencia_lote text, p_observaciones text, p_pagos jsonb, p_created_by uuid DEFAULT NULL::uuid

jsonb

Definer



refrescar_estados_financieros
p_tenant_id uuid, p_anio integer, p_mes integer

void

Definer



registrar_auditoria_documento
–

trigger	
Invoker



registrar_entrada_stock_atomico
p_producto_id uuid, p_almacen_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion timestamp with time zone DEFAULT NULL::timestamp with time zone

uuid

Definer



registrar_movimiento_almacen
p_producto_id uuid, p_almacen_id uuid, p_tipo text, p_cantidad numeric, p_referencia_tipo text, p_referencia_id uuid, p_notas text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion date DEFAULT NULL::date

void

Definer



release_job_lock
p_lock_key text

void

Definer



reservar_stock_atomico
p_producto_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text

uuid

Definer



revoke_all_user_sessions
p_usuario_sistema_id uuid

integer

Definer



revoke_user_session
p_session_token text

boolean

Definer



rma_retorno_inventario
p_rma_item_id uuid, p_cantidad numeric, p_almacen_id uuid, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion date DEFAULT NULL::date

void

Definer



rotar_logs_auditoria
p_retention_days integer DEFAULT 365

jsonb

Definer



seed_plan_cuentas_tenant
p_tenant_id uuid

void

Invoker



send_rls_alert
p_alert_name text, p_severity text, p_message text, p_violation_count integer DEFAULT 1, p_affected_table text DEFAULT NULL::text, p_user_email text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT NULL::jsonb, p_tenant_id uuid DEFAULT NULL::uuid

uuid

Definer



set_config
setting text, value text

text

Definer



sign
payload json, secret text, algorithm text DEFAULT 'HS256'::text

text

Invoker



stock_disponible
p_producto_id uuid

numeric

Invoker



sync_usuario_activo_estado
–

trigger	
Invoker



table_has_column
p_table_name text, p_column_name text

boolean

Invoker



trigger_copiar_metodos_pago_nuevo_tenant
–

trigger	
Definer



trigger_crear_documento_para_cpe
–

trigger	
Definer



trigger_rls_alert
–

trigger	
Definer



trigger_seed_catalogos_nuevo_tenant
–

trigger	
Definer



try_cast_double
inp text

double precision

Invoker



update_conciliaciones_bancarias_updated_at
–

trigger	
Invoker



update_empresa_config_updated_at
–

trigger	
Invoker



update_outbox_events_updated_at
–

trigger	
Invoker



update_plantillas_asientos_updated_at
–

trigger	
Invoker



update_presupuestos_updated_at
–

trigger	
Invoker



update_session_activity
p_session_token text

boolean

Definer



update_updated_at_column
–

trigger	
Invoker



update_wizard_progress_timestamp
–

trigger	
Invoker



url_decode
data text

bytea

Invoker



url_encode
data bytea

text

Invoker



user_has_permission
p_modulo text, p_accion text, p_recurso text

boolean

Definer



validar_balance_plantilla
p_plantilla_id uuid

TABLE(es_valido boolean, total_debe numeric, total_haber numeric, diferencia numeric, mensaje text)

Invoker



validar_stock_antes_detalle_venta
–

trigger	
Invoker



validar_vigencia_cotizacion_compra
–

trigger	
Invoker



validate_user_session
p_session_token text

TABLE(session_id uuid, user_id uuid, usuario_sistema_id uuid, tenant_id uuid, is_valid boolean, expires_at timestamp with time zone)

Definer



validate_wizard_completion
p_tenant_id uuid

boolean

Definer



verificar_stock_disponible
p_producto_id uuid, p_cantidad numeric

boolean

Invoker



verify
token text, secret text, algorithm text DEFAULT 'HS256'::text

TABLE(header json, payload json, valid boolean)

Invoker


 ||| triggers   Database Triggers
Execute a set of actions automatically on specified table events
Docs

schema

public

Search for a trigger

New trigger

Name	Table	Function	Events	Orientation	Enabled	

audit_asientos_contables_trigger
asientos_contables
audit_table_changes
AFTER INSERT
AFTER DELETE
AFTER UPDATE
ROW



audit_cpe_trigger
cpe
audit_table_changes
AFTER DELETE
AFTER INSERT
AFTER UPDATE
ROW



audit_cuentas_por_cobrar_trigger
cuentas_por_cobrar
audit_table_changes
AFTER UPDATE
AFTER DELETE
AFTER INSERT
ROW



audit_cuentas_por_pagar_trigger
cuentas_por_pagar
audit_table_changes
AFTER INSERT
AFTER DELETE
AFTER UPDATE
ROW



audit_gre_trigger
gre
audit_table_changes
AFTER UPDATE
AFTER DELETE
AFTER INSERT
ROW



audit_movimientos_bancarios_trigger
movimientos_bancarios
audit_table_changes
AFTER UPDATE
AFTER DELETE
AFTER INSERT
ROW



audit_ordenes_compra_trigger
ordenes_compra
audit_table_changes
AFTER UPDATE
AFTER DELETE
AFTER INSERT
ROW



audit_pedidos_venta_trigger
pedidos_venta
audit_table_changes
AFTER DELETE
AFTER UPDATE
AFTER INSERT
ROW



audit_rls_activos_fijos
activos_fijos
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_asignacion_costos
asignacion_costos
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_beneficios
beneficios
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_cajas
cajas
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_calendario_empresa
calendario_empresa
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_candidatos
candidatos
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_capacitaciones
capacitaciones
audit_rls_access
BEFORE DELETE
BEFORE UPDATE
BEFORE INSERT
ROW



audit_rls_centros_costo
centros_costo
audit_rls_access
BEFORE DELETE
BEFORE UPDATE
BEFORE INSERT
ROW



audit_rls_cobranzas
cobranzas
audit_rls_access
BEFORE DELETE
BEFORE INSERT
BEFORE UPDATE
ROW



audit_rls_conceptos_planilla
conceptos_planilla
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_conciliaciones_bancarias
conciliaciones_bancarias
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_configuracion_retenciones
configuracion_retenciones
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_cuentas_bancarias
cuentas_bancarias
audit_rls_access
BEFORE UPDATE
BEFORE DELETE
BEFORE INSERT
ROW



audit_rls_cuentas_por_pagar
cuentas_por_pagar
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_departamentos
departamentos
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_depreciaciones
depreciaciones
audit_rls_access
BEFORE UPDATE
BEFORE DELETE
BEFORE INSERT
ROW



audit_rls_detalle_retenciones_categoria
detalle_retenciones_categoria
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_egresos
egresos
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_empleado_beneficios
empleado_beneficios
audit_rls_access
BEFORE DELETE
BEFORE UPDATE
BEFORE INSERT
ROW



audit_rls_empleado_capacitaciones
empleado_capacitaciones
audit_rls_access
BEFORE DELETE
BEFORE UPDATE
BEFORE INSERT
ROW



audit_rls_empleado_horarios
empleado_horarios
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_empleado_planilla_conceptos
empleado_planilla_conceptos
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_evaluaciones
evaluaciones
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_event_processing_log
event_processing_log
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_expediente_documentos
expediente_documentos
audit_rls_access
BEFORE DELETE
BEFORE INSERT
BEFORE UPDATE
ROW



audit_rls_gastos
gastos
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_gestiones_cobranza
gestiones_cobranza
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_horarios_trabajo
horarios_trabajo
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_inventarios_permanentes
inventarios_permanentes
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_libro_retenciones
libro_retenciones
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_libros_electronicos_sunat
libros_electronicos_sunat
audit_rls_access
BEFORE DELETE
BEFORE INSERT
BEFORE UPDATE
ROW



audit_rls_liquidaciones
liquidaciones
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_movimientos_consignacion
movimientos_consignacion
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_pagos_empleados
pagos_empleados
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW



audit_rls_pagos_facturas
pagos_facturas
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_periodos_contables
periodos_contables
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_planillas
planillas
audit_rls_access
BEFORE UPDATE
BEFORE DELETE
BEFORE INSERT
ROW



audit_rls_registro_consignaciones
registro_consignaciones
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_saldos_iniciales_cuentas
saldos_iniciales_cuentas
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
ROW



audit_rls_solicitudes
solicitudes
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_usuario_configuracion
usuario_configuracion
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rls_vacantes
vacantes
audit_rls_access
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW



audit_rol_permisos
rol_permisos
audit_trigger_function
AFTER INSERT
AFTER UPDATE
AFTER DELETE
ROW



audit_usuarios_sistema
usuarios_sistema
audit_trigger_function
AFTER UPDATE
AFTER INSERT
AFTER DELETE
ROW



prevent_system_role_deletion_trigger
roles
prevent_system_role_deletion
BEFORE DELETE
ROW



sync_usuario_activo_estado_trigger
usuarios_sistema
sync_usuario_activo_estado
BEFORE UPDATE
ROW



trg_rls_alert
rls_audit_log
trigger_rls_alert
AFTER INSERT
ROW



trigger_auditoria_documento
documentos
registrar_auditoria_documento
AFTER UPDATE
AFTER INSERT
ROW



trigger_calcular_cantidad_pendiente_oc
orden_compra_detalles
calcular_cantidad_pendiente_oc
BEFORE INSERT
BEFORE UPDATE
ROW



trigger_calcular_totales_cotizacion_compra
cotizacion_compra_detalles
calcular_totales_cotizacion_compra
AFTER UPDATE
AFTER DELETE
AFTER INSERT
ROW



trigger_calcular_totales_devolucion_proveedor
devolucion_items
calcular_totales_devolucion_proveedor
AFTER DELETE
AFTER INSERT
AFTER UPDATE
ROW



trigger_calcular_totales_orden_compra
orden_compra_detalles
calcular_totales_orden_compra
AFTER INSERT
AFTER UPDATE
AFTER DELETE
ROW



trigger_comunicaciones_baja_updated_at
comunicaciones_baja
update_updated_at_column
BEFORE UPDATE
ROW



trigger_copiar_metodos_pago_on_tenant_create
empresa_config
trigger_copiar_metodos_pago_nuevo_tenant
AFTER INSERT
ROW



trigger_cpe_crear_documento
cpe
trigger_crear_documento_para_cpe
AFTER INSERT
ROW



trigger_empresa_config_updated_at
empresa_config
update_empresa_config_updated_at
BEFORE UPDATE
ROW



trigger_generate_gre_numero
gre_guias
generate_gre_numero
BEFORE UPDATE
BEFORE INSERT
ROW



trigger_plantillas_asientos_updated_at
plantillas_asientos
update_plantillas_asientos_updated_at
BEFORE UPDATE
ROW



trigger_plantillas_detalle_updated_at
plantillas_asientos_detalle
update_plantillas_asientos_updated_at
BEFORE UPDATE
ROW



trigger_presupuestos_updated_at
presupuestos
update_presupuestos_updated_at
BEFORE UPDATE
ROW



trigger_resumenes_diarios_updated_at
resumenes_diarios
update_updated_at_column
BEFORE UPDATE
ROW



trigger_seed_catalogos_on_tenant_create
empresa_config
trigger_seed_catalogos_nuevo_tenant
AFTER INSERT
ROW



trigger_update_conciliaciones_bancarias_updated_at
conciliaciones_bancarias
update_conciliaciones_bancarias_updated_at
BEFORE UPDATE
ROW



trigger_update_outbox_events_updated_at
outbox_events
update_outbox_events_updated_at
BEFORE UPDATE
ROW



trigger_update_wizard_progress_timestamp
wizard_progress
update_wizard_progress_timestamp
BEFORE UPDATE
ROW



trigger_validar_stock_detalle_venta
detalle_ventas_pos
validar_stock_antes_detalle_venta
BEFORE INSERT
ROW



trigger_validar_vigencia_cotizacion_compra
cotizaciones_compra
validar_vigencia_cotizacion_compra
BEFORE UPDATE
BEFORE INSERT
ROW



update_documentos_updated_at
documentos
update_updated_at_column
BEFORE UPDATE
ROW



update_fe_configuracion_updated_at
fe_configuracion
update_updated_at_column
BEFORE UPDATE
ROW



validate_wizard_completion_trigger
wizard_progress
check_wizard_completion_validity
BEFORE INSERT
BEFORE UPDATE
ROW


|| functions . Database Functions
Docs

schema

public

Search for a function

Return Type

Security

Create a new function

Name	Arguments	Return type	Security	

_ensure_rls_if_tenant
p_table regclass

void

Invoker



acknowledge_rls_alert
p_alert_id uuid, p_acknowledged_by uuid DEFAULT NULL::uuid

boolean

Definer



acquire_job_lock
p_lock_key text, p_lock_ttl_seconds integer DEFAULT 300

boolean

Definer



actualizar_stock_reservado
p_producto_id uuid, p_cantidad numeric, p_operacion character varying

void

Invoker



add_rls_audit_trigger
p_table_name text

void

Definer



add_tenant_id_if_missing
p_table_name text

void

Definer



algorithm_sign
signables text, secret text, algorithm text

text

Invoker



audit_rls_access
–

trigger	
Definer



audit_table_changes
–

trigger	
Definer



audit_trigger_function
–

trigger	
Invoker



calcular_cantidad_pendiente_oc
–

trigger	
Invoker



calcular_proxima_generacion
p_tipo_recurrencia character varying, p_dia_generacion integer, p_fecha_base date DEFAULT CURRENT_DATE

date

Invoker



calcular_totales_cotizacion_compra
–

trigger	
Invoker



calcular_totales_devolucion_proveedor
–

trigger	
Invoker



calcular_totales_orden_compra
–

trigger	
Invoker



check_wizard_completion_validity
–

trigger	
Invoker



cleanup_expired_sessions
–

integer

Invoker



cleanup_old_audit_logs
days_to_keep integer DEFAULT 365

integer

Invoker



cleanup_old_rls_alerts
p_retention_days integer DEFAULT 90

integer

Definer



cleanup_old_rls_audit_logs
p_retention_days integer DEFAULT 90

integer

Definer



cleanup_processed_events
–

integer

Invoker



copiar_metodos_pago_globales_a_tenant
p_tenant_id uuid

integer

Definer



crear_documento_desde_cpe
p_cpe_id uuid

uuid

Definer



create_index_if_not_exists
p_index_name text, p_table_name text, p_columns text, p_where_clause text DEFAULT NULL::text

void

Definer



create_tenant_isolation_policy
p_table_name text, p_policy_suffix text DEFAULT 'tenant_isolation'::text

boolean

Invoker



create_user_session
p_user_id uuid, p_usuario_sistema_id uuid, p_tenant_id uuid, p_session_token text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_expires_in_hours integer DEFAULT 8

uuid

Definer



debug_tenant_context
–

TABLE(setting_name text, setting_value text)

Definer



decrementar_stock_reservado
p_producto_id uuid, p_cantidad numeric

void

Definer



descontar_stock
p_producto_id uuid, p_cantidad numeric

void

Invoker



descontar_stock_y_liberar_reserva
p_producto_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text

uuid

Definer



diagnostico_cpe_documentos
–

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_pos
p_tenant_id uuid DEFAULT NULL::uuid

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_seguridad_rls
–

TABLE(tabla text, rls_habilitado boolean, num_politicas bigint, estado text)

Invoker



disable_rls_alert
p_alert_name text

boolean

Definer



drop_all_policies
p_table_name text

integer

Invoker



enable_rls_alert
p_alert_name text

boolean

Definer



enable_rls_on_table
p_table_name text

boolean

Invoker



enable_rls_tenant_isolation
p_table_name text

void

Definer



evaluar_crecimiento
–

text

Invoker



evaluar_liquidez
efectivo numeric, cuentas_por_pagar numeric

text

Invoker



evaluar_rentabilidad
margen_bruto numeric

text

Invoker



generar_numero_comunicacion_baja
p_tenant_id uuid, p_fecha date

character varying

Invoker



generar_numero_resumen_diario
p_tenant_id uuid, p_fecha date

character varying

Invoker



generate_gre_numero
–

trigger	
Invoker



generate_rls_security_report
p_days integer DEFAULT 7

TABLE(metric text, value text)

Definer



get_alert_statistics
p_days integer DEFAULT 7

TABLE(metric text, value text)

Definer



get_current_tenant_id
–

uuid

Invoker



get_current_user_id
–

uuid

Invoker



get_datos_historicos_completos
meses integer DEFAULT 12

TABLE(periodo text, ventas numeric, gastos numeric, utilidad numeric, cuentas_por_cobrar numeric, cuentas_por_pagar numeric)

Definer



get_kpis_financieros
–

TABLE(efectivo_disponible numeric, ventas_ultimos_30dias numeric, gastos_ultimos_30dias numeric, utilidad_ultimos_30dias numeric, cuentas_por_cobrar numeric, cuentas_por_pagar numeric, rotacion_inventario numeric, margen_bruto numeric, liquidez text, rentabilidad text, crecimiento text)

Definer



get_pending_outbox_events
p_limit integer DEFAULT 100, p_tenant_id uuid DEFAULT NULL::uuid

TABLE(id uuid, tenant_id uuid, event_type character varying, event_data jsonb, retry_count integer, max_retries integer)

Invoker



incrementar_stock_reservado
p_producto_id uuid, p_cantidad numeric

void

Definer



is_super_admin
p_user_id uuid

boolean

Definer



log_audit_action
p_table_name text, p_operation text, p_resource_id uuid, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_action_description text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text

uuid

Definer



log_rls_violation
p_table_name text, p_operation text, p_attempted_tenant_id uuid DEFAULT NULL::uuid, p_violation_type text DEFAULT 'cross_tenant'::text, p_severity text DEFAULT 'WARNING'::text, p_metadata jsonb DEFAULT NULL::jsonb

uuid

Definer



mark_outbox_event_completed
p_event_id uuid

void

Invoker



mark_outbox_event_failed
p_event_id uuid, p_error_message text

void

Invoker



mark_outbox_event_processing
p_event_id uuid

void

Invoker



migrar_cpes_a_documentos
–

TABLE(cpes_procesados integer, documentos_creados integer, errores text[])

Invoker



migrar_detalles_ventas_pos_desde_observaciones
–

TABLE(ventas_procesadas integer, detalles_creados integer, errores text[])

Invoker



obtener_costos_fijos_mes_actual
–

numeric

Invoker



obtener_estadisticas_logs_auditoria
–

jsonb

Definer



obtener_siguiente_numero_documento
p_tenant_id uuid, p_tipo_documento character varying, p_serie character varying

character varying

Invoker



obtener_siguiente_numero_serie
p_tenant_id uuid, p_tipo_documento character varying, p_serie character varying

character varying

Invoker



obtener_stock_info
p_producto_id uuid

TABLE(producto_id uuid, stock_total numeric, stock_reservado numeric, stock_disponible numeric)

Invoker



prevent_system_role_deletion
–

trigger	
Invoker



procesar_pago_cxc_atomico
p_tenant_id uuid, p_cxc_id uuid, p_monto numeric, p_fecha_pago date, p_metodo_pago text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_cuenta_bancaria_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT 'PAGO'::text, p_aplica_retencion boolean DEFAULT false, p_retencion_monto numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text

jsonb

Definer



procesar_pago_cxp_atomico
p_tenant_id uuid, p_cxp_id uuid, p_monto numeric, p_fecha_pago date, p_metodo_pago text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_cuenta_bancaria_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text

jsonb

Definer



procesar_pago_lote
p_tenant_id uuid, p_cuenta_bancaria_id uuid, p_fecha_pago date, p_metodo_pago text, p_referencia_lote text, p_observaciones text, p_pagos jsonb, p_created_by uuid DEFAULT NULL::uuid

jsonb

Definer



refrescar_estados_financieros
p_tenant_id uuid, p_anio integer, p_mes integer

void

Definer



registrar_auditoria_documento
–

trigger	
Invoker



registrar_entrada_stock_atomico
p_producto_id uuid, p_almacen_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion timestamp with time zone DEFAULT NULL::timestamp with time zone

uuid

Definer



registrar_movimiento_almacen
p_producto_id uuid, p_almacen_id uuid, p_tipo text, p_cantidad numeric, p_referencia_tipo text, p_referencia_id uuid, p_notas text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion date DEFAULT NULL::date

void

Definer



release_job_lock
p_lock_key text

void

Definer



reservar_stock_atomico
p_producto_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text

uuid

Definer



revoke_all_user_sessions
p_usuario_sistema_id uuid

integer

Definer



revoke_user_session
p_session_token text

boolean

Definer



rma_retorno_inventario
p_rma_item_id uuid, p_cantidad numeric, p_almacen_id uuid, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion date DEFAULT NULL::date

void

Definer



rotar_logs_auditoria
p_retention_days integer DEFAULT 365

jsonb

Definer



seed_plan_cuentas_tenant
p_tenant_id uuid

void

Invoker



send_rls_alert
p_alert_name text, p_severity text, p_message text, p_violation_count integer DEFAULT 1, p_affected_table text DEFAULT NULL::text, p_user_email text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT NULL::jsonb, p_tenant_id uuid DEFAULT NULL::uuid

uuid

Definer



set_config
setting text, value text

text

Definer



sign
payload json, secret text, algorithm text DEFAULT 'HS256'::text

text

Invoker



stock_disponible
p_producto_id uuid

numeric

Invoker



sync_usuario_activo_estado
–

trigger	
Invoker



table_has_column
p_table_name text, p_column_name text

boolean

Invoker



trigger_copiar_metodos_pago_nuevo_tenant
–

trigger	
Definer



trigger_crear_documento_para_cpe
–

trigger	
Definer



trigger_rls_alert
–

trigger	
Definer



trigger_seed_catalogos_nuevo_tenant
–

trigger	
Definer



try_cast_double
inp text

double precision

Invoker



update_conciliaciones_bancarias_updated_at
–

trigger	
Invoker



update_empresa_config_updated_at
–

trigger	
Invoker



update_outbox_events_updated_at
–

trigger	
Invoker



update_plantillas_asientos_updated_at
–

trigger	
Invoker



update_presupuestos_updated_at
–

trigger	
Invoker



update_session_activity
p_session_token text

boolean

Definer



update_updated_at_column
–

trigger	
Invoker



update_wizard_progress_timestamp
–

trigger	
Invoker



url_decode
data text

bytea

Invoker



url_encode
data bytea

text

Invoker



user_has_permission
p_modulo text, p_accion text, p_recurso text

boolean

Definer



validar_balance_plantilla
p_plantilla_id uuid

TABLE(es_valido boolean, total_debe numeric, total_haber numeric, diferencia numeric, mensaje text)

Invoker



validar_stock_antes_detalle_venta
–

trigger	
Invoker



validar_vigencia_cotizacion_compra
–

trigger	
Invoker



validate_user_session
p_session_token text

TABLE(session_id uuid, user_id uuid, usuario_sistema_id uuid, tenant_id uuid, is_valid boolean, expires_at timestamp with time zone)

Definer



validate_wizard_completion
p_tenant_id uuid

boolean

Definer



verificar_stock_disponible
p_producto_id uuid, p_cantidad numeric

boolean

Invoker



verify
token text, secret text, algorithm text DEFAULT 'HS256'::text

TABLE(header json, payload json, valid boolean)

Invoker


 Database Functions
Docs

schema

public

Search for a function

Return Type

Security

Create a new function

Name	Arguments	Return type	Security	

_ensure_rls_if_tenant
p_table regclass

void

Invoker



acknowledge_rls_alert
p_alert_id uuid, p_acknowledged_by uuid DEFAULT NULL::uuid

boolean

Definer



acquire_job_lock
p_lock_key text, p_lock_ttl_seconds integer DEFAULT 300

boolean

Definer



actualizar_stock_reservado
p_producto_id uuid, p_cantidad numeric, p_operacion character varying

void

Invoker



add_rls_audit_trigger
p_table_name text

void

Definer



add_tenant_id_if_missing
p_table_name text

void

Definer



algorithm_sign
signables text, secret text, algorithm text

text

Invoker



audit_rls_access
–

trigger	
Definer



audit_table_changes
–

trigger	
Definer



audit_trigger_function
–

trigger	
Invoker



calcular_cantidad_pendiente_oc
–

trigger	
Invoker



calcular_proxima_generacion
p_tipo_recurrencia character varying, p_dia_generacion integer, p_fecha_base date DEFAULT CURRENT_DATE

date

Invoker



calcular_totales_cotizacion_compra
–

trigger	
Invoker



calcular_totales_devolucion_proveedor
–

trigger	
Invoker



calcular_totales_orden_compra
–

trigger	
Invoker



check_wizard_completion_validity
–

trigger	
Invoker



cleanup_expired_sessions
–

integer

Invoker



cleanup_old_audit_logs
days_to_keep integer DEFAULT 365

integer

Invoker



cleanup_old_rls_alerts
p_retention_days integer DEFAULT 90

integer

Definer



cleanup_old_rls_audit_logs
p_retention_days integer DEFAULT 90

integer

Definer



cleanup_processed_events
–

integer

Invoker



copiar_metodos_pago_globales_a_tenant
p_tenant_id uuid

integer

Definer



crear_documento_desde_cpe
p_cpe_id uuid

uuid

Definer



create_index_if_not_exists
p_index_name text, p_table_name text, p_columns text, p_where_clause text DEFAULT NULL::text

void

Definer



create_tenant_isolation_policy
p_table_name text, p_policy_suffix text DEFAULT 'tenant_isolation'::text

boolean

Invoker



create_user_session
p_user_id uuid, p_usuario_sistema_id uuid, p_tenant_id uuid, p_session_token text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_expires_in_hours integer DEFAULT 8

uuid

Definer



debug_tenant_context
–

TABLE(setting_name text, setting_value text)

Definer



decrementar_stock_reservado
p_producto_id uuid, p_cantidad numeric

void

Definer



descontar_stock
p_producto_id uuid, p_cantidad numeric

void

Invoker



descontar_stock_y_liberar_reserva
p_producto_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text

uuid

Definer



diagnostico_cpe_documentos
–

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_pos
p_tenant_id uuid DEFAULT NULL::uuid

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_seguridad_rls
–

TABLE(tabla text, rls_habilitado boolean, num_politicas bigint, estado text)

Invoker



disable_rls_alert
p_alert_name text

boolean

Definer



drop_all_policies
p_table_name text

integer

Invoker



enable_rls_alert
p_alert_name text

boolean

Definer



enable_rls_on_table
p_table_name text

boolean

Invoker



enable_rls_tenant_isolation
p_table_name text

void

Definer



evaluar_crecimiento
–

text

Invoker



evaluar_liquidez
efectivo numeric, cuentas_por_pagar numeric

text

Invoker



evaluar_rentabilidad
margen_bruto numeric

text

Invoker



generar_numero_comunicacion_baja
p_tenant_id uuid, p_fecha date

character varying

Invoker



generar_numero_resumen_diario
p_tenant_id uuid, p_fecha date

character varying

Invoker



generate_gre_numero
–

trigger	
Invoker



generate_rls_security_report
p_days integer DEFAULT 7

TABLE(metric text, value text)

Definer



get_alert_statistics
p_days integer DEFAULT 7

TABLE(metric text, value text)

Definer



get_current_tenant_id
–

uuid

Invoker



get_current_user_id
–

uuid

Invoker



get_datos_historicos_completos
meses integer DEFAULT 12

TABLE(periodo text, ventas numeric, gastos numeric, utilidad numeric, cuentas_por_cobrar numeric, cuentas_por_pagar numeric)

Definer



get_kpis_financieros
–

TABLE(efectivo_disponible numeric, ventas_ultimos_30dias numeric, gastos_ultimos_30dias numeric, utilidad_ultimos_30dias numeric, cuentas_por_cobrar numeric, cuentas_por_pagar numeric, rotacion_inventario numeric, margen_bruto numeric, liquidez text, rentabilidad text, crecimiento text)

Definer



get_pending_outbox_events
p_limit integer DEFAULT 100, p_tenant_id uuid DEFAULT NULL::uuid

TABLE(id uuid, tenant_id uuid, event_type character varying, event_data jsonb, retry_count integer, max_retries integer)

Invoker



incrementar_stock_reservado
p_producto_id uuid, p_cantidad numeric

void

Definer



is_super_admin
p_user_id uuid

boolean

Definer



log_audit_action
p_table_name text, p_operation text, p_resource_id uuid, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_action_description text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text

uuid

Definer



log_rls_violation
p_table_name text, p_operation text, p_attempted_tenant_id uuid DEFAULT NULL::uuid, p_violation_type text DEFAULT 'cross_tenant'::text, p_severity text DEFAULT 'WARNING'::text, p_metadata jsonb DEFAULT NULL::jsonb

uuid

Definer



mark_outbox_event_completed
p_event_id uuid

void

Invoker



mark_outbox_event_failed
p_event_id uuid, p_error_message text

void

Invoker



mark_outbox_event_processing
p_event_id uuid

void

Invoker



migrar_cpes_a_documentos
–

TABLE(cpes_procesados integer, documentos_creados integer, errores text[])

Invoker



migrar_detalles_ventas_pos_desde_observaciones
–

TABLE(ventas_procesadas integer, detalles_creados integer, errores text[])

Invoker



obtener_costos_fijos_mes_actual
–

numeric

Invoker



obtener_estadisticas_logs_auditoria
–

jsonb

Definer



obtener_siguiente_numero_documento
p_tenant_id uuid, p_tipo_documento character varying, p_serie character varying

character varying

Invoker



obtener_siguiente_numero_serie
p_tenant_id uuid, p_tipo_documento character varying, p_serie character varying

character varying

Invoker



obtener_stock_info
p_producto_id uuid

TABLE(producto_id uuid, stock_total numeric, stock_reservado numeric, stock_disponible numeric)

Invoker



prevent_system_role_deletion
–

trigger	
Invoker



procesar_pago_cxc_atomico
p_tenant_id uuid, p_cxc_id uuid, p_monto numeric, p_fecha_pago date, p_metodo_pago text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_cuenta_bancaria_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT 'PAGO'::text, p_aplica_retencion boolean DEFAULT false, p_retencion_monto numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text

jsonb

Definer



procesar_pago_cxp_atomico
p_tenant_id uuid, p_cxp_id uuid, p_monto numeric, p_fecha_pago date, p_metodo_pago text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_cuenta_bancaria_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_notas text DEFAULT NULL::text

jsonb

Definer



procesar_pago_lote
p_tenant_id uuid, p_cuenta_bancaria_id uuid, p_fecha_pago date, p_metodo_pago text, p_referencia_lote text, p_observaciones text, p_pagos jsonb, p_created_by uuid DEFAULT NULL::uuid

jsonb

Definer



refrescar_estados_financieros
p_tenant_id uuid, p_anio integer, p_mes integer

void

Definer



registrar_auditoria_documento
–

trigger	
Invoker



registrar_entrada_stock_atomico
p_producto_id uuid, p_almacen_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion timestamp with time zone DEFAULT NULL::timestamp with time zone

uuid

Definer



registrar_movimiento_almacen
p_producto_id uuid, p_almacen_id uuid, p_tipo text, p_cantidad numeric, p_referencia_tipo text, p_referencia_id uuid, p_notas text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion date DEFAULT NULL::date

void

Definer



release_job_lock
p_lock_key text

void

Definer



reservar_stock_atomico
p_producto_id uuid, p_cantidad numeric, p_referencia_tipo text DEFAULT NULL::text, p_referencia_id text DEFAULT NULL::text, p_notas text DEFAULT NULL::text

uuid

Definer



revoke_all_user_sessions
p_usuario_sistema_id uuid

integer

Definer



revoke_user_session
p_session_token text

boolean

Definer



rma_retorno_inventario
p_rma_item_id uuid, p_cantidad numeric, p_almacen_id uuid, p_ubicacion_id uuid DEFAULT NULL::uuid, p_lote text DEFAULT NULL::text, p_fecha_expiracion date DEFAULT NULL::date

void

Definer



rotar_logs_auditoria
p_retention_days integer DEFAULT 365

jsonb

Definer



seed_plan_cuentas_tenant
p_tenant_id uuid

void

Invoker



send_rls_alert
p_alert_name text, p_severity text, p_message text, p_violation_count integer DEFAULT 1, p_affected_table text DEFAULT NULL::text, p_user_email text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT NULL::jsonb, p_tenant_id uuid DEFAULT NULL::uuid

uuid

Definer



set_config
setting text, value text

text

Definer



sign
payload json, secret text, algorithm text DEFAULT 'HS256'::text

text

Invoker



stock_disponible
p_producto_id uuid

numeric

Invoker



sync_usuario_activo_estado
–

trigger	
Invoker



table_has_column
p_table_name text, p_column_name text

boolean

Invoker



trigger_copiar_metodos_pago_nuevo_tenant
–

trigger	
Definer



trigger_crear_documento_para_cpe
–

trigger	
Definer



trigger_rls_alert
–

trigger	
Definer



trigger_seed_catalogos_nuevo_tenant
–

trigger	
Definer



try_cast_double
inp text

double precision

Invoker



update_conciliaciones_bancarias_updated_at
–

trigger	
Invoker



update_empresa_config_updated_at
–

trigger	
Invoker



update_outbox_events_updated_at
–

trigger	
Invoker



update_plantillas_asientos_updated_at
–

trigger	
Invoker



update_presupuestos_updated_at
–

trigger	
Invoker



update_session_activity
p_session_token text

boolean

Definer



update_updated_at_column
–

trigger	
Invoker



update_wizard_progress_timestamp
–

trigger	
Invoker



url_decode
data text

bytea

Invoker



url_encode
data bytea

text

Invoker



user_has_permission
p_modulo text, p_accion text, p_recurso text

boolean

Definer



validar_balance_plantilla
p_plantilla_id uuid

TABLE(es_valido boolean, total_debe numeric, total_haber numeric, diferencia numeric, mensaje text)

Invoker



validar_stock_antes_detalle_venta
–

trigger	
Invoker



validar_vigencia_cotizacion_compra
–

trigger	
Invoker



validate_user_session
p_session_token text

TABLE(session_id uuid, user_id uuid, usuario_sistema_id uuid, tenant_id uuid, is_valid boolean, expires_at timestamp with time zone)

Definer



validate_wizard_completion
p_tenant_id uuid

boolean

Definer



verificar_stock_disponible
p_producto_id uuid, p_cantidad numeric

boolean

Invoker



verify
token text, secret text, algorithm text DEFAULT 'HS256'::text

TABLE(header json, payload json, valid boolean)

Invoker


