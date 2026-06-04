# Ejecucion Forense — Interconexiones de Modulos

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_contexto_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

**Fecha inicio:** 2026-05-19
**Estado:** ✅ COMPLETADO — Flujo 2, Flujo 1, Flujo 3 todos COMPLETADOS
**Plan base:** `FORENSIC-INTERCONEXIONES-PLAN.md`
**Protocolo:** Fix uno por uno, tests despues de cada cambio, TSC, no regresiones, documentar TODO.

---

## BASELINE

| Check | Estado |
|-------|--------|
| Full test suite | **948/948** (verificado al inicio y post-fixes) |
| TSC backend | 0 errores |
| TSC frontend | 0 errores |

---

## FLUJO 2: COMPRAS END-TO-END ✅ COMPLETADO

### Cadena analizada
```
Cotizacion Compra → Orden Compra → Aprobar OC → Recepcion → CxP → Pago CxP → Contabilidad
                                                    ↓
                                               Inventario (stock++)
```

---

### HALLAZGO C1: ¿Duplicacion CxP en recepciones?

**Hipotesis**: `recepcion.registrada` tiene 2 consumers que ambos crean CxP:
- `ComprasCxpIntegrationService` (compras/services/compras-cxp-integration.service.ts:32)
- `CxpEventsListener` (finanzas/cxp/listeners/cxp-events.listener.ts:22)

**Veredicto: FALSO POSITIVO**

El `ComprasCxpIntegrationService` es un servicio **LEGACY** que solo se activa con la variable de entorno `CXP_LEGACY_COMPRAS_INTEGRATION=true`. Por defecto, hace `return` inmediato y delega al `CxpEventsListener` canonico.

**Triple proteccion contra duplicacion:**
1. Guard de variable de entorno (solo uno ejecuta)
2. idempotency_key en el insert
3. Catch semantico si ya existe

**Accion requerida:** NINGUNA.

---

### HALLAZGO C2: ¿compra.entregada vs recepcion.registrada duplican stock?

**Veredicto: FALSO POSITIVO**

- `recepciones.service.ts` maneja stock DIRECTAMENTE en `cerrarRecepcion()` via `registrarEntradaStockAtomico()`
- `emitirEventoCompraEntregada` (que setea `inventarioAplicado: true`) es **dead code** — nunca se llama desde `cerrarRecepcion`
- El flujo legacy (`compras.controller.ts:383`) SI emite `compra.entregada` pero es una ruta separada
- Los dos flujos (legacy vs recepciones.service) NO se ejecutan para la misma recepcion

---

### HALLAZGO C3: Evento `orden.compra.aprobada` huerfano

**Veredicto: NO ACCIONABLE** — Evento de extensibilidad/notificacion. Flujo OC→Recepcion es manual.

---

### HALLAZGO C4: Devolucion proveedor — flujo reverso

**Veredicto: CORRECTO** — Flujo reverso completo: stock-- via `descontarStock()`, CxP reversa via `CxpEventsListener`, idempotencia via `idempotency_key`.

**Hallazgo secundario**: 24 console.log encontrados → **FIXED** (ver C7).

---

### HALLAZGO C5: Idempotencia en cerrarRecepcion

**Veredicto: CORRECTO** — 4 capas de proteccion:
1. Estado guard: `if (recepcion.estado !== 'BORRADOR')`
2. Movimiento existente: Query a `movimientos_inventario` por referencia
3. Stock atomico: `registrarEntradaStockAtomico` (RPC transaccional)
4. Optimistic concurrency: `.eq('cantidad_recibida', cantidadRecibidaAnterior)`

---

### HALLAZGO C6: tenant_id en queries cross-module

**Contexto RLS**: Las tablas tienen RLS ENABLED + FORCED, pero `service_role_key` tiene BYPASSRLS. Queries sin `.eq('tenant_id')` NO estan protegidas.

**Gap encontrado y FIXED**:
- `recepciones.service.ts:662-665` — `actualizarEstadoOrden()` SELECT sin tenant_id

**Otros gaps (riesgo MUY BAJO, no fixed)**:
- Linea 250: devolucion_items (mitigado por filtro en app code linea 266)
- Lineas 842, 947: queries de enriquecimiento de eventos (solo lectura, UUIDs)

---

### HALLAZGO C7: console.log en devoluciones-proveedor.service.ts — FIXED

24 instancias reemplazadas con `this.logger.log/error/warn`.

---

### HALLAZGO C8: Dead code + gap KPIs dashboard

- `emitirEventoCompraEntregada` en `recepciones.service.ts:932` es dead code (nunca llamado)
- `FinancialIntegrationService` solo actualiza KPIs via `compra.entregada` (legacy)
- **GAP MEDIO**: KPIs dashboard no se actualizan en flujo nuevo

**Decision**: NO fixear. Documentado como mejora futura.

---

### RESUMEN FLUJO 2

| ID | Hallazgo | Veredicto | Accion |
|----|----------|-----------|--------|
| C1 | Duplicacion CxP | **FALSO POSITIVO** | Ninguna |
| C2 | Duplicacion stock | **FALSO POSITIVO** | Ninguna |
| C3 | orden.compra.aprobada huerfano | **NO ACCIONABLE** | Ninguna |
| C4 | Devolucion flujo reverso | **CORRECTO** | Ninguna |
| C5 | Idempotencia cerrarRecepcion | **CORRECTO** | Ninguna |
| C6 | tenant_id gap | **FIXED** | `.eq('tenant_id')` agregado |
| C7 | 24x console.log | **FIXED** | Logger de NestJS |
| C8 | Dead code + KPI gap | **GAP MEDIO** | Mejora futura |

---

## FLUJO 1: VENTAS END-TO-END ✅ COMPLETADO

### Cadena analizada
```
Cotizacion → Pedido → Confirmar → Facturar → CPE → CxC → Cobro → Contabilidad
                         ↓
                    Inventario (stock--)
```

---

### HALLAZGO V1: tenant_id gap en delete de detalle pedido — FIXED

**Ubicacion**: `pedidos.service.ts:619`
```typescript
// ANTES:
await client.from('pedidos_venta_detalle').delete().in('id', idsAnteriores);
// DESPUES:
await client.from('pedidos_venta_detalle').delete().eq('tenant_id', tenantId).in('id', idsAnteriores);
```

**Riesgo real**: MUY BAJO (IDs son UUIDs de items recien cargados del mismo pedido tenant-validado). Fix aplicado como defense-in-depth.

---

### HALLAZGO V2: tenant_id gap en rollback de documento — FIXED

**Ubicacion**: `pedidos.service.ts:2338`
```typescript
// ANTES:
await client.from('documentos').delete().eq('id', documento.id);
// DESPUES:
await client.from('documentos').delete().eq('id', documento.id).eq('tenant_id', tenantId);
```

**Riesgo real**: MUY BAJO (documento.id fue recien creado en la misma funcion). Fix aplicado como defense-in-depth.

---

### HALLAZGO V3: 43x console.log en pedidos.service.ts — FIXED

Logger ya existia (`private readonly logger = new Logger(PedidosService.name)`). Reemplazados 43 console.log/error/warn → this.logger.log/error/warn.

---

### HALLAZGO V4: 30x console.log en cotizaciones.service.ts — FIXED

Agregado `Logger` import + instancia. Reemplazados 30 console.log/error → this.logger.log/error.

---

### HALLAZGO V5: 21x console.log en financial-integration.service.ts — FIXED

Agregado `Logger` import + instancia. Reemplazados 21 console.log/error → this.logger.log/error.

---

### HALLAZGO V6: 7x console.log en event-bus.service.ts — FIXED

Agregado `Logger` import + instancia. Reemplazados 7 console.log/error → this.logger.debug/error (debug para EventBus por volumen).

---

### HALLAZGO V7: RPC `reservar_stock_atomico` sin p_tenant_id

**Investigacion**: La funcion RPC extrae tenant_id directamente del producto (`SELECT tenant_id FROM productos WHERE id = p_producto_id FOR UPDATE`).

**Veredicto: FALSO POSITIVO** — Tenant isolation correcta via producto lookup.

---

### HALLAZGO V8: CxC factura listener error handling

**Investigacion**: `cxc-factura.listener.ts` tiene:
- Logger (no console.log) ✓
- try-catch en handlers ✓
- Idempotencia via `idempotency_key` ✓
- tenant_id en todas las queries ✓
- Manejo de CPE anulado con reversa ✓

**Veredicto: CORRECTO** — Sin issues.

---

### HALLAZGO V9: Secuencia de emision de eventos en generarFactura

En `generarFactura()` se emiten 2 eventos secuencialmente:
1. `factura.emitida` (linea 1715) → crea CxC
2. `venta.procesada` (linea 1736) → genera asiento contable

Si el primero falla, el segundo no se ejecuta. Pero ambos van a outbox (durabilidad). Y la emision en caliente es fire-and-forget.

**Veredicto: RIESGO BAJO** — Outbox garantiza consistencia eventual.

---

### HALLAZGO V10: Cotizacion → Pedido conversion

Usa RPC transaccional `convertir_cotizacion_a_pedido` con `p_tenant_id`. Tiene fallback manual con retry.

**Veredicto: CORRECTO** — Atomico y resiliente.

---

### RESUMEN FLUJO 1

| ID | Hallazgo | Veredicto | Accion |
|----|----------|-----------|--------|
| V1 | tenant_id gap en delete detalle | **FIXED** | Defense-in-depth |
| V2 | tenant_id gap en rollback doc | **FIXED** | Defense-in-depth |
| V3 | 43x console.log pedidos | **FIXED** | Logger |
| V4 | 30x console.log cotizaciones | **FIXED** | Logger |
| V5 | 21x console.log financial-integration | **FIXED** | Logger |
| V6 | 7x console.log event-bus | **FIXED** | Logger (debug) |
| V7 | RPC sin tenant_id param | **FALSO POSITIVO** | Ninguna |
| V8 | CxC listener error handling | **CORRECTO** | Ninguna |
| V9 | Secuencia eventos facturacion | **RIESGO BAJO** | Outbox mitiga |
| V10 | Cotizacion→Pedido atomicidad | **CORRECTO** | Ninguna |

---

## FLUJO 3: INTEGRACION CONTABLE GLOBAL ✅ COMPLETADO

### Archivos analizados
| Componente | Archivo | LOC |
|------------|---------|-----|
| Contabilidad Listener | `contabilidad/listeners/contabilidad-events.listener.ts` | 1401 |
| Asientos Generator | `contabilidad/services/asientos-generator.service.ts` | ~1340 |
| Accounting Entries (shared) | `shared/integration/accounting-entries.service.ts` | 851 |
| Outbox Service | `shared/outbox/outbox.service.ts` | 201 |
| Outbox Worker | `shared/outbox/outbox-worker.service.ts` | 237 |

---

### RESPUESTAS A LAS 6 PREGUNTAS CLAVE

#### P1: ¿Pago CxP genera asiento contable?
**SI.** `cxp.service.ts:928` emite `pago.proveedor.registrado` → `ContabilidadEventsListener` lo persiste en outbox (linea 100-102) → `handlePagoProveedor` (linea 1091) → `asientosGenerator.generarAsientoPago` → Dr 42 Proveedores / Cr 10 Bancos. Tambien `tesoreria.service.ts` emite el mismo evento en lineas 308 y 687.

#### P2: ¿Movimiento bancario genera asiento?
**NO.** `movimiento.bancario.registrado` se emite pero NO aparece en `accountingEventTypes` del listener ni en `accountingOwnedEvents` del worker. **GAP documentado** — NO ACCIONABLE: los movimientos bancarios son registros de tesoreria, no operaciones contables primarias. Los asientos se generan desde el evento origen (cobro, pago, etc).

#### P3: ¿Hay DLQ para eventos fallidos?
**SI.** Triple proteccion:
1. `marcarEventoComoFallido` incrementa `retry_count` y marca como `dead_letter` tras 3 retries
2. `marcarEventoNoManejado` marca directamente como `dead_letter` para tipos no reconocidos
3. `resetStuckEvents` en OutboxWorker re-pone en `pending` eventos atascados >15 min
4. `reiniciarEventoFallido` permite restart manual con limite de 3 restarts

#### P4: ¿Se pueden duplicar asientos si un evento llega 2 veces?
**NO.** Cuadruple proteccion de idempotencia:
1. `buscarAsientoPorEvento` (check previo por `source_event_id`)
2. `source_event_id` UNIQUE constraint en BD (error 23505 → recupera existente)
3. Local lock via `activeSourceEventIds` Set (previene carreras in-process)
4. `consolidarAsientoUnicoPorEvento` (soft-delete de duplicados post-insert)

#### P5: ¿DEBE = HABER en cada template?
**SI** para todos los templates:
- Venta: Dr 12 [total] = Cr 70 [base] + Cr 40 [IGV] (+ Dr/Cr 69/20 costo ventas)
- Compra: Dr 20 [costo] + Dr 40 [igv] = Cr 42 [total] (con ajuste de redondeo)
- Cobro: Dr 10 [monto] = Cr 12 [monto]
- Pago: Dr 42 [monto] = Cr 10 [monto]
- Planilla: Dr 621 [sueldos] = Cr 403 [retenciones] + Cr 411 [neto] (con validacion explicita)
- Depreciacion: Dr 68 [monto] = Cr 39 [monto]
- Devolucion: Dr 42 [total] = Cr 20 [subtotal] + Cr 40 [igv]
- Validacion en `generarAsiento`: `Math.abs(totalDebe - totalHaber) > 0.01` → throw Error

#### P6: ¿Que event_types procesa el asientos-generator desde outbox?
25 event types (8+ pares dot.notation + PascalCase):
`venta.procesada`, `VentaFacturada`, `pos.venta.registrada`, `cobro.registrado`, `CobroRegistrado`, `recepcion.registrada`, `RecepcionRegistrada`, `devolucion.proveedor.registrada`, `DevolucionProveedorEmitida`, `cxc.creada`, `CuentaPorCobrarCreada`, `pago.proveedor.registrado`, `PagoProveedorRegistrado`, `ajuste.inventario.aplicado`, `AjusteInventarioAplicado`, `planilla.liquidada`, `PlanillaLiquidada`, `depreciacion.generada`, `DepreciacionGenerada`, `cpe.anulado`, `CPEAnulado`, `producto.stock_bajo`, `producto.stock.bajo`, `ProductoStockBajo`, `stock.movimiento`, `StockMovimiento`

---

### HALLAZGO CT1: 5x console.log en asientos-generator.service.ts — FIXED

Logger ya existia. Reemplazados 5 console.log/error/warn → this.logger.warn/error/log.

---

### HALLAZGO CT2: 5x console.error/warn en accounting-entries.service.ts — FIXED

Logger ya existia. Reemplazados 5 console.error/warn → this.logger.error/warn.

---

### HALLAZGO CT3: tenant_id gap en obtenerEstadisticasEventosFallidos — FIXED

**Ubicacion**: `asientos-generator.service.ts:459-465`
```typescript
// ANTES: query sin filtro tenant_id (traía TODOS los tenants)
let query = ... .in('status', ['failed', 'dead_letter']);
// DESPUES:
let query = ... .in('status', ['failed', 'dead_letter']);
if (tenantId) { query = query.eq('tenant_id', tenantId); }
```
**Riesgo**: MEDIO — sin filtro, un tenant podria ver estadisticas de todos los tenants.

---

### HALLAZGO CT4: tenant_id gap en rollback delete asientos_contables — FIXED

**Ubicacion**: `asientos-generator.service.ts:179-181`
```typescript
// ANTES:
.from('asientos_contables').delete().eq('id', asiento.id);
// DESPUES:
.from('asientos_contables').delete().eq('id', asiento.id).eq('tenant_id', tenantId);
```
**Riesgo**: MUY BAJO (ID recien creado). Fix aplicado como defense-in-depth.

---

### HALLAZGO CT5: movimiento.bancario.registrado huerfano

**Veredicto: NO ACCIONABLE** — Los movimientos bancarios son registros de tesoreria. Los asientos contables se generan desde el evento origen (cobro.registrado, pago.proveedor.registrado), no desde el movimiento bancario en si. Agregar asiento aqui duplicaria la contabilizacion.

---

### HALLAZGO CT6: planilla.pagada huerfano

**Veredicto: RIESGO BAJO / NO ACCIONABLE** — El evento `planilla.pagada` se emite pero nadie lo escucha. Sin embargo, el asiento de planilla se genera via `planilla.liquidada` (que SI tiene handler). El pago de la planilla deberia generar un movimiento bancario, pero eso es una mejora funcional, no un gap contable critico. Los asientos de gasto de personal ya se generan correctamente.

---

### HALLAZGO CT7: Arquitectura dual de asientos (AccountingEntriesService vs AsientosGeneratorService)

**Observacion**: Existen DOS servicios que generan asientos contables:
1. `AccountingEntriesService` (shared/integration/) — Usado por POS y eventos in-memory
2. `AsientosGeneratorService` (contabilidad/services/) — Usado por ContabilidadEventsListener via outbox

Ambos servicios tienen idempotencia y validacion DEBE=HABER. No hay duplicacion porque operan en flujos distintos:
- POS usa `AccountingEntriesService` directamente (hot path)
- Facturacion/Compras/CxP usan outbox → `AsientosGeneratorService`

**Veredicto: CORRECTO** — Arquitectura dual intencional para separar hot-path (POS) de batch (outbox).

---

### RESUMEN FLUJO 3

| ID | Hallazgo | Veredicto | Accion |
|----|----------|-----------|--------|
| CT1 | 5x console.log asientos-generator | **FIXED** | Logger |
| CT2 | 5x console.error accounting-entries | **FIXED** | Logger |
| CT3 | tenant_id gap en estadisticas | **FIXED** | +`.eq('tenant_id')` condicional |
| CT4 | tenant_id gap en rollback delete | **FIXED** | +`.eq('tenant_id')` |
| CT5 | movimiento.bancario huerfano | **NO ACCIONABLE** | Asiento se genera desde evento origen |
| CT6 | planilla.pagada huerfano | **RIESGO BAJO** | Asiento via planilla.liquidada |
| CT7 | Arquitectura dual asientos | **CORRECTO** | Hot-path vs batch intencional |

---

## ARCHIVOS MODIFICADOS

### Flujo 2 (Compras)
| Archivo | Cambio |
|---------|--------|
| `compras/services/recepciones.service.ts` | +`.eq('tenant_id', tenantId)` en `actualizarEstadoOrden` |
| `compras/services/devoluciones-proveedor.service.ts` | 24x console.* → Logger |

### Flujo 1 (Ventas)
| Archivo | Cambio |
|---------|--------|
| `ventas/pedidos/pedidos.service.ts` | +`.eq('tenant_id')` en 2 deletes + 43x console → Logger |
| `ventas/cotizaciones/cotizaciones.service.ts` | +Logger import + 30x console → Logger |
| `shared/integration/financial-integration.service.ts` | +Logger import + 21x console → Logger |
| `shared/events/event-bus.service.ts` | +Logger import + 7x console → Logger.debug |

### Flujo 3 (Contabilidad)
| Archivo | Cambio |
|---------|--------|
| `contabilidad/services/asientos-generator.service.ts` | 5x console → Logger + tenant_id en stats query + tenant_id en rollback delete |
| `shared/integration/accounting-entries.service.ts` | 5x console → Logger |

---

## DECISIONES FUERA DE ESPECIFICACION

### D1: tenant_id gaps — defense-in-depth vs riesgo real
Las tablas tienen RLS con `tenant_isolation` policy, pero `service_role_key` bypassa RLS. Los gaps encontrados son de riesgo MUY BAJO (UUIDs, parent records ya validados). Solo fixeé los que afectan logica de negocio o son deletes.

### D2: Dead code emitirEventoCompraEntregada — no remover ni activar
Comentario explicito del desarrollador indica decision intencional. Activarlo requeriria verificar idempotencia cruzada. Solo afecta KPIs dashboard.

### D3: console.log masivo (1533 instancias en 71 archivos)
Solo fixeé los archivos directamente involucrados en los 3 flujos criticos. Los demas quedan como mejora futura (no son un riesgo de seguridad, pero si de observabilidad/PII).

### D4: EventBus console.log → Logger.debug (no Logger.log)
El EventBus emite muchos eventos por request. Usar `debug` en vez de `log` para evitar ruido en produccion (debug es suppressed por defecto).

---

## VERIFICACIONES EJECUTADAS (resumen)

| # | Verificacion | Resultado |
|---|-------------|-----------|
| 1 | Full test suite baseline | **948/948** |
| 2 | Flujo 2: 8 checks (C1-C8) | 2 FP, 2 correct, 1 NA, 2 FIXED, 1 GAP doc |
| 3 | Tests compras post-fix | 172/172 PASS |
| 4 | Full suite post-Flujo 2 | **948/948** |
| 5 | TSC backend post-Flujo 2 | 0 errores |
| 6 | Flujo 1: 10 checks (V1-V10) | 1 FP, 3 correct, 1 low risk, 5 FIXED |
| 7 | Tests ventas post-fix | 45/45 PASS |
| 8 | Full suite post-Flujo 1 | **948/948** |
| 9 | TSC backend post-Flujo 1 | 0 errores |
| 10 | Flujo 3: 7 checks (CT1-CT7) | 4 FIXED, 2 NA, 1 correct |
| 11 | Full suite post-Flujo 3 | **948/948** |
| 12 | TSC backend post-Flujo 3 | 0 errores |

---

## ESTADO FINAL

- **948/948 tests** — zero regresiones en todo el proceso
- **TSC backend**: 0 errores
- **TSC frontend**: 0 errores
- **Flujo 2 (Compras)**: ✅ COMPLETADO — 8 checks, 2 FIXED
- **Flujo 1 (Ventas)**: ✅ COMPLETADO — 10 checks, 5 FIXED
- **Flujo 3 (Contabilidad)**: ✅ COMPLETADO — 7 checks, 4 FIXED

### TOTALES INTERCONEXIONES
- **25 checks** ejecutados en 3 flujos
- **11 fixes** aplicados (tenant_id gaps + console.log → Logger)
- **3 falsos positivos** descartados con evidencia
- **6 correctos** verificados sin cambios
- **3 no accionables** documentados
- **2 gaps documentados** como mejora futura (KPIs dashboard, planilla.pagada)
