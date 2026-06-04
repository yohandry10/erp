# START HERE - Guia de sesion del ERP

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `guia_inicio`.
>
> Leer tambien: `docs/00_coordination/CURRENT_STATE.md`, `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de actualizacion: 2026-06-04

Este es el primer documento que debe leerse al abrir una sesion nueva. Su objetivo es ubicar el estado real del proyecto, indicar que documentos leer segun la tarea y evitar tomar reportes historicos como verdad vigente.

## Regla principal para cualquier agente

Antes de codificar, auditar, refactorizar o proponer un cambio, el agente debe encontrar si el tema ya esta documentado. No se empieza desde cero salvo que `START_HERE`, `CURRENT_STATE`, `FLOW_STATUS`, el manifiesto y la fuente del dominio no cubran la pregunta.

Checklist obligatorio antes de tocar codigo:

1. Identificar el dominio de la tarea: estado, BD, seguridad, desktop/offline, release, ventas/POS/fiscal, compras/inventario, finanzas/contabilidad, migracion, performance, frontend local o tests.
2. Buscar el dominio en `docs/DOC_NAVIGATION_MANIFEST.md`.
3. Leer el documento fuente del dominio y sus "Leer tambien".
4. Revisar `docs/00_coordination/FLOW_STATUS.md` para saber si el flujo esta cerrado, parcial, bloqueado por externo o historico.
5. Si aparece un reporte historico en `docs/archive/`, contrastarlo contra `CURRENT_STATE`, `FLOW_STATUS`, codigo actual y migraciones antes de asumir que sigue vigente.
6. Solo despues de esa lectura, buscar en codigo con `rg` y verificar archivo/linea.
7. Si el cambio altera estado, flujo, riesgo, migracion, fuente documental o evidencia, actualizar los documentos canonicos antes de cerrar.

## Estado ejecutivo en 2 minutos

- El ERP esta en estado **release-candidate a nivel de codigo core**. No declararlo produccion real absoluta hasta completar dependencias externas: certificado/credenciales SUNAT/OSE productivos, CDR/aceptacion real, secretos finales y smoke externo autorizado.
- Las migraciones recientes `337..341` estan documentadas como aplicadas/verificadas en DEV y PROD. La reconstruccion base sigue en `docs/db_rebuild_status.md`, pero el estado productivo vigente se toma de `docs/00_coordination/CURRENT_STATE.md`.
- Desktop/Tauri esta listo a nivel de codigo para operar offline-first en lo controlable por codigo: SQLite local por tenant, outbox durable, snapshots/cache binario por tenant, escrituras genericas local-first, fiscal local con correlativos por tenant, SIRE local por tenant, secretos locales protegidos/redactados y runtime sin shell capability.
- Lo que sigue fuera del codigo: primera autenticacion sin sesion previa, certificado y credenciales externas SUNAT/OSE, aceptacion/CDR oficial, smoke real desde el `.exe`, secretos productivos y pruebas productivas controladas.
- El worktree puede estar sucio por cambios del usuario o de sesiones anteriores. No revertir ni stagear por inercia.

## Lectura obligatoria por orden

1. `docs/START_HERE.md` - esta guia.
2. `docs/00_coordination/CURRENT_STATE.md` - fuente canonica viva: estado global, migraciones vigentes, pendientes reales, entornos y protocolo.
3. `docs/00_coordination/FLOW_STATUS.md` - matriz por flujo: que esta cerrado, que documento manda y que falta para produccion real.
4. `docs/00_coordination/AGENT_SYNC.md` - reglas de coordinacion entre Codex, Opus y cualquier `memory.md`.
5. `docs/DOC_NAVIGATION_MANIFEST.md` - mapa completo de documentos Markdown y artefactos CSV/TXT/JSON.
6. `docs/README.md` - indice navegable de documentos vigentes.
7. Documento fuente del dominio que vas a tocar, segun la tabla de abajo.

## Que documento leer segun la tarea

| Si vas a trabajar en... | Lee primero | Luego contrasta con |
|---|---|---|
| Estado general, handoff o "donde vamos" | `docs/00_coordination/CURRENT_STATE.md` | `docs/00_coordination/FLOW_STATUS.md` |
| Desktop/Tauri/offline/SQLite local | `apps/web/README-DESKTOP.md` | `docs/audits/2026-06-01-desktop-offline-closure.md`, `apps/web/src-tauri/src/lib.rs`, `apps/web/lib/offline-store.ts` |
| Go-live productivo | `docs/release/GO_LIVE_RUNBOOK.md` | `docs/production-readiness/ERP_PRODUCTION_READINESS.md`, `docs/00_coordination/CURRENT_STATE.md` |
| Base de datos o migraciones | `docs/00_coordination/CURRENT_STATE.md` | `docs/db_rebuild_status.md`, baseline DB de `AGENTS.md`, `supabase/migrations/` |
| Seguridad, auth, permisos o RLS | `docs/security/route-access-matrix.md` | `docs/security/session-auth.md`, `docs/security/supabase-access-audit.md`, `docs/00_coordination/CURRENT_STATE.md` |
| Ventas, POS, fiscal CPE/GRE/RMA | `docs/manuals/modules/VENTAS_POS_FISCAL.md` | `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/auditoria_forense_contable_2026-05.md` |
| Compras, inventario, recepciones, logistica | `docs/manuals/modules/COMPRAS_INVENTARIO.md` | `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md`, `docs/00_coordination/FLOW_STATUS.md` |
| Finanzas, caja, bancos, CxC/CxP, contabilidad | `docs/manuals/modules/FINANZAS_CONTABILIDAD.md` | `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md`, `docs/auditoria_forense_contable_2026-05.md` |
| Migracion desde ERP externo | `docs/migration/CLIENT_MIGRATION_RUNBOOK.md` | `docs/production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md`, `apps/erp-api/src/modules/migration/` |
| Multiusuario/performance/workers | `docs/auditoria_multiusuario_performance_2026-05.md` | `docs/ops/observability.md`, workers/backend relacionados |
| Operacion local, Docker, health, Supabase | `docs/ops/docker.md` | `docs/ops/health.md`, `docs/ops/supabase-connection.md`, `docs/configuration.md` |

## Mapa de familias documentales

| Familia | Donde vive | Para que sirve | Regla de uso |
|---|---|---|---|
| Estado vivo | `docs/00_coordination/` | Estado actual, flujos, coordinacion de agentes | Siempre leer antes de decidir "donde estamos" |
| Mapa completo | `docs/DOC_NAVIGATION_MANIFEST.md` | Lista toda la doc y artefactos, con rol y lecturas relacionadas | Usar para ubicar cualquier tema antes de codificar |
| Indice vigente | `docs/README.md` | Navegacion humana por dominios vigentes | Es indice, no fuente final de estado |
| Manuales de modulo | `docs/manuals/modules/` | Flujos funcionales activos por vertical | Contrastar con `FLOW_STATUS` y auditorias recientes |
| Auditorias recientes | `docs/auditoria_*.md`, `docs/audits/`, `docs/production-readiness/` | Evidencia de cierre, riesgos, fixes y bloqueantes | Usar para entender decisiones y validar si un riesgo sigue vigente |
| Release/operacion | `docs/release/`, `docs/ops/`, `docs/configuration.md` | Go-live, Docker, health, Supabase, env vars | No ejecutar produccion real fuera de runbook |
| Seguridad | `docs/security/` | Auth, permisos, rate-limit, Supabase/RLS | Cruzar siempre con matriz de rutas y codigo |
| BD/baseline | `docs/db_*`, `docs/rebuild_*`, `docs/code_*` | Reconstruccion, catalogos, relaciones y RPCs | Obligatorio antes de tocar BD o migraciones |
| Historicos | `docs/archive/audit_reports_legacy/`, `docs/archive/session_history_legacy/`, `docs/archive/legacy_root_docs/` | Contexto anterior, auditorias antiguas, falsos positivos posibles | Nunca usar como verdad final sin contrastar |
| Frontend/test local | `apps/**/README*.md`, `test/*.md`, `monitoring/README.md` | Guias locales de componentes, pruebas, monitoreo | Usar despues del mapa y del flujo canonico |

## Como buscar antes de codificar

Usar `rg` primero. Ejemplos:

```powershell
# Buscar un tema en la documentacion narrativa
rg -n "offline|SQLite|SIRE|tenant|SUNAT|OSE" docs apps test monitoring -g "*.md"

# Encontrar el documento fuente de un modulo o flujo
rg -n "compras|inventario|recepcion|caja|conciliacion|CPE|RLS|route-access" docs/DOC_NAVIGATION_MANIFEST.md docs/README.md docs/00_coordination/FLOW_STATUS.md

# Confirmar si algo es historico o vigente
rg -n "historico|fuente canonica|cerrado tecnico|pendiente|bloqueado" docs/START_HERE.md docs/00_coordination docs/DOCUMENTATION_QUARANTINE.md

# Despues de leer la doc, buscar implementacion en codigo
rg -n "nombreFuncion|endpoint|tabla|RPC|permiso|tenant_id" apps supabase
```

Regla de interpretacion: si la busqueda encuentra un documento historico y uno canonico, se lee primero el canonico. Si el historico tiene un hallazgo que no aparece cerrado, se verifica en codigo antes de afirmarlo.

## Jerarquia de verdad

Cuando dos documentos se contradigan, aplicar este orden:

1. Codigo actual y migraciones actuales, verificados localmente.
2. `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`, `docs/00_coordination/FLOW_STATUS.md`.
3. Auditorias de cierre recientes en `docs/audits/`, `docs/production-readiness/` y auditorias forenses de mayo 2026.
4. Manuales funcionales de `docs/manuals/modules/`.
5. `docs/README.md` como indice, no como estado vivo.
6. `docs/archive/` y documentos marcados por `docs/DOCUMENTATION_QUARANTINE.md`: contexto historico, no fuente final si contradicen lo anterior.

## Documentos que no debes usar como primera fuente

- `docs/archive/audit_reports_legacy/`: reportes historicos de preguntas/auditorias; pueden estar superados por fixes posteriores.
- `docs/archive/session_history_legacy/`: memoria historica de estabilizacion; util para contexto, no para estado vivo.
- `docs/archive/legacy_root_docs/CODEX-2026-04-historical.md`: plan historico de abril 2026; leer solo si investigas decisiones antiguas.
- Artefactos `db_*.csv`, `db_*.txt`, `code_*.csv`, `code_*.txt`: baseline forense de BD; usarlos cuando se toque BD o migraciones, no como resumen operativo.
- `memory.md`, si existe: memoria auxiliar de otro agente; debe contrastarse contra `docs/00_coordination/`.

## Protocolo de inicio para agentes

1. Ejecutar `git status --short`.
2. Leer `docs/START_HERE.md`.
3. Leer `docs/00_coordination/CURRENT_STATE.md`.
4. Leer `docs/00_coordination/FLOW_STATUS.md`.
5. Leer `docs/00_coordination/AGENT_SYNC.md`.
6. Leer `docs/DOC_NAVIGATION_MANIFEST.md` si la tarea requiere revisar documentacion o decidir que fuente usar.
7. Si vas a tocar BD, verificar prefijos duplicados en `supabase/migrations` y leer el baseline obligatorio listado en `AGENTS.md`.
8. Si el usuario pide auditoria, no reportar hallazgos sin archivo/linea y sin seguir el flujo completo.

## Protocolo de cierre de tarea

Antes de responder como terminado, revisar si cambiaste:

- estado global del ERP;
- estado de un flujo funcional;
- migraciones creadas, renumeradas, aplicadas o revertidas;
- pendientes reales de produccion;
- riesgos cerrados, reabiertos o reclasificados;
- rutas de documentacion o fuentes canonicas;
- evidencia nueva de validacion.

Si cambiaste algo de eso, actualizar en este orden:

1. Documento fuente detallado o auditoria del flujo.
2. `docs/00_coordination/FLOW_STATUS.md`, si cambia un flujo.
3. `docs/00_coordination/CURRENT_STATE.md`, si cambia estado global, migraciones o pendientes.
4. `docs/START_HERE.md`, si cambia el resumen ejecutivo, jerarquia o rutas de lectura.
5. `docs/README.md`, si cambia la navegacion documental.

## Comandos de verificacion rapida

```powershell
git status --short

Get-ChildItem -Path supabase\migrations -Filter *.sql |
  Group-Object { $_.Name.Substring(0,3) } |
  Where-Object { $_.Count -gt 1 } |
  Select-Object Name,Count,@{Name='Files';Expression={($_.Group.Name -join ', ')}}
```

Para desktop/offline, las verificaciones de cierre usadas el 2026-06-03 fueron:

```powershell
pnpm --filter @erp-suite/web run tauri:build
pnpm --filter @erp-suite/web run test:offline
pnpm --filter @erp-suite/web run type-check
pnpm --filter @erp-suite/erp-api run type-check
cargo check
git diff --check
```
