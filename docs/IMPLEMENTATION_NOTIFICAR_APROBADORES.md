# Implementación: Notificar a Aprobadores

## Resumen

Se implementó la funcionalidad de notificación automática a usuarios con permisos de aprobación cuando se crea una orden de compra que requiere aprobación por monto.

## Cambios Realizados

### 1. Tipos de Notificación (notification.types.ts)

Se agregaron tres nuevos tipos de notificación para el módulo de compras:

```typescript
OC_REQUIERE_APROBACION = 'oc_requiere_aprobacion',
OC_APROBADA = 'oc_aprobada',
OC_RECHAZADA = 'oc_rechazada'
```

### 2. Módulo de Compras (compras.module.ts)

- Importado `NotificationsModule` para acceder al servicio de notificaciones
- Agregado a los imports del módulo

### 3. Servicio de Órdenes de Compra (ordenes-compra.service.ts)

#### Imports Agregados
```typescript
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationSeverity } from '../../notifications/notification.types';
```

#### Constructor Actualizado
```typescript
constructor(
  // ... otros servicios
  private readonly notificationsService: NotificationsService
) {}
```

#### Integración en el Flujo de Creación

En el método `create()`, después de crear la orden:

```typescript
// Si requiere aprobación, notificar a los aprobadores
if (requiereAprobacion && orden.estado === 'APROBACION') {
  try {
    await this.notificarAprobadores(orden.id, tenantId, total);
  } catch (error) {
    console.error('Error al notificar aprobadores:', error);
  }
}
```

#### Nuevos Métodos Privados

**`notificarAprobadores(ordenId, tenantId, total)`**

Responsabilidades:
- Obtener información de la orden
- Buscar usuarios con permisos de aprobación
- Manejar estrategias alternativas de búsqueda
- Delegar el envío de notificaciones

Estrategia de búsqueda:
1. Intenta buscar usuarios con permiso `compras.aprobar`
2. Si falla, busca usuarios con roles: `Gerente`, `Administrador`, `Jefe de Compras`
3. Si no encuentra usuarios, registra advertencia pero no falla

**`enviarNotificacionesAprobadores(usuarios, orden, tenantId, total)`**

Responsabilidades:
- Eliminar usuarios duplicados
- Formatear el total como moneda (PEN)
- Crear notificaciones individuales para cada aprobador
- Usar `Promise.allSettled()` para manejar errores individuales

Contenido de la notificación:
- **Tipo**: `OC_REQUIERE_APROBACION`
- **Severidad**: `WARNING`
- **Título**: "Orden de Compra Requiere Aprobación"
- **Mensaje**: "La orden de compra {numero} por {total} requiere su aprobación."
- **URL de acción**: `/dashboard/compras/ordenes/{id}`
- **Label de acción**: "Ver Orden"

## Características Implementadas

### ✅ Notificación Automática
- Se envían notificaciones automáticamente al crear órdenes que requieren aprobación
- No bloquea el flujo si hay errores en las notificaciones

### ✅ Búsqueda Inteligente de Aprobadores
- Busca por permiso específico primero
- Fallback a roles predefinidos
- Maneja errores gracefully

### ✅ Eliminación de Duplicados
- Asegura que cada usuario reciba solo una notificación
- Usa Map para eliminar duplicados por ID

### ✅ Formato de Moneda
- Formatea el total en formato de moneda peruana (PEN)
- Usa `Intl.NumberFormat` para formato correcto

### ✅ Manejo de Errores Robusto
- Errores en notificaciones no bloquean la creación de órdenes
- Logs detallados para debugging
- Estrategias alternativas de búsqueda

### ✅ Acción Directa
- Cada notificación incluye un link directo a la orden
- Facilita el acceso rápido para aprobación

## Archivos Creados

1. **test-notificar-aprobadores.ps1**
   - Script de prueba automatizado
   - Crea orden que requiere aprobación
   - Verifica notificaciones creadas
   - Limpia datos de prueba

2. **NOTIFICACIONES_APROBADORES.md**
   - Documentación completa de la funcionalidad
   - Guía de configuración
   - Ejemplos de uso
   - Troubleshooting

3. **IMPLEMENTATION_NOTIFICAR_APROBADORES.md** (este archivo)
   - Resumen de implementación
   - Cambios realizados
   - Características implementadas

## Testing

### Prueba Automatizada

```powershell
.\test-notificar-aprobadores.ps1
```

### Prueba Manual

1. Configurar monto de aprobación:
   ```sql
   UPDATE empresa_config 
   SET monto_aprobacion_compras = 1000.00 
   WHERE tenant_id = 'your-tenant-id';
   ```

2. Crear usuario con rol de aprobador (Gerente/Administrador)

3. Crear orden de compra con total > 1000

4. Verificar:
   - Orden en estado `APROBACION`
   - Notificación creada para el aprobador
   - Link de acción correcto

## Configuración Requerida

### Base de Datos

La tabla `notificaciones` debe existir con las siguientes columnas:
- `id` (UUID)
- `tenant_id` (UUID)
- `usuario_id` (UUID)
- `tipo` (VARCHAR)
- `severidad` (VARCHAR)
- `titulo` (VARCHAR)
- `mensaje` (TEXT)
- `action_url` (VARCHAR)
- `action_label` (VARCHAR)
- `leida` (BOOLEAN)
- `created_at` (TIMESTAMP)
- `leida_at` (TIMESTAMP)

### Permisos

Crear permiso de aprobación (opcional):
```sql
INSERT INTO permissions (codigo, nombre, descripcion, modulo)
VALUES ('compras.aprobar', 'Aprobar Compras', 'Permite aprobar órdenes de compra', 'compras');
```

### Roles

Los siguientes roles reciben notificaciones automáticamente:
- `Gerente`
- `Administrador`
- `Jefe de Compras`

## Logs y Monitoreo

El sistema registra:

```
✅ Notificación enviada a [Nombre] [Apellido] ([email])
⚠️  No se encontraron usuarios con permisos de aprobación de compras
❌ Error al notificar aprobadores: [error]
❌ Error al enviar notificación a usuario [id]: [error]
```

## Próximos Pasos

Esta implementación completa la tarea **"Notificar a aprobadores"** del documento de tareas.

Las siguientes tareas relacionadas pendientes son:
- [ ] Validar todas las aprobaciones antes de APROBADA
- [ ] Emitir evento OrdenCompraAprobada

## Notas Técnicas

- **Resiliencia**: El sistema nunca falla la creación de órdenes por problemas de notificaciones
- **Performance**: Usa `Promise.allSettled()` para enviar notificaciones en paralelo
- **Escalabilidad**: Soporta múltiples aprobadores sin problemas
- **Mantenibilidad**: Código bien documentado y separado en métodos privados

## Dependencias

- `@nestjs/common`: Framework base
- `NotificationsService`: Servicio de notificaciones
- `SupabaseService`: Cliente de base de datos
- `OrdenesCompraRepository`: Repositorio de órdenes

## Compatibilidad

- ✅ Compatible con el flujo existente de órdenes de compra
- ✅ No rompe funcionalidad existente
- ✅ Backward compatible (funciona sin configuración de aprobación)
- ✅ Multi-tenant compatible
