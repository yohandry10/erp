# Plan de Reconstruccion de BD (Pre-Reset)

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

## Estado de ejecucion post-reset (2026-02-13)

- Reconstruccion activa iniciada en nueva serie `000..016`.
- Ver estado detallado y brechas vigentes en `docs/db_rebuild_status.md`.

## Objetivo

Definir que reconstruir primero al reiniciar la BD, aun cuando haya migraciones historicas perdidas.

## Decision practica

Si no hay datos productivos, conviene resetear; pero antes hay que preservar un mapa operativo en 4 buckets:
1. Tablas criticas de arranque (P0)
2. Tablas de alto uso por codigo (P1)
3. Objetos usados por codigo pero no modelados en migraciones (faltantes activas)
4. Tablas presentes en migraciones pero sin uso detectado en codigo (legacy/soporte)

## Bucket 1: P0 (arranque minimo del sistema)

Estas deben existir antes de probar modulos:
- audit_log (refs_src=6)
- empresa_config (refs_src=96)
- outbox_events (refs_src=31)
- permisos (refs_src=5)
- rol_permisos (refs_src=10)
- roles (refs_src=23)
- tenants (refs_src=9)
- user_roles (refs_src=13)
- usuarios_sistema (refs_src=62)
- wizard_progress (refs_src=5)

## Bucket 2: P1 (alto uso por codigo)

Top de tablas mas referenciadas en codigo fuente (no tests):
- productos (refs_src=55)
- sesiones_caja (refs_src=46)
- cpe (refs_src=45)
- asientos_contables (refs_src=35)
- cotizaciones (refs_src=35)
- pedidos_venta (refs_src=35)
- ordenes_compra (refs_src=32)
- detalle_asientos (refs_src=30)
- cuentas_por_pagar (refs_src=29)
- movimientos_bancarios (refs_src=28)
- clientes (refs_src=24)
- gre_guias (refs_src=22)
- documentos (refs_src=21)
- ventas_pos (refs_src=21)
- integration_logs (refs_src=20)
- orden_compra_detalles (refs_src=20)
- proveedores (refs_src=20)
- sire_files (refs_src=20)

## Bucket 3: faltantes activas (codigo apunta y no hay CREATE localizado)

### Tablas/vistas faltantes activas
- usuarios (src=9, test=0, modulos=cajas,compras,ventas,web)
- user_sessions (src=8, test=0, modulos=auth,tenants,usuarios)
- comprobantes_electronicos (src=5, test=0, modulos=cpe,gre)
- rrhh_pagos (src=4, test=0, modulos=rrhh)
- asistencias (src=2, test=0, modulos=shared)
- asientos_contables_rrhh (src=1, test=0, modulos=otros)
- compras (src=1, test=0, modulos=shared)
- fe_configuracion (src=1, test=0, modulos=otros)
- feriados (src=1, test=0, modulos=shared)
- movimientos_stock (src=1, test=0, modulos=shared)
- pagos_ventas (src=1, test=0, modulos=shared)
- profiles (src=1, test=0, modulos=otros)
- proveedores_cuarta_categoria (src=1, test=0, modulos=otros)
- supervisor_pins (src=1, test=0, modulos=cajas)
- tipos_documentos_fiscales (src=1, test=0, modulos=otros)
- tipos_impuestos (src=1, test=0, modulos=otros)
- pdf (src=0, test=1, modulos=-)

### RPC faltantes activas
- acquire_job_lock (src=1, test=0, modulos=shared)
- calcular_balance_comprobacion (src=1, test=0, modulos=contabilidad)
- get_analisis_crecimiento (src=1, test=0, modulos=shared)
- get_asientos_por_tipo (src=1, test=0, modulos=contabilidad)
- get_kpis_financieros (src=1, test=0, modulos=shared)
- get_resumen_financiero_mensual (src=1, test=0, modulos=shared)
- obtener_siguiente_numero_serie (src=1, test=0, modulos=otros)
- release_job_lock (src=1, test=0, modulos=shared)

## Bucket 4: tablas solo en migraciones (sin uso detectado en codigo)

Estas no se deben borrar del mapa; pueden corresponder a:
- modulos incompletos,
- caracteristicas legacy,
- rutas no cubiertas por el codigo actual.

Cantidad detectada: 31

- asignacion_costos (primera_migracion=000__bootstrap_core_tables.sql)
- audit_log_archive (primera_migracion=063_audit_log_rotation.sql)
- auditoria (primera_migracion=000__bootstrap_core_tables.sql)
- calendario_empresa (primera_migracion=000__bootstrap_core_tables.sql)
- cobranzas (primera_migracion=000__bootstrap_core_tables.sql)
- config_alertas_vencimiento (primera_migracion=128__lotes_series_fefo.sql)
- detalle_retenciones_categoria (primera_migracion=000__bootstrap_core_tables.sql)
- documento_archivos (primera_migracion=000__bootstrap_core_tables.sql)
- egresos (primera_migracion=000__bootstrap_core_tables.sql)
- eventos_pos (primera_migracion=127_eventos_pos_auditoria.sql)
- gestiones_cobranza (primera_migracion=000__bootstrap_core_tables.sql)
- inventarios_permanentes (primera_migracion=000__bootstrap_core_tables.sql)
- knowledge_base (primera_migracion=148__knowledge_base_help_system.sql)
- libros_electronicos_sunat (primera_migracion=000__bootstrap_core_tables.sql)
- lotes_productos (primera_migracion=128__lotes_series_fefo.sql)
- movimientos_consignacion (primera_migracion=000__bootstrap_core_tables.sql)
- movimientos_lotes (primera_migracion=128__lotes_series_fefo.sql)
- notificacion_tipo_roles (primera_migracion=151__notificaciones_por_rol.sql)
- pagos_facturas (primera_migracion=000__bootstrap_core_tables.sql)
- pagos_lote (primera_migracion=037_add_idempotency_pago_lote.sql)
- pii_encryption_log (primera_migracion=131__pii_encryption_support.sql)
- plantillas_asientos (primera_migracion=047_create_plantillas_asientos_table.sql)
- plantillas_asientos_detalle (primera_migracion=047_create_plantillas_asientos_table.sql)
- plantillas_asientos_historial (primera_migracion=047_create_plantillas_asientos_table.sql)
- pos_numeracion (primera_migracion=111__pos_tx_outbox.sql)
- rate_limit_configs (primera_migracion=132__adaptive_rate_limiting.sql)
- rls_alert_config (primera_migracion=034_configure_rls_alerts.sql)
- saldos_iniciales_cuentas (primera_migracion=000__bootstrap_core_tables.sql)
- sucursales (primera_migracion=109__productos_servicios_cajas.sql)
- usuarios_sistemas (primera_migracion=000__bootstrap_core_tables.sql)
- validaciones_sunat (primera_migracion=000__bootstrap_core_tables.sql)

## Lo que NO se puede recuperar solo con codigo

Tambien puede haber objetos que:
- existan en la BD real actual,
- no esten en supabase/migrations,
- y no aparezcan en el codigo.

Esos solo se detectan con snapshot de esquema de la BD viva (antes de borrar):
- tablas/columnas
- funciones
- vistas
- triggers
- politicas RLS
- extensiones

## Orden recomendado de reconstruccion

1. Levantar esquema base con P0.
2. Levantar P1 por modulo (ventas, compras, inventario, finanzas, fiscal, rrhh).
3. Crear/ajustar faltantes activas (tablas + RPC) para que el codigo no rompa.
4. Revisar bucket legacy (solo migraciones) y decidir conservar, consolidar o deprecar.
5. Ejecutar smoke/e2e por modulo.
6. Congelar nueva baseline (000_baseline.sql) + migraciones incrementales limpias.

## Archivos de soporte

- docs/db_reconstruction_manifest.csv
- docs/db_unmatched_tables_priority.csv
- docs/db_unmatched_rpcs_priority.csv
- docs/db_migration_only_tables.csv
- docs/db_forensic_baseline.md
