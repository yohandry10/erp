# Implementación: POST /api/compras/cotizaciones

## Resumen

Implementación completa del endpoint POST para crear cotizaciones de compra, incluyendo:
- DTO con validaciones
- Repository para operaciones de base de datos
- Service con lógica de negocio
- Controller con endpoint REST

## Archivos Creados

### 1. DTO - `dto/create-cotizacion-compra.dto.ts`

**Características:**
- Validaciones con class-validator
- Documentación OpenAPI con Swagger
- Enum para estados de cotización
- DTO anidado para detalles de productos
- Validaciones de cantidades y precios

**Campos principales:**
- `numero`: Número único de cotización
- `proveedor_id`: UUID del proveedor
- `fecha_cotizacion`: Fecha de la cotización (opcional, default: hoy)
- `validez_dias`: Días de validez (opcional, default: 30)
- `estado`: Estado de la cotización (default: BORRADOR)
- `observaciones`: Observaciones adicionales (opcional)
- `detalles`: Array de productos cotizados (mínimo 1)

**Validaciones implementadas:**
- UUIDs válidos para proveedor y productos
- Cantidades > 0
- Precios >= 0
- Al menos un producto en detalles
- Validez_dias >= 1

### 2. Repository - `repositories/cotizaciones-compra.repository.ts`

**Métodos implementados:**

#### `create(createDto, tenantId, userId?)`
- Calcula automáticamente subtotal, IGV (18%) y total
- Calcula fecha de vencimiento basada en validez_dias
- Inserta cotización y detalles en transacción
- Rollback automático si falla inserción de detalles
- Retorna cotización con detalles

#### `findById(id, tenantId)`
- Obtiene cotización con datos del proveedor
- Incluye detalles con información de productos
- Retorna null si no existe

#### `findByNumero(numero, tenantId)`
- Busca cotización por número único
- Respeta aislamiento por tenant
- Retorna null si no existe

#### `findAll(tenantId, filters?)`
- Lista cotizaciones con filtros opcionales
- Filtros: estado, proveedor_id, fecha_desde, fecha_hasta
- Paginación con limit y offset
- Incluye datos del proveedor
- Retorna data y count

### 3. Service - `services/cotizaciones-compra.service.ts`

**Lógica de negocio:**

#### `create(createDto, tenantId, userId?)`
- Valida que el número de cotización no exista
- Valida que haya al menos un detalle
- Valida cantidades > 0 para todos los productos
- Valida precios >= 0 para todos los productos
- Valida validez_dias >= 1
- Lanza excepciones apropiadas:
  - `ConflictException`: Número duplicado
  - `BadRequestException`: Validaciones de negocio

#### `findById(id, tenantId)`
- Obtiene cotización por ID
- Lanza `NotFoundException` si no existe

#### `findAll(tenantId, filters?)`
- Delega al repository con filtros

### 4. Controller - `controllers/cotizaciones-compra.controller.ts`

**Endpoints implementados:**

#### `POST /api/compras/cotizaciones`
- Crea nueva cotización de compra
- Acepta tenant_id en body (para testing)
- Retorna estructura estándar:
  ```json
  {
    "success": true,
    "message": "Cotización de compra creada exitosamente",
    "data": { ... }
  }
  ```
- Maneja errores con estructura:
  ```json
  {
    "success": false,
    "error": "mensaje de error"
  }
  ```

#### `GET /api/compras/cotizaciones`
- Lista cotizaciones con filtros
- Query params: tenant_id, estado, proveedor_id, fecha_desde, fecha_hasta, limit, offset
- Retorna data y count

#### `GET /api/compras/cotizaciones/:id`
- Obtiene cotización por ID
- Incluye detalles y datos del proveedor

## Cálculos Automáticos

### Totales
```typescript
subtotal = Σ(cantidad × precio_unitario) para cada detalle
igv = subtotal × 0.18
total = subtotal + igv
```

### Fecha de Vencimiento
```typescript
fecha_vencimiento = fecha_cotizacion + validez_dias
```

### Subtotal por Detalle
```typescript
detalle.subtotal = detalle.cantidad × detalle.precio_unitario
```

## Integración con Base de Datos

### Tablas utilizadas:
- `cotizaciones_compra`: Tabla principal
- `cotizacion_compra_detalles`: Detalles de productos
- `proveedores`: Referencia al proveedor
- `productos`: Referencia a productos

### RLS (Row Level Security):
- Todas las operaciones respetan tenant_id
- Políticas de RLS habilitadas en ambas tablas

### Índices utilizados:
- `idx_cotizaciones_compra_tenant`
- `idx_cotizaciones_compra_numero`
- `idx_cotizaciones_compra_proveedor`
- `idx_cotizaciones_compra_estado`
- `idx_cotizaciones_compra_fecha`

## Testing

### Script de prueba: `test-cotizacion-endpoint.ps1`

Ejecutar:
```powershell
.\test-cotizacion-endpoint.ps1
```

### Datos de prueba:
```json
{
  "numero": "COT-2024-TEST-001",
  "proveedor_id": "550e8400-e29b-41d4-a716-446655440002",
  "fecha_cotizacion": "2024-10-24",
  "validez_dias": 30,
  "estado": "BORRADOR",
  "observaciones": "Cotización de prueba",
  "detalles": [
    {
      "producto_id": "550e8400-e29b-41d4-a716-446655440003",
      "descripcion": "Laptop HP 15-dy2021la",
      "cantidad": 10,
      "precio_unitario": 2500.00
    }
  ]
}
```

### Respuesta esperada:
```json
{
  "success": true,
  "message": "Cotización de compra creada exitosamente",
  "data": {
    "id": "uuid-generado",
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "numero": "COT-2024-TEST-001",
    "proveedor_id": "550e8400-e29b-41d4-a716-446655440002",
    "fecha_cotizacion": "2024-10-24",
    "fecha_vencimiento": "2024-11-23",
    "validez_dias": 30,
    "estado": "BORRADOR",
    "subtotal": 25000.00,
    "igv": 4500.00,
    "total": 29500.00,
    "observaciones": "Cotización de prueba",
    "detalles": [...]
  }
}
```

## Validaciones Implementadas

### A nivel de DTO (class-validator):
- ✅ UUIDs válidos
- ✅ Strings no vacíos
- ✅ Números positivos
- ✅ Enums válidos
- ✅ Array con al menos 1 elemento
- ✅ Objetos anidados validados

### A nivel de Service (lógica de negocio):
- ✅ Número de cotización único
- ✅ Al menos un detalle
- ✅ Cantidades > 0
- ✅ Precios >= 0
- ✅ Validez_dias >= 1

### A nivel de Base de Datos:
- ✅ Foreign keys válidas
- ✅ Constraints de CHECK
- ✅ UNIQUE constraint en (tenant_id, numero)
- ✅ RLS por tenant

## Estados de Cotización

```
BORRADOR → ENVIADA → APROBADA
                   → RECHAZADA
                   → VENCIDA
```

- **BORRADOR**: Estado inicial, editable
- **ENVIADA**: Enviada al proveedor
- **APROBADA**: Aprobada para conversión a OC
- **RECHAZADA**: Rechazada por el proveedor o internamente
- **VENCIDA**: Expiró según validez_dias

## Próximos Pasos

Para completar el módulo de cotizaciones, implementar:

1. ✅ POST /api/compras/cotizaciones (COMPLETADO)
2. ⏳ PUT /api/compras/cotizaciones/:id
3. ⏳ POST /api/compras/cotizaciones/:id/enviar
4. ⏳ POST /api/compras/cotizaciones/:id/aprobar
5. ⏳ POST /api/compras/cotizaciones/:id/rechazar
6. ⏳ POST /api/compras/cotizaciones/:id/convertir-oc

## Notas Técnicas

- **Transaccionalidad**: La creación de cotización y detalles se maneja con rollback manual
- **Tenant Isolation**: Todas las operaciones respetan el tenant_id
- **Cálculos**: Los totales se calculan en el repository antes de insertar
- **Fechas**: Se manejan en formato ISO (YYYY-MM-DD)
- **Decimales**: NUMERIC(12,2) para cantidades y precios

## Dependencias

- `@nestjs/common`: Decoradores y excepciones
- `@nestjs/swagger`: Documentación OpenAPI
- `class-validator`: Validaciones de DTO
- `class-transformer`: Transformación de tipos
- `SupabaseService`: Cliente de base de datos

## Configuración del Módulo

El controller, service y repository están registrados en `compras.module.ts`:

```typescript
@Module({
  controllers: [CotizacionesCompraController],
  providers: [CotizacionesCompraService, CotizacionesCompraRepository],
  exports: [CotizacionesCompraService]
})
```
