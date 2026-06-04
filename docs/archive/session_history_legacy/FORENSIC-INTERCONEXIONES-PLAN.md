# Plan de Analisis Forense — Interconexiones de Modulos

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_contexto_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

**Fecha:** 2026-05-19
**Estado:** PLANIFICADO — pendiente de ejecucion
**Prerequisito:** Sesion 6 completa (84/125 fixes, 948/948 tests, TSC 0 errores)

---

## OBJETIVO

Analizar forensicamente los 3 flujos de negocio criticos del ERP para verificar que las interconexiones entre modulos son correctas, completas y resilientes. Buscar:
- Eventos emitidos sin listener (huerfanos)
- Listeners cuya falla causa perdida de datos
- Integraciones faltantes (modulo X deberia generar asiento contable pero no lo hace)
- Race conditions en eventos multi-consumidor
- Operaciones de stock sin idempotencia/locking
- Filtros tenant_id faltantes en queries cross-module

---

## MAPA DE EVENTOS DESCUBIERTO (pre-analisis)

### Eventos CON listeners activos
| Evento | Emitido por | Listeners |
|--------|-------------|-----------|
| `venta.procesada` | `pedidos.service.ts`, `pos.service.ts` | `InventoryIntegrationService`, `FinancialIntegrationService`, `ContabilidadEventsListener` |
| `factura.emitida` | `pedidos.service.ts` | `CxcFacturaListener` (crea CxC) |
| `recepcion.registrada` | `recepciones.service.ts` | `ComprasCxpIntegrationService`, `CxpEventsListener`, `ContabilidadEventsListener`, `InventoryIntegrationService` |
| `cobro.registrado` | `cxc.service.ts` | `ContabilidadEventsListener` (outbox) |
| `cuenta_por_cobrar.creada` | `cxc.service.ts`, `pedidos.service.ts` | `ContabilidadEventsListener` (outbox) |
| `compra.entregada` | `recepciones.service.ts` | `InventoryIntegrationService`, `FinancialIntegrationService` |
| `devolucion.proveedor.emitida` | `devoluciones-proveedor.service.ts` | `CxpEventsListener` |

### Eventos HUERFANOS (emitidos, NADIE escucha)
| Evento | Emitido por | Impacto |
|--------|-------------|---------|
| `orden.compra.aprobada` | `ordenes-compra.service.ts` | **MEDIO** — No genera notificacion ni flujo automatico al aprobar OC |
| `planilla.calculada` | `planillas.service.ts` | **BAJO** — Informativo, la planilla se procesa sincrono |
| `planilla.pagada` | `planillas.service.ts` | **ALTO** — Pago de planilla NO genera movimiento bancario automatico |
| `empleado.asistencia` | `rrhh.service.ts` | **BAJO** — Informativo |
| `movimiento.bancario.registrado` | `bancos.service.ts`, `tesoreria.service.ts` | **MEDIO** — Solo va a outbox, no actualiza conciliacion automatica |
| `factura.proveedor.registrada` | `compras-cxp-integration.service.ts` | **MEDIO** — Emitido pero ningun listener lo consume |

---

## FLUJO 1: VENTAS END-TO-END

### Cadena esperada
```
Cotizacion → Pedido → Confirmar Pedido → Facturar → CPE → CxC → Cobro → Contabilidad
                                           ↓
                                      Inventario (stock--)
```

### Archivos a analizar
| Paso | Archivo | Lineas clave |
|------|---------|--------------|
| Cotizaciones | `ventas/cotizaciones/cotizaciones.service.ts` | CRUD basico, verificar si emite evento |
| Pedidos | `ventas/pedidos/pedidos.service.ts` | confirmarPedido, facturar, emitVentaProcessed |
| CPE Integration | `ventas/pedidos/cpe-integration.service.ts` | Genera XML/envio SUNAT |
| GRE Integration | `ventas/pedidos/gre-integration.service.ts` | Guia de remision |
| CxC Listener | `finanzas/cxc/listeners/cxc-factura.listener.ts` | onFacturaEmitida → crea CxC |
| CxC Service | `finanzas/cxc/cxc.service.ts` | registrarPago, emitCobro |
| Inventory | `shared/integration/inventory-integration.service.ts` | onVentaProcessed → stock-- |
| Financial | `shared/integration/financial-integration.service.ts` | onVentaProcessed → registro financiero |
| Contabilidad | `contabilidad/listeners/contabilidad-events.listener.ts` | Persiste en outbox |

### Preguntas clave a responder
1. **Cotizacion → Pedido**: Hay conversion automatica o es manual? Se pierden datos?
2. **Pedido confirmado → Stock**: Se descuenta stock al confirmar o al facturar? Hay reserva?
3. **Facturar → CPE**: Si SUNAT rechaza la factura, se revierte la CxC y el stock?
4. **Factura → CxC**: Si el listener `CxcFacturaListener` falla, la factura queda sin CxC?
5. **CxC → Contabilidad**: El cobro genera asiento contable via outbox? O es in-memory?
6. **Idempotencia**: Si `venta.procesada` se emite 2 veces, se duplica el stock decrement?
7. **Inventario negativo**: Se permite stock negativo? Hay check?

### Verificaciones tecnicas
- [ ] `cotizaciones.service.ts`: Verificar tenant_id en todas las queries
- [ ] `pedidos.service.ts`: Trazar confirmarPedido() completo — que eventos emite, en que orden
- [ ] `pedidos.service.ts`: Trazar facturar() — verificar que emite factura.emitida DESPUES de insertar en DB
- [ ] `cxc-factura.listener.ts`: Que pasa si falla? Hay retry? Hay outbox?
- [ ] `inventory-integration.service.ts`: onVentaProcessed — verificar idempotencia del stock decrement
- [ ] `cpe-integration.service.ts`: Si CPE falla, que estado queda la venta?
- [ ] Cross-module: Verificar que no hay `@Body() body: any` en controllers de ventas

---

## FLUJO 2: COMPRAS END-TO-END

### Cadena esperada
```
Cotizacion Compra → Orden Compra → Aprobar → Recepcion → CxP → Pago CxP → Contabilidad
                                                 ↓
                                            Inventario (stock++)
```

### Archivos a analizar
| Paso | Archivo | Lineas clave |
|------|---------|--------------|
| Cotizaciones | `compras/services/cotizaciones-compra.service.ts` | CRUD con DTOs validados |
| Ordenes Compra | `compras/services/ordenes-compra.service.ts` | aprobar, emitOrdenCompraAprobada |
| Recepciones | `compras/services/recepciones.service.ts` | registrar, emitRecepcionRegistrada |
| Compras-CxP | `compras/services/compras-cxp-integration.service.ts` | onRecepcionRegistrada → crea CxP |
| CxP Listener | `finanzas/cxp/listeners/cxp-events.listener.ts` | onRecepcionRegistrada (redundante?) |
| CxP Service | `finanzas/cxp/cxp.service.ts` | aplicarPago |
| Devoluciones | `compras/services/devoluciones-proveedor.service.ts` | Flujo reverso |
| Inventory | `shared/integration/inventory-integration.service.ts` | onCompraEntregada → stock++ |
| Contabilidad | `contabilidad/listeners/contabilidad-events.listener.ts` | onRecepcionRegistrada → outbox |

### Preguntas clave a responder
1. **OC Aprobada → Recepcion**: Es manual? El evento `orden.compra.aprobada` no tiene listener — es intencional?
2. **Recepcion tiene 4 consumers**: `ComprasCxpIntegration`, `CxpEventsListener`, `ContabilidadEvents`, `InventoryIntegration` — hay duplicacion CxP? Ambos crean CxP?
3. **Recepcion parcial**: Si se recibe 50% de la OC, se crea CxP parcial? Se actualiza stock parcial?
4. **Devolucion → Inventario**: La devolucion revierte el stock? Y la CxP?
5. **Idempotencia**: Si `recepcion.registrada` se emite 2 veces, se duplica stock y CxP?
6. **`compra.entregada` vs `recepcion.registrada`**: Cual es la diferencia? Ambas existen.

### Verificaciones tecnicas
- [ ] `recepciones.service.ts`: Trazar registrarRecepcion() completo
- [ ] `compras-cxp-integration.service.ts` vs `cxp-events.listener.ts`: Ambos escuchan `recepcion.registrada` — verificar que NO duplican CxP
- [ ] `ordenes-compra.service.ts`: Verificar que `aprobar()` tiene validaciones de estado
- [ ] `inventory-integration.service.ts`: onCompraEntregada — verificar idempotencia
- [ ] `devoluciones-proveedor.service.ts`: Verificar flujo reverso completo (stock--, CxP reversa)
- [ ] Cross-module: tenant_id en todas las queries cross-module

---

## FLUJO 3: INTEGRACION CONTABLE GLOBAL

### Objetivo
Verificar que CADA operacion financiera del ERP genera su asiento contable correcto.

### Mapa de generacion de asientos
| Modulo | Evento/Trigger | Tipo Asiento | Mecanismo | Archivo |
|--------|---------------|--------------|-----------|---------|
| POS | venta POS | Venta | Outbox via ContabilidadEventsListener | `contabilidad-events.listener.ts` |
| Ventas | facturar pedido | Venta | Outbox via ContabilidadEventsListener | `contabilidad-events.listener.ts` |
| Compras | recepcion.registrada | Compra | Outbox via ContabilidadEventsListener | `contabilidad-events.listener.ts` |
| CxC | cobro.registrado | Cobro | Outbox via ContabilidadEventsListener | `contabilidad-events.listener.ts` |
| CxC | cuenta_por_cobrar.creada | CxC | Outbox via ContabilidadEventsListener | `contabilidad-events.listener.ts` |
| CxP | pago CxP | Pago | **VERIFICAR** — puede no generar asiento | `cxp.service.ts` |
| RRHH | planilla liquidada | Planilla | Directo + Outbox opcional | `planillas.service.ts` |
| Bancos | movimiento bancario | Bancario | **HUERFANO** — emitido pero no genera asiento | `bancos.service.ts` |
| Tesoreria | movimiento tesoreria | Tesoreria | **VERIFICAR** | `tesoreria.service.ts` |

### Preguntas clave
1. **Pago CxP genera asiento?** — El cobro CxC si (via outbox), pero el pago CxP... verificar
2. **Movimiento bancario → asiento**: El evento se emite pero nadie lo escucha — gap contable?
3. **Asientos duplicados**: Si un evento llega 2 veces al outbox, se genera asiento duplicado?
4. **Balance cuadra**: En el asiento de venta, DEBE = HABER? Cuentas correctas?
5. **Asiento de devolucion**: Cuando se devuelve mercaderia al proveedor, se genera asiento reverso?
6. **Outbox reliability**: Que pasa si el outbox worker esta caido? Se pierden eventos? Hay DLQ?
7. **Asientos generator**: `asientos-generator.service.ts` — que eventos procesa desde outbox?

### Archivos a analizar
| Componente | Archivo |
|------------|---------|
| Outbox Events Service | `contabilidad/services/outbox-events.service.ts` |
| Asientos Generator | `contabilidad/services/asientos-generator.service.ts` |
| Contabilidad Listener | `contabilidad/listeners/contabilidad-events.listener.ts` |
| Accounting Entries (shared) | `shared/integration/accounting-entries.service.ts` |
| Financial Integration | `shared/integration/financial-integration.service.ts` |
| Outbox Worker | `shared/outbox/outbox-worker.service.ts` |
| Outbox Service | `shared/outbox/outbox.service.ts` |

### Verificaciones tecnicas
- [ ] Listar TODOS los event_type que llegan al outbox
- [ ] Para cada event_type: verificar que el asientos-generator lo procesa
- [ ] Verificar idempotencia del asientos-generator (no duplicar asientos)
- [ ] Verificar que DEBE = HABER en cada template de asiento
- [ ] Verificar que pago CxP genera asiento (o documentar que falta)
- [ ] Verificar que devolucion proveedor genera asiento reverso
- [ ] Verificar DLQ (dead letter queue) y manejo de eventos fallidos

---

## HALLAZGOS PRELIMINARES (pre-analisis)

### Riesgo ALTO
1. **Duplicacion CxP en recepciones**: `ComprasCxpIntegrationService` y `CxpEventsListener` AMBOS escuchan `recepcion.registrada` — potencial CxP duplicada
2. **`planilla.pagada` huerfano**: Pago de planilla no genera movimiento bancario ni asiento de pago
3. **`factura.emitida` sin outbox**: Si `CxcFacturaListener` falla, la factura queda sin CxC y no hay retry

### Riesgo MEDIO
4. **`orden.compra.aprobada` huerfano**: No genera notificacion ni workflow automatico
5. **`movimiento.bancario.registrado` huerfano**: No actualiza conciliacion ni genera asiento
6. **Stock decrement sin idempotencia verificada**: Si `venta.procesada` llega 2 veces, posible doble descuento
7. **Pago CxP sin asiento contable**: Verificar si existe (el pago CxC si genera outbox event)

### Riesgo BAJO
8. **`factura.proveedor.registrada` huerfano**: Emitido por compras-cxp-integration pero nadie escucha
9. **`empleado.asistencia` huerfano**: Solo informativo
10. **`planilla.calculada` huerfano**: Solo informativo

---

## PROTOCOLO DE EJECUCION

Para cada flujo:
1. Leer servicio principal linea por linea
2. Trazar cada evento: emision → listeners → acciones
3. Verificar idempotencia en cada listener
4. Verificar tenant_id en cada query cross-module
5. Verificar manejo de errores (que pasa si falla un paso intermedio?)
6. Documentar hallazgos con archivo:linea
7. Correr tests del modulo despues de cada fix
8. Full suite + TSC al final

### Orden de ejecucion sugerido
1. **Flujo 2 (Compras)** — Empezar aqui porque tiene el hallazgo mas critico (duplicacion CxP)
2. **Flujo 1 (Ventas)** — Segundo, porque es el mas complejo
3. **Flujo 3 (Contabilidad)** — Ultimo, porque depende de entender los otros 2

### Estimacion
- Flujo 2: ~1 sesion (6 servicios, 4 consumers de recepcion.registrada)
- Flujo 1: ~1-2 sesiones (8 servicios, flujo mas largo)
- Flujo 3: ~1 sesion (verificacion de asientos de todos los modulos)

---

## ENTREGABLES

1. `VENTAS-FORENSIC-REPORT.md` — Hallazgos y fixes del flujo de ventas
2. `COMPRAS-FORENSIC-REPORT.md` — Hallazgos y fixes del flujo de compras
3. `CONTABILIDAD-FORENSIC-REPORT.md` — Hallazgos y fixes de integracion contable
4. Actualizacion de `claude-revision-fixes.md` con sesion 7+
5. Actualizacion de `MEMORY.md` con estado final
