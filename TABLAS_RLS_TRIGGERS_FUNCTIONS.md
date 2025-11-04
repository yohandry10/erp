 Database Tables

schema

public


Search for a table

New table
Name	Description	Rows (Estimated)	Size (Estimated)	Realtime Enabled	
activos_fijos

Activos fijos por tenant - RLS habilitado	0	48 kB	
14 columns

almacen_ubicaciones

No description

0	24 kB	
9 columns

almacenes

No description

0	32 kB	
10 columns

asientos_contables

Cabecera de asientos contables	0	160 kB	
12 columns

asientos_contables_rrhh

Asientos contables generados por planillas RRHH	0	32 kB	
9 columns

asignacion_costos

Asignación de costos por tenant - RLS habilitado	0	32 kB	
9 columns

asistencia

Control de asistencia diaria de empleados	0	40 kB	
12 columns

audit_log

Log de auditoría para cambios en datos críticos	329	992 kB	
15 columns

audit_log_archive

Archivo de logs de auditoría con RLS habilitado (migración 077). Solo lectura por tenant, escritura por sistema.	0	72 kB	
16 columns

auditoria

Registro de auditoría general del sistema. RLS habilitado en migración 053.	0	40 kB	
11 columns

auditoria_cotizaciones

No description

0	16 kB	
7 columns

auth_login_attempts

Registro de intentos de login (exitosos y fallidos) para auditoría y seguridad	45	144 kB	
8 columns

beneficios

Catálogo de beneficios por tenant - RLS habilitado - Tabla maestra RRHH	0	48 kB	
10 columns

cajas

Cajas por tenant - RLS habilitado	0	104 kB	
11 columns

calendario_empresa

Calendario de empresa por tenant - RLS habilitado	0	48 kB	
8 columns

candidatos

Candidatos a vacantes por tenant - RLS habilitado - Tabla transaccional RRHH	0	24 kB	
13 columns

capacitaciones

Capacitaciones ofrecidas por tenant - RLS habilitado - Tabla transaccional RRHH	0	24 kB	
13 columns

centros_costo

Centros de costo por tenant - RLS habilitado	0	80 kB	
9 columns

clientes

No description

0	160 kB	
26 columns

cobranzas

Gestión de cobranzas a clientes	0	72 kB	
16 columns

conceptos_planilla

Conceptos de planilla por tenant - RLS habilitado - Tabla transaccional RRHH	0	64 kB	
13 columns

conciliaciones_bancarias

Conciliaciones bancarias por período	0	64 kB	
16 columns

configuracion_fiscal

Configuración fiscal específica por país (SUNAT/DIAN)	0	48 kB	
24 columns

configuracion_retenciones

Configuración de retenciones por tenant - RLS habilitado	0	56 kB	
9 columns

contratos

Contratos laborales de los empleados.	0	48 kB	
17 columns

cotizacion_compra_detalles

Detalle de productos en cotizaciones de compra	0	56 kB	
8 columns

cotizacion_detalles

No description

0	16 kB	
13 columns

cotizaciones

No description

0	176 kB	
26 columns

cotizaciones_compra

Cotizaciones de compra solicitadas a proveedores	0	144 kB	
16 columns

cpe

Comprobantes de Pago Electrónicos. Soporta reintentos automáticos con backoff exponencial para errores técnicos.	31	376 kB	
32 columns

cuentas_bancarias

Cuentas bancarias de la empresa	0	88 kB	
11 columns

cuentas_por_cobrar

Control de cuentas por cobrar a clientes	0	64 kB	
21 columns

cuentas_por_pagar

Cuentas por pagar a proveedores	0	88 kB	
25 columns

cxc_pagos

No description

0	48 kB	
19 columns

departamentos

Departamentos organizacionales por tenant - RLS habilitado - Tabla maestra RRHH	0	48 kB	
5 columns

depreciaciones

Depreciaciones de activos fijos por tenant - RLS habilitado	0	32 kB	
8 columns

detalle_asientos

Detalle de movimientos contables	0	88 kB	
9 columns

detalle_retenciones_categoria

Detalle de retenciones por categoría por tenant - RLS habilitado	0	24 kB	
10 columns

detalle_ventas_pos

No description

0	112 kB	
11 columns

devolucion_items

Detalle de items devueltos a proveedores	0	56 kB	
13 columns

devoluciones_proveedor

Devoluciones de mercancía rechazada o defectuosa a proveedores	0	96 kB	
18 columns

documento_archivos

Archivos adjuntos de documentos (PDF, XML, CDR)	0	16 kB	
19 columns

documento_auditoria

Auditoría de todas las operaciones sobre documentos	0	16 kB	
13 columns

documento_detalles

Detalle de líneas/items de documentos	0	16 kB	
31 columns

documento_series

Series y numeración de documentos por tipo	0	24 kB	
21 columns

documentos

Tabla principal de gestión documental y facturación electrónica	0	72 kB	
80 columns

egresos

Control de egresos y pagos de la empresa	0	80 kB	
15 columns

empleado_beneficios

Relación empleado-beneficios por tenant - RLS habilitado	0	24 kB	
10 columns

empleado_capacitaciones

Relación empleado-capacitaciones por tenant - RLS habilitado	0	24 kB	
11 columns

empleado_horarios

Relación empleado-horarios por tenant - RLS habilitado	0	16 kB	
8 columns

empleado_planilla

Detalle de planilla por empleado	0	96 kB	
19 columns

empleado_planilla_conceptos

Relación empleado-conceptos planilla por tenant - RLS habilitado	51	88 kB	
7 columns

empleados

Información de los empleados de la empresa.	0	80 kB	
22 columns

empresa_config

Configuración general de la empresa	1	256 kB	
95 columns

evaluaciones

Evaluaciones de desempeño por tenant - RLS habilitado - Tabla transaccional RRHH	0	32 kB	
17 columns

event_processing_log

Log de procesamiento de eventos por tenant - RLS habilitado	0	48 kB	
8 columns

expediente_documentos

Documentos de expediente de empleados por tenant - RLS habilitado	0	24 kB	
11 columns

fe_configuracion

Configuración de facturación electrónica y certificados	0	24 kB	
62 columns

gastos

Registro de gastos operativos, administrativos y financieros	0	80 kB	
29 columns

gestiones_cobranza

Historial de gestiones de cobranza	0	56 kB	
11 columns

gre

Guías de Remisión Electrónicas. RLS completo habilitado en migración 053.	0	56 kB	
15 columns

gre_guias

Guías de Remisión Electrónicas. Soporta reintentos automáticos con backoff exponencial para errores técnicos.	0	280 kB	
33 columns

historial_pagos_planilla

Historial de pagos realizados por planilla	0	80 kB	
11 columns

horarios_trabajo

Horarios de trabajo por tenant - RLS habilitado - Tabla maestra RRHH	0	48 kB	
17 columns

integration_logs

Logs of external service integrations (SUNAT, GRE, etc.)	12	144 kB	
14 columns

inventarios_permanentes

Inventarios permanentes por tenant - RLS habilitado	0	32 kB	
14 columns

libro_retenciones

Libro de retenciones por tenant - RLS habilitado	0	56 kB	
15 columns

libros_electronicos_sunat

Libros electrónicos SUNAT por tenant - RLS habilitado	0	80 kB	
10 columns

liquidaciones

Liquidaciones de empleados por tenant - RLS habilitado - Tabla transaccional RRHH	0	48 kB	
17 columns

logistica_eventos

No description

0	24 kB	
7 columns

metodos_pago

No description

4	72 kB	
9 columns

movimientos_bancarios

Movimientos bancarios de ingresos (cobros) y egresos (pagos)	0	120 kB	
23 columns

movimientos_consignacion

Movimientos de consignación por tenant - RLS habilitado	0	40 kB	
10 columns

movimientos_inventario

Movimientos de inventario del módulo Ventas. Incluye RESERVA y LIBERACION para control de pedidos	0	56 kB	
10 columns

M
mv_balance_comprobacion

Vista materializada del Balance de Comprobación por tenant, período y cuenta	-	-	
11 columns

M
mv_balance_general

Vista materializada del Balance General por tenant y período	-	-	
27 columns

M
mv_estado_resultados

Vista materializada del Estado de Resultados (P&L) por tenant y período	-	-	
14 columns

notificaciones

System notifications for users about configuration issues, certificate expiration, etc.	0	80 kB	
12 columns

oc_aprobaciones

Registro de aprobaciones de órdenes de compra por nivel	0	56 kB	
10 columns

orden_compra_detalles

Detalle de productos en órdenes de compra	4	96 kB	
12 columns

ordenes_compra

Órdenes de compra a proveedores	3	272 kB	
32 columns

outbox_events

Tabla para persistir eventos antes de procesarlos (Outbox Pattern). Garantiza entrega atómica de eventos.	0	80 kB	
17 columns

pagos_empleados

No description

0	64 kB	
14 columns

pagos_facturas

Registro de pagos recibidos de clientes	0	56 kB	
9 columns

pagos_lote

Registro de lotes de pagos procesados para garantizar idempotencia	0	56 kB	
16 columns

pagos_ventas

No description

0	24 kB	
9 columns

paises

Países soportados por el sistema ERP	3	40 kB	
9 columns

pedido_aprobaciones

No description

0	24 kB	
8 columns

pedido_backorders

No description

0	24 kB	
13 columns

pedido_despachos

No description

0	24 kB	
12 columns

pedidos_venta

Pedidos de venta del módulo Ventas (flujo: Cotización → Pedido → Factura). NO confundir con tabla "ventas" o "ventas_pos"	0	72 kB	
24 columns

pedidos_venta_detalle

Detalle de pedidos de venta del módulo Ventas. NO confundir con "venta_detalles" o "detalle_ventas_pos"	0	40 kB	
11 columns

periodos_contables

Períodos contables por tenant - RLS habilitado	0	72 kB	
7 columns

permisos

Permisos granulares del sistema por módulo, acción y recurso	100	80 kB	
8 columns

plan_cuentas

Plan de cuentas contables según PCGE Perú	0	128 kB	
14 columns

planillas

Planillas de pago por tenant - RLS habilitado - Tabla transaccional RRHH	0	80 kB	
20 columns

plantillas_asientos

Plantillas de asientos contables recurrentes - RLS habilitado	0	64 kB	
19 columns

plantillas_asientos_detalle

Detalle de líneas contables de cada plantilla - RLS habilitado	0	56 kB	
13 columns

plantillas_asientos_historial

Historial de asientos generados desde plantillas - RLS habilitado	0	56 kB	
10 columns

presupuestos

Presupuestos por centro de costo, cuenta contable y período - RLS habilitado	0	72 kB	
16 columns

producto_existencias

No description

0	24 kB	
14 columns

productos

No description

0	176 kB	
30 columns

proveedores

Catálogo de proveedores de la empresa	3	128 kB	
16 columns

recepcion_items

Detalle de items recibidos en cada recepción	0	112 kB	
13 columns

recepciones

Recepciones de mercancía de órdenes de compra	0	144 kB	
13 columns

registro_consignaciones

Registro de consignaciones por tenant - RLS habilitado	0	64 kB	
20 columns

rls_alert_config

Configuración de alertas de violaciones RLS. RLS habilitado en migración 053.	4	48 kB	
13 columns

rls_alert_history

Historial de alertas RLS disparadas. RLS habilitado en migración 053.	0	72 kB	
16 columns

rls_audit_log

Registro de auditoría de intentos de acceso bloqueados por RLS. NOTA: Esta tabla NO tiene RLS habilitado para permitir que los triggers escriban sin restricciones. El acceso debe ser controlado mediante permisos de PostgreSQL.	0	96 kB	
19 columns

rma_eventos

No description

0	16 kB	
8 columns

rma_items

No description

0	16 kB	
13 columns

rma_solicitudes

No description

0	16 kB	
17 columns

rol_permisos

Asignación de permisos a roles	129	104 kB	
5 columns

roles

No description

2	64 kB	
9 columns

rrhh_pagos

Pagos individuales de empleados por planilla	0	72 kB	
13 columns

saldos_iniciales_cuentas

Saldos iniciales de cuentas por tenant - RLS habilitado	0	32 kB	
7 columns

sesiones_caja

No description

18	80 kB	
20 columns

sire_files

Archivos SIRE (Sistema Integrado de Registros Electrónicos - SUNAT). RLS completo habilitado en migración 053.	1	128 kB	
11 columns

solicitudes

Solicitudes de empleados por tenant - RLS habilitado - Tabla transaccional RRHH	0	32 kB	
15 columns

stock_movimientos

Movimientos de stock con RLS habilitado (migración 076)	0	96 kB	
9 columns

tenants

Vista de compatibilidad que expone empresa_config como tenants	-	-	
14 columns

tipos_cambio

Tipos de cambio diarios USD-PEN	0	40 kB	
5 columns

tipos_documentos_fiscales

Tipos de documentos fiscales disponibles por país	0	80 kB	
10 columns

tipos_impuestos

Tipos de impuestos y tasas aplicables por país	0	72 kB	
10 columns

user_roles

No description

5	56 kB	
5 columns

user_sessions

Sesiones activas de usuarios para control de acceso	1	128 kB	
9 columns

users

Tabla de usuarios con RLS habilitado (migración 077). Los usuarios solo pueden ver/editar su propio perfil.	0	48 kB	
6 columns

usuario_configuracion

Configuración de usuarios por tenant - RLS habilitado	0	40 kB	
10 columns

usuarios_con_rol_unico

No description

-	-	
8 columns

usuarios_con_roles

No description

-	-	
8 columns

usuarios_sistema

No description

2	168 kB	
20 columns

usuarios_sistemas

Usuarios de sistemas externos por tenant - RLS habilitado	0	64 kB	
9 columns

v_costos_fijos_mensuales

No description

-	-	
4 columns

v_documentos_completos

No description

-	-	
18 columns

v_documentos_pendientes_sunat

No description

-	-	
8 columns

v_gastos_resumen

No description

-	-	
8 columns

v_indices_tenant_created_summary

Resumen de índices creados en tenant_id y created_at/timestamp para optimización de queries	-	-	
6 columns

v_indices_tenant_finanzas

Vista de resumen de índices tenant_id en tablas del módulo Finanzas	-	-	
6 columns

v_kpis_sunat_multitenant

No description

-	-	
7 columns

v_otif_multialmacen

No description

-	-	
10 columns

v_performance_indices_finanzas

Vista de análisis de performance de índices tenant_id en módulo Finanzas	-	-	
7 columns

v_rls_alerts_recent

Alertas RLS de las últimas 24 horas	-	-	
10 columns

v_rls_alerts_summary

Resumen de alertas RLS de los últimos 7 días	-	-	
7 columns

v_rls_alerts_unacknowledged

Alertas RLS pendientes de reconocimiento	-	-	
9 columns

v_rls_policies_finanzas

Vista detallada de políticas RLS en tablas del módulo Finanzas	-	-	
8 columns

v_rls_status_all_tables

Vista consolidada del estado de RLS en todas las 45 tablas críticas organizadas por módulo	-	-	
6 columns

v_rls_status_contabilidad

Vista de resumen del estado de RLS en tablas del módulo Contabilidad	-	-	
5 columns

v_rls_status_empleado_relaciones

Vista de resumen del estado de RLS en tablas de relación empleado_* con información de relaciones FK	-	-	
6 columns

v_rls_status_finanzas

Vista de resumen del estado de RLS en tablas del módulo Finanzas	-	-	
6 columns

v_rls_status_rrhh_maestras

Vista de resumen del estado de RLS en tablas maestras del módulo RRHH con información de relaciones FK	-	-	
7 columns

v_rls_status_rrhh_transaccionales

Vista de resumen del estado de RLS en tablas transaccionales del módulo RRHH con información de relaciones FK	-	-	
7 columns

v_rls_summary_by_module

Resumen del estado de RLS agrupado por módulo con porcentajes de cobertura	-	-	
6 columns

v_rls_violations_by_table

Resumen de violaciones RLS agrupadas por tabla	-	-	
9 columns

v_rls_violations_by_user

Usuarios con más intentos de violación RLS	-	-	
7 columns

v_rls_violations_hourly

Tendencia de violaciones RLS por hora (últimos 7 días)	-	-	
5 columns

v_rls_violations_recent

Violaciones RLS de las últimas 24 horas	-	-	
9 columns

v_tenant_id_status_finanzas

Vista de resumen del estado de tenant_id en tablas del módulo Finanzas	-	-	
4 columns

v_usuarios_con_roles

No description

-	-	
8 columns

vacantes

Vacantes de empleo por tenant - RLS habilitado - Tabla transaccional RRHH	0	24 kB	
15 columns

validaciones_sunat

Stores validation results for SUNAT certificates, RUC configuration, and documents	0	48 kB	
9 columns

venta_detalles

No description

0	16 kB	
13 columns

ventas

No description

0	56 kB	
25 columns

ventas_pos

No description

9	232 kB	
26 columns

vista_balance_comprobacion

No description

-	-	
10 columns

vista_kardex_valorizado

No description

-	-	
11 columns

vista_pos_productos

Vista de productos para POS. IMPORTANTE: usa stock (no stock_actual). Columnas marca, subcategoria, precio_mayorista, precio_especial no existen en productos y se devuelven como valores por defecto.	-	-	
16 columns

vista_registro_compras

No description

-	-	
10 columns

vw_cpe_documentos_auditoria

Vista de auditoría que muestra la integridad entre CPEs y documentos	-	-	
15 columns

vw_devoluciones_detalle

Vista detallada de devoluciones con información de orden, proveedor y productos	-	-	
20 columns

vw_inventario_kardex_resumen

Resumen valorizado por producto y almacén. Base para dashboards y control contable.	-	-	
8 columns

vw_inventario_recepciones

Recepciones de inventario con totales valorizados por tenant. Alimenta los dashboards de logística y CxP.	-	-	
17 columns

vw_kardex_valorizado

Vista de movimientos valorizados de inventario derivados de recepciones. Usa el tenant_id de recepciones para mantener RLS.	-	-	
21 columns

vw_ordenes_compra_abiertas

Vista de órdenes de compra con pendientes de recibir	-	-	
13 columns

vw_recepciones_detalle

Vista detallada de recepciones con información de orden, proveedor y productos	-	-	
18 columns

vw_ventas_pos_completas

Vista de ventas POS con información de detalles (en tabla o en observaciones)	-	-	
20 columns

wizard_progress

Tracks configuration wizard progress for each tenant	2	176 kB	
9 columns

  RLS ||||* Policies
Manage Row Level Security policies for your tables

Docs
Filter tables and policies

schema

public

activos_fijos

Disable RLS

Create policy

Name	Command	Applied to	Actions

activos_fijos_tenant_isolation
ALL	
public

almacen_ubicaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

ubicaciones_delete_rls
DELETE	
public


ubicaciones_insert_rls
INSERT	
public


ubicaciones_select_rls
SELECT	
public


ubicaciones_update_rls
UPDATE	
public

almacenes

Disable RLS

Create policy

Name	Command	Applied to	Actions

almacenes_delete_rls
DELETE	
public


almacenes_insert_rls
INSERT	
public


almacenes_select_rls
SELECT	
public


almacenes_update_rls
UPDATE	
public

asientos_contables

Disable RLS

Create policy

Name	Command	Applied to	Actions

asientos_contables_tenant_isolation
ALL	
public


Enable all operations for authenticated users
ALL	
public

asientos_contables_rrhh

Disable RLS

Create policy

Name	Command	Applied to	Actions

asientos_contables_rrhh_authenticated_access
ALL	
public

asignacion_costos

Disable RLS

Create policy

Name	Command	Applied to	Actions

asignacion_costos_tenant_isolation
ALL	
public

asistencia

Disable RLS

Create policy

Name	Command	Applied to	Actions

asistencias_authenticated_access
ALL	
public

audit_log

Disable RLS

Create policy

Name	Command	Applied to	Actions

audit_log_tenant_isolation
ALL	
public

audit_log_archive

Disable RLS

Create policy

Name	Command	Applied to	Actions

audit_log_archive_service_role_all
ALL	
public


audit_log_archive_system_insert
INSERT	
public


audit_log_archive_tenant_read
SELECT	
public

auditoria

Disable RLS

Create policy

Name	Command	Applied to	Actions

auditoria_tenant_isolation
ALL	
public


tenant_isolation_auditoria
ALL	
public

auditoria_cotizaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

auditoria_cotizaciones_tenant_isolation
ALL	
public

auth_login_attempts

Disable RLS

Create policy

Name	Command	Applied to	Actions

auth_login_attempts_insert
INSERT	
public


auth_login_attempts_tenant_isolation
ALL	
public

beneficios

Disable RLS

Create policy

Name	Command	Applied to	Actions

beneficios_tenant_isolation
ALL	
public

cajas

Disable RLS

Create policy

Name	Command	Applied to	Actions

cajas_tenant_isolation
ALL	
public

calendario_empresa

Disable RLS

Create policy

Name	Command	Applied to	Actions

calendario_empresa_tenant_isolation
ALL	
public

candidatos

Disable RLS

Create policy

Name	Command	Applied to	Actions

candidatos_tenant_isolation
ALL	
public

capacitaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

capacitaciones_tenant_isolation
ALL	
public

centros_costo

Disable RLS

Create policy

Name	Command	Applied to	Actions

centros_costo_tenant_isolation
ALL	
public

clientes

Disable RLS

Create policy

Name	Command	Applied to	Actions

clientes_tenant_isolation
ALL	
public

cobranzas

Disable RLS

Create policy

Name	Command	Applied to	Actions

cobranzas_tenant_isolation
ALL	
public

conceptos_planilla

Disable RLS

Create policy

Name	Command	Applied to	Actions

conceptos_planilla_tenant_isolation
ALL	
public

conciliaciones_bancarias

Disable RLS

Create policy

Name	Command	Applied to	Actions

conciliaciones_bancarias_tenant_isolation
ALL	
public

configuracion_fiscal

Disable RLS

Create policy

Name	Command	Applied to	Actions

configuracion_fiscal_delete_super_admin
DELETE	
public


configuracion_fiscal_read_authenticated
SELECT	
public


configuracion_fiscal_update_super_admin
UPDATE	
public


configuracion_fiscal_write_super_admin
INSERT	
public

configuracion_retenciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

configuracion_retenciones_tenant_isolation
ALL	
public

contratos

Disable RLS

Create policy

Name	Command	Applied to	Actions

contratos_authenticated_access
ALL	
public

cotizacion_compra_detalles

Disable RLS

Create policy

Name	Command	Applied to	Actions

cotizacion_compra_detalles_tenant_isolation
ALL	
public

cotizacion_detalles

Disable RLS

Create policy

Name	Command	Applied to	Actions

cotizacion_detalles_tenant_isolation
ALL	
public

cotizaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

cotizaciones_tenant_isolation
ALL	
public

cotizaciones_compra

Disable RLS

Create policy

Name	Command	Applied to	Actions

cotizaciones_compra_tenant_isolation
ALL	
public

cpe

Disable RLS

Create policy

Name	Command	Applied to	Actions

cpe_tenant_isolation
ALL	
public

cuentas_bancarias

Disable RLS

Create policy

Name	Command	Applied to	Actions

cuentas_bancarias_tenant_isolation
ALL	
public

cuentas_por_cobrar

Disable RLS

Create policy

Name	Command	Applied to	Actions

cuentas_por_cobrar_rls
ALL	
public

cuentas_por_pagar

Disable RLS

Create policy

Name	Command	Applied to	Actions

cuentas_por_pagar_tenant_isolation
ALL	
public

cxc_pagos

Disable RLS

Create policy

Name	Command	Applied to	Actions

cxc_pagos_rls
ALL	
public

departamentos

Disable RLS

Create policy

Name	Command	Applied to	Actions

departamentos_tenant_isolation
ALL	
public

depreciaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

depreciaciones_tenant_isolation
ALL	
public

detalle_asientos

Disable RLS

Create policy

Name	Command	Applied to	Actions

detalle_asientos_authenticated_access
ALL	
public

detalle_retenciones_categoria

Disable RLS

Create policy

Name	Command	Applied to	Actions

detalle_retenciones_categoria_tenant_isolation
ALL	
public

detalle_ventas_pos

Disable RLS

Create policy

Name	Command	Applied to	Actions

detalle_ventas_pos_tenant_isolation
ALL	
public

devolucion_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

devolucion_items_tenant_isolation
ALL	
public

devoluciones_proveedor

Disable RLS

Create policy

Name	Command	Applied to	Actions

devoluciones_proveedor_tenant_isolation
ALL	
public

documento_archivos

Disable RLS

Create policy

Name	Command	Applied to	Actions

documento_archivos_tenant_isolation
ALL	
public

documento_auditoria

Disable RLS

Create policy

Name	Command	Applied to	Actions

documento_auditoria_tenant_isolation
ALL	
public

documento_detalles

Disable RLS

Create policy

Name	Command	Applied to	Actions

documento_detalles_tenant_isolation
ALL	
public

documento_series

Disable RLS

Create policy

Name	Command	Applied to	Actions

documento_series_tenant_isolation
ALL	
public

documentos

Disable RLS

Create policy

Name	Command	Applied to	Actions

documentos_tenant_isolation
ALL	
public

egresos

Disable RLS

Create policy

Name	Command	Applied to	Actions

egresos_tenant_isolation
ALL	
public

empleado_beneficios

Disable RLS

Create policy

Name	Command	Applied to	Actions

empleado_beneficios_tenant_isolation
ALL	
public

empleado_capacitaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

empleado_capacitaciones_tenant_isolation
ALL	
public

empleado_horarios

Disable RLS

Create policy

Name	Command	Applied to	Actions

empleado_horarios_tenant_isolation
ALL	
public

empleado_planilla

Disable RLS

Create policy

Name	Command	Applied to	Actions

empleado_planilla_tenant_isolation
ALL	
public


planilla_detalles_authenticated_access
ALL	
public

empleado_planilla_conceptos

Disable RLS

Create policy

Name	Command	Applied to	Actions

empleado_planilla_conceptos_tenant_isolation
ALL	
public

empleados

Disable RLS

Create policy

Name	Command	Applied to	Actions

empleados_tenant_isolation
ALL	
public

empresa_config

Disable RLS

Create policy

Name	Command	Applied to	Actions

empresa_config_tenant_isolation
ALL	
public


Users can read their own tenant
SELECT	
public

evaluaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

evaluaciones_tenant_isolation
ALL	
public

event_processing_log

Disable RLS

Create policy

Name	Command	Applied to	Actions

event_processing_log_tenant_isolation
ALL	
public

expediente_documentos

Disable RLS

Create policy

Name	Command	Applied to	Actions

expediente_documentos_tenant_isolation
ALL	
public

fe_configuracion

Disable RLS

Create policy

Name	Command	Applied to	Actions

fe_configuracion_tenant_isolation
ALL	
public

gastos

Disable RLS

Create policy

Name	Command	Applied to	Actions

gastos_tenant_isolation
ALL	
public

gestiones_cobranza

Disable RLS

Create policy

Name	Command	Applied to	Actions

gestiones_cobranza_tenant_isolation
ALL	
public

gre

Disable RLS

Create policy

Name	Command	Applied to	Actions

gre_tenant_isolation
ALL	
public

gre_guias

Disable RLS

Create policy

Name	Command	Applied to	Actions

gre_guias_policy
ALL	
public

historial_pagos_planilla

Disable RLS

Create policy

Name	Command	Applied to	Actions

historial_pagos_planilla_authenticated_access
ALL	
public


historial_pagos_planilla_tenant_isolation
ALL	
public

horarios_trabajo

Disable RLS

Create policy

Name	Command	Applied to	Actions

horarios_trabajo_tenant_isolation
ALL	
public

integration_logs

Disable RLS

Create policy

Name	Command	Applied to	Actions

integration_logs_insert_policy
INSERT	
public


integration_logs_tenant_isolation
SELECT	
public

inventarios_permanentes

Disable RLS

Create policy

Name	Command	Applied to	Actions

inventarios_permanentes_tenant_isolation
ALL	
public

libro_retenciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

libro_retenciones_tenant_isolation
ALL	
public

libros_electronicos_sunat

Disable RLS

Create policy

Name	Command	Applied to	Actions

libros_electronicos_sunat_tenant_isolation
ALL	
public

liquidaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

liquidaciones_tenant_isolation
ALL	
public

logistica_eventos

Disable RLS

Create policy

Name	Command	Applied to	Actions

logistica_eventos_rls
ALL	
public

metodos_pago

Disable RLS

Create policy

Name	Command	Applied to	Actions

metodos_pago_tenant_isolation
ALL	
public

movimientos_bancarios

Disable RLS

Create policy

Name	Command	Applied to	Actions

movimientos_bancarios_authenticated_access
ALL	
public

movimientos_consignacion

Disable RLS

Create policy

Name	Command	Applied to	Actions

movimientos_consignacion_tenant_isolation
ALL	
public

movimientos_inventario

Disable RLS

Create policy

Name	Command	Applied to	Actions

Movimientos are immutable
UPDATE	
public


Movimientos cannot be deleted
DELETE	
public


movimientos_inventario_insert
INSERT	
public


movimientos_inventario_select
SELECT	
public

notificaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

System can insert notifications
INSERT	
public


Users can delete their own notifications
DELETE	
public


Users can update their own notifications
UPDATE	
public


Users can view notifications for their tenant
SELECT	
public

oc_aprobaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

oc_aprobaciones_tenant_isolation
ALL	
public

orden_compra_detalles

Disable RLS

Create policy

Name	Command	Applied to	Actions

orden_compra_detalles_tenant_isolation
ALL	
public

ordenes_compra

Disable RLS

Create policy

Name	Command	Applied to	Actions

ordenes_compra_tenant_isolation
ALL	
public

outbox_events

Disable RLS

Create policy

Name	Command	Applied to	Actions

outbox_events_system_access
ALL	
public


Users can only insert outbox events for their tenant
INSERT	
public


Users can only see outbox events from their tenant
SELECT	
public


Users can only update outbox events from their tenant
UPDATE	
public

pagos_empleados

Disable RLS

Create policy

Name	Command	Applied to	Actions

pagos_empleados_tenant_isolation
ALL	
public

pagos_facturas

Disable RLS

Create policy

Name	Command	Applied to	Actions

pagos_facturas_tenant_isolation
ALL	
public

pagos_lote

Disable RLS

Create policy

Name	Command	Applied to	Actions

pagos_lote_tenant_isolation
ALL	
public

pagos_ventas

Disable RLS

Create policy

Name	Command	Applied to	Actions

pagos_ventas_tenant_isolation
ALL	
public

paises

Disable RLS

Create policy

Name	Command	Applied to	Actions

paises_delete_super_admin
DELETE	
public


paises_read_authenticated
SELECT	
public


paises_update_super_admin
UPDATE	
public


paises_write_super_admin
INSERT	
public

pedido_aprobaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

pedido_aprobaciones_rls
ALL	
public

pedido_backorders

Disable RLS

Create policy

Name	Command	Applied to	Actions

pedido_backorders_rls
ALL	
public

pedido_despachos

Disable RLS

Create policy

Name	Command	Applied to	Actions

pedido_despachos_rls
ALL	
public

pedidos_venta

Disable RLS

Create policy

Name	Command	Applied to	Actions

pedidos_venta_tenant_isolation
ALL	
public

pedidos_venta_detalle

Disable RLS

Create policy

Name	Command	Applied to	Actions

pedidos_venta_detalle_tenant_isolation
ALL	
public

periodos_contables

Disable RLS

Create policy

Name	Command	Applied to	Actions

periodos_contables_tenant_isolation
ALL	
public

permisos

Disable RLS

Create policy

Name	Command	Applied to	Actions

permisos_tenant_isolation
ALL	
public

plan_cuentas

Disable RLS

Create policy

Name	Command	Applied to	Actions

plan_cuentas_authenticated_access
ALL	
public

planillas

Disable RLS

Create policy

Name	Command	Applied to	Actions

planillas_tenant_isolation
ALL	
public

plantillas_asientos

Disable RLS

Create policy

Name	Command	Applied to	Actions

plantillas_asientos_tenant_isolation
ALL	
public

plantillas_asientos_detalle

Disable RLS

Create policy

Name	Command	Applied to	Actions

plantillas_detalle_tenant_isolation
ALL	
public

plantillas_asientos_historial

Disable RLS

Create policy

Name	Command	Applied to	Actions

plantillas_historial_tenant_isolation
ALL	
public

presupuestos

Disable RLS

Create policy

Name	Command	Applied to	Actions

presupuestos_tenant_isolation
ALL	
public

producto_existencias

Disable RLS

Create policy

Name	Command	Applied to	Actions

existencias_delete_rls
DELETE	
public


existencias_insert_rls
INSERT	
public


existencias_select_rls
SELECT	
public


existencias_update_rls
UPDATE	
public

productos

Disable RLS

Create policy

Name	Command	Applied to	Actions

productos_tenant_isolation
ALL	
public

proveedores

Disable RLS

Create policy

Name	Command	Applied to	Actions

proveedores_tenant_isolation
ALL	
public

recepcion_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

recepcion_items_tenant_isolation
ALL	
public

recepciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

recepciones_tenant_isolation
ALL	
public

registro_consignaciones

Disable RLS

Create policy

Name	Command	Applied to	Actions

registro_consignaciones_tenant_isolation
ALL	
public

rls_alert_config

Disable RLS

Create policy

Name	Command	Applied to	Actions

rls_alert_config_superadmin_all
ALL	
public


rls_alert_config_tenant_read
SELECT	
public

rls_alert_history

Disable RLS

Create policy

Name	Command	Applied to	Actions

rls_alert_history_superadmin_all
ALL	
public


rls_alert_history_system_insert
INSERT	
public


rls_alert_history_tenant_read
SELECT	
public

rls_audit_log
RLS Disabled

Enable RLS

Create policy

No policies created yet

rma_eventos

Disable RLS

Create policy

Name	Command	Applied to	Actions

rma_eventos_insert_rls
INSERT	
public


rma_eventos_select_rls
SELECT	
public

rma_items

Disable RLS

Create policy

Name	Command	Applied to	Actions

rma_items_insert_rls
INSERT	
public


rma_items_select_rls
SELECT	
public


rma_items_update_rls
UPDATE	
public

rma_solicitudes

Disable RLS

Create policy

Name	Command	Applied to	Actions

rma_insert_rls
INSERT	
public


rma_select_rls
SELECT	
public


rma_update_rls
UPDATE	
public

rol_permisos

Disable RLS

Create policy

Name	Command	Applied to	Actions

rol_permisos_tenant_isolation
ALL	
public

roles

Disable RLS

Create policy

Name	Command	Applied to	Actions

roles_allow_login_select
SELECT	
anon, authenticated
+ 2 more


roles_authenticated_write
ALL	
public

rrhh_pagos

Disable RLS

Create policy

Name	Command	Applied to	Actions

rrhh_pagos_authenticated_access
ALL	
public

saldos_iniciales_cuentas

Disable RLS

Create policy

Name	Command	Applied to	Actions

saldos_iniciales_cuentas_tenant_isolation
ALL	
public

sesiones_caja

Disable RLS

Create policy

Name	Command	Applied to	Actions

sesiones_caja_tenant_isolation
ALL	
public

sire_files

Disable RLS

Create policy

Name	Command	Applied to	Actions

sire_files_tenant_isolation
ALL	
public

solicitudes

Disable RLS

Create policy

Name	Command	Applied to	Actions

solicitudes_tenant_isolation
ALL	
public

stock_movimientos

Disable RLS

Create policy

Name	Command	Applied to	Actions

stock_movimientos_tenant_isolation
ALL	
public


tenant_isolation_stock_movimientos
ALL	
public

tipos_cambio

Disable RLS

Create policy

Name	Command	Applied to	Actions

tipos_cambio_delete_super_admin
DELETE	
public


tipos_cambio_insert_super_admin
INSERT	
public


tipos_cambio_read_authenticated
SELECT	
public


tipos_cambio_update_super_admin
UPDATE	
public

tipos_documentos_fiscales

Disable RLS

Create policy

Name	Command	Applied to	Actions

tipos_documentos_fiscales_delete_super_admin
DELETE	
public


tipos_documentos_fiscales_read_authenticated
SELECT	
public


tipos_documentos_fiscales_update_super_admin
UPDATE	
public


tipos_documentos_fiscales_write_super_admin
INSERT	
public

tipos_impuestos

Disable RLS

Create policy

Name	Command	Applied to	Actions

tipos_impuestos_delete_super_admin
DELETE	
public


tipos_impuestos_read_authenticated
SELECT	
public


tipos_impuestos_update_super_admin
UPDATE	
public


tipos_impuestos_write_super_admin
INSERT	
public

user_roles

Disable RLS

Create policy

Name	Command	Applied to	Actions

user_roles_allow_login_select
SELECT	
anon, authenticated
+ 2 more


user_roles_authenticated_write
ALL	
public

user_sessions

Disable RLS

Create policy

Name	Command	Applied to	Actions

user_sessions_own_access
ALL	
public

users

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can view own profile
SELECT	
public


users_service_role_all
ALL	
public


users_update_own_profile
UPDATE	
public


users_view_own_profile
SELECT	
public

usuario_configuracion

Disable RLS

Create policy

Name	Command	Applied to	Actions

usuario_configuracion_tenant_isolation
ALL	
public

usuarios_sistema

Disable RLS

Create policy

Name	Command	Applied to	Actions

usuarios_sistema_allow_login_select
SELECT	
anon, authenticated
+ 2 more


usuarios_sistema_authenticated_write
ALL	
public

usuarios_sistemas

Disable RLS

Create policy

Name	Command	Applied to	Actions

usuarios_sistemas_tenant_isolation
ALL	
public

vacantes

Disable RLS

Create policy

Name	Command	Applied to	Actions

vacantes_tenant_isolation
ALL	
public

validaciones_sunat

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete validations for their tenant
DELETE	
public


Users can insert validations for their tenant
INSERT	
public


Users can update validations for their tenant
UPDATE	
public


Users can view validations for their tenant
SELECT	
public

venta_detalles

Disable RLS

Create policy

Name	Command	Applied to	Actions

venta_detalles_tenant_isolation
ALL	
public

ventas

Disable RLS

Create policy

Name	Command	Applied to	Actions

ventas_tenant_isolation
ALL	
public

ventas_pos

Disable RLS

Create policy

Name	Command	Applied to	Actions

ventas_pos_tenant_isolation
ALL	
public

wizard_progress

Disable RLS

Create policy

Name	Command	Applied to	Actions

Users can delete wizard progress for their tenant
DELETE	
public


Users can insert wizard progress for their tenant
INSERT	
public


Users can update wizard progress for their tenant
UPDATE	
public


Users can view wizard progress for their tenant
SELECT	
public

 ||***  TRIGGERS ||| *** Database Triggers
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
AFTER INSERT
AFTER DELETE
AFTER UPDATE
ROW


audit_cuentas_por_cobrar_trigger	
cuentas_por_cobrar
audit_table_changes
AFTER INSERT
AFTER UPDATE
AFTER DELETE
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
AFTER INSERT
AFTER DELETE
ROW


audit_movimientos_bancarios_trigger	
movimientos_bancarios
audit_table_changes
AFTER INSERT
AFTER DELETE
AFTER UPDATE
ROW


audit_ordenes_compra_trigger	
ordenes_compra
audit_table_changes
AFTER INSERT
AFTER DELETE
AFTER UPDATE
ROW


audit_pedidos_venta_trigger	
pedidos_venta
audit_table_changes
AFTER UPDATE
AFTER DELETE
AFTER INSERT
ROW


audit_rls_activos_fijos	
activos_fijos
audit_rls_access
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
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
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW


audit_rls_cajas	
cajas
audit_rls_access
BEFORE UPDATE
BEFORE DELETE
BEFORE INSERT
ROW


audit_rls_calendario_empresa	
calendario_empresa
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
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
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW


audit_rls_conceptos_planilla	
conceptos_planilla
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
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
BEFORE DELETE
BEFORE UPDATE
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
BEFORE INSERT
BEFORE UPDATE
BEFORE DELETE
ROW


audit_rls_detalle_retenciones_categoria	
detalle_retenciones_categoria
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
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
BEFORE UPDATE
BEFORE DELETE
BEFORE INSERT
ROW


audit_rls_empleado_capacitaciones	
empleado_capacitaciones
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
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
BEFORE INSERT
BEFORE UPDATE
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
BEFORE DELETE
BEFORE UPDATE
BEFORE INSERT
ROW


audit_rls_expediente_documentos	
expediente_documentos
audit_rls_access
BEFORE UPDATE
BEFORE INSERT
BEFORE DELETE
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
BEFORE INSERT
BEFORE DELETE
BEFORE UPDATE
ROW


audit_rls_movimientos_consignacion	
movimientos_consignacion
audit_rls_access
BEFORE DELETE
BEFORE UPDATE
BEFORE INSERT
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
BEFORE DELETE
BEFORE UPDATE
BEFORE INSERT
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
BEFORE UPDATE
BEFORE DELETE
BEFORE INSERT
ROW


audit_rls_usuarios_sistemas	
usuarios_sistemas
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
AFTER DELETE
AFTER UPDATE
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
BEFORE UPDATE
BEFORE INSERT
ROW


trigger_calcular_totales_cotizacion_compra	
cotizacion_compra_detalles
calcular_totales_cotizacion_compra
AFTER UPDATE
AFTER INSERT
AFTER DELETE
ROW


trigger_calcular_totales_devolucion_proveedor	
devolucion_items
calcular_totales_devolucion_proveedor
AFTER INSERT
AFTER UPDATE
AFTER DELETE
ROW


trigger_calcular_totales_orden_compra	
orden_compra_detalles
calcular_totales_orden_compra
AFTER INSERT
AFTER UPDATE
AFTER DELETE
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
BEFORE INSERT
BEFORE UPDATE
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


|| ******* FUNCTIONS Database Functions
Docs

schema

public

Search for a function

Return Type

Security

Create a new function

Name	Arguments	Return type	Security	

acknowledge_rls_alert
p_alert_id uuid, p_acknowledged_by uuid DEFAULT NULL::uuid

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
-

trigger	
Definer



audit_table_changes
-

trigger	
Definer



audit_trigger_function
-

trigger	
Invoker



calcular_cantidad_pendiente_oc
-

trigger	
Invoker



calcular_proxima_generacion
p_tipo_recurrencia character varying, p_dia_generacion integer, p_fecha_base date DEFAULT CURRENT_DATE

date

Invoker



calcular_totales_cotizacion_compra
-

trigger	
Invoker



calcular_totales_devolucion_proveedor
-

trigger	
Invoker



calcular_totales_orden_compra
-

trigger	
Invoker



cleanup_expired_sessions
-

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
-

integer

Invoker



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
-

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
p_producto_id uuid, p_cantidad numeric

void

Definer



diagnostico_cpe_documentos
-

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_pos
p_tenant_id uuid DEFAULT NULL::uuid

TABLE(metrica text, valor text, estado text)

Invoker



diagnostico_seguridad_rls
-

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
-

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



generate_gre_numero
-

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
-

uuid

Invoker



get_current_user_id
-

uuid

Invoker



get_datos_historicos_completos
meses integer DEFAULT 12

TABLE(periodo text, ventas numeric, gastos numeric, utilidad numeric, cuentas_por_cobrar numeric, cuentas_por_pagar numeric)

Definer



get_kpis_financieros
-

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
-

TABLE(cpes_procesados integer, documentos_creados integer, errores text[])

Invoker



migrar_detalles_ventas_pos_desde_observaciones
-

TABLE(ventas_procesadas integer, detalles_creados integer, errores text[])

Invoker



obtener_costos_fijos_mes_actual
-

numeric

Invoker



obtener_estadisticas_logs_auditoria
-

jsonb

Definer



obtener_siguiente_numero_serie
p_tenant_id uuid, p_tipo_documento character varying, p_serie character varying

character varying

Invoker



obtener_stock_info
p_producto_id uuid

TABLE(producto_id uuid, stock_total numeric, stock_reservado numeric, stock_disponible numeric)

Invoker



prevent_system_role_deletion
-

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
-

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
-

trigger	
Invoker



table_has_column
p_table_name text, p_column_name text

boolean

Invoker



trigger_crear_documento_para_cpe
-

trigger	
Definer



trigger_rls_alert
-

trigger	
Definer



trigger_seed_catalogos_nuevo_tenant
-

trigger	
Definer



try_cast_double
inp text

double precision

Invoker



update_conciliaciones_bancarias_updated_at
-

trigger	
Invoker



update_empresa_config_updated_at
-

trigger	
Invoker



update_outbox_events_updated_at
-

trigger	
Invoker



update_plantillas_asientos_updated_at
-

trigger	
Invoker



update_presupuestos_updated_at
-

trigger	
Invoker



update_session_activity
p_session_token text

boolean

Definer



update_updated_at_column
-

trigger	
Invoker



update_wizard_progress_timestamp
-

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
-

trigger	
Invoker



validar_vigencia_cotizacion_compra
-

trigger	
Invoker



validate_user_session
p_session_token text

TABLE(session_id uuid, user_id uuid, usuario_sistema_id uuid, tenant_id uuid, is_valid boolean, expires_at timestamp with time zone)

Definer



verificar_stock_disponible
p_producto_id uuid, p_cantidad numeric

boolean

Invoker



verify
token text, secret text, algorithm text DEFAULT 'HS256'::text

TABLE(header json, payload json, valid boolean)

Invoker


 