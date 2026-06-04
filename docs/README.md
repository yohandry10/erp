# ERP Documentation Hub

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `indice_vigente`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Documentación técnica del ERP, organizada por dominio. Solo se listan documentos **vigentes**.

> **Primera lectura obligatoria:** [START_HERE.md](START_HERE.md). Ese archivo resume el estado real, el orden de lectura, la jerarquia de verdad documental y que documentos usar segun la tarea.

> **Estado vivo:** despues de `START_HERE.md`, leer `00_coordination/CURRENT_STATE.md` y `00_coordination/FLOW_STATUS.md`. Este README es indice; no es la fuente de estado vivo.

> **Política:** Los manuales pre-reconstrucción DB (enero 2026) y las docs de implementación RLS previas al hardening (octubre 2025) fueron borrados en mayo 2026. Si necesitás consultar contenido histórico, recuperá los archivos vía `git log -- <ruta>`. Ver `DOCUMENTATION_QUARANTINE.md` para la trazabilidad de los borrados.

---

## 🎯 Estado del proyecto

| Documento | Propósito |
|---|---|
| [START_HERE.md](START_HERE.md) | **Primera lectura obligatoria**: guia de sesion, jerarquia documental, rutas por tema y protocolo de cierre |
| [DOC_NAVIGATION_MANIFEST.md](DOC_NAVIGATION_MANIFEST.md) | Mapa completo de documentos Markdown y artefactos CSV/TXT/JSON; indica rol y lecturas relacionadas por archivo |
| [00_coordination/CURRENT_STATE.md](00_coordination/CURRENT_STATE.md) | **Fuente canonica actual** para recuperar contexto de sesion, migraciones vigentes y pendientes reales |
| [00_coordination/FLOW_STATUS.md](00_coordination/FLOW_STATUS.md) | Matriz vigente de estado por flujo funcional y fuente primaria por dominio |
| [00_coordination/AGENT_SYNC.md](00_coordination/AGENT_SYNC.md) | Contrato para coordinar Codex, Opus y cualquier `memory.md` |
| [archive/session_history_legacy/PROJECT_STATUS.md](archive/session_history_legacy/PROJECT_STATUS.md) | Estado operativo histórico de estabilización (build, type-check, riesgos, rondas) |
| [archive/session_history_legacy/PROJECT_REVIEW_INDEX.md](archive/session_history_legacy/PROJECT_REVIEW_INDEX.md) | Índice maestro histórico de revisión por vertical |
| [production-readiness/ERP_PRODUCTION_READINESS.md](production-readiness/ERP_PRODUCTION_READINESS.md) | Gate de readiness para producción real |
| [production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md](production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md) | Auditoría forense pre-producción 2026-05-27: XSS, service-role/tenant isolation, migración externa, RLS/RPC, pruebas y riesgos residuales |
| [CODEX_HANDOFF_2026-05-24.md](CODEX_HANDOFF_2026-05-24.md) | Handoff más reciente: tesorería/caja/bancos/CxC/CxP y migración de cierre forense |
| [DOCUMENTATION_QUARANTINE.md](DOCUMENTATION_QUARANTINE.md) | Trazabilidad de docs consolidados/borrados |

## 🗄️ Base de datos

| Documento | Propósito |
|---|---|
| [db_rebuild_status.md](db_rebuild_status.md) | Fuente base histórica de reconstrucción `000..305`; complementarla con readiness/auditorías recientes antes de tocar BD |
| [db_reconstruction_plan.md](db_reconstruction_plan.md) | Plan de reconstrucción (baseline pre-reset, feb 2026) |
| [db_forensic_baseline.md](db_forensic_baseline.md) | Baseline forense pre-reset (feb 2026) |
| `db_*.csv`, `db_*.txt`, `code_*.csv`, `code_*.txt` | Artefactos del baseline forense — útiles para reproducir auditorías. No tocar. |

### Auditorías forenses recientes

| Documento | Propósito |
|---|---|
| [auditoria_forense_contable_2026-05.md](auditoria_forense_contable_2026-05.md) | Cierre contable/fiscal técnico, migraciones `331..332`, gates E2E y riesgos externos |
| [auditoria_impresion_cpe_facturas_2026-05.md](auditoria_impresion_cpe_facturas_2026-05.md) | Auditoría de impresión/representación CPE: PDF A4, ticket POS, rutas SUNAT/PSE y bloqueos antes de "solo credenciales" |
| [auditoria_desktop_vs_web_2026-05.md](auditoria_desktop_vs_web_2026-05.md) | Auditoría de paridad desktop/Tauri vs web: build estático, proxy API, comandos nativos, plugins, offline y fiscal/PDF local |
| [auditoria_multiusuario_performance_2026-05.md](auditoria_multiusuario_performance_2026-05.md) | Auditoría multiusuario: retries no idempotentes, polling, locks distribuidos de workers, flags de apagado, prueba read-only real con p95/p99 y backlog outbox |
| [auditoria_forense_inventario_logistica_costeo_2026-05.md](auditoria_forense_inventario_logistica_costeo_2026-05.md) | Inventario/logística/kardex/costeo, remediación `333__inventory...` + ajuste `335__descontar_stock_authoritative.sql` |
| [auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md](auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md) | Tesorería/caja/bancos/CxC/CxP, remediación `334__treasury...` |
| [audits/2026-05-26-forensic-audit-pre-prod.md](audits/2026-05-26-forensic-audit-pre-prod.md) | Auditoría forense pre-producción 2026-05-26: 60+ hallazgos (multi-tenant leaks, PostgREST filter injection, atomicidad facturación/recepción, RBAC observability/metrics/webhook Stripe, frontend re-renders/virtualización, N+1, índices). Triage post-Codex aplicado: 4 falsos positivos retirados, 11 reseverizados. Fase 1A implementada (ver `00_coordination/CURRENT_STATE.md`). |
| [audits/2026-05-26-system-analytics-completed.md](audits/2026-05-26-system-analytics-completed.md) | Auditoría full-scope 2026-05-26 + cierre Codex 2026-06-01: C-004/H-002/H-003, Redis, dependencias y `341` cerrados/verificados; código en estado release-candidate, sujeto a SUNAT/OSE/secretos/smoke externo. |

## ⚙️ Configuración y operación

| Documento | Propósito |
|---|---|
| [configuration.md](configuration.md) | Variables de entorno del backend (`env.schema.ts`) |
| [ops/docker.md](ops/docker.md) | Stack Docker y observabilidad |
| [ops/health.md](ops/health.md) | Endpoints de health check |
| [ops/observability.md](ops/observability.md) | Logging, métricas y traces locales |
| [ops/supabase-connection.md](ops/supabase-connection.md) | Conexión directa a Supabase (pooler) |

## 🔐 Seguridad

| Documento | Propósito |
|---|---|
| [security/route-access-matrix.md](security/route-access-matrix.md) | **Fuente vigente** — matriz de autorización por endpoint |
| [security/session-auth.md](security/session-auth.md) | Contrato de cookies HttpOnly y sesión |
| [security/rate-limiting.md](security/rate-limiting.md) | Throttling global y por endpoint |
| [security/supabase-access-audit.md](security/supabase-access-audit.md) | Uso de service role y controles RLS |

## 🚀 Release

| Documento | Propósito |
|---|---|
| [release/GO_LIVE_RUNBOOK.md](release/GO_LIVE_RUNBOOK.md) | **Runbook ejecutable día Go-Live** — pre-requisitos, secuencia paso a paso, comandos exactos, rollback. Único camino aprobado para llevar a producción real |
| [release/production-checklist.md](release/production-checklist.md) | Checklist técnico previo a release |
| [release/branch-protection.md](release/branch-protection.md) | Reglas de protección de `main` |
| [migration/CLIENT_MIGRATION_RUNBOOK.md](migration/CLIENT_MIGRATION_RUNBOOK.md) | **Runbook de migración inicial desde un ERP externo** — orden de carga, endpoints CSV, validador de cuadre, rollback. Único camino para onboarding de clientes nuevos con saldos previos |

## 📦 Módulos funcionales

Documentación profunda de la lógica de negocio por dominio. Estos manuales son referencia activa para entender los flujos completos:

| Módulo | Cobertura |
|---|---|
| [manuals/modules/VENTAS_POS_FISCAL.md](manuals/modules/VENTAS_POS_FISCAL.md) | **Ventas** (cotizaciones, pedidos, crédito) · **POS** (sesiones de caja, offline, concurrencia) · **Fiscal CPE** (SUNAT/OSE, firma, XML) · **RMA** (devoluciones, notas de crédito) |
| [manuals/modules/COMPRAS_INVENTARIO.md](manuals/modules/COMPRAS_INVENTARIO.md) | **Compras** (aprobaciones, OC, proveedores) · **Inventario** (stock real vs reservado, RPC atómicos, almacenes) · **Logística** (picking, packing, despacho) |
| [manuals/modules/FINANZAS_CONTABILIDAD.md](manuals/modules/FINANZAS_CONTABILIDAD.md) | **Tesorería** (cajas, arqueos, conciliación) · **CxC** (retenciones/detracciones, pagos) · **Contabilidad** (AsientosGenerator, plan de cuentas, periodos) |

---

## Cómo navegar

- **¿Empiezo una nueva sesión?** → `START_HERE.md` + `00_coordination/CURRENT_STATE.md` + `00_coordination/FLOW_STATUS.md`
- **¿Soy nuevo y necesito setup?** → README raíz + `configuration.md` + `ops/docker.md`
- **¿Quiero entender la BD?** → `00_coordination/CURRENT_STATE.md` + `db_rebuild_status.md`
- **¿Voy a modificar un módulo?** → `00_coordination/FLOW_STATUS.md` + `manuals/modules/<MODULO>.md` + auditoría forense aplicable
- **¿Necesito agregar un endpoint?** → `security/route-access-matrix.md` para definir su access tier
- **¿Voy a deployar?** → `release/production-checklist.md` + `production-readiness/ERP_PRODUCTION_READINESS.md`
- **¿Tengo credenciales productivas y voy a ejecutar Go-Live?** → `release/GO_LIVE_RUNBOOK.md` (única ruta aprobada)
- **¿Voy a migrar la data de un ERP externo a este?** → `migration/CLIENT_MIGRATION_RUNBOOK.md` (orden estricto y CSV templates)
- **¿Un reporte histórico contradice el estado actual?** → prevalecen `START_HERE.md`, `00_coordination/CURRENT_STATE.md`, `00_coordination/FLOW_STATUS.md` y luego código/migraciones verificadas.
