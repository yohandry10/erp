# Operación, configuración y base de datos

## Requisitos

- Node.js 18 o superior.
- pnpm 9.
- Docker, si se usa el stack local.
- PowerShell para scripts operativos.
- Acceso Supabase sólo al entorno autorizado.

## Inicio local

```powershell
pnpm install
pnpm dev
```

Servicios principales:

- Web: `http://localhost:3001`.
- API: puerto definido por `PORT`.
- Supabase, Redis y observabilidad: según variables del entorno o Docker.

Comandos frecuentes:

```powershell
pnpm build
pnpm type-check
pnpm test
pnpm lint
pnpm test:ui-styles
pnpm check-encoding
pnpm desktop:dev
pnpm desktop:build
```

## Variables

Los esquemas de configuración en código son la fuente exacta. Categorías:

- API: `NODE_ENV`, `DEPLOYMENT_ENV`, `PORT`, CORS y URLs públicas.
- Supabase: URL, anon key, service-role key y conexión PostgreSQL.
- Redis/worker: host, puerto, credenciales y flags de jobs.
- Auth: secretos JWT, cookies y expiraciones.
- SUNAT/OSE: ambiente, SOL, certificado, RUC esperado y GRE REST.
- Stripe, correo, observabilidad y almacenamiento.

Reglas:

- No versionar secretos.
- DEV usa credenciales de DEV.
- PROD usa `.env.production` o secretos inyectados.
- El frontend sólo recibe variables `NEXT_PUBLIC_*` expresamente públicas.
- Logs y evidencia deben redactar tokens, passwords y claves.

## Contrato DEV/PROD

| Entorno | Project ref            | Datos                             |
| ------- | ---------------------- | --------------------------------- |
| DEV     | `hbueraexcbowpfnjlppi` | Sintéticos, QA y demos permitidos |
| PROD    | `wypnbcptofqdmoynlonq` | Sólo reales                       |

Antes de cualquier operación DB:

```powershell
.\scripts\db-environment-preflight.ps1 -Environment DEV
.\scripts\db-environment-preflight.ps1 -Environment PROD
```

Usar sólo el target correspondiente. No continuar si project ref, marca de
entorno o archivo de variables no coincide.

## Migraciones

1. Revisar `docs/CURRENT_STATE.md`.
2. Ejecutar el preflight del entorno.
3. Buscar prefijos duplicados:

```powershell
Get-ChildItem supabase\migrations -File |
  ForEach-Object { $_.Name.Split('__')[0] } |
  Group-Object |
  Where-Object Count -gt 1
```

4. Revisar SQL, dependencias, locks, RLS y rollback.
5. Respaldar antes de una promoción productiva.
6. Aplicar por orden y registrar evidencia.
7. Ejecutar validadores y comparar conteos.

No ejecutar SQL suelto de raíz contra PROD. Convertirlo primero en migración o
seed idempotente revisado.

## Baseline y reconstrucción DB

Las migraciones activas son la fuente principal. Los inventarios previos al reset
se conservaron fuera de la documentación en `artifacts/db-forensics/`.

Antes de borrar o reconstruir una base, consultar como mínimo:

- `db_forensic_baseline.md`
- `db_reconstruction_plan.md`
- `db_relations_catalog.csv`
- `db_tables_base_list.txt`
- `db_migration_numbering_report.txt`
- `db_migration_core_range_report.txt`
- `db_code_vs_relations_report.txt`
- `db_unmatched_table_references.txt`
- `db_rpc_vs_migrations_report.txt`
- `db_unmatched_rpc_references.txt`

Esos artefactos son forenses; pueden estar superados. Deben contrastarse con
`supabase/migrations/`, código actual y `docs/CURRENT_STATE.md`.

## Operaciones destructivas en PROD

Requisitos obligatorios:

1. Autorización explícita y alcance exacto.
2. Preflight PROD satisfactorio.
3. Respaldo verificable.
4. Script revisado e idempotente cuando aplique.
5. Transacción o estrategia de rollback.
6. Conteos y validadores antes/después.
7. Evidencia sin secretos.

Nunca realizar borrados amplios con rutas, tenants o filtros no resueltos.

## Health y observabilidad

La API expone health checks de proceso y dependencias según su configuración.
Validar al menos:

- proceso API;
- conexión PostgreSQL/Supabase;
- Redis y worker cuando estén habilitados;
- latencia y errores;
- jobs pendientes/fallidos;
- logs de seguridad y auditoría.

Los dashboards y alertas deben usar métricas estructuradas. Un health “OK” no
demuestra que los flujos funcionales estén listos.

## Pruebas operativas

Antes de promover:

```powershell
pnpm type-check
pnpm build
pnpm test:cov
pnpm test:ui-styles
pnpm test:quality
```

Según el cambio, añadir:

- Playwright E2E.
- Pruebas offline y build Tauri.
- Preflight SUNAT.
- Validadores SQL.
- Smoke por rol y tenant.
- Prueba de concurrencia/idempotencia.

### Cobertura

El suelo vive en `apps/erp-api/jest.config.js` y CI lo hace cumplir desde que el
job de tests ejecuta `pnpm test:cov`. Antes declaraba 80% pero Jest nunca lo
evaluaba: sin `--coverage`, el bloque `coverageThreshold` ni se lee.

Suelo actual: **32% líneas · 29% ramas · 30% funciones · 32% sentencias**. Es un
suelo, no una meta, y la regla es que puede subir pero nunca bajar. Dos tercios
del backend no los cubre ninguna prueba; conviene saberlo antes de confiar en un
verde.

Dónde subirla primero, por riesgo y no por facilidad: `modules/cpe/` (emisión y
afectación de IGV), `ple-export.service.ts` (libros electrónicos),
`modules/rrhh/planillas*` y `modules/finanzas/cxp|cxc`.

### Lo que no existe

- **Gherkin/BDD**: ningún `.feature`, ningún Cucumber.
- **Pruebas de mutación**: no hay Stryker; nada mide si las pruebas detectarían
  un cambio que rompa la lógica.
- **Métricas centralizadas**: no hay SonarQube. La cobertura se publica como
  artefacto de CI y en el resumen de cada ejecución.
- **Validación PLE contra SUNAT**: los TXT siguen la estructura del Anexo 2 y las
  pruebas fijan el número de campos, pero quien certifica que un archivo es
  válido es el validador PVS, que no se puede ejecutar en CI.

Los E2E corren en el workflow `e2e.yml`: lunes a viernes a las 07:00 UTC y a
petición. Sin los secrets `E2E_SUPABASE_URL` y `E2E_SUPABASE_SERVICE_ROLE_KEY`
el job se salta y lo dice, en vez de quedarse en rojo permanente: un job siempre
rojo se acaba ignorando, y deja de avisar el día que el fallo es real.

Conviene recordar qué **no** cazan las pruebas. La suite estaba verde mientras el
sistema adelantaba las fechas un día pasadas las 19:00, perdía las bases
exoneradas en el reporte de ventas y exportaba el Registro de Compras con los
importes corridos de casilla. Un verde dice que no se rompió lo ya cubierto; no
dice que el módulo funcione.

## Evidencia técnica

- `artifacts/audit-evidence/`: respuestas y manifests de smokes.
- `artifacts/db-forensics/`: inventarios y reportes de reconstrucción.
- `artifacts/load-tests/`: resultados de carga.

`artifacts/` no es documentación canónica. No debe entrar en la lectura inicial
de agentes y no se enlaza desde `docs/README.md` salvo una investigación forense.
