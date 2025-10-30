# Implementación: Crear Registros en oc_aprobaciones

## Resumen

Se implementó la funcionalidad para crear registros en la tabla `oc_aprobaciones` cuando se aprueba o rechaza una orden de compra. Esta implementación es parte del flujo de aprobaciones del módulo de compras.

## Archivos Creados

### 1. Repository: `oc-aprobaciones.repository.ts`

**Ubicación:** `apps/erp-api/src/modules/compras/repositories/oc-aprobaciones.repository.ts`

**Funcionalidades:**
- `create()`: Crea un nuevo registro de aprobación/rechazo
- `findByOrdenId()`: Obtiene todas las aprobaciones de una orden
- `updateEstado()`: Actualiza el estado de una aprobación
- `findPendingByAprobadorId()`: Obtiene aprobaciones pendientes de un aprobador
- `countPendingByOrdenId()`: Cuenta aprobaciones pendientes de una orden
- `hasRejectedApprovals()`: Verifica si hay aprobaciones rechazadas

**Estructura del registro:**
```typescript
{
  orden_id: string;
  nivel: number;              // Nivel de aprobación (1, 2, 3, etc.)
  aprobador_id: string;       // ID del usuario aprobador
  aprobador_nombre: string;   // Nombre del aprobador (para histórico)
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  fecha_aprobacion?: string;  // Fecha de aprobación/rechazo
  comentarios?: string;       // Comentarios del aprobador
}
```

## Archivos Modificados

### 1. Service: `ordenes-compra.service.ts`

**Cambios en el método `aprobar()`:**
- Obtiene información del aprobador (ID y nombre)
- Crea registro en `oc_aprobaciones` con estado `APROBADA`
- Verifica si hay aprobaciones pendientes
- Actualiza el estado de la orden según las aprobaciones pendientes
- Maneja errores sin fallar la aprobación

**Cambios en el método `rechazar()`:**
- Obtiene información del rechazador (ID y nombre)
- Crea registro en `oc_aprobaciones` con estado `RECHAZADA`
- Actualiza el estado de la orden a `ANULADA`
- Registra el motivo del rechazo en los comentarios
- Maneja errores sin fallar el rechazo

### 2. Module: `compras.module.ts`

**Cambios:**
- Importa `OcAprobacionesRepository`
- Registra el repository en los providers del módulo

## Flujo de Aprobación

### Aprobación de Orden

1. Usuario llama al endpoint `POST /api/compras/ordenes/:id/aprobar`
2. Se valida que la orden existe y está en estado apropiable
3. Se obtiene información del aprobador (ID y nombre)
4. Se crea registro en `oc_aprobaciones`:
   - `estado`: `APROBADA`
   - `nivel`: 1 (por ahora solo un nivel)
   - `fecha_aprobacion`: timestamp actual
   - `comentarios`: comentarios del aprobador
5. Se verifica si hay aprobaciones pendientes
6. Se actualiza el estado de la orden:
   - Si hay pendientes: `APROBACION`
   - Si no hay pendientes: `APROBADA`

### Rechazo de Orden

1. Usuario llama al endpoint `POST /api/compras/ordenes/:id/rechazar`
2. Se valida que la orden existe y está en estado rechazable
3. Se obtiene información del rechazador (ID y nombre)
4. Se crea registro en `oc_aprobaciones`:
   - `estado`: `RECHAZADA`
   - `nivel`: 1
   - `fecha_aprobacion`: timestamp actual
   - `comentarios`: motivo del rechazo
5. Se actualiza el estado de la orden a `ANULADA`

## Características Implementadas

### ✅ Registro de Aprobaciones
- Crea registro automático al aprobar una orden
- Almacena ID y nombre del aprobador
- Registra fecha y hora de aprobación
- Permite agregar comentarios

### ✅ Registro de Rechazos
- Crea registro automático al rechazar una orden
- Almacena ID y nombre del rechazador
- Registra motivo del rechazo
- Marca la orden como anulada

### ✅ Obtención de Nombre del Usuario
- Intenta obtener el nombre del usuario desde la tabla `usuarios`
- Si no se encuentra, usa el ID como fallback
- Permite proporcionar el nombre manualmente en el DTO

### ✅ Manejo de Errores
- Los errores al crear registros no fallan la aprobación/rechazo
- Se registran en logs para debugging
- La operación principal continúa exitosamente

### ✅ Soporte Multi-Nivel (Preparado)
- Campo `nivel` permite aprobaciones multi-nivel
- Método `countPendingByOrdenId()` verifica aprobaciones pendientes
- Lógica preparada para flujos de aprobación complejos

## Estructura de la Tabla oc_aprobaciones

```sql
CREATE TABLE oc_aprobaciones (
  id UUID PRIMARY KEY,
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id),
  nivel INTEGER NOT NULL CHECK (nivel > 0),
  aprobador_id UUID NOT NULL,
  aprobador_nombre VARCHAR(255) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  fecha_aprobacion TIMESTAMP WITH TIME ZONE,
  comentarios TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(orden_id, nivel, aprobador_id)
);
```

## Testing

Se creó un script de prueba: `test-oc-aprobaciones.ps1`

**Casos de prueba:**
1. Crear orden de compra en estado `APROBACION`
2. Aprobar la orden y verificar registro en `oc_aprobaciones`
3. Crear segunda orden para rechazo
4. Rechazar la orden y verificar registro en `oc_aprobaciones`

**Ejecución:**
```powershell
.\test-oc-aprobaciones.ps1
```

**Verificación en BD:**
```sql
-- Ver todas las aprobaciones de una orden
SELECT * FROM oc_aprobaciones WHERE orden_id = '<orden_id>';

-- Ver aprobaciones pendientes de un usuario
SELECT oc.*, o.numero, o.total, o.estado
FROM oc_aprobaciones oc
JOIN ordenes_compra o ON o.id = oc.orden_id
WHERE oc.aprobador_id = '<user_id>' AND oc.estado = 'PENDIENTE';

-- Ver historial de aprobaciones
SELECT 
  oc.orden_id,
  o.numero,
  oc.nivel,
  oc.aprobador_nombre,
  oc.estado,
  oc.fecha_aprobacion,
  oc.comentarios
FROM oc_aprobaciones oc
JOIN ordenes_compra o ON o.id = oc.orden_id
ORDER BY oc.fecha_aprobacion DESC;
```

## Próximos Pasos (TODOs)

### Pendientes en el Código

1. **Notificar a aprobadores**
   - Implementar notificaciones cuando se requiere aprobación
   - Enviar emails/notificaciones push a aprobadores

2. **Validar todas las aprobaciones antes de APROBADA**
   - Implementar lógica multi-nivel completa
   - Verificar que todos los niveles estén aprobados

3. **Emitir evento OrdenCompraAprobada**
   - Crear evento de dominio
   - Integrar con sistema de eventos
   - Permitir que otros módulos reaccionen

4. **Emitir evento OrdenCompraRechazada**
   - Crear evento de dominio
   - Notificar a usuarios relevantes

### Mejoras Futuras

1. **Configuración de Niveles de Aprobación**
   - Permitir configurar múltiples niveles por monto
   - Asignar aprobadores por nivel
   - Flujos de aprobación paralelos o secuenciales

2. **Dashboard de Aprobaciones**
   - Vista de aprobaciones pendientes por usuario
   - Estadísticas de aprobaciones
   - Tiempos de aprobación

3. **Historial y Auditoría**
   - Vista completa del historial de aprobaciones
   - Reportes de aprobaciones por período
   - Análisis de rechazos

4. **Delegación de Aprobaciones**
   - Permitir delegar aprobaciones a otros usuarios
   - Aprobaciones temporales por ausencia

## Integración con Otros Módulos

### Configuración (empresa_config)
- Lee `monto_aprobacion_compras` para determinar si requiere aprobación
- Migración 036 agrega este campo

### Usuarios
- Obtiene nombre del usuario desde tabla `usuarios`
- Usa campos `nombre` y `apellido`

### Eventos (Futuro)
- `OrdenCompraAprobada`: Cuando se aprueba completamente
- `OrdenCompraRechazada`: Cuando se rechaza
- `AprobacionRequerida`: Cuando se crea orden que requiere aprobación

## Notas Técnicas

### Manejo de Transacciones
- Actualmente no usa transacciones explícitas
- Los errores en `oc_aprobaciones` no revierten la aprobación
- Considerar usar transacciones para atomicidad completa

### Performance
- Índices en `oc_aprobaciones`:
  - `orden_id` (para buscar por orden)
  - `aprobador_id` (para buscar por aprobador)
  - `estado` (para filtrar pendientes)
  - `(orden_id, nivel)` (para ordenar por nivel)

### Seguridad
- RLS habilitado en `oc_aprobaciones`
- Aislamiento por tenant a través de `ordenes_compra`
- Validación de permisos en endpoints

## Conclusión

La implementación de registros en `oc_aprobaciones` está completa y funcional. Se creó un repository robusto con métodos útiles para el flujo de aprobaciones, y se integró correctamente en los métodos de aprobación y rechazo del servicio de órdenes de compra.

La solución está preparada para soportar flujos de aprobación multi-nivel en el futuro, y proporciona una base sólida para auditoría y trazabilidad de aprobaciones.
