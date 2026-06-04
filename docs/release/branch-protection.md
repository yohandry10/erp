# Branch protection de `main` (Checklist técnico)

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `release`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Objetivo
Estandarizar reglas mínimas de gobierno para que sólo cambios revisados y validados en CI lleguen a producción.

## Requisitos obligatorios en GitHub (Branch protection)

1. `main` con protección:
  - Require pull request before merging.
  - Require at least 1 aprobación de revisión.
  - Require review conversations to be resolved.
  - Require status checks to pass antes de merge:
    - `lint`
    - `type-check`
    - `test`
    - `build`
    - `audit`
  - Require branches up to date before merge.
  - Require linear history (opcional recomendado).
  - Restrict pushes to `main` (no force push).
  - Require conversation resolution de comentarios de PR.
  - (Opcional) Require signed commits si la política org lo exige.
2. Mantener historial auditado:
  - CODEOWNERS en carpetas con dominio sensible (`apps/erp-api`, `apps/web`, `docs/security`, `.github/workflows`).
  - Revisión obligatoria de cambios en secretos, auth y CI.
3. Seguridad continua:
  - Mantener Dependabot/Code Scanning habilitados.
  - Rotación de secretos/documentar incidencia cuando cambie el contrato de tokens.

## Validación manual sugerida

- Confirmar que `main` no permite `git push` directo en UI.
- Confirmar que PR sin checks en verde no permite merge.
- Confirmar que un PR con comentarios no resueltos queda bloqueado.
- Confirmar que un merge con force-push/rewrites no es posible en rama protegida.

## Excepciones
- Cambios de documentación no críticos pueden tener flujo más liviano según política interna.
- Cualquier excepción de bypass debe resolverse con ticket y aprobación explícita de arquitectura.

## Checklist de habilitación (lista de tareas)
- [ ] Ajustar reglas en Settings → Branches.
- [ ] Asociar checks de CI exactos.
- [ ] Activar “Dismiss stale reviews when new commits are pushed”.
- [ ] Configurar restricciones de push para usuarios no autorizados.
- [ ] Revisar `CODEOWNERS` vigente.
