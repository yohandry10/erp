# Módulo de Logística

## Descripción

El módulo de Logística gestiona el flujo logístico completo de pedidos de venta cuando `usar_flujo_logistica = true` en la configuración del tenant. Este módulo permite a las empresas medianas y grandes controlar el proceso de preparación y despacho de pedidos desde el almacén.

## Flujo de Estados

Cuando `usar_flujo_logistica = true`, los pedidos siguen este flujo:

1. **PENDIENTE** → Usuario crea el pedido
2. **CONFIRMADO** → Usuario confirma el pedido (reserva stock)
3. **EN_PREPARACION** → Personal de almacén inicia preparación
4. **LISTO_DESPACHO** → Personal de almacén marca como listo
5. **LISTO_FACTURAR** → Personal de almacén confirma despacho (descuenta stock)
6. **FACTURADO** → Usuario genera factura
7. **COMPLETADO** o **COMPLETADO_CON_GRE** → Proceso finalizado

## Endpoints

### GET /api/inventario/logistica/ordenes-pendientes
Lista todos los pedidos en estado CONFIRMADO que requieren preparación.

**Response:**
```json
[
  {
    "id": "uuid",
    "numero": "PV-2024-0001",
    "fecha": "2024-01-15",
    "cliente_id": "uuid",
    "clientes": {
      "razon_social": "Cliente SA",
      "documento_numero": "20123456789"
    },
    "estado": "CONFIRMADO",
    "total": 1500.00,
    "cantidad_items": 5,
    "items": [...]
  }
]
```

### POST /api/inventario/logistica/:pedidoId/preparar
Inicia la preparación de un pedido, cambiando su estado a EN_PREPARACION.

**Request Body:**
```json
{
  "notas": "Iniciando preparación del pedido"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /api/inventario/logistica/:pedidoId/marcar-listo
Marca un pedido como listo para despacho, cambiando su estado a LISTO_DESPACHO.

**Response:**
```json
{
  "success": true
}
```

### POST /api/inventario/logistica/:pedidoId/confirmar-despacho
Confirma el despacho del pedido:
- Crea movimientos de inventario tipo SALIDA
- Descuenta stock_actual
- Libera stock_reservado
- Cambia estado a LISTO_FACTURAR

**Request Body:**
```json
{
  "notas": "Pedido despachado en camión ABC-123",
  "items_despachados": ["item-uuid-1", "item-uuid-2"]
}
```

**Response:**
```json
{
  "success": true
}
```

## Permisos

Los siguientes permisos controlan el acceso al módulo:

- `inventario.logistica.ver` - Ver órdenes pendientes
- `inventario.logistica.preparar` - Iniciar preparación de pedidos
- `inventario.logistica.despachar` - Confirmar despacho de pedidos

## Integración con Pedidos

El módulo de Logística se integra directamente con el módulo de Pedidos (`ventas/pedidos`):

- Lee pedidos en estado CONFIRMADO
- Actualiza estados de pedidos
- Crea movimientos de inventario
- Envía notificaciones al módulo de Ventas

## Configuración

El módulo solo está activo cuando:
```sql
SELECT usar_flujo_logistica FROM empresa_config WHERE tenant_id = ?
-- Debe retornar true
```

Si `usar_flujo_logistica = false`, el módulo retorna listas vacías y rechaza operaciones.

## Notificaciones

El módulo emite las siguientes notificaciones:

- `PEDIDO_EN_PREPARACION` - Cuando se inicia la preparación
- `PEDIDO_LISTO_DESPACHO` - Cuando el pedido está listo para despachar
- `PEDIDO_LISTO_FACTURAR` - Cuando el despacho es confirmado

## Archivos

```
logistica/
├── dto/
│   ├── preparar-pedido.dto.ts
│   ├── confirmar-despacho.dto.ts
│   └── index.ts
├── logistica.controller.ts
├── logistica.service.ts
├── logistica.module.ts
├── index.ts
└── README.md
```

## Requirements Implementados

- **9.1, 9.2**: Listar órdenes pendientes de preparación
- **9.3, 9.4, 9.5**: Preparar pedido
- **9.6**: Marcar como listo para despacho
- **9.7**: Confirmar despacho con descuento de stock
- **14.6**: Permisos granulares
- **21.1, 21.2**: Bandeja de órdenes pendientes
- **21.3, 21.4**: Preparación de pedidos
- **21.5, 21.6**: Estados de preparación
- **21.7, 21.8**: Confirmación de despacho

## Ejemplo de Uso

```typescript
// 1. Obtener órdenes pendientes
const ordenes = await logisticaService.getOrdenesPendientes(tenantId);

// 2. Iniciar preparación
await logisticaService.prepararPedido(pedidoId, tenantId, {
  notas: 'Iniciando preparación'
});

// 3. Marcar como listo
await logisticaService.marcarListoDespacho(pedidoId, tenantId);

// 4. Confirmar despacho (descuenta stock)
await logisticaService.confirmarDespacho(pedidoId, tenantId, {
  notas: 'Despachado en camión ABC-123'
});
```

## Validaciones

- Solo funciona si `usar_flujo_logistica = true`
- Valida transiciones de estado correctas
- Verifica que el pedido pertenezca al tenant
- Requiere autenticación JWT
- Aplica permisos granulares

## Notas Técnicas

- Usa transacciones atómicas para operaciones de inventario
- Integra con el sistema de notificaciones
- Registra todas las operaciones en notas del pedido
- Compatible con el flujo simplificado (se desactiva automáticamente)
