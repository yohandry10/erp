# Runbook de migración de data desde ERP externo

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `migracion_datos`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/CURRENT_STATE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Última actualización: 2026-07-24

Este runbook describe el proceso exacto para migrar la data operativa de un
cliente desde su ERP anterior hacia este ERP. Se ejecuta una sola vez por
cliente, en una ventana acordada. No reemplaza ningún manual de uso normal —
es solo para el corte inicial.

## Alcance del runbook

Cubre el camino feliz (golden path) y los rollbacks razonables. Lo que
**no** cubre:

- Migraciones desde formatos propietarios cerrados — la responsabilidad de
  generar los CSV en el formato esperado es del cliente o del integrador.
- Reconciliación de movimientos históricos contables: el balance de apertura
  es el corte; no se re-emiten asientos del histórico.
- Re-envío histórico a SUNAT/OSE: el importador de CPE histórico es de
  trazabilidad, no fiscal.

## Prerequisitos

1. Migraciones de BD `336__client_data_migration_external_id_and_audit.sql`
   y `337__client_migration_rls_rpc_hardening.sql` aplicadas. Para importar
   stock inicial también deben estar promovidas `347..352`, incluido el writer
   canónico `aplicar_movimiento_inventario_tx`. Al 2026-07-24, `347..352`
   están aplicadas solo en DEV; no ejecutar stock inicial en PROD antes de su
   promoción controlada.
2. Usuario con rol ADMIN en el tenant destino (los permisos `migration.*` se
   asignan automáticamente a ADMIN al aplicar la migración 336).
3. Token JWT del usuario ADMIN para llamadas a la API.
4. CSVs del cliente origen ya generados y validados localmente.

Verificación rápida de prerequisitos vía `psql`:

```powershell
$psql = "$env:USERPROFILE\supabase-cli\supabase.exe"
# Verificar migración 336 aplicada
psql --dbname="$env:POSTGRES_URL" -c "SELECT 1 FROM pg_indexes WHERE indexname = 'ux_clientes_tenant_external_id';"
# Verificar permisos migration.* en el tenant
psql --dbname="$env:POSTGRES_URL" -c "SELECT codigo FROM permisos WHERE tenant_id = '<tenant-id>' AND codigo LIKE 'migration.%';"
```

## Concepto: external_id

Cada fila del CSV debe traer un identificador estable del ERP origen en la
columna `external_id`. Ese identificador se persiste en la tabla destino y
queda como UNIQUE por `(tenant_id, external_id)`. Esto permite:

- Importar el mismo CSV dos veces sin duplicar (segunda vez = UPDATE).
- Linkear CxC/CxP/Stock/CPE a sus maestros (cliente, proveedor, producto) sin
  conocer los UUIDs internos del nuevo ERP — solo se necesitan los `external_id`.

Recomendación: usar el ID original del ERP fuente, prefijado por tipo, e.g.
`CLI-12345`, `PROV-789`, `PROD-0001`.

## Orden de ejecución obligatorio

```
1. Maestros           → clientes, proveedores, productos
2. Saldos iniciales   → balance de apertura (asiento contable),
                        CxC abiertas, CxP abiertas, stock inicial valorizado
3. Histórico (opcional)→ comprobantes (CPE) emitidos antes del corte
4. Validación final    → /api/migration/validar-apertura
```

No saltarse el orden. Si CxC se carga antes que clientes, las CxC quedan
huérfanas y el importer falla con `cliente con external_id="X" no existe`.

## Endpoints

Todos bajo `/api/migration/*`, autenticados (JWT) y bajo permiso explícito.
Aceptan el CSV como `fileBase64` (UTF-8 codificado en base64).

| Endpoint | Permiso | Propósito |
|---|---|---|
| `GET /migration/templates/:runType` | `migration.templates.read` | Descargar plantilla CSV |
| `POST /migration/preview` | `migration.preview` | Validar CSV sin escribir |
| `POST /migration/clientes/import` | `migration.clientes.import` | Importar clientes |
| `POST /migration/proveedores/import` | `migration.proveedores.import` | Importar proveedores |
| `POST /migration/cxc/import` | `migration.cxc.import` | Importar CxC abiertas |
| `POST /migration/cxp/import` | `migration.cxp.import` | Importar CxP abiertas |
| `POST /migration/balance-apertura/import` | `migration.balance_apertura.import` | Asiento de apertura |
| `POST /migration/stock-inicial/import` | `migration.stock_inicial.import` | Stock valorizado inicial |
| `POST /migration/comprobantes/import` | `migration.comprobantes.import` | CPE histórico (sin SUNAT) |
| `GET /migration/runs` | `migration.runs.read` | Listar runs anteriores |
| `GET /migration/runs/:id` | `migration.runs.read` | Detalle de un run + filas |
| `GET /migration/validar-apertura` | `migration.validar.read` | Validar cuadre post-import |

### `runType` aceptados

`clientes`, `proveedores`, `productos`, `plan_cuentas`, `cuentas_bancarias`,
`cxc_abiertas`, `cxp_abiertas`, `balance_apertura`, `stock_inicial`,
`comprobantes_historico`.

> `productos`, `plan_cuentas` y `cuentas_bancarias` no tienen importer
> dedicado en este release (336). Para `productos` use el endpoint preexistente
> `POST /import-export/catalogo/import`. `plan_cuentas` y `cuentas_bancarias`
> se crean por API individual o se importan en una iteración posterior.

### Cuerpo común de un import

```json
{
  "fileBase64": "<CSV codificado en base64 UTF-8>",
  "filename": "clientes_acme.csv",
  "fechaCorte": "2026-04-30",
  "totalDeclarado": 125000.00,
  "dryRun": false
}
```

- `fechaCorte` es **obligatorio** para `balance_apertura` y `stock_inicial`.
- `totalDeclarado` es opcional pero recomendado para `cxc_abiertas` y
  `cxp_abiertas` — habilita los checks `CHK_002` y `CHK_003` del validador.
- `dryRun: true` valida y cuenta sin escribir nada en BD. No crea
  `migration_runs`.

### Respuesta típica de un import

```json
{
  "runId": "uuid-del-run",
  "status": "completed" | "partial" | "failed",
  "result": {
    "totalRows": 1500,
    "okRows": 1497,
    "errorRows": 3,
    "skippedRows": 0,
    "created": 1450,
    "updated": 47,
    "errors": [
      { "rowIndex": 245, "externalId": "CLI-2034", "field": "numero_documento", "message": "RUC inválido: dígito verificador no coincide" }
    ]
  }
}
```

## Paso a paso

### Paso 1 — Maestros (clientes, proveedores, productos)

1. Descargar plantillas:

   ```powershell
   $headers = @{ Authorization = "Bearer $JWT" }
   Invoke-RestMethod -Uri "$API/migration/templates/clientes" -Headers $headers -OutFile clientes.csv
   Invoke-RestMethod -Uri "$API/migration/templates/proveedores" -Headers $headers -OutFile proveedores.csv
   ```

2. Llenar las plantillas con la data del ERP origen. Reglas:
   - `external_id` es obligatorio y único por archivo.
   - `numero_documento` valida formato SUNAT para RUC (mod 11) y 8 dígitos
     numéricos para DNI.
   - `email` se valida con formato; deje vacío si no aplica.

3. Validar antes de importar (dry run):

   ```powershell
   $csv = Get-Content clientes.csv -Raw -Encoding UTF8
   $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($csv))
   $body = @{ fileBase64 = $b64; runType = "clientes" } | ConvertTo-Json
   Invoke-RestMethod -Uri "$API/migration/preview" -Method Post -Headers $headers -Body $body -ContentType "application/json"
   ```

4. Importar si la preview no reporta errores:

   ```powershell
   $body = @{ fileBase64 = $b64; filename = "clientes_acme.csv"; dryRun = $false } | ConvertTo-Json
   Invoke-RestMethod -Uri "$API/migration/clientes/import" -Method Post -Headers $headers -Body $body -ContentType "application/json"
   ```

5. Verificar el `runId` y el detalle si hubo errores parciales:

   ```powershell
   Invoke-RestMethod -Uri "$API/migration/runs/$RUN_ID" -Headers $headers
   ```

Repetir 1-5 para `proveedores`.

Para productos, usar el importer existente:
`POST /import-export/catalogo/import` (ver `apps/erp-api/src/modules/import-export/import-export.service.ts`).

### Paso 2 — Saldos iniciales

#### 2.1 Balance de apertura (asiento contable)

CSV con columnas `cuenta_contable_codigo,debe,haber,centro_costo_codigo,descripcion`.
La suma de `debe` debe igualar la suma de `haber` para todo el archivo —
si no, el importer rechaza el archivo completo (es atómico).

Pasar `fechaCorte` en el body. Crea un único asiento `tipo_asiento='APERTURA'`
con `external_id='APERTURA-{fechaCorte}'`. Re-ejecutar con la misma
`fechaCorte` borra el asiento previo y lo recrea (idempotente).

#### 2.2 CxC abiertas

CSV referencia clientes por `external_id_cliente`. Cada fila crea un
documento en `cuentas_por_cobrar` con `metadata.origen='migracion_apertura'`,
estado `PENDIENTE` si `saldo_pendiente > 0`.

> Estos registros **no** disparan el evento `factura.emitida` y por lo tanto
> **no** generan asiento contable adicional. El balance contable de las CxC
> abiertas ya debe estar reflejado en el asiento de apertura (paso 2.1) en
> la cuenta correspondiente (típicamente 1212 / 12).

#### 2.3 CxP abiertas

Análogo a CxC, contra `proveedores` vía `external_id_proveedor`.

#### 2.4 Stock inicial valorizado

CSV:

```csv
external_id_producto,sucursal_id,almacen_id,cantidad,costo_unitario,descripcion
PROD-00001,00000000-0000-0000-0000-000000000000,00000000-0000-0000-0000-000000000000,120,8.50,Stock inicial
```

`external_id_producto`, `sucursal_id`, `almacen_id`, `cantidad` y
`costo_unitario` son obligatorios. `almacen_id` debe ser un UUID válido del
almacén físico destino; no existe almacén implícito ni fallback a `null`.
Cuando un producto tenga stock en más de un almacén, se carga una fila por
almacén.

El importer llama a `aplicar_movimiento_inventario_tx`, que actualiza
atómicamente la existencia física en `producto_existencias`, los agregados
derivados y el movimiento `ENTRADA` en `movimientos_inventario`, con
`referencia_tipo='MIGRACION_APERTURA_{fechaCorte}'`. No escribe directamente
en `producto_stock_sucursal`.

Idempotente: re-ejecutar omite filas ya importadas para la misma combinación
`(tenant, producto, sucursal, almacen, fecha_corte)`.

> El valor (`cantidad × costo_unitario`) debe estar reflejado en el asiento
> de apertura en la cuenta de existencias (típicamente 20 / 24).

### Paso 3 — CPE histórico (opcional)

Solo si el cliente quiere trazabilidad de comprobantes emitidos antes del
corte. Inserta filas en la tabla `cpe` con `estado='MIGRADO'`,
`metadata.no_sunat=true`, `metadata.no_evento_factura=true`. **Nunca** se
re-envían a SUNAT ni generan asiento (porque ya están en el balance de
apertura).

### Paso 4 — Validación post-migración

```powershell
Invoke-RestMethod -Uri "$API/migration/validar-apertura?fechaCorte=2026-04-30" -Headers $headers
```

Retorna 6 checks:

| Check | Descripción | Esperado |
|---|---|---|
| `CHK_001` | Asiento de apertura cuadrado (debe = haber) | OK |
| `CHK_002` | Suma CxC migradas = total declarado | OK / SKIP si no se declaró |
| `CHK_003` | Suma CxP migradas = total declarado | OK / SKIP si no se declaró |
| `CHK_004` | No hay runs estancadas >24h en `in_progress` | OK |
| `CHK_005` | Toda CxC migrada referencia un cliente válido del tenant | OK |
| `CHK_006` | Toda CxP migrada referencia un proveedor válido del tenant | OK |

Si todos están `OK` o `SKIP` (esperado), la migración está limpia.

## Rollback

Cada paso tiene rollback distinto:

| Paso | Rollback |
|---|---|
| Maestros | `DELETE FROM clientes WHERE tenant_id = '<t>' AND external_id IS NOT NULL`. **Cuidado**: cascada borra cotizaciones/pedidos/CxC asociados. Solo válido en pre-go-live. |
| Balance apertura | Re-ejecutar el import con un CSV vacío de filas para la misma `fechaCorte` no es suficiente; usar `DELETE FROM asientos_contables WHERE tenant_id='<t>' AND external_id='APERTURA-{fechaCorte}'` (el detalle cae por la operación). |
| CxC/CxP | `DELETE FROM cuentas_por_cobrar WHERE tenant_id='<t>' AND metadata->>'origen'='migracion_apertura'`. Idem CxP. |
| Stock inicial | No borrar movimientos ni recalcular proyecciones directamente. Si todavía no hubo operación posterior, revertir cada fila mediante un movimiento canónico `SALIDA` en el mismo `almacen_id`, ejecutado con `aplicar_movimiento_inventario_tx` y evidencia de la referencia de rollback. Si ya hubo operaciones, detener el rollback y conciliar inventario/contabilidad antes de ajustar. |
| CPE histórico | `DELETE FROM cpe WHERE tenant_id='<t>' AND estado='MIGRADO' AND metadata->>'origen'='migracion_historica'`. |

> Estos DELETEs son destructivos. Hacerlos solo si la migración aún no entró
> en producción operativa y el equipo legal/contable lo autoriza.

## Limitaciones conocidas (release 336)

- Importer dedicado solo para los tipos listados. `plan_cuentas`,
  `cuentas_bancarias` no tienen importer todavía — usar API individual.
- `movimientos_inventario` no tiene columna `external_id` (la idempotencia
  de stock inicial va por `(tenant, producto, sucursal, almacen, fecha_corte)`
  usando referencia y metadata).
- `cpe.external_id` no existe como columna; la idempotencia va por
  `(tipo_documento, serie, numero)` y `external_id` se guarda en `metadata`.
- No hay UI dedicada en `apps/web` — se opera por API directa o por scripts.
- El validador valida cuadre numérico, no consistencia fiscal. Para SIRE/PLE
  reales se necesita un cierre contable formal posterior.

## Lecturas relacionadas

- `supabase/migrations/336__client_data_migration_external_id_and_audit.sql`
- `apps/erp-api/src/modules/migration/`
- `docs/00_coordination/CURRENT_STATE.md` (estado canónico del proyecto)
- `docs/00_coordination/FLOW_STATUS.md` (matriz de flujos)
- `docs/release/GO_LIVE_RUNBOOK.md` (go-live productivo general)
