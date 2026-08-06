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

> **Anti-duplicacion:** despues de estado vivo, leer `00_coordination/ANTI_DUPLICATION_PROTOCOL.md` y `00_coordination/DECISIONS.md` antes de auditar o codificar. Es la regla para no repetir analisis, no reimplementar codigo existente y no revivir falsos positivos.

> **Formato obligatorio:** toda propuesta de analisis debe iniciar con el bloque `RECIBO DE LECTURA` definido en `START_HERE.md` y `00_coordination/ANTI_DUPLICATION_PROTOCOL.md`. Sin ese bloque, la respuesta del agente es incompleta.

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
| [00_coordination/ANTI_DUPLICATION_PROTOCOL.md](00_coordination/ANTI_DUPLICATION_PROTOCOL.md) | Protocolo obligatorio para evitar auditorias repetidas, codigo duplicado y falsos positivos |
| [00_coordination/DECISIONS.md](00_coordination/DECISIONS.md) | Decisiones canonicas vigentes de arquitectura, auth, offline, CPE, BD y release |
| [architecture/FRONTEND_STYLING_ARCHITECTURE.md](architecture/FRONTEND_STYLING_ARCHITECTURE.md) | Contrato Tailwind 3.4 + shadcn/Radix, ownership de CSS, tema dark/light y gates visuales |
| [archive/session_history_legacy/PROJECT_STATUS.md](archive/session_history_legacy/PROJECT_STATUS.md) | Estado operativo histórico de estabilización (build, type-check, riesgos, rondas) |
| [archive/session_history_legacy/PROJECT_REVIEW_INDEX.md](archive/session_history_legacy/PROJECT_REVIEW_INDEX.md) | Índice maestro histórico de revisión por vertical |
| [production-readiness/ERP_PRODUCTION_READINESS.md](production-readiness/ERP_PRODUCTION_READINESS.md) | Gate de readiness para producción real |
| [production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md](production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md) | Auditoría forense pre-producción 2026-05-27: XSS, service-role/tenant isolation, migración externa, RLS/RPC, pruebas y riesgos residuales |
| [CODEX_HANDOFF_2026-05-24.md](CODEX_HANDOFF_2026-05-24.md) | Handoff más reciente: tesorería/caja/bancos/CxC/CxP y migración de cierre forense |
| [DOCUMENTATION_QUARANTINE.md](DOCUMENTATION_QUARANTINE.md) | Trazabilidad de docs consolidados/borrados |

## 🗄️ Base de datos

| Documento | Propósito |
|---|---|
| [architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md](architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md) | **Contrato canonico DEV/PROD**: project refs, politica de datos, guards y preflight obligatorio |
| [architecture/CPE_SERVICE_BOUNDARIES.md](architecture/CPE_SERVICE_BOUNDARIES.md) | Límites internos canónicos de la fachada CPE, UBL, certificados, entrega, reportes, Documentos y anulación |
| [architecture/CONTABILIDAD_CONTROLLER_BOUNDARIES.md](architecture/CONTABILIDAD_CONTROLLER_BOUNDARIES.md) | Límites canónicos de los siete controladores de Contabilidad y sus 63 rutas públicas |
| [db_rebuild_status.md](db_rebuild_status.md) | Fuente base histórica de reconstrucción `000..305`; complementarla con readiness/auditorías recientes antes de tocar BD |
| [db_reconstruction_plan.md](db_reconstruction_plan.md) | Plan de reconstrucción (baseline pre-reset, feb 2026) |
| [db_forensic_baseline.md](db_forensic_baseline.md) | Baseline forense pre-reset (feb 2026) |
| `db_*.csv`, `db_*.txt`, `code_*.csv`, `code_*.txt` | Artefactos del baseline forense — útiles para reproducir auditorías. No tocar. |

### Auditorías forenses recientes

| Documento | Propósito |
|---|---|
| [auditoria_forense_contable_2026-05.md](auditoria_forense_contable_2026-05.md) | Cierre contable/fiscal técnico, migraciones `331..332`, gates E2E y riesgos externos |
| [auditoria_impresion_cpe_facturas_2026-05.md](auditoria_impresion_cpe_facturas_2026-05.md) | Auditoría de impresión/representación CPE: PDF A4, ticket POS, rutas SUNAT/PSE y bloqueos antes de "solo credenciales" |
| [audits/2026-06-17-pos-sunat-print-readiness.md](audits/2026-06-17-pos-sunat-print-readiness.md) | Readiness POS para impresión SUNAT: separa ticket interno vs representación CPE, expone QR/valor resumen al POS, documenta que 80 mm es criterio operativo y no medida SUNAT obligatoria. |
| [auditoria_desktop_vs_web_2026-05.md](auditoria_desktop_vs_web_2026-05.md) | Auditoría de paridad desktop/Tauri vs web: build estático, proxy API, comandos nativos, plugins, offline y fiscal/PDF local |
| [auditoria_multiusuario_performance_2026-05.md](auditoria_multiusuario_performance_2026-05.md) | Auditoría multiusuario: retries no idempotentes, polling, locks distribuidos de workers, flags de apagado, prueba read-only real con p95/p99 y backlog outbox |
| [auditoria_forense_inventario_logistica_costeo_2026-05.md](auditoria_forense_inventario_logistica_costeo_2026-05.md) | Inventario/logística/kardex/costeo, remediación `333__inventory...` + ajuste `335__descontar_stock_authoritative.sql` |
| [auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md](auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md) | Tesorería/caja/bancos/CxC/CxP, remediación `334__treasury...` |
| [audits/2026-05-26-forensic-audit-pre-prod.md](audits/2026-05-26-forensic-audit-pre-prod.md) | Auditoría forense pre-producción 2026-05-26: 60+ hallazgos (multi-tenant leaks, PostgREST filter injection, atomicidad facturación/recepción, RBAC observability/metrics/webhook Stripe, frontend re-renders/virtualización, N+1, índices). Triage post-Codex aplicado: 4 falsos positivos retirados, 11 reseverizados. Fase 1A implementada (ver `00_coordination/CURRENT_STATE.md`). |
| [audits/2026-05-26-system-analytics-completed.md](audits/2026-05-26-system-analytics-completed.md) | Auditoría full-scope 2026-05-26 + cierre Codex 2026-06-01: C-004/H-002/H-003, Redis, dependencias y `341` cerrados/verificados; código en estado release-candidate, sujeto a SUNAT/OSE/secretos/smoke externo. |
| [audits/2026-06-04-deepsec-security-verification.md](audits/2026-06-04-deepsec-security-verification.md) | Verificación del reporte DeepSec local contra código actual: fixes en CPE/GRE worker, revocación de sesiones con cache, consumo atómico de reset token; lista falsos positivos/ya mitigados y deuda de refresh rotativo. |
| [audits/2026-06-16-sunat-beta-cpe-evidence.md](audits/2026-06-16-sunat-beta-cpe-evidence.md) | Evidencia SUNAT beta CPE: factura `01`, boleta `03`, nota de credito `07` y nota de debito `08` aceptadas con CDR `responseCode=0`; RA/RC y GRE se continuan en la evidencia del 2026-06-17. |
| [audits/2026-06-17-sunat-secondary-sol-evidence.md](audits/2026-06-17-sunat-secondary-sol-evidence.md) | Evidencia SUNAT SOL secundario, PFX y cierre beta fiscal: `ERPFE001` validado por `getStatusCdr` read-only, UsernameToken sin HTTP Basic para `*.sunat.gob.pe`, PFX real no-demo cargado con firma XML local OK, guard productivo que exige RUC esperado en certificado, RA/RC beta con CDR aceptado, GRE SOAP `2112` documentado y GRE REST fail-closed sin credenciales API. |
| [audits/2026-06-17-sunat-wizard-onboarding-readiness.md](audits/2026-06-17-sunat-wizard-onboarding-readiness.md) | Auditoria de readiness del wizard SUNAT: campos requeridos por SUNAT, brecha detectada, migracion `342`, secretos cifrados y runtime tenant-aware para CPE, RA/RC y GRE. |
| [audits/2026-06-17-sunat-cpe-gre-xml-alignment.md](audits/2026-06-17-sunat-cpe-gre-xml-alignment.md) | Alineacion SUNAT CPE/GRE XML y transporte: fechas CPE sin corrimiento UTC, GRE con `DespatchAddress`, conductor/placa/RUC transportista, payload GRE REST y UI/modal ajustados. |
| [audits/2026-06-17-web-runtime-devtools-audit.md](audits/2026-06-17-web-runtime-devtools-audit.md) | Auditoria runtime web con navegador integrado y matriz autenticada por roles: login/redireccion protegida, DevTools limpio, responsive movil, RBAC UI/API 11/11, pase visible ADMIN 56/56 rutas con CDP/consola limpios y ajustes de AUDITOR/FINANZAS/CAJERO sin mutaciones de negocio. |
| [audits/2026-06-18-supabase-advisor-security-hardening.md](audits/2026-06-18-supabase-advisor-security-hardening.md) | Hardening Supabase Advisor aplicado en DEV y PROD: RLS backend-only en `financial_forensic_repair_log`, vistas `security_invoker`, funciones propias con `search_path` y `SECURITY DEFINER` sin ejecucion por roles cliente. |
| [audits/2026-07-14-prod-demo-data-cleanup.md](audits/2026-07-14-prod-demo-data-cleanup.md) | Evidencia de separacion DEV/PROD, respaldo y purga autorizada de todos los datos QA/demo que estaban en PROD. |
| [audits/2026-07-14-local-secret-storage-hardening.md](audits/2026-07-14-local-secret-storage-hardening.md) | Cierre de JWT/credenciales en Web Storage y outbox, DPAPI para Tauri, limpieza de artefactos y ACL locales. |
| [audits/2026-07-15-ui-accounting-security-closure.md](audits/2026-07-15-ui-accounting-security-closure.md) | Cierre dark/light, Demo/Auth, trazabilidad CPE-contabilidad y E2E de Analytics, Compras, Contabilidad y POS en DEV. |
| [audits/2026-07-15-dependency-and-large-file-cleanup.md](audits/2026-07-15-dependency-and-large-file-cleanup.md) | Limpieza de dependencias/archivos huerfanos, ciclos arquitectonicos y catalogo completo de archivos mayores a 1.000 lineas. |
| [audits/2026-07-22-inventory-single-ledger-closure.md](audits/2026-07-22-inventory-single-ledger-closure.md) | Verificación y cierre DEV del doble-ledger de inventario, almacén de caja POS, idempotencia y concurrencia. |
| [audits/2026-07-24-production-closure-functional-qa.md](audits/2026-07-24-production-closure-functional-qa.md) | Cierre QA funcional DEV por verticales e interconexiones; anulación CPE POS, secuencia fiscal única, ADMIN normal/demo, stock inicial por almacén, gates técnicos y bloqueantes reales de producción. |
| [audits/2026-08-06-prod-demo-rrhh-procure-to-pay-hardening.md](audits/2026-08-06-prod-demo-rrhh-procure-to-pay-hardening.md) | Política de demo comercial en PROD y hardening DEV de RRHH, recepción/factura proveedor, CxP/pagos, contabilidad, PLE/SIRE y CPE. |

## ⚙️ Configuración y operación

| Documento | Propósito |
|---|---|
| [configuration.md](configuration.md) | Variables de entorno del backend (`env.schema.ts`) |
| [ops/docker.md](ops/docker.md) | Stack Docker y observabilidad |
| [ops/health.md](ops/health.md) | Endpoints de health check |
| [ops/observability.md](ops/observability.md) | Logging, métricas y traces locales |
| [ops/supabase-connection.md](ops/supabase-connection.md) | Conexión directa a Supabase (pooler) |
| [architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md](architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md) | Seleccion segura de base DEV/PROD y politica de datos por entorno |

## 🔐 Seguridad

| Documento | Propósito |
|---|---|
| [security/route-access-matrix.md](security/route-access-matrix.md) | **Fuente vigente** — matriz de autorización por endpoint |
| [security/session-auth.md](security/session-auth.md) | Contrato de cookies HttpOnly y sesión |
| [security/rate-limiting.md](security/rate-limiting.md) | Throttling global y por endpoint |
| [security/supabase-access-audit.md](security/supabase-access-audit.md) | Uso de service role y controles RLS |
| [audits/2026-06-04-deepsec-security-verification.md](audits/2026-06-04-deepsec-security-verification.md) | Evidencia reciente de verificación DeepSec contra código actual |
| [audits/2026-06-18-supabase-advisor-security-hardening.md](audits/2026-06-18-supabase-advisor-security-hardening.md) | Evidencia de cierre de deuda critica Supabase Advisor en DEV y PROD |

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

- **¿Empiezo una nueva sesión?** → `START_HERE.md` + `00_coordination/CURRENT_STATE.md` + `00_coordination/FLOW_STATUS.md` + `00_coordination/ANTI_DUPLICATION_PROTOCOL.md` + `00_coordination/DECISIONS.md`
- **¿Soy nuevo y necesito setup?** → README raíz + `configuration.md` + `ops/docker.md`
- **¿Quiero entender la BD?** → `00_coordination/CURRENT_STATE.md` + `db_rebuild_status.md`
- **¿Voy a modificar un módulo?** → `00_coordination/FLOW_STATUS.md` + `manuals/modules/<MODULO>.md` + auditoría forense aplicable
- **¿Necesito agregar un endpoint?** → `security/route-access-matrix.md` para definir su access tier
- **¿Voy a deployar?** → `release/production-checklist.md` + `production-readiness/ERP_PRODUCTION_READINESS.md`
- **¿Tengo credenciales productivas y voy a ejecutar Go-Live?** → `release/GO_LIVE_RUNBOOK.md` (única ruta aprobada)
- **¿Voy a migrar la data de un ERP externo a este?** → `migration/CLIENT_MIGRATION_RUNBOOK.md` (orden estricto y CSV templates)
- **¿Un reporte histórico contradice el estado actual?** → prevalecen `START_HERE.md`, `00_coordination/CURRENT_STATE.md`, `00_coordination/FLOW_STATUS.md` y luego código/migraciones verificadas.
- **¿Tengo miedo de repetir algo ya hecho?** → `00_coordination/ANTI_DUPLICATION_PROTOCOL.md` + `00_coordination/DECISIONS.md` + busqueda `rg` en docs antes de codigo.
