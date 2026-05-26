# Auditoria multiusuario y cuellos de botella - 2026-05

Fecha: 2026-05-26

## Conclusion

Se corrigieron riesgos de concurrencia y carga que podian aparecer al operar con multiples usuarios o varias instancias API: reintentos no idempotentes desde frontend, polling sincronizado/solapado en dashboard y notificaciones, y crons backend que podian ejecutarse en paralelo en mas de un nodo.

No reemplaza una prueba de carga real. El cierre tecnico vigente valida compilacion, tests unitarios focalizados y build; falta medir p95/p99 contra API y Supabase reales con usuarios concurrentes.

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

## Evidencia

- `pnpm --filter @erp-suite/web type-check`: OK.
- `pnpm --filter @erp-suite/erp-api type-check`: OK.
- `pnpm exec jest src/shared/outbox/outbox-worker.service.spec.ts --runInBand`: OK, 2/2.
- `pnpm exec jest src/modules/contabilidad/listeners/contabilidad-events.listener.spec.ts --runInBand`: OK, 21/21.
- `pnpm --filter @erp-suite/web run build`: OK, 111 paginas generadas.
- `pnpm --filter @erp-suite/erp-api build`: OK.

## Pendientes reales

- Ejecutar prueba de carga contra API real y Supabase real con perfiles por modulo: login, dashboard, POS, ventas, compras, CPE, inventario y finanzas.
- Medir p95/p99, tasa de 429/5xx, saturacion Supabase/PostgREST y colas `outbox_events`.
- Revisar si se necesita claim atomico por fila en `outbox_events` si se habilitan workers paralelos por lote; los locks actuales serializan por tipo de worker para evitar duplicados en multi-nodo.
- Definir presupuestos de polling por rol/modulo para produccion.
