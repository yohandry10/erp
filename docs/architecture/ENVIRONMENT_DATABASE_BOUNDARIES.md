# Arquitectura canonica de bases DEV y PROD

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `arquitectura_canonica`.
>
> Leer tambien: `docs/ops/supabase-connection.md`, `docs/00_coordination/DECISIONS.md`, `docs/release/GO_LIVE_RUNBOOK.md`.
<!-- DOC-NAV:END -->

Fecha de actualizacion: 2026-07-14

Este documento es la fuente canonica para decidir que base usar. La separacion es fisica: son dos proyectos Supabase distintos y nunca se intercambian sus responsabilidades.

## Contrato de entornos

| Entorno | Supabase project ref | Archivo local canonico | Datos permitidos | API demo |
|---|---|---|---|---|
| DEV | `hbueraexcbowpfnjlppi` | `.env.local` y `apps/erp-api/.env` | Desarrollo, QA, demos y datos sinteticos. No cargar datos reales productivos. | Puede habilitarse de forma explicita |
| PROD | `wypnbcptofqdmoynlonq` | `.env.production` o secretos del deploy | Exclusivamente tenants y operaciones reales. Se prohiben demos, QA, seeds de prueba y usuarios sinteticos. | Siempre deshabilitada |

No existe un tercer significado para PROD. Una demo comercial se ejecuta contra DEV; PROD no es una base de demostracion.

## Controles obligatorios

1. La migracion `346__deployment_environment_boundary.sql` crea `app.deployment_environment`, una marca singleton con entorno y `project_ref`.
2. PROD tiene `allow_demo_data=false`. Triggers rechazan `empresa_config.is_demo=true` y tenants cuya identidad sea DEMO/QA.
3. El backend exige `DEPLOYMENT_ENV`, compara `SUPABASE_URL` con `EXPECTED_SUPABASE_PROJECT_REF` y rechaza `DEMO_API_ENABLED=true` en PROD.
4. `DemoController` bloquea endpoints demo si `NODE_ENV=production` o `DEPLOYMENT_ENV=PROD`, aun si una bandera fue activada por error.
5. El preflight de BD compara archivo local, URL, marca interna y politica de demos antes de operar.

```powershell
./scripts/db-environment-preflight.ps1 -Environment DEV
./scripts/db-environment-preflight.ps1 -Environment PROD
```

Ambos comandos deben terminar en `OK`. No aplicar migraciones, seeds, limpieza ni go-live si el preflight falla.

## Flujo estandar de cambios

1. Crear una unica migracion idempotente en `supabase/migrations/`.
2. Probarla primero en DEV.
3. Ejecutar validadores y pruebas funcionales en DEV.
4. Ejecutar el preflight PROD y obtener respaldo cuando el cambio toque datos.
5. Aplicar exactamente el mismo archivo en PROD con `ON_ERROR_STOP=1`.
6. Ejecutar validadores post-migracion y documentar evidencia y fecha.

Las migraciones son compartidas; los datos, secretos, usuarios y configuraciones operativas no lo son. Nunca copiar un dump completo de DEV hacia PROD.

## Reglas para datos

- DEV puede recrearse o limpiarse para QA conforme al baseline y protocolo del repositorio.
- PROD no recibe seeds demo ni cuentas `ADMIN_DEMO`.
- Los datos de clientes reales no se copian a DEV. Si una incidencia exige reproduccion, se usa un dataset sintetico o anonimizado.
- Todo borrado en PROD requiere autorizacion explicita, respaldo previo, transaccion y verificacion posterior.
- Los respaldos que incluyan `auth` son secretos operativos: quedan fuera de Git, con acceso restringido y eliminacion programada cuando termine la ventana de recuperacion.

## Estado vigente

El 2026-07-14 se detecto que PROD contenia exclusivamente 41 tenants QA/demo y 133 usuarios sinteticos. Con autorizacion del usuario se respaldo y purgo todo ese contenido. Estado posterior: `tenants=0`, `auth.users=0`, `storage.objects=0` y cero filas con `tenant_id` no nulo. Los validadores de entorno, contabilidad, inventario y tesoreria quedaron completamente verdes. La evidencia detallada esta en `docs/audits/2026-07-14-prod-demo-data-cleanup.md`.

