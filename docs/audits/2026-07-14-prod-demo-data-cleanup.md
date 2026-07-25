# Separacion DEV/PROD y limpieza de datos demo en PROD

Fecha: 2026-07-14

Alcance: proyectos Supabase DEV `hbueraexcbowpfnjlppi` y PROD `wypnbcptofqdmoynlonq`.

## Hallazgo

PROD contenia 41 tenants. Los 41 fueron clasificados como QA/demo por `empresa_config.is_demo`, prefijo/codigo QA-DEMO o nombre de prueba. Tambien existian 133 usuarios `auth.users` asociados; no habia objetos en Storage. No se encontro un tenant real que debiera conservarse.

La eliminacion simple de `public.tenants` no era suficiente: 27 relaciones heredadas usan `ON DELETE SET NULL`, lo que habria dejado datos demo huerfanos. La purga se hizo primero sobre todas las tablas base tenant-scoped, repitiendo en orden de dependencias hasta converger, y solo despues sobre `tenants` y `auth.users`.

## Respaldo previo

- `pg_dump` local 16 no pudo generar el dump nativo porque el servidor PROD es PostgreSQL 17.6.
- Se genero una exportacion logica previa de 82,687 filas: datos tenant-scoped de `public`/`app`, tenants y tablas base de `auth`.
- Artefacto local comprimido: `C:\Users\PC\AppData\Local\Temp\erp-prod-backups\20260714-225411\prod-demo-data-before-cleanup.zip`.
- Tamano CSV: 59,104,880 bytes. Tamano ZIP: 6,338,225 bytes.
- Tras verificar el resultado y cerrar la ventana operativa, el 2026-07-14 se elimino todo el directorio temporal `20260714-225411`, incluido el ZIP con material de `auth`. No queda respaldo local recuperable de los datos demo purgados.

## Ejecucion autorizada

La purga se ensayo primero dentro de una transaccion terminada en `ROLLBACK`. La ejecucion real uso guards exactos (`41/41` tenants y `133` usuarios), una sola transaccion y aborto ante cualquier tabla que no convergiera.

Resultado de purga tenant-scoped:

- ronda 1: 46,015 filas;
- ronda 2: 2,966 filas;
- ronda 3: 632 filas;
- ronda 4: 0 filas y 0 tablas pendientes;
- total eliminado antes de tenants/auth: 49,613 filas.

Luego se eliminaron 41 tenants y 133 usuarios de Auth, y se hizo `COMMIT` solo despues de verificar los contadores dentro de la transaccion.

## Estado posterior verificado

| Control | Resultado |
|---|---:|
| `public.tenants` | 0 |
| `auth.users` | 0 |
| `storage.objects` | 0 |
| filas base `public/app` con `tenant_id IS NOT NULL` | 0 |
| `validar_deployment_environment_runtime` PROD | 5/5 |
| `validar_accounting_production_compliance_runtime` | 5/5 |
| `validar_inventory_stock_reconciliation_runtime` | 6/6 |
| `validar_tesoreria_caja_bancos_runtime` | 11/11 |

Tambien se comprobo que PROD rechaza tanto un tenant `DEMO-*` como `empresa_config.is_demo=true`. En DEV el probe de tenant demo fue permitido y revertido, confirmando que la frontera no rompe el flujo de demostraciones.

## Remediacion permanente

- Migracion `346__deployment_environment_boundary.sql` aplicada a DEV y PROD.
- Marca DEV: `DEV / hbueraexcbowpfnjlppi / allow_demo_data=true`.
- Marca PROD: `PROD / wypnbcptofqdmoynlonq / allow_demo_data=false`.
- Guard de arranque en `env.schema.ts`, guard independiente en `DemoController` y preflight `scripts/db-environment-preflight.ps1`.
- Contrato canonico documentado en `docs/architecture/ENVIRONMENT_DATABASE_BOUNDARIES.md` y decision `DB-003`.
