# Manifiesto de navegacion documental

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `manifiesto_documental`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/README.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de actualizacion: 2026-07-24

Este manifiesto organiza toda la documentacion narrativa del repo y cataloga artefactos de soporte. No sustituye a `START_HERE`; sirve para saber que leer despues, segun dominio.

## Como usar este manifiesto

1. Identifica la palabra clave o dominio de la tarea.
2. Busca en la tabla `Documentos Markdown` por ruta, tipo o titulo.
3. Abre el documento encontrado y tambien los documentos de la columna `Leer tambien`.
4. Si el tipo empieza por `historico_`, no lo tomes como verdad vigente: contrasta con `START_HERE`, `CURRENT_STATE`, `FLOW_STATUS`, codigo y migraciones.
5. Antes de codificar, confirma en `FLOW_STATUS` si el flujo esta cerrado, pendiente, bloqueado por externo o sujeto a smoke real.

Comandos recomendados:

```powershell
rg -n "palabra_clave|modulo|endpoint|tabla|RPC" docs/DOC_NAVIGATION_MANIFEST.md docs/README.md docs/00_coordination
rg -n "palabra_clave|modulo|endpoint|tabla|RPC" docs apps test monitoring -g "*.md"
rg -n "palabra_clave|endpoint|tabla|RPC|permiso" apps supabase
```

## Tipos documentales

| Tipo | Significado | Como usarlo |
|---|---|---|
| `guia_inicio` | Primera lectura de sesion | Siempre abrir primero |
| `estado_vivo` | Estado canonico actual | Decide estado, pendientes y fuentes vigentes |
| `manifiesto_documental` | Mapa completo | Ubica documentos y artefactos |
| `indice_vigente` | Indice navegable | Ayuda a moverse, no reemplaza estado vivo |
| `manual_modulo` | Manual funcional activo | Entiende flujo de negocio antes de tocar codigo |
| `auditoria_forense / auditoria_fullscope / readiness` | Evidencia tecnica reciente | Usar para riesgos, fixes, pruebas y bloqueantes |
| `release / operacion / seguridad` | Runbooks y politicas operativas | Seguir antes de deploy, seguridad o infra |
| `baseline_db` | Reconstruccion y catalogos DB | Obligatorio antes de tocar BD/migraciones |
| `historico_*_archivado` | Contexto anterior preservado | No usar como verdad final sin verificacion |
| `frontend_local / backend_tests / frontend_tests` | Docs locales de codigo y pruebas | Leer despues del mapa y del flujo canonico |

## Lectura obligatoria global

1. `docs/START_HERE.md`
2. `docs/00_coordination/CURRENT_STATE.md`
3. `docs/00_coordination/FLOW_STATUS.md`
4. `docs/00_coordination/AGENT_SYNC.md`
5. Documento fuente del dominio indicado abajo.

## Familias principales

| Familia | Ruta | Uso |
|---|---|---|
| Coordinacion viva | `docs/00_coordination/` | Estado actual, flujo por modulo, handoff entre agentes |
| Navegacion | `docs/START_HERE.md`, `docs/README.md`, `docs/DOC_NAVIGATION_MANIFEST.md` | Entrada e indice documental |
| Auditorias vigentes | `docs/audits/`, `docs/production-readiness/` | Evidencia reciente y readiness |
| Manuales activos | `docs/manuals/modules/` | Funcionamiento por vertical |
| DB y migraciones | `docs/db_*`, `docs/migration/`, `supabase/` | Baseline, reconstruccion y migracion |
| Archivo historico | `docs/archive/` | Evidencia antigua o superada, solo con contraste |

## Documentos Markdown

| Documento | Tipo | Titulo | Leer tambien |
|---|---|---|---|
| `.deepsec/AGENTS.md` | `reglas_agente` | Agent setup | `docs/START_HERE.md`, `docs/00_coordination/AGENT_SYNC.md` |
| `.deepsec/README.md` | `seguridad` | deepsec | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `agents.md` | `documento_general` | AGENTS.md | `docs/README.md`, `docs/START_HERE.md` |
| `apps/erp-api/tests/cash-reports-e2e.plan.md` | `backend_tests` | Objetivo | `docs/START_HERE.md`, `docs/README.md` |
| `apps/erp-api/tests/README-EMAIL-VALIDATION.md` | `backend_tests` | Email Validation Implementation - Proveedores Module | `docs/START_HERE.md`, `docs/README.md` |
| `apps/web/app/dashboard/compras/proveedores/README.md` | `frontend_local` | Proveedores Page - Implementation | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/app/dashboard/ventas/clientes/README.md` | `frontend_local` | Clientes Ventas | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/app/dashboard/wizard/README.md` | `frontend_local` | Configuration Wizard | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/admin/README.md` | `frontend_local` | Admin Dashboard Components | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/auth/H2_PERMISSION_GATING_STATUS.md` | `frontend_local` | H2: Verificación de Gating por Permisos en UI | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/auth/README.md` | `frontend_local` | Permission-Based Components | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/compras/COTIZACION_WIZARD_IMPLEMENTATION.md` | `frontend_local` | Cotización Wizard Implementation | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/error/README.md` | `frontend_local` | Sistema de Manejo de Errores Consistente | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/finanzas/README.md` | `frontend_local` | Componentes de Finanzas - Pago en Lote | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/finanzas/UX_GUIDE.md` | `frontend_local` | Guía de UX Consistente - Módulo Finanzas | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/tenant/IMPLEMENTATION_SUMMARY.md` | `frontend_local` | Super-Admin Dashboard Implementation Summary | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/components/ventas/reportes/README.md` | `frontend_local` | Módulo de Reportes y Estadísticas de Ventas | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/contexts/IMPLEMENTATION_SUMMARY.md` | `frontend_local` | Task 16: Frontend TenantContext Implementation - Summary | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/contexts/README.md` | `frontend_local` | TenantContext | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/hooks/README.md` | `frontend_local` | Custom Hooks | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/hooks/use-empresa-config.README.md` | `frontend_local` | useEmpresaConfig Hook | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/lib/validations/README.md` | `frontend_local` | Validaciones del Módulo de Ventas | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/lib/validations/USAGE_EXAMPLES.md` | `frontend_local` | Ejemplos de Uso - Validaciones de Ventas | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/README-DESKTOP.md` | `frontend_local` | 🖥️ ERP Suite Desktop | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `apps/web/tests/e2e/README.md` | `frontend_tests` | E2E Tests - Compras Module | `docs/START_HERE.md`, `docs/README.md` |
| `apps/web/tests/integration/README.md` | `frontend_tests` | Tests de Integración - Finanzas | `docs/START_HERE.md`, `docs/README.md` |
| `apps/web/tests/manual/conciliacion-flow.md` | `frontend_tests` | Test Manual: Importar Extracto y Conciliar | `docs/START_HERE.md`, `docs/README.md` |
| `apps/web/tests/QUICK_START.md` | `frontend_tests` | Quick Start - E2E Tests | `docs/START_HERE.md`, `docs/README.md` |
| `apps/web/VALIDACIONES_VENTAS_IMPLEMENTATION.md` | `frontend_local` | Implementación de Validaciones y Reglas de Negocio - Módulo de Ventas | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/00_coordination/AGENT_SYNC.md` | `estado_vivo` | Coordinacion Codex / Opus | `docs/START_HERE.md`, `docs/DOC_NAVIGATION_MANIFEST.md` |
| `docs/architecture/FRONTEND_STYLING_ARCHITECTURE.md` | `arquitectura_frontend` | Arquitectura Tailwind/shadcn, tokens y contrato dark/light | `docs/00_coordination/CURRENT_STATE.md`, `docs/00_coordination/FLOW_STATUS.md`, `docs/audits/2026-07-15-ui-accounting-security-closure.md` |
| `docs/00_coordination/ANTI_DUPLICATION_PROTOCOL.md` | `protocolo_agente` | Protocolo anti-duplicacion para agentes | `docs/START_HERE.md`, `docs/00_coordination/DECISIONS.md`, `docs/DOC_NAVIGATION_MANIFEST.md` |
| `docs/00_coordination/CURRENT_STATE.md` | `estado_vivo` | Estado Actual del ERP | `docs/START_HERE.md`, `docs/DOC_NAVIGATION_MANIFEST.md` |
| `docs/00_coordination/DECISIONS.md` | `decisiones_canonicas` | Decisiones canonicas del ERP | `docs/START_HERE.md`, `docs/00_coordination/ANTI_DUPLICATION_PROTOCOL.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/00_coordination/FLOW_STATUS.md` | `estado_vivo` | Estado de Flujos del ERP | `docs/START_HERE.md`, `docs/DOC_NAVIGATION_MANIFEST.md` |
| `docs/archive/audit_reports_legacy/API_ENDPOINT_INVENTORY.md` | `historico_auditoria_archivado` | Inventario de endpoints (NestJS) — heurístico | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/API_GUARD_AUDIT.md` | `historico_auditoria_archivado` | Auditoría de guards en controllers (heurística) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/AUDITORIA_MODULO_USUARIOS.md` | `historico_auditoria_archivado` | AUDITORÍA EXHAUSTIVA: MÓDULO DE USUARIOS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/COMMAND_LOGS.md` | `historico_auditoria_archivado` | Logs de comandos (root) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/COMPRAS_AUDIT.md` | `historico_auditoria_archivado` | Auditoría profunda — Compras (OC → Recepción → CxP → Devolución) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/CUESTIONARIO_TECNICO_QA_COMPLETO.md` | `historico_auditoria_archivado` | 🔍 CUESTIONARIO TÉCNICO EXHAUSTIVO - AUDITORÍA QA COMPLETA | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/DB_RPC_INVENTORY.md` | `historico_auditoria_archivado` | Inventario de RPCs (Postgres) — desde supabase/migrations | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/ENVIRONMENT.md` | `historico_auditoria_archivado` | Evidencia de entorno — ERP Suite | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/ESTADO_COMPLETO_AUDITORIA.md` | `historico_auditoria_archivado` | 📊 ESTADO COMPLETO DE AUDITORÍA - ERP | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/IDEMPOTENCY_AUDIT.md` | `historico_auditoria_archivado` | Auditoría profunda — Idempotencia por dominio (API + DB) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/missing_tests.md` | `historico_auditoria_archivado` | Reporte de Tests Faltantes por Módulo | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_01_ventas.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 1: VENTAS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_02_cpe.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 2: CPE | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_03_inventario.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 3: INVENTARIO | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_04_compras.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 4: COMPRAS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_05_finanzas.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 5: FINANZAS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_06_rrhh.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 6: RRHH | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_06_rrhh_audit.md` | `historico_auditoria_archivado` | 🔍 AUDITORÍA COMPLETA - MÓDULO RRHH | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_07_auth.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 7: AUTH | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_08_tenants.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 8: TENANTS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_09_pos.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 9: POS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_09_pos_audit.md` | `historico_auditoria_archivado` | 🔍 AUDITORÍA COMPLETA - MÓDULO POS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_10_dashboard.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 10: DASHBOARD | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_11_reportes.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 11: REPORTES | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_12_configuracion.md` | `historico_auditoria_archivado` | REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 12: CONFIGURACIÓN | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_notifications_audit.md` | `historico_auditoria_archivado` | Auditoría Exhaustiva: Módulo de Notificaciones | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_notifications_audit_v2.md` | `historico_auditoria_archivado` | 🔍 AUDITORÍA EXHAUSTIVA: Módulo de Notificaciones v2 | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/module_sunat_fiscal_audit.md` | `historico_auditoria_archivado` | 📊 AUDITORÍA MÓDULOS SUNAT/FISCAL - REPORTE COMPLETO | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/OUTBOX_AUDIT.md` | `historico_auditoria_archivado` | Auditoría profunda — Outbox (DB + API + worker) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/plan_pos.md` | `historico_auditoria_archivado` | - | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/PROMP.md` | `historico_auditoria_archivado` | PROMP.md - Protocolo de Auditoría Forense 360° (Code + DB + Tests + Docs) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/Q&A_questions.md` | `historico_auditoria_archivado` | Advanced Q&A - Deep System Analysis | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/Q&A_questions_extended.md` | `historico_auditoria_archivado` | Advanced Q&A - Extended Critical Analysis (Senior Engineer Perspective) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/RESUMEN_AUDITORIA_COMPLETA.md` | `historico_auditoria_archivado` | 📊 RESUMEN DE AUDITORÍA COMPLETA - ERP | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/RESUMEN_FINAL_AUDITORIA.md` | `historico_auditoria_archivado` | ✅ RESUMEN FINAL DE AUDITORÍA - ERP | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/SUPABASE_LOCAL_FAILURE.md` | `historico_auditoria_archivado` | Supabase local — fallo de `npx supabase start` (migraciones) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/TESTS_FALTANTES_CONSOLIDADO.md` | `historico_auditoria_archivado` | 📋 TESTS FALTANTES - CONSOLIDADO FINAL | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/audit_reports_legacy/VENTAS_AUDIT.md` | `historico_auditoria_archivado` | Auditoría profunda — Ventas (cotizaciones/pedidos/RMA → CPE/GRE) | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/legacy_root_docs/CODEX-2026-04-historical.md` | `historico_agente_archivado` | CODEX.md - Plan técnico histórico de producción del ERP | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/CAJAS-FORENSIC-REPORT-FIXED.md` | `historico_contexto_archivado` | CAJAS FORENSIC REPORT - Analisis y Fixes | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/claude-revision-fixes.md` | `historico_contexto_archivado` | Registro de Correcciones — ERP Revision Exhaustiva | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/claude-revision.md` | `historico_contexto_archivado` | Revision Exhaustiva del Sistema ERP — Reporte Final de Hallazgos | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/FORENSIC-INTERCONEXIONES-EJECUCION.md` | `historico_contexto_archivado` | Ejecucion Forense — Interconexiones de Modulos | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/FORENSIC-INTERCONEXIONES-PLAN.md` | `historico_contexto_archivado` | Plan de Analisis Forense — Interconexiones de Modulos | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/FORENSIC-SESSION-STATE.md` | `historico_contexto_archivado` | Forensic Session State — Para Continuación | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/POS-FORENSIC-REPORT-FIXED.md` | `historico_contexto_archivado` | POS FORENSIC REPORT - FIXES APLICADOS | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/POS-FORENSIC-REPORT.md` | `historico_contexto_archivado` | REPORTE FORENSE DEL POS - Analisis Exhaustivo | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/PROJECT_REVIEW_INDEX.md` | `historico_contexto_archivado` | Indice Maestro de Revision Exhaustiva del ERP | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/archive/session_history_legacy/PROJECT_STATUS.md` | `historico_contexto_archivado` | Estado Actual del Proyecto ERP | `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/auditoria_desktop_vs_web_2026-05.md` | `auditoria_forense` | Auditoria desktop vs web - 2026-05 | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/auditoria_forense_contable_2026-05.md` | `auditoria_forense` | Auditoria Forense Contable ERP - Peru | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md` | `auditoria_forense` | Auditoria Forense Inventario, Logistica, Kardex y Costeo | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` | `auditoria_forense` | Auditoria forense contable: Tesoreria, Caja, Bancos, CxC/CxP y conciliacion | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/auditoria_impresion_cpe_facturas_2026-05.md` | `auditoria_forense` | Auditoria de impresion CPE y facturas | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/auditoria_multiusuario_performance_2026-05.md` | `auditoria_forense` | Auditoria multiusuario y cuellos de botella - 2026-05 | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-05-26-forensic-audit-pre-prod.md` | `auditoria_forense` | Auditoría forense pre-producción 2026-05-26 | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-05-26-system-analytics-completed.md` | `auditoria_fullscope` | Estado Final Codex 2026-06-01 | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-06-01-desktop-offline-closure.md` | `auditoria_forense` | Cierre offline desktop pre-produccion | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-06-04-deepsec-security-verification.md` | `auditoria_seguridad` | Verificacion DeepSec de seguridad - 2026-06-04 | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`, `docs/security/session-auth.md` |
| `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md` | `auditoria_forense` | Evidencia SUNAT beta CPE - 2026-06-16 | `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/release/GO_LIVE_RUNBOOK.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md` | `auditoria_forense` | Evidencia SUNAT SOL secundario - 2026-06-17 | `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md`, `docs/release/GO_LIVE_RUNBOOK.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-06-17-pos-sunat-print-readiness.md` | `auditoria_forense` | Readiness POS para impresion SUNAT - 2026-06-17 | `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md` |
| `docs/audits/2026-06-17-sunat-wizard-onboarding-readiness.md` | `auditoria_forense` | Readiness del wizard SUNAT por tenant - 2026-06-17 | `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md`, `docs/release/GO_LIVE_RUNBOOK.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-06-17-sunat-cpe-gre-xml-alignment.md` | `auditoria_forense` | Alineacion SUNAT CPE/GRE XML y transporte - 2026-06-17 | `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md`, `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md`, `docs/audits/2026-06-17-sunat-wizard-onboarding-readiness.md` |
| `docs/audits/2026-06-17-sunat-accounting-entries-pos-rrhh-ple-alignment.md` | `auditoria_forense` | Alineacion SUNAT de asientos POS/RRHH/PLE - 2026-06-17 | `docs/auditoria_forense_contable_2026-05.md`, `docs/manuals/modules/FINANZAS_CONTABILIDAD.md`, `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/audits/2026-06-17-sunat-cpe-gre-xml-alignment.md` |
| `docs/audits/2026-06-17-web-runtime-devtools-audit.md` | `auditoria_forense` | Auditoria runtime web y DevTools - 2026-06-17 | `apps/web/README-DESKTOP.md`, `docs/security/session-auth.md`, `docs/audits/2026-06-01-desktop-offline-closure.md` |
| `docs/audits/2026-06-18-functional-e2e-qa-write-smoke.md` | `auditoria_forense` | QA funcional E2E con escrituras controladas - 2026-06-18 | `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/manuals/modules/COMPRAS_INVENTARIO.md`, `docs/manuals/modules/FINANZAS_CONTABILIDAD.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/audits/2026-06-18-supabase-advisor-security-hardening.md` | `auditoria_seguridad` | Hardening Supabase Advisor DEV/PROD - 2026-06-18 | `docs/security/supabase-access-audit.md`, `docs/ops/supabase-connection.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-07-14-prod-demo-data-cleanup.md` | `auditoria_operacional` | Separacion DEV/PROD y limpieza de datos demo - 2026-07-14 | `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md`, `docs/ops/supabase-connection.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/audits/2026-07-14-local-secret-storage-hardening.md` | `auditoria_seguridad` | Hardening de secretos y almacenamiento local - 2026-07-14 | `docs/security/session-auth.md`, `apps/web/lib/auth-service.ts`, `apps/web/lib/offline-store.ts` |
| `docs/audits/2026-07-15-ui-accounting-security-closure.md` | `auditoria_forense` | Cierre UI, integraciones contables y seguridad local - 2026-07-15 | `docs/00_coordination/CURRENT_STATE.md`, `docs/00_coordination/FLOW_STATUS.md`, `docs/security/session-auth.md` |
| `docs/audits/2026-07-15-dependency-and-large-file-cleanup.md` | `auditoria_arquitectura_deuda` | Limpieza de dependencias y mapa de archivos inmantenibles - 2026-07-15 | `docs/00_coordination/CURRENT_STATE.md`, `package.json`, `pnpm-lock.yaml` |
| `docs/audits/2026-07-22-inventory-single-ledger-closure.md` | `auditoria_forense` | Cierre single-ledger de inventario en DEV - 2026-07-22 | `docs/00_coordination/CURRENT_STATE.md`, `docs/00_coordination/FLOW_STATUS.md`, `docs/manuals/modules/COMPRAS_INVENTARIO.md` |
| `docs/audits/2026-07-24-production-closure-functional-qa.md` | `auditoria_forense` | Cierre QA funcional integral en DEV - 2026-07-24 | `docs/00_coordination/CURRENT_STATE.md`, `docs/00_coordination/FLOW_STATUS.md`, `docs/00_coordination/DECISIONS.md` |
| `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md` | `arquitectura_canonica` | Arquitectura canonica de bases DEV y PROD | `docs/00_coordination/DECISIONS.md`, `docs/ops/supabase-connection.md`, `docs/release/GO_LIVE_RUNBOOK.md` |
| `docs/architecture/CPE_SERVICE_BOUNDARIES.md` | `arquitectura_canonica` | Límites internos del módulo CPE | `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/00_coordination/DECISIONS.md`, `docs/audits/2026-06-16-sunat-beta-cpe-evidence.md` |
| `docs/architecture/CONTABILIDAD_CONTROLLER_BOUNDARIES.md` | `arquitectura_canonica` | Límites de los controladores de Contabilidad | `docs/manuals/modules/FINANZAS_CONTABILIDAD.md`, `docs/security/route-access-matrix.md`, `docs/00_coordination/DECISIONS.md` |
| `docs/CODEX_HANDOFF_2026-05-24.md` | `documento_general` | Codex handoff - 2026-05-24 | `docs/README.md`, `docs/START_HERE.md` |
| `docs/configuration.md` | `documento_general` | Configuración de entorno – apps/erp-api | `docs/README.md`, `docs/START_HERE.md` |
| `docs/db_forensic_baseline.md` | `baseline_db` | Baseline Forense de Base de Datos (Pre-Reset) | `docs/START_HERE.md`, `AGENTS.md` |
| `docs/db_rebuild_status.md` | `baseline_db` | Estado de Reconstruccion de BD (Post-Reset) | `docs/START_HERE.md`, `AGENTS.md` |
| `docs/db_reconstruction_plan.md` | `baseline_db` | Plan de Reconstruccion de BD (Pre-Reset) | `docs/START_HERE.md`, `AGENTS.md` |
| `docs/DOC_NAVIGATION_MANIFEST.md` | `manifiesto_documental` | Manifiesto de navegacion documental | `docs/START_HERE.md`, `docs/README.md`, `docs/DOCUMENTATION_QUARANTINE.md` |
| `docs/DOCUMENTATION_QUARANTINE.md` | `control_documental` | Cuarentena de Documentacion | `docs/START_HERE.md`, `docs/DOC_NAVIGATION_MANIFEST.md` |
| `docs/manuals/modules/COMPRAS_INVENTARIO.md` | `manual_modulo` | Documentación Técnica Exhaustiva: Compras e Inventario | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/manuals/modules/FINANZAS_CONTABILIDAD.md` | `manual_modulo` | Documentación Técnica Exhaustiva: Finanzas y Contabilidad | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/manuals/modules/VENTAS_POS_FISCAL.md` | `manual_modulo` | Documentación Técnica Exhaustiva: Ventas, POS y Fiscal | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/migration/CLIENT_MIGRATION_RUNBOOK.md` | `migracion_datos` | Runbook de migración de data desde ERP externo | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/ops/docker.md` | `operacion` | Docker y Observabilidad ERP | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/ops/health.md` | `operacion` | Health checks de operaciones | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/ops/observability.md` | `operacion` | Observabilidad local ERP | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/ops/supabase-connection.md` | `operacion` | Supabase Direct Database Connection | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md` | `readiness` | Auditoria forense pre-produccion ERP - 2026-05-27 | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/production-readiness/ERP_PRODUCTION_READINESS.md` | `readiness` | ERP Production Readiness | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/production-readiness/ERP_RISK_AUDIT_2026-05-22.md` | `readiness` | Auditoria De Riesgos ERP Fiscal Multi-Tenant | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/README.md` | `indice_vigente` | ERP Documentation Hub | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/release/branch-protection.md` | `release` | Branch protection de `main` (Checklist técnico) | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/release/GO_LIVE_RUNBOOK.md` | `release` | Go-Live Runbook ERP | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/release/production-checklist.md` | `release` | Production checklist técnica | `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md` |
| `docs/security/rate-limiting.md` | `seguridad` | Rate limiting en backend (P2.4) | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/security/route-access-matrix.md` | `seguridad` | Route Access Matrix | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/security/session-auth.md` | `seguridad` | sessions con cookie HttpOnly (`apps/web` + `apps/erp-api`) | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/security/supabase-access-audit.md` | `seguridad` | Auditoría de uso de clientes Supabase — P2.5 | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `docs/START_HERE.md` | `guia_inicio` | START HERE - Guia de sesion del ERP | `docs/00_coordination/CURRENT_STATE.md`, `docs/DOC_NAVIGATION_MANIFEST.md` |
| `monitoring/README.md` | `operacion` | Monitoreo ERP Suite | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `README.md` | `indice_vigente` | 🏢 ERP Suite - Sistema Empresarial Completo | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md` |
| `test/AUDITORIA_MODULO_VENTAS_CORREGIDA.md` | `frontend_tests` | AUDITORÍA TÉCNICA (REVERSIÓN CORREGIDA) – MÓDULO DE VENTAS | `docs/START_HERE.md`, `docs/README.md` |
| `test/test-crear-proveedor-form.md` | `frontend_tests` | Test Manual: Crear Proveedor con Validación | `docs/START_HERE.md`, `docs/README.md` |
| `test/test-editar-proveedor.md` | `frontend_tests` | Test Manual: Editar Proveedor | `docs/START_HERE.md`, `docs/README.md` |
| `test/test-match-manual-modal.md` | `frontend_tests` | Test: Match Manual Modal Component | `docs/START_HERE.md`, `docs/README.md` |
| `test/test-recepcion-registrada-event.md` | `frontend_tests` | Test Plan: RecepcionRegistrada Event Listener | `docs/START_HERE.md`, `docs/README.md` |
| `test/test-recepciones-parciales.md` | `frontend_tests` | Test: Manejo de Recepciones Parciales en CxP | `docs/START_HERE.md`, `docs/README.md` |
