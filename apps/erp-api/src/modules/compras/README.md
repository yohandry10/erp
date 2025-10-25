# Módulo de Compras - Recepciones

## Descripción

El módulo de recepciones permite gestionar la recepción de mercancía de órdenes de compra, actualizando automáticamente el inventario y el estado de las órdenes.

## Flujo de Recepción

1. **Crear Recepción (BORRADOR)**: Se crea una recepción asociada a una orden de compra en estado APROBADA o PARCIAL
2. **Registrar Items**: Se registran los items recibidos con sus cantidades, calidad, lotes, series, etc.
3. **Cerrar Recepción**: Al cerrar la recepción:
   - Se crean movimientos de inventario (ENTRADA) para items con calidad OK u OBSERVADO
   - Se actualiza la cantidad_recibida en orden_compra_detalles
   - Se actualiza el estado de la orden de compra (PARCIAL o RECIBIDA)
   - Se emite evento RecepcionRegistrada para integración con CxP

## Estados de Recepción

- **BORRADOR**: Recepción creada pero no cerrada, se puede modificar
- **CERRADA**: Recepción cerrada, inventario actualizado, no se puede modificar

## Calidad de Recepción

- **OK**: Producto recibido en buen estado, se ingresa al inventario
- **OBSERVADO**: Producto con observaciones pero aceptable, se ingresa al inventario
- **RECHAZADO**: Producto rechazado, NO se ingresa al inventario, se debe crear devolución

## API Endpoints

### GET /api/compras/recepciones
Lista todas las recepciones con filtros opcionales.

**Query Parameters:**
- `estado`: Filtrar por estado (BORRADOR, CERRADA)
- `orden_id`: Filtrar por orden de compra
- `fecha_desde`: Filtrar desde fecha
- `fecha_hasta`: Filtrar hasta fecha

**Response:**
```json
[
  {
    "id": "uuid",
    "numero": "REC-2025-0001",
    "orden_id": "uuid",
    "fecha_recepcion": "2025-10-24T10:00:00Z",
    "estado": "CERRADA",
    "observaciones": "Recepción completa",
    "orden": {
      "id": "uuid",
      "numero": "OC-2025-001",
      "proveedor": {
        "id": "uuid",
        "razon_social": "Proveedor ABC",
        "ruc": "20123456789"
      }
    }
  }
]
```

### GET /api/compras/recepciones/:id
Obtiene una recepción específica con sus items.

**Response:**
```json
{
  "id": "uuid",
  "numero": "REC-2025-0001",
  "orden_id": "uuid",
  "fecha_recepcion": "2025-10-24T10:00:00Z",
  "estado": "CERRADA",
  "observaciones": "Recepción completa",
  "orden": {
    "id": "uuid",
    "numero": "OC-2025-001",
    "proveedor": {
      "id": "uuid",
      "razon_social": "Proveedor ABC",
      "ruc": "20123456789"
    }
  },
  "items": [
    {
      "id": "uuid",
      "detalle_id": "uuid",
      "producto_id": "uuid",
      "cantidad_recibida": 100,
      "calidad": "OK",
      "almacen_id": "uuid",
      "ubicacion_id": "uuid",
      "lote": "LOTE-001",
      "serie": null,
      "fecha_expiracion": "2026-12-31",
      "observaciones": null,
      "producto": {
        "id": "uuid",
        "codigo": "PROD-001",
        "nombre": "Producto A"
      }
    }
  ]
}
```

### POST /api/compras/ordenes/:ordenId/recepciones
Crea una nueva recepción para una orden de compra.

**Request Body:**
```json
{
  "orden_id": "uuid",
  "items": [
    {
      "detalle_id": "uuid",
      "cantidad_recibida": 100,
      "calidad": "OK",
      "almacen_id": "uuid",
      "ubicacion_id": "uuid",
      "lote": "LOTE-001",
      "serie": null,
      "fecha_expiracion": "2026-12-31",
      "observaciones": null
    }
  ],
  "observaciones": "Recepción parcial",
  "almacen_id": "uuid",
  "ubicacion_id": "uuid",
  "lote": "LOTE-001"
}
```

**Response:**
```json
{
  "id": "uuid",
  "numero": "REC-2025-0001",
  "estado": "BORRADOR",
  ...
}
```

### PUT /api/compras/recepciones/:id
Actualiza una recepción en estado BORRADOR.

**Request Body:**
```json
{
  "observaciones": "Observaciones actualizadas"
}
```

### POST /api/compras/recepciones/:id/cerrar
Cierra una recepción y actualiza el inventario.

**Request Body:**
```json
{
  "observaciones": "Recepción cerrada correctamente"
}
```

**Response:**
```json
{
  "id": "uuid",
  "numero": "REC-2025-0001",
  "estado": "CERRADA",
  "cerrado_por": "uuid",
  "cerrado_at": "2025-10-24T10:30:00Z",
  ...
}
```

## Validaciones

1. **Orden de Compra**: Debe estar en estado APROBADA o PARCIAL
2. **Cantidad Recibida**: No puede exceder la cantidad pendiente de recibir
3. **Estado BORRADOR**: Solo se pueden actualizar recepciones en estado BORRADOR
4. **Items Mínimos**: La recepción debe tener al menos un item para cerrarla
5. **Almacén**: Si multialmacén está habilitado, se debe especificar almacén para cada item

## Integración con Inventario

Al cerrar una recepción:

1. Se crea un movimiento de inventario tipo ENTRADA para cada item con calidad OK u OBSERVADO
2. Se actualiza producto_existencias por almacén/ubicación/lote
3. Se actualiza la valorización del inventario (Promedio/FIFO)
4. Items con calidad RECHAZADO NO se ingresan al inventario

## Integración con CxP (Cuentas por Pagar)

Al cerrar una recepción, se emite el evento `RecepcionRegistrada` que puede ser escuchado por el módulo de finanzas para:

1. Crear automáticamente una cuenta por pagar
2. Calcular fecha de vencimiento según condiciones de pago
3. Vincular la CxP con la recepción y orden de compra

## Ejemplo de Uso Completo

```typescript
// 1. Crear recepción
const recepcion = await fetch('/api/compras/ordenes/{ordenId}/recepciones', {
  method: 'POST',
  body: JSON.stringify({
    orden_id: 'orden-uuid',
    items: [
      {
        detalle_id: 'detalle-uuid',
        cantidad_recibida: 100,
        calidad: 'OK',
        almacen_id: 'almacen-uuid',
        lote: 'LOTE-001'
      }
    ],
    observaciones: 'Primera recepción'
  })
});

// 2. Cerrar recepción
const cerrada = await fetch(`/api/compras/recepciones/${recepcion.id}/cerrar`, {
  method: 'POST',
  body: JSON.stringify({
    observaciones: 'Recepción completada'
  })
});

// 3. Verificar estado de la orden
const orden = await fetch(`/api/compras/ordenes/${ordenId}`);
console.log(orden.estado); // PARCIAL o RECIBIDA
```

## Troubleshooting

### Error: "La orden debe estar en estado APROBADA o PARCIAL"
- Verificar que la orden de compra esté aprobada antes de crear una recepción

### Error: "La cantidad recibida excede la cantidad pendiente"
- Verificar las cantidades ya recibidas en recepciones anteriores
- Ajustar la cantidad a recibir

### Error: "Solo se pueden cerrar recepciones en estado BORRADOR"
- No se puede cerrar una recepción que ya está cerrada
- Crear una nueva recepción si se necesita registrar más mercancía

### Error: "La recepción debe tener al menos un item"
- Agregar items a la recepción antes de cerrarla

## Próximas Funcionalidades

- [ ] Devoluciones a proveedor para items rechazados
- [ ] Integración automática con CxP
- [ ] Notificaciones de recepción
- [ ] Reportes de recepciones
- [ ] Escaneo de códigos de barras para recepción rápida
