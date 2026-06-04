# AGENTS.md

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `documento_general`.
>
> Leer tambien: `docs/README.md`, `docs/START_HERE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

- Responde en espanol por defecto.
- Usa `rg` para buscar archivos o texto cuando sea posible.
- No uses comandos destructivos sin aprobacion explicita.
- No reviertas cambios existentes que no hayas hecho.

## Primera lectura obligatoria

Antes de iniciar cualquier tarea, leer:

1. `docs/START_HERE.md`
2. `docs/00_coordination/CURRENT_STATE.md`
3. `docs/00_coordination/FLOW_STATUS.md`
4. `docs/00_coordination/AGENT_SYNC.md`
5. `docs/DOC_NAVIGATION_MANIFEST.md` cuando la tarea toque documentacion, auditorias o seleccion de fuentes

`AGENTS.md` conserva reglas operativas y baseline DB; no reemplaza el estado vivo. Si este archivo contradice `docs/START_HERE.md` o `docs/00_coordination/*`, prevalecen esos documentos salvo en la lista obligatoria de artefactos DB antes de borrar/reconstruir.

## Regla antes de codificar

Antes de escribir codigo, crear migraciones, cambiar tests o auditar un modulo:

1. Ubicar el dominio en `docs/DOC_NAVIGATION_MANIFEST.md`.
2. Leer el documento fuente y sus `Leer tambien`.
3. Revisar `docs/00_coordination/FLOW_STATUS.md` para saber si el flujo ya esta cerrado o si falta algo externo.
4. Buscar en la doc con `rg` para no duplicar analisis o reimplementar algo ya resuelto.
5. Recién despues buscar en codigo y modificar.

Si una auditoria historica contradice la doc canonica, no asumir que la auditoria sigue vigente. Verificar en codigo y migraciones actuales.

## Baseline BD pre-reconstruccion (obligatorio consultar)

Antes de borrar/reconstruir la BD, usar estos artefactos:
- docs/db_forensic_baseline.md
- docs/db_reconstruction_plan.md
- docs/db_relations_catalog.csv
- docs/db_tables_base_list.txt
- docs/db_migration_numbering_report.txt
- docs/db_migration_core_range_report.txt
- docs/db_code_vs_relations_report.txt
- docs/db_unmatched_table_references.txt
- docs/db_rpc_vs_migrations_report.txt
- docs/db_unmatched_rpc_references.txt

## Estado reconstruccion actual (post-reset 2026-02-13)

Fuente principal de estado:
- docs/db_rebuild_status.md

Resumen rapido vigente:
- Migraciones activas de reconstruccion: `000..301`.
- Cobertura `.from(...)` en codigo activo: sin faltantes reales (solo falso positivo `pdf` por `Buffer.from`).
- Cobertura `.rpc(...)` en codigo activo: sin faltantes reales.
- Cobertura de columnas (escaneo fuente): 7 faltantes residuales detectados, todos ruido/falsos positivos de parser.
- Escaneo adicional `from(...).select(...)` (post `022`): 15 faltantes lexicos, todos ruido por joins/tests/codigo comentado.
- Hardening RLS catalogos mixtos aplicado en `023` (global + tenant).
- Seed mínimo operativo aplicado en `024` (fiscal + métodos de pago globales).
- Hardening de integridad de upsert + helpers RLS aplicado en `025` (inventario/logística/configuración caja).
- Vista de diagnóstico RLS de relaciones RRHH aplicada en `026` (`v_rls_status_empleado_relaciones` enriquecida).
- Alineación fuerte de planillas RRHH aplicada en `027` (FK/UUID aliases/índices runtime).
- Integridad tenant + RLS de planillas aplicada en `028` (triggers de consistencia y reaplicación de políticas).
- Pack de validación de flujo de planillas aplicado en `029` (vistas + funciones de auditoría).
- Hardening tenant/performance de finanzas aplicado en `030` (backfill tenant_id, índices y vista enriquecida).
- Alineación de esquema inventario/POS aplicada en `031` (columnas runtime y compatibilidad proveedores/recepciones).
- Alineación de vistas POS+inventario aplicada en `032` (`vista_pos_productos`, `vw_inventario_recepciones`, `vw_kardex_valorizado`).
- Alineación fiscal de vistas aplicada en `033` (`vw_cpe_documentos_auditoria`, `v_kpis_sunat_multitenant`).
- Pack de performance + validación de vistas aplicado en `034` (índices runtime + `validar_vistas_operacionales_core`).
- Alineación de materialized views contables aplicada en `035` (shape real para `mv_balance_*` y `mv_estado_resultados`).
- Hardening de refresh contable aplicado en `036` (validación de período + lock advisory + estado de MVs).
- Pack de validación de MVs contables aplicado en `037` (`validar_materialized_views_contabilidad` + vista de estado actual).
- Índices base para refresh contable aplicados en `038` (`asientos_contables`, `detalle_asientos`, `plan_cuentas`).
- Alineación de RPC financieras aplicada en `039` (contratos tabulares para `get_resumen_financiero_mensual`, `get_kpis_financieros`, `get_analisis_crecimiento` + helper `app.resolve_request_tenant_id`).
- Alineación de RPC de estadísticas contables aplicada en `040` (`get_asientos_por_tipo` devuelve `tipo/cantidad` + índices de soporte).
- Pack de validación de RPC financieras aplicado en `041` (`validar_rpc_finanzas_runtime`, `v_finanzas_rpc_status_actual`).
- Sincronización canónico/legacy de stock aplicada en `042` (`stock_movimientos` -> `movimientos_stock` con trigger + backfill).
- Índices de rendimiento de dashboard aplicados en `043` (tenant/fecha/estado en ventas/compras/cotizaciones/CPE/GRE/SIRE y stock).
- Pack de validación de runtime dashboard aplicado en `044` (`validar_dashboard_runtime`, `v_dashboard_runtime_status_actual`, `v_dashboard_stock_sync_gap`).
- Sincronización RRHH de asistencia aplicada en `045` (`asistencia` <-> `asistencias` con triggers + idempotencia + backfill).
- Vista/función unificada de asistencia aplicada en `046` (`v_asistencia_unificada`, `get_asistencia_unificada`).
- Pack de validación de consistencia RRHH-asistencia aplicado en `047` (`validar_rrhh_asistencia_consistencia`, `v_rrhh_asistencia_validacion_actual`).
- RPC de actividad reciente dashboard aplicada en `048` (`get_dashboard_recent_activity`).
- RPC de snapshot de métricas dashboard aplicada en `049` (`get_dashboard_metrics_snapshot`).
- Pack de validación de RPC dashboard aplicado en `050` (`validar_dashboard_rpc_runtime`, `v_dashboard_rpc_status_actual`).
- Alineación y sync bidireccional de `cpe`/`comprobantes_electronicos` aplicada en `051` (incluye columnas faltantes de nota de crédito).
- Sincronización de `usuarios_sistema` -> `usuarios_sistemas` aplicada en `052` (espejo legacy para consultas heredadas).
- Pack de validación de aliases legacy aplicado en `053` (`validar_aliases_legacy_runtime`, `v_aliases_legacy_status_actual`).
- Vistas de compatibilidad para jobs aplicadas en `054` (`cpe_documentos`, `gre_documentos`, `orden_compra`).
- Alineación runtime de `ventas_pos_pagos` aplicada en `055` (FK `venta_pos_id`, consistencia tenant y soporte de reportes de caja).
- Pack de compatibilidad contable aplicado en `056` (columnas `compras`/`activos_fijos`, tabla legacy `detalle_planillas` + sync y validación runtime).
- Compatibilidad legacy de permisos aplicada en `057` (`permissions`/`role_permissions` con sync bidireccional a `permisos`/`rol_permisos` + `codigo` operativo).
- Consistencia fuerte de `tenants.estado`/`tenants.activo` aplicada en `058` (trigger de normalización + constraints + vista de diagnóstico).
- Pack de validación de permisos/tenants aplicado en `059` (`validar_permissions_tenants_runtime`, `v_permissions_tenants_runtime_status_actual`).
- Hardening de EXECUTE en funciones sensibles aplicado en `060` (revokes a `PUBLIC/anon/authenticated` + grants a roles operativos).
- Hardening de `search_path` en funciones sensibles aplicado en `061` (evita hijacking por resolución implícita).
- Inventario forense de funciones `SECURITY DEFINER` aplicado en `062` (`v_security_definer_inventory`, `v_security_definer_risk_summary`).
- Backfill de `search_path` faltante en funciones `SECURITY DEFINER` aplicado en `063` (normalización automática en `public/app`).
- Pack de validación de hardening de funciones aplicado en `064` (`validar_security_functions_runtime`, `v_security_functions_runtime_status_actual`).
- Hardening RLS de catálogos global+tenant aplicado en `065` (filas globales visibles solo con contexto tenant).
- Reaplicación automática de RLS en tablas con `tenant_id` aplicada en `066` (`v_rls_tenant_tables_audit`, `v_rls_tenant_tables_audit_summary`).
- Pack de validación RLS de seguridad aplicado en `067` (`validar_rls_security_runtime`, `v_rls_security_runtime_status_actual`).
- Hardening de integridad tenant en `user_roles` aplicado en `068` (backfill + trigger `trg_enforce_tenant_user_roles`).
- Hardening de integridad tenant en `rol_permisos`/`role_permissions` aplicado en `069` (triggers de coherencia rol-permiso por tenant).
- Pack de validación RBAC multi-tenant aplicado en `070` (`validar_rbac_tenant_integrity_runtime`, `v_rbac_tenant_integrity_status_actual`).
- Sincronización bidireccional de `usuarios`/`usuarios_sistema` aplicada en `071` (incluye backfill en ambos sentidos).
- Normalización + constraints de `usuarios`/`usuarios_sistema` aplicada en `072` (`estado/activo`, email lowercase, checks de consistencia).
- Pack de validación de aliases `usuarios` aplicado en `073` (`validar_usuarios_alias_runtime`, `v_usuarios_alias_runtime_status_actual`).
- Hardening de sync bidireccional entre `pagos_empleados`/`rrhh_pagos` aplicado en `074` (normalización de pagos + compatibilidad `usuario_id='sistema'`).
- Constraints e índices de integridad de pagos RRHH aplicados en `075` (dedupe lógico por `tenant+planilla+empleado`).
- Pack de validación de pagos RRHH aplicado en `076` (`validar_rrhh_pagos_runtime`, `v_rrhh_pagos_runtime_status_actual`).
- Hardening de auth/sesiones aplicado en `077` (`auth_login_attempts` + `user_sessions`, normalización y compatibilidad de tipos).
- Constraints e índices de auth/sesiones aplicados en `078` (dedupe por token, checks operativos y helpers de mantenimiento).
- Pack de validación de auth/sesiones aplicado en `079` (`validar_auth_sessions_runtime`, `v_auth_sessions_runtime_status_actual`).
- Alineación runtime de `usuario_configuracion` aplicada en `080` (columnas `pais_preferido_id/idioma/zona_horaria` + normalización y consistencia tenant/usuario).
- Integridad + RLS de `usuario_configuracion` aplicada en `081` (FK a `usuarios_sistema`/`paises`, constraints y hardening de políticas tenant).
- Pack de validación de `usuario_configuracion` aplicado en `082` (`validar_usuario_configuracion_runtime`, `v_usuario_configuracion_runtime_status_actual`).
- Alineación runtime de catálogos fiscales aplicada en `083` (`configuracion_fiscal` + aliases de `paises` + normalización de tasas/moneda).
- Integridad de catálogos fiscales aplicada en `084` (FK/constraints + unicidad activa por país para evitar ambigüedad en `.single()`).
- Pack de validación de catálogos fiscales aplicado en `085` (`validar_fiscal_catalog_runtime`, `v_fiscal_catalog_runtime_status_actual`).
- Alineación runtime de retenciones aplicada en `086` (`configuracion_retenciones` con `tasa_porcentaje/monto_minimo` + normalización y seed por tenant).
- Integridad de retenciones aplicada en `087` (constraints de categoría/rangos + unicidad activa por `tenant+categoria` + reaplicación RLS).
- Pack de validación de retenciones aplicado en `088` (`validar_retenciones_runtime`, `v_retenciones_runtime_status_actual`).
- Alineación de contrato UI fiscal aplicada en `089` (flags UI en `configuracion_fiscal` + metadatos de validación en `tipos_documentos_fiscales` + alias de tasa en `tipos_impuestos`).
- Integridad de contrato UI fiscal aplicada en `090` (triggers de normalización en `tipos_*` + constraints de longitudes/patrones/sincronía de tasas).
- Pack de validación de contrato UI fiscal aplicado en `091` (`validar_fiscal_ui_contract_runtime`, `v_fiscal_ui_contract_runtime_status_actual`).
- Alineación runtime de retenciones/proveedores aplicada en `092` (normalización documental de `proveedores`, normalización de `proveedores_cuarta_categoria` y `libro_retenciones` + índices de soporte).
- Integridad de retenciones/proveedores aplicada en `093` (FK para embeds `libro_retenciones -> proveedores`, triggers de consistencia tenant, constraints y unicidades activas por tenant).
- Pack de validación de retenciones/proveedores aplicado en `094` (`validar_retenciones_proveedores_runtime`, `v_retenciones_proveedores_runtime_status_actual`).
- Alineación runtime de seguridad/rate-limit aplicada en `095` (shape operativo en `trusted_ips`, `rate_limit_blocks`, `rate_limit_anomalies`, `rate_limit_configs`, `request_logs` + triggers de normalización e índices runtime).
- Integridad de seguridad/rate-limit aplicada en `096` (constraints de calidad, unicidad por alcance, FK de anomalías a bloqueos y hardening RLS tenant/global).
- Pack de validación de seguridad/rate-limit aplicado en `097` (`validar_security_rate_limit_runtime`, `v_security_rate_limit_runtime_status_actual`).
- Alineación runtime del flujo RMA aplicada en `098` (`rma_solicitudes/rma_items/rma_eventos`: columnas faltantes, normalización e índices de soporte).
- Integridad del flujo RMA aplicada en `099` (FKs para embeds, constraints de cantidades/estado, consistencia tenant y hardening RLS explícito).
- Pack de validación del flujo RMA aplicado en `100` (`validar_rma_runtime`, `v_rma_runtime_status_actual`).
- Alineación runtime de secretos/alertas/PII aplicada en `101` (`secret_rotation_state`, `system_alerts`, `pii_encryption_log`, normalización, índices y `v_secrets_rotation_status`).
- Integridad + hardening RLS de secretos/alertas/PII aplicada en `102` (constraints de calidad, FKs de usuarios, unicidades por scope y políticas RLS explícitas).
- Pack de validación de secretos/alertas/PII aplicado en `103` (`validar_security_secrets_runtime`, `v_security_secrets_runtime_status_actual`).
- Alineación runtime de conversión demo aplicada en `104` (`demo_conversiones_pendientes`: `monto`, normalización de `email/ruc/plan/periodo`, estados e índices de webhook).
- Integridad + hardening RLS de conversión demo aplicada en `105` (dedupe por sesión Stripe/pendientes, constraints de negocio y política superadmin-only por sensibilidad de `password_hash`).
- Pack de validación de conversión demo aplicado en `106` (`validar_demo_conversion_runtime`, `v_demo_conversion_runtime_status_actual`).
- Alineación runtime de help bot aplicada en `107` (`knowledge_base`: `idioma/usage_count/last_used_at`, normalización e índices + RPC `buscar_ayuda`/`obtener_sugerencias_ayuda`).
- Integridad + hardening RLS de help bot aplicada en `108` (dedupe de preguntas activas, constraints de calidad y políticas `knowledge_base_tenant_or_global_select`/`knowledge_base_tenant_write`).
- Pack de validación de help bot aplicado en `109` (`validar_help_knowledge_base_runtime`, `v_help_knowledge_base_runtime_status_actual`).
- Alineación runtime de numeración POS aplicada en `110` (`ventas_pos`: `numero_ticket` texto, `impuestos` numérico, `ultimo_intento_facturacion` timestamptz; `pos_numeracion` operativo + RPC `obtener_siguiente_numero_pos` + `pos_registrar_venta_tx` alineado).
- Integridad + hardening RLS de numeración POS aplicada en `111` (normalización de ticket `serie-correlativo`, constraints de calidad, trigger de consistencia tenant/caja y policy tenant para `pos_numeracion`).
- Pack de validación de numeración POS aplicado en `112` (`validar_pos_ticket_numeracion_runtime`, `v_pos_ticket_numeracion_runtime_status_actual`).
- Alineación runtime de numeración fiscal aplicada en `113` (`documento_series`: columnas de numeración operativa, trigger de normalización y RPC `obtener_siguiente_numero_serie`/`obtener_siguiente_numero_documento` reforzadas con lock y máximo).
- Integridad + hardening RLS de numeración fiscal aplicada en `114` (dedupe de series activas por `tenant+tipo+serie`, constraints de calidad y política tenant explícita en `documento_series`).
- Pack de validación de numeración fiscal aplicado en `115` (`validar_documento_series_numeracion_runtime`, `v_documento_series_numeracion_runtime_status_actual`).
- Alineación runtime de tablas auxiliares críticas aplicada en `116` (`fe_configuracion`, `asientos_contables_rrhh`, `feriados`, `profiles` con columnas operativas, triggers de normalización e índices runtime).
- Integridad + hardening RLS de tablas auxiliares críticas aplicado en `117` (dedupe operativo, constraints de calidad y reaplicación explícita de `tenant_isolation`).
- Pack de validación de tablas auxiliares críticas aplicado en `118` (`validar_core_aux_tables_runtime`, `v_core_aux_tables_runtime_status_actual`).
- Alineación runtime de observabilidad aplicada en `119` (`integration_logs`, `notificaciones`, `audit_log` con triggers de normalización e índices por patrones reales de consulta).
- Integridad + hardening RLS de observabilidad aplicado en `120` (constraints de calidad para logs/notificaciones y reaplicación explícita de `tenant_isolation`).
- Pack de validación de observabilidad aplicado en `121` (`validar_observabilidad_runtime`, `v_observabilidad_runtime_status_actual`).
- Alineación runtime de contabilidad presupuestal aplicada en `122` (`periodos_contables`, `centros_costo`, `presupuestos` con triggers de normalización e índices runtime).
- Integridad + hardening RLS de contabilidad presupuestal aplicado en `123` (FKs, constraints de negocio, unicidades operativas y reaplicación explícita de `tenant_isolation`).
- Pack de validación de contabilidad presupuestal aplicado en `124` (`validar_contabilidad_presupuestal_runtime`, `v_contabilidad_presupuestal_runtime_status_actual`).
- Alineación runtime de tesorería bancaria aplicada en `125` (`cuentas_bancarias`, `movimientos_bancarios`, `conciliaciones_bancarias` con normalización fuerte e índices runtime).
- Integridad + hardening RLS de tesorería bancaria aplicado en `126` (FKs para embeds PostgREST, dedupe por scope, triggers de consistencia tenant y constraints de negocio).
- Pack de validación de tesorería bancaria aplicado en `127` (`validar_tesoreria_bancaria_runtime`, `v_tesoreria_bancaria_runtime_status_actual`).
- Alineación runtime de cobros/lotes aplicada en `128` (`cxc_pagos` y `pagos_lote` con normalización fuerte, defaults operativos e índices runtime).
- Integridad + hardening RLS de cobros/lotes aplicado en `129` (FKs para embeds, dedupe por referencias/idempotencia, triggers de consistencia tenant y constraints de negocio).
- Pack de validación de cobros/lotes aplicado en `130` (`validar_cxc_pagos_lotes_runtime`, `v_cxc_pagos_lotes_runtime_status_actual`).
- Alineación runtime de CxC/CxP aplicada en `131` (`cuentas_por_cobrar`, `cuentas_por_pagar` con normalización fuerte e índices runtime).
- Integridad + hardening RLS de CxC/CxP aplicado en `132` (FKs para embeds, dedupe por scope, triggers de consistencia tenant y constraints de negocio).
- Pack de validación de CxC/CxP aplicado en `133` (`validar_cxc_cxp_runtime`, `v_cxc_cxp_runtime_status_actual`).
- Alineación runtime de ventas comercial aplicada en `134` (`cotizaciones`, `cotizacion_detalles`, `pedidos_venta`, `pedidos_venta_detalle` con normalización fuerte de estados/montos/numeración).
- Integridad + hardening RLS de ventas comercial aplicado en `135` (FKs operativas para embeds, dedupe por `tenant+numero`, constraints de negocio y triggers de consistencia tenant).
- Pack de validación de ventas comercial aplicado en `136` (`validar_ventas_comercial_runtime`, `v_ventas_comercial_runtime_status_actual`).
- Alineación runtime de logística de pedidos aplicada en `137` (`logistica_eventos`, `pedido_backorders`, `pedido_despachos`, `pedido_gres` con normalización fuerte de tipos/estados/fechas y compatibilidad de notas).
- Integridad + hardening RLS de logística de pedidos aplicado en `138` (backfill tenant, FKs para embeds, dedupe en `pedido_gres`, constraints de negocio y triggers de consistencia tenant por relación).
- Pack de validación de logística de pedidos aplicado en `139` (`validar_logistica_pedidos_runtime`, `v_logistica_pedidos_runtime_status_actual`).
- Alineación runtime de fiscal GRE/SIRE aplicada en `140` (`gre_guias`, `gre_detalles`, `sire_files`, `sire_registros_detalle` con normalización de contratos API/worker y shape operativo completo).
- Integridad + hardening RLS de fiscal GRE/SIRE aplicado en `141` (backfill tenant por relaciones, FKs operativas, dedupe por scopes de idempotencia/período y triggers de consistencia tenant).
- Pack de validación de fiscal GRE/SIRE aplicado en `142` (`validar_fiscal_gre_sire_runtime`, `v_fiscal_gre_sire_runtime_status_actual`).
- Alineación runtime de alias legacy GRE aplicada en `143` (`gre` <-> `gre_guias` con mapeo de estados, normalización y sync bidireccional + backfill).
- Integridad + hardening RLS de alias legacy GRE aplicado en `144` (FKs, constraints, dedupe por scope y trigger `trg_enforce_gre_tenant_consistency`).
- Pack de validación de alias legacy GRE aplicado en `145` (`validar_gre_legacy_alias_runtime`, `v_gre_legacy_alias_runtime_status_actual`).
- Alineación runtime de compras operativo aplicada en `146` (`ordenes_compra`, `orden_compra_detalles`, `recepciones`, `compras` + sync bidireccional `ordenes_compra` <-> `compras`).
- Integridad + hardening RLS de compras operativo aplicado en `147` (backfill tenant en tablas hijas, FKs runtime, dedupe por scope, triggers de consistencia tenant y constraints de negocio).
- Pack de validación de compras operativo aplicado en `148` (`validar_compras_operational_runtime`, `v_compras_operational_runtime_status_actual`).
- Alineación runtime de cotizaciones/devoluciones de compras aplicada en `149` (`cotizaciones_compra`, `cotizacion_compra_detalles`, `oc_aprobaciones`, `devoluciones_proveedor`, `devolucion_items` con normalización fuerte de tipos/estados/fechas/montos).
- Integridad + hardening RLS de cotizaciones/devoluciones de compras aplicado en `150` (backfill tenant por relaciones, FKs runtime, dedupe por scope, triggers `trg_enforce_*_tenant_consistency` y constraints de negocio).
- Pack de validación de cotizaciones/devoluciones de compras aplicado en `151` (`validar_compras_cotizaciones_devoluciones_runtime`, `v_compras_cotizaciones_devoluciones_runtime_status_actual`).
- Alineación runtime de documentos operativos aplicada en `152` (`documentos`, `documento_detalles`, `documento_auditoria`, `documento_archivos` con normalización fuerte de contratos API/CPE/CxC).
- Integridad + hardening RLS de documentos operativos aplicado en `153` (backfill tenant por relaciones, FKs runtime, dedupe de numeración, triggers `trg_enforce_*_tenant_consistency` y constraints de negocio).
- Pack de validación de documentos operativos aplicado en `154` (`validar_documentos_operational_runtime`, `v_documentos_operational_runtime_status_actual`).
- Alineación runtime de cajas operativo aplicada en `155` (`cajas`, `sesiones_caja`, `movimientos_caja`, `retiros_caja`, `cambios_turno`, `cortes_caja`, `autorizaciones_caja` con normalización fuerte).
- Integridad + hardening RLS de cajas operativo aplicado en `156` (backfill tenant por relaciones, FKs runtime, dedupe de sesiones/flujos, triggers `trg_enforce_*_tenant_consistency` y constraints de negocio).
- Pack de validación de cajas operativo aplicado en `157` (`validar_cajas_operational_runtime`, `v_cajas_operational_runtime_status_actual`).
- Alineación runtime de finanzas cobros/egresos aplicada en `158` (`gastos`, `egresos`, `cobranzas`, `gestiones_cobranza`, `pagos_facturas` con normalización fuerte, defaults e índices runtime).
- Integridad + hardening RLS de finanzas cobros/egresos aplicado en `159` (backfill tenant por relaciones, FKs runtime, dedupe de referencias/idempotencia, triggers `trg_enforce_*_tenant_consistency` y constraints de negocio).
- Pack de validación de finanzas cobros/egresos aplicado en `160` (`validar_finanzas_cobros_egresos_runtime`, `v_finanzas_cobros_egresos_runtime_status_actual`).
- Bloques `161..199` aplicados y documentados en `docs/db_rebuild_status.md` (ventas históricas, RRHH talento/core/asistencia, fiscal RA/RC, POS aux, contabilidad activos/plantillas, auditoría, case-insensitive RRHH).
- Alineación runtime de planillas case-insensitive aplicada en `200` (helpers de normalización + `citext` en `planillas.estado/estado_pago` y `detalle_planillas.estado` + sync legacy normalizado).
- Integridad + hardening RLS de planillas case-insensitive aplicada en `201` (constraints de dominio/consistencia y trigger `trg_enforce_tenant_detalle_planillas`).
- Pack de validación de planillas case-insensitive aplicado en `202` (`validar_rrhh_planillas_estado_case_insensitive_runtime`, `v_rrhh_planillas_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime de estados en asientos contables aplicada en `203` (helper de normalización + `citext` en `asientos_contables.estado` + índice `idx_asientos_contables_tenant_estado_ci_runtime_203`).
- Integridad + hardening RLS de asientos contables aplicada en `204` (constraints de dominio/montos/cuadre + trigger `trg_enforce_detalle_asientos_tenant_consistency_203`).
- Pack de validación de asientos contables aplicado en `205` (`validar_contabilidad_asientos_estado_runtime`, `v_contabilidad_asientos_estado_runtime_status_actual`).
- Alineación runtime de catálogos contables case-insensitive aplicada en `206` (`periodos_contables/centros_costo/presupuestos/plan_cuentas` con `estado` en `citext`, normalizadores de estado y ajuste de `plan_cuentas.acepta_movimiento` a boolean + alias `tipo_cuenta`/`cuenta_padre_id`).
- Integridad + hardening RLS de catálogos contables case-insensitive aplicada en `207` (constraints de dominio por `lower(estado::text)`, consistencia `estado/activo`, trigger `trg_enforce_plan_cuentas_tenant_consistency_206` y reaplicación de `tenant_isolation`).
- Pack de validación de catálogos contables case-insensitive aplicado en `208` (`validar_contabilidad_catalogos_estado_case_insensitive_runtime`, `v_contabilidad_catalogos_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime de estados financieros case-insensitive aplicada en `209` (`cuentas_por_cobrar`, `cuentas_por_pagar`, `conciliaciones_bancarias` con `estado`/`estado_comparacion` en `citext` + índices de soporte por estado).
- Integridad + hardening RLS de estados financieros case-insensitive aplicada en `210` (constraints de dominio/saldo con `lower(estado::text)` y reaplicación de `tenant_isolation`).
- Pack de validación de estados financieros case-insensitive aplicado en `211` (`validar_finanzas_estado_case_insensitive_runtime`, `v_finanzas_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en Compras aplicada en `212` (`ordenes_compra`, `recepciones`, `compras`, `cotizaciones_compra`, `oc_aprobaciones`, `devoluciones_proveedor` con `estado` en `citext`, normalizadores y triggers).
- Integridad + hardening RLS de estados case-insensitive en Compras aplicado en `213` (constraints de dominio con `lower(estado::text)`, índice parcial pending de `oc_aprobaciones` y reaplicación de `tenant_isolation` en tablas del vertical).
- Pack de validación de estados case-insensitive en Compras aplicado en `214` (`validar_compras_estado_case_insensitive_runtime`, `v_compras_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en Ventas comercial aplicada en `215` (`cotizaciones.estado`, `pedidos_venta.estado`, `pedidos_venta_detalle.estado_item` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados case-insensitive en Ventas comercial aplicado en `216` (constraints de dominio con `lower(...::text)`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation`).
- Pack de validación de estados case-insensitive en Ventas comercial aplicado en `217` (`validar_ventas_comercial_estado_case_insensitive_runtime`, `v_ventas_comercial_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en CPE aplicada en `218` (`cpe.estado`, `cpe.sunat_status`, `cpe.estado_sunat` en `citext`, helpers de normalización, trigger de fila y backfill).
- Integridad + hardening RLS de estados en CPE aplicado en `219` (constraints de dominio/consistencia `estado`+`sunat_status`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation` en `cpe`/`comprobantes_electronicos`).
- Pack de validación de estados en CPE aplicado en `220` (`validar_cpe_estado_case_insensitive_runtime`, `v_cpe_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en GRE canónica aplicada en `221` (`gre_guias.estado` y `gre_guias.sunat_status` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en GRE canónica aplicado en `222` (constraints case-insensitive de dominio/consistencia, `NOT NULL` contractual y refuerzo de índice de cola de reintentos con predicado CI).
- Pack de validación de estados en GRE canónica aplicado en `223` (`validar_gre_guias_estado_case_insensitive_runtime`, `v_gre_guias_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en documentos aplicada en `224` (`documentos.estado` y `documento_archivos.estado` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en documentos aplicado en `225` (constraints de dominio con `lower(...::text)`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation` en el vertical documentos).
- Pack de validación de estados en documentos aplicado en `226` (`validar_documentos_estado_case_insensitive_runtime`, `v_documentos_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en SIRE aplicada en `227` (`sire_files.estado`, `sire_files.status` y `sire_registros_detalle.estado` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en SIRE aplicado en `228` (constraints de dominio y consistencia `estado/status`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation` en tablas SIRE).
- Pack de validación de estados en SIRE aplicado en `229` (`validar_sire_estado_case_insensitive_runtime`, `v_sire_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en fiscal RA/RC aplicada en `230` (`comunicaciones_baja`, `resumenes_diarios`, `detalle_comunicacion_baja`, `detalle_resumen_diario`, `validaciones_sunat` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en fiscal RA/RC aplicado en `231` (constraints de estado con `lower(...::text)`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation` en el vertical).
- Pack de validación de estados en fiscal RA/RC aplicado en `232` (`validar_fiscal_baja_resumen_estado_case_insensitive_runtime`, `v_fiscal_baja_resumen_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en Cajas aplicada en `233` (`cajas`, `sesiones_caja`, `retiros_caja.estado_conciliacion`, `cambios_turno`, `autorizaciones_caja` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en Cajas aplicado en `234` (constraints de dominio con `lower(...::text)`, consistencia `cambios_turno.estado/timestamp_fin`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation`).
- Pack de validación de estados en Cajas aplicado en `235` (`validar_cajas_estado_case_insensitive_runtime`, `v_cajas_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en Logística de pedidos aplicada en `236` (`logistica_eventos.estado`, `pedido_backorders.estado`, `pedido_despachos.estado`, `pedido_gres.estado` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en Logística de pedidos aplicado en `237` (constraints de dominio case-insensitive, `NOT NULL` contractual en estados y reaplicación explícita de `tenant_isolation`).
- Pack de validación de estados en Logística de pedidos aplicado en `238` (`validar_logistica_pedidos_estado_case_insensitive_runtime`, `v_logistica_pedidos_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en contabilidad de activos/consignación aplicada en `239` (`activos_fijos`, `depreciaciones`, `registro_consignaciones`, `movimientos_consignacion`, `inventarios_permanentes`, `asignacion_costos`, `calendario_empresa`, `saldos_iniciales_cuentas` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en contabilidad de activos/consignación aplicado en `240` (constraints de dominio case-insensitive, `NOT NULL` contractual en estados, unicidades activas con predicados CI y reaplicación explícita de `tenant_isolation`).
- Pack de validación de estados en contabilidad de activos/consignación aplicado en `241` (`validar_contabilidad_activos_consignacion_estado_case_insensitive_runtime`, `v_contabilidad_activos_consignacion_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en plantillas contables aplicada en `242` (`plantillas_asientos`, `plantillas_asientos_detalle`, `plantillas_asientos_historial`, `plantillas_asientos_ventas` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en plantillas contables aplicado en `243` (constraints de dominio case-insensitive, `NOT NULL` contractual en estados y reaplicación explícita de políticas `tenant/global` del vertical).
- Pack de validación de estados en plantillas contables aplicado en `244` (`validar_contabilidad_plantillas_estado_case_insensitive_runtime`, `v_contabilidad_plantillas_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en auditoría de cajas/supervisor aplicada en `245` (`caja_audit_log.estado`, `supervisor_pins.estado` en `citext`, helpers de normalización y backfill).
- Integridad + hardening RLS de estados en auditoría de cajas/supervisor aplicado en `246` (constraints runtime con `lower(estado::text)`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation`).
- Pack de validación de estados en auditoría de cajas/supervisor aplicado en `247` (`validar_cajas_auditoria_supervisor_estado_case_insensitive_runtime`, `v_cajas_auditoria_supervisor_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en auditoría legacy aplicada en `248` (`audit_log_archive.estado`, `auditoria.estado`, `auditoria_cotizaciones.estado` en `citext`, helper de normalización y backfill).
- Integridad + hardening RLS de estados en auditoría legacy aplicado en `249` (constraints runtime con `lower(estado::text)`, `NOT NULL` contractual y unicidad de archivo con predicado CI).
- Pack de validación de estados en auditoría legacy aplicado en `250` (`validar_auditoria_legacy_estado_case_insensitive_runtime`, `v_auditoria_legacy_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en RRHH personal operativo aplicada en `251` (`beneficios`, `capacitaciones`, `horarios_trabajo`, `empleado_*`, `expediente_documentos`, `liquidaciones`, `historial_pagos_planilla` en `citext` + helpers por dominio).
- Integridad + hardening RLS de estados en RRHH personal operativo aplicado en `252` (constraints de estado con `lower(estado::text)`, `NOT NULL` contractual y unicidades activas con predicados CI).
- Pack de validación de estados en RRHH personal operativo aplicado en `253` (`validar_rrhh_personal_operativo_estado_case_insensitive_runtime`, `v_rrhh_personal_operativo_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en RRHH talento aplicada en `254` (`vacantes`, `candidatos`, `solicitudes`, `evaluaciones` en `citext` + helpers por dominio).
- Integridad + hardening RLS de estados en RRHH talento aplicado en `255` (constraints de estado con `lower(estado::text)`, `NOT NULL` contractual y unicidades activas con predicados CI).
- Pack de validación de estados en RRHH talento aplicado en `256` (`validar_rrhh_talento_estado_case_insensitive_runtime`, `v_rrhh_talento_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en RRHH core aplicada en `257` (`departamentos.estado`, `contratos.estado` en `citext` + helpers por dominio).
- Integridad + hardening RLS de estados en RRHH core aplicado en `258` (constraints de estado con `lower(estado::text)`, `NOT NULL` contractual y unicidades activas con predicados CI).
- Pack de validación de estados en RRHH core aplicado en `259` (`validar_rrhh_core_estado_case_insensitive_runtime`, `v_rrhh_core_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estados en ventas históricas aplicada en `260` (`ventas`, `venta_detalles`, `pagos_ventas` en `citext` + helpers por dominio).
- Integridad + hardening RLS de estados en ventas históricas aplicado en `261` (constraints de estado con `lower(estado::text)`, `NOT NULL` contractual y unicidades activas con predicados CI).
- Pack de validación de estados en ventas históricas aplicado en `262` (`validar_ventas_historicas_estado_case_insensitive_runtime`, `v_ventas_historicas_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en empresa_config/wizard aplicada en `263` (`empresa_config.estado` en `citext` + helper de normalización).
- Integridad + hardening RLS de estado en empresa_config/wizard aplicado en `264` (constraint de estado con `lower(estado::text)`, `NOT NULL` contractual y reaplicación de `tenant_isolation`).
- Pack de validación de estado en empresa_config/wizard aplicado en `265` (`validar_empresa_config_wizard_estado_case_insensitive_runtime`, `v_empresa_config_wizard_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en POS/inventario auxiliar aplicada en `266` (`configuracion_caja`, `detalle_ventas_pos`, `producto_existencias`, `eventos_pos` en `citext` + helpers de normalización).
- Integridad + hardening RLS de estado en POS/inventario auxiliar aplicado en `267` (constraints de estado con `lower(estado::text)`, `NOT NULL` contractual y reaplicación de `tenant_isolation`).
- Pack de validación de estado en POS/inventario auxiliar aplicado en `268` (`validar_pos_inventory_aux_estado_case_insensitive_runtime`, `v_pos_inventory_aux_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en inventario core aplicada en `269` (`productos`, `almacenes`, `almacen_ubicaciones`, `movimientos_inventario`, `stock_movimientos`, `producto_stock_sucursal` en `citext` + helpers/normalizadores por tabla).
- Integridad + hardening RLS de estado en inventario core aplicado en `270` (constraints de estado con `lower(estado::text)`, `NOT NULL` contractual y reaplicación explícita de `tenant_isolation`).
- Pack de validación de estado en inventario core aplicado en `271` (`validar_inventario_core_estado_case_insensitive_runtime`, `v_inventario_core_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en catálogos fiscales/pago aplicada en `272` (`paises`, `metodos_pago`, `tipos_documentos_fiscales`, `tipos_impuestos`, `tipos_cambio` con `citext` + helper `app.normalize_estado_activo_inactivo_272` + normalización de `activo/estado`).
- Integridad + hardening RLS de estado en catálogos fiscales/pago aplicado en `273` (constraints de dominio/consistencia `estado<->activo`, `NOT NULL` contractual y reaplicación de `app.apply_global_or_tenant_policy` en catálogos mixtos).
- Pack de validación de estado en catálogos fiscales/pago aplicado en `274` (`validar_catalogos_fiscales_pago_estado_case_insensitive_runtime`, `v_catalogos_fiscales_pago_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en identidad aplicada en `275` (`tenants`, `usuarios_sistema`, `usuarios`, `usuarios_sistemas`, `users` en `citext`, helper `app.normalize_identity_estado_275` y normalización de `estado/activo` con triggers operativos).
- Integridad + hardening RLS de estado en identidad aplicado en `276` (constraints case-insensitive de `estado` y consistencia `estado<->activo`, `NOT NULL` contractual y reaplicación de `tenant_isolation` en tablas alias/canónicas de usuarios).
- Pack de validación de estado en identidad aplicado en `277` (`validar_identidad_usuarios_tenants_estado_case_insensitive_runtime`, `v_identidad_usuarios_tenants_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en seguridad/auth/rate-limit aplicada en `278` (`auth_login_attempts`, `user_sessions`, `trusted_ips`, `rate_limit_*`, `request_logs` en `citext`, helper `app.normalize_security_auth_rate_limit_estado_278` y normalización de triggers operativos).
- Integridad + hardening RLS de estado en seguridad/auth/rate-limit aplicado en `279` (constraints case-insensitive por dominio/consistencia, `NOT NULL` contractual, unicidades activas con predicado CI y reaplicación explícita de políticas tenant/global).
- Pack de validación de estado en seguridad/auth/rate-limit aplicado en `280` (`validar_security_auth_rate_limit_estado_case_insensitive_runtime`, `v_security_auth_rate_limit_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en fiscal/retenciones/proveedores aplicada en `281` (`configuracion_fiscal`, `configuracion_retenciones`, `proveedores`, `proveedores_cuarta_categoria`, `libro_retenciones` en `citext`, helper `app.normalize_fiscal_retenciones_proveedores_estado_281` y normalización de triggers operativos).
- Integridad + hardening RLS de estado en fiscal/retenciones/proveedores aplicado en `282` (constraints case-insensitive por dominio/consistencia, `NOT NULL` contractual, unicidades activas con predicado CI y reaplicación explícita de políticas tenant/global).
- Pack de validación de estado en fiscal/retenciones/proveedores aplicado en `283` (`validar_fiscal_retenciones_proveedores_estado_case_insensitive_runtime`, `v_fiscal_retenciones_proveedores_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en RMA aplicada en `284` (`rma_solicitudes.estado`, `rma_items.estado` en `citext`, helper `app.normalize_rma_estado_284` y normalización de triggers operativos).
- Integridad + hardening RLS de estado en RMA aplicado en `285` (constraints de dominio case-insensitive, `NOT NULL` contractual, dedupe/índice activo CI en `rma_items` y reaplicación explícita de políticas tenant).
- Pack de validación de estado en RMA aplicado en `286` (`validar_rma_estado_case_insensitive_runtime`, `v_rma_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en secretos/alertas/PII aplicada en `287` (`secret_rotation_state`, `system_alerts`, `pii_encryption_log` en `citext`, helper `app.normalize_security_secrets_estado_287` y normalización de triggers operativos).
- Integridad + hardening RLS de estado en secretos/alertas/PII aplicado en `288` (constraints de dominio/consistencia case-insensitive, `NOT NULL` contractual, dedupe de `system_alerts.alert_key` activo y reaplicación explícita de políticas tenant/global).
- Pack de validación de estado en secretos/alertas/PII aplicado en `289` (`validar_security_secrets_estado_case_insensitive_runtime`, `v_security_secrets_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en conversión demo aplicada en `290` (`demo_conversiones_pendientes.estado` en `citext`, helper `app.normalize_demo_conversion_estado_290` y normalización de trigger operativo).
- Integridad + hardening RLS de estado en conversión demo aplicado en `291` (constraints case-insensitive de dominio/consistencia, `NOT NULL` contractual, dedupe de pendientes y reaplicación explícita de policy superadmin-only).
- Pack de validación de estado en conversión demo aplicado en `292` (`validar_demo_conversion_estado_case_insensitive_runtime`, `v_demo_conversion_estado_case_insensitive_runtime_status_actual`).
- Alineación runtime case-insensitive de estado en help knowledge base aplicada en `293` (`knowledge_base.estado` en `citext`, helper `app.normalize_help_knowledge_base_estado_293` y normalización de trigger operativo).
- Integridad + hardening RLS de estado en help knowledge base aplicado en `294` (constraints case-insensitive de dominio/consistencia `estado<->activo`, `NOT NULL` contractual, dedupe activo por scope y reaplicación explícita de policies RLS global+tenant).
- Pack de validación de estado en help knowledge base aplicado en `295` (`validar_help_knowledge_base_estado_case_insensitive_runtime`, `v_help_knowledge_base_estado_case_insensitive_runtime_status_actual`).
- Orquestador transversal de validaciones runtime aplicado en `296` (`validar_rebuild_runtime_orchestrator`, `v_rebuild_runtime_checks_actual`).
- Vistas de resumen/fallas/métricas del orquestador aplicadas en `297` (`validar_rebuild_runtime_summary`, `v_rebuild_runtime_summary_actual`, `v_rebuild_runtime_failures_actual`, `v_rebuild_runtime_pack_metrics_actual`).
- Pack de validación del orquestador aplicado en `298` (`validar_rebuild_orchestrator_runtime`, `v_rebuild_orchestrator_runtime_status_actual`).
- Suite de smoke tests por módulo aplicada en `299` (`ejecutar_smoke_tests_modulos_runtime` con checks de objetos críticos por vertical).
- Vistas/resumen de smoke tests por módulo aplicadas en `300` (`resumen_smoke_tests_modulos_runtime`, `v_smoke_tests_modulos_runtime_actual`, `v_smoke_tests_modulos_summary_actual`, `v_smoke_tests_modulos_failures_actual`, `v_smoke_tests_modulos_global_actual`).
- Pack de validación de infraestructura de smoke tests aplicado en `301` (`validar_smoke_tests_modulos_runtime`, `v_smoke_tests_modulos_validation_status_actual`).
- Pares legacy/alias con sync activo: `asistencia/asistencias`, `usuarios/usuarios_sistema`, `usuarios_sistema/usuarios_sistemas`, `cpe/comprobantes_electronicos`, `pagos_empleados/rrhh_pagos`, `permisos/permissions`, `rol_permisos/role_permissions`, `gre/gre_guias`, `compras/ordenes_compra`.

## Hallazgos forenses clave (2026-02-12)

- Migraciones detectadas: 171 archivos.
- Rango base evaluado: 0..170.
- Faltantes de numeracion en rango base: 18, 19, 23, 24, 65, 66, 67, 68, 69, 84, 107.
- Numeros duplicados: 56, 80, 86, 140, 162, 163, 168.
- Numeros fuera de rango base: 361, 362, 363, 525.
- Migracion vacia detectada: supabase/migrations/051_create_user_sessions.sql.
- Relaciones canonicas detectadas: 160 tablas.
- Referencias de codigo a relaciones no encontradas en migraciones: ver docs/db_unmatched_table_references.txt.
- RPC en codigo no encontradas en migraciones: ver docs/db_unmatched_rpc_references.txt.

## Mapa funcional minimo por modulo (contexto)

- Nucleo tenant/seguridad: tenants, empresa_config, usuarios_sistema, roles, permisos, rol_permisos, user_roles, audit_log, wizard_progress.
- Ventas/CxC: clientes, cotizaciones, pedidos_venta, pedidos_venta_detalle, documentos, documento_detalles, cuentas_por_cobrar, cxc_pagos, ventas.
- POS/Cajas: ventas_pos, detalle_ventas_pos, ventas_pos_pagos, cajas, sesiones_caja, movimientos_caja, retiros_caja, cambios_turno, cortes_caja, autorizaciones_caja.
- Compras/CxP: proveedores, cotizaciones_compra, ordenes_compra, orden_compra_detalles, recepciones, recepcion_items, devoluciones_proveedor, cuentas_por_pagar.
- Inventario/Logistica: productos, stock_movimientos, movimientos_inventario, almacenes, almacen_ubicaciones, producto_existencias, lotes_productos.
- Finanzas/Contabilidad: plan_cuentas, asientos_contables, detalle_asientos, periodos_contables, cuentas_bancarias, movimientos_bancarios, conciliaciones_bancarias, presupuestos.
- Fiscal CPE/GRE/SIRE: cpe, validaciones_sunat, comunicaciones_baja, resumenes_diarios, gre, gre_guias, gre_detalles, sire_files.
- RRHH: empleados, departamentos, contratos, asistencia, planillas, conceptos_planilla, empleado_planilla, pagos_empleados.

## Lista completa de tablas canonicas (inventario de referencia)

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

---

## Reglas de Revision Exhaustiva del Sistema

### Regla 1: No asumir - verificar en codigo
- Cada hallazgo debe incluir archivo exacto y numero de linea
- Si se reporta "falta validacion X", se debe haber leido el archivo completo, no solo un fragmento
- Citar el codigo relevante textualmente

### Regla 2: No inventar vulnerabilidades
- Solo reportar lo que se puede demostrar leyendo el codigo
- Si no se puede ver la implementacion completa (ej: funcion importada de otro archivo), seguir la cadena hasta el origen antes de concluir
- Nunca especular sobre lo que "podria" pasar sin evidencia

### Regla 3: Seguir la cadena completa de cada flujo
- Frontend -> API call -> Controller -> Service -> Database
- No revisar archivos aislados, sino el flujo end-to-end
- Verificar que los eventos emitidos tienen listeners y viceversa

### Regla 4: Distinguir severidades reales
- CRITICO: Explotable ahora (auth bypass, SQL injection, RLS faltante)
- ALTO: Problema serio pero requiere condiciones (race conditions, data leaks entre tenants)
- MEDIO: Mala practica que puede escalar (sin validacion, error handling pobre)
- BAJO: Deuda tecnica, inconsistencias de codigo

### Regla 5: No duplicar lo que Supabase/NestJS ya protege
- Si Supabase RLS esta activo en una tabla, no reportar "falta auth" en el query
- Si NestJS tiene un guard global, no reportar "endpoint sin proteccion" sin verificar primero
- Entender el stack antes de criticarlo

### Regla 6: Verificar imports y dependencias
- Antes de decir "esta funcion no existe" o "este servicio no esta conectado", buscar el import real
- Seguir la resolucion de modulos de NestJS (providers, exports, imports)

### Regla 7: Leer los tests antes de decir "no hay tests"
- Verificar archivos .spec.ts del mismo modulo
- Verificar scripts .ps1 en test/
- Verificar tests e2e en apps/web/tests/e2e/

### Regla 8: No reportar como bug lo que es diseno intencional
- Si algo parece raro, buscar contexto en archivos relacionados antes de reportar
- Considerar que es un ERP peruano (SUNAT, CPE, GRE, SIRE tienen reglas especificas)
