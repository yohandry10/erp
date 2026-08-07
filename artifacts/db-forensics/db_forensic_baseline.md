# Baseline Forense de Base de Datos (Pre-Reset)

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `baseline_db`.
>
> Leer tambien: `docs/START_HERE.md`, `AGENTS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de corte: 2026-02-12

Addendum post-reset (2026-02-13):
- Estado vigente de la nueva reconstruccion y cobertura actual: `docs/db_rebuild_status.md`.
- Este archivo se mantiene como baseline historico pre-reset.

## 1) Objetivo

Congelar el estado actual de la base de datos antes de reconstruir desde cero, dejando trazabilidad de:
- que existe en migraciones,
- que usa realmente el codigo,
- y que parece faltar/estar desalineado.

## 2) Fuentes y metodo

Fuentes revisadas:
- supabase/migrations/*.sql
- referencias de codigo en .from('...') y .rpc('...') de apps/erp-api y apps/web

Artefactos generados (forense reproducible):
- docs/db_relations_catalog.csv
- docs/db_tables_base_list.txt
- docs/db_migration_numbering_report.txt
- docs/db_migration_core_range_report.txt
- docs/db_code_relation_mapping.csv
- docs/db_code_vs_relations_report.txt
- docs/db_unmatched_table_references.txt
- docs/db_functions_catalog.csv
- docs/db_rpc_mapping.csv
- docs/db_rpc_vs_migrations_report.txt
- docs/db_unmatched_rpc_references.txt

## 3) Resumen ejecutivo

- Archivos de migracion detectados: 171.
- Numeros de migracion distintos: 164.
- Rango base analizado: 0..170.
- Huecos de numeracion en 0..170: 18, 19, 23, 24, 65, 66, 67, 68, 69, 84, 107.
- Numeros fuera de rango base: 361, 362, 363, 525.
- Duplicados de numero: 56, 80, 86, 140, 162, 163, 168.
- Archivo vacio detectado: supabase/migrations/051_create_user_sessions.sql.

Inventario de relaciones (unicas por nombre):
- Tablas: 161 (160 canonicas por nombre base)
- Vistas: 48
- Materialized views: 3

Cruce codigo vs modelo:
- Referencias .from(...) unicas en codigo: 163
- Coinciden con relaciones migradas: 145
- No coinciden: 18 (de ellas 1 sistema: pg_matviews, y 17 sospechosas)

Cruce RPC codigo vs funciones migradas:
- RPC unicos en codigo: 48
- Coinciden con funciones en migraciones: 37
- No coinciden: 11 (3 parecen built-in/externas, 8 sospechosas)

## 4) Mapa funcional de tablas criticas (contexto de negocio)

### Nucleo multi-tenant y seguridad
- tenants: maestro de empresas/tenant.
- empresa_config: configuracion fiscal, certificados, OSE/DIAN, wizard.
- usuarios_sistema, roles, permisos, rol_permisos, user_roles: RBAC.
- audit_log, auditoria, rls_audit_log, rls_alert_config, rls_alert_history: auditoria y seguridad.
- wizard_progress: estado del asistente de configuracion.

### Ventas y CxC
- clientes, cotizaciones, cotizacion_detalles.
- pedidos_venta, pedidos_venta_detalle, pedido_aprobaciones, pedido_despachos, pedido_backorders.
- documentos, documento_detalles, documento_series, documento_auditoria.
- cuentas_por_cobrar, cxc_pagos.
- ventas, venta_detalles.

### POS y cajas
- ventas_pos, detalle_ventas_pos, ventas_pos_pagos, pos_numeracion.
- cajas, sesiones_caja, movimientos_caja, retiros_caja, cambios_turno, cortes_caja, autorizaciones_caja, caja_audit_log.
- metodos_pago, eventos_pos.

### Compras y CxP
- proveedores, cotizaciones_compra, cotizacion_compra_detalles.
- ordenes_compra, orden_compra_detalles, oc_aprobaciones.
- recepciones, recepcion_items, devoluciones_proveedor, devolucion_items.
- cuentas_por_pagar, pagos_facturas, pagos_lote.

### Inventario y logistica
- productos, stock_movimientos, movimientos_inventario.
- almacenes, almacen_ubicaciones, producto_existencias, producto_stock_sucursal, producto_precios_sucursal.
- lotes_productos, movimientos_lotes, config_alertas_vencimiento.
- sucursales.

### Finanzas y contabilidad
- plan_cuentas, asientos_contables, detalle_asientos, periodos_contables, centros_costo.
- cuentas_bancarias, movimientos_bancarios, conciliaciones_bancarias.
- presupuestos, plantillas_asientos, plantillas_asientos_detalle, plantillas_asientos_historial, plantillas_asientos_ventas.

### Fiscal (CPE/GRE/SIRE)
- cpe, validaciones_sunat, comunicaciones_baja, resumenes_diarios, detalle_comunicacion_baja, detalle_resumen_diario.
- gre, gre_guias, gre_detalles, pedido_gres.
- sire_files, sire_registros_detalle.

### RRHH
- empleados, departamentos, contratos, asistencia.
- planillas, conceptos_planilla, empleado_planilla, empleado_planilla_conceptos, historial_pagos_planilla, pagos_empleados.
- beneficios, empleado_beneficios, empleado_horarios, horarios_trabajo, capacitaciones, evaluaciones, vacantes, candidatos.

### Soporte tecnico / observabilidad / demo
- integration_logs, outbox_events, event_processing_log, auth_login_attempts.
- secret_rotation_state, system_alerts, pii_encryption_log.
- rate_limit_baselines, rate_limit_blocks, rate_limit_anomalies, trusted_ips, request_logs, rate_limit_configs.
- demo_conversiones_pendientes, knowledge_base.

## 5) Relaciones usadas por codigo pero no encontradas en migraciones (sospecha)

Tablas/vistas invocadas desde codigo y no encontradas en CREATE TABLE/VIEW/MATERIALIZED VIEW:
- asientos_contables_rrhh
- asistencias
- compras
- comprobantes_electronicos
- fe_configuracion
- feriados
- movimientos_stock
- pagos_ventas
- pdf
- profiles
- proveedores_cuarta_categoria
- rrhh_pagos
- supervisor_pins
- tipos_documentos_fiscales
- tipos_impuestos
- user_sessions
- usuarios

Detalle de archivos que las referencian:
- docs/db_unmatched_table_references.txt

## 6) RPC usadas por codigo y no encontradas en migraciones (sospecha)

Funciones RPC sin CREATE FUNCTION localizado en migraciones:
- acquire_job_lock
- calcular_balance_comprobacion
- get_analisis_crecimiento
- get_asientos_por_tipo
- get_kpis_financieros
- get_resumen_financiero_mensual
- obtener_siguiente_numero_serie
- release_job_lock

RPC que parecen externas/built-in y no cuentan como hueco de modelado:
- pgrst_reload_schema
- set_config
- refresh_materialized_view

Detalle de archivos que llaman RPC faltantes:
- docs/db_unmatched_rpc_references.txt

## 7) Lista completa de tablas canonicas detectadas (para reconstruccion)

Total: 160

- activos_fijos
- almacen_ubicaciones
- almacenes
- asientos_contables
- asignacion_costos
- asistencia
- audit_log
- audit_log_archive
- auditoria
- auth_login_attempts
- autorizaciones_caja
- beneficios
- caja_audit_log
- cajas
- calendario_empresa
- cambios_turno
- candidatos
- capacitaciones
- centros_costo
- clientes
- cobranzas
- comunicaciones_baja
- conceptos_planilla
- conciliaciones_bancarias
- config_alertas_vencimiento
- configuracion_caja
- configuracion_fiscal
- configuracion_retenciones
- contratos
- cortes_caja
- cotizacion_compra_detalles
- cotizacion_detalles
- cotizaciones
- cotizaciones_compra
- cpe
- cuentas_bancarias
- cuentas_por_cobrar
- cuentas_por_pagar
- cxc_pagos
- demo_conversiones_pendientes
- departamentos
- depreciaciones
- detalle_asientos
- detalle_comunicacion_baja
- detalle_resumen_diario
- detalle_retenciones_categoria
- detalle_ventas_pos
- devolucion_items
- devoluciones_proveedor
- documento_archivos
- documento_auditoria
- documento_detalles
- documento_series
- documentos
- egresos
- empleado_beneficios
- empleado_capacitaciones
- empleado_horarios
- empleado_planilla
- empleado_planilla_conceptos
- empleados
- empresa_config
- evaluaciones
- event_processing_log
- eventos_pos
- expediente_documentos
- gastos
- gestiones_cobranza
- gre
- gre_detalles
- gre_guias
- historial_pagos_planilla
- horarios_trabajo
- integration_logs
- inventarios_permanentes
- knowledge_base
- libro_retenciones
- libros_electronicos_sunat
- liquidaciones
- logistica_eventos
- lotes_productos
- metodos_pago
- movimientos_bancarios
- movimientos_caja
- movimientos_consignacion
- movimientos_inventario
- movimientos_lotes
- notificacion_tipo_roles
- notificaciones
- oc_aprobaciones
- orden_compra_detalles
- ordenes_compra
- outbox_events
- pagos_empleados
- pagos_facturas
- pagos_lote
- paises
- pedido_aprobaciones
- pedido_backorders
- pedido_despachos
- pedido_gres
- pedidos_venta
- pedidos_venta_detalle
- periodos_contables
- permisos
- pii_encryption_log
- plan_cuentas
- planillas
- plantillas_asientos
- plantillas_asientos_detalle
- plantillas_asientos_historial
- plantillas_asientos_ventas
- pos_numeracion
- presupuestos
- producto_existencias
- producto_precios_sucursal
- producto_stock_sucursal
- productos
- proveedores
- rate_limit_anomalies
- rate_limit_baselines
- rate_limit_blocks
- rate_limit_configs
- recepcion_items
- recepciones
- registro_consignaciones
- request_logs
- resumenes_diarios
- retiros_caja
- rls_alert_config
- rls_alert_history
- rls_audit_log
- rma_eventos
- rma_items
- rma_solicitudes
- rol_permisos
- roles
- saldos_iniciales_cuentas
- secret_rotation_state
- sesiones_caja
- sire_files
- sire_registros_detalle
- solicitudes
- stock_movimientos
- sucursales
- system_alerts
- tenants
- trusted_ips
- user_roles
- users
- usuario_configuracion
- usuarios_sistema
- usuarios_sistemas
- vacantes
- validaciones_sunat
- venta_detalles
- ventas
- ventas_pos
- ventas_pos_pagos
- wizard_progress

## 8) Conclusiones forenses y decision de reconstruccion

- El estado actual es reconstruible, pero hay evidencia de deriva de esquema:
  - huecos de numeracion,
  - numeros duplicados,
  - migracion vacia (051_create_user_sessions.sql),
  - y referencias activas de codigo a objetos no modelados.

- Dado que no hay datos productivos que preservar, la estrategia recomendada es:
  1. crear baseline documental (este archivo + CSVs),
  2. reconstruir BD limpia desde migraciones corregidas,
  3. cerrar huecos detectados (tablas/RPC),
  4. validar por modulo con smoke + e2e criticos.

## 9) Checklist antes de borrar BD

- Exportar/commitear este baseline y artefactos docs/db_*.
- Corregir o reemplazar migraciones vacias/faltantes criticas.
- Definir lista de objetos minimos obligatorios por modulo (ventas, compras, inventario, finanzas, fiscal, rrhh, seguridad).
- Ejecutar reconstruccion en entorno limpio y comparar contra este baseline.
