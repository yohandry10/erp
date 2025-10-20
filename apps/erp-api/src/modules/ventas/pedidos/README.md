# Módulo de Pedidos de Venta

Este módulo gestiona el ciclo completo de pedidos de venta, desde la creación hasta la facturación, con soporte para flujos adaptativos según el tipo de empresa.

## Características

- ✅ Creación y gestión de pedidos de venta
- ✅ Control de estados del pedido (PENDIENTE → CONFIRMADO → ... → FACTURADO)
- ✅ Reserva automática de inventario al confirmar pedido
- ✅ Liberación de stock al cancelar pedido
- ✅ Flujos adaptativos según configuración del tenant:
  - **Flujo Simple**: PENDIENTE → CONFIRMADO → LISTO_FACTURAR → FACTURADO
  - **Flujo Completo**: PENDIENTE → CONFIRMADO → EN_PREPARACION → LISTO_DESPACHO → LISTO_FACTURAR → FACTURADO
- ✅ Generación de facturas desde pedidos
- ✅ Sugerencia automática de GRE según configuración
- ✅ Validaciones de transición de estados
- ✅ Alertas de stock insuficiente (permite continuar)

## Endpoints

### GET /api/ventas/pedidos
Lista pedidos con filtros opcionales:
- `estado`: Filtrar por estado
- `cliente_id`: Filtrar por cliente
- `fecha_desde`, `fecha_hasta`: Rango de fechas
- `search`: Búsqueda por número o cliente
- `page`, `limit`: Paginación

### POST /api/ventas/pedidos
Crea un nuevo pedido de venta.

**Body:**
```json
{
  "cliente_id": "uuid",
  "cotizacion_id": "uuid (opcional)",
  "detalle": [
    {
      "producto_id": "uuid",
      "descripcion": "Producto X",
      "cantidad": 10,
      "precio_unitario": 100.00
    }
  ],
  "notas": "Notas opcionales"
}
```

### GET /api/ventas/pedidos/:id
Obtiene los detalles completos de un pedido.

### PUT /api/ventas/pedidos/:id
Actualiza un pedido (solo en estado PENDIENTE).

### POST /api/ventas/pedidos/:id/confirmar
Confirma el pedido y reserva el stock.

**Body:**
```json
{
  "forzar_confirmacion": false
}
```

**Response:**
```json
{
  "success": true,
  "warnings": [
    {
      "producto_id": "uuid",
      "descripcion": "Producto X",
      "disponible": 5,
      "solicitado": 10
    }
  ]
}
```

### POST /api/ventas/pedidos/:id/cancelar
Cancela el pedido y libera las reservas de stock.

**Body:**
```json
{
  "motivo": "Cliente canceló la orden"
}
```

### POST /api/ventas/pedidos/:id/generar-factura
Genera una factura electrónica desde el pedido.

**Response:**
```json
{
  "success": true,
  "factura_id": "uuid",
  "sugerir_gre": true
}
```

## Estados del Pedido

1. **PENDIENTE**: Pedido creado, esperando confirmación
2. **CONFIRMADO**: Pedido confirmado, stock reservado
3. **EN_PREPARACION**: En preparación en almacén (solo flujo completo)
4. **LISTO_DESPACHO**: Listo para despacho (solo flujo completo)
5. **LISTO_FACTURAR**: Listo para generar factura
6. **FACTURADO**: Factura generada
7. **COMPLETADO**: Proceso completado sin GRE
8. **COMPLETADO_CON_GRE**: Proceso completado con GRE
9. **CANCELADO**: Pedido cancelado

## Flujos de Trabajo

### Flujo Simplificado (usar_flujo_logistica = false)
```
PENDIENTE → CONFIRMADO → LISTO_FACTURAR → FACTURADO → COMPLETADO
```

En este flujo:
- Al confirmar, se reserva el stock
- Al generar factura, se descuenta el stock y se libera la reserva

### Flujo Completo (usar_flujo_logistica = true)
```
PENDIENTE → CONFIRMADO → EN_PREPARACION → LISTO_DESPACHO → LISTO_FACTURAR → FACTURADO → COMPLETADO
```

En este flujo:
- Al confirmar, se reserva el stock
- El pedido pasa por logística (preparación y despacho)
- Al confirmar despacho, se descuenta el stock y se libera la reserva
- Luego se puede generar la factura

## Integración con Inventario

El módulo se integra con el sistema de inventario mediante:

1. **Movimientos de Inventario**:
   - `RESERVA`: Al confirmar pedido
   - `LIBERACION`: Al cancelar pedido
   - `SALIDA`: Al generar factura (flujo simple) o confirmar despacho (flujo completo)

2. **Stock Reservado**:
   - Se actualiza `stock_reservado` en la tabla `productos`
   - El stock disponible se calcula como: `stock_actual - stock_reservado`

## Validaciones

- ✅ Cliente debe existir
- ✅ Pedido debe tener al menos 1 producto
- ✅ Máximo 999 productos por pedido (límite SUNAT)
- ✅ Cantidad y precio deben ser mayores a 0
- ✅ Transiciones de estado validadas
- ✅ Solo se puede editar pedidos en estado PENDIENTE
- ✅ No se puede cancelar pedidos facturados

## Requirements Implementados

- 5.1: Gestión de pedidos con filtros
- 5.2: Creación y actualización de pedidos
- 5.3: Estados y transiciones
- 5.4: Confirmación de pedidos
- 5.5, 5.6, 5.7: Reserva de stock
- 6.1, 6.2, 6.3: Integración con inventario
- 7.5, 8.1: Flujos adaptativos
- 8.2, 8.3, 8.4, 8.5, 8.6: Generación de facturas
- 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7: Integración con CPE
- 12.1, 12.2, 12.3, 12.4, 12.5, 12.6: Cancelación de pedidos
- 14.4, 14.5: Control de acceso
