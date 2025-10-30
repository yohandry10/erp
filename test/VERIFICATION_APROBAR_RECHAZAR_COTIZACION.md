# Verificación: Aprobar/Rechazar Cotización

## Estado de Implementación

✅ **COMPLETADO** - La funcionalidad de aprobar y rechazar cotizaciones está completamente implementada.

## Endpoints Implementados

### 1. POST /api/compras/cotizaciones/:id/aprobar
**Ubicación:** `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts`

**Funcionalidad:**
- Cambia el estado de una cotización de `ENVIADA` a `APROBADA`
- Valida que la cotización esté en estado `ENVIADA`
- Valida que la cotización no esté vencida
- Retorna la cotización actualizada

**Validaciones:**
- ✅ Solo se pueden aprobar cotizaciones en estado `ENVIADA`
- ✅ No se pueden aprobar cotizaciones vencidas
- ✅ Retorna error 404 si la cotización no existe
- ✅ Retorna error 400 si el estado no permite la aprobación

### 2. POST /api/compras/cotizaciones/:id/rechazar
**Ubicación:** `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts`

**Funcionalidad:**
- Cambia el estado de una cotización de `ENVIADA` a `RECHAZADA`
- Permite incluir un motivo de rechazo (opcional)
- El motivo se agrega a las observaciones de la cotización
- Retorna la cotización actualizada

**Validaciones:**
- ✅ Solo se pueden rechazar cotizaciones en estado `ENVIADA`
- ✅ Retorna error 404 si la cotización no existe
- ✅ Retorna error 400 si el estado no permite el rechazo
- ✅ Guarda el motivo de rechazo en observaciones

## Lógica de Negocio Implementada

### Flujo de Estados
```
BORRADOR → ENVIADA → APROBADA
                  ↘ RECHAZADA
```

### Servicio: CotizacionesCompraService

**Método `aprobar()`:**
```typescript
async aprobar(id: string, tenantId: string, userId?: string) {
  // 1. Verificar que la cotización existe
  const cotizacion = await this.findById(id, tenantId);

  // 2. Validar que está en estado ENVIADA
  if (cotizacion.estado !== 'ENVIADA') {
    throw new BadRequestException(
      `Solo se pueden aprobar cotizaciones en estado ENVIADA. Estado actual: ${cotizacion.estado}`
    );
  }

  // 3. Validar que no está vencida
  const fechaVencimiento = new Date(cotizacion.fecha_vencimiento);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  
  if (fechaVencimiento < hoy) {
    throw new BadRequestException(
      `No se puede aprobar una cotización vencida. Fecha de vencimiento: ${cotizacion.fecha_vencimiento}`
    );
  }

  // 4. Actualizar estado a APROBADA
  return await this.cotizacionesRepository.updateEstado(id, 'APROBADA', tenantId, userId);
}
```

**Método `rechazar()`:**
```typescript
async rechazar(id: string, tenantId: string, motivo?: string, userId?: string) {
  // 1. Verificar que la cotización existe
  const cotizacion = await this.findById(id, tenantId);

  // 2. Validar que está en estado ENVIADA
  if (cotizacion.estado !== 'ENVIADA') {
    throw new BadRequestException(
      `Solo se pueden rechazar cotizaciones en estado ENVIADA. Estado actual: ${cotizacion.estado}`
    );
  }

  // 3. Actualizar estado a RECHAZADA y agregar motivo a observaciones
  const updateData: any = { estado: 'RECHAZADA' };
  
  if (motivo) {
    const observacionesActuales = cotizacion.observaciones || '';
    updateData.observaciones = observacionesActuales 
      ? `${observacionesActuales}\n\nMotivo de rechazo: ${motivo}`
      : `Motivo de rechazo: ${motivo}`;
  }

  return await this.cotizacionesRepository.updateEstadoConObservaciones(
    id, 
    'RECHAZADA', 
    updateData.observaciones,
    tenantId, 
    userId
  );
}
```

## Tests Existentes

**Archivo:** `test-cotizacion-estados.ps1`

El test cubre:
1. ✅ Crear cotización en estado BORRADOR
2. ✅ Intentar aprobar desde BORRADOR (debe fallar)
3. ✅ Enviar cotización (BORRADOR → ENVIADA)
4. ✅ Aprobar cotización (ENVIADA → APROBADA)
5. ✅ Crear segunda cotización para rechazo
6. ✅ Rechazar cotización (ENVIADA → RECHAZADA) con motivo
7. ✅ Intentar aprobar cotización rechazada (debe fallar)

## Ejemplos de Uso

### Aprobar Cotización

```bash
curl -X POST http://localhost:3002/api/compras/cotizaciones/{id}/aprobar \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Cotización aprobada exitosamente",
  "data": {
    "id": "...",
    "numero": "COT-2024-001",
    "estado": "APROBADA",
    "proveedor_id": "...",
    "fecha_cotizacion": "2024-10-24",
    "fecha_vencimiento": "2024-11-23",
    "subtotal": 1000.00,
    "igv": 180.00,
    "total": 1180.00,
    "detalles": [...]
  }
}
```

**Respuesta de error (estado inválido):**
```json
{
  "success": false,
  "error": "Solo se pueden aprobar cotizaciones en estado ENVIADA. Estado actual: BORRADOR"
}
```

### Rechazar Cotización

```bash
curl -X POST http://localhost:3002/api/compras/cotizaciones/{id}/rechazar \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "motivo": "Precio muy alto, no se ajusta al presupuesto"
  }'
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Cotización rechazada exitosamente",
  "data": {
    "id": "...",
    "numero": "COT-2024-002",
    "estado": "RECHAZADA",
    "observaciones": "Motivo de rechazo: Precio muy alto, no se ajusta al presupuesto",
    "proveedor_id": "...",
    "fecha_cotizacion": "2024-10-24",
    "fecha_vencimiento": "2024-11-23",
    "subtotal": 500.00,
    "igv": 90.00,
    "total": 590.00,
    "detalles": [...]
  }
}
```

## Archivos Modificados

### Backend
- ✅ `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts`
  - Endpoint `POST /:id/aprobar`
  - Endpoint `POST /:id/rechazar`

- ✅ `apps/erp-api/src/modules/compras/services/cotizaciones-compra.service.ts`
  - Método `aprobar()`
  - Método `rechazar()`

- ✅ `apps/erp-api/src/modules/compras/repositories/cotizaciones-compra.repository.ts`
  - Método `updateEstado()`
  - Método `updateEstadoConObservaciones()`

### Tests
- ✅ `test-cotizacion-estados.ps1` - Test completo del flujo de estados

## Conclusión

La funcionalidad de **Aprobar/Rechazar Cotizaciones** está completamente implementada y probada. Los endpoints están operativos y cumplen con todas las validaciones de negocio requeridas:

- ✅ Transiciones de estado correctas
- ✅ Validaciones de estado previo
- ✅ Validación de fecha de vencimiento
- ✅ Registro de motivo de rechazo
- ✅ Manejo de errores apropiado
- ✅ Tests de integración completos

**Estado:** COMPLETADO ✅
