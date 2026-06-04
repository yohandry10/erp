# Codex handoff - 2026-05-24

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `documento_general`.
>
> Leer tambien: `docs/README.md`, `docs/START_HERE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## Contexto general

Repositorio local: `C:\Users\PC\Desktop\erp`
Idioma por defecto con el usuario: espanol.
Rama actual durante el trabajo: `codex/accounting-production-closure`.

El usuario esta haciendo una auditoria/cierre forense contable del ERP peruano, modulo por modulo. El foco mas reciente fue:

- Tesoreria
- Caja
- Bancos
- CxC
- CxP
- Conciliacion bancaria
- Conciliacion contable
- Outbox financiero
- Bancarizacion Peru

El arbol estaba sucio antes de mis cambios, con muchas modificaciones/deletes/untracked del usuario. No revertir nada que no sea explicitamente pedido.

## Archivos relevantes creados o modificados por esta sesion

Archivos principales tocados:

- `supabase/migrations/334__treasury_cash_bank_forensic_closure.sql`
- `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md`
- `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`
- `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts`
- `apps/erp-api/src/modules/finanzas/bancos/bancos.service.ts`
- `apps/erp-api/src/modules/pos/pos.service.ts`

## Que se resolvio

### Migracion 334

Se agrego `334__treasury_cash_bank_forensic_closure.sql` con:

- Tabla `financial_forensic_repair_log` para registrar reparaciones forenses.
- Columnas en `ventas_pos`: `cxc_pendiente`, `cxc_error`, `cxc_reintentos`, `cuenta_por_cobrar_id`.
- Indices de unicidad/control para evitar duplicados POS/caja/pagos/conciliacion.
- RPC `registrar_cxc_pago_tx`:
  - Registra cobro CxC.
  - Actualiza saldo CxC.
  - Crea movimiento bancario si corresponde.
  - Actualiza saldo banco.
  - Inserta outbox `cobro.registrado`.
  - Todo dentro de una transaccion DB.
- RPC `conciliar_movimientos_bancarios_tx`:
  - Marca movimiento sistema y movimiento extracto en una sola transaccion.
  - Valida conciliacion abierta, cuenta, tipo, diferencia y duplicados.
- Funcion `validar_tesoreria_caja_bancos_runtime(p_tenant_id uuid default null)`:
  - Asientos descuadrados.
  - `source_event_id` duplicado.
  - Ventas POS sin pago.
  - Pagos POS efectivo sin caja.
  - CxC descuadrada.
  - CxP descuadrada.
  - Conciliaciones cerradas con diferencia.
  - Movimientos bancarios huerfanos.
  - Outbox financiero failed/dead-letter.
  - Pagos bancarizables sin evidencia.
  - Ventas POS credito con CxC pendiente.

Nota de numeracion: esta migracion fue inicialmente creada/aplicada como `333__treasury_cash_bank_forensic_closure.sql`, pero ese prefijo colisionaba con `333__inventory_stock_reconciliation_hardening.sql`. El archivo canonico del repo queda renumerado a `334__treasury_cash_bank_forensic_closure.sql`. Los indices, idempotency keys y repair codes internos conservan sufijo `_333` para no duplicar indices ni reejecutar backfills en bases donde ya se aplico la version inicial.

### Reparaciones historicas aplicadas en BD configurada

La migracion se aplico con `psql` usando `DATABASE_URL` desde `.env.local`.

Reparaciones registradas:

- `POS_PAYMENT_BACKFILL_FROM_CASH_333`: 6 filas.
- `POS_CASH_MOVEMENT_BACKFILL_333`: 1 fila.
- `CXP_SALDO_SYNC_BANK_PAYMENTS_333`: 2 filas.
- `CXC_CANCELLED_PAYMENT_BACKFILL_333`: 41 filas.
- `CXP_PAYMENT_BACKFILL_333`: 2 filas.
- `OUTBOX_FINANCIAL_DEADLETTER_REQUEUE_333`: 1 fila.

Resultado del validador:

```sql
select * from public.validar_tesoreria_caja_bancos_runtime(null);
```

Resultado observado: 11 controles `OK`, 0 `FAIL`.

## Cambios de codigo backend

### CxC

Archivo: `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`

- `registrarPago` ahora intenta primero usar RPC `registrar_cxc_pago_tx`.
- Si la RPC no existe en un entorno viejo, hace fallback al flujo legacy.
- Si la RPC existe y falla por regla de negocio, lanza `BadRequestException`.
- Mantiene emision de evento en memoria para compatibilidad, pero la persistencia critica queda transaccional en DB.

### Conciliacion bancaria

Archivo: `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts`

- Match automatico y manual intentan usar `conciliar_movimientos_bancarios_tx`.
- Si la RPC no existe, fallback legacy.
- Si la RPC existe y falla por regla de negocio, corta la operacion.

Nota: este archivo ya tenia otros cambios previos del usuario o de trabajo anterior, como prevencion de reimportacion CSV y recalculo de `saldo_libro`.

### Bancos

Archivo: `apps/erp-api/src/modules/finanzas/bancos/bancos.service.ts`

- Si falla la insercion en `outbox_events` despues de crear movimiento bancario manual:
  - revierte saldo de cuenta bancaria;
  - elimina movimiento bancario;
  - lanza error.

Objetivo: no confirmar banco sin evento contable.

### POS

Archivo: `apps/erp-api/src/modules/pos/pos.service.ts`

- Si una venta a credito falla al crear CxC:
  - marca `ventas_pos.cxc_pendiente = true`;
  - guarda `cxc_error`;
  - devuelve error operativo `POS_CREDITO_CXC_PENDIENTE`.
- Si crea CxC correctamente:
  - guarda `cuenta_por_cobrar_id`;
  - limpia `cxc_pendiente`.

Objetivo: una venta credito no debe quedar silenciosamente sin cuenta por cobrar.

## Documento de auditoria actualizado

Archivo: `docs/auditoria_forense_tesoreria_caja_bancos_cxc_cxp_2026-05.md`

Incluye:

- Auditoria inicial.
- Hallazgos originales.
- Resolucion aplicada.
- Pruebas ejecutadas.
- Resultado del validador.
- Reparaciones historicas.
- Matriz de cierre actualizada a estado sano en controles ejecutados.

## Pruebas ejecutadas

Type-check:

```powershell
pnpm --filter @erp-suite/erp-api run type-check
pnpm --filter @erp-suite/web run type-check
```

Resultado: ambos OK.

Tests focalizados amplios:

```powershell
pnpm --filter @erp-suite/erp-api run test -- src/modules/pos/pos.service.spec.ts src/modules/cajas/cajas.service.spec.ts src/modules/cajas/services/cash-flow.spec.ts src/modules/cajas/services/cash-fraud-detection.service.spec.ts src/modules/cajas/services/cash-reports.service.spec.ts src/modules/cajas/services/cash-shift-changes.service.spec.ts src/modules/finanzas/cxc/cxc-cobro-event.spec.ts src/modules/finanzas/cxc/cxc-factura-event.spec.ts src/modules/finanzas/cxc/cxc-service-actions.spec.ts src/modules/finanzas/cxp/cxp.service.spec.ts src/modules/finanzas/cxp/cxp-event-emission.spec.ts src/modules/finanzas/cxp/listeners/__tests__/cxp-events.listener.spec.ts src/modules/finanzas/tesoreria/tesoreria.service.spec.ts src/modules/finanzas/bancos/__tests__/bancos.service.spec.ts src/modules/finanzas/bancos/__tests__/bancos-event-emission.spec.ts src/modules/finanzas/bancos/__tests__/bancos-sobregiro.spec.ts src/modules/finanzas/conciliacion/conciliacion.service.spec.ts src/modules/finanzas/conciliacion/conciliacion.service.unit.spec.ts src/modules/finanzas/conciliacion/csv-parser.service.spec.ts src/modules/contabilidad/services/asientos-generator.service.spec.ts src/modules/contabilidad/listeners/contabilidad-events.listener.spec.ts src/shared/integration/accounting-entries.service.spec.ts src/shared/outbox/outbox-worker.service.spec.ts --runInBand
```

Resultado: 23 suites OK, 292 tests OK.

Durante tests aparece un log esperado:

```text
EVENTO_PAGO_FALLIDO cxp=cxp-456 tenant=tenant-123: movimiento bancario NO creado. Requiere intervencion manual. Error: Event bus error
```

La suite lo cubre como escenario esperado.

## Fuente normativa usada

Bancarizacion SUNAT:

- https://emprender.sunat.gob.pe/comprobantes-libros/comprobantes-pago/bancarizacion

El sistema valida pagos bancarizables con medio y referencia. En el validador posterior quedaron 0 pagos bancarizables sin evidencia.

## Advertencias para la siguiente sesion

- No asumir que todo el arbol sucio pertenece a Codex. Ya venia sucio.
- No ejecutar `git reset --hard`, `git checkout --` ni revertir archivos sin autorizacion explicita.
- Antes de commit/push, revisar cuidadosamente `git status` y stagear solo los archivos de esta tarea.
- La migracion 334 ya se aplico en la BD configurada por `.env.local`. En otros entornos debe aplicarse por pipeline normal de migraciones.
- Despues del cierre de tesoreria existe `335__descontar_stock_authoritative.sql`, que ajusta `descontar_stock_y_liberar_reserva` para que `productos.stock_actual` no se sobrescriba con `SUM(producto_existencias)` en escenarios con desincronizacion historica.
- Si el usuario pide push, confirmar si quiere incluir solo estos archivos o todos los cambios sucios del repositorio.

## Estado recomendado al reabrir

1. Ejecutar `git status --short`.
2. Verificar que las migraciones 334 y 335 existen y no fueron alteradas.
3. Ejecutar:

```sql
select * from public.validar_tesoreria_caja_bancos_runtime(null);
```

4. Si sigue todo OK, preparar commit separado con los archivos de esta tarea.
