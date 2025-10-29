# Quick Reference - Compras DTOs

## Import DTOs

```typescript
import {
  // Proveedores
  CreateProveedorDto,
  UpdateProveedorDto,
  
  // Cotizaciones
  CreateCotizacionCompraDto,
  UpdateCotizacionCompraDto,
  EnviarCotizacionDto,
  AprobarCotizacionDto,
  RechazarCotizacionDto,
  
  // Órdenes de Compra
  CreateOrdenCompraDto,
  UpdateOrdenCompraDto,
  AprobarOrdenCompraDto,
  RechazarOrdenCompraDto,
  CancelarOrdenCompraDto,
  
  // Recepciones
  CreateRecepcionDto,
  CerrarRecepcionDto,
  
  // Devoluciones
  CreateDevolucionProveedorDto,
  EmitirDevolucionDto,
} from '../dto';
```

## Common Patterns

### Creating a Resource
```typescript
@Post()
async create(@Body() dto: CreateXxxDto) {
  return this.service.create(dto);
}
```

### Updating a Resource
```typescript
@Put(':id')
async update(@Param('id') id: string, @Body() dto: UpdateXxxDto) {
  return this.service.update(id, dto);
}
```

### Action with Required Reason
```typescript
@Post(':id/rechazar')
async rechazar(@Param('id') id: string, @Body() dto: RechazarXxxDto) {
  return this.service.rechazar(id, dto.motivo);
}
```

### Action with Optional Comments
```typescript
@Post(':id/aprobar')
async aprobar(@Param('id') id: string, @Body() dto: AprobarXxxDto) {
  return this.service.aprobar(id, dto.comentarios);
}
```

## Validation Examples

### Valid Proveedor
```json
{
  "ruc": "20123456789",
  "razon_social": "DISTRIBUIDORA ABC S.A.C.",
  "email": "contacto@abc.com",
  "limite_credito": 50000
}
```

### Valid Cotización
```json
{
  "numero": "COT-2024-001",
  "proveedor_id": "550e8400-e29b-41d4-a716-446655440001",
  "detalles": [
    {
      "producto_id": "550e8400-e29b-41d4-a716-446655440002",
      "descripcion": "Laptop HP",
      "cantidad": 10,
      "precio_unitario": 2500
    }
  ]
}
```

### Valid Orden de Compra
```json
{
  "numero": "OC-2024-001",
  "proveedor_id": "550e8400-e29b-41d4-a716-446655440001",
  "fecha_entrega_esperada": "2024-11-24",
  "detalles": [
    {
      "producto_id": "550e8400-e29b-41d4-a716-446655440002",
      "descripcion": "Laptop HP",
      "cantidad": 10,
      "precio_unitario": 2500
    }
  ]
}
```

### Valid Recepción
```json
{
  "orden_id": "550e8400-e29b-41d4-a716-446655440001",
  "almacen_id": "550e8400-e29b-41d4-a716-446655440003",
  "items": [
    {
      "detalle_id": "550e8400-e29b-41d4-a716-446655440002",
      "cantidad_recibida": 10,
      "calidad": "OK",
      "lote": "LOTE-2024-001",
      "fecha_expiracion": "2025-12-31"
    }
  ]
}
```

## Enum Values

### CondicionesPago
- `CONTADO`
- `CREDITO_15`
- `CREDITO_30`
- `CREDITO_45`
- `CREDITO_60`
- `CREDITO_90`

### EstadoCotizacionCompra
- `BORRADOR`
- `ENVIADA`
- `APROBADA`
- `RECHAZADA`
- `VENCIDA`

### EstadoOrdenCompra
- `BORRADOR`
- `APROBACION`
- `APROBADA`
- `PARCIAL`
- `RECIBIDA`
- `CERRADA`
- `ANULADA`

### CalidadRecepcion
- `OK`
- `OBSERVADO`
- `RECHAZADO`

## Common Validation Errors

### Invalid RUC
```
El RUC debe tener 11 dígitos (Perú) o 9 dígitos (Colombia) y contener solo números
```

### Invalid Email
```
Debe proporcionar un email válido
```

### Missing Required Field
```
El motivo del rechazo es requerido
```

### Invalid Array
```
Debe incluir al menos un producto
```

### Negative Number
```
El límite de crédito no puede ser negativo
```

## Testing DTOs

```typescript
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

const dto = plainToClass(CreateProveedorDto, {
  ruc: '20123456789',
  razon_social: 'TEST S.A.C.',
  email: 'test@test.com',
});

const errors = await validate(dto);
if (errors.length > 0) {
  console.log('Validation failed:', errors);
}
```
