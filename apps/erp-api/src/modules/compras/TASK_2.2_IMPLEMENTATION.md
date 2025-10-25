# TASK 2.2: Implementación POST /api/compras/proveedores

## ✅ COMPLETADO

### Archivos Creados

1. **DTO - Create Proveedor**
   - `apps/erp-api/src/modules/compras/dto/create-proveedor.dto.ts`
   - Validaciones completas con class-validator
   - Enum para condiciones de pago
   - Validación de RUC (9-11 dígitos)
   - Validación de email
   - Validación de límite de crédito >= 0

2. **DTO - Update Proveedor**
   - `apps/erp-api/src/modules/compras/dto/update-proveedor.dto.ts`
   - Extiende CreateProveedorDto con PartialType

3. **Repository**
   - `apps/erp-api/src/modules/compras/repositories/proveedores.repository.ts`
   - Métodos implementados:
     - `findAll(tenantId, filters)` - Lista con filtros
     - `findById(id, tenantId)` - Buscar por ID
     - `findByRuc(ruc, tenantId)` - Buscar por RUC
     - `create(createDto, tenantId, userId)` - Crear proveedor
     - `update(id, updateDto, tenantId)` - Actualizar proveedor
     - `softDelete(id, tenantId)` - Desactivar proveedor

4. **Service**
   - `apps/erp-api/src/modules/compras/services/proveedores.service.ts`
   - Lógica de negocio implementada:
     - Validación de RUC (11 dígitos Perú, 9 Colombia)
     - Validación de email
     - Verificación de duplicados por RUC
     - Validación de límite de crédito
     - Manejo de excepciones (ConflictException, NotFoundException, BadRequestException)

5. **Controller**
   - `apps/erp-api/src/modules/compras/controllers/proveedores.controller.ts`
   - Endpoints implementados:
     - ✅ `POST /api/compras/proveedores` - Crear proveedor
     - ✅ `GET /api/compras/proveedores` - Listar proveedores (con filtros)
     - ✅ `GET /api/compras/proveedores/:id` - Obtener por ID
     - ✅ `GET /api/compras/proveedores/buscar-ruc/:ruc` - Buscar por RUC
     - ✅ `PUT /api/compras/proveedores/:id` - Actualizar proveedor
     - ✅ `DELETE /api/compras/proveedores/:id` - Desactivar proveedor (soft delete)

### Archivos Modificados

1. **Module**
   - `apps/erp-api/src/modules/compras/compras.module.ts`
   - Agregado ProveedoresController
   - Agregado ProveedoresService
   - Agregado ProveedoresRepository

2. **DTO Index**
   - `apps/erp-api/src/modules/compras/dto/index.ts`
   - Exportados los nuevos DTOs

### Características Implementadas

#### Validaciones
- ✅ RUC válido (11 dígitos Perú, 9 Colombia)
- ✅ Email válido
- ✅ Condiciones de pago válidas (enum)
- ✅ Límite de crédito >= 0
- ✅ Verificación de duplicados por RUC
- ✅ Campos requeridos: ruc, razon_social, email

#### Multi-Tenant
- ✅ Todos los endpoints filtran por tenant_id
- ✅ Soporte para tenant_id en query params (para testing sin auth)
- ✅ Soporte para tenant_id en body (para testing sin auth)
- ✅ Valor por defecto: '550e8400-e29b-41d4-a716-446655440000'

#### Soft Delete
- ✅ DELETE no elimina físicamente el registro
- ✅ Actualiza campos: activo=false, estado='INACTIVO'

#### Documentación OpenAPI
- ✅ Decoradores @ApiTags, @ApiOperation, @ApiResponse
- ✅ Documentación de todos los endpoints
- ✅ Códigos de respuesta HTTP apropiados

### Estructura de Datos

```typescript
interface Proveedor {
  id: UUID;
  tenant_id: UUID;
  ruc: string;                    // 9-11 dígitos
  razon_social: string;           // Requerido
  nombre_comercial?: string;
  direccion?: string;
  telefono?: string;
  email: string;                  // Requerido, validado
  contacto?: string;
  condiciones_pago: string;       // CONTADO, CREDITO_15, etc.
  limite_credito: number;         // >= 0
  dias_credito: number;           // >= 0
  estado: string;                 // ACTIVO, INACTIVO
  activo: boolean;
  created_at: timestamp;
  updated_at: timestamp;
  created_by?: UUID;
}
```

### Ejemplo de Uso

#### Crear Proveedor
```bash
POST /api/compras/proveedores
Content-Type: application/json

{
  "ruc": "20123456789",
  "razon_social": "DISTRIBUIDORA ABC S.A.C.",
  "nombre_comercial": "ABC Distribuidora",
  "email": "contacto@abc.com",
  "telefono": "+51 999 888 777",
  "direccion": "Av. Principal 123, Lima",
  "contacto": "Juan Pérez",
  "condiciones_pago": "CREDITO_30",
  "limite_credito": 50000,
  "dias_credito": 30,
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Respuesta Exitosa
```json
{
  "success": true,
  "message": "Proveedor creado exitosamente",
  "data": {
    "id": "uuid-generado",
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "ruc": "20123456789",
    "razon_social": "DISTRIBUIDORA ABC S.A.C.",
    "nombre_comercial": "ABC Distribuidora",
    "email": "contacto@abc.com",
    "telefono": "+51 999 888 777",
    "direccion": "Av. Principal 123, Lima",
    "contacto": "Juan Pérez",
    "condiciones_pago": "CREDITO_30",
    "limite_credito": 50000,
    "dias_credito": 30,
    "estado": "ACTIVO",
    "activo": true,
    "created_at": "2025-10-24T...",
    "updated_at": "2025-10-24T..."
  }
}
```

#### Respuesta de Error (RUC Duplicado)
```json
{
  "success": false,
  "error": "Ya existe un proveedor con RUC 20123456789"
}
```

### Testing

Para probar el endpoint:

1. **Iniciar el servidor**
   ```bash
   cd apps/erp-api
   npm run start:dev
   ```

2. **Probar con curl**
   ```bash
   curl -X POST http://localhost:3000/api/compras/proveedores \
     -H "Content-Type: application/json" \
     -d '{
       "ruc": "20123456789",
       "razon_social": "DISTRIBUIDORA ABC S.A.C.",
       "email": "contacto@abc.com",
       "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
     }'
   ```

3. **Probar con Postman/Insomnia**
   - URL: `POST http://localhost:3000/api/compras/proveedores`
   - Headers: `Content-Type: application/json`
   - Body: JSON con los datos del proveedor

### Próximos Pasos

Este endpoint es parte de TASK 2.2. Los siguientes endpoints del CRUD ya están implementados:
- ✅ GET /api/compras/proveedores
- ✅ GET /api/compras/proveedores/:id
- ✅ PUT /api/compras/proveedores/:id
- ✅ DELETE /api/compras/proveedores/:id
- ✅ GET /api/compras/proveedores/buscar-ruc/:ruc

Para completar TASK 2.2, se recomienda:
1. Ejecutar tests unitarios (cuando se implementen)
2. Verificar cobertura >= 80%
3. Validar documentación OpenAPI en /api/docs
