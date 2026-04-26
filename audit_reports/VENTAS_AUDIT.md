# Auditoría profunda — Ventas (cotizaciones/pedidos/RMA → CPE/GRE)

Fecha: 2025-12-13

## 1) Scope auditado (código)
- Cotizaciones:
  - `apps/erp-api/src/modules/ventas/cotizaciones/cotizaciones.service.ts`
  - RPCs: `supabase/migrations/146__cotizaciones_stock_reserva_transaccional.sql`
- Pedidos:
  - `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`
  - RPC `crear_pedido_completo`: `supabase/migrations/161__e2e_rpc_tenant_context.sql`
- Integraciones documentos:
  - `apps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts`
  - `apps/erp-api/src/modules/ventas/pedidos/gre-integration.service.ts`
- RMA:
  - `apps/erp-api/src/modules/ventas/rma/rma.service.ts`

## 2) Flujo: Cotización → (reserva stock) → Pedido

### 2.1 Crear cotización (`CotizacionesService.create`)
- **Validaciones**:
  - Cliente por `tenant_id`.
  - Stock disponible: `productos.stock - productos.stock_reservado` (hard stop).
- **Riesgo de concurrencia**:
  - La validación de stock es “read-only” (sin locks) y se ejecuta *antes* del insert; otra transacción puede consumir stock entre validación y reserva.
- **Reserva**:
  - Se llama a RPC `reservar_stock_cotizacion` pero los errores se **ignoran** (“best-effort”) y la cotización queda creada igual.
  - Esto rompe el supuesto “cotización reserva stock” en escenarios de carrera (oversell o inconsistencias de `stock_reservado`).
- **Recomendación**:
  - Convertir a flujo transaccional: RPC que inserte cotización + detalles + reserve stock con `FOR UPDATE` en productos.
  - Si se mantiene best-effort: persistir estado “RESERVA_FALLIDA” o warning a usuario y bloqueo de conversión a pedido hasta regularizar.

### 2.2 Convertir cotización a pedido (`CotizacionesService.convertirAPedido`)
- Usa RPC transaccional `convertir_cotizacion_a_pedido` con `FOR UPDATE` sobre `cotizaciones` para evitar doble conversión.
- **Observación**: el RPC comenta “transferir reserva” pero no registra una referencia explícita del stock reservado; asume que el `stock_reservado` ya quedó en productos.

## 3) Hallazgo corregido: nombre de tabla incorrecto en delete cotización
- **Dónde**: `apps/erp-api/src/modules/ventas/cotizaciones/cotizaciones.service.ts`
- **Qué pasaba**: al eliminar, usaba `cotizaciones_detalle` (tabla inexistente) en lugar de `cotizacion_detalles`.
- **Impacto**: detalles huérfanos y/o delete parcial.
- **Fix aplicado**: ahora elimina desde `cotizacion_detalles`.

## 3b) Hallazgo corregido: update de cotización usaba tabla/columna incorrecta
- **Dónde**: `apps/erp-api/src/modules/ventas/cotizaciones/cotizaciones.service.ts`
- **Qué pasaba**:
  - El update del detalle usaba `cotizaciones_detalle` (tabla incorrecta) en lugar de `cotizacion_detalles`.
  - Al actualizar “notas”, intentaba escribir columna `notas` en `cotizaciones`, pero en create se usa `observaciones` (columna real).
- **Impacto**:
  - Update de detalle fallaba silenciosamente o dejaba estado inconsistente (detalle no actualizado).
  - La UI podía “guardar notas” pero no persistían en DB.
- **Fix aplicado**:
  - `cotizacion_detalles` como tabla única de detalle.
  - `observaciones` como columna de notas.
  - Manejo explícito de error si falla el delete del detalle.
- **Tests**:
  - `apps/erp-api/src/modules/ventas/cotizaciones/cotizaciones.update.spec.ts`

## 4) Flujo: Pedido → documento (CPE/GRE) y contabilidad
- `PedidosService.create` usa `crear_pedido_completo` (RPC) para inserción atómica cabecera+detalle.
- Se observa uso de RPCs de inventario (`reservar_stock_atomico`, `descontar_stock_y_liberar_reserva`) en etapas posteriores (confirmación/generación).
- **Idempotencia**:
  - Existe `facturaIdempotencyKey` en `PedidosService` para integración financiera; falta auditoría end‑to‑end de dedupe (T-0601 pendiente).

### 4.1 Hallazgo corregido: facturación (flujo simplificado) podía duplicar salidas y silenciar transición de estado
- **Dónde**: `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts` (`generarFactura`)
- **Qué pasaba**:
  - Si el pedido venía `CONFIRMADO` (flujo simplificado), la promoción a `LISTO_FACTURAR` se intentaba pero se silenciaba el error.
  - Si fallaba CPE/OSE tras registrar salidas, un reintento podía volver a descontar stock y duplicar `movimientos_inventario`.
- **Fix aplicado**:
  - No se silencia el error de transición.
  - Dedupe por ítem: si ya existe movimiento `SALIDA` para el pedido/producto, no se vuelve a insertar ni a llamar RPC.
- **Test**: `apps/erp-api/src/modules/ventas/pedidos/pedidos.facturacion.spec.ts`

### 4.2 Hallazgo corregido: cancelación podía duplicar liberación de stock en reintentos parciales
- **Dónde**: `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts` (`cancelarPedido`)
- **Qué pasaba**:
  - Si fallaba `updateEstado` después de decrementar reserva, un reintento podía volver a decrementar `stock_reservado` y duplicar movimientos de `LIBERACION`.
  - Reset de `pedidos_venta_detalle` no filtraba `tenant_id`.
- **Fix aplicado**:
  - Dedupe por movimiento `LIBERACION` existente por pedido+producto antes de decrementar reserva.
  - Update de detalle ahora filtra por `tenant_id`.
- **Test**: `apps/erp-api/src/modules/ventas/pedidos/pedidos.cancelar.spec.ts`

## 4.3 Hallazgo corregido: RMA nota de crédito con moneda hardcodeada
- **Dónde**: `apps/erp-api/src/modules/ventas/rma/rma.service.ts` (`generarNotaCredito`)
- **Qué pasaba**: la nota de crédito se creaba con `moneda: 'PEN'` fijo, ignorando `empresa_config.moneda_defecto`.
- **Fix aplicado**: derivar moneda desde `empresa_config.moneda_defecto` (fallback `PEN`) al construir el payload del documento.
- **Test**: `apps/erp-api/src/modules/ventas/rma/rma.nota-credito.moneda.spec.ts`

## 5) Próximas verificaciones necesarias (para cerrar T-0601)
- Casos límite de estados:
  - Cotización vencida y conversión.
  - Pedido cancelado: liberar reserva vs ajustes (inventario).
  - Pedido facturado: no permitir re-facturar (idempotencia).
- Integración CPE/GRE:
  - Reintentos técnicos vs funcionales (SUNAT/OSE).
  - Garantía de no duplicar CPE/GRE en reintentos (idempotency_key + unique index).
- RMA:
  - Reversos de stock y nota de crédito; validación de asientos contables y dedupe por `source_event_id`.
