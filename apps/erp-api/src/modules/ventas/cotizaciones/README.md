# Módulo de Cotizaciones

Este módulo gestiona las cotizaciones del sistema de ventas.

## Características

- ✅ CRUD completo de cotizaciones
- ✅ Cálculo automático de totales (subtotal, IGV 18%, total)
- ✅ Gestión de estados (BORRADOR, ENVIADA, APROBADA, RECHAZADA, CONVERTIDA, VENCIDA)
- ✅ Conversión de cotización a pedido
- ✅ Vencimiento automático de cotizaciones
- ✅ Filtros por estado, cliente y búsqueda
- ✅ Paginación
- ✅ Validación de límite de 999 productos por cotización

## Endpoints

### GET /api/ventas/cotizaciones
Lista todas las cotizaciones con filtros opcionales.

**Query Parameters:**
- `estado`: Filtrar por estado
- `cliente_id`: Filtrar por cliente
- `search`: Búsqueda por número o cliente
- `page`: Número de página (default: 1)
- `limit`: Registros por página (default: 50)

### POST /api/ventas/cotizaciones
Crea una nueva cotización.

**Body:**
```json
{
  "cliente_id": "uuid",
  "fecha_vencimiento": "2024-12-31",
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

### GET /api/ventas/cotizaciones/:id
Obtiene una cotización específica con su detalle.

### PUT /api/ventas/cotizaciones/:id
Actualiza una cotización existente.

**Nota:** Solo se pueden editar productos en cotizaciones con estado BORRADOR.

### DELETE /api/ventas/cotizaciones/:id
Elimina una cotización.

**Nota:** No se pueden eliminar cotizaciones convertidas a pedido.

### POST /api/ventas/cotizaciones/:id/convertir-pedido
Convierte una cotización a pedido de venta.

**Body:**
```json
{
  "notas": "Notas adicionales para el pedido"
}
```

## Estados de Cotización

- **BORRADOR**: Cotización en edición
- **ENVIADA**: Cotización enviada al cliente
- **APROBADA**: Cotización aprobada por el cliente
- **RECHAZADA**: Cotización rechazada por el cliente
- **CONVERTIDA**: Cotización convertida a pedido
- **VENCIDA**: Cotización que superó su fecha de vencimiento

## Reglas de Negocio

1. Los totales se calculan automáticamente (IGV = 18%)
2. El número de cotización se genera automáticamente (formato: COT-YYYY-NNNN)
3. Solo se pueden editar productos en cotizaciones BORRADOR
4. Solo se pueden convertir cotizaciones en estado BORRADOR, ENVIADA o APROBADA
5. No se pueden eliminar cotizaciones convertidas
6. Las cotizaciones vencidas se marcan automáticamente

## Requirements Implementados

- 3.1: Gestión de cotizaciones con estados
- 3.2: Creación con cálculo de totales
- 3.3: Almacenamiento con estado BORRADOR
- 3.4: Visualización de detalle completo
- 3.5: Edición completa en estado BORRADOR
- 3.6: Cambio de estado a ENVIADA
- 3.7: Vencimiento automático
- 4.1: Conversión a pedido
- 4.2: Creación de pedido desde cotización
- 4.3: Cambio de estado a CONVERTIDA
- 14.3: Permisos granulares
- 15.1: Validación de precio > 0
- 15.2: Validación de cantidad > 0
- 15.3: Validación de límite de 999 items
