# Validación de Ítems Procesados - Cierre de Conciliación

## Tarea Completada

✅ **TASK 3.5 - Sub-tarea: Validar todos los ítems procesados**

## Implementación

Se implementó la validación completa de ítems procesados antes de permitir el cierre de una conciliación bancaria.

### Archivos Modificados

1. **`apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts`**
   - Método `cerrarConciliacion()` actualizado con validaciones completas
   - Nuevo parámetro `forzarCierre` para permitir cierre con movimientos pendientes

2. **`apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.controller.ts`**
   - Endpoint `POST /api/finanzas/conciliacion/:id/cerrar` actualizado
   - Acepta DTO con opción `forzar_cierre`

3. **`apps/erp-api/src/modules/finanzas/conciliacion/dto/cerrar-conciliacion.dto.ts`** (NUEVO)
   - DTO para el cierre de conciliación
   - Campo opcional `forzar_cierre: boolean`

4. **`apps/erp-api/src/modules/finanzas/conciliacion/dto/index.ts`**
   - Exporta el nuevo DTO

### Validaciones Implementadas

#### 1. Validación de Movimientos Pendientes

```typescript
const hayMovimientosPendientes = movimientosSistemaPendientes > 0 || movimientosExtractoPendientes > 0;

if (hayMovimientosPendientes && !forzarCierre) {
  throw new BadRequestException(
    'No se puede cerrar la conciliación porque hay movimientos pendientes de procesar...'
  );
}
```

**Comportamiento:**
- ❌ Rechaza el cierre si hay movimientos sin conciliar
- ✅ Permite el cierre si `forzar_cierre = true`
- ✅ Proporciona mensaje detallado con cantidad de pendientes

#### 2. Validación de Extracto Importado

```typescript
if (totalMovimientosExtracto === 0) {
  throw new BadRequestException(
    'No se puede cerrar la conciliación sin haber importado un extracto bancario...'
  );
}
```

**Comportamiento:**
- ❌ Rechaza el cierre si no se importó extracto CSV
- ✅ Garantiza que siempre hay datos del banco para conciliar

#### 3. Validación de Movimientos del Sistema

```typescript
if (totalMovimientosSistema === 0) {
  console.warn(
    `Conciliación ${conciliacionId}: No hay movimientos del sistema en el período...`
  );
}
```

**Comportamiento:**
- ⚠️ Genera advertencia si no hay movimientos del sistema
- ✅ Permite continuar (puede ser período sin actividad)

#### 4. Validación de Estado

```typescript
if (conciliacion.estado === 'CERRADA') {
  throw new BadRequestException('La conciliación ya está cerrada');
}
```

**Comportamiento:**
- ❌ Previene cerrar una conciliación ya cerrada
- ✅ Garantiza inmutabilidad después del cierre

### Flujo de Validación

```
┌─────────────────────────────────────┐
│ POST /api/finanzas/conciliacion/:id/cerrar │
│ Body: { forzar_cierre?: boolean }  │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 1. Verificar conciliación existe     │
│    y no está cerrada                 │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 2. Obtener movimientos del sistema   │
│    y del extracto                    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 3. Calcular pendientes               │
│    - Sistema: no conciliados         │
│    - Extracto: no conciliados        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 4. VALIDAR: ¿Hay pendientes?         │
│    SI + !forzar → RECHAZAR           │
│    SI + forzar → CONTINUAR           │
│    NO → CONTINUAR                    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 5. VALIDAR: ¿Extracto importado?     │
│    NO → RECHAZAR                     │
│    SI → CONTINUAR                    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 6. Generar reporte de diferencias    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 7. Cerrar conciliación               │
│    - estado = CERRADA                │
│    - cerrado_at = now()              │
│    - cerrado_by = userId             │
│    - observaciones = reporte         │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 8. Retornar resultado con reporte    │
└──────────────────────────────────────┘
```

### Casos de Uso

#### Caso 1: Cierre Normal (Todos Conciliados)

**Request:**
```json
POST /api/finanzas/conciliacion/abc-123/cerrar
{
  "forzar_cierre": false
}
```

**Condiciones:**
- ✅ Extracto importado
- ✅ Todos los movimientos conciliados
- ✅ Estado = EN_PROCESO

**Response:**
```json
{
  "success": true,
  "data": {
    "conciliacion": { "estado": "CERRADA", ... },
    "reporte": {
      "movimientos_sistema": { "pendientes": 0, ... },
      "movimientos_extracto": { "pendientes": 0, ... },
      "forzado": false
    },
    "mensaje": "Conciliación cerrada exitosamente. Todos los movimientos fueron conciliados."
  }
}
```

#### Caso 2: Cierre con Pendientes (Sin Forzar)

**Request:**
```json
POST /api/finanzas/conciliacion/abc-123/cerrar
{
  "forzar_cierre": false
}
```

**Condiciones:**
- ✅ Extracto importado
- ❌ Hay movimientos sin conciliar
- ✅ Estado = EN_PROCESO

**Response:**
```json
{
  "statusCode": 400,
  "message": "No se puede cerrar la conciliación porque hay movimientos pendientes de procesar:\n- 3 movimiento(s) del sistema sin conciliar\n- 2 movimiento(s) del extracto sin conciliar\n\nOpciones:\n1. Concilie todos los movimientos pendientes (automático o manual)\n2. Fuerce el cierre si está seguro de que los movimientos pendientes son correctos",
  "error": "Bad Request"
}
```

#### Caso 3: Cierre Forzado con Pendientes

**Request:**
```json
POST /api/finanzas/conciliacion/abc-123/cerrar
{
  "forzar_cierre": true
}
```

**Condiciones:**
- ✅ Extracto importado
- ❌ Hay movimientos sin conciliar
- ✅ Estado = EN_PROCESO

**Response:**
```json
{
  "success": true,
  "data": {
    "conciliacion": { "estado": "CERRADA", ... },
    "reporte": {
      "movimientos_sistema": { "pendientes": 3, ... },
      "movimientos_extracto": { "pendientes": 2, ... },
      "forzado": true
    },
    "mensaje": "Conciliación cerrada con 3 movimientos del sistema y 2 movimientos del extracto pendientes"
  }
}
```

#### Caso 4: Sin Extracto Importado

**Request:**
```json
POST /api/finanzas/conciliacion/abc-123/cerrar
{
  "forzar_cierre": false
}
```

**Condiciones:**
- ❌ No se importó extracto
- ✅ Estado = EN_PROCESO

**Response:**
```json
{
  "statusCode": 400,
  "message": "No se puede cerrar la conciliación sin haber importado un extracto bancario. Debe importar el extracto CSV antes de cerrar la conciliación.",
  "error": "Bad Request"
}
```

### Beneficios de la Implementación

1. **Integridad de Datos**
   - Garantiza que todas las conciliaciones cerradas tienen datos completos
   - Previene cierres accidentales con trabajo incompleto

2. **Flexibilidad**
   - Permite forzar cierre en casos excepcionales
   - Útil para períodos con movimientos legítimamente no conciliables

3. **Trazabilidad**
   - Registra si el cierre fue forzado en el reporte
   - Incluye detalles de movimientos pendientes

4. **Experiencia de Usuario**
   - Mensajes claros sobre por qué no se puede cerrar
   - Opciones explícitas para resolver el problema

5. **Auditoría**
   - Registra quién cerró la conciliación (`cerrado_by`)
   - Registra cuándo se cerró (`cerrado_at`)
   - Guarda reporte completo en `observaciones`

### Testing

Se crearon los siguientes archivos de prueba:

1. **`apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.spec.ts`**
   - Tests unitarios para validaciones
   - Cobertura de casos edge

2. **`test-cerrar-conciliacion-validacion.ps1`**
   - Script de prueba manual
   - Verifica comportamiento end-to-end

### Próximos Pasos

Para completar la tarea 3.5 completamente, se deben implementar las siguientes sub-tareas:

- [ ] Marcar movimientos como conciliado=true (ya implementado durante match)
- [ ] Generar reporte de diferencias (✅ implementado)
- [ ] Bloquear modificaciones (✅ implementado mediante validación de estado)

## Conclusión

✅ La validación de ítems procesados está completamente implementada y funcional.

La implementación cumple con todos los requisitos de la tarea:
- Valida que todos los ítems han sido procesados
- Permite cierre forzado cuando sea necesario
- Genera reportes detallados
- Bloquea modificaciones post-cierre
- Proporciona mensajes claros al usuario
