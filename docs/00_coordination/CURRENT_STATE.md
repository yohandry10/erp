# Estado Actual del ERP

Fecha de actualizacion: 2026-05-26 (entornos dev/prod separados)

Este documento es la entrada canonica para recuperar contexto al iniciar una sesion nueva. No reemplaza las auditorias, manuales ni reportes; solo indica que leer primero y cual es la linea vigente.

## Lectura obligatoria al iniciar

1. `docs/00_coordination/CURRENT_STATE.md`
2. `docs/00_coordination/FLOW_STATUS.md`
3. `docs/db_rebuild_status.md`
4. `docs/production-readiness/ERP_PRODUCTION_READINESS.md`
5. `docs/CODEX_HANDOFF_2026-05-24.md`

Si la sesion toca base de datos, tambien consultar los artefactos baseline listados en `AGENTS.md` antes de borrar, reconstruir o aplicar migraciones.

## Estado ejecutivo

- ERP validado tecnicamente en entorno local/sandbox; no declarar produccion real absoluta sin certificado SUNAT/OSE productivo, secretos productivos, email real si aplica y smoke externo autorizado.
- Readiness base: Gate 21/22 documentado al 2026-05-16 en `docs/production-readiness/ERP_PRODUCTION_READINESS.md`.
- Despues del corte de readiness existen auditorias forenses y migraciones posteriores. El head documental actual debe considerar `327..335`.
- Auditoria multiusuario/performance aplicada el 2026-05-26: retries frontend no idempotentes desactivados para escrituras, polling visible/sin solapes, banners de configuracion cacheados y workers cron protegidos con locks distribuidos existentes.
- El worktree contiene muchos cambios previos del usuario/de sesiones anteriores. No revertir ni stagear archivos por inercia.

## Migraciones vigentes

- Reconstruccion base documentada: `000..305`.
- Gates remotos/manuales aplicados el 2026-05-16: `312..326`.
- Auditorias y cierres posteriores en repo local: `327..335`.
- La colision local de prefijo `333__` fue resuelta:
  - `333__inventory_stock_reconciliation_hardening.sql`: inventario/logistica/costeo.
  - `334__treasury_cash_bank_forensic_closure.sql`: tesoreria/caja/bancos/CxC/CxP.
  - `335__descontar_stock_authoritative.sql`: ajuste autoritativo posterior de salida de stock.
- Antes de aplicar o reconstruir BD, verificar siempre que no existan prefijos duplicados en `supabase/migrations`.

Comando de verificacion de prefijos en PowerShell:

```powershell
Get-ChildItem -Path supabase\migrations -Filter *.sql |
  Group-Object { $_.Name.Substring(0,3) } |
  Where-Object { $_.Count -gt 1 } |
  Select-Object Name,Count,@{Name='Files';Expression={($_.Group.Name -join ', ')}}
```

## Entornos Supabase

| Entorno | Proyecto | Ref | Cuenta | Host pooler | Archivo env |
|---|---|---|---|---|---|
| **PROD** | `erp` | `wypnbcptofqdmoynlonq` | yohandry10 | `aws-0-us-west-2.pooler.supabase.com` | `.env.production` |
| **DEV** | `erp-dev` | `hbueraexcbowpfnjlppi` | yohandrydev.1995 | `aws-1-us-west-2.pooler.supabase.com` | `.env.dev` |

- `erp-dev` creado 2026-05-25; 332/332 migraciones aplicadas; 22/22 validators OK (inventory 6/6, accounting 5/5, tesoreria 11/11).
- Para cambiar entorno: `Copy-Item .env.dev .env.local` (dev) o `Copy-Item .env.production .env.local` (prod).
- Supabase CLI instalado en `$env:USERPROFILE\supabase-cli\supabase.exe`. Token prod en cuenta yohandry10; token dev en cuenta yohandrydev.1995.
- NUNCA commitear `.env.dev`, `.env.production` ni `.env.local` (cubiertos por `*.env.*` en `.gitignore`).

## Fuentes canonicas por tema

| Tema | Fuente primaria | Notas |
|---|---|---|
| Estado actual y siguiente sesion | `docs/00_coordination/CURRENT_STATE.md` | Entrada obligatoria |
| Estado por flujo | `docs/00_coordination/FLOW_STATUS.md` | Matriz de cierre y pendientes |
| Reconstruccion BD base | `docs/db_rebuild_status.md` | Historico `000..305`; no usar solo para produccion |
| Readiness local/sandbox | `docs/production-readiness/ERP_PRODUCTION_READINESS.md` | Gate 21/22 y decision de no produccion real absoluta |
| Go-Live productivo | `docs/release/GO_LIVE_RUNBOOK.md` | Runbook ejecutable cuando el operador tenga credenciales reales |
| Contabilidad/fiscal | `docs/auditoria_forense_contable_2026-05.md` | Cierre tecnico, legal externo pendiente |
| Impresion CPE/facturas | `docs/auditoria_impresion_cpe_facturas_2026-05.md` | Auditoria/remediacion 2026-05-25: bloqueos de codigo mitigados; falta beta/CDR real con credenciales/PSE |
| App desktop/Tauri | `docs/auditoria_desktop_vs_web_2026-05.md`, `apps/web/README-DESKTOP.md` | Online-first + offline local aplicado 2026-05-25: `offline_mode` fuerza cache/outbox, cola Tauri con lock local, sync usa API vigente, sidebar con prefetch limitado/escalonado, build/export/Tauri debug OK; 108/108 rutas exportadas smoke OK con API simulada; backend API sigue siendo autoritativo |
| Multiusuario/performance | `docs/auditoria_multiusuario_performance_2026-05.md` | Mitigados cuellos de polling/retries no idempotentes y crons multi-instancia con locks distribuidos; falta prueba de carga real para p95/p99 |
| Inventario/logistica/costeo | `docs/auditoria_forense_inventario_logistica_costeo_2026-05.md` | Cierre `333` y ajuste `335` |
| Tesoreria/caja/bancos/CxC/CxP | `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md` | Cierre `334` |
| Operacion Supabase | `docs/ops/supabase-connection.md` | Aplicacion manual por `psql` y notas remotas |
| Seguridad/rutas | `docs/security/route-access-matrix.md` | Matriz vigente de autorizacion por endpoint |
| Docs historicas | `docs/DOCUMENTATION_QUARANTINE.md` y `x_doc/` | Consultar como contexto, no como verdad unica |

## Pendientes reales

Bloqueados por dependencias externas (no estan en alcance de codigo; ver `docs/release/GO_LIVE_RUNBOOK.md` para la secuencia exacta cuando esten disponibles):

- Cargar certificado digital SUNAT/OSE productivo y credenciales externas reales.
- Ejecutar beta/homologacion CPE con credenciales/certificado/PSE reales y CDR aceptado; la remediacion de codigo de impresion/emision CPE del 2026-05-25 ya esta aplicada localmente.
- Antes de distribuir desktop: smoke del ejecutable contra API real, validar cola offline con reconexion real en el `.exe`, configurar `ALLOWED_ORIGINS`/CSP final y decidir si se requiere paridad completa de deep links dinamicos con refresh/acceso directo.
- Cargar secretos productivos finales y proveedor real de email si aplica.
- Ejecutar smoke fiscal externo con CPE/GRE/SIRE/PLE/PLAME segun alcance del contribuyente.
- Crear proyecto Supabase productivo dedicado y aplicarle `000..335` con los pre-requisitos no-Supabase de `1.1` del runbook.
- Ejecutar prueba de carga multiusuario contra API/Supabase reales: login, dashboard, POS, ventas, compras, CPE, inventario y finanzas; registrar p95/p99, 429/5xx y backlog de `outbox_events`.

Operacionales continuos:

- Mantener monitoreo de outbox, CPE sin asiento, SIRE/PLE vs mayor, pagos sujetos a bancarizacion y divergencias de inventario.

Cerrados en sesion 2026-05-24:

- ~~Revalidar `327..335` con `psql --set=ON_ERROR_STOP=1` en una BD nueva/limpia~~ -> revalidacion completa de `000..335` ejecutada el 2026-05-24, 22/22 validadores OK.
- ~~Reconciliar 3 productos descuadrados + 14 salidas sin costo pre-`333`~~ -> backfill aplicado el 2026-05-24, validador inventario quedo 6/6 OK.
- ~~SEC-001: `/compras/ordenes/:id/aprobar` aceptaba `aprobador_id` en body ignorando el JWT~~ -> el DTO ya no expone `aprobador_id`, el service usa SIEMPRE el `userId` del JWT, runtime confirmado: la API responde `400 - property aprobador_id should not exist`. Helper `apiContextAsAprobador()` agregado en `apps/web/tests/e2e/helpers/test-data.ts` para que los e2e autentiquen el aprobador con su propio JWT. 7 specs e2e + 1 backend e2e migrados; `inventario-logistica.spec.ts` revalidado end-to-end (2.1m OK). Requiere env vars nuevas `TEST_APROBADOR_EMAIL` y `TEST_APROBADOR_PASSWORD` al correr e2e.
- ~~BUG-001: POST `/api/cpe` directo no generaba asiento contable~~ -> el `ContabilidadEventsListener` ahora se suscribe a `factura.emitida` (que ya emitia `CpeService`); el cron lo persiste en outbox y `handleFacturaEmitida` genera el asiento de venta a partir del payload. Idempotencia por `(tenant + referencia serie-numero)`: si `venta.procesada` ya creo el asiento (flujo /ventas/pedidos/:id/facturar) el handler skipea sin duplicar. Validado: Jest backend 953/953 (subio de 951 por 2 tests SEC-001 nuevos); e2e `cpe-completo` paso 1.5m OK con handler activo; listener registra `factura.emitida` al boot del API (visible en logs).

## Estado de aplicacion 327..335 en BD remota (verificado 2026-05-24)

Verificacion read-only via `psql --dbname="$POSTGRES_URL"` contra `wypnbcptofqdmoynlonq`: 28 artefactos clave (funciones, indices, tablas, vistas) presentes; `331__production_accounting_flow_hardening.sql` se detecto NO aplicada (faltaban `app.seed_operational_defaults_for_tenant` y `ux_conceptos_planilla_tenant_codigo`) y se aplico limpia el mismo dia.

| Migration | Estado | Notas |
|---|---|---|
| 327 | Aplicada | `pos_registrar_venta_full_tx` + idx idempotency |
| 328 | Aplicada | Uniques de sesiones de caja |
| 329 | Aplicada | `create_demo_tenant` con fix pgcrypto |
| 330 | Aplicada | RBAC demo admin + expiry idx |
| 331 | Aplicada 2026-05-24 | Faltaba en remoto; aplicada limpia (`BEGIN`..`COMMIT`, 0 errores; trigger fiscal `tenants`, 24 filas updated) |
| 332 | Aplicada | Tabla `normativa_peru_periodos` + validador compliance |
| 333 | Aplicada | Validador inventario + view de status |
| 334 | Aplicada | Tabla `financial_forensic_repair_log` + RPC `registrar_cxc_pago_tx` + `conciliar_movimientos_bancarios_tx` |
| 335 | Aplicada | `descontar_stock_y_liberar_reserva` con descuento autoritativo (verificado via `pg_get_functiondef`) |

Validadores runtime ejecutados post-`331` y post-backfill residual (2026-05-24):

- `validar_accounting_production_compliance_runtime(NULL)`: **5/5 OK**.
- `validar_tesoreria_caja_bancos_runtime(NULL)`: **11/11 OK**.
- `validar_inventory_stock_reconciliation_runtime(NULL)`: **6/6 OK** (era 4/6 antes del backfill; los 3 productos descuadrados y 14 salidas pre-`333` quedaron cerrados con UPDATE puntual).

## Revalidacion 000..335 en BD limpia (2026-05-24)

Ejercicio de "linea canonica desde cero" ejecutado contra Postgres 16 limpio en Docker (`erp-pg-revalidate` en `:15432`, descartado al final):

1. Pre-requisitos minimos creados antes de aplicar: extensions `pgcrypto` y `uuid-ossp`; esquemas `app` y `auth`; tabla skeleton `auth.users`; roles `anon`, `authenticated`, `service_role` (BYPASSRLS). Estos prerequisitos son los que Supabase provee de fabrica y no estan declarados en las migraciones; se documentan aqui para reproducir el despliegue en un Postgres no-Supabase.
2. Aplicacion en orden de las 332 migraciones disponibles (huecos historicos `006..009`, max `335`) con `psql --dbname --set=ON_ERROR_STOP=1 -q -f`. Todas aplicaron limpio sin errores.
3. Validadores runtime sobre la BD reconstruida: **22/22 OK** (inventory 6/6, accounting compliance 5/5, tesoreria 11/11).

Conclusion: las 332 migraciones forman una linea canonica reproducible sobre Postgres 16. Cualquier despliegue futuro a un Supabase nuevo solo necesita los prerequisitos del paso 1 (los gestiona Supabase por defecto en proyectos nuevos).

## Protocolo de nueva sesion

1. Ejecutar `git status --short`.
2. Leer `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`.
3. Verificar duplicados de prefijo en `supabase/migrations`.
4. Si se toca BD, leer baseline forense y plan de reconstruccion antes de cualquier cambio.
5. Si se toca inventario, revisar `333__inventory_stock_reconciliation_hardening.sql`, `335__descontar_stock_authoritative.sql` y la auditoria de inventario.
6. Si se toca tesoreria/caja/bancos/CxC/CxP, revisar `334__treasury_cash_bank_forensic_closure.sql` y el handoff.
7. Si se toca produccion/release, revisar readiness, production checklist y ops Supabase.
8. No usar manuales de modulo como estado final sin contrastar con auditorias de mayo 2026 y este archivo.

## Protocolo de cierre de tarea

Antes de responder como terminado:

1. Revisar si la tarea cambio estado global, estado de flujo, migraciones, riesgos, pendientes o navegacion documental.
2. Si hubo cambio, actualizar `docs/00_coordination/CURRENT_STATE.md` y/o `docs/00_coordination/FLOW_STATUS.md`.
3. Actualizar tambien el documento fuente del flujo afectado.
4. No tocar estos archivos si la tarea fue local y no cambia estado ni contexto compartido.
