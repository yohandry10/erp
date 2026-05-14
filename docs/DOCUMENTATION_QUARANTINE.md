# Cuarentena de Documentacion

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
| Estado proyecto actual | `PROJECT_STATUS.md` |
| Indice revision | `PROJECT_REVIEW_INDEX.md` |

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
| `docs/manuals/PROJECT_STATUS.md` | Desactualizado probable | Fecha 2026-01-07, anterior a reconstruccion DB `000..301`; referencia publica desde `docs/README.md`. | `PROJECT_STATUS.md` y `docs/db_rebuild_status.md`. | Mantener como historico hasta retirar/reemplazar enlace del hub. |
| `docs/manuals/DATABASE_REFERENCE.md` | Desactualizado probable | Fecha 2026-01-07, anterior a reconstruccion DB 2026-02. | `docs/db_rebuild_status.md` y catalogos DB. | Regenerar o marcar obsoleto. |
| `docs/manuals/SYSTEM_ARCHITECTURE.md` | Vigente pero incompleto probable | Puede describir arquitectura general, pero previo a cambios recientes. | README + `PROJECT_REVIEW_INDEX.md`. | Actualizar, no borrar aun. |
| `docs/manuals/MODULES_REFERENCE.md` | Vigente pero incompleto probable | Manual general anterior a migraciones finales. | Matriz de verticales en `PROJECT_REVIEW_INDEX.md`. | Actualizar tras rondas verticales. |
| `docs/manuals/DEVELOPER_GUIDE.md` | Vigente pero incompleto probable | Puede conservar setup, pero necesita validar scripts actuales. | README + docs ops. | Actualizar tras gates. |
| `docs/analisis.md` | Historico | Auditoria inicial de codigo legado. | No aplica. | Mantener como historico salvo decision. |
| `route_matrix_block03.md` | Borrado seguro | Output raiz untracked, sin referencias fuera de cuarentena; contenia matriz vieja que contradice la vigente, por ejemplo `testConnection` como `PUBLIC`. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `route_matrix_block03.csv` | Borrado seguro | Output raiz untracked, sin referencias fuera de cuarentena; duplicaba salida intermedia de matriz. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `tmp_route_audit.tsv` | Borrado seguro | Output temporal raiz untracked, sin referencias fuera de cuarentena. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `tmp_route_audit_v2.tsv` | Borrado seguro | Output temporal raiz untracked, sin referencias fuera de cuarentena. | `docs/security/route-access-matrix.md`. | Borrado en ronda 6. |
| `scripts/tmp_generate_route_matrix.js` | Temporal o herramienta interna | Script `tmp`; puede ser generador de matriz. | Script permanente documentado o eliminacion. | Decidir si se formaliza en `scripts/` o se borra. |
| `temp_retenciones.spec.ts` | Borrado seguro | Spec temporal raiz trackeado; cobertura equivalente existe en `apps/erp-api/src/modules/finanzas/shared/retenciones-validation.service.spec.ts`, que corre en `pnpm test`. | `apps/erp-api/src/modules/finanzas/shared/retenciones-validation.service.spec.ts`. | Borrado en ronda 6. |
| `CODEX.md` | Requiere decision humana | Nuevo sin trackear, posiblemente instrucciones de agente. | `AGENTS.md`. | Comparar y decidir si se versiona o elimina. |
| `fix_permisos.sql` | Forense/no ejecutar | SQL suelto en raiz con tenant UUID hardcodeado `2635846d-237d-4323-a0e6-59daeb39ac3a`; busqueda en migraciones no encontro ese tenant ni evidencia de incorporacion directa. | Migraciones Supabase activas y `docs/db_rebuild_status.md`. | Mantener en cuarentena; no ejecutar ni borrar hasta decidir si se transforma en seed/migracion idempotente. |
| `fix_permisos_cotizaciones.sql` | Forense/no ejecutar | SQL suelto en raiz con tenant UUID hardcodeado y permiso puntual `ventas/delete/cotizaciones`; no hay evidencia de incorporacion directa en migraciones. | Migraciones Supabase activas y `docs/db_rebuild_status.md`. | Mantener en cuarentena; no ejecutar ni borrar hasta decidir si se transforma en seed/migracion idempotente. |
| `query_clientes.sql` | Temporal reproducible/no critico | Query de inspeccion a `information_schema.columns` para `clientes`; no modifica BD y es reproducible. | Scripts o docs DB vigentes. | Candidato a borrado posterior, pero mantener mientras se revisan SQL raiz en bloque separado. |
| `apps/worker/src/queue-manager.js`, `.d.ts`, `.js.map` | Borrado seguro | Artefactos compilados antiguos dentro de `src`; estaban trackeados, pero `tsconfig` compila desde `.ts` y el build emite a `dist`. | `apps/worker/src/queue-manager.ts` y `apps/worker/dist`. | Borrado en ronda 6 tras validar worker type-check/build. |
| `apps/web/test-results/*`, `apps/web/playwright-report/*` | Artefactos de test | Playwright los regenera; no deben mezclarse en fixes funcionales. | Ejecucion Playwright y reporte CI. | Mantener fuera del lote; limpiar solo con decision separada. |
| Vulnerabilidades de `pnpm audit` | Cerrado tecnico actual | `pnpm audit --audit-level=low` pasa sin vulnerabilidades conocidas tras remediacion de dependencias y migracion Nest 11. | `package.json`/`pnpm-lock.yaml` vigentes. | Mantener vigilancia; queda solo advertencia peer dev del CLI Nest (`@angular-devkit/core`/`ajv-formats`). |
| Warnings ESLint API | Deuda tecnica no bloqueante | `pnpm lint` pasa con 242 warnings API, principalmente no-unused-vars en codigo/specs existentes. | Lote de limpieza API separado. | No mezclar con fixes funcionales salvo archivos tocados. |

## Borrados realizados

- `docs/security/DASHBOARD_ARCHITECTURE.md`: 0 bytes, sin referencias entrantes fuera de cuarentena, reemplazo documental disponible.
- `route_matrix_block03.md`, `route_matrix_block03.csv`, `tmp_route_audit.tsv`, `tmp_route_audit_v2.tsv`: outputs temporales raiz, untracked, sin referencias fuera de cuarentena, reemplazados por `docs/security/route-access-matrix.md`.
- `apps/worker/src/queue-manager.js`, `apps/worker/src/queue-manager.d.ts`, `apps/worker/src/queue-manager.js.map`: compilados antiguos dentro de `src`, reemplazados por `queue-manager.ts` y salida `dist`.
- `temp_retenciones.spec.ts`: spec temporal raiz reemplazado por `apps/erp-api/src/modules/finanzas/shared/retenciones-validation.service.spec.ts`.

## Pendiente antes de borrar

- Buscar referencias entrantes a cada documento candidato.
- Comparar contra estado real de codigo/migraciones.
- Confirmar si los archivos temporales son reproducibles.
- Separar limpieza en commit/PR propio para no mezclar con fixes funcionales.
