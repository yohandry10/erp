# Implementación del Listener RecepcionRegistrada

## Resumen

Se ha implementado el listener para el evento `RecepcionRegistrada` que permite la integración automática entre el módulo de Compras y Cuentas por Pagar (CxP).

## Archivos Modificados/Creados

### 1. EventBus Service (`apps/erp-api/src/shared/events/event-bus.service.ts`)

**Cambios:**
- ✅ Agregada interfaz `RecepcionRegistradaEvent` con todos los campos necesarios
- ✅ Agregado método `emitRecepcionRegistrada()` para emitir el evento
- ✅ Agregado método `onRecepcionRegistrada()` para escuchar el evento

**Estructura del Evento:**
```typescript
export interface RecepcionRegistradaEvent {
  recepcionId: string;
  numeroRecepcion: string;
  ordenId: string;
  numeroOrden: string;
  proveedorId: string;
  proveedorNombre: string;
  proveedorRuc: string;
  almacenId: string;
  fechaRecepcion: string;
  subtotal: number;
  igv: number;
  total: number;
  moneda: string;
  diasCredito?: number;
  condicionesPago?: string;
  items: Array<{
    productoId: string;
    descripcion: string;
    cantidadRecibida: number;
    precioUnitario: number;
    total: number;
    calidad: string;
    lote?: string;
    serie?: string;
    ubicacionId?: string;
  }>;
  tenantId: string;
}
```

### 2. Servicio de Integración CxP (`apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`)

**Nuevo archivo creado** que implementa:

#### Características Principales:

1. **Listener Automático:**
   - Se registra automáticamente al inicializar el módulo (`OnModuleInit`)
   - Escucha el evento `recepcion.registrada`

2. **Configuración Flexible:**
   - Lee la configuración de `empresa_config.generar_cxp_en`
   - Soporta valores: `'RECEPCION'` | `'APROBACION_OC'`
   - Solo crea CxP si está configurado en `'RECEPCION'`

3. **Idempotencia:**
   - Verifica si ya existe una CxP para la recepción antes de crear
   - Evita duplicados usando `referencia_tipo` y `referencia_id`

4. **Creación de CxP:**
   - Genera número automático de CxP (`CXP-YYYY-NNNN`)
   - Calcula fecha de vencimiento según días de crédito
   - Vincula con recepción y orden de compra
   - Establece estado inicial como `PENDIENTE`

5. **Manejo de Errores:**
   - Logging detallado de todas las operaciones
   - No bloquea otros listeners en caso de error
   - Configuración por defecto si no se encuentra config de empresa

#### Métodos Implementados:

- `onModuleInit()`: Registra el listener
- `handleRecepcionRegistrada()`: Procesa el evento
- `obtenerConfiguracionEmpresa()`: Lee configuración
- `verificarCxpExistente()`: Verifica idempotencia
- `crearCuentaPorPagar()`: Crea la CxP
- `calcularFechaVencimiento()`: Calcula vencimiento
- `generarNumeroCxp()`: Genera número secuencial

### 3. Recepciones Service (`apps/erp-api/src/modules/compras/services/recepciones.service.ts`)

**Cambios:**
- ✅ Inyectado `EventBusService` en el constructor
- ✅ Agregado método `emitirEventoRecepcionRegistrada()` privado
- ✅ Llamada al método de emisión en `cerrarRecepcion()` después de cerrar exitosamente

**Flujo de Emisión:**
1. Se cierra la recepción exitosamente
2. Se obtienen datos completos de recepción y orden
3. Se construye el payload del evento con todos los datos necesarios
4. Se emite el evento usando `eventBus.emitRecepcionRegistrada()`
5. El error en la emisión no bloquea el cierre de la recepción

### 4. Compras Module (`apps/erp-api/src/modules/compras/compras.module.ts`)

**Cambios:**
- ✅ Importado `ComprasCxpIntegrationService`
- ✅ Agregado al array de `providers`
- ✅ El servicio se inicializa automáticamente con el módulo

## Flujo Completo

```
1. Usuario cierra una recepción
   ↓
2. RecepcionesService.cerrarRecepcion()
   - Valida estado BORRADOR
   - Crea movimientos de inventario
   - Actualiza cantidad_recibida en orden
   - Actualiza estado de orden
   - Cierra la recepción
   ↓
3. RecepcionesService.emitirEventoRecepcionRegistrada()
   - Obtiene datos completos
   - Construye payload del evento
   - Emite evento via EventBus
   ↓
4. EventBus distribuye el evento a todos los listeners
   ↓
5. ComprasCxpIntegrationService.handleRecepcionRegistrada()
   - Verifica configuración de empresa
   - Verifica idempotencia (CxP no existe)
   - Obtiene datos del proveedor
   - Calcula fecha de vencimiento
   - Crea cuenta por pagar
   - Log de éxito
```

## Configuración Requerida

### Tabla: empresa_config

Debe existir el campo `generar_cxp_en` con valores posibles:
- `'RECEPCION'`: Genera CxP al cerrar recepción (implementado)
- `'APROBACION_OC'`: Genera CxP al aprobar orden de compra (pendiente)

### Tabla: cuentas_por_pagar

Debe tener los siguientes campos:
- `tenant_id`: UUID del tenant
- `numero`: Número de CxP (generado automáticamente)
- `proveedor_id`: UUID del proveedor
- `tipo_documento`: Tipo de documento ('RECEPCION', 'FACTURA', etc.)
- `numero_documento`: Número del documento origen
- `fecha_emision`: Fecha de emisión
- `fecha_vencimiento`: Fecha de vencimiento calculada
- `moneda`: Moneda ('PEN', 'USD', etc.)
- `subtotal`: Subtotal sin impuestos
- `igv`: Monto de IGV
- `total`: Total a pagar
- `saldo`: Saldo pendiente (inicialmente igual a total)
- `estado`: Estado ('PENDIENTE', 'PAGADA', etc.)
- `referencia_tipo`: Tipo de referencia ('RECEPCION', 'ORDEN_COMPRA')
- `referencia_id`: UUID de la referencia
- `orden_compra_id`: UUID de la orden de compra
- `condiciones_pago`: Texto con condiciones de pago
- `observaciones`: Observaciones adicionales

## Testing

### Prueba Manual

1. Crear una orden de compra aprobada
2. Crear una recepción en estado BORRADOR
3. Cerrar la recepción
4. Verificar en logs:
   - `📡 [Recepciones] Emitiendo evento RecepcionRegistrada`
   - `✅ Evento RecepcionRegistrada emitido exitosamente`
   - `📦 Procesando RecepcionRegistrada: REC-YYYY-NNNN`
   - `✅ CxP creada: CXP-YYYY-NNNN`
5. Verificar en base de datos:
   - Existe registro en `cuentas_por_pagar`
   - `referencia_tipo = 'RECEPCION'`
   - `referencia_id = [recepcion_id]`
   - `estado = 'PENDIENTE'`
   - `saldo = total`

### Prueba de Idempotencia

1. Cerrar una recepción (crea CxP)
2. Intentar procesar el mismo evento manualmente
3. Verificar en logs:
   - `⚠️ Ya existe una CxP para la recepción REC-YYYY-NNNN. Saltando...`
4. Verificar que no se crea CxP duplicada

### Prueba de Configuración

1. Configurar `empresa_config.generar_cxp_en = 'APROBACION_OC'`
2. Cerrar una recepción
3. Verificar en logs:
   - `⏭️ Configuración indica no generar CxP en recepción. Saltando...`
4. Verificar que NO se crea CxP

## Pendientes

### Alta Prioridad
- [ ] Implementar lógica de creación de CxP (✅ COMPLETADO)
- [ ] Calcular vencimiento según condiciones (✅ COMPLETADO)
- [ ] Manejar recepciones parciales (✅ COMPLETADO - se crea CxP por cada recepción)
- [ ] Obtener precios unitarios de orden_compra_detalles para items del evento
- [ ] Emitir evento `CxpCreada` para notificaciones y contabilidad

### Media Prioridad
- [ ] Tests unitarios del listener
- [ ] Tests de integración E2E
- [ ] Manejo de recepciones con items rechazados (calidad=RECHAZADO)
- [ ] Soporte para múltiples monedas con tipo de cambio

### Baja Prioridad
- [ ] Dashboard de CxP generadas automáticamente
- [ ] Reportes de CxP por recepción
- [ ] Configuración de reglas de generación de CxP por proveedor

## Notas Técnicas

1. **Logging:** Se usa Logger de NestJS para trazabilidad completa
2. **Async:** El listener no bloquea la operación principal
3. **Error Handling:** Los errores se loguean pero no se propagan
4. **Multi-tenant:** Todos los queries respetan `tenant_id`
5. **Idempotencia:** Se verifica antes de crear para evitar duplicados

## Referencias

- Spec: `.kiro/specs/tasks/fase-2-compras-tasks.md` - TASK 2.7
- Eventos: `.kiro/specs/erp-completo-integracion.md`
- EventBus: `apps/erp-api/src/shared/events/event-bus.service.ts`
