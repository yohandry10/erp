# Límites de controladores de Contabilidad

<!-- DOC-NAV:START -->
> Navegación documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`.
>
> Rol de este archivo: `arquitectura_canonica`.
>
> Leer también: `docs/manuals/modules/FINANZAS_CONTABILIDAD.md`, `docs/security/route-access-matrix.md`, `docs/00_coordination/DECISIONS.md`.
<!-- DOC-NAV:END -->

Actualizado: 2026-07-15.

## Propósito

El prefijo HTTP público continúa siendo `/contabilidad`, pero sus 63 operaciones ya no viven en un único controlador. Cada controlador representa un recurso contable, conserva los guards `JwtAuthGuard` y `PermissionGuard`, y mantiene sin cambios los verbos, rutas, DTO, permisos y respuestas existentes.

El archivo `apps/erp-api/src/modules/contabilidad.controller.ts` es únicamente un barrel de compatibilidad. El registro real se realiza en `contabilidad/contabilidad.module.ts`.

| Controlador | Responsabilidad | Rutas |
|---|---|---:|
| `ContabilidadPeriodosController` | Períodos, cierre, reapertura y bloqueo | 8 |
| `ContabilidadPresupuestosController` | Presupuestos, ejecución, comparaciones y alertas | 11 |
| `ContabilidadCentrosCostoController` | CRUD, asientos y gastos por centro | 6 |
| `ContabilidadEstadosFinancierosController` | Estados, flujo, ratios y plan de cuentas | 11 |
| `ContabilidadAsientosController` | Creación, consulta y estadísticas de asientos | 6 |
| `ContabilidadLibrosController` | Libros, registros SUNAT y consignaciones | 16 |
| `ContabilidadEventosController` | Observabilidad y reintento de eventos contables | 5 |

## Reglas de evolución

- Una ruta nueva debe añadirse al controlador de su recurso y a `docs/security/route-access-matrix.md`.
- No crear otro controlador general de Contabilidad ni mover lógica de negocio desde servicios hacia controladores.
- Cada endpoint debe conservar permiso explícito con `@RequirePermission`.
- Si una responsabilidad no encaja en los siete grupos, se crea un controlador enfocado y se registra explícitamente en el módulo.
- Cambiar la clase o el archivo interno no autoriza cambiar el contrato HTTP.

## Compuertas mínimas

```powershell
pnpm --filter @erp-suite/erp-api type-check
pnpm --filter @erp-suite/erp-api exec eslint "src/modules/contabilidad.controller.ts" "src/modules/contabilidad/contabilidad.module.ts" "src/modules/contabilidad/controllers/*.ts"
pnpm --filter @erp-suite/erp-api build
pnpm --filter @erp-suite/erp-api exec jest --runInBand
```

Baseline del refactor: 63 rutas distribuidas en 7 controladores; ningún archivo resultante supera 1.000 líneas. No se realizaron operaciones DEV/PROD ni cambios de esquema.
