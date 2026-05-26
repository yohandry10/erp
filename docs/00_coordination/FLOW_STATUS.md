# Estado de Flujos del ERP

Fecha de actualizacion: 2026-05-26

Esta matriz resume donde vamos por flujo. Para detalles, usar siempre el documento fuente.

## Matriz de cierre

| Flujo | Estado actual | Documentos fuente | Migraciones clave | Pendiente para produccion real |
|---|---|---|---|---|
| Superadmin, tenant nuevo, RBAC y RLS | Validado local/sandbox | `docs/production-readiness/ERP_PRODUCTION_READINESS.md`, `docs/security/route-access-matrix.md` | `322..326` | Confirmar aplicacion en entorno destino y CI remoto |
| Ventas B2B, pedidos y aprobaciones | Validado por E2E/readiness | `docs/production-readiness/ERP_PRODUCTION_READINESS.md`, `docs/manuals/modules/VENTAS_POS_FISCAL.md` | `327` y migraciones previas de ventas | Mantener smoke por vertical y revisar stock/facturacion al cambiar flujo |
| POS, ticket, pago, caja y CPE/outbox | Cerrado tecnico para venta/caja; impresion POS mitigada | `docs/auditoria_forense_contable_2026-05.md`, `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md`, `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/manuals/modules/VENTAS_POS_FISCAL.md` | `327`, `334` | No degradar a fallback legacy en produccion; validar migracion aplicada; smoke con impresora/navegador real |
| Cajas, cortes, retiros y arqueo | Cerrado tecnico en controles ejecutados | `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md`, `docs/manuals/modules/FINANZAS_CONTABILIDAD.md` | `334` y hardening previo de cajas | Verificar cierre simple/avanzado segun entrypoint usado y monitoreo de diferencias |
| CxC, cobros, banco y saldo cliente | Cerrado tecnico para cobro transaccional | `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` | `334` | Mantener RPC `registrar_cxc_pago_tx` como camino preferente |
| CxP, pagos y bancarizacion | Cerrado tecnico en controles ejecutados | `docs/auditoria_forense_contable_2026-05.md`, `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` | `331`, `332`, `334` | Matriz legal SPOT/detracciones por actividad real del contribuyente |
| Bancos y conciliacion bancaria | Cerrado tecnico para pareo transaccional | `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` | `334` | Mantener `conciliar_movimientos_bancarios_tx` y alertas de diferencias |
| Contabilidad, asientos y estados financieros | Cerrado tecnico en alcance validado | `docs/auditoria_forense_contable_2026-05.md` | `313..318`, `331`, `332` | Validacion operacional con datos productivos y cierre mensual real |
| CPE/GRE fiscal | Codigo de impresion/emision mitigado; falta evidencia beta real | `docs/auditoria_forense_contable_2026-05.md`, `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/production-readiness/ERP_PRODUCTION_READINESS.md`, `docs/manuals/modules/VENTAS_POS_FISCAL.md` | `331`, `332` y fiscal previo | Certificado SUNAT/OSE productivo, CDR/ticket/acuse real; decidir PSE/OSE API o SUNAT directo con URL SOAP explicita |
| SIRE/PLE/PLAME | Parcialmente mitigado tecnicamente | `docs/auditoria_forense_contable_2026-05.md` | `331`, `332` y fiscal/RRHH previo | Validar con SUNAT/PLE/PLAME real y regimen del contribuyente |
| App desktop/Tauri | Online-first empaquetable en debug; runtime sin proxy `/backend`; offline local endurecido (`offline_mode` fuerza cache/outbox, cola Tauri con lock, sync contra API vigente) y sidebar con prefetch limitado/escalonado; `test:offline` OK; 108/108 rutas exportadas smoke OK con API simulada | `docs/auditoria_desktop_vs_web_2026-05.md`, `apps/web/README-DESKTOP.md` | N/A | Smoke con API real, prueba de reconexion offline desde `.exe`, CSP/ALLOWED_ORIGINS finales y decision sobre deep links dinamicos en static export |
| Multiusuario, polling y workers | Mitigacion tecnica aplicada: escrituras frontend sin retry automatico no idempotente, dashboard/notificaciones con polling visible/sin solapes/jitter, workers outbox/contabilidad/POS con locks distribuidos | `docs/auditoria_multiusuario_performance_2026-05.md`, `docs/ops/observability.md` | N/A | Prueba de carga real con p95/p99, 429/5xx, saturacion Supabase y backlog de colas |
| Inventario, salidas y reservas | Cerrado tecnico con ajuste posterior | `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md`, `docs/manuals/modules/COMPRAS_INVENTARIO.md` | `333`, `335` | Mantener `descontar_stock_y_liberar_reserva` como primitiva unica; revisar divergencias historicas |
| Kardex y costeo | Cerrado operativo con politica `ULTIMO_COSTO` | `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md` | `333`, `335` | Implementar FIFO/capas solo si negocio/legal lo exige |
| Compras, OC, recepciones y devoluciones | Validado por E2E/readiness; riesgos tratados en auditorias | `docs/production-readiness/ERP_PRODUCTION_READINESS.md`, `docs/production-readiness/ERP_RISK_AUDIT_2026-05-22.md`, `docs/manuals/modules/COMPRAS_INVENTARIO.md` | `331..335` segun impacto contable/inventario | No cerrar recepcion sin outbox/asiento detectable; mantener pruebas de concurrencia |
| RRHH, planillas y pagos | Validado tecnicamente | `docs/auditoria_forense_contable_2026-05.md`, `docs/production-readiness/ERP_PRODUCTION_READINESS.md` | Migraciones RRHH `161..202` y hardening posterior | PLAME/T-Registro real y validacion legal externa |
| Seguridad, sesiones y rate limiting | Validado documentalmente con deuda residual | `docs/security/session-auth.md`, `docs/security/rate-limiting.md`, `docs/security/supabase-access-audit.md` | `077..082`, `095..097`, `322..326` y hardening security | Reducir usos `PUBLIC_RISKY`, revisar jobs `ADMIN_ONLY`, secrets productivos |
| Operacion Docker, health y observabilidad | Validado localmente | `docs/ops/docker.md`, `docs/ops/health.md`, `docs/ops/observability.md` | N/A | Primera ejecucion remota CI/runner y configuracion productiva de Grafana/secrets |

## Reglas de uso

- Si un flujo aparece como "cerrado tecnico", significa cerrado para el alcance probado en local/sandbox, no certificacion legal/productiva absoluta.
- Si un manual funcional contradice una auditoria forense de mayo 2026, prevalece la auditoria y luego `docs/00_coordination/CURRENT_STATE.md`.
- Si se agrega una migracion nueva, actualizar esta matriz, `docs/00_coordination/CURRENT_STATE.md`, `docs/db_rebuild_status.md` y la nota relevante en `docs/README.md`.
- Si se cierra un riesgo externo con evidencia real, agregar fecha, comando/evidencia y entorno exacto.
