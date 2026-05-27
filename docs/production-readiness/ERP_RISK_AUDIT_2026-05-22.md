# Auditoria De Riesgos ERP Fiscal Multi-Tenant

Fecha de auditoria: 2026-05-22  
Modo: read-only sobre codigo, migraciones y documentacion.  
Entregable unico: `docs/production-readiness/ERP_RISK_AUDIT_2026-05-22.md`

## Decision Ejecutiva

Decision: **NO-GO para declarar produccion real fiscal multi-tenant en el estado actual del repo**.

El sistema muestra hardening importante: RLS por tenant, validadores runtime, outbox, idempotencia en varias tablas, `pos_registrar_venta_full_tx`, locks SQL, tests unitarios y type-check del backend en verde. Sin embargo, la auditoria encontro brechas de garantia que todavia pueden producir los escenarios que se quieren evitar:

- recepcion marcada `CERRADA` aunque el outbox contable falle;
- POS fuerte dependiente de una migracion posterior al readiness documentado, con fallback legacy menos atomico;
- rutas de inventario que se autodenominan atomicas pero hacen read/update desde TypeScript sin lock SQL;
- webhook Stripe con dedupe de fila, pero sin claim atomico antes de ejecutar efectos;
- calculo fiscal y monetario fragmentado entre SQL, servicios y configuracion;
- drift de documentacion/migraciones entre `326`, `327` y migraciones no trackeadas `328..330`.

Se recomienda tratar esto como **GO solo para sandbox/homologacion controlada**, no como alta productiva fiscal real.

## Alcance Ejecutado

En alcance revisado:

- POS, stock e inventario concurrente.
- Compras, recepciones, outbox y asientos contables.
- RLS, multi-tenant, service-role y clientes public/admin.
- SUNAT fiscal: IGV, detracciones, retenciones y dinero/redondeos.
- Idempotencia: POS, outbox, Stripe, CPE/GRE retries, CxC/CxP.
- RBAC y borrados sensibles.
- Performance/escalabilidad y evidencia de carga.
- Migraciones futuras, drift documental y readiness.

No ejecutado en esta pasada:

- Pruebas A/B reales de tenant contra base sandbox, porque no se recibieron credenciales/tenant fixtures autorizados para mutar datos y se evito tocar cualquier BD desconocida.
- Carga real de 100 usuarios, porque no hay harness de carga dedicado en el repo ni entorno sandbox levantado explicitamente para esta auditoria.
- Validacion tributaria legal definitiva. Se contrastaron reglas contra fuentes oficiales SUNAT, pero la conformidad fiscal final requiere contador/tributarista y homologacion real SUNAT/OSE.

## Revision Posterior De Exactitud

Revalidacion solicitada el 2026-05-22: esta auditoria **no fue linea por linea ni modulo por modulo**. Fue una auditoria dirigida por riesgo sobre las superficies criticas listadas. La certeza es alta para afirmaciones respaldadas por lineas concretas de codigo/SQL y media para impactos que requieren prueba dinamica de concurrencia o BD sandbox.

Errores o precisiones corregidas respecto a la primera version del informe:

- R-002: faltaba documentar que, ademas de `eventEmitter.emit(...)`, existe una segunda ruta best-effort via `EventBus` que puede volver a persistir `recepcion.registrada` en outbox desde `ContabilidadEventsListener`. El riesgo se mantiene porque ambas rutas ocurren despues de marcar la recepcion como `CERRADA` y el cierre no valida la existencia final de outbox/asiento antes de retornar exito.
- R-004: la primera redaccion mezclaba metodos legacy vivos con metodos sin call sites productivos directos encontrados. En el codigo activo revisado, el uso productivo confirmado es `devoluciones-proveedor.service.ts` llamando `InventarioService.descontarStock(...)`; `reservarStock(...)` y `liberarReserva(...)` aparecen como metodos y tests, pero no como call sites productivos directos bajo `apps/erp-api/src`.
- R-005: las referencias de linea de `demo.service.ts` estaban desactualizadas en el informe inicial. Se corrigieron a las lineas actuales.

## Matriz De Riesgos

| ID | Severidad | Riesgo | Estado |
|---|---:|---|---|
| R-001 | P0 | Drift de readiness/migraciones: repo llega a `330`, readiness documenta hasta `326` y `328..330` estan no trackeadas | Bloqueante |
| R-002 | P0 | Recepcion puede quedar `CERRADA` sin outbox/asiento durable | Bloqueante |
| R-003 | P1 | POS full transaction es fuerte, pero hay fallback legacy con menor atomicidad | Alto |
| R-004 | P1 | Ruta legacy de descuento de inventario usada en devoluciones y metodos legacy de reserva/liberacion sin lock SQL | Alto |
| R-005 | P1 | Stripe webhook no hace claim atomico antes de provisionar/convertir | Alto |
| R-006 | P1 | Calculo fiscal y dinero fragmentado, con hardcodes/fallbacks `0.18` | Alto |
| R-007 | P1 | Service role/public client tiene allowlist amplia para tablas sensibles | Alto |
| R-008 | P2 | Borrado hard-delete de clientes con cobertura parcial de dependencias | Medio |
| R-009 | P2 | No hay gate reproducible de 100 usuarios concurrentes | Medio |
| R-010 | P2 | Side effects POS best-effort pueden dejar estados contables/financieros incompletos | Medio |

## Hallazgos

### R-001 - Drift De Readiness Y Migraciones

Sintoma: el documento de readiness no representa el head actual del repo.

Evidencia:

- `docs/production-readiness/ERP_PRODUCTION_READINESS.md:3-5` fecha de corte 2026-05-16 y decision de sandbox/local.
- `docs/production-readiness/ERP_PRODUCTION_READINESS.md:158` lista `326__outbox_accounting_event_id_reconciliation.sql` como ultima migracion relevante.
- `docs/production-readiness/ERP_PRODUCTION_READINESS.md:232` dice `Migraciones 312..326: sin prefijos duplicados`.
- `supabase/migrations/327__pos_full_transaction_performance.sql` existe y define la ruta POS mas fuerte.
- `supabase/migrations/328__sesiones_caja_unique_abierta.sql`, `329__demo_tenant_pgcrypto_schema_fix.sql`, `330__demo_admin_operational_rbac_policy.sql` aparecen como untracked.
- Conteo estatico: `MigrationCount=327`, `Min=0`, `Max=330`, sin duplicados; huecos historicos `006..009`.

Consecuencia: cualquier declaracion production-ready basada en readiness hasta `326` queda obsoleta. Ademas, si `327` no esta aplicada en el runtime real, POS cae al fallback legacy.

Recomendacion: congelar migraciones, trackear o descartar explicitamente `328..330`, revalidar `000..330` en BD temporal con `ON_ERROR_STOP=1`, actualizar readiness y exigir evidencia de aplicacion remota por hash/nombre.

### R-002 - Recepcion Cerrada Sin Outbox/Asiento Durable

Sintoma: `cerrarRecepcion` actualiza stock y cambia estado a `CERRADA` antes de garantizar que el evento durable de outbox exista.

Evidencia:

- `apps/erp-api/src/modules/compras/services/recepciones.service.ts:444` inicia `cerrarRecepcion`.
- `recepciones.service.ts:500` usa `registrarEntradaStockAtomico` para inventario.
- `recepciones.service.ts:586-589` actualiza `recepciones.estado = 'CERRADA'`.
- `recepciones.service.ts:625-627` emite el evento despues del cierre.
- `recepciones.service.ts:903-917` intenta `eventEmitter.emit(...)`, pero el `catch` solo loguea el error.
- `recepciones.service.ts:920-925` emite en caliente via `eventBus.emitRecepcionRegistrada(...)`; esa ruta puede rescatar la persistencia, pero tambien ocurre despues del cierre.
- `apps/erp-api/src/shared/events/event-bus.service.ts:704` emite eventos en memoria.
- `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts:91-92` escucha `recepcion.registrada` y persiste otra vez en outbox.
- `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts:411-413` procesa `recepcion.registrada`.
- `contabilidad-events.listener.ts:1063` llama `asientosGenerator.generarAsientoCompra`.

Consecuencia: una recepcion puede quedar cerrada, con stock alterado, pero sin evento durable para CxP/SIRE/contabilidad si fallan o no se ejecutan las rutas post-cierre de outbox/EventBus. No basta con afirmar que falla un solo `eventEmitter.emit`; el punto bloqueante es que el cierre no valida el invariant final antes de retornar exito.

Recomendacion: convertir el cierre de recepcion y la insercion de outbox en una misma transaccion SQL/RPC o implementar un "closure invariant": no retornar exito si falta outbox detectable. Agregar reconciliador que busque `recepciones.estado='CERRADA'` sin `outbox_events`/asiento asociado.

### R-003 - POS Atomico Fuerte, Pero Fallback Legacy Debilita La Garantia

Sintoma: la ruta ideal existe en SQL, pero el servicio acepta degradar a contratos anteriores si `full_tx` no esta disponible.

Evidencia positiva:

- `supabase/migrations/327__pos_full_transaction_performance.sql:9-13` crea indice unico por `tenant_id/idempotency_key`.
- `327__pos_full_transaction_performance.sql:111-114` bloquea la sesion de caja con `FOR UPDATE`.
- `327__pos_full_transaction_performance.sql:182-185` bloquea productos con `FOR UPDATE`.
- `327__pos_full_transaction_performance.sql:207-210` rechaza `STOCK_INSUFICIENTE`.
- `327__pos_full_transaction_performance.sql:312` inserta `outbox_events`.

Evidencia de riesgo:

- `apps/erp-api/src/modules/pos/pos.service.ts:1109-1110` llama `pos_registrar_venta_full_tx`.
- `pos.service.ts:1114-1122` si PostgREST responde `PGRST202`, cae a `pos_registrar_venta_tx`.
- `pos.service.ts:1125-1139` puede caer a firma legacy sin `p_idempotency_key` ni `p_pagos`.
- `pos.service.ts:1187-1205` persiste impactos desde TypeScript si la RPC no los aplico.
- `supabase/migrations/310__pos_registrar_venta_session_caja_fix.sql:62-63` calcula IGV con `0.18`.

Consecuencia: el comportamiento productivo depende de que la migracion `327` este aplicada y visible en cache PostgREST. Si no, se usa una ruta de menor atomicidad y con calculos legacy.

Recomendacion: hacer `pos_registrar_venta_full_tx` requisito duro de arranque/readiness. Si falta, fallar el POS en modo cerrado en vez de degradar silenciosamente. Mantener fallback solo para migracion controlada, no para produccion.

### R-004 - Inventario Tiene Rutas Legacy No Atomicas

Sintoma: hay RPCs SQL con locks, pero tambien metodos de servicio que leen stock y luego actualizan sin `FOR UPDATE`.

Evidencia positiva:

- `supabase/migrations/014__rpc_compatibility_pack.sql:535-539` usa `FOR UPDATE` en `reservar_stock_atomico`.
- `014__rpc_compatibility_pack.sql:615-619` usa `FOR UPDATE` en `descontar_stock_atomico`.
- `014__rpc_compatibility_pack.sql:625-633` valida y descuenta sin permitir negativo.
- `apps/erp-api/src/modules/inventario/inventario.service.ts:625-640` usa RPC atomica para entrada de stock.

Evidencia de riesgo:

- `inventario.service.ts:289` define `reservarStock`.
- `inventario.service.ts:315-327` calcula disponible y `nuevoStockReservado` en memoria.
- `inventario.service.ts:329-333` actualiza `stock_reservado` desde TypeScript.
- `inventario.service.ts:373-415` libera reserva con read/update en servicio.
- `inventario.service.ts:458-504` descuenta stock con read/update en servicio.
- `inventario.service.ts:321-324` incluso advierte stock insuficiente, pero permite continuar.
- `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts:247` usa `descontarStock(...)` en un flujo productivo confirmado.
- En la revalidacion no se encontraron call sites productivos directos de `reservarStock(...)` ni `liberarReserva(...)` fuera de tests bajo `apps/erp-api/src`.

Consecuencia: dos procesos concurrentes pueden basarse en el mismo stock leido y descontar mal si entran por la ruta legacy confirmada o por cualquier exposicion futura de esos metodos. El riesgo de reserva/liberacion se mantiene como deuda tecnica, pero no como flujo productivo directo confirmado en esta revalidacion.

Recomendacion: prohibir rutas legacy para operaciones que cambian stock. Todo descuento/reserva/liberacion debe usar RPC con lock SQL y constraint de no negativo. Agregar test concurrente sobre cada entrypoint publico, no solo sobre RPC.

### R-005 - Stripe Webhook Sin Claim Atomico

Sintoma: existe dedupe por `stripe_session_id`, pero el procesamiento no toma ownership atomico antes de ejecutar side effects.

Evidencia positiva:

- `supabase/migrations/105__demo_conversion_integrity_constraints.sql:273-276` crea indice unico por `upper(stripe_session_id)`.
- `105__demo_conversion_integrity_constraints.sql:264` exige session en conversion pendiente.

Evidencia de riesgo:

- `apps/erp-api/src/modules/demo/webhook.controller.ts:35-40` procesa `checkout.session.completed`.
- `apps/erp-api/src/modules/demo/demo.service.ts:569-576` lee conversion con `estado='PENDIENTE'`.
- `demo.service.ts:583` ejecuta `completarConversion(...)`.
- `demo.service.ts:594-598` recien despues marca `COMPLETADA`.

Consecuencia: dos webhooks/reintentos concurrentes pueden leer la misma fila pendiente antes del update y ejecutar conversion/provisionamiento dos veces. El indice unico evita duplicar la fila pendiente, no evita doble ejecucion de side effects.

Recomendacion: crear RPC `claim_demo_conversion(session_id)` con `UPDATE ... WHERE estado='PENDIENTE' RETURNING *` o `SELECT ... FOR UPDATE SKIP LOCKED`, cambiar estado a `PROCESSING` antes de efectos y registrar idempotency ledger de Stripe event id/session id.

### R-006 - Calculo Fiscal Y Dinero Fragmentado

Sintoma: la tasa IGV y reglas de retencion/detraccion no salen de una unica fuente fiscal versionada.

Evidencia:

- `apps/erp-api/src/shared/utils/tax-calculator.ts:222` usa `data?.impuesto_principal_porcentaje || 0.18`.
- `tax-calculator.ts:244` fallback Peru `0.18`.
- `tax-calculator.ts:273-275` redondea con `Math.round`.
- `supabase/migrations/004__rpc_basics.sql:255-256` hardcodea `0.18`.
- `supabase/migrations/310__pos_registrar_venta_session_caja_fix.sql:62-63` hardcodea `0.18`.
- `supabase/migrations/327__pos_full_transaction_performance.sql:127-132` toma `empresa_config.igv_porcentaje`, pero vuelve a fallback `0.18`.
- `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts:1138-1147` calcula retencion/percepcion/detraccion por flags/tasas de cliente/config.
- `apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts:354-360` mantiene retenciones/percepciones/detracciones como validacion futura comentada.
- `apps/erp-api/src/modules/finanzas/tesoreria/tesoreria.service.ts:1043-1044` usa `Math.round` para dinero, mientras CxC/CxP usan `decimal.js`.

Contraste SUNAT:

- SUNAT indica tasa aplicable IGV 18% para 2026, pero tambien muestra composicion IGV/IPM y operaciones exoneradas/inafectas: https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/impuesto-general-las-ventas
- SUNAT detracciones no es una tasa unica: depende de bien/servicio/anexo y puede ser 4%, 10%, 12%, 15%, etc.: https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/sistema-detracciones-igv
- SUNAT retencion IGV aplica 3% sobre precio de venta/pago y tiene exclusiones, por ejemplo cuando corresponde detraccion: https://orientacion.sunat.gob.pe/06-preguntas-frecuentes-regimen-de-retenciones
- SUNAT cuarta categoria 2026 tiene umbrales y retencion 8% cuando corresponde: https://personas.sunat.gob.pe/trabajador-independiente/suspension-retenciones

Consecuencia: los tests pueden validar el mismo calculo incorrecto. Una regla fiscal duplicada o vieja puede generar CPE, CxC, CxP, SIRE o contabilidad con importes distintos.

Recomendacion: definir motor fiscal unico versionado por pais/regimen/fecha/tipo operacion/anexo SUNAT. Prohibir `0.18` fuera de seeds o fixtures. Usar `Decimal`/numeric en todos los calculos monetarios y pruebas golden con casos SUNAT.

### R-007 - Service Role/Public Client Con Allowlist Amplia

Sintoma: el `getPublicClient()` usa `service_role` y bypass de tenant antes de login, protegido por allowlist, pero la allowlist contiene tablas sensibles.

Evidencia:

- `apps/erp-api/src/shared/supabase/supabase.service.ts:11-25` allowlist incluye `auth_login_attempts`, `user_roles`, `usuarios_sistema`, `user_sessions`, `outbox_events`, `empresa_config`, `tenants`, `integration_logs`, `audit_log`, `demo_conversiones_pendientes`.
- `supabase.service.ts:256-260` documenta que el cliente publico no valida tenant y usa service role key.
- `supabase.service.ts:288-301` bloquea tablas/RPCs fuera de allowlist.
- `supabase.service.ts:307-312` expone `getAdminClient()` para auth admin.

Consecuencia: no se encontro una fuga directa en esta pasada, pero el blast radius de cualquier uso incorrecto de `getPublicClient()` es alto porque bypassa RLS. Para un ERP multi-tenant, esto debe tener pruebas A/B directas y revisiones por cada caller.

Recomendacion: reducir allowlist a tablas realmente publicas, mover operaciones pre-login sensibles a RPCs con contrato minimo, loggear todos los usos de public/admin client y crear test A/B que intente leer por ID cross-tenant en cada tabla sensible.

### R-008 - Hard Delete De Clientes

Sintoma: el endpoint de eliminar cliente tiene permiso, pero borra fisicamente y solo revisa algunas dependencias.

Evidencia:

- `apps/erp-api/src/modules/ventas/clientes/clientes.controller.ts:133-145` expone `DELETE /ventas/clientes/:id` con `@RequirePermission('ventas.clientes.eliminar')`.
- `apps/erp-api/src/modules/ventas/clientes/clientes.service.ts:300-322` valida dependencias en `cotizaciones` y `pedidos_venta`.
- `clientes.service.ts:326-331` hace `.from('clientes').delete().eq('id').eq('tenant_id')`.

Consecuencia: si permisos quedan mal sembrados o un rol operativo recibe `ventas.clientes.eliminar`, puede perderse maestro de cliente. Ademas, la validacion no cubre explicitamente todos los enlaces fiscales/financieros posibles como CPE, CxC, pagos o POS.

Recomendacion: cambiar policy funcional a soft delete/inactivacion con auditoria, impedir hard delete de maestros referenciables y agregar tests de rol `VENDEDOR/CAJERO` contra deletes sensibles.

### R-009 - No Hay Gate Reproducible De 100 Usuarios

Sintoma: hay indices/performance work y observabilidad, pero no se encontro harness dedicado de carga.

Evidencia:

- `package.json` y `apps/erp-api/package.json` no contienen scripts `k6`, `artillery`, `autocannon`, `stress` o equivalentes.
- `rg --files | rg "(k6|artillery|autocannon|load|performance|stress|soak)"` encontro migraciones y docs, no un test de carga ejecutable.
- Existen indices de performance (`030`, `034`, `043`, `304`, `327`) y observabilidad, pero eso no sustituye una corrida de concurrencia.

Consecuencia: no hay evidencia reproducible de que login, dashboard, POS, clientes, compras y CPE soporten 100 usuarios concurrentes con p95 aceptable y sin 500 sostenidos.

Recomendacion: agregar suite de carga versionada con escenarios criticos, datos sandbox y umbrales: error rate, p95, saturacion worker/outbox, conexiones DB y latencia por endpoint.

### R-010 - Side Effects POS Best-Effort

Sintoma: luego de la venta POS se ejecutan side effects que pueden fallar sin bloquear la venta.

Evidencia:

- `apps/erp-api/src/modules/pos/pos.service.ts:1511-1514` loguea error creando CxC y no bloquea la venta.
- `pos.service.ts:1518-1522` emite `eventBus.emitVentaProcessed` en side effect diferido.
- `pos.service.ts:2193-2208` `rollbackVenta` borra detalles/outbox/venta si falla impacto critico.

Consecuencia: una venta puede quedar procesada con stock actualizado pero sin CxC, evento caliente o trazabilidad completa. El rollback tambien puede borrar outbox, reduciendo evidencia forense si ocurrio un fallo parcial.

Recomendacion: separar efectos no criticos de efectos contables/financieros. Para credito, no retornar exito si no hay CxC o outbox compensatorio durable. Mantener outbox como auditoria, no borrarlo en rollback sin registro compensatorio.

## Controles Positivos Encontrados

- POS `full_tx` tiene locks SQL, idempotencia y rechazo de stock insuficiente en `327`.
- Contabilidad tiene indice unico por `tenant_id/source_event_id` en `312`.
- Outbox tiene guard contra degradar `completed` a `failed/dead_letter` en `318`.
- `326` reconcilia eventos historicos `dead_letter` y alinea `source_event_id`.
- `getClient()` exige contexto tenant y hay hardening RLS extensivo en migraciones.
- Tests especificos existen para POS full_tx, fallback, idempotencia y recepcion outbox.
- `pnpm --filter @erp-suite/erp-api type-check` pasa.
- Jest acotado POS/recepciones pasa: 2 suites, 36 tests.

## Comandos Y Verificaciones Usadas

Comandos principales:

```powershell
rg -n "pos_registrar_venta_full_tx|pos_registrar_venta_tx|PGRST202|persistirImpactosVentaPOS" apps/erp-api/src/modules/pos/pos.service.ts -C 4
rg -n "CREATE OR REPLACE FUNCTION public\.pos_registrar_venta_full_tx|FOR UPDATE|STOCK_INSUFICIENTE|outbox_events" supabase/migrations/327__pos_full_transaction_performance.sql -C 3
rg -n "async cerrarRecepcion|estado: 'CERRADA'|eventEmitter\.emit|catch \(emitError\)" apps/erp-api/src/modules/compras/services/recepciones.service.ts -C 4
rg -n "async reservarStock|async descontarStock|stock_reservado|stock_actual" apps/erp-api/src/modules/inventario/inventario.service.ts -C 4
rg -n "checkout\.session\.completed|procesarPagoExitoso|stripe_session_id|ux_demo_conv_stripe_session" apps/erp-api/src/modules/demo supabase/migrations/105__demo_conversion_integrity_constraints.sql -C 5
rg -n "0\.18|Math\.round|retencion|detraccion|percepcion" apps/erp-api/src supabase/migrations -S
pnpm --filter @erp-suite/erp-api exec jest --runTestsByPath src/modules/pos/pos.service.spec.ts src/modules/compras/services/recepciones.service.spec.ts --runInBand
pnpm --filter @erp-suite/erp-api type-check
```

Resultados de verificacion:

- Jest POS/recepciones: `PASS`, 2 suites, 36 tests.
- TypeScript backend: `tsc -p tsconfig.json --noEmit`, OK.
- Migraciones: `Min=0`, `Max=330`, sin prefijos duplicados; huecos historicos `006..009`; `328..330` untracked.
- Primer intento de Jest via `pnpm test -- --runTestsByPath` fallo por parsing de opciones de pnpm; se reemplazo por `pnpm exec jest`.

## Fuentes SUNAT Consultadas

- IGV SUNAT, consultado 2026-05-22: https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/impuesto-general-las-ventas
- Detracciones SUNAT, consultado 2026-05-22: https://emprender.sunat.gob.pe/principales-impuestos/impuesto-general-las-ventas-igv/sistema-detracciones-igv
- Retenciones IGV SUNAT, consultado 2026-05-22: https://orientacion.sunat.gob.pe/06-preguntas-frecuentes-regimen-de-retenciones
- Suspension retenciones cuarta categoria SUNAT 2026, consultado 2026-05-22: https://personas.sunat.gob.pe/trabajador-independiente/suspension-retenciones

## Siguiente Gate Recomendado

Antes de reconsiderar `GO` productivo:

1. Reconciliar y aplicar limpiamente `000..330` en BD temporal, con readiness actualizado.
2. Hacer obligatorio `pos_registrar_venta_full_tx`; sin esta RPC, POS no debe vender.
3. Cerrar la brecha de recepcion: `CERRADA` y outbox/asiento deben ser una unidad verificable.
4. Eliminar rutas no atomicas de inventario o bloquearlas para produccion.
5. Hacer claim atomico de webhook Stripe antes de side effects.
6. Centralizar motor fiscal/dinero y remover hardcodes `0.18` fuera de seeds/fixtures.
7. Ejecutar A/B multi-tenant real y prueba de carga 100 usuarios en sandbox con datos desechables.
