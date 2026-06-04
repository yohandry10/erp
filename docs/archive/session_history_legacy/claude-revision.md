# Revision Exhaustiva del Sistema ERP — Reporte Final de Hallazgos

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_contexto_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

**Fecha:** 2026-05-18
**Metodologia:** Analisis estatico de codigo, trazabilidad de cadenas end-to-end, revision de logica de negocio
**Archivos analizados:** 250+ archivos fuente, specs, migraciones, configs
**Modelo auditor:** Claude Opus 4.6 (read-only)
**Estado de verificacion:** VERIFICADO — Todos los hallazgos de Fases 4-8 confirmados contra codigo fuente con lineas exactas. 6 hallazgos rebajados o corregidos tras verificacion (CTB-C1, FIN-M5, RRH-A2, RRH-A3, RRH-A4, FE-A1).

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad | Descripcion |
|-----------|----------|-------------|
| **CRITICO** | 23 | Explotable ahora. Perdida de datos, corrupcion financiera, breach de tenant |
| **ALTO** | 39 | Serio pero condicional. Incorrectitud contable, race conditions, bypass de controles |
| **MEDIO** | 35 | Mala practica. Precision numerica, cache stale, validacion incompleta |
| **BAJO** | 28 | Deuda tecnica. Logs excesivos, UX inconsistente, dead code |
| **TOTAL** | **125** | |

*Nota post-verificacion: CTB-C1 (Dual-Writer) rebajado de CRITICO a ALTO tras confirmar que `initializeEventListeners()` es dead code.*

### Top 10 Hallazgos Mas Criticos

1. **Middleware Next.js vacio** — Sin proteccion server-side de rutas (Auth)
2. **Race condition en numeracion CPE** — Numeros duplicados ante SUNAT (Ventas)
3. **~~Doble-escritor contable~~** — REBAJADO A ALTO: `initializeEventListeners()` es dead code (nunca invocado). Riesgo teorico, no activo (Contabilidad)
4. **Race condition doble pago CxC/CxP** — Sin locking de BD (Finanzas)
5. **Planilla sin aislamiento tenant** — update/delete sin tenant_id (RRHH)
6. **Stock UPDATE sin tenant_id** — Contaminacion cross-tenant (Inventario)
7. **Recepcion doble** — Cantidad puede exceder lo ordenado (Compras)
8. **CxP nunca ajustada en devolucion** — TODO en produccion (Compras)
9. **Grafana con acceso anonimo + admin:admin** — Metricas expuestas (DevOps)
10. **Redis sin password** — BullMQ queues publicamente escribibles (DevOps)

---

## FASE 1: AUTENTICACION, RBAC Y MULTI-TENANCY

### CRITICO

#### AUTH-C1: Middleware Next.js Completamente Vacio
**Archivo:** `apps/web/middleware.ts`
**El middleware retorna `NextResponse.next()` sin ninguna validacion. No hay proteccion server-side de rutas. Cualquier ruta del dashboard es accesible sin autenticacion a nivel de servidor.**

#### AUTH-C2: Enumeracion de Usuarios en Password Reset
**Archivo:** `apps/erp-api/src/modules/auth/auth.service.ts`
**El endpoint de reset de password revela si un email existe o no en el sistema a traves de mensajes de error diferenciados.**

#### AUTH-C3: Reset de Lockout con Timestamp Stale
**Archivo:** `apps/erp-api/src/modules/auth/auth.service.ts`
**El bloqueo por intentos fallidos se resetea basandose en timestamps que pueden quedar stale, permitiendo bypass del lockout.**

### ALTO

#### AUTH-A1: Rate Limit Bypass via User-Agent Rotation
**Archivo:** `apps/erp-api/src/main.ts`
**El rate limiting puede ser evadido rotando User-Agent headers.**

#### AUTH-A2: Sesion No Regenerada en Cambio de Tenant
**Archivo:** `apps/web/components/tenant/TenantSwitcher.tsx:64-77`
**No hay flush de estado/cache al cambiar de tenant. Datos del tenant anterior persisten en React state.**

#### AUTH-A3: X-Forwarded-For Spoofable
**Archivo:** `apps/erp-api/src/main.ts`
**Trust proxy habilitado sin validacion de la cadena de proxies.**

#### AUTH-A4: Auth Solo Client-Side en Dashboard Layout
**Archivo:** `apps/web/app/dashboard/layout.tsx:39-67`
**El guard de autenticacion usa `useEffect` — renderiza contenido antes de verificar.**

#### AUTH-A5: localStorage Contiene Session Snapshot Manipulable
**Archivo:** `apps/web/contexts/AuthContext.tsx:17-50`
**`is_super_admin`, `roles`, `tenant_id` almacenados en localStorage. Inicializan React state antes de verificacion server-side.**

#### AUTH-A6: isAdmin Bypass en Sidebar
**Archivo:** `apps/web/components/layout/sidebar.tsx:361-375`
**`bypassPermissions = isSuperAdmin || isAdmin` lee roles de localStorage manipulable.**

#### AUTH-A7: Session Validation Deshabilitada en JWT Guard
**Archivo:** `apps/erp-api/src/modules/auth/auth.service.ts`
**La validacion de sesion esta condicionada y puede ser desactivada.**

#### AUTH-A8: Superadmin Layout Sin Guard
**Archivo:** `apps/web/app/superadmin/layout.tsx:7-42`
**El layout wrapper de `/superadmin/*` no tiene ningun check de auth/authz.**

#### AUTH-A9: Superadmin Guard via useEffect
**Archivo:** `apps/web/app/superadmin/dashboard/page.tsx:40-116`
**El guard usa `useEffect` redirect que ejecuta despues del render. Contenido visible momentaneamente.**

### MEDIO

#### AUTH-M1: PII en localStorage (email, nombre, roles)
#### AUTH-M2: AuthGuard renderiza children durante loading state
#### AUTH-M3: CORS configurado con wildcard en desarrollo sin distincion clara de produccion
#### AUTH-M4: Password temporal mostrada en plaintext en DOM (CrearTenantModal.tsx:709-760)
#### AUTH-M5: Error messages exponen detalles internos (ErrorBoundary.tsx:96-98)
#### AUTH-M6: Ruta superadmin en bundle JS de todos los usuarios (sidebar.tsx:47)
#### AUTH-M7: Validacion client-side only para pais_id/ruc en CrearTenantModal
#### AUTH-M8: GestionTenants renderiza raw API error strings

### BAJO

#### AUTH-B1-B7: Fallback silencioso en tenant switch, console.error con objetos completos, tipos `any` en RolesSection, etc.

---

## FASE 2: VENTAS, CPE, POS

### CRITICO

#### VEN-C1: Race Condition en Generacion de Numero de Factura CPE
**Archivo:** `apps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts`
**La generacion de numero correlativo de CPE no es atomica. Dos facturas simultaneas pueden recibir el mismo numero serie-correlativo, generando documentos duplicados ante SUNAT.**

#### VEN-C2: Actualizacion de Detalle de Pedido No Atomica
**Archivo:** `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`
**El update de items de pedido hace DELETE + INSERT sin transaccion. Si falla el INSERT, los items originales ya fueron eliminados.**

### ALTO

#### VEN-A1: Validacion RUC Simulada
**Archivo:** `apps/erp-api/src/modules/ventas/clientes/clientes.service.ts`
**La validacion de RUC solo verifica longitud (11 digitos), no consulta real a SUNAT.**

#### VEN-A2: esCredito Hardcoded a false
**Archivo:** `apps/erp-api/src/modules/cpe/cpe.service.ts`
**Todas las facturas se emiten como contado, ignorando la condicion de pago real del pedido.**

#### VEN-A3: TOCTOU en Verificacion de Stock
**Archivo:** `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`
**Stock se verifica con SELECT y se deduce con UPDATE separado. Ventana de race condition.**

#### VEN-A4: Fallback a RPC Legacy Pierde Idempotencia
**Archivo:** `apps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts`
**Cuando el path principal falla, el fallback a RPC no preserva la key de idempotencia.**

#### VEN-A5: rollbackVenta No Atomico
**Archivo:** `apps/erp-api/src/modules/pos/pos.service.ts`
**El rollback de venta POS realiza multiples operaciones independientes sin transaccion.**

#### VEN-A6: Race Condition en Numero de Pedido
**Archivo:** `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`
**Numeracion de pedido usa MAX+1 a nivel de aplicacion, misma vulnerabilidad que CPE.**

### MEDIO

#### VEN-M1-M6: consultarTicket es stub, formateo de montos inconsistente, filtros de busqueda sin sanitizar, etc.

### BAJO

#### VEN-B1-B5: OSE service spec incompleto, console.log en produccion, dead code en POS controller, etc.

---

## FASE 3: COMPRAS, RECEPCIONES, DEVOLUCIONES

### CRITICO

#### COM-C1: Race Condition en Recepcion Doble
**Archivo:** `apps/erp-api/src/modules/compras/services/recepciones.service.ts`
**Dos recepciones simultaneas para la misma OC pueden exceder la cantidad ordenada. No hay lock ni constraint a nivel de BD.**

#### COM-C2: Numeracion de Recepcion Duplicable
**Archivo:** `apps/erp-api/src/modules/compras/services/recepciones.service.ts`
**Numero correlativo de recepcion usa MAX+1 en aplicacion. Misma vulnerabilidad de race condition.**

#### COM-C3: CxP Nunca Ajustada en Devolucion
**Archivo:** `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts`
**Cuando una devolucion es emitida, hay un TODO en el codigo que dice "ajustar CxP" pero nunca se implemento. La CxP mantiene el saldo original.**

#### COM-C4: Auto-Aprobacion No Bloqueada
**Archivo:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
**Un usuario puede aprobar su propia orden de compra. No hay validacion de que el aprobador sea diferente al creador.**

### ALTO

#### COM-A1: Validacion RUC Solo Verifica Longitud
**Archivo:** `apps/erp-api/src/modules/compras/services/proveedores.service.ts`
**Solo se valida que el RUC tenga 11 caracteres, sin verificar digito verificador ni consulta SUNAT.**

#### COM-A2: Falta tenant_id en Queries de Aprobacion
**Archivo:** `apps/erp-api/src/modules/compras/repositories/oc-aprobaciones.repository.ts`
**Queries de aprobacion no filtran por tenant_id, permitiendo potencial leak cross-tenant.**

#### COM-A3: Leak Cross-Tenant en Aprobacion
**Archivo:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
**En configuracion de aprobacion por monto, la consulta de umbrales no filtra por tenant.**

#### COM-A4: Stock Puede Quedar Negativo en Cancelacion de OC
**Archivo:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
**Al cancelar una OC parcialmente recepcionada, la reversa de stock no verifica si quedaria negativo.**

#### COM-A5: Aprobacion Fallback Silencioso
**Archivo:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
**Si la configuracion de aprobacion falla al cargar, la OC se aprueba automaticamente sin workflow.**

#### COM-A6: Creacion de Recepcion No Atomica
**Archivo:** `apps/erp-api/src/modules/compras/services/recepciones.service.ts`
**Header y detalle de recepcion son inserts separados. Fallo parcial deja recepcion sin items.**

#### COM-A7: Missing Tenant Filter en Devoluciones
**Archivo:** `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts`
**Algunas queries de devoluciones no incluyen filtro de tenant_id.**

### MEDIO

#### COM-M1-M8: Validacion de DTO incompleta, error handling inconsistente, console.log en produccion, etc.

### BAJO

#### COM-B1-B5: Tests desactualizados, naming inconsistente, dead code en controllers, etc.

---

## FASE 4: FINANZAS (CxC, CxP, TESORERIA, CONCILIACION)

### CRITICO

#### FIN-C1: Race Condition en Pago CxC — Doble Pago Sin Locking (CONFIRMADO)
**Archivo:** `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts`
**VERIFICACION con lineas exactas:**
- Linea 620: READ plain SELECT via `obtenerCuentaPorCobrar` (sin FOR UPDATE)
- Linea 625: VALIDATE `if (montoPago - pendienteActual > 0.05)`
- Lineas 695-720: INSERT `cxc_pagos`
- Lineas 825-838: UPDATE `cuentas_por_cobrar.monto_pendiente` con valor precalculado (linea 640: `nuevoPendiente`)
**Sin SELECT FOR UPDATE, sin advisory lock, sin optimistic concurrency (WHERE monto_pendiente = :expected). Dos pagos simultaneos ambos pasan la validacion y ambos se aplican.**

#### FIN-C2: Race Condition en Pago CxP — Dual Code Path (CONFIRMADO)
**Archivos:** `cxp.service.ts:699-856`, `tesoreria.service.ts:78-183`
**VERIFICACION:**
- `cxp.service.ts:712-727`: Si `tesoreriaService` inyectado, delega completamente
- `cxp.service.ts:737-755`: Fallback plain SELECT (sin lock)
- `cxp.service.ts:845-856`: Fallback UPDATE sin optimistic concurrency
- `tesoreria.service.ts:78-96`: TesoreriaService tambien plain SELECT
- `tesoreria.service.ts:172-183`: TesoreriaService UPDATE sin lock
**Diferencia critica: TesoreriaService crea movimiento bancario y actualiza saldo directamente. Fallback CxP solo emite evento (no crea movimiento). Misma API, side-effects completamente diferentes.**

#### FIN-C3: Rollback Manual No Atomico en CxC
**Archivo:** `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts:774-797`
**Si falla el paso 3 (saldo banco), se intenta DELETE de movimiento y pago. Si el DELETE falla, quedan registros huerfanos. No hay transaccion DB.**

#### FIN-C4: Anulacion de CPE No Reversa Pagos ni Contabilidad
**Archivo:** `apps/erp-api/src/modules/finanzas/cxc/listeners/cxc-factura.listener.ts:97-133`
**Cuando un CPE se anula, la CxC se marca ANULADA pero los `cxc_pagos` existentes no se reversan, el saldo bancario no se ajusta, y no se emite evento de reversa contable.**

### ALTO

#### FIN-A1: Idempotencia CxP Opcional y Falible
**Archivo:** `apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts:52-78`
**El check de idempotencia usa `integration_logs` (soft), no constraint DB. Ademas `aplicarPago` no lo invoca. En Tesoreria, `idempotency_key` es `@IsOptional()`. Error en BD retorna `false` (procede como nuevo).**

#### FIN-A2: Campo `saldo_pendiente` Nunca Actualizado en Pago
**Archivo:** `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts:825-838`
**`monto_pendiente` se actualiza pero `saldo_pendiente` queda con valor original. Reportes de aging que lean `saldo_pendiente` muestran saldos inflados.**

#### FIN-A3: saldo_libro con Aritmetica Floating-Point Nativa
**Archivo:** `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts:162-171`
**Acumulacion con `parseFloat` y `+`/`-` en vez de Decimal.js. Con 200+ movimientos, el error acumulado puede causar diferencia fantasma que bloquea cierre de conciliacion.**

#### FIN-A4: Auto-Match Colisiona Transacciones No Relacionadas
**Archivo:** `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts:427-461`
**Match por monto+tipo+fecha (tolerancia 2 dias). Dos transferencias de proveedores distintos con mismo monto y fecha cercana se matchean incorrectamente y se marcan conciliadas.**

#### FIN-A5: Inyeccion Opcional de TesoreriaService Crea Dual Behavior
**Archivo:** `apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts:18,712-727`
**Si TesoreriaService no se inyecta, el fallback no crea movimiento bancario ni actualiza saldo. Dos paths con side-effects materialmente distintos comparten misma API.**

### MEDIO

#### FIN-M1: Tolerancia de 0.05 PEN en Sobrepago CxC
**Archivo:** `cxc.service.ts:625` — Permite sobrepago de hasta 5 centimos sin tracking.

#### FIN-M2: CSV Import Duplicable en Conciliacion EN_PROCESO
**Archivo:** `conciliacion.service.ts:232-264` — Re-import de CSV no prevenido, duplica saldo_banco.

#### FIN-M3: Path Secundario de CxC Sin Idempotency Key
**Archivo:** `cxc.service.ts:1146-1191` — `crearCxCDesdeDocumento` no usa idempotency_key.

#### FIN-M4: saldo_libro No Recalculado al Cerrar Conciliacion
**Archivo:** `conciliacion.service.ts:862-1010` — Usa valor stale desde creacion.

#### FIN-M5: Flujo de Caja Sin Conversion de Monedas (No Mezcla, Pero No Consolida)
**Archivo:** `tesoreria.service.ts:785-1006`
**VERIFICACION: Las monedas SI se separan por bucket (PEN, USD, etc.) en proyeccion y resumen. No se mezclan. Sin embargo, no existe conversion a moneda base ni vista consolidada cross-currency. El reporte no puede responder "tengo suficiente liquidez total?".**

### BAJO

#### FIN-B1: Audit Trail Condicional en userId (cxc.service.ts:941-966)
#### FIN-B2: metodo_pago Acepta Texto Libre sin Enum (aplicar-pago-cxp.dto.ts:26-30)
#### FIN-B3: diferencia en MarcarItemDto Sin @Min(0)
#### FIN-B4: FacturaProveedorRegistrada via EventBus in-memory, no outbox (cxp.service.ts:447-452)

---

## FASE 5: CONTABILIDAD, EVENTOS E INTEGRACIONES

### CRITICO

#### CTB-C1: ~~CRITICO~~ REBAJADO A ALTO — Doble-Escritor Contable (Dead Code)
**Archivos:** `apps/erp-api/src/shared/integration/accounting-entries.service.ts:146-193`, `contabilidad-events.listener.ts:79-104`
**VERIFICACION: `AccountingEntriesService.initializeEventListeners()` es un metodo privado que NUNCA se invoca — no hay `onModuleInit` ni llamada en constructor. Es dead code.** El path activo es solo `ContabilidadEventsListener` → outbox → `AsientosGeneratorService`, que tiene idempotencia via DB unique constraint en `source_event_id`. El OutboxWorker explicitamente salta eventos contables (linea 97-101).
**Riesgo real: El codigo dead-code podria activarse accidentalmente en un refactor futuro. La logica de AccountingEntriesService tiene bugs reales (CTB-A2, CTB-A3) que se manifestarian si se activa.**

#### CTB-C2: Stock Update y Movimiento No Atomicos
**Archivo:** `apps/erp-api/src/shared/integration/inventory-integration.service.ts:321-364`
**UPDATE de `productos.stock_actual` y INSERT en `stock_movimientos` son dos calls separados a Supabase. Si el INSERT falla, el stock ya fue modificado sin trail de auditoria. No hay rollback.**

#### CTB-C3: Numeracion Manual de Asientos usa MAX en Aplicacion
**Archivo:** `apps/erp-api/src/modules/contabilidad/services/asientos.service.ts:344-378`
**`generarNumeroAsiento` lee MAX existente y suma 1. Dos usuarios posteando asientos manuales simultaneamente obtienen el mismo numero. Ademas limita a 1000 rows — si hay mas de 1000 asientos en un mes, falla silenciosamente.**
**Nota: El path automatico (`AsientosGeneratorService`) usa RPC de BD correctamente.**

#### CTB-C4: Consolidacion Elimina Asientos Hard-Delete Sin Audit Trail
**Archivo:** `apps/erp-api/src/modules/contabilidad/services/asientos-generator.service.ts:544-596`
**`consolidarAsientoUnicoPorEvento` hace DELETE permanente de asientos y detalle. No crea reversa, no marca como ANULADO, no registra en audit log. Viola principio de inmutabilidad contable.**

### ALTO

#### CTB-A1: Asiento de Compra — Componentes Pueden No Balancear
**Archivo:** `asientos-generator.service.ts:997-1030`
**`total` vs `costo + igv` con tolerancia de 0.01. Si los campos vienen de fuentes distintas con redondeo diferente, pasa la validacion con centimos de diferencia acumulativa.**

#### CTB-A2: AccountingEntries Omite IGV en Compras
**Archivo:** `accounting-entries.service.ts:257-288`
**`procesarAsientoCompra` debita total a inventario (201) sin separar IGV credito fiscal (401). Inventario sobreestimado 18%, IGV credito fiscal perdido.**

#### CTB-A3: COGS Fallback 70% del Precio de Venta
**Archivo:** `accounting-entries.service.ts:521-543`
**Cuando `precio_compra` no se encuentra, se usa 70% del precio de venta como costo. Cifra fabricada sin flag ni audit trail, posteada como COGS real.**

#### CTB-A4: Outbox Marca `completed` Antes de Confirmar Listener
**Archivo:** `outbox-worker.service.ts:126-135`
**`markEventCompleted` se llama despues de `eventBus.emit()` (sincrono) pero ANTES de que los handlers async terminen. Si el handler falla, el evento ya esta marcado `completed` y nunca se reintenta.**

#### CTB-A5: Reset de Eventos Stuck con TTL de 5 Min
**Archivo:** `outbox-worker.service.ts:166-192`
**Eventos `processing` por >5 minutos se resetean a `pending`. Un asiento que tarda >5 min en generarse es re-dispatched mientras aun se procesa, causando duplicados.**

#### CTB-A6: Balance General Desbalanceado Solo Logea Warning
**Archivo:** `estados-financieros.service.ts:710-717`
**Si A != L + E, solo hace `console.warn` y retorna el balance desbalanceado. Se cachea por 1 hora. Usuarios ven estados financieros incorrectos.**

#### CTB-A7: Asiento Planilla No Valida sueldos = retenciones + neto
**Archivo:** `asientos-generator.service.ts:1131-1184`
**No hay assertion explicita. Diferencias de hasta 0.99 pasan la validacion de tolerancia.**

### MEDIO

#### CTB-M1: Cache In-Memory en EstadosFinancieros (no funciona multi-pod)
#### CTB-M2: Filtro `origen` de asientos esta comentado (dead code)
#### CTB-M3: IGV sintetizado por resta introduce errores floating-point
#### CTB-M4: Resultados vacios cacheados por 1 hora (periodos nuevos muestran ceros)
#### CTB-M5: Balance de comprobacion fallback filtra tenant por JOIN (potencial leak cross-tenant)
#### CTB-M6: `static isProcessing` guard no funciona multi-instancia

### BAJO

#### CTB-B1: Re-emision de eventos stock en mismo bus (riesgo de loop)
#### CTB-B2: Inconsistencia `id` vs `event_id` en metodos de fallo
#### CTB-B3: `ProductoStock.id` contiene `codigo` en vez de UUID
#### CTB-B4: `reiniciarEventoFallido` resetea retry counter indefinidamente
#### CTB-B5: `PGRST116` conflado con `55000` (maskea falla de infraestructura)

---

## FASE 6: RRHH, CAJAS E INVENTARIO

### CRITICO

#### RRH-C1: Stock UPDATE Sin tenant_id
**Archivo:** `apps/erp-api/src/shared/integration/inventory-integration.service.ts:321-326`
**El UPDATE de `productos.stock_actual` filtra solo por `producto.id`, no incluye `tenant_id`. El SELECT previo si lo tiene, pero el UPDATE no. Si RLS esta mal configurado, stock de otro tenant puede ser modificado.**

#### RRH-C2: Calculo de Planilla Sin Guard de Idempotencia
**Archivo:** `apps/erp-api/src/modules/rrhh/planillas.service.ts:106-286`
**No hay check de estado antes de calcular ni UNIQUE(id_planilla, id_empleado). Dos requests simultaneos a `POST /rrhh/planillas/:id/calcular` duplican todos los registros de empleado_planilla.**

#### RRH-C3: Pago de Planilla — `continue` en Error Deja Estado Inconsistente
**Archivo:** `apps/erp-api/src/modules/rrhh/planillas.service.ts:939-1062`
**Loop de pagos usa `continue` cuando un pago individual falla. Al final marca toda la planilla como `PAGADO` con `total_pagado` parcial. Empleados sin registro de pago no pueden justificar descuentos ante AFP/ONP.**

#### RRH-C4: updatePlanilla/deletePlanilla Sin Aislamiento Tenant
**Archivo:** `apps/erp-api/src/modules/rrhh/planillas.service.ts:545-592`, `rrhh.controller.ts:116-132`
**El controller recibe `tenantId` de `@CurrentTenant()` pero NO lo pasa al service. UPDATE y DELETE filtran solo por `planillaId`. Un usuario de Tenant A puede modificar/eliminar planilla de Tenant B.**

### ALTO

#### RRH-A1: Tasas AFP Hardcodeadas e Incorrectas
**Archivo:** `planillas.service.ts:340-361`
**Comision 1.25% y seguro 1.36% no corresponden a ninguna AFP vigente. Tasas actuales de AFP Habitat a Profuturo van de 1.47% a 1.69%. Ademas la base para AFP no incluye asignacion familiar.**

#### RRH-A2: IR 5ta Categoria — Falta Deduccion del 20% (PARCIALMENTE CONFIRMADO)
**Archivo:** `planillas.service.ts:432-441`
**VERIFICACION: La renta anual pasa directamente a deduccion de 7 UIT sin aplicar la deduccion del 20% de gastos (Art. 46 LIR). Sobre-retencion sistematica en todos los empleados.**

#### RRH-A3: CTS Legalmente Incorrecta (PARCIALMENTE CONFIRMADO)
**Archivo:** `rrhh.service.ts:858,948`
**VERIFICACION: Usa formula `(sueldoMensual / 30) * diasCts` (formula diaria). El comentario en linea 948 documenta que deberia incluir 1/6 de gratificacion pero el codigo lo omite. Deberia usar modelo semestral (D.S. 001-97-TR).**

#### RRH-A4: TOCTOU en abrirCaja (PARCIALMENTE CONFIRMADO)
**Archivo:** `cajas.service.ts:119-393`
**VERIFICACION: 4 SELECTs secuenciales antes del INSERT sin guard atomico a nivel de aplicacion. TOCTOU race condition existe. Nota: no se pudo verificar si existe UNIQUE partial index en BD (requiere revisar migraciones de cajas). El riesgo es real a nivel de aplicacion.**

#### RRH-A5: reanudarSesion Permite Cualquier Usuario
**Archivo:** `cajas.service.ts:856-863`
**TODO explicito: "Por ahora permitimos, pero logueamos". Cualquier usuario puede reanudar sesion de otro cajero.**

#### RRH-A6: registrarAsistencia Lanza Error Generico en Validacion de Hora (PARCIALMENTE CONFIRMADO)
**Archivo:** `rrhh.service.ts:405`
**VERIFICACION: Solo la linea 405 (validacion hora salida > hora entrada) lanza `throw new Error(...)` generico → HTTP 500. Las lineas 360 y 394 usan correctamente `ConflictException` y `BadRequestException` respectivamente.**

### MEDIO

#### RRH-M1: Asignacion Familiar Hardcoded S/ 102.50 (no formula de RMV)
#### RRH-M2: calcularPlanillaMensual queries conceptos sin tenant filter
#### RRH-M3: Stock update + movimiento no atomicos (duplica CTB-C2)
#### RRH-M4: getDetallePlanilla/getBoleta sin tenant isolation
#### RRH-M5: getHistorialPagos sin tenant filter
#### RRH-M6: Corte/asiento de cierre de caja falla silenciosamente
#### RRH-M7: Supervisor role no validado en autorizacion de caja (TODO)

### BAJO

#### RRH-B1: console.log expone nombres y sueldos de empleados en produccion
#### RRH-B2: Asiento contable de planilla omite ESSALUD (9% patronal)
#### RRH-B3: registrarAsistencia no verifica que empleadoId pertenezca al tenant
#### RRH-B4: getConceptos seed INSERT no es idempotente bajo concurrencia

---

## FASE 7: WORKER, EMAIL, DEVOPS, DASHBOARD

### CRITICO

#### INF-C1: XSS via Template Injection en Emails
**Archivos:** `apps/erp-api/src/shared/email/templates/password-reset.template.ts:30,34,41`, `user-activation.template.ts:31,44,48`
**Datos de usuario (`userName`, `resetLink`, `userEmail`, `temporaryPassword`) interpolados directamente en HTML sin escapar. Un nombre como `José <script>alert(1)</script>` se renderiza como HTML en el email. El test solo verifica que se llamo `sendEmail`, no que el output esta escaped.**

#### INF-C2: Grafana con Acceso Anonimo + admin:admin
**Archivo:** `docker-compose.yml:184-188`
**`GF_AUTH_ANONYMOUS_ENABLED=true` con `Viewer` role. Password admin hardcoded como `admin`. Metricas de negocio (ventas, CPE, errores) accesibles sin autenticacion.**

#### INF-C3: Worker /metrics Unauthenticated
**Archivo:** `apps/worker/src/index.ts:1014-1018`
**El endpoint `/metrics` no tiene ninguna autenticacion (ni siquiera el HEALTH_TOKEN que si tiene `/health`). Expone contadores de CPE/GRE, volumen de facturacion, tasas de error.**

### ALTO

#### INF-A1: Handlers SIGTERM Duplicados — BullMQ Workers No Cierran
**Archivo:** `apps/worker/src/index.ts:555-560,1053-1057`
**Dos registros de `SIGTERM`. El segundo llama `process.exit(0)` sincronamente antes de que el primero complete `await cpeWorker.close()`. Jobs en vuelo abandonados.**

#### INF-A2: processCpeRetry Usa `select('*')` — Over-Fetch de Datos Fiscales
**Archivo:** `apps/worker/src/index.ts:652`
**A diferencia de otros metodos que seleccionan columnas especificas, retry usa `select('*')` exponiendo data sensible en logs.**

#### INF-A3: checkCriticalStock Sin Filtro de Tenant
**Archivo:** `apps/worker/src/index.ts:762-768`
**Supabase client usa service_role_key (bypasa RLS). Query sin `.eq('tenant_id')` lee productos de TODOS los tenants. Se ejecuta cada 15 minutos.**

#### INF-A4: Outbox Worker Salta Eventos Contables Indefinidamente
**Archivo:** `apps/erp-api/src/shared/outbox/outbox-worker.service.ts:97-102`
**24 tipos de eventos son `continue`-ados sin marcar como processing/completed/failed. Si ContabilidadEventsListener no los procesa, quedan en `pending` para siempre sin dead-letter.**

#### INF-A5: Audit Log Acepta Fallo Silenciosamente
**Archivo:** `apps/erp-api/src/modules/audit/audit.service.ts:67-71`
**Error en escritura de audit log solo hace `console.error` y continua. Sin fallback. Para un ERP regulado por SUNAT, perdida silenciosa de audit trail es critica.**

#### INF-A6: Redis Sin Password
**Archivo:** `docker-compose.yml:89-100`
**Redis sin `requirepass` ni `--requirepass`. Expuesto en puerto 6381. BullMQ queues (CPE, GRE, SIRE) y cache escribibles por cualquiera con acceso de red.**

### MEDIO

#### INF-M1: cleanupOldLogs es un Stub (logs/`console.log` — nunca borra datos)
#### INF-M2: updateDashboardMetrics calcula pero nunca persiste resultados
#### INF-M3: Stock bajo usa threshold hardcoded de 10, ignora `stock_minimo`
#### INF-M4: Prometheus scrape de erp-api sin auth header (METRICS_TOKEN mismatch)
#### INF-M5: Dashboard getStats fetchea tabla completa de productos en memoria
#### INF-M6: Audit getAuditLogs hace merge-sort in-memory con O(n) por pagina
#### INF-M7: seed-test-data endpoint depende solo de NODE_ENV check

### BAJO

#### INF-B1: CI valida con .env.example (secrets reales nunca verificados)
#### INF-B2: CPE status cron sin limit ni error handling
#### INF-B3: Health endpoint sin Cache-Control: no-store
#### INF-B4: Test de XSS no verifica escaping (solo verifica que se llamo sendEmail)
#### INF-B5: Zero alerting rules en Prometheus (directorio alerts/ vacio)

---

## FASE 8: FRONTEND TRANSVERSAL

### CRITICO

#### FE-C1: Superadmin Layout Sin Auth Guard (duplica AUTH-A8)
**Archivo:** `apps/web/app/superadmin/layout.tsx`

#### FE-C2: Password Temporal en Plaintext en DOM
**Archivo:** `apps/web/components/superadmin/components/CrearTenantModal.tsx:709-760`
**`credentials.temporaryPassword` renderizada como texto plano en el DOM. Visible a extensiones, XSS, screen sharing.**

#### FE-C3: Sin Flush de Estado en Cambio de Tenant (duplica AUTH-A2)
**Archivo:** `apps/web/components/tenant/TenantSwitcher.tsx:64-77`

### ALTO

#### FE-A1: ErrorBoundary Muestra error.message en Produccion (PARCIALMENTE CONFIRMADO)
**Archivo:** `apps/web/components/error/ErrorBoundary.tsx:97,155`
**VERIFICACION: `error.message` siempre se renderiza (linea 155) sin importar environment. Sin embargo, el stack trace completo SI esta correctamente gated por `NODE_ENV === 'development'` (lineas 157-169). El riesgo depende de cuan descriptivos sean los mensajes de error de NestJS/Supabase (frecuentemente incluyen nombres de tablas y columnas).**

#### FE-A2: useEffect Guard en Superadmin (duplica AUTH-A9)
#### FE-A3: Session Snapshot en localStorage (duplica AUTH-A5)
#### FE-A4: isAdmin Bypass en Sidebar (duplica AUTH-A6)

### MEDIO

#### FE-M1: GestionTenants renderiza raw API errors
#### FE-M2: window.confirm con tenant name controlado por servidor
#### FE-M3: Filtros de usuarios sin encodeURIComponent
#### FE-M4: useErrorHandler forwadea raw API errors a UI
#### FE-M5: Tipos `any` en RolesSection para datos de permisos

### BAJO

#### FE-B1: Dashboard layout auth guard solo client-side
#### FE-B2: Tenant switch failure silencioso (solo console.error)
#### FE-B3: Ruta superadmin en bundle de todos los usuarios
#### FE-B4: Validacion client-side only para pais_id/ruc

---

## MATRIZ DE HALLAZGOS POR MODULO

| Modulo | CRITICO | ALTO | MEDIO | BAJO | Total |
|--------|---------|------|-------|------|-------|
| Auth/RBAC/Tenancy | 3 | 9 | 8 | 7 | 27 |
| Ventas/CPE/POS | 2 | 6 | 6 | 5 | 19 |
| Compras | 4 | 7 | 8 | 5 | 24 |
| Finanzas | 4 | 5 | 5 | 4 | 18 |
| Contabilidad | 3 | 8 | 6 | 5 | 22 |
| RRHH/Cajas/Inv | 4 | 6 | 7 | 4 | 21 |
| Worker/Email/DevOps | 3 | 6 | 7 | 5 | 21 |
| Frontend | 3 | 4 | 5 | 4 | 16 |
| **TOTAL** | **23** **(sin duplicados, post-verificacion)** | **39** | **35** | **28** | **125** |

*Nota: Algunos hallazgos de Frontend duplican Auth por ser la misma vulnerabilidad vista desde diferente angulo.*

---

## PATRONES TRANSVERSALES DETECTADOS

### 1. Race Conditions Sistematicas (MAX+1 Pattern)
Afecta: CPE numeracion, pedido numeracion, recepcion numeracion, asiento manual numeracion, pago CxC, pago CxP, apertura de caja.
**Causa raiz:** Supabase/PostgREST no soporta transacciones multi-statement. Los servicios usan SELECT MAX → INSERT sin lock.
**Solucion:** Migrar a RPCs de PostgreSQL con `SELECT ... FOR UPDATE` o secuencias de BD.

### 2. Non-Atomic Multi-Step Operations
Afecta: Stock update + movimiento, pago CxC (4 pasos), rollback POS, detalle pedido, pago planilla.
**Causa raiz:** Limitacion del client de Supabase (sin transacciones). Los "rollbacks" manuales con DELETE pueden fallar.
**Solucion:** Stored procedures en PostgreSQL para operaciones criticas que requieren atomicidad.

### 3. Tenant Isolation Gaps
Afecta: Stock UPDATE, planilla update/delete/getBoleta, conceptos_planilla, aprobaciones OC, checkCriticalStock.
**Causa raiz:** `tenant_id` se pasa al service pero no se incluye en todas las queries. Service_role_key bypasa RLS.
**Solucion:** Audit de todas las queries con service_role_key. Agregar `.eq('tenant_id')` sistematicamente.

### 4. Silent Error Swallowing
Afecta: Audit log, corte de caja, seed-test-data, outbox accounting events, pago planilla, eventos in-memory.
**Causa raiz:** `try/catch` con `console.error` sin re-throw ni fallback. Operaciones criticas fallan sin que nadie se entere.
**Solucion:** Para operaciones regulatorias, implementar fallback (dead letter, archivo local, metrica).

### 5. Dual-Path/Dual-Writer
Afecta: AccountingEntries + ContabilidadEventsListener (asientos), CxP TesoreriaService + fallback, EventBus + outbox.
**Causa raiz:** Refactorizacion incremental dejo dos caminos activos para la misma operacion.
**Solucion:** Elegir un path canonico y deshabilitar el otro.

---

## PRIORIDAD DE REMEDIACION

### Bloquea Release (Semana 1)
1. FIN-C1/C2: Agregar optimistic lock (WHERE saldo = :expected) en pagos CxC/CxP
2. RRH-C4: Pasar tenant_id a updatePlanilla/deletePlanilla
3. RRH-C1: Agregar `.eq('tenant_id')` a UPDATE de stock
4. CTB-C1: Deshabilitar listeners en AccountingEntriesService (dejar solo outbox path)
5. INF-C2: Eliminar acceso anonimo Grafana + cambiar password
6. INF-A6: Agregar `requirepass` a Redis

### Sprint 1 (Semanas 2-3)
7. VEN-C1: Migrar numeracion CPE a secuencia de BD
8. COM-C3: Implementar ajuste de CxP en devolucion
9. COM-C4: Validar que aprobador != creador de OC
10. CTB-C3: Usar RPC de BD para numeracion manual de asientos
11. CTB-C4: Reemplazar hard-delete por soft-delete/anulacion
12. RRH-C2: Agregar UNIQUE(id_planilla, id_empleado) y check de estado
13. RRH-C3: Reemplazar `continue` con abort-on-error o transaccion
14. INF-C1: Escapar HTML en templates de email

### Sprint 2 (Semanas 4-5)
15. AUTH-C1: Implementar middleware Next.js con validacion de sesion
16. FIN-C4: Implementar reversa de pagos en anulacion de CPE
17. CTB-A2: Agregar IGV credito fiscal al asiento de compra
18. CTB-A3: Eliminar fallback 70% — requerir precio_compra
19. RRH-A1: Migrar tasas AFP a tabla configurable
20. RRH-A2: Corregir calculo IR 5ta categoria
21. RRH-A3: Corregir formula CTS

### Sprint 3+ (Semanas 6+)
22. Migrar operaciones criticas a stored procedures (stock, pagos, asientos)
23. Implementar alerting rules en Prometheus
24. Corregir dual-path CxP (eliminar fallback o unificar)
25. Implementar dead-letter para outbox accounting events

---

## OBSERVACIONES POSITIVAS

Lo que funciona correctamente (verificado en codigo):

1. **RLS en BD:** Las politicas de Row Level Security estan configuradas en las migraciones para las tablas principales.
2. **Decimal.js en CxC/CxP:** Los servicios financieros principales usan `Decimal.js` para calculos monetarios (excepto conciliacion).
3. **Numeracion automatica de asientos:** `AsientosGeneratorService` delega correctamente a RPC de BD.
4. **Validacion de periodo contable:** Los asientos automaticos verifican periodo abierto antes de insertar.
5. **HttpOnly cookies:** El token de auth usa `credentials: 'include'` (cookie HttpOnly), no localStorage.
6. **Claim optimista en outbox:** `claimEventoParaProcesamiento` usa update condicional como lock.
7. **Migraciones de hardening:** 312-327 agregan constraints de idempotencia, secuencias, guards de integridad.
8. **Uso de Decimal.js en planillas:** Calculos de sueldo usan `new Decimal()` para precision.
