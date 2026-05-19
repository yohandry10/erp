# Production checklist técnica

## Objetivo
Estandarizar la salida a producción con validación técnica, trazabilidad y plan de rollback.

## Checklist pre-release

- [ ] Rama objetivo está protegida (`main`).
- [ ] PR aprobada con revisiones habilitadas y conversaciones resueltas.
- [ ] CI completa verde en branch de integración:
  - `lint`
  - `type-check`
  - `test`
  - `build`
  - `audit`
- [ ] PR incluye evidencia de cambios según bloque CODEX.
- [ ] Migraciones de DB documentadas (si aplica) y con rollback path.
- [ ] Variables de entorno requeridas confirmadas (`.env.example`, `apps/erp-api/.env.example` y docs de config).
- [ ] Chequeo de secretos:
  - ninguna variable sensible en texto plano en código/comentarios.
  - `.env` real no versionado.
- [ ] Pruebas críticas por bloque ejecutadas (según bloque actual).
- [ ] Revisión de `docs/security/...` y `route-access-matrix.md` si hubo cambios de autorización.

## Checklist durante deployment

- [ ] Deploy por orden controlado por entorno.
- [ ] Verificar `docker compose` / Kubernetes sin secretos reales.
- [ ] Verificar health (`/api/health/live` y/o `/api/health/ready`) en entorno de stage.
- [ ] Revisar alertas de errores 5xx y picos de rate limit al primer minuto.
- [ ] Validar sesión de usuarios críticos (auth + permisos).

## Checklist post-release

- [ ] Confirmar métricas baseline (errores, latencia P95, colas/alerts).
- [ ] Revisar logs por secretos/tokens expuestos.
- [ ] Validar que CI vuelve a pasar con etiquetas de versión.
- [ ] Cerrar riesgos pendientes (bloqueos de deuda técnica y TODO de auditoría).
- [ ] Programar verificación de segundo nivel 24 horas después (salud operativa).

## Rollback

1. Revertir PR en una ventana aprobada si hay regresión crítica.
2. Restaurar versión anterior del artefacto/imagen.
3. Ejecutar verificación de salud y smoke de auth/permisos.
4. Registrar causa, impacto y plan preventivo en issues.
5. Reabrir bloque de hardening correspondiente antes de nuevo despliegue.

## Referencias de ejecución

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`
- `pnpm build`
- `pnpm audit --audit-level=low`

## Notas

Esta lista no reemplaza políticas corporativas; complementa controles de CI, operaciones y seguridad.

## Estado vigente 2026-05-16

El entorno local/sandbox quedo validado funcionalmente. El documento fuente vigente es:

- `docs/production-readiness/ERP_PRODUCTION_READINESS.md`

Resumen:

- API local productiva `http://localhost:3002`: type-check/build/API tests OK.
- Web local productiva `http://localhost:3003`: type-check/build OK.
- E2E por verticales criticos OK.
- Smoke global UI por tramos OK, `146/146`.
- RBAC operativo por roles diarios OK con usuarios reales y `403` reales.
- Gate superadmin/tenants/RBAC/RLS OK: tenants nuevos nacen con 10 roles, 195 permisos, admin inicial logueable, usuario operativo validado y aislamiento A/B por API.
- Micro-gate final post-Gate21 OK:
  - wrapper `public.seed_operational_rbac_for_tenant` no ejecutable por `anon`/`authenticated`.
  - seed RBAC idempotente.
  - tenant C fresco operable.
  - paquete E2E critico `7/7`.
  - `outbox_events` sin `dead_letter`, `failed`, `pending` ni `processing`.
  - Redis real responde `PONG`.
- Checks administrativos finales OK:
  - `git diff --check`.
  - migraciones `312..326` sin prefijos duplicados.
  - `.env.local` ignorado por Git.
- Migraciones remotas pendientes aplicadas manualmente con `psql` el 2026-05-16.
- Pendientes reales antes de produccion: certificado SUNAT/OSE productivo, secretos productivos y email real si aplica.

### Riesgos abiertos reales

- Confirmar que el entorno productivo objetivo contiene las migraciones aplicadas manualmente el 2026-05-16.
- Confirmar que el entorno productivo contiene `322..326` para onboarding multi-tenant, seed RBAC operativo, hardening del wrapper RPC y reconciliacion outbox.
- Cargar certificado digital SUNAT/OSE productivo.
- Cargar secretos productivos finales.
- Configurar proveedor real de email si se usara correo en produccion.
- Ejecutar smoke final contra credenciales productivas reales.
- Confirmar CI verde en branch de integracion remoto; las validaciones locales ya estan documentadas.

### Infraestructura Docker/observabilidad 2026-05-16

- Compose local canonico validado con Web `13001`, API `13002`, Worker `3050`, Redis `6381`, Prometheus `9091`, Grafana `3300`.
- `docker compose --env-file .env -f docker-compose.yml up --build -d redis erp-api worker web redis-exporter node-exporter prometheus grafana`: OK.
- API/Web/Worker Docker build: OK.
- API, Web, Worker y Redis: `healthy`.
- Prometheus targets `erp-api`, `erp-worker`, `redis`, `node`, `prometheus`: `UP`.
- Grafana datasource/dashboard `ERP Infra Readiness`: API `200`.
- Grafana datasource query `up{job=~"erp-api|erp-worker|redis|node|prometheus"}`: todos `1`.
- `.dockerignore` endurecido; contexto Web medido en `10.82 MB`.
- Workflow `.github/workflows/infra.yml` agregado para Compose, Prometheus, dashboards JSON y build de imagenes.
- Riesgo menor documentado: Grafana `12.1.1` registra internamente plugin `table` duplicado al arrancar; no bloquea dashboards ni datasource.
- GPT Pro acepto `Infra Gate 22` como infraestructura local/sandbox lista.
- Pendiente no bloqueante: primera ejecucion remota de GitHub Actions o `workflow_dispatch` para confirmar runner real.

### Comandos mínimos para repetir antes de release real

- `pnpm --filter @erp-suite/erp-api run type-check`
- `pnpm --filter @erp-suite/web run type-check`
- `pnpm --filter @erp-suite/erp-api run build`
- `pnpm --filter @erp-suite/web run build`
- `pnpm --filter @erp-suite/erp-api run test -- --runInBand`
- `pnpm --filter @erp-suite/web exec playwright test tests/e2e/roles-operativos.spec.ts --project=chromium --workers=1`
- `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:3003 E2E_API_ORIGIN=http://localhost:3002 pnpm --dir apps/web exec playwright test tests/e2e/superadmin-tenant-rbac-rls.spec.ts --project=chromium --workers=1`
- `PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:3003 E2E_API_ORIGIN=http://localhost:3002 pnpm --dir apps/web exec playwright test tests/e2e/superadmin-tenant-rbac-rls.spec.ts tests/e2e/roles-operativos.spec.ts tests/e2e/usuarios-permisos-auditoria-config.spec.ts tests/e2e/auth-session-country-wizard.spec.ts --workers=1`
- Ejecutar el manifest E2E critico documentado en `ERP_PRODUCTION_READINESS.md`.
- Ejecutar smoke global UI por tramos para evitar timeouts falsamente verdes.
