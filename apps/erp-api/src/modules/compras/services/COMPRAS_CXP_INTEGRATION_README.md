# Integración Compras → Cuentas por Pagar (CxP)

## Descripción

Este módulo implementa la integración automática entre el módulo de Compras y el módulo de Finanzas (Cuentas por Pagar). Cuando se registra una recepción de mercancía, el sistema automáticamente crea una cuenta por pagar al proveedor.

## Arquitectura

### Flujo de Eventos

```
Recepción Cerrada → Evento RecepcionRegistrada → Listener CxP → Crear CxP
```

### Componentes

1. **RecepcionesService** (`recepciones.service.ts`)
   - Emite el evento `RecepcionRegistrada` cuando se cierra una recepción
   - Método: `emitirEventoRecepcionRegistrada()`

2. **ComprasCxpIntegrationService** (`compras-cxp-integration.service.ts`)
   - Escucha el evento `RecepcionRegistrada`
   - Crea automáticamente la cuenta por pagar
   - Maneja la lógica de negocio de CxP

3. **EventBusService** (`event-bus.service.ts`)
   - Sistema de eventos centralizado
   - Maneja la comunicación entre módulos

## Configuración

### Configuración de Empresa

La creación de CxP se puede configurar por empresa en la tabla `empresa_config`:

```sql
-- Configurar cuándo generar CxP
UPDATE empresa_config
SET generar_cxp_en = 'RECEPCION'  -- o 'APROBACION_OC'
WHERE tenant_id = 'tu-tenant-id';
```

**Opciones:**
- `RECEPCION`: Crea CxP cuando se cierra la recepción (recomendado)
- `APROBACION_OC`: Crea CxP cuando se aprueba la orden de compra

### Condiciones de Pago

Las condiciones de pago se obtienen del proveedor:

```sql
-- Configurar condiciones de pago del proveedor
UPDATE proveedores
SET 
  condiciones_pago = '30 días',
  dias_credito = 30
WHERE id = 'proveedor-id';
```

## Lógica de Negocio

### 1. Validaciones

Antes de crear una CxP, el sistema valida:

- ✅ Configuración de empresa permite generar CxP en recepción
- ✅ No existe una CxP previa para esta recepción (idempotencia)
- ✅ La recepción está en estado CERRADA
- ✅ La orden de compra existe y tiene datos válidos

### 2. Cálculo de Fecha de Vencimiento

```typescript
fechaVencimiento = fechaRecepcion + diasCredito
```

**Ejemplo:**
- Fecha recepción: 2025-01-15
- Días crédito: 30
- Fecha vencimiento: 2025-02-14

### 3. Generación de Número de CxP

Formato: `CXP-YYYY-NNNN`

**Ejemplo:** `CXP-2025-0001`

### 4. Datos de la CxP

La CxP se crea con los siguientes datos:

```typescript
{
  tenant_id: string,
  numero: string,              // CXP-2025-0001
  proveedor_id: string,
  tipo_documento: 'RECEPCION',
  numero_documento: string,    // REC-2025-0001
  fecha_emision: date,
  fecha_vencimiento: date,
  moneda: string,              // PEN, USD
  subtotal: number,
  igv: number,
  total: number,
  saldo: number,               // = total (inicialmente)
  estado: 'PENDIENTE',
  referencia_tipo: 'RECEPCION',
  referencia_id: string,       // ID de la recepción
  orden_compra_id: string,
  condiciones_pago: string,
  observaciones: string
}
```

## Manejo de Recepciones Parciales

El sistema maneja automáticamente recepciones parciales:

1. **Primera recepción parcial:**
   - Se crea CxP por el monto recibido
   - Estado OC: PARCIAL

2. **Recepciones subsecuentes:**
   - Se crea una nueva CxP por cada recepción
   - Cada CxP está vinculada a su recepción específica
   - Estado OC: PARCIAL → RECIBIDA (cuando se completa)

**Ejemplo:**

```
OC-2025-0001: Total $1,000
├── REC-2025-0001: $600 → CXP-2025-0001: $600
└── REC-2025-0002: $400 → CXP-2025-0002: $400
```

## Idempotencia

El sistema garantiza que no se crearán CxP duplicadas:

```typescript
// Verifica si ya existe una CxP para esta recepción
const cxpExistente = await verificarCxpExistente(recepcionId, tenantId);
if (cxpExistente) {
  return; // No crear duplicado
}
```

## Eventos Emitidos

### RecepcionRegistrada

**Cuándo:** Al cerrar una recepción

**Payload:**
```typescript
{
  recepcionId: string,
  numeroRecepcion: string,
  ordenId: string,
  numeroOrden: string,
  proveedorId: string,
  proveedorNombre: string,
  proveedorRuc: string,
  almacenId: string,
  fechaRecepcion: string,
  subtotal: number,
  igv: number,
  total: number,
  moneda: string,
  diasCredito: number,
  condicionesPago: string,
  items: Array<{...}>,
  tenantId: string
}
```

## Monitoreo y Logs

El servicio emite logs detallados:

```
📦 Procesando RecepcionRegistrada: REC-2025-0001 (rec-123)
⏭️ Configuración indica no generar CxP en recepción. Saltando...
⚠️ Ya existe una CxP para la recepción REC-2025-0001. Saltando...
✅ CxP creada: CXP-2025-0001 - Monto: 1180 PEN - Vencimiento: 2025-02-14
❌ Error procesando RecepcionRegistrada: [error details]
```

## Testing

### Unit Tests

```bash
npm test compras-cxp-integration.service.spec.ts
```

**Cobertura:**
- ✅ Registro de listener
- ✅ Validación de configuración
- ✅ Verificación de idempotencia
- ✅ Creación de CxP
- ✅ Cálculo de fecha de vencimiento
- ✅ Generación de número de CxP
- ✅ Manejo de errores

### Integration Tests

Ver: `test-cxp-integration.ps1`

## Troubleshooting

### CxP no se crea automáticamente

**Posibles causas:**

1. **Configuración incorrecta:**
   ```sql
   SELECT generar_cxp_en FROM empresa_config WHERE tenant_id = 'tu-tenant-id';
   ```
   Debe ser `RECEPCION`

2. **Evento no se emite:**
   - Verificar que la recepción se cierra correctamente
   - Revisar logs del RecepcionesService

3. **Listener no registrado:**
   - Verificar que ComprasCxpIntegrationService está en el módulo
   - Revisar logs de inicio: "👂 Registrando listener para RecepcionRegistrada"

4. **CxP ya existe:**
   ```sql
   SELECT * FROM cuentas_por_pagar 
   WHERE referencia_tipo = 'RECEPCION' 
   AND referencia_id = 'rec-id';
   ```

### Error al crear CxP

**Verificar:**

1. **Tabla existe:**
   ```sql
   SELECT * FROM information_schema.tables 
   WHERE table_name = 'cuentas_por_pagar';
   ```

2. **Permisos RLS:**
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'cuentas_por_pagar';
   ```

3. **Datos del proveedor:**
   ```sql
   SELECT condiciones_pago, dias_credito 
   FROM proveedores 
   WHERE id = 'proveedor-id';
   ```

## Próximas Mejoras

- [ ] Emitir evento `CxpCreada` para notificaciones
- [ ] Integración con módulo de Contabilidad (asientos automáticos)
- [ ] Dashboard de CxP pendientes
- [ ] Alertas de vencimiento
- [ ] Reportes de CxP por proveedor

## Referencias

- **Migración DB:** `supabase/migrations/030_add_tenant_id_finanzas.sql`
- **Evento:** `RecepcionRegistradaEvent` en `event-bus.service.ts`
- **Servicio:** `compras-cxp-integration.service.ts`
- **Tests:** `compras-cxp-integration.service.spec.ts`
