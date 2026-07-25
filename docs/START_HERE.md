# START HERE - Guia de sesion del ERP

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `guia_inicio`.
>
> Leer tambien: `docs/00_coordination/CURRENT_STATE.md`, `docs/00_coordination/ANTI_DUPLICATION_PROTOCOL.md`, `docs/00_coordination/DECISIONS.md`, `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha de actualizacion: 2026-07-24

Este es el primer documento que debe leerse al abrir una sesion nueva. Su objetivo es ubicar el estado real del proyecto, indicar que documentos leer segun la tarea y evitar tomar reportes historicos como verdad vigente.

## Objetivo principal

La documentacion no esta organizada para que el agente lea todo. Esta organizada para que el agente encuentre la fuente correcta antes de analizar o codificar, y para impedir duplicar auditorias, reimplementar codigo existente o revivir falsos positivos.

## Obligatorio: recibo de lectura

En la primera respuesta operativa de una sesion, antes de proponer un analisis o tocar codigo, el agente debe declarar explicitamente que leyo la ruta base:

```text
Leido: START_HERE, CURRENT_STATE, FLOW_STATUS, AGENT_SYNC, ANTI_DUPLICATION_PROTOCOL, DECISIONS, DOC_NAVIGATION_MANIFEST.
Fuente de dominio: <documento o pendiente de identificar>.
```

Si no puede confirmar esa lectura, no debe presentar diagnosticos del sistema ni propuestas de implementacion. Debe leer primero los documentos faltantes.

## Formato obligatorio para proponer analisis

Toda respuesta que proponga un analisis del sistema, modulo, seguridad, BD, offline, release o fiscal debe empezar con este bloque exacto:

```text
RECIBO DE LECTURA
- Base leida: START_HERE, CURRENT_STATE, FLOW_STATUS, AGENT_SYNC, ANTI_DUPLICATION_PROTOCOL, DECISIONS, DOC_NAVIGATION_MANIFEST.
- Fuente de dominio leida: <archivo(s)>.
- Busqueda anti-duplicacion ejecutada: <rg usado o pendiente justificado>.
- Ya cerrado/no reanalizar: <puntos cerrados segun FLOW_STATUS/DECISIONS/CURRENT_STATE>.
- Analisis propuesto: <solo puntos no cerrados, externos, riesgos residuales o cambios solicitados>.
```

Si falta cualquiera de esas cinco lineas, la respuesta es incompleta y debe rehacerse antes de continuar. No se aceptan frases genericas como "lei la documentacion" o "hice una lectura completa" sin listar fuentes y busquedas.

Regla corta:

1. Primero estado vivo y protocolo anti-duplicacion.
2. Luego decisiones canonicas.
3. Luego mapa documental.
4. Luego documento fuente del dominio.
5. Solo despues codigo.

## Regla principal para cualquier agente

Antes de codificar, auditar, refactorizar o proponer un cambio, el agente debe encontrar si el tema ya esta documentado. No se empieza desde cero salvo que `START_HERE`, `CURRENT_STATE`, `FLOW_STATUS`, el manifiesto y la fuente del dominio no cubran la pregunta.

Checklist obligatorio antes de tocar codigo:

1. Identificar el dominio de la tarea: estado, BD, seguridad, desktop/offline, release, ventas/POS/fiscal, compras/inventario, finanzas/contabilidad, migracion, performance, frontend local o tests.
2. Revisar `docs/00_coordination/ANTI_DUPLICATION_PROTOCOL.md`.
3. Revisar `docs/00_coordination/DECISIONS.md`.
4. Buscar el dominio en `docs/DOC_NAVIGATION_MANIFEST.md`.
5. Leer el documento fuente del dominio y sus "Leer tambien".
6. Revisar `docs/00_coordination/FLOW_STATUS.md` para saber si el flujo esta cerrado, parcial, bloqueado por externo o historico.
7. Si aparece un reporte historico en `docs/archive/`, contrastarlo contra `CURRENT_STATE`, `FLOW_STATUS`, `DECISIONS`, codigo actual y migraciones antes de asumir que sigue vigente.
8. Solo despues de esa lectura, buscar en codigo con `rg` y verificar archivo/linea.
9. Si el cambio altera estado, flujo, riesgo, migracion, fuente documental, decision o evidencia, actualizar los documentos canonicos antes de cerrar.

## Estado ejecutivo en 2 minutos

- El cierre QA DEV del 2026-07-24 dejó backend Jest 120/120 suites y 1106/1106 tests, Web type-check/build 111/111, smoke UI desktop/narrow 148/148, tema 2/2 y calidad UI 4/4. Se corrigieron numeración fiscal compartida POS/Documentos (`354`), seed ADMIN no-demo (`355`), anulación POS por referencia fiscal canónica, auth con trailing slash, primer paint móvil y persistencia/contraste del tema. `stock_inicial.almacen_id` queda obligatorio. `347..355` siguen sólo en DEV; antes de PROD se deben auditar colisiones fiscales históricas y ejecutar el runbook. Fuente: `docs/audits/2026-07-24-production-closure-functional-qa.md`.
- Inventario quedó cerrado técnicamente en DEV como single-ledger el 2026-07-22: `producto_existencias` es la fuente física por almacén, POS deriva el almacén desde la caja y los agregados/proyecciones rechazan escrituras paralelas. Venta real, retry idempotente y concurrencia fueron verificados. Las migraciones `347..352` aún no se promovieron a PROD. Leer `docs/audits/2026-07-22-inventory-single-ledger-closure.md` antes de tocar stock, POS, reservas o importaciones.
- La arquitectura de datos tiene dos proyectos fisicos y un contrato inmutable: DEV `hbueraexcbowpfnjlppi` es para desarrollo/QA/demos; PROD `wypnbcptofqdmoynlonq` es exclusivamente para datos reales. El 2026-07-14 se purgaron de PROD 41 tenants QA/demo, 133 usuarios Auth y 49,613 filas tenant-scoped; quedo vacia y con validadores 5/5 entorno, 5/5 contabilidad, 6/6 inventario y 11/11 tesoreria. La migracion `346` y el preflight bloquean demos o project refs cruzados. Leer `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md` antes de tocar cualquier base.
- La sesion web usa cookie HttpOnly y no persiste JWT/passwords en Web Storage; Tauri persiste su Bearer solo cifrado con DPAPI. La outbox nunca guarda headers sensibles. Leer `docs/security/session-auth.md` y `docs/audits/2026-07-14-local-secret-storage-hardening.md` antes de cambiar auth, demo u offline.
- El cierre DEV del 2026-07-15 valida tema dark/light, Demo/Auth, Analytics y los verticales CPE, Compras, Contabilidad y POS. La arquitectura Tailwind/shadcn fue consolidada el 2026-07-16 sin hojas CSS de compatibilidad: clases legacy y neutrales puente quedaron en cero. Antes de cambiar tokens, `globals.css`, Dialog o layout, leer `docs/architecture/FRONTEND_STYLING_ARCHITECTURE.md` y reproducir `theme-contract.spec.ts`.
- La limpieza estructural del 2026-07-15 retiro dependencias y archivos huerfanos comprobados. Después de dividir CPE y las 63 rutas de Contabilidad, el catálogo vigente queda en 48 archivos mayores a 1.000 líneas, con 31 hotspots de runtime y dos ciclos arquitectónicos. Antes de repetir el análisis o refactorizar por tamaño, leer `docs/audits/2026-07-15-dependency-and-large-file-cleanup.md`, `docs/architecture/CPE_SERVICE_BOUNDARIES.md` y `docs/architecture/CONTABILIDAD_CONTROLLER_BOUNDARIES.md`.
- El ERP esta en estado **release-candidate a nivel de codigo core**. Factura `01`, boleta `03`, nota de credito `07` y nota de debito `08` ya tienen CDR aceptado en SUNAT beta. RA `RA-20260617-34513` y RC `RC-20260617-34514` tambien tienen CDR beta aceptado recuperado por `getStatus` read-only. El usuario SOL secundario `ERPFE001` fue validado el 2026-06-17 con `getStatusCdr` read-only y el PFX real no-demo `CT2604146559.pfx` ya carga/firma localmente, pero su subject visible no contiene el RUC 20. El backend ya bloquea produccion SUNAT si el certificado no contiene el RUC esperado salvo confirmacion explicita documentada; ademas el preflight local `sunat:readiness-preflight` confirma `canAttemptProductionSend=false` para este entorno, incluso forzando `SUNAT_ENVIRONMENT=produccion` (`certificate.ruc_match=FAIL`, `productionUsed=false`). GRE SOAP beta sigue rechazado por fault `2112` aun con `CustomizationID=2.0` correcto. El backend ya soporta GRE por Plataforma Nueva REST cuando existan `SUNAT_GRE_CLIENT_ID`/`SUNAT_GRE_CLIENT_SECRET`; el preflight GRE REST sin esas credenciales falla cerrado con `gre.rest_credentials=FAIL` y `productionUsed=false`. No se debe declarar produccion real absoluta hasta completar dependencias externas: confirmar autorizacion del PFX para el RUC `20616053575` o reemplazarlo, GRE REST si aplica, secretos finales y smoke productivo autorizado.
- Las migraciones recientes `337..345` estan documentadas como aplicadas/verificadas en DEV y PROD. El 2026-06-18 se restauró la verificación por `psql` de PROD (`wypnbcptofqdmoynlonq`, Postgres 17.6) y se aplicaron/verificaron `342`, `343`, `344` y `345` en DEV **y PROD**. `342__sunat_tenant_onboarding_credentials.sql` deja el contrato SUNAT tenant-level simétrico entre entornos; `345__supabase_advisor_security_hardening.sql` cierra la deuda crítica visible de Supabase Advisor: 0 vistas `SECURITY DEFINER`, 0 tablas públicas sin RLS, 0 funciones propias sin `search_path`, 0 funciones `SECURITY DEFINER` propias ejecutables por `anon/authenticated`, y `financial_forensic_repair_log` queda backend-only. La reconstruccion base sigue en `docs/db_rebuild_status.md`, pero el estado productivo vigente se toma de `docs/00_coordination/CURRENT_STATE.md`.
- Desktop/Tauri esta listo a nivel de codigo para operar offline-first en lo controlable por codigo: SQLite local por tenant, outbox durable, snapshots/cache binario por tenant, escrituras genericas local-first, fiscal local con correlativos por tenant, SIRE local por tenant, secretos locales protegidos/redactados y runtime sin shell capability.
- El alcance operativo inicial es Peru/SUNAT: `PE/pais_id=1/PEN` es el unico pais activo en login, wizard, tenants, catalogo de paises y validaciones de proveedores. CO/CL/MX/EC quedan en roadmap hasta validacion fiscal/legal/E2E propia.
- Lo que sigue fuera del codigo: primera autenticacion sin sesion previa, confirmacion/autorizacion del PFX cargado para el contribuyente, credenciales API SUNAT para GRE REST si el contribuyente emitira guias, smoke real desde el `.exe`, secretos productivos y pruebas productivas controladas. La credencial SOL secundaria, la carga local del PFX real y el smoke beta CPE/RA/RC/GRE ya no son pendientes genericos; estan documentados en `docs/audits/2026-06-17-sunat-secondary-sol-evidence.md`.
- El worktree puede estar sucio por cambios del usuario o de sesiones anteriores. No revertir ni stagear por inercia.

## Lectura obligatoria por orden

1. `docs/START_HERE.md` - esta guia.
2. `docs/00_coordination/CURRENT_STATE.md` - fuente canonica viva: estado global, migraciones vigentes, pendientes reales, entornos y protocolo.
3. `docs/00_coordination/FLOW_STATUS.md` - matriz por flujo: que esta cerrado, que documento manda y que falta para produccion real.
4. `docs/00_coordination/AGENT_SYNC.md` - reglas de coordinacion entre Codex, Opus y cualquier `memory.md`.
5. `docs/00_coordination/ANTI_DUPLICATION_PROTOCOL.md` - protocolo obligatorio para no repetir analisis ni reimplementar codigo existente.
6. `docs/00_coordination/DECISIONS.md` - decisiones canonicas que no se deben redescubrir ni revertir sin evidencia.
7. `docs/DOC_NAVIGATION_MANIFEST.md` - mapa completo de documentos Markdown y artefactos CSV/TXT/JSON.
8. `docs/README.md` - indice navegable de documentos vigentes.
9. Documento fuente del dominio que vas a tocar, segun la tabla de abajo.

## Que documento leer segun la tarea

| Si vas a trabajar en... | Lee primero | Luego contrasta con |
|---|---|---|
| Estado general, handoff o "donde vamos" | `docs/00_coordination/CURRENT_STATE.md` | `docs/00_coordination/FLOW_STATUS.md` |
| Desktop/Tauri/offline/SQLite local | `apps/web/README-DESKTOP.md` | `docs/audits/2026-06-01-desktop-offline-closure.md`, `apps/web/src-tauri/src/lib.rs`, `apps/web/lib/offline-store.ts` |
| Go-live productivo | `docs/release/GO_LIVE_RUNBOOK.md` | `docs/production-readiness/ERP_PRODUCTION_READINESS.md`, `docs/00_coordination/CURRENT_STATE.md` |
| Base de datos o migraciones | `docs/00_coordination/CURRENT_STATE.md` | `docs/db_rebuild_status.md`, baseline DB de `AGENTS.md`, `supabase/migrations/` |
| Elegir entre DEV y PROD, demos o limpieza de datos | `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md` | `docs/ops/supabase-connection.md`, `docs/00_coordination/DECISIONS.md` |
| Seguridad, auth, permisos o RLS | `docs/security/route-access-matrix.md` | `docs/security/session-auth.md`, `docs/security/supabase-access-audit.md`, `docs/audits/2026-06-04-deepsec-security-verification.md`, `docs/00_coordination/CURRENT_STATE.md` |
| Ventas, POS, fiscal CPE/GRE/RMA | `docs/manuals/modules/VENTAS_POS_FISCAL.md` | `docs/architecture/CPE_SERVICE_BOUNDARIES.md`, `docs/auditoria_impresion_cpe_facturas_2026-05.md`, `docs/auditoria_forense_contable_2026-05.md` |
| Compras, inventario, recepciones, logistica | `docs/manuals/modules/COMPRAS_INVENTARIO.md` | `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md`, `docs/00_coordination/FLOW_STATUS.md` |
| Finanzas, caja, bancos, CxC/CxP, contabilidad | `docs/manuals/modules/FINANZAS_CONTABILIDAD.md` | `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md`, `docs/auditoria_forense_contable_2026-05.md` |
| Migracion desde ERP externo | `docs/migration/CLIENT_MIGRATION_RUNBOOK.md` | `docs/production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md`, `apps/erp-api/src/modules/migration/` |
| Multiusuario/performance/workers | `docs/auditoria_multiusuario_performance_2026-05.md` | `docs/ops/observability.md`, workers/backend relacionados |
| Operacion local, Docker, health, Supabase | `docs/ops/docker.md` | `docs/ops/health.md`, `docs/ops/supabase-connection.md`, `docs/configuration.md` |

## Mapa de familias documentales

| Familia | Donde vive | Para que sirve | Regla de uso |
|---|---|---|---|
| Estado vivo | `docs/00_coordination/` | Estado actual, flujos, coordinacion de agentes | Siempre leer antes de decidir "donde estamos" |
| Protocolo anti-duplicacion | `docs/00_coordination/ANTI_DUPLICATION_PROTOCOL.md` | Pasos obligatorios para no repetir analisis ni codigo | Siempre leer antes de auditar o codificar |
| Decisiones canonicas | `docs/00_coordination/DECISIONS.md` | Decisiones vigentes de arquitectura, auth, offline, CPE, BD | Consultar antes de proponer cambios de arquitectura |
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
6. Leer `docs/00_coordination/ANTI_DUPLICATION_PROTOCOL.md`.
7. Leer `docs/00_coordination/DECISIONS.md`.
8. Leer `docs/DOC_NAVIGATION_MANIFEST.md` si la tarea requiere revisar documentacion o decidir que fuente usar.
9. Si vas a tocar BD, verificar prefijos duplicados en `supabase/migrations` y leer el baseline obligatorio listado en `AGENTS.md`.
10. Si el usuario pide auditoria, no reportar hallazgos sin archivo/linea y sin seguir el flujo completo.

## Protocolo de cierre de tarea

Antes de responder como terminado, revisar si cambiaste:

- estado global del ERP;
- estado de un flujo funcional;
- migraciones creadas, renumeradas, aplicadas o revertidas;
- pendientes reales de produccion;
- riesgos cerrados, reabiertos o reclasificados;
- rutas de documentacion o fuentes canonicas;
- decisiones canonicas;
- evidencia nueva de validacion.

Si cambiaste algo de eso, actualizar en este orden:

1. Documento fuente detallado o auditoria del flujo.
2. `docs/00_coordination/FLOW_STATUS.md`, si cambia un flujo.
3. `docs/00_coordination/CURRENT_STATE.md`, si cambia estado global, migraciones o pendientes.
4. `docs/START_HERE.md`, si cambia el resumen ejecutivo, jerarquia o rutas de lectura.
5. `docs/00_coordination/DECISIONS.md`, si cambia una decision vigente.
6. `docs/README.md`, si cambia la navegacion documental.

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
