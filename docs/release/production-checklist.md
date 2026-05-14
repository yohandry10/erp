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

## Estado de cierre del plan técnico (resumen ejecutivo)

- [x] P1.1 Config/env formal
- [x] P1.2 Auth global + `@Public`
- [x] P1.3 Matriz de permisos por módulo
- [x] P1.4 Eliminar tokens en `localStorage`
- [x] P1.5 Docker Node 20 consistente
- [x] P1.6 Frontend sin bypass de build
- [x] P2.1 CI real
- [x] P2.2 Tests multi-tenant
- [x] P2.3 Tests de permisos
- [x] P2.4 Rate limiting global
- [x] P2.5 Auditoría de service role
- [x] P2.6 Branch protection checklist
- [x] P2.7 Health/observabilidad
- [x] P2.8 Limpieza de logs sensibles
- [x] P2.9 Release/checklist final y hardening operativo local

### Riesgos abiertos (pendientes de cierre operativo)
- CI local ya ejecutada: `lint`, `type-check`, `test`, `build`, `audit --audit-level=low`; falta confirmar el mismo set en branch de integración remoto.
- Consolidar una corrida de e2e integrada (`apps/erp-api` + `apps/web`) para validar auth/session/rate-limit/health de extremo a extremo.
- Completar revisión de logs sensibles en módulos legacy/módulos no tocados directamente en P2.8.
- Ejecutar validacion DB runtime `000..301` cuando Docker Desktop/Supabase CLI esten disponibles.

### Comandos mínimos de validación para cierre de operación
- `pnpm --filter @erp-suite/erp-api test`
- `pnpm --filter @erp-suite/erp-api type-check`
- `pnpm --filter @erp-suite/erp-api build`
- `pnpm --filter @erp-suite/web lint`
- `pnpm --filter @erp-suite/web type-check`
- `pnpm --filter @erp-suite/web build`
- `pnpm audit --audit-level=low`
- `docker compose --env-file .env.example config --quiet`
