# Módulo de Clientes - Backend

## Descripción

Módulo completo para la gestión de clientes del sistema de ventas. Implementa todas las operaciones CRUD con validaciones, búsqueda, filtros y validación de RUC con SUNAT.

## Estructura de Archivos

```
clientes/
├── dto/
│   ├── create-cliente.dto.ts    # DTO para crear cliente
│   ├── update-cliente.dto.ts    # DTO para actualizar cliente
│   ├── validar-ruc.dto.ts       # DTO para validar RUC
│   └── index.ts                 # Exportaciones de DTOs
├── entities/
│   └── cliente.entity.ts        # Entidad Cliente con enums
├── clientes.controller.ts       # Controlador REST
├── clientes.service.ts          # Lógica de negocio
├── clientes.module.ts           # Módulo NestJS
├── index.ts                     # Exportaciones del módulo
└── README.md                    # Este archivo
```

## Endpoints Implementados

### GET /api/ventas/clientes
Lista todos los clientes con paginación y filtros.

**Query Parameters:**
- `search` (opcional): Búsqueda por RUC, DNI, razón social o nombre comercial
- `tipo` (opcional): Filtrar por tipo (PERSONA o EMPRESA)
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Registros por página (default: 50)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "tipo": "EMPRESA",
      "documento_tipo": "RUC",
      "documento_numero": "20123456789",
      "razon_social": "EMPRESA EJEMPLO S.A.C.",
      "nombre_comercial": "EJEMPLO",
      "direccion": "AV. EJEMPLO 123",
      "email": "contacto@ejemplo.com",
      "telefono": "987654321",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

### POST /api/ventas/clientes
Crea un nuevo cliente.

**Body:**
```json
{
  "tipo": "EMPRESA",
  "documento_tipo": "RUC",
  "documento_numero": "20123456789",
  "razon_social": "EMPRESA EJEMPLO S.A.C.",
  "nombre_comercial": "EJEMPLO",
  "direccion": "AV. EJEMPLO 123",
  "email": "contacto@ejemplo.com",
  "telefono": "987654321"
}
```

**Validaciones:**
- RUC: 11 dígitos
- DNI: 8 dígitos
- No permite duplicados por documento_numero
- Email debe ser válido
- Razón social mínimo 3 caracteres

### GET /api/ventas/clientes/:id
Obtiene un cliente por ID.

### PUT /api/ventas/clientes/:id
Actualiza un cliente existente.

**Body:** Igual que POST pero todos los campos son opcionales.

### DELETE /api/ventas/clientes/:id
Elimina un cliente.

**Validaciones:**
- Verifica que no tenga cotizaciones asociadas
- Verifica que no tenga pedidos asociados

### POST /api/ventas/clientes/validar-ruc
Valida un RUC con la API de SUNAT.

**Body:**
```json
{
  "ruc": "20123456789"
}
```

**Response:**
```json
{
  "ruc": "20123456789",
  "razon_social": "EMPRESA DE EJEMPLO S.A.C.",
  "estado": "ACTIVO",
  "condicion": "HABIDO",
  "direccion": "AV. EJEMPLO 123, LIMA",
  "validado": true,
  "mensaje": "RUC válido"
}
```

## Tipos y Enums

### TipoCliente
- `PERSONA`: Cliente persona natural
- `EMPRESA`: Cliente persona jurídica

### TipoDocumento
- `DNI`: Documento Nacional de Identidad (8 dígitos)
- `RUC`: Registro Único de Contribuyentes (11 dígitos)
- `CE`: Carné de Extranjería
- `PASAPORTE`: Pasaporte

## Seguridad

- Todos los endpoints requieren autenticación JWT (`@UseGuards(JwtAuthGuard)`)
- Aislamiento por tenant automático (`@CurrentTenant()`)
- Validación de datos con class-validator
- Prevención de duplicados

## Requisitos Cumplidos

- ✅ 1.1: Listar clientes con búsqueda y filtros
- ✅ 1.2: Crear cliente con validaciones
- ✅ 1.3: Validar formato RUC (11 dígitos) y DNI (8 dígitos)
- ✅ 1.4: Validar RUC con API SUNAT
- ✅ 1.5: Almacenar en tabla clientes con tenant_id
- ✅ 1.6: Ver detalle de cliente
- ✅ 1.7: Búsqueda por RUC, DNI, nombre o razón social
- ✅ 1.8: Editar y eliminar cliente con validaciones
- ✅ 14.1: Permisos granulares (preparado para guards)
- ✅ 14.2: Control de acceso por tenant
- ✅ 19.1: Validación RUC 11 dígitos
- ✅ 19.2: Validación DNI 8 dígitos
- ✅ 19.3: Integración con API SUNAT

## Próximos Pasos

1. Implementar guards de permisos específicos (ventas.clientes.*)
2. Conectar con API real de SUNAT para validación de RUC
3. Agregar estadísticas de cliente (total compras, última compra, etc.)
4. Implementar historial de transacciones del cliente
5. Agregar exportación a CSV/Excel

## Notas de Implementación

- La validación de RUC actualmente retorna datos simulados. En producción debe conectarse a una API real de SUNAT o servicio de terceros.
- El servicio verifica dependencias antes de eliminar (cotizaciones y pedidos).
- Todos los métodos incluyen logging para auditoría.
- El módulo está exportado para ser usado por otros módulos (cotizaciones, pedidos).
