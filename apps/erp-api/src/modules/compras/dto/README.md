# DTOs del Módulo de Compras

Este directorio contiene todos los Data Transfer Objects (DTOs) utilizados en el módulo de compras del ERP.

## Estructura de DTOs

### 📦 Proveedores

- **CreateProveedorDto**: Crear nuevo proveedor
  - Validaciones: RUC (11 dígitos Perú / 9 Colombia), email válido, límite de crédito >= 0
  - Campos requeridos: `ruc`, `razon_social`, `email`
  - Campos opcionales: `nombre_comercial`, `direccion`, `telefono`, `contacto`, `condiciones_pago`, `limite_credito`, `dias_credito`

- **UpdateProveedorDto**: Actualizar proveedor existente
  - Extiende CreateProveedorDto con PartialType (todos los campos opcionales)

### 📋 Cotizaciones de Compra

- **CreateCotizacionCompraDto**: Crear nueva cotización
  - Campos requeridos: `numero`, `proveedor_id`, `detalles[]`
  - Campos opcionales: `fecha_cotizacion`, `validez_dias`, `estado`, `observaciones`
  - Validaciones: Al menos 1 producto, cantidades > 0, precios >= 0

- **UpdateCotizacionCompraDto**: Actualizar cotización
  - Todos los campos opcionales
  - Permite actualizar detalles completos

- **EnviarCotizacionDto**: Enviar cotización al proveedor
  - Campos opcionales: `observaciones`

- **AprobarCotizacionDto**: Aprobar cotización
  - Campos opcionales: `comentarios`

- **RechazarCotizacionDto**: Rechazar cotización
  - Campos requeridos: `motivo`

### 🛒 Órdenes de Compra

- **CreateOrdenCompraDto**: Crear nueva orden de compra
  - Campos requeridos: `numero`, `proveedor_id`, `detalles[]`
  - Campos opcionales: `cotizacion_id`, `fecha_orden`, `fecha_entrega_esperada`, `condiciones_pago`, `dias_credito`, `almacen_destino_id`, `estado`, `observaciones`
  - Validaciones: Al menos 1 producto, cantidades > 0, precios >= 0

- **UpdateOrdenCompraDto**: Actualizar orden de compra
  - Todos los campos opcionales

- **AprobarOrdenCompraDto**: Aprobar orden de compra
  - Campos opcionales: `aprobador_id`, `aprobador_nombre`, `comentarios`

- **RechazarOrdenCompraDto**: Rechazar orden de compra
  - Campos requeridos: `motivo_rechazo`
  - Campos opcionales: `rechazado_por_id`, `rechazado_por_nombre`

- **CancelarOrdenCompraDto**: Cancelar orden de compra
  - Campos requeridos: `motivo_cancelacion`
  - Campos opcionales: `cancelado_por_id`, `cancelado_por_nombre`

### 📥 Recepciones

- **CreateRecepcionDto**: Crear nueva recepción de mercancía
  - Campos requeridos: `orden_id`, `items[]`
  - Campos opcionales: `observaciones`, `almacen_id`, `ubicacion_id`, `lote`
  - Cada item incluye: `detalle_id`, `cantidad_recibida`, `calidad`, `almacen_id`, `ubicacion_id`, `lote`, `serie`, `fecha_expiracion`, `observaciones`

- **ItemRecepcionDto**: Detalle de item recibido
  - Campos requeridos: `detalle_id`, `cantidad_recibida`, `calidad`
  - Calidad: OK | OBSERVADO | RECHAZADO

- **CerrarRecepcionDto**: Cerrar recepción
  - Campos opcionales: `observaciones`

### 🔄 Devoluciones a Proveedor

- **CreateDevolucionProveedorDto**: Crear devolución
  - Campos requeridos: `orden_id`, `proveedor_id`, `motivo`, `items[]`
  - Campos opcionales: `recepcion_id`, `observaciones`

- **ItemDevolucionDto**: Detalle de item devuelto
  - Campos requeridos: `producto_id`, `descripcion`, `cantidad`, `precio_unitario`
  - Campos opcionales: `recepcion_item_id`, `almacen_id`, `lote`, `serie`, `motivo_detalle`

- **EmitirDevolucionDto**: Emitir devolución
  - Campos opcionales: `observaciones`

## Enums Utilizados

### CondicionesPago
```typescript
enum CondicionesPago {
  CONTADO = 'CONTADO',
  CREDITO_15 = 'CREDITO_15',
  CREDITO_30 = 'CREDITO_30',
  CREDITO_45 = 'CREDITO_45',
  CREDITO_60 = 'CREDITO_60',
  CREDITO_90 = 'CREDITO_90'
}
```

### EstadoCotizacionCompra
```typescript
enum EstadoCotizacionCompra {
  BORRADOR = 'BORRADOR',
  ENVIADA = 'ENVIADA',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  VENCIDA = 'VENCIDA'
}
```

### EstadoOrdenCompra
```typescript
enum EstadoOrdenCompra {
  BORRADOR = 'BORRADOR',
  APROBACION = 'APROBACION',
  APROBADA = 'APROBADA',
  PARCIAL = 'PARCIAL',
  RECIBIDA = 'RECIBIDA',
  CERRADA = 'CERRADA',
  ANULADA = 'ANULADA'
}
```

### CalidadRecepcion
```typescript
enum CalidadRecepcion {
  OK = 'OK',
  OBSERVADO = 'OBSERVADO',
  RECHAZADO = 'RECHAZADO'
}
```

## Validaciones Personalizadas

### @IsValidRuc
Valida que el RUC sea válido según el país:
- Perú: 11 dígitos numéricos
- Colombia: 9 dígitos numéricos

Ubicación: `apps/erp-api/src/modules/compras/validators/is-valid-ruc.validator.ts`

## Uso en Controladores

Todos los DTOs están exportados desde `index.ts` para facilitar su importación:

```typescript
import {
  CreateProveedorDto,
  UpdateProveedorDto,
  CreateCotizacionCompraDto,
  // ... otros DTOs
} from '../dto';
```

## Documentación OpenAPI

Todos los DTOs incluyen decoradores de Swagger (@ApiProperty, @ApiPropertyOptional) para generar documentación automática de la API.

## Validaciones Comunes

- **UUIDs**: Validados con `@IsUUID('4')`
- **Emails**: Validados con `@IsEmail()`
- **Números positivos**: Validados con `@Min(0)` o `@Min(0.01)`
- **Strings**: Validados con `@MinLength()` y `@MaxLength()`
- **Enums**: Validados con `@IsEnum()`
- **Arrays**: Validados con `@IsArray()` y `@ArrayMinSize()`
- **Objetos anidados**: Validados con `@ValidateNested()` y `@Type()`

## Notas Importantes

1. Todos los DTOs usan `class-validator` para validaciones
2. Los DTOs de actualización (Update) extienden los de creación con `PartialType`
3. Los campos opcionales usan `@IsOptional()` antes de otras validaciones
4. Los arrays de objetos anidados requieren `@Type()` para transformación
5. Los mensajes de error están personalizados en español
