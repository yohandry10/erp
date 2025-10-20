# CPE Integration Service

## Overview

El `CPEIntegrationService` es el servicio encargado de integrar el módulo de Pedidos de Venta con el módulo CPE (Comprobantes de Pago Electrónicos) para la generación de facturas electrónicas desde pedidos.

## Requirements Implemented

- **10.2**: Mapear datos de pedido a formato CPE (cliente, items, totales)
- **10.3**: Llamar a CPEService existente para generar XML/UBL 2.1, QR, hash, PDF
- **10.6**: Validar certificado digital vigente
- **10.7**: Manejar respuestas de SUNAT (aceptado, observado, rechazado)
- **15.3**: Validar que no supere 999 items
- **15.5**: Validar certificado digital vigente
- **19.5**: Validar límite de 999 ítems SUNAT
- **19.6**: Validar certificado digital antes de facturar
- **19.7**: Mostrar mensaje claro si certificado está ausente o vencido
- **19.8**: Generar XML/UBL 2.1, QR, hash y PDF
- **19.9**: Registrar estados: aceptado, observado, rechazado
- **19.10**: Manejar reintentos y contingencias

## Main Method

### `generarFacturaDesdePedido(pedido, tenantId)`

Genera una factura electrónica desde un pedido de venta.

**Parameters:**
- `pedido`: PedidoVenta con detalle completo
- `tenantId`: ID del tenant

**Returns:**
```typescript
{
  factura_id: string;
  estado: string; // 'ACEPTADO' | 'FIRMADO' | 'ENVIADO' | 'RECHAZADO'
  warnings?: string[];
}
```

**Validations:**
1. ✅ Valida que no supere 999 ítems (límite SUNAT)
2. ✅ Valida certificado digital vigente
3. ✅ Valida configuración de empresa (RUC, razón social)
4. ✅ Obtiene serie y número de factura automáticamente

**Process Flow:**
1. Validar límite de 999 ítems
2. Validar certificado digital
3. Obtener datos del cliente
4. Obtener configuración de empresa
5. Mapear pedido a formato CPE
6. Generar factura con CPEService
7. Procesar respuesta SUNAT
8. Registrar errores si aplica

## Error Handling

### Errores Comunes

**MAX_ITEMS_EXCEEDED**
```json
{
  "message": "No se puede generar factura: El pedido supera el límite de 999 ítems permitidos por SUNAT",
  "code": "MAX_ITEMS_EXCEEDED",
  "details": {
    "items_count": 1000,
    "max_allowed": 999
  }
}
```

**CERT_VALIDATION_FAILED**
```json
{
  "message": "No se puede generar factura: Certificado digital inválido o vencido",
  "code": "CERT_VALIDATION_FAILED",
  "errors": ["Certificado vencido", "..."]
}
```

**RUC_VALIDATION_FAILED**
```json
{
  "message": "Configuración de empresa incompleta",
  "code": "RUC_VALIDATION_FAILED",
  "details": {
    "missing_fields": ["ruc", "razon_social"]
  }
}
```

**FACTURA_RECHAZADA**
```json
{
  "message": "La factura fue rechazada por SUNAT",
  "code": "FACTURA_RECHAZADA",
  "details": {
    "error_sunat": "Error de SUNAT..."
  }
}
```

## Integration Logging

El servicio registra errores de integración en la tabla `integracion_logs` (si existe) o en logs de aplicación:

```typescript
{
  tenant_id: string,
  servicio: 'CPE',
  operacion: 'GENERAR_FACTURA',
  referencia_tipo: 'PEDIDO',
  referencia_id: string,
  estado: 'ERROR',
  error_message: string,
  created_at: timestamp
}
```

## Usage Example

```typescript
import { CPEIntegrationService } from './cpe-integration.service';

// En PedidosService
async generarFactura(pedidoId: string, tenantId: string) {
  const pedido = await this.findOne(pedidoId, tenantId);
  
  const resultado = await this.cpeIntegrationService
    .generarFacturaDesdePedido(pedido, tenantId);
  
  // Actualizar pedido con factura_id
  await this.update(pedidoId, {
    factura_id: resultado.factura_id,
    estado: EstadoPedido.FACTURADO
  }, tenantId);
  
  return resultado;
}
```

## Dependencies

- `CpeService`: Servicio principal de CPE
- `ValidationService`: Validaciones de certificado y RUC
- `SupabaseService`: Acceso a base de datos

## Notes

- El servicio maneja automáticamente la obtención de serie y número de factura
- Los certificados digitales se validan antes de cada emisión
- Los errores se registran para auditoría y reintentos
- El mapeo de items incluye cálculo automático de IGV (18%)
- Por defecto usa moneda PEN (soles peruanos)
- El código de producto se trunca a 8 caracteres para SUNAT
- La unidad por defecto es 'NIU' (unidad SUNAT)

## Future Enhancements

- Soporte para múltiples monedas
- Configuración de tasa de IGV por tenant
- Reintentos automáticos en caso de error
- Generación de boletas (tipo documento 03)
- Soporte para notas de crédito/débito
