# Implementación: Manejo de Recepciones Parciales en CxP

## Resumen

Se implementó el manejo de recepciones parciales en el servicio de integración entre Compras y Cuentas por Pagar (`ComprasCxpIntegrationService`). Ahora el sistema crea cuentas por pagar con el monto exacto de cada recepción parcial, en lugar de crear una CxP por el total de la orden.

## Problema Resuelto

**Antes**: Cuando se recibía mercancía parcialmente, el sistema creaba una CxP por el monto total de la orden de compra, aunque solo se hubiera recibido una parte.

**Ahora**: El sistema calcula el monto exacto de cada recepción parcial y crea una CxP solo por lo recibido. Si hay múltiples recepciones, se crean múltiples CxP.

## Cambios Implementados

### 1. Método `calcularMontoRecepcionParcial()`

**Ubicación**: `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`

**Funcionalidad**:
- Obtiene los detalles de la orden de compra con precios unitarios
- Obtiene los items de la recepción con cantidades recibidas
- Calcula el subtotal multiplicando cantidad recibida × precio unitario
- Excluye items con calidad "RECHAZADO"
- Calcula IGV (18%) y total
- Retorna montos con 2 decimales de precisión

**Código**:
```typescript
private async calcularMontoRecepcionParcial(data: RecepcionRegistradaEvent): Promise<{
  subtotal: number;
  igv: number;
  total: number;
}> {
  // Obtener detalles de orden con precios
  const ordenDetalles = await this.supabase.getClient()
    .from('orden_compra_detalles')
    .select('id, producto_id, precio_unitario, cantidad')
    .eq('orden_id', data.ordenId);

  // Obtener items de recepción con cantidades
  const recepcionItems = await this.supabase.getClient()
    .from('recepcion_items')
    .select('producto_id, cantidad_recibida, detalle_id, calidad')
    .eq('recepcion_id', data.recepcionId);

  // Calcular subtotal
  let subtotal = 0;
  for (const item of recepcionItems) {
    if (item.calidad === 'RECHAZADO') continue;
    
    const detalle = ordenDetalles.find(d => d.id === item.detalle_id);
    const precioUnitario = Number(detalle.precio_unitario);
    const cantidadRecibida = Number(item.cantidad_recibida);
    subtotal += precioUnitario * cantidadRecibida;
  }

  // Calcular IGV y total
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    igv: Number(igv.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}
```

### 2. Método `esRecepcionParcial()`

**Ubicación**: `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`

**Funcionalidad**:
- Cuenta cuántas recepciones cerradas tiene la orden
- Si hay más de una recepción → es parcial
- Si la orden está en estado "PARCIAL" → es parcial
- Retorna `true` o `false`

**Código**:
```typescript
private async esRecepcionParcial(ordenId: string, tenantId: string): Promise<boolean> {
  // Contar recepciones cerradas
  const recepciones = await this.supabase.getClient()
    .from('recepciones')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('orden_id', ordenId)
    .eq('estado', 'CERRADA');

  if (recepciones && recepciones.length > 1) {
    return true;
  }

  // Verificar estado de la orden
  const orden = await this.supabase.getClient()
    .from('ordenes_compra')
    .select('estado')
    .eq('tenant_id', tenantId)
    .eq('id', ordenId)
    .single();

  return orden?.estado === 'PARCIAL';
}
```

### 3. Actualización de `crearCuentaPorPagar()`

**Cambios**:
- Llama a `calcularMontoRecepcionParcial()` para obtener montos exactos
- Usa los montos calculados en lugar de los del evento
- Detecta si es recepción parcial y lo indica en observaciones
- Registra logs detallados del cálculo

**Código actualizado**:
```typescript
private async crearCuentaPorPagar(data: RecepcionRegistradaEvent): Promise<void> {
  // Calcular el monto real de esta recepción parcial
  const montosRecepcion = await this.calcularMontoRecepcionParcial(data);
  
  this.logger.log(`💰 Montos calculados para recepción parcial:`);
  this.logger.log(`   - Subtotal: ${montosRecepcion.subtotal}`);
  this.logger.log(`   - IGV: ${montosRecepcion.igv}`);
  this.logger.log(`   - Total: ${montosRecepcion.total}`);

  // Verificar si es una recepción parcial
  const esRecepcionParcial = await this.esRecepcionParcial(data.ordenId, data.tenantId);
  const observaciones = esRecepcionParcial
    ? `CxP generada automáticamente desde recepción parcial ${data.numeroRecepcion} de OC ${data.numeroOrden}`
    : `CxP generada automáticamente desde recepción ${data.numeroRecepcion}`;

  // Crear CxP con montos exactos
  await this.supabase.getClient()
    .from('cuentas_por_pagar')
    .insert({
      // ... otros campos
      subtotal: montosRecepcion.subtotal,
      igv: montosRecepcion.igv,
      total: montosRecepcion.total,
      saldo: montosRecepcion.total,
      observaciones,
    });
}
```

## Escenarios de Uso

### Escenario 1: Recepción Completa (100%)

```
Orden de Compra OC-2025-0001:
  - Producto A: 10 unidades × $100 = $1,000
  - Producto B: 20 unidades × $50 = $1,000
  - Subtotal: $2,000
  - IGV: $360
  - Total: $2,360

Recepción REC-2025-0001:
  - Producto A: 10 unidades (100%)
  - Producto B: 20 unidades (100%)

Resultado:
  ✅ CxP-2025-0001 creada por $2,360
  ✅ Observaciones: "CxP generada automáticamente desde recepción REC-2025-0001"
```

### Escenario 2: Recepciones Parciales

```
Orden de Compra OC-2025-0002:
  - Producto A: 10 unidades × $100 = $1,000
  - Producto B: 20 unidades × $50 = $1,000
  - Subtotal: $2,000
  - IGV: $360
  - Total: $2,360

Recepción 1 (REC-2025-0002):
  - Producto A: 5 unidades (50%)
  - Producto B: 10 unidades (50%)
  - Subtotal calculado: $1,000
  - IGV: $180
  - Total: $1,180

Resultado:
  ✅ CxP-2025-0002 creada por $1,180
  ✅ Observaciones: "CxP generada automáticamente desde recepción parcial REC-2025-0002 de OC OC-2025-0002"

Recepción 2 (REC-2025-0003):
  - Producto A: 5 unidades (50% restante)
  - Producto B: 10 unidades (50% restante)
  - Subtotal calculado: $1,000
  - IGV: $180
  - Total: $1,180

Resultado:
  ✅ CxP-2025-0003 creada por $1,180
  ✅ Observaciones: "CxP generada automáticamente desde recepción parcial REC-2025-0003 de OC OC-2025-0002"

Total CxP: $2,360 (2 cuentas por pagar)
```

### Escenario 3: Items con Calidad Rechazada

```
Orden de Compra OC-2025-0003:
  - Producto A: 10 unidades × $100 = $1,000
  - Producto B: 20 unidades × $50 = $1,000
  - Subtotal: $2,000
  - IGV: $360
  - Total: $2,360

Recepción REC-2025-0004:
  - Producto A: 10 unidades - Calidad: OK
  - Producto B: 20 unidades - Calidad: RECHAZADO

Cálculo:
  - Solo Producto A: 10 × $100 = $1,000
  - Subtotal: $1,000
  - IGV: $180
  - Total: $1,180

Resultado:
  ✅ CxP-2025-0004 creada por $1,180 (solo items OK)
  ✅ Producto B rechazado no genera CxP
```

## Tests Implementados

Se agregaron tests unitarios en `compras-cxp-integration.service.spec.ts`:

### Tests de `calcularMontoRecepcionParcial()`

1. **Cálculo correcto de recepción parcial**
   - Verifica que se calculen correctamente los montos
   - Valida subtotal, IGV y total

2. **Exclusión de items rechazados**
   - Verifica que items con calidad "RECHAZADO" no se incluyan
   - Valida que solo se consideren items OK u OBSERVADO

3. **Manejo de errores**
   - Verifica que use valores de fallback en caso de error
   - Valida que no falle la operación

### Tests de `esRecepcionParcial()`

1. **Detección de múltiples recepciones**
   - Verifica que retorne `true` cuando hay más de una recepción

2. **Detección por estado de orden**
   - Verifica que retorne `true` cuando la orden está en estado PARCIAL

3. **Orden completamente recibida**
   - Verifica que retorne `false` cuando la orden está RECIBIDA

4. **Manejo de errores**
   - Verifica que retorne `false` en caso de error

## Beneficios

1. **Precisión Financiera**: Cada CxP refleja exactamente lo recibido
2. **Trazabilidad**: Múltiples CxP permiten rastrear cada recepción
3. **Flexibilidad**: Soporta recepciones parciales sin modificar la orden
4. **Robustez**: Maneja errores con valores de fallback
5. **Auditoría**: Observaciones indican si es recepción parcial

## Consideraciones

### Fallback en Caso de Error

Si hay un error al calcular los montos (por ejemplo, problemas de BD), el sistema usa los montos del evento como fallback:

```typescript
catch (error) {
  this.logger.error(`❌ Error en calcularMontoRecepcionParcial:`, error);
  this.logger.warn(`⚠️ Usando montos del evento como fallback`);
  return {
    subtotal: data.subtotal,
    igv: data.igv,
    total: data.total,
  };
}
```

### Idempotencia

El sistema verifica si ya existe una CxP para la recepción antes de crear una nueva:

```typescript
const cxpExistente = await this.verificarCxpExistente(data.recepcionId, data.tenantId);

if (cxpExistente) {
  this.logger.warn(`⚠️ Ya existe una CxP para la recepción ${data.numeroRecepcion}. Saltando...`);
  return;
}
```

### Configuración

El sistema respeta la configuración de la empresa:

```typescript
const config = await this.obtenerConfiguracionEmpresa(data.tenantId);

if (config?.generar_cxp_en !== 'RECEPCION') {
  this.logger.log(`⏭️ Configuración indica no generar CxP en recepción. Saltando...`);
  return;
}
```

## Próximos Pasos

- ✅ Implementación completada
- ✅ Tests unitarios agregados
- ⏳ Pruebas de integración E2E
- ⏳ Documentación de API
- ⏳ Validación en ambiente de staging

## Referencias

- **Archivo principal**: `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`
- **Tests**: `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.spec.ts`
- **Tarea**: `.kiro/specs/tasks/fase-2-compras-tasks.md` - TASK 2.7 - Subtarea "Manejar recepciones parciales"
