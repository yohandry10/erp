# Arquitectura canonica de bases DEV y PROD

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `arquitectura_canonica`.
>
> Leer tambien: `docs/ops/supabase-connection.md`, `docs/00_coordination/DECISIONS.md`, `docs/release/GO_LIVE_RUNBOOK.md`.
<!-- DOC-NAV:END -->

Fecha de actualizacion: 2026-08-06

Este documento es la fuente canonica para decidir que base usar. La separacion es fisica: son dos proyectos Supabase distintos y nunca se intercambian sus responsabilidades.

## Contrato de entornos

| Entorno | Supabase project ref | Archivo local canonico | Datos permitidos | API demo |
|---|---|---|---|---|
| DEV | `hbueraexcbowpfnjlppi` | `.env.local` y `apps/erp-api/.env` | Desarrollo y QA con datos sinteticos. No cargar datos reales productivos. | Puede habilitarse para pruebas internas |
| PROD | `wypnbcptofqdmoynlonq` | `.env.production` o secretos del deploy | Tenants reales y pruebas gratuitas comerciales aisladas por tenant. Se prohiben fixtures QA globales y datos sin tenant. | Puede habilitarse de forma explicita para la prueba gratuita |

La prueba gratuita comercial nace en PROD porque debe convertirse *in-place* en la cuenta real del cliente, conservando el mismo tenant y usuario. No equivale a un fixture QA: permanece marcada con `empresa_config.is_demo=true`, tiene permisos restringidos, datos sinteticos tenant-scoped y no puede emitir fiscalmente con credenciales reales. Al convertirla, la RPC atomica elimina los datos de prueba cuando el cliente elige empezar de cero, cambia la identidad del tenant, promueve su ADMIN y borra certificado/credenciales SUNAT demo antes de exigir configuracion real.

## Controles obligatorios

1. La migracion `346__deployment_environment_boundary.sql` crea `app.deployment_environment`, una marca singleton con entorno y `project_ref`.
2. `allow_demo_data` es un interruptor explicito, apagado por defecto. En PROD debe coincidir exactamente con `DEMO_API_ENABLED`; si esta apagado, los triggers rechazan `empresa_config.is_demo=true` y tenants DEMO/QA.
3. El backend exige `DEPLOYMENT_ENV`, compara `SUPABASE_URL` con `EXPECTED_SUPABASE_PROJECT_REF` y solo publica la prueba gratuita cuando `DEMO_API_ENABLED=true`.
4. `DemoController` aplica el interruptor y un limite de 5 altas por hora. La conversion y aprobacion administrativa permanecen tenant-scoped y auditables.
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
- PROD puede recibir exclusivamente el seed transaccional de una prueba gratuita creada por `DemoService`; no recibe fixtures QA, seeds globales ni datos sinteticos fuera del tenant demo.
- `ADMIN_DEMO` existe solo mientras `empresa_config.is_demo=true`; la conversion lo sustituye por `ADMIN` y limpia las restricciones/identidad demo.
- Los datos de clientes reales no se copian a DEV. Si una incidencia exige reproduccion, se usa un dataset sintetico o anonimizado.
- Todo borrado en PROD requiere autorizacion explicita, respaldo previo, transaccion y verificacion posterior.
- Los respaldos que incluyan `auth` son secretos operativos: quedan fuera de Git, con acceso restringido y eliminacion programada cuando termine la ventana de recuperacion.

## Estado vigente

El 2026-07-14 se purgaron fixtures QA antiguos de PROD. Esa limpieza no define la politica comercial vigente. Las migraciones `378` y `381` habilitaron posteriormente la prueba gratuita en PROD mediante interruptor explicito y alinearon el preflight. Verificacion read-only del 2026-08-06: `environment=PROD`, `allow_demo_data=true`, validador de entorno 5/5, 27 tenants demo, 2 tenants reales y 2 conversiones completadas conservando usuarios no-demo.
