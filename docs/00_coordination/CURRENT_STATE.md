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
- Auditoria multiusuario/performance aplicada el 2026-05-26: retries frontend no idempotentes desactivados para escrituras, polling visible/sin solapes, banners de configuracion cacheados, workers cron protegidos con locks distribuidos y banderas de apagado para pruebas read-only. Prueba autenticada read-only contra API local + Supabase real: 589/589 OK, 0 errores, 0 HTTP 429/5xx, p95 1490 ms, p99 1956 ms. Se corrigio `GET /api/finanzas/cxp?limit=10&page=1` para aceptar paginacion. Outbox remoto quedo limpio: `completed=3985`, `pending=0`, `processing=0`, `failed=0`, `dead_letter=0`.
- El worktree contiene muchos cambios previos del usuario/de sesiones anteriores. No revertir ni stagear archivos por inercia.
- Fase 1A de hardening pre-prod aplicada el 2026-05-26 sobre el reporte forense `docs/audits/2026-05-26-forensic-audit-pre-prod.md` (post-triage con Codex):
  - **C-001** (`compras.controller.ts:crearProveedor`): refactor a `CreateProveedorDto` + `@CurrentTenant()`. Quitado el fallback al primer tenant y la lectura de `tenant_id` del body. Check de RUC duplicado ahora filtra por `tenant_id`.
  - **C-002** (`shared/integration/accounting-entries.service.ts:calcularCostoVentas`): firma cambiada a `(items, tenantId)`. Query `productos` filtra por `tenant_id`. Caller `procesarAsientoVenta` pasa `venta.tenantId`.
  - **H-001** (`modules/ventas/clientes/clientes.service.ts:delete`): queries de dependencias en `cotizaciones` y `pedidos_venta` ahora incluyen `.eq('tenant_id', tenantId)`.
  - **C-003 + H-004..H-007**: nuevo util `apps/erp-api/src/common/util/postgrest.util.ts:sanitizePostgrestSearch` con allowlist conservadora. Aplicado en 5 sitios con `.or(...ilike%${input}%...)`: `compras/repositories/proveedores.repository.ts`, `contabilidad/services/plan-cuentas.service.ts:buscar`, `usuarios/user-management.service.ts:findAll`, `tenants/tenant-management.service.ts:listTenants`, `notifications/inventory-stock-alerts.listener.ts:verificarNotificacionReciente`.
  - Verificación post-fix: `tsc --noEmit` limpio en mis archivos. Suite jest backend 994/995 OK (el único fallo es `cpe-integration.verify.spec.ts` ya documentado como pre-existente). +11 tests netos: 8 nuevos para `sanitizePostgrestSearch` + 3 que aparecieron en paralelo.
  - Pendientes Fase 1B (atomicidad fiscal — recepción/facturar/confirmar pedido) y Fase 2 (RBAC observability/metrics, N+1, frontend perf).
- Codex consolido Fase 1A + modulo migration completo en commit `5c35d76 fix(preprod): harden forensic audit findings` (rama `codex/accounting-production-closure`, 2026-05-27). Verificado que C-001/C-002/H-001/sanitizador sobreviven intactos.
- C-004 (atomicidad cierre de recepcion) PARCIALMENTE mitigado por Codex en `recepciones.service.ts`: optimistic concurrency en UPDATE de `orden_compra_detalles` (verifica fila afectada via `.select().maybeSingle()`) + state guard `.eq('estado','BORRADOR')` que evita doble cierre. NO es atomicidad transaccional completa: si falla a mitad del loop de items, los previos quedan escritos sin rollback. Decision pendiente: aceptar la mitigacion liviana o migrar a RPC `cerrar_recepcion_tx`.
- Fase 1B en curso (atomicidad fiscal). **C-004 CERRADO 2026-05-27**: nueva migración `338__cerrar_recepcion_transaccional.sql` con RPC `cerrar_recepcion_tx(p_recepcion_id, p_tenant_id, p_user_id, p_observaciones)`. El cierre de recepción ahora es atómico (todo-o-nada): ingreso de stock por item (reusa `registrar_movimiento_almacen` vía llamada en la misma transacción), `cantidad_recibida` en detalles de OC, recálculo de estado de OC y cierre de recepción corren en una sola transacción con ROLLBACK total si algo falla. La RPC retorna jsonb con los movimientos creados y el backend re-emite `MovimientoStockEvent` POST-COMMIT (preserva el asiento contable de entrada Mercaderías/Cargas). `recepciones.service.ts:cerrarRecepcion` refactorizado: reemplaza el loop JS por una llamada a la RPC; se limpiaron huérfanos resultantes (`InventarioService` inyección, `actualizarEstadoOrden`, import `CalidadRecepcion`). Verificación: migración aplicada a DEV; smoke SQL real OK (recepción→CERRADA, orden→PARCIAL, detalle→7, stock→7, existencias→7, 1 movimiento); specs reescritos (recepciones.service 18/18 + recepciones-inventario-integration 3/3); tsc limpio; suite backend 991/992 (único fallo `cpe-integration.verify.spec.ts` pre-existente, sin relación). Migración 338 aplicada SOLO a DEV; falta PROD.
- **H-002 (facturar pedido) — RECLASIFICADO a "ya resiliente, no requiere RPC" tras verificación en código (2026-05-27)**: `generarFactura` ejecuta el CPE PRIMERO (`cpeIdempotencyKey`, idempotente) y el descuento de stock DESPUÉS, con guard de idempotencia en `aplicarSalidaStockFacturacionSimplificada` (verifica movimiento SALIDA existente por PEDIDO+producto antes de descontar, línea ~1828) usando la RPC atómica `descontar_stock_y_liberar_reserva`. Los UPDATEs de pedido/detalles son idempotentes en efecto. Un reintento converge (CPE reutilizado → stock skip → pedido actualizado). Una RPC SQL monolítica es **imposible** (el CPE es I/O externo SOAP/firma a SUNAT, no puede correr dentro de una transacción Postgres) e **innecesaria** (el flujo ya es un saga idempotente convergente). El riesgo original de la auditoría ("stock descontado sin factura") está mitigado por el orden CPE-primero + idempotencia. No se agrega RPC.
- **H-003 (confirmar pedido) — CERRADO 2026-05-27**: nueva migración `339__reservar_pedido_stock_transaccional.sql` con RPC `reservar_pedido_stock_tx(p_pedido_id, p_tenant_id)`. Reserva el stock de TODOS los items del pedido en una sola transacción reusando `reservar_stock_atomico` por item; si un item no tiene stock, la excepción aborta el statement y Postgres hace ROLLBACK total (libera las reservas ya creadas automáticamente) — elimina el rollback manual frágil que podía dejar el pedido CONFIRMADO con reserva parcial. Idempotente: si ya hay reservas para el pedido, retorna `skipped=true`. `pedidos.service.ts:confirmarPedido` refactorizado: reemplaza el bloque loop+rollback-manual (~80 líneas) por una llamada a la RPC, preservando la semántica de `saltarReserva` (ahora = `reservaResult.skipped`) para el revert best-effort posterior. Verificación: migración aplicada a DEV; smoke SQL real en 3 escenarios — (1) stock insuficiente en item 2 → excepción + 0 reservas en item 1 (rollback total OK, sin reserva parcial), (2) stock suficiente → ambos reservados + 2 movimientos, (3) idempotencia → 2da llamada skipped sin duplicar. tsc limpio; suite backend 991/992 (único fallo `cpe-integration.verify.spec.ts` pre-existente). Migración 339 aplicada SOLO a DEV; falta PROD.
- **Fase 1B COMPLETA**: C-004 (recepción, mig 338) + H-003 (confirmar pedido, mig 339) con RPC transaccional; H-002 (facturar) verificado como ya-resiliente sin RPC. Migraciones 337/338/339 aplicadas a DEV; **pendiente aplicarlas a PROD**.
- Auditoria forense full-scope adicional 2026-05-26 anexada al prompt `SISTEM-ANALITICS-COMPLETED.md` (raiz del repo): mapa del sistema, hallazgos por severidad post-triage, matriz de integracion modulo-a-modulo, checklist preproduccion y 15 falsos positivos descartados con evidencia (`.env` NO esta en git, axios 1.16 no es vulnerable, Stripe SI valida HMAC, indices CxC/CxP SI existen, etc.). H-002/H-003 (facturar/confirmar pedido sin RPC atomica) siguen abiertos.

## Migraciones vigentes

- Reconstruccion base documentada: `000..305`.
- Gates remotos/manuales aplicados el 2026-05-16: `312..326`.
- Auditorias y cierres posteriores en repo local: `327..339`.
- `337__client_migration_rls_rpc_hardening.sql` (Codex), `338__cerrar_recepcion_transaccional.sql` (C-004) y `339__reservar_pedido_stock_transaccional.sql` (H-003) aplicadas SOLO a DEV; pendientes en PROD.
- La colision local de prefijo `333__` fue resuelta:
  - `333__inventory_stock_reconciliation_hardening.sql`: inventario/logistica/costeo.
  - `334__treasury_cash_bank_forensic_closure.sql`: tesoreria/caja/bancos/CxC/CxP.
  - `335__descontar_stock_authoritative.sql`: ajuste autoritativo posterior de salida de stock.
- Migracion de data desde ERP externo aplicada el 2026-05-26: `336__client_data_migration_external_id_and_audit.sql` agrega `external_id` UNIQUE(tenant_id, external_id) a clientes/proveedores/productos/CxC/CxP/asientos/cuentas_bancarias/plan_cuentas, crea tablas `migration_runs` y `migration_run_rows`, funcion `validar_migracion_apertura(tenant, fecha_corte)` con 6 checks, y permisos `migration.*` para rol ADMIN. Aplicada exitosamente en BD remota DEV (erp-dev) el 2026-05-26: 8/8 columnas external_id, 8/8 indices unicos parciales, 2/2 tablas auditoria con RLS, funcion validador retorna 6 checks correctamente. Tres bugs cazados al aplicarla:
  1. La columna `status` del RETURN TABLE colisionaba con `migration_runs.status` en 3 CTEs del validador → resuelto aliasando la tabla como `mr` y calificando `mr.status`, `mr.run_type`, `mr.tenant_id`.
  2. El check `ck_cuentas_por_cobrar_ids_required` exigia `documento_id NOT NULL` pero data migrada no tiene documento local → relajado para permitir `documento_id IS NULL` cuando `metadata->>'origen' = 'migracion_apertura'`.
  3. Los importers de CxC/CxP/balance_apertura no respetaban varios CHECKs existentes (estado `ACTIVO` en asientos contables debe ser `confirmado`; CxP estado `CANCELADO` no existe — debe ser `PAGADA`; faltaban `event_source`, `idempotency_key`, `condiciones_pago`, `numero_documento` como text) → corregidos en los services del modulo migration.
  Smoke E2E SQL contra dev valido los 6 checks del validador en dos escenarios (cuadrado: OK/SKIP; mismatch forzado: CHK_002 FAIL correctamente). Backend TS compila limpio en `src/modules/migration/*`; 31/31 tests unitarios siguen OK.
- Hardening forense local 2026-05-27: agregado `337__client_migration_rls_rpc_hardening.sql` para forzar RLS en `migration_runs`/`migration_run_rows`, corregir politicas a `app.current_tenant_id()` y revocar `validar_migracion_apertura` a `authenticated/anon` dejando ejecucion solo por `service_role`. Tambien se corrigio idempotencia de stock inicial por sucursal/almacen/fecha, validacion estricta de `fileBase64`, contrato de runTypes CSV, XSS en impresiones/toasts y tenant obligatorio en `DocumentosService`. Evidencia: `docs/production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md`; tests focalizados 34/34 OK y type-check backend/frontend OK.
- Intento de smoke API end-to-end (HTTP completo) el 2026-05-26 falló por blocker de infra: la API levantada localmente lee `app.module.ts` `envFilePath: ['.env', 'apps/erp-api/.env']` lo cual carga el `.env` raíz que apunta a PROD (`wypnbcptofqdmoynlonq`). La copia `.env.dev → .env.local` no surte efecto porque `.env.local` no está en la lista. Override por shell env logró redirigir la API a DEV pero el endpoint `/api/demo/create` requiere un "tenant fuente con RBAC operativo" para clonar, y DEV está vacío de tenants. Smoke API queda como follow-up; el wiring HTTP no quedó cubierto. Daño operativo: `/api/demo/create` se ejecutó una vez contra PROD por error (antes del shell-override fix), creó tenant `495fa8ef-7a63-4089-a199-6bf5f33a6536` auto-suspendido — limpiado inmediatamente con `DELETE FROM public.tenants WHERE id='495fa8ef...'` (CASCADE), PROD regresó de 42 a 41 tenants. Migración 336 NUNCA se aplicó a PROD; solo a DEV.
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
| Migracion desde ERP externo | `docs/migration/CLIENT_MIGRATION_RUNBOOK.md`, `docs/production-readiness/ERP_FORENSIC_AUDIT_2026-05-27.md` | Modulo `apps/erp-api/src/modules/migration/` + migraciones `336__` y hardening local `337__`. Cubre clientes/proveedores/CxC/CxP/balance apertura/stock inicial/CPE historico via CSV con `external_id`. Pendiente: aplicar/validar `337` remoto, importer dedicado para plan_cuentas/cuentas_bancarias y UI en `apps/web`. |
| Contabilidad/fiscal | `docs/auditoria_forense_contable_2026-05.md` | Cierre tecnico, legal externo pendiente |
| Impresion CPE/facturas | `docs/auditoria_impresion_cpe_facturas_2026-05.md` | Auditoria/remediacion 2026-05-25: bloqueos de codigo mitigados; falta beta/CDR real con credenciales/PSE |
| App desktop/Tauri | `docs/auditoria_desktop_vs_web_2026-05.md`, `apps/web/README-DESKTOP.md` | Online-first + offline local aplicado 2026-05-25: `offline_mode` fuerza cache/outbox, cola Tauri con lock local, sync usa API vigente, sidebar con prefetch limitado/escalonado, build/export/Tauri debug OK; 108/108 rutas exportadas smoke OK con API simulada; backend API sigue siendo autoritativo |
| Multiusuario/performance | `docs/auditoria_multiusuario_performance_2026-05.md` | Mitigados cuellos de polling/retries no idempotentes y crons multi-instancia con locks distribuidos; prueba read-only real 589/589 OK, p95 1490 ms, p99 1956 ms, 0 HTTP 429/5xx; outbox remoto limpio sin pending/processing/failed/dead_letter; falta prueba productiva completa con escrituras controladas |
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
- Ejecutar prueba de capacidad productiva completa con mas concurrencia y escrituras controladas/idempotentes contra API/Supabase reales: POS, ventas, compras, CPE, inventario y finanzas.
Operacionales continuos:

- Mantener monitoreo de outbox, CPE sin asiento, SIRE/PLE vs mayor, pagos sujetos a bancarizacion y divergencias de inventario.

Cerrados en sesion 2026-05-24:

- ~~Revalidar `327..335` con `psql --set=ON_ERROR_STOP=1` en una BD nueva/limpia~~ -> revalidacion completa de `000..335` ejecutada el 2026-05-24, 22/22 validadores OK.
- ~~Reconciliar 3 productos descuadrados + 14 salidas sin costo pre-`333`~~ -> backfill aplicado el 2026-05-24, validador inventario quedo 6/6 OK.
- ~~SEC-001: `/compras/ordenes/:id/aprobar` aceptaba `aprobador_id` en body ignorando el JWT~~ -> el DTO ya no expone `aprobador_id`, el service usa SIEMPRE el `userId` del JWT, runtime confirmado: la API responde `400 - property aprobador_id should not exist`. Helper `apiContextAsAprobador()` agregado en `apps/web/tests/e2e/helpers/test-data.ts` para que los e2e autentiquen el aprobador con su propio JWT. 7 specs e2e + 1 backend e2e migrados; `inventario-logistica.spec.ts` revalidado end-to-end (2.1m OK). Requiere env vars nuevas `TEST_APROBADOR_EMAIL` y `TEST_APROBADOR_PASSWORD` al correr e2e.
- ~~BUG-001: POST `/api/cpe` directo no generaba asiento contable~~ -> el `ContabilidadEventsListener` ahora se suscribe a `factura.emitida` (que ya emitia `CpeService`); el cron lo persiste en outbox y `handleFacturaEmitida` genera el asiento de venta a partir del payload. Idempotencia por `(tenant + referencia serie-numero)`: si `venta.procesada` ya creo el asiento (flujo /ventas/pedidos/:id/facturar) el handler skipea sin duplicar. Validado: Jest backend 953/953 (subio de 951 por 2 tests SEC-001 nuevos); e2e `cpe-completo` paso 1.5m OK con handler activo; listener registra `factura.emitida` al boot del API (visible en logs).
- ~~Outbox dead_letter historico 2026-05-20 (`venta.procesada`, `B001-00000001`)~~ -> cerrado el 2026-05-26 como reconciliado, sin reprocesar, porque ya existia asiento confirmado y cuadrado para la misma referencia por flujo fiscal/CxC (`source_event_id=6cfb9a36-76f2-43de-807e-f0e42ccd72b2`). Revalidado: `completed=3985`, `pending=0`, `processing=0`, `failed=0`, `dead_letter=0`; referencia `B001-00000001` mantiene 1 asiento por 47.20/47.20.

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
