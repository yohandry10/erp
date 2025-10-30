# Test: Manejo de Recepciones Parciales en CxP

## Implementación Completada

Se ha implementado el manejo de recepciones parciales en el servicio de integración CxP (`ComprasCxpIntegrationService`).

### Cambios Realizados

1. **Cálculo de Montos Parciales**: Se agregó el método `calcularMontoRecepcionParcial()` que:
   - Obtiene los precios unitarios desde `orden_compra_detalles`
   - Obtiene las cantidades recibidas desde `recepcion_items`
   - Excluye items con calidad "RECHAZADO"
   - Calcula el subtotal, IGV y total exacto de la recepción parcial

2. **Detección de Recepciones Parciales**: Se agregó el método `esRecepcionParcial()` que:
   - Verifica si hay múltiples recepciones para la misma orden
   - Verifica si la orden está en estado "PARCIAL"
   - Retorna true si es una recepción parcial

3. **Actualización de `crearCuentaPorPagar()`**:
   - Ahora calcula el monto exacto de cada recepción parcial
   - Crea CxP solo por el monto recibido, no por el total de la orden
   - Agrega observaciones indicando si es una recepción parcial

### Flujo de Funcionamiento

#### Escenario 1: Recepción Completa
```
Orden de Compra: $10,000
Recepción 1: $10,000 (100%)
→ CxP creada: $10,000
```

#### Escenario 2: Recepciones Parciales
```
Orden de Compra: $10,000
Recepción 1: $4,000 (40%)
→ CxP-001 creada: $4,000

Recepción 2: $3,000 (30%)
→ CxP-002 creada: $3,000

Recepción 3: $3,000 (30%)
→ CxP-003 creada: $3,000

Total CxP: $10,000 (3 cuentas por pagar)
```

#### Escenario 3: Items Rechazados
```
Orden de Compra: $10,000
Recepción 1:
  - Producto A: $4,000 (OK)
  - Producto B: $2,000 (RECHAZADO)
  - Producto C: $4,000 (OK)
→ CxP creada: $8,000 (solo items OK)
```

### Tests Agregados

Se agregaron tests unitarios para:
- `calcularMontoRecepcionParcial()`: Verifica cálculo correcto de montos
- `esRecepcionParcial()`: Verifica detección de recepciones parciales
- Manejo de items rechazados
- Fallback en caso de errores

### Beneficios

1. **Precisión Financiera**: Cada CxP refleja exactamente lo recibido
2. **Trazabilidad**: Múltiples CxP permiten rastrear cada recepción
3. **Flexibilidad**: Soporta recepciones parciales sin modificar la orden
4. **Robustez**: Maneja errores con valores de fallback

### Próximos Pasos

- ✅ Implementación completada
- ✅ Tests unitarios agregados
- ⏳ Pruebas de integración (pendiente)
- ⏳ Documentación de API (pendiente)

## Ejemplo de Uso

```typescript
// Evento emitido cuando se cierra una recepción
const evento: RecepcionRegistradaEvent = {
  recepcionId: 'rec-123',
  numeroRecepcion: 'REC-2025-0001',
  ordenId: 'orden-123',
  numeroOrden: 'OC-2025-0001',
  proveedorId: 'prov-123',
  // ... otros campos
  items: [
    {
      productoId: 'prod-1',
      cantidadRecibida: 5,  // Solo 5 de 10 pedidos
      calidad: 'OK',
      // ...
    }
  ]
};

// El servicio automáticamente:
// 1. Calcula el monto exacto de los 5 items recibidos
// 2. Crea una CxP solo por ese monto
// 3. Marca como recepción parcial en observaciones
```

## Verificación

Para verificar que la implementación funciona correctamente:

1. Crear una orden de compra con múltiples items
2. Crear una recepción parcial (solo algunos items o cantidades)
3. Cerrar la recepción
4. Verificar que la CxP creada tenga el monto correcto
5. Crear una segunda recepción parcial
6. Verificar que se cree una segunda CxP independiente
