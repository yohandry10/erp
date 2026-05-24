# ERP Documentation Hub

Documentación técnica del ERP, organizada por dominio. Solo se listan documentos **vigentes**.

> **Entrada obligatoria:** Para iniciar una sesion nueva o decidir "donde vamos", leer primero `00_coordination/CURRENT_STATE.md` y `00_coordination/FLOW_STATUS.md`. Este README es indice; no es la fuente de estado vivo.

> **Política:** Los manuales pre-reconstrucción DB (enero 2026) y las docs de implementación RLS previas al hardening (octubre 2025) fueron borrados en mayo 2026. Si necesitás consultar contenido histórico, recuperá los archivos vía `git log -- <ruta>`. Ver `DOCUMENTATION_QUARANTINE.md` para la trazabilidad de los borrados.

---

## 🎯 Estado del proyecto

| Documento | Propósito |
|---|---|
| [00_coordination/CURRENT_STATE.md](00_coordination/CURRENT_STATE.md) | **Fuente canonica actual** para recuperar contexto de sesion, migraciones vigentes y pendientes reales |
| [00_coordination/FLOW_STATUS.md](00_coordination/FLOW_STATUS.md) | Matriz vigente de estado por flujo funcional y fuente primaria por dominio |
| [00_coordination/AGENT_SYNC.md](00_coordination/AGENT_SYNC.md) | Contrato para coordinar Codex, Opus y cualquier `memory.md` |
| [../x_doc/PROJECT_STATUS.md](../x_doc/PROJECT_STATUS.md) | Estado operativo histórico de estabilización (build, type-check, riesgos, rondas) |
| [../x_doc/PROJECT_REVIEW_INDEX.md](../x_doc/PROJECT_REVIEW_INDEX.md) | Índice maestro histórico de revisión por vertical |
| [production-readiness/ERP_PRODUCTION_READINESS.md](production-readiness/ERP_PRODUCTION_READINESS.md) | Gate de readiness para producción real |
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
| [auditoria_forense_inventario_logistica_costeo_2026-05.md](auditoria_forense_inventario_logistica_costeo_2026-05.md) | Inventario/logística/kardex/costeo, remediación `333__inventory...` + ajuste `335__descontar_stock_authoritative.sql` |
| [auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md](auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md) | Tesorería/caja/bancos/CxC/CxP, remediación `334__treasury...` |

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
| [release/production-checklist.md](release/production-checklist.md) | Checklist técnico previo a release |
| [release/branch-protection.md](release/branch-protection.md) | Reglas de protección de `main` |

## 📦 Módulos funcionales

Documentación profunda de la lógica de negocio por dominio. Estos manuales son referencia activa para entender los flujos completos:

| Módulo | Cobertura |
|---|---|
| [manuals/modules/VENTAS_POS_FISCAL.md](manuals/modules/VENTAS_POS_FISCAL.md) | **Ventas** (cotizaciones, pedidos, crédito) · **POS** (sesiones de caja, offline, concurrencia) · **Fiscal CPE** (SUNAT/OSE, firma, XML) · **RMA** (devoluciones, notas de crédito) |
| [manuals/modules/COMPRAS_INVENTARIO.md](manuals/modules/COMPRAS_INVENTARIO.md) | **Compras** (aprobaciones, OC, proveedores) · **Inventario** (stock real vs reservado, RPC atómicos, almacenes) · **Logística** (picking, packing, despacho) |
| [manuals/modules/FINANZAS_CONTABILIDAD.md](manuals/modules/FINANZAS_CONTABILIDAD.md) | **Tesorería** (cajas, arqueos, conciliación) · **CxC** (retenciones/detracciones, pagos) · **Contabilidad** (AsientosGenerator, plan de cuentas, periodos) |

---

## Cómo navegar

- **¿Empiezo una nueva sesión?** → `00_coordination/CURRENT_STATE.md` + `00_coordination/FLOW_STATUS.md`
- **¿Soy nuevo y necesito setup?** → README raíz + `configuration.md` + `ops/docker.md`
- **¿Quiero entender la BD?** → `00_coordination/CURRENT_STATE.md` + `db_rebuild_status.md`
- **¿Voy a modificar un módulo?** → `00_coordination/FLOW_STATUS.md` + `manuals/modules/<MODULO>.md` + auditoría forense aplicable
- **¿Necesito agregar un endpoint?** → `security/route-access-matrix.md` para definir su access tier
- **¿Voy a deployar?** → `release/production-checklist.md` + `production-readiness/ERP_PRODUCTION_READINESS.md`
