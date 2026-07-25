# QA funcional E2E con escrituras controladas

RECIBO DE LECTURA
- Base leida: START_HERE, CURRENT_STATE, FLOW_STATUS, AGENT_SYNC, ANTI_DUPLICATION_PROTOCOL, DECISIONS, DOC_NAVIGATION_MANIFEST.
- Fuente de dominio leida: `docs/manuals/modules/VENTAS_POS_FISCAL.md`, `docs/manuals/modules/COMPRAS_INVENTARIO.md`, `docs/manuals/modules/FINANZAS_CONTABILIDAD.md`, `docs/audits/2026-06-17-pos-sunat-print-readiness.md`, `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md`, `docs/auditoria_forense_contable_2026-05.md`.
- Busqueda anti-duplicacion ejecutada: `rg -n "flujos de escritura|funcional.*end-to-end|e2e.*funcional|POS.*ticket|smoke.*impresora|prueba.*concurrente|escrituras controladas|QA" docs apps test -g "*.md" -g "*.ts" -g "*.tsx"` y `rg -n "procesarVenta|abrirCaja|cerrarCaja|pos_registrar_venta|crearProveedor|crearOrden|cerrarRecepcion|registrar_cxc|cuentas_por_cobrar|cuentas_por_pagar|planillas|crear.*planilla|asientos|@Controller|@Post|@Get|@Put" apps\erp-api\src apps\web\tests test -g "*.ts" -g "*.tsx"`.
- Ya cerrado/no reanalizar: alineacion fiscal beta CPE/RA/RC, usuario SOL secundario, guard de PFX/RUC, GRE REST cableado pero bloqueado sin credenciales API SUNAT, navegacion por roles y validacion UI/CDP previa.
- Analisis propuesto: evidencia funcional de escrituras QA, POS/ticket/cierre/asiento, carga controlada y bloqueos externos restantes.

## Alcance

Entorno: API local `http://localhost:3002`, web local `http://localhost:3001`, tenant QA `c0af84b5-5ea6-44a9-9e6e-a869f119b013`.

Guard fiscal: no se hizo envio SUNAT produccion. El entorno se mantuvo en homologacion/QA y el smoke productivo fiscal sigue bloqueado por certificado RUC 20/autorizacion PFX y credenciales GRE REST si el contribuyente emitira guias.

## Resultado

Estado: **paso funcional QA para los flujos probados**. No equivale a certificacion SUNAT productiva ni a prueba de carga final del entorno destino.

Evidencia principal:

| Prueba | Resultado | Evidencia |
|---|---:|---|
| E2E compras vertical + RRHH completo | 2/2 OK, 2.6 min | comando `pnpm --filter @erp-suite/web exec playwright test tests/e2e/compras-vertical.spec.ts tests/e2e/rrhh-completo.spec.ts --project=chromium --reporter=line` con `TEST_APROBADOR_*` QA |
| E2E contabilidad completo post-migracion 344 | 1/1 OK, 4.5 min | comando `pnpm --filter @erp-suite/web exec playwright test tests/e2e/contabilidad-completo.spec.ts --project=chromium --reporter=line` con `TEST_APROBADOR_*` QA |
| Load read-only autenticado | 287/287 OK, 0 errores, 0 HTTP 429/5xx, p95 1802 ms, p99 2241 ms | `docs/audits/artifacts/functional-e2e-qa/load-read-20260617-212649.json` |
| POS concurrente + cierre | 5/5 respuestas OK, una sola venta DB, stock 5 -> 4, 1 movimiento inventario, caja cerrada, corte registrado, asiento POS_CIERRE registrado | `docs/audits/artifacts/functional-e2e-qa/concurrent-pos-write-close-20260617-214239.json` |
| Detalle contable de cierre POS | 3 lineas, debe 11.80, haber 11.80, cuadrado | `docs/audits/artifacts/functional-e2e-qa/pos-close-accounting-details-20260617-214323.json` |
| Ticket/PDF POS 80mm | PDF generado, 51016 bytes, `80mm x 160mm`, sin SUNAT produccion | `docs/audits/artifacts/functional-e2e-qa/pos-ticket-80mm-20260617-215431.pdf` y `.json` |

## Cambios aplicados

- `343__job_lock_rpc_security_definer_hardening.sql`: aplicado en la BD activa QA/DEV durante este smoke; actualizacion posterior 2026-06-18: tambien aplicado/verificado en PROD. `acquire_job_lock`/`release_job_lock` quedan `SECURITY DEFINER`, con `search_path` fijo y `EXECUTE` solo `service_role`. Tambien corrige que `acquire_job_lock` devolviera `true` cuando otro worker ya tenia el lock.
- Workers de outbox/contabilidad/POS: toleran falla de RPC de lock solo para errores de infraestructura/schema/permiso y siguen con claim idempotente por evento.
- `344__cxc_total_alias_runtime_alignment.sql`: aplicado en la BD activa QA/DEV durante este smoke; actualizacion posterior 2026-06-18: tambien aplicado/verificado en PROD. Agrega alias `cuentas_por_cobrar.total`, backfill y normalizador para alinear `registrar_cxc_pago_tx`.
- `CxcService`: mantiene fallback legacy solo si la RPC falta o el esquema no esta alineado, no como camino principal deseado.
- `CashReportsService`: `source_event_id` de cierre POS ahora es UUID deterministico derivado de `caja.cierre:<sesion>`, compatible con la columna real `uuid`.
- `CashReportsService`: detalles de asiento de cierre ya no intentan insertar `detalle_asientos.referencia`, columna que no existe en el esquema activo; ahora el asiento de cierre queda con cabecera y detalle cuadrado.

## Intento de aplicacion a PROD

Fecha: 2026-06-18.

Resultado original de este smoke: **no aplicado en PROD**. El intento se detuvo antes de ejecutar SQL porque en ese momento no existia una conexion productiva valida con los datos actuales del repo:

- `.env.production` solo contiene `DATABASE_URL`/`POSTGRES_URL` hacia `aws-0-us-west-2.pooler.supabase.com` con usuario `postgres.wypnbcptofqdmoynlonq`.
- `psql` contra ese pooler devolvio `FATAL: (ENOTFOUND) tenant/user postgres.wypnbcptofqdmoynlonq not found`.
- El host directo `db.wypnbcptofqdmoynlonq.supabase.co` resolvio solo IPv6; la red local devolvio `Network is unreachable`.
- `supabase projects list` con la CLI autenticada listo `hbueraexcbowpfnjlppi` (`erp-dev`) y `avvthqebakctnhdepbly` (`open-claw`), pero no `wypnbcptofqdmoynlonq`.

Conclusion operativa original: `343/344` debian aplicarse tambien al proyecto productivo real y quedaron pendientes en esta corrida.

Actualizacion posterior 2026-06-18: este bloqueo quedo cerrado. La conexion PROD de `.env.production` fue revalidada por `psql` contra `wypnbcptofqdmoynlonq` (Postgres 17.6) y se aplicaron/verificaron `343`, `344` y `345` en DEV y PROD. Ver evidencia vigente en `docs/audits/2026-06-18-supabase-advisor-security-hardening.md`, `docs/00_coordination/CURRENT_STATE.md` y `docs/ops/supabase-connection.md`.

## Bloqueos reales restantes

- **Smoke fiscal productivo:** bloqueado hasta tener certificado del RUC 20 o autorizacion escrita valida del PFX actual para el RUC `20616053575`, y hasta completar credenciales GRE REST si emitiran guias.
- **Impresora fisica real:** no ejecutada desde este entorno. Queda cubierto PDF/ticket 80mm con datos reales QA, pero falta prueba en una impresora termica del cliente.
- **Carga final del entorno destino:** la carga read-only y la concurrencia POS idempotente pasaron en QA local/API actual; falta stress mayor en infraestructura final con limites reales de Supabase/API/red.
- **Conexion PROD Supabase:** cerrado posteriormente el 2026-06-18 por `psql`; `342/343/344/345` ya estan aplicadas/verificadas en DEV y PROD. Mantener preflight `psql` read-only antes de nuevas migraciones productivas.

## Decision operativa

Se puede decir: **funcionalmente probado end-to-end en QA para los flujos cubiertos por codigo y datos de prueba**.

No se debe decir: **100% produccion SUNAT** hasta cerrar los bloqueos externos anteriores y ejecutar go-live controlado con CDR/acuse productivo.
