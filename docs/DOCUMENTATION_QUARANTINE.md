# Cuarentena de Documentacion

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `control_documental`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de corte: 2026-05-07

Objetivo: registrar documentos candidatos a consolidacion, reemplazo o borrado sin eliminar nada hasta validar referencias y fuente vigente.

## Politica

- No borrar documentos solo por antiguedad.
- Antes de borrar, confirmar: reemplazo vigente, referencias entrantes, valor historico y riesgo operativo.
- Si un documento contiene informacion historica util, mover su contenido vigente al hub actual y marcarlo como archivado antes de eliminar.

## Fuentes vigentes iniciales

| Tema | Fuente vigente preferida |
| --- | --- |
| Estado BD reconstruccion | `docs/db_rebuild_status.md` |
| Baseline pre-reconstruccion | Artefactos `docs/db_*` obligatorios listados en `AGENTS.md` |
| Seguridad reciente | `docs/security/rate-limiting.md`, `session-auth.md`, `route-access-matrix.md`, `supabase-access-audit.md` |
| Operacion reciente | `docs/ops/docker.md`, `docs/ops/health.md` |
| Release reciente | `docs/release/production-checklist.md`, `branch-protection.md` |
| Estado proyecto actual | `docs/archive/session_history_legacy/PROJECT_STATUS.md` como contexto historico + `docs/00_coordination/CURRENT_STATE.md` como estado vivo |
| Indice revision | `docs/archive/session_history_legacy/PROJECT_REVIEW_INDEX.md` como contexto historico + `docs/DOC_NAVIGATION_MANIFEST.md` como indice vivo |

## Candidatos iniciales

| Documento/artefacto | Clasificacion inicial | Evidencia | Reemplazo candidato | Accion |
| --- | --- | --- | --- | --- |
| `docs/security/DASHBOARD_ARCHITECTURE.md` | Borrado seguro | Archivo de 0 bytes, sin referencias entrantes fuera de esta cuarentena. | `docs/security/security-dashboard.md` o docs recientes security. | Borrado en ronda 6 inicial. |
| `docs/security/SECURITY_DASHBOARD_IMPLEMENTATION.md` | Posible desactualizado | Implementacion puntual 2025-10-24 previa a hardening DB `060..067` y docs security 2026-04. | `docs/security/supabase-access-audit.md`, `route-access-matrix.md`, `db_rebuild_status.md`. | Comparar contenido y consolidar. |
| `docs/security/ALERT_SYSTEM_IMPLEMENTATION.md` | Posible desactualizado | Documento 2025-10-24; puede duplicar observabilidad/security actual. | `docs/security/supabase-access-audit.md`, `docs/ops/health.md`. | Validar si sigue vigente. |
| `docs/security/rls-audit-system.md` | Vigente historico o desactualizado parcial | Anterior a reconstruccion DB completa `000..301`. | `docs/db_rebuild_status.md` y artefactos DB. | Extraer conceptos vigentes; marcar obsoleto si contradice migraciones. |
| `docs/security/IMPLEMENTACION-AUDITORIA-RLS.md` | Vigente historico o duplicado | Mismo dominio que `rls-audit-system.md`. | Docs DB/security recientes. | Consolidar con RLS actual. |
| `docs/security/rls-alerts-guide.md` | Requiere decision humana | Puede ser guia operativa aun util. | Docs ops/security recientes. | Verificar implementacion real en codigo. |
| `docs/security/rls-alerts-quick-reference.md` | Requiere decision humana | Quick reference puede depender de guia anterior. | Guia consolidada de seguridad. | Mantener hasta consolidar. |
| `docs/manuals/PROJECT_STATUS.md` | Desactualizado probable | Fecha 2026-01-07, anterior a reconstruccion DB `000..301`; referencia publica antigua desde `docs/README.md`. | `docs/archive/session_history_legacy/PROJECT_STATUS.md` y `docs/db_rebuild_status.md`. | Borrado en ronda 7 tras reemplazo validado. |
| `docs/manuals/DATABASE_REFERENCE.md` | Desactualizado probable | Fecha 2026-01-07, anterior a reconstruccion DB 2026-02. | `docs/db_rebuild_status.md` y catalogos DB. | Regenerar o marcar obsoleto. |
| `docs/manuals/SYSTEM_ARCHITECTURE.md` | Desactualizado probable | Puede describir arquitectura general, pero previo a cambios recientes. | README + `docs/archive/session_history_legacy/PROJECT_REVIEW_INDEX.md`. | Borrado en ronda 7 tras reemplazo validado. |
| `docs/manuals/MODULES_REFERENCE.md` | Desactualizado probable | Manual general anterior a migraciones finales. | Matriz de verticales en `docs/archive/session_history_legacy/PROJECT_REVIEW_INDEX.md`. | Borrado en ronda 7 tras reemplazo validado. |
| `docs/manuals/DEVELOPER_GUIDE.md` | Desactualizado probable | Guia anterior a la consolidacion de README/docs ops. | README + docs ops. | Borrado en ronda 7 tras reemplazo validado. |
| `docs/analisis.md` | Historico | Auditoria inicial de codigo legado. | No aplica. | Mantener como historico salvo decision. |
| `route_matrix_block03.md` | Borrado seguro | Output raiz untracked, sin referencias fuera de cuarentena; contenia matriz vieja que contradice la vigente, por ejemplo `testConnection` como `PUBLIC`. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `route_matrix_block03.csv` | Borrado seguro | Output raiz untracked, sin referencias fuera de cuarentena; duplicaba salida intermedia de matriz. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `tmp_route_audit.tsv` | Borrado seguro | Output temporal raiz untracked, sin referencias fuera de cuarentena. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `tmp_route_audit_v2.tsv` | Borrado seguro | Output temporal raiz untracked, sin referencias fuera de cuarentena. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `scripts/tmp_generate_route_matrix.js` | Temporal o herramienta interna | Script `tmp`; puede ser generador de matriz. | Script permanente documentado o eliminacion. | Decidir si se formaliza en `scripts/` o se borra. |
| `temp_retenciones.spec.ts` | Borrado seguro | Spec temporal raiz trackeado; cobertura equivalente existe en `apps/erp-api/src/modules/finanzas/shared/retenciones-validation.service.spec.ts`, que corre en `pnpm test`. | `apps/erp-api/src/modules/finanzas/shared/retenciones-validation.service.spec.ts`. | Borrado en ronda 6. |
| `docs/archive/legacy_root_docs/CODEX-2026-04-historical.md` | Historico archivado | Plan tecnico de abril 2026; contiene contexto util, pero ya no es fuente primaria de estado. | `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`, `docs/00_coordination/FLOW_STATUS.md`. | Movido desde raiz en ronda 8; no usar si contradice fuentes canonicas. |
| `fix_permisos.sql` | Forense/no ejecutar | SQL suelto en raiz con tenant UUID hardcodeado `2635846d-237d-4323-a0e6-59daeb39ac3a`; busqueda en migraciones no encontro ese tenant ni evidencia de incorporacion directa. | Migraciones Supabase activas y `docs/db_rebuild_status.md`. | Mantener en cuarentena; no ejecutar ni borrar hasta decidir si se transforma en seed/migracion idempotente. |
| `fix_permisos_cotizaciones.sql` | Forense/no ejecutar | SQL suelto en raiz con tenant UUID hardcodeado y permiso puntual `ventas/delete/cotizaciones`; no hay evidencia de incorporacion directa en migraciones. | Migraciones Supabase activas y `docs/db_rebuild_status.md`. | Mantener en cuarentena; no ejecutar ni borrar hasta decidir si se transforma en seed/migracion idempotente. |
| `query_clientes.sql` | Temporal reproducible/no critico | Query de inspeccion a `information_schema.columns` para `clientes`; no modifica BD y es reproducible. | Scripts o docs DB vigentes. | Candidato a borrado posterior, pero mantener mientras se revisan SQL raiz en bloque separado. |
| `apps/worker/src/queue-manager.js`, `.d.ts`, `.js.map` | Borrado seguro | Artefactos compilados antiguos dentro de `src`; estaban trackeados, pero `tsconfig` compila desde `.ts` y el build emite a `dist`. | `apps/worker/src/queue-manager.ts` y `apps/worker/dist`. | Borrado en ronda 6 tras validar worker type-check/build. |
| `apps/web/test-results/*`, `apps/web/playwright-report/*` | Artefactos de test | Playwright los regenera; no deben mezclarse en fixes funcionales. | Ejecucion Playwright y reporte CI. | Mantener fuera del lote; limpiar solo con decision separada. |
| Vulnerabilidades de `pnpm audit` | Cerrado tecnico actual | `pnpm audit --audit-level=low` pasa sin vulnerabilidades conocidas tras remediacion de dependencias y migracion Nest 11. | `package.json`/`pnpm-lock.yaml` vigentes. | Mantener vigilancia; queda solo advertencia peer dev del CLI Nest (`@angular-devkit/core`/`ajv-formats`). |
| Warnings ESLint API | Deuda tecnica no bloqueante | `pnpm lint` pasa con 242 warnings API, principalmente no-unused-vars en codigo/specs existentes. | Lote de limpieza API separado. | No mezclar con fixes funcionales salvo archivos tocados. |

## Borrados realizados

### Ronda 6 (mayo 2026 inicial)

- `docs/security/DASHBOARD_ARCHITECTURE.md`: 0 bytes, sin referencias entrantes fuera de cuarentena.
- `route_matrix_block03.md`, `route_matrix_block03.csv`, `tmp_route_audit.tsv`, `tmp_route_audit_v2.tsv`: outputs temporales raíz untracked, reemplazados por `docs/security/route-access-matrix.md`.
- `apps/worker/src/queue-manager.js`, `apps/worker/src/queue-manager.d.ts`, `apps/worker/src/queue-manager.js.map`: compilados antiguos dentro de `src`.
- `temp_retenciones.spec.ts`: spec temporal raíz reemplazado por `apps/erp-api/src/modules/finanzas/shared/retenciones-validation.service.spec.ts`.

### Ronda 7 (mayo 2026 — consolidación documental)

**Cluster security obsoleto (octubre 2025, pre-hardening DB):**

| Archivo borrado | Razón | Recuperación si se necesita |
|---|---|---|
| `docs/security/SECURITY_DASHBOARD_IMPLEMENTATION.md` | Implementación oct 2025 pre-hardening; 0 refs entrantes externas. | `git log -- docs/security/SECURITY_DASHBOARD_IMPLEMENTATION.md` |
| `docs/security/ALERT_SYSTEM_IMPLEMENTATION.md` | Implementación RLS alerts oct 2025; 0 refs entrantes externas. | `git log` |
| `docs/security/IMPLEMENTACION-AUDITORIA-RLS.md` | Sistema auditoría RLS oct 2025; 0 refs externas. | `git log` |
| `docs/security/rls-audit-system.md` | Solo referenciado por `IMPLEMENTACION-AUDITORIA-RLS.md` (también borrado). | `git log` |
| `docs/security/rls-alerts-guide.md` | Solo referenciado por `ALERT_SYSTEM_IMPLEMENTATION.md` (borrado). | `git log` |
| `docs/security/rls-alerts-quick-reference.md` | Solo referenciado por `ALERT_SYSTEM_IMPLEMENTATION.md`. | `git log` |
| `docs/security/security-dashboard.md` | Contenido oct 2025 pre-hardening; refs solo desde README hubs (actualizados). | `git log` |

**Manuals históricos (enero 2026, pre-reconstrucción DB feb 2026):**

| Archivo borrado | Reemplazo vigente |
|---|---|
| `docs/manuals/DATABASE_REFERENCE.md` | `docs/db_rebuild_status.md` |
| `docs/manuals/DEVELOPER_GUIDE.md` | `README.md` raíz + `docs/configuration.md` + `docs/ops/*` |
| `docs/manuals/MODULES_REFERENCE.md` | `docs/manuals/modules/*` (modules) + `docs/archive/session_history_legacy/PROJECT_REVIEW_INDEX.md` (matriz historica) |
| `docs/manuals/PROJECT_STATUS.md` | `docs/archive/session_history_legacy/PROJECT_STATUS.md` como historico + `docs/00_coordination/CURRENT_STATE.md` como vivo |
| `docs/manuals/SYSTEM_ARCHITECTURE.md` | `docs/archive/session_history_legacy/PROJECT_REVIEW_INDEX.md` (arquitectura historica por vertical) |

## Ronda 8 (2026-06-04)

Objetivo: sacar documentacion historica del nivel activo para evitar que agentes la lean como verdad vigente.

| Accion | Resultado | Motivo |
| --- | --- | --- |
| Mover `audit_reports/*` | `docs/archive/audit_reports_legacy/*` | Reportes forenses y QA utiles como evidencia, pero potencialmente superados por correcciones posteriores. |
| Mover `x_doc/*` | `docs/archive/session_history_legacy/*` | Memoria de sesiones y estabilizacion; sirve para contexto, no para estado vivo. |
| Mover `CODEX.md` | `docs/archive/legacy_root_docs/CODEX-2026-04-historical.md` | Plan historico de abril 2026; ya no debe competir con `AGENTS.md` ni `docs/START_HERE.md`. |
| Mover `SISTEM-ANALITICS-COMPLETED.md` | `docs/audits/2026-05-26-system-analytics-completed.md` | Auditoria full-scope sigue siendo util, pero debe vivir en `docs/audits/` con nombre fechable. |
| Borrar directorios raiz vacios | `audit_reports/` y `x_doc/` removidos si quedaron vacios | El root queda limpio; los historicos permanecen trazables dentro de `docs/archive/`. |

**Mantenidos:** `docs/manuals/modules/{VENTAS_POS_FISCAL,COMPRAS_INVENTARIO,FINANZAS_CONTABILIDAD}.md` (manuales funcionales vigentes referenciados desde README raíz).

**READMEs actualizados:** `docs/README.md` y `README.md` raíz; se removieron las referencias a los archivos borrados y se reorganizó el hub documental por dominio.

## Pendiente antes de borrar

- Buscar referencias entrantes a cada documento candidato.
- Comparar contra estado real de codigo/migraciones.
- Confirmar si los archivos temporales son reproducibles.
- Separar limpieza en commit/PR propio para no mezclar con fixes funcionales.
