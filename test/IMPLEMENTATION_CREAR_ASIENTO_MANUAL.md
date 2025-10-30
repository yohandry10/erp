# Implementación: Crear Asiento Contable Manual

## ✅ Tarea Completada

Se implementó la funcionalidad completa para crear asientos contables manuales en el sistema ERP.

## 📋 Archivos Modificados

### 1. DTOs (`libs/dtos/src/contabilidad/asiento.dto.ts`)
- ✅ Agregado `CreateDetalleAsientoDto` - DTO para los detalles del asiento
- ✅ Agregado `CreateAsientoManualDto` - DTO principal para crear asientos manuales

### 2. Servicio (`apps/erp-api/src/modules/contabilidad/services/asientos.service.ts`)
- ✅ Agregado método `crearAsientoManual()` con las siguientes validaciones:
  - Validación de período contable abierto
  - Validación de balance (debe = haber)
  - Validación de mínimo 2 movimientos
  - Validación de que cada movimiento tenga solo debe o haber
  - Validación de que las cuentas existan
- ✅ Agregado método privado `generarNumeroAsiento()` para generar números únicos
- ✅ Inyección de `PeriodosService` para validar períodos

### 3. Controlador (`apps/erp-api/src/modules/contabilidad.controller.ts`)
- ✅ Actualizado endpoint `POST /api/contabilidad/asiento-contable`
  - Implementación completa (antes era solo un TODO)
  - Documentación Swagger completa
  - Manejo de errores apropiado
- ✅ Actualizado endpoint `GET /api/contabilidad/asientos-contables`
  - Ahora usa `AsientosService.listarAsientos()`
  - Soporte para filtros avanzados
  - Paginación
- ✅ Agregado endpoint `GET /api/contabilidad/asientos-contables/:id`
  - Obtener un asiento específico por ID

## 🔧 Funcionalidades Implementadas

### Crear Asiento Manual
**Endpoint:** `POST /api/contabilidad/asiento-contable`

**Request Body:**
```json
{
  "fecha": "2025-01-15",
  "concepto": "Transferencia de caja a banco",
  "referencia": "REF-001",
  "detalles": [
    {
      "cuenta_id": "uuid-cuenta-banco",
      "debe": 1000.00,
      "haber": 0.00,
      "concepto": "Depósito en banco",
      "centro_costo_id": "uuid-centro-costo" // opcional
    },
    {
      "cuenta_id": "uuid-cuenta-caja",
      "debe": 0.00,
      "haber": 1000.00,
      "concepto": "Retiro de caja"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenant_id": "uuid",
    "numero_asiento": "A-202501-0001",
    "fecha": "2025-01-15",
    "concepto": "Transferencia de caja a banco",
    "referencia": "REF-001",
    "total_debe": 1000.00,
    "total_haber": 1000.00,
    "estado": "CONFIRMADO",
    "detalles": [...]
  },
  "message": "Asiento contable A-202501-0001 creado exitosamente"
}
```

### Validaciones Implementadas

1. **Período Contable Abierto**
   - Verifica que el período de la fecha del asiento esté en estado ABIERTO
   - Rechaza asientos en períodos CERRADOS o BLOQUEADOS

2. **Balance Contable**
   - Valida que la suma del DEBE sea igual a la suma del HABER
   - Tolerancia de 0.01 para diferencias de redondeo

3. **Estructura del Asiento**
   - Mínimo 2 movimientos (debe y haber)
   - Cada movimiento debe tener solo debe O haber, no ambos
   - Cada movimiento debe tener un monto mayor a cero

4. **Cuentas Contables**
   - Verifica que todas las cuentas existan en el plan de cuentas
   - Verifica que las cuentas pertenezcan al tenant

5. **Número de Asiento**
   - Genera automáticamente números únicos por período
   - Formato: `A-YYYYMM-NNNN` (ej: A-202501-0001)

## 🧪 Testing

Se creó un script de prueba completo: `test/test-crear-asiento-manual.ps1`

**Ejecutar test:**
```powershell
.\test\test-crear-asiento-manual.ps1
```

**El test verifica:**
1. ✅ Login y obtención de token
2. ✅ Obtención de cuentas del plan de cuentas
3. ✅ Verificación/creación de período contable
4. ✅ Creación de asiento manual
5. ✅ Consulta del asiento creado
6. ✅ Listado de asientos recientes

## 📊 Endpoints Relacionados

### Listar Asientos
**Endpoint:** `GET /api/contabilidad/asientos-contables`

**Query Parameters:**
- `fecha_desde` - Fecha desde (YYYY-MM-DD)
- `fecha_hasta` - Fecha hasta (YYYY-MM-DD)
- `origen` - Origen del asiento (MANUAL, AUTOMATICO, VENTA, etc.)
- `cuenta_id` - Filtrar por cuenta
- `cuenta_codigo` - Filtrar por código de cuenta
- `estado` - Estado del asiento (BORRADOR, CONFIRMADO, ANULADO)
- `numero_asiento` - Buscar por número
- `referencia` - Buscar por referencia
- `centro_costo_id` - Filtrar por centro de costo
- `page` - Página (default: 1)
- `limit` - Límite por página (default: 50)

### Obtener Asiento por ID
**Endpoint:** `GET /api/contabilidad/asientos-contables/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "numero_asiento": "A-202501-0001",
    "fecha": "2025-01-15",
    "concepto": "...",
    "detalles": [
      {
        "id": "uuid",
        "cuenta_id": "uuid",
        "cuenta_codigo": "101",
        "cuenta_nombre": "Caja",
        "debe": 0.00,
        "haber": 1000.00,
        "concepto": "Retiro de caja",
        "centro_costo_id": null,
        "centro_costo_nombre": null
      }
    ]
  }
}
```

## 🔐 Seguridad

- ✅ Requiere autenticación JWT (`@UseGuards(JwtAuthGuard)`)
- ✅ Validación de tenant (`@CurrentTenant()`)
- ✅ Validación de usuario (`@CurrentUser()`)
- ✅ RLS (Row Level Security) en base de datos

## 📝 Notas Técnicas

1. **Estado del Asiento:** Los asientos manuales se crean directamente en estado `CONFIRMADO`
2. **Número de Asiento:** Se genera automáticamente con formato `A-YYYYMM-NNNN`
3. **Idempotencia:** No aplica para asientos manuales (solo para automáticos con `source_event_id`)
4. **Rollback:** Si falla la creación de detalles, se elimina automáticamente el asiento

## ✅ Criterios de Aceptación Cumplidos

- ✅ Crear asiento manual con validación de balance
- ✅ Validar período contable abierto
- ✅ Generar número de asiento automático
- ✅ Soportar centros de costo opcionales
- ✅ Validar que las cuentas existan
- ✅ Listar asientos con filtros
- ✅ Ver detalle de asiento
- ✅ Documentación Swagger completa
- ✅ Manejo de errores robusto

## 🚀 Próximos Pasos

Para completar la funcionalidad de asientos contables, se recomienda:

1. Implementar edición de asientos (solo en estado BORRADOR)
2. Implementar anulación de asientos
3. Implementar reversión de asientos
4. Agregar validaciones adicionales (ej: cuentas de nivel correcto)
5. Implementar plantillas de asientos recurrentes
