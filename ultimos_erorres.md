# Reporte de errores y brechas ERP (último análisis)

## Resumen
- Se identificaron fallos críticos en flujo de POS, cron jobs y contabilidad. Varios endpoints devuelven respuestas “dummy” o sin aislamiento de tenant usando la service role key, lo que rompe la funcionalidad y expone datos.
- Las tareas automáticas actuales no pueden ejecutarse por falta de contexto de tenant y un token inválido en el worker POS.
- Se documenta el comportamiento esperado por módulo y un plan de implementación priorizado.

## Errores de flujo (estado)
- [RESUELTO] POS ReferenceError por `items` sin declarar: `apps/erp-api/src/modules/pos/pos.service.ts` ya define `items` antes de locks/idempotencia; se añadieron tests de liberación de locks.
- [RESUELTO] Cron jobs sin tenant: `BackgroundJobsService` ahora itera tenants con `runPerTenant`, `prepareTenantContext` y locks (`app.acquire_job_lock/app.release_job_lock`), filtrando todas las consultas por `tenant_id` y registrando `integration_logs`.
- [RESUELTO] Worker POS token inválido: el worker firma JWT `pos.worker` con `POS_WORKER_JWT_SECRET`; el endpoint exige secreto propio (≥24 chars) y no acepta service role.

## Errores de lógica (estado)
- [RESUELTO] Lecturas contables sin aislamiento: `accounting-books.service` exige tenant y filtra `tenant_id` en todos los métodos.
- [RESUELTO] Endpoints dummy de contabilidad: `flujo-efectivo`, `ratios-financieros` y `cierre-contable` usan servicios reales, validan `anio/mes` y ejecutan cierre con `PeriodosService`.
- [RESUELTO] Configuración de series hardcode: `configuracion/series` consume `DocumentosService.getSeries`; `PUT series/:tipo` hace `upsert` en `documento_series` con `tenant_id` y correlativos.
- [RESUELTO] Avisos de vencimientos sin tenant: `verificarVencimientosPagos` filtra por `tenant_id` dentro de `runPerTenant`.

## Errores de vacío / casos límite (estado)
- [RESUELTO] Reportes contables devolvían éxito vacío: endpoints contables validan parámetros y dependen de datos reales; `PeriodosService.cerrarPeriodo` mantiene validaciones.
- [RESUELTO] Cron duplicados sin control: jobs pueden deshabilitarse con `BACKGROUND_JOBS_ENABLED=false` y usan locks per-tenant + logging para evitar ejecución concurrente.

## Acciones pendientes
- [RESUELTO] Tests focalizados de POS locks/cron/contabilidad ejecutados (background-jobs, contabilidad events/entries) con `node node_modules/jest/bin/jest.js --runInBand ...`.
- [RESUELTO] RPC de locks creados en DB (`app` y `public`) y cache refrescado; `integration_logs` registra `cierre-ventas`, `vencimientos` y `stock-bajo` por tenant.
- Verificar en despliegue que `POS_WORKER_JWT_SECRET` sea distinto de `SUPABASE_SERVICE_ROLE_KEY` y que existan RPC `app.acquire_job_lock/app.release_job_lock` en DB.

## Análisis por capas
- Backend: POS bloqueado por ReferenceError; cron jobs inoperantes; endpoints contables exponen datos entre tenants y reportan “éxito” sin lógica. Uso indiscriminado de service role key sin filtros de tenant en servicios contables.
- Frontend: las rutas de configuración y contabilidad pueden mostrar datos ficticios (series hardcode, ratios/cashflow 0) y no recibir errores cuando falta configuración o periodo; riesgo de UX inconsistente.
- Datos: consultas contables y de vencimientos sin `tenant_id` + service role ⇒ RLS bypass; cierres contables inexistentes dejan libros abiertos sin alerta.

## Módulos interconectados
- POS ↔ Cron worker: los pendientes de facturación no se reintentan por token inválido; la cola de ventas se queda “pending” sin CPE/CxC.
- Contabilidad ↔ Reportes: al no filtrar por tenant ni calcular, cualquier dashboard que consuma `plan-cuentas`, `libro-mayor` o `flujo-efectivo` mezcla datos de empresas y muestra ceros.
- Configuración ↔ CPE/ventas: series y parámetros de facturación no se persisten; posibles duplicados o numeración no consecutiva, afectando CPE y conciliación.

## Funcionalidad esperada
- POS: procesar ventas sin errores de referencia, con locks e idempotencia, y reintentar CPE/CxC desde cron con token válido.
- Contabilidad: todos los libros y reportes filtrados por `tenant_id` y calculados; cierre contable debe generar asientos 59/89, validar cuadratura y bloquear periodo.
- Configuración: series y parámetros deben almacenarse por tenant y devolver valores reales; actualizaciones deben persistir en BD.
- Cron/Workers: ejecutarse en un proceso dedicado, con contexto de tenant, token válido y sin duplicidad entre instancias.

## Estado para producción
- Backend: lógica crítica de POS/cron/contabilidad corregida y con locks/tenant context; smoke local 14/14 OK. Falta: separar staging/prod (mismas keys), smoke E2E contra base aislada con datos reales y revisar métricas/alertas en entorno objetivo.
- Frontend: sin issues nuevos; depende de backend corregido. Aún sin smoke UI/end-to-end real en staging, riesgo bajo si el backend mantiene validaciones.
- BD/RLS: RPC de locks creados y probados; `integration_logs` registra cron per-tenant. Riesgo: staging=prod (misma Supabase), sin aislamiento de datos; sugerido clonar proyecto o usar schemas separados para pruebas.
- Arquitectura/ops: API y worker listos con JWT `pos.worker` y cron per-tenant; certificados en modo demo/local. Falta pipeline de despliegue/rollback y monitoreo en entorno real (metrics/health ya existen, validar en target).
- Testing: unit/focalizados OK; smoke local OK; falta E2E con datos de negocio reales y pruebas de UI/regresión.

## Plan de implementación
1) POS: arreglar el ReferenceError moviendo la definición de `items` antes de los locks y agregar test de venta feliz/error; validar liberación de locks en catch.  
2) Contabilidad: agregar `tenantId` obligatorio y filtros `eq('tenant_id', tenantId)` en `AccountingBooksService`; auditar llamadas existentes. Implementar cálculos reales en flujo de efectivo, ratios y cierre (usar servicios ya existentes) y retornar errores cuando falte periodo.  
3) Configuración: reemplazar respuestas hardcode en series por lecturas/escrituras en tabla real por tenant; añadir validación de colisión de numeración.  
4) Cron/Workers: mover `BackgroundJobsService` a un worker dedicado o añadir `tenantContext.run` por tenant + lock global; corregir `verificarVencimientosPagos` para filtrar por tenant. Emitir un JWT `pos.worker` firmado con `POS_WORKER_JWT_SECRET` y usarlo en el worker API call; registrar errores en tabla de health cron.  
5) Gobernanza de claves: dejar de usar la service role key como token y como “secret”; definir secretos separados para workers y evitar service role en rutas contables públicas. Añadir pruebas E2E por tenant para libros contables y cron POS.



Sugerencia de verificación (ejecutada): smoke E2E local (mismo Supabase) con POS/CPE/cron/contabilidad pasó 14/14; si se desea aislamiento, correr en un proyecto Supabase separado. 
de
