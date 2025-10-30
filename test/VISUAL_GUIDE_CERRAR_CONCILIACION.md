# Guía Visual: Cerrar Conciliación Bancaria

## Funcionalidad Implementada

Se ha implementado la funcionalidad completa de **Confirmación de Cierre** para las conciliaciones bancarias.

## Características

### 1. Botón de Cierre
- Ubicado en la página de detalle de conciliación
- Solo habilitado cuando la conciliación está en estado `ABIERTA` o `EN_PROCESO`
- Deshabilitado cuando la conciliación ya está `CERRADA`

### 2. Modal de Confirmación
Al hacer clic en "Cerrar Conciliación", se abre un modal que muestra:

#### Resumen de Conciliación
- Período de conciliación
- Cuenta bancaria asociada

#### Saldos
- **Saldo Libro**: Saldo según el sistema
- **Saldo Banco**: Saldo según el extracto bancario
- **Diferencia**: Diferencia entre ambos saldos

#### Estadísticas de Movimientos

**Movimientos del Sistema:**
- Total de movimientos
- Movimientos conciliados
- Movimientos pendientes
- Total de abonos y cargos

**Movimientos del Extracto:**
- Total de movimientos
- Movimientos conciliados
- Movimientos pendientes
- Total de abonos y cargos

#### Métricas de Conciliación
- Porcentaje conciliado del sistema
- Porcentaje conciliado del extracto
- Porcentaje conciliado general

### 3. Validaciones

#### Movimientos Pendientes
Si hay movimientos sin conciliar:
- Se muestra una advertencia en color amarillo
- Se listan los movimientos pendientes del sistema
- Se listan los movimientos pendientes del extracto
- Se ofrece la opción de "Forzar Cierre"

#### Sin Movimientos Pendientes
Si todos los movimientos están conciliados:
- Se muestra un mensaje de éxito en color verde
- El botón "Cerrar Conciliación" está habilitado

### 4. Opciones de Cierre

#### Cierre Normal
- Solo disponible cuando todos los movimientos están conciliados
- Botón verde "Cerrar Conciliación"
- Cierra la conciliación sin forzar

#### Cierre Forzado
- Disponible cuando hay movimientos pendientes
- Botón amarillo "Forzar Cierre"
- Permite cerrar la conciliación dejando movimientos sin conciliar
- Los movimientos pendientes quedan disponibles para futuras conciliaciones

### 5. Resultado del Cierre

Después de cerrar exitosamente:
- La conciliación cambia a estado `CERRADA`
- Se registra la fecha y hora de cierre
- Se registra el usuario que cerró la conciliación
- Se genera un reporte de diferencias en las observaciones
- La página se recarga mostrando el nuevo estado
- Se muestra un mensaje de confirmación

### 6. Bloqueo Post-Cierre

Una vez cerrada la conciliación:
- No se pueden importar más extractos
- No se puede ejecutar match automático
- No se pueden hacer matches manuales
- El botón "Cerrar Conciliación" se deshabilita
- Todos los movimientos conciliados quedan marcados como definitivos

## Flujo de Usuario

1. Usuario navega a la página de detalle de una conciliación
2. Usuario hace clic en "Cerrar Conciliación"
3. Sistema carga el reporte de diferencias
4. Modal muestra el resumen completo con estadísticas
5. Usuario revisa:
   - Saldos y diferencias
   - Movimientos conciliados vs pendientes
   - Porcentajes de conciliación
6. Si hay pendientes:
   - Usuario puede cancelar y conciliar los pendientes
   - O puede forzar el cierre
7. Si no hay pendientes:
   - Usuario confirma el cierre
8. Sistema cierra la conciliación
9. Página se actualiza mostrando estado CERRADA

## Validaciones del Backend

El backend valida:
- ✅ Que la conciliación exista y pertenezca al tenant
- ✅ Que la conciliación no esté ya cerrada
- ✅ Que se haya importado un extracto bancario
- ✅ Que todos los movimientos estén conciliados (o se fuerce el cierre)
- ✅ Calcula y registra el reporte de diferencias
- ✅ Marca la conciliación como CERRADA
- ✅ Registra fecha, hora y usuario de cierre

## Endpoints Utilizados

### GET /api/finanzas/conciliacion/:id/diferencias
Obtiene el reporte de diferencias antes de cerrar:
- Saldos (libro, banco, diferencia)
- Estadísticas de movimientos
- Movimientos pendientes detallados
- Métricas de conciliación

### POST /api/finanzas/conciliacion/:id/cerrar
Cierra la conciliación:
```json
{
  "forzar_cierre": false
}
```

Respuesta exitosa:
```json
{
  "success": true,
  "data": {
    "conciliacion": {
      "id": "...",
      "estado": "CERRADA",
      "cerrado_at": "2025-10-26T...",
      "cerrado_by": "user-id"
    },
    "reporte": {
      "movimientos_sistema": {...},
      "movimientos_extracto": {...},
      "diferencias": {...},
      "porcentaje_conciliado": 100,
      "forzado": false
    },
    "mensaje": "Conciliación cerrada exitosamente..."
  }
}
```

## Archivos Modificados

### Frontend
- `apps/web/app/dashboard/finanzas/conciliacion/[id]/page.tsx`
  - Agregado estado para modal de cierre
  - Agregado estado para reporte de diferencias
  - Implementado `handleOpenCloseModal()`
  - Implementado `handleCerrarConciliacion()`
  - Agregado botón "Cerrar Conciliación"
  - Agregado modal de confirmación con reporte completo

### Backend
- Ya existía implementado en `apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts`
  - Método `cerrarConciliacion()` con todas las validaciones
  - Método `obtenerDiferencias()` para el reporte

## Testing

Se creó el script de prueba:
- `test-cerrar-conciliacion.ps1`

El script prueba:
1. Obtener lista de conciliaciones
2. Seleccionar una conciliación abierta
3. Obtener reporte de diferencias
4. Intentar cerrar la conciliación
5. Si hay pendientes, intentar forzar el cierre
6. Verificar el estado final

## Casos de Uso

### Caso 1: Cierre Exitoso (100% Conciliado)
```
Usuario: Hace clic en "Cerrar Conciliación"
Sistema: Muestra modal con reporte
Sistema: Todos los movimientos conciliados (100%)
Sistema: Mensaje verde "Listo para Cerrar"
Usuario: Hace clic en "Cerrar Conciliación"
Sistema: Cierra la conciliación
Sistema: Muestra mensaje de éxito
Sistema: Recarga la página con estado CERRADA
```

### Caso 2: Cierre con Pendientes (Forzado)
```
Usuario: Hace clic en "Cerrar Conciliación"
Sistema: Muestra modal con reporte
Sistema: Hay movimientos pendientes
Sistema: Muestra advertencia amarilla
Sistema: Lista movimientos pendientes
Sistema: Ofrece "Forzar Cierre"
Usuario: Hace clic en "Forzar Cierre"
Sistema: Confirma el cierre forzado
Sistema: Cierra la conciliación
Sistema: Movimientos pendientes quedan sin conciliar
Sistema: Muestra mensaje de éxito con advertencia
Sistema: Recarga la página con estado CERRADA
```

### Caso 3: Cancelar Cierre
```
Usuario: Hace clic en "Cerrar Conciliación"
Sistema: Muestra modal con reporte
Usuario: Revisa y decide no cerrar
Usuario: Hace clic en "Cancelar"
Sistema: Cierra el modal
Sistema: Conciliación permanece abierta
Usuario: Puede continuar conciliando
```

## Beneficios

1. **Transparencia**: Usuario ve exactamente qué se está cerrando
2. **Control**: Usuario puede revisar antes de confirmar
3. **Flexibilidad**: Opción de forzar cierre si es necesario
4. **Auditoría**: Se registra quién y cuándo cerró
5. **Seguridad**: Validaciones previenen cierres incorrectos
6. **Información**: Reporte detallado de diferencias
7. **UX**: Proceso claro y guiado paso a paso
