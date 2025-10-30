# Implementación: Evento OrdenCompraAprobada

## Resumen

Se ha implementado el evento `OrdenCompraAprobada` que se emite cuando una orden de compra alcanza el estado `APROBADA` después de completar todas las aprobaciones requeridas.

## Cambios Realizados

### 1. Event Bus Service (`apps/erp-api/src/shared/events/event-bus.service.ts`)

#### Nueva Interfaz de Evento

```typescript
export interface OrdenCompraAprobadaEvent {
  ordenId: string;
  numeroOrden: string;
  proveedorId: string;
  proveedorNombre: string;
  total: number;
  subtotal: number;
  igv: number;
  moneda: string;
  fechaOrden: string;
  fechaEntregaEsperada?: string;
  aprobadoPor: string;
  aprobadoEn: string;
  diasCredito?: number;
  items: Array<{
    productoId: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }>;
  tenantId: string;
}
```

#### Métodos Agregados

- **Emisor**: `emitOrdenCompraAprobada(data: OrdenCompraAprobadaEvent)`
- **Listener**: `onOrdenCompraAprobada(listener: (event: ERPEvent) => void)`

### 2. Ordenes Compra Service (`apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`)

#### Inyección de Dependencia

Se agregó `EventBusService` al constructor del servicio.

#### Emisión del Evento

En el método `aprobar()`, cuando el estado de la orden cambia a `APROBADA`, se emite el evento:

```typescript
if (nuevoEstado === 'APROBADA') {
  try {
    await this.emitirEventoOrdenAprobada(orden, tenantId, aprobadorId || userId);
  } catch (error) {
    console.error('Error al emitir evento OrdenCompraAprobada:', error);
    // No fallar la aprobación si el evento no se puede emitir
  }
}
```

#### Método Privado `emitirEventoOrdenAprobada`

Este método:
1. Obtiene información del proveedor desde la base de datos
2. Obtiene los detalles de la orden de compra
3. Calcula los totales (subtotal, IGV, total)
4. Prepara el payload del evento con toda la información necesaria
5. Emite el evento usando `eventBusService.emitOrdenCompraAprobada()`

## Payload del Evento

El evento incluye toda la información necesaria para que otros módulos puedan reaccionar:

- **Identificación**: `ordenId`, `numeroOrden`, `tenantId`
- **Proveedor**: `proveedorId`, `proveedorNombre`
- **Montos**: `total`, `subtotal`, `igv`, `moneda`
- **Fechas**: `fechaOrden`, `fechaEntregaEsperada`, `aprobadoEn`
- **Aprobación**: `aprobadoPor`
- **Términos**: `diasCredito`
- **Detalles**: Array de `items` con productos, cantidades y precios

## Consumidores Potenciales

Este evento puede ser consumido por los siguientes módulos:

### 1. Finanzas (CxP) - Opcional

Puede crear automáticamente una cuenta por pagar cuando se aprueba la orden:

```typescript
eventBusService.onOrdenCompraAprobada(async (event: ERPEvent) => {
  const data = event.data as OrdenCompraAprobadaEvent;
  
  // Verificar configuración si se debe crear CxP en aprobación
  const config = await getEmpresaConfig(data.tenantId);
  
  if (config.generar_cxp_en === 'APROBACION_OC') {
    await cxpService.crearCuentaPorPagar({
      proveedor_id: data.proveedorId,
      orden_compra_id: data.ordenId,
      monto: data.total,
      moneda: data.moneda,
      fecha_vencimiento: calcularVencimiento(data.fechaOrden, data.diasCredito),
      estado: 'PENDIENTE'
    });
  }
});
```

### 2. Inventario

Puede reservar stock o preparar recepciones:

```typescript
eventBusService.onOrdenCompraAprobada(async (event: ERPEvent) => {
  const data = event.data as OrdenCompraAprobadaEvent;
  
  // Preparar recepción esperada
  await inventarioService.crearRecepcionEsperada({
    orden_compra_id: data.ordenId,
    proveedor_id: data.proveedorId,
    fecha_esperada: data.fechaEntregaEsperada,
    items: data.items
  });
});
```

### 3. Contabilidad

Puede crear asientos contables de compromiso:

```typescript
eventBusService.onOrdenCompraAprobada(async (event: ERPEvent) => {
  const data = event.data as OrdenCompraAprobadaEvent;
  
  // Crear asiento de compromiso
  await contabilidadService.crearAsientoCompromiso({
    tipo: 'COMPROMISO_COMPRA',
    referencia: data.numeroOrden,
    monto: data.total,
    proveedor_id: data.proveedorId
  });
});
```

### 4. Notificaciones

Puede notificar a usuarios relevantes:

```typescript
eventBusService.onOrdenCompraAprobada(async (event: ERPEvent) => {
  const data = event.data as OrdenCompraAprobadaEvent;
  
  // Notificar al área de almacén
  await notificationsService.notifyWarehouse({
    title: 'Nueva Orden de Compra Aprobada',
    message: `La orden ${data.numeroOrden} ha sido aprobada. Preparar recepción.`,
    orden_id: data.ordenId
  });
});
```

## Flujo de Aprobación

```
1. Orden creada → Estado: BORRADOR o APROBACION
2. Usuario aprueba → Se registra en oc_aprobaciones
3. Se validan todas las aprobaciones pendientes
4. Si todas están aprobadas → Estado: APROBADA
5. Se emite evento OrdenCompraAprobada ✅
6. Módulos consumidores reaccionan al evento
```

## Manejo de Errores

- Si el evento no se puede emitir, se registra el error en los logs pero **NO se falla la aprobación**
- Esto garantiza que el flujo principal no se interrumpa por problemas en la integración
- Los módulos consumidores deben implementar su propia lógica de reintentos si es necesario

## Testing

Para probar el evento:

1. Crear una orden de compra que requiera aprobación (monto > monto_aprobacion_compras)
2. Aprobar la orden usando el endpoint `POST /api/compras/ordenes/:id/aprobar`
3. Verificar en los logs que se emite el evento:
   ```
   🎯 [EventBus] Emitiendo evento: orden.compra.aprobada desde compras
   ✅ Evento OrdenCompraAprobada emitido para orden OC-001
   ```

## Configuración

El evento se emite automáticamente cuando:
- La orden alcanza el estado `APROBADA`
- Todas las aprobaciones requeridas están completas
- No hay aprobaciones rechazadas

No requiere configuración adicional.

## Próximos Pasos

- [ ] Implementar listener en módulo de Finanzas (CxP) si se requiere crear CxP en aprobación
- [ ] Implementar listener en módulo de Inventario para preparar recepciones
- [ ] Implementar listener en módulo de Contabilidad para asientos de compromiso
- [ ] Agregar tests unitarios para verificar la emisión del evento
- [ ] Agregar tests de integración para verificar que los consumidores reciben el evento

## Referencias

- Especificación: `.kiro/specs/README.md` - Tabla de eventos de dominio
- Diseño: `IMPLEMENTATION_OC_APROBACIONES.md`
- Código: 
  - `apps/erp-api/src/shared/events/event-bus.service.ts`
  - `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
