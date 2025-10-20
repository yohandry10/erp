# GRE Integration Service

## Overview

El `GREIntegrationService` es responsable de integrar el módulo de Pedidos con el módulo GRE (Guía de Remisión Electrónica). Este servicio evalúa cuándo sugerir la generación de GRE y prepara los datos necesarios para facilitar su creación.

## Requirements Implemented

- **11.1**: Verificar si debe sugerir GRE según configuración
- **11.2**: Verificar `gre_automatico_habilitado` y `umbral_gre_automatico`
- **11.3**: Verificar `gre_obligatorio`
- **11.4**: Preparar datos de GRE (puntos partida/llegada, motivo, transportista)
- **11.5**: Preparar datos adicionales (placa, conductor, peso, bultos)
- **22.1**: Lógica de sugerencia automática
- **22.2**: Evaluación de umbral
- **22.3**: Precarga de datos del pedido y cliente
- **22.4**: Manejo de GRE obligatorio
- **22.5**: Cálculo de peso y bultos estimados

## Main Methods

### `verificarSugerenciaGRE(pedido, tenantId)`

Evalúa si se debe sugerir la generación de GRE para un pedido específico.

**Lógica de decisión:**

1. **GRE Obligatorio**: Si `gre_obligatorio = true`, siempre sugiere GRE
2. **GRE Automático**: Si `gre_automatico_habilitado = true` y el total del pedido supera `umbral_gre_automatico`, sugiere GRE
3. **Sin sugerencia**: En cualquier otro caso, no sugiere GRE

**Returns:**
```typescript
{
  sugerir: boolean;        // Si se debe sugerir GRE
  obligatorio: boolean;    // Si es obligatorio generar GRE
  automatico: boolean;     // Si la sugerencia es automática
  motivo?: string;         // Motivo de la sugerencia
}
```

**Example:**
```typescript
const sugerencia = await greIntegrationService.verificarSugerenciaGRE(pedido, tenantId);

if (sugerencia.sugerir) {
  if (sugerencia.obligatorio) {
    // Mostrar modal obligatorio
    console.log('GRE obligatorio:', sugerencia.motivo);
  } else {
    // Mostrar sugerencia opcional
    console.log('Se sugiere GRE:', sugerencia.motivo);
  }
}
```

### `prepararDatosGRE(pedido, facturaId, tenantId)`

Prepara los datos precargados para facilitar la creación de una GRE.

**Datos precargados:**

- **Destinatario**: Razón social del cliente
- **Dirección destino**: Dirección del cliente
- **Fecha de traslado**: Mañana por defecto
- **Modalidad**: Transporte público por defecto
- **Motivo**: Venta
- **Peso total**: Calculado automáticamente
- **Observaciones**: Referencia al pedido
- **CPE relacionado**: ID de la factura

**Datos adicionales:**

- Punto de partida (empresa)
- Punto de llegada (cliente)
- Información del cliente
- Información del pedido
- Estimaciones de peso y bultos
- Sugerencias para completar

**Returns:**
```typescript
{
  destinatario: string;
  direccionDestino: string;
  fechaTraslado: string;
  modalidad: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO';
  motivo: string;
  pesoTotal: number;
  observaciones: string;
  cpeRelacionado: string;
  datosAdicionales: {
    puntoPartida: { direccion: string; ubigeo?: string };
    puntoLlegada: { direccion: string; ubigeo?: string };
    cliente: { ... };
    pedido: { ... };
    estimaciones: { peso_kg: number; bultos: number; metodo_calculo: string };
    sugerencias: { ... };
  }
}
```

**Example:**
```typescript
const datosGRE = await greIntegrationService.prepararDatosGRE(
  pedido,
  facturaId,
  tenantId
);

// Usar datos precargados en el formulario de GRE
console.log('Destinatario:', datosGRE.destinatario);
console.log('Peso estimado:', datosGRE.pesoTotal, 'kg');
console.log('Bultos estimados:', datosGRE.datosAdicionales.estimaciones.bultos);
```

## Configuration

El servicio lee la configuración de GRE desde la tabla `empresa_config`:

```sql
-- Campos de configuración GRE
gre_obligatorio BOOLEAN DEFAULT false
gre_automatico_habilitado BOOLEAN DEFAULT true
umbral_gre_automatico NUMERIC(12,2) DEFAULT 700.00
```

### Valores por defecto

Si no existe configuración, se usan estos valores:

- `gre_obligatorio`: `false`
- `gre_automatico_habilitado`: `true`
- `umbral_gre_automatico`: `700.00` (S/ 700 según normativa SUNAT)

## Estimation Methods

### Peso Estimado

**Fórmula:**
```
peso_estimado = (total / 100) + (cantidad_productos * 0.5)
peso_final = max(peso_estimado, 1.0)
```

**Ejemplo:**
- Pedido de S/ 1,500 con 10 productos
- Peso base: 1,500 / 100 = 15 kg
- Peso adicional: 10 * 0.5 = 5 kg
- **Peso total: 20 kg**

### Bultos Estimados

**Fórmula:**
```
bultos = max(ceil(cantidad_productos / 5), 1)
```

**Ejemplo:**
- 12 productos → ceil(12 / 5) = 3 bultos
- 3 productos → ceil(3 / 5) = 1 bulto (mínimo)

## Integration Flow

### Flujo completo de generación de factura con sugerencia de GRE:

```typescript
// 1. Generar factura desde pedido
const resultado = await pedidosService.generarFactura(pedidoId, tenantId);

// 2. Verificar si sugerir GRE
const sugerencia = await greIntegrationService.verificarSugerenciaGRE(
  pedido,
  tenantId
);

if (sugerencia.sugerir) {
  // 3. Preparar datos de GRE
  const datosGRE = await greIntegrationService.prepararDatosGRE(
    pedido,
    resultado.factura_id,
    tenantId
  );

  // 4. Mostrar modal con sugerencia
  if (sugerencia.obligatorio) {
    // Modal obligatorio: usuario debe generar GRE
    return {
      ...resultado,
      gre_requerida: true,
      gre_datos: datosGRE,
      gre_motivo: sugerencia.motivo
    };
  } else {
    // Modal opcional: usuario puede omitir
    return {
      ...resultado,
      gre_sugerida: true,
      gre_datos: datosGRE,
      gre_motivo: sugerencia.motivo
    };
  }
}

// 5. Sin sugerencia de GRE
return resultado;
```

## Error Handling

El servicio maneja errores de forma defensiva:

- Si no se puede obtener la configuración, usa valores por defecto
- Si hay error verificando sugerencia, retorna `sugerir: false` para no bloquear el flujo
- Si hay error preparando datos, lanza excepción (debe manejarse en el controlador)

## Testing

### Test Cases

1. **GRE Obligatorio**
   - Config: `gre_obligatorio = true`
   - Expected: `sugerir = true, obligatorio = true`

2. **GRE Automático con umbral superado**
   - Config: `gre_automatico_habilitado = true, umbral = 700`
   - Pedido: `total = 1000`
   - Expected: `sugerir = true, obligatorio = false, automatico = true`

3. **GRE Automático con umbral no superado**
   - Config: `gre_automatico_habilitado = true, umbral = 700`
   - Pedido: `total = 500`
   - Expected: `sugerir = false`

4. **GRE Deshabilitado**
   - Config: `gre_automatico_habilitado = false`
   - Expected: `sugerir = false` (sin importar el total)

5. **Preparación de datos**
   - Verificar que todos los campos obligatorios estén presentes
   - Verificar cálculo correcto de peso y bultos
   - Verificar que `datosAdicionales` contenga información completa

## Future Enhancements

- [ ] Soporte para múltiples puntos de entrega
- [ ] Integración con servicios de transporte externos
- [ ] Cálculo de peso real desde catálogo de productos
- [ ] Validación de rutas y tiempos de traslado
- [ ] Generación automática de GRE sin intervención del usuario
- [ ] Notificaciones al transportista
- [ ] Tracking de estado de traslado

## Related Files

- `gre-integration.service.ts` - Servicio principal
- `pedidos.service.ts` - Usa el servicio en `generarFactura()`
- `pedidos.controller.ts` - Expone endpoints que usan el servicio
- `../../gre/gre.service.ts` - Servicio de GRE que crea las guías
- `../../gre/gre.types.ts` - Tipos de datos de GRE

## References

- Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 22.1, 22.2, 22.3, 22.4, 22.5
- Design Document: `.kiro/specs/modulo-ventas-completo/design.md`
- Tasks: `.kiro/specs/modulo-ventas-completo/tasks.md` (Task 8.1)
