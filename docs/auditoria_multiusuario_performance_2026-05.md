# Auditoria multiusuario y cuellos de botella - 2026-05

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `auditoria_forense`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2026-05-26

## Conclusion

Se corrigieron riesgos de concurrencia y carga que podian aparecer al operar con multiples usuarios o varias instancias API: reintentos no idempotentes desde frontend, polling sincronizado/solapado en dashboard y notificaciones, y crons backend que podian ejecutarse en paralelo en mas de un nodo.

El 2026-05-26 se ejecuto una prueba de carga autenticada, read-only y moderada contra el API local apuntando al Supabase real configurado en `apps/erp-api/.env`, con workers de fondo apagados para evitar escrituras colaterales. Resultado final: 589/589 requests OK, 0 errores, 0 HTTP 429, 0 HTTP 5xx, p95 1490 ms, p99 1956 ms.

Esto no reemplaza una prueba de capacidad productiva completa con POS/escrituras controladas y observabilidad de infraestructura, pero ya cubre el riesgo inmediato de polling/read-only multiusuario en los modulos principales.

## Problemas encontrados y remediados

### 1. Riesgo de duplicar escrituras por retry frontend

Problema: `useApi` reintentaba por defecto cualquier metodo. Si un `POST/PUT/DELETE` era procesado por el servidor pero el cliente abortaba por timeout, el retry podia crear doble venta, pago, CPE, actualizacion o movimiento.

Remediacion:

- `apps/web/hooks/use-api.ts` ahora reintenta por defecto solo metodos idempotentes (`GET/HEAD/OPTIONS`).
- Escrituras no idempotentes hacen un solo intento salvo que el flujo implemente su propia idempotencia transaccional en backend.

### 2. Polling sincronizado y solapado en dashboard

Problema: cada usuario abierto en dashboard hacia refresh cada 30s aunque la pestana estuviera oculta, y podia solapar llamadas si la request anterior seguia en curso.

Remediacion:

- `apps/web/app/dashboard/page.tsx` usa un guard de in-flight.
- El refresh automatico pasa a intervalo con jitter y pausa cuando `document.hidden`.
- Al volver a la pestana visible se refresca una vez.

### 3. Polling de notificaciones y estado offline

Problema: notificaciones refrescaban cada 30s por usuario sin jitter ni pausa por visibilidad; el badge offline hacia polling frecuente aunque la pestana estuviera oculta.

Remediacion:

- `NotificationBell` evita solapes, usa intervalo con jitter, pausa en pestana oculta y refresca al abrir el popover.
- `OfflineStatusBadge` reduce polling local y pausa cuando la pestana esta oculta.
- `DashboardNotificationBanners` reutiliza `useConfigurationStatus` cacheado por TanStack Query en vez de hacer su propio polling duplicado.

### 4. Crons backend en despliegues con varias instancias

Problema: `OutboxWorker`, `ContabilidadEventsListener` y `PosWorkerScheduler` tenian guardas solo en memoria. En un despliegue con dos o mas procesos, cada nodo podia ejecutar el mismo cron.

Remediacion:

- `OutboxWorker` usa `acquire_job_lock`/`release_job_lock` con lock distribuido `worker:outbox:shared`.
- `ContabilidadEventsListener` usa lock distribuido `worker:outbox:contabilidad`.
- `PosWorkerScheduler` usa lock distribuido `worker:pos:pendientes` y filtra tenants activos.
- `OutboxWorker` se puede desactivar por proceso con `OUTBOX_WORKER_CRON_ENABLED=false`.
- `ContabilidadEventsListener` se puede desactivar por proceso con `ACCOUNTING_OUTBOX_WORKER_CRON_ENABLED=false`.

### 5. Contrato inconsistente de CxP con paginacion estandar

Problema: `GET /api/finanzas/cxp?limit=10&page=1` devolvia `400` porque `FiltrarCxpDto` no declaraba `page/limit`, mientras otros listados financieros si aceptaban paginacion.

Remediacion:

- `FiltrarCxpDto` acepta `page` y `limit` con validacion numerica.
- `CxpService.listarCuentasPorPagar` aplica `range(...)`, pide `count: exact` y devuelve `pagination`.
- La UI actual sigue funcionando porque ignora `pagination` si no la necesita.

## Prueba de carga read-only 2026-05-26

Condiciones:

- API local: `http://localhost:3002`.
- Supabase real segun `apps/erp-api/.env`.
- Duracion: 60 s.
- Concurrencia: 8 workers.
- Credenciales: usuario de prueba desde `apps/web/.env.local`.
- Escrituras: no se ejecutaron POST funcionales salvo login unico.
- Workers apagados: `POS_WORKER_CRON_ENABLED=false`, `OUTBOX_WORKER_CRON_ENABLED=false`, `ACCOUNTING_OUTBOX_WORKER_CRON_ENABLED=false`, `BACKGROUND_JOBS_ENABLED=false`.

Resumen final:

| Metrica | Resultado |
|---|---:|
| Requests | 589 |
| OK | 589 |
| Errores | 0 |
| RPS | 9.82 |
| p50 | 1162 ms |
| p95 | 1490 ms |
| p99 | 1956 ms |
| Max | 2577 ms |
| HTTP 429 | 0 |
| HTTP 5xx | 0 |

Endpoints mas lentos por p95:

| Endpoint | Requests | p95 |
|---|---:|---:|
| `cpe/stats` | 22 | 2091 ms |
| `cpe` | 19 | 1513 ms |
| `inventario/stats` | 24 | 1490 ms |
| `finanzas/cxc` | 17 | 1402 ms |
| `finanzas/bancos/cuentas` | 28 | 1309 ms |

Backlog `outbox_events` post-cierre:

| Estado | Total |
|---|---:|
| `completed` | 3985 |
| `dead_letter` | 0 |
| `pending` | 0 |
| `processing` | 0 |
| `failed` | 0 |

El unico `dead_letter` preexistente fue cerrado el 2026-05-26 como reconciliado, sin reprocesarlo, porque ya existia asiento confirmado y cuadrado para la misma referencia `B001-00000001` por flujo fiscal/CxC (`source_event_id=6cfb9a36-76f2-43de-807e-f0e42ccd72b2`). La validacion posterior dejo `pending=0`, `processing=0`, `failed=0`, `dead_letter=0` y un solo asiento para esa referencia.

Artefactos:

- Harness: `scripts/load-test-api.mjs`.
- Resultado inicial con bug CxP: `docs/load-tests/api_readonly_multiuser_2026-05-26.json`.
- Resultado final consistente: `docs/load-tests/api_readonly_multiuser_2026-05-26-final.json`.

## Evidencia

- `pnpm --filter @erp-suite/web type-check`: OK.
- `pnpm --filter @erp-suite/erp-api type-check`: OK.
- `pnpm exec jest src/shared/outbox/outbox-worker.service.spec.ts --runInBand`: OK, 2/2.
- `pnpm exec jest src/modules/contabilidad/listeners/contabilidad-events.listener.spec.ts --runInBand`: OK, 21/21.
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/finanzas/cxp/cxp.service.spec.ts --runInBand`: OK, 25/25.
- `pnpm --filter @erp-suite/erp-api exec jest src/shared/outbox/outbox-worker.service.spec.ts src/modules/contabilidad/listeners/contabilidad-events.listener.spec.ts --runInBand`: OK, 23/23.
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/finanzas/cxp/cxp.service.spec.ts src/shared/outbox/outbox-worker.service.spec.ts src/modules/contabilidad/listeners/contabilidad-events.listener.spec.ts --runInBand`: OK, 48/48.
- `node --check scripts/load-test-api.mjs`: OK.
- `pnpm --filter @erp-suite/web run build`: OK, 111 paginas generadas.
- `pnpm --filter @erp-suite/erp-api build`: OK.

## Pendientes reales

- Ejecutar prueba de capacidad productiva completa con observabilidad externa, mas concurrencia y escenarios controlados de escritura/idempotencia: POS, ventas, compras, CPE, inventario y finanzas.
- Revisar si se necesita claim atomico por fila en `outbox_events` si se habilitan workers paralelos por lote; los locks actuales serializan por tipo de worker para evitar duplicados en multi-nodo.
- Definir presupuestos de polling por rol/modulo para produccion.
