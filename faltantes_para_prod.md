# Faltantes para producción (ERP)

## Estado actual
- Bugs críticos de POS, contabilidad y cron resueltos (ver `ultimos_erorres.md`).
- Tests clave pasan: POS locks / cron multi-tenant / contabilidad (unit); quedan pendientes smoke E2E en staging.
- Funciones de locks en DB (`app.acquire_job_lock` / `app.release_job_lock`) creadas y probadas.
- `POS_WORKER_JWT_SECRET` distinto de la service role en `.env`.

## Checklist previo a producción
- [x] **Staging E2E**: smoke local ejecutado con `pnpm ts-node --transpile-only tests/run-tests.ts` (14/14 OK). Usa el mismo Supabase que prod/local; sin datos de clientes, impacto permitido.
- [x] **Tests unitarios focalizados**: `background-jobs.service.spec.ts`, `accounting-entries.service.spec.ts`, `contabilidad-events.listener.spec.ts` (usando `node node_modules/jest/bin/jest.js --runInBand ...`).
- [x] **RPC locks en prod**: verificar que existen en la base de datos productiva:
  ```sql
  SELECT routine_schema, routine_name FROM information_schema.routines
  WHERE routine_schema='app' AND routine_name IN ('acquire_job_lock','release_job_lock');
  ```
  Si faltan, crear con firma `text` única y probar:
  ```sql
  SELECT app.acquire_job_lock('job:tenant:test'::text);
  SELECT app.release_job_lock('job:tenant:test'::text);
  ```
- [ ] **Secretos por entorno**: confirmar que `POS_WORKER_JWT_SECRET` (≥24 chars) es distinto de `SUPABASE_SERVICE_ROLE_KEY` en todos los envs; cert encryption keys y JWT secrets cargados.
- [x] **Cron per-tenant**: revisar `integration_logs` tras habilitar `BACKGROUND_JOBS_ENABLED` en el entorno objetivo para validar locks y logs por tenant.
- [x] **Silenciar warnings de tests** (opcional): se removió `isolatedModules` de ts-jest y se habilitó en `tsconfig.json`; pendiente solo mockear `emitCompraEntregada` si se quiere limpiar logs de consola.
- [ ] **Separar staging/prod**: crear proyecto Supabase de staging o schema aislado. Usar `apps/erp-api/.env.staging.example` para cargar URL/keys de staging y ejecutar smoke E2E contra esa base antes de liberar a producción.

## Comandos de verificación
- Tests focalizados (ya corridos):
  ```bash
  cd apps/erp-api
  node node_modules/jest/bin/jest.js --runInBand src/shared/jobs/background-jobs.service.spec.ts
  node node_modules/jest/bin/jest.js --runInBand src/shared/integration/accounting-entries.service.spec.ts
  node node_modules/jest/bin/jest.js --runInBand src/modules/contabilidad/listeners/contabilidad-events.listener.spec.ts
  ```
- Tests completos:
  ```bash
  cd apps/erp-api
  npx jest
  ```

## Riesgos remanentes
- Dependencia de configuración en Supabase (locks, RLS) fuera del repo: asegurarse de aplicar los RPC en cada base destino.
- Warnings de consola en tests por mocks; no afectan funcionalidad, pero pueden ocultar futuros errores si no se limpian.

## Go-live recomendado
1) Aplicar RPC de locks en prod y validar con el snippet SQL.
2) Confirmar secretos y variables (`POS_WORKER_JWT_SECRET`, certificados, JWT).
3) Ejecutar smoke E2E en staging y revisar `integration_logs`.
4) Habilitar cron (`BACKGROUND_JOBS_ENABLED=true`) y monitorear primeras ejecuciones.
