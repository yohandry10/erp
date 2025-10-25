# Notificaciones a Aprobadores - Órdenes de Compra

## Descripción

Este documento describe la implementación de notificaciones automáticas a usuarios con permisos de aprobación cuando se crea una orden de compra que requiere aprobación por monto.

## Flujo de Notificación

### 1. Evaluación de Aprobación Requerida

Cuando se crea una orden de compra, el sistema:

1. Calcula el total de la orden (subtotal + IGV)
2. Consulta el `monto_aprobacion_compras` configurado en `empresa_config`
3. Si el total excede el monto configurado, la orden se crea en estado `APROBACION`

### 2. Identificación de Aprobadores

El sistema busca usuarios que cumplan con los siguientes criterios:

- **Estado**: `ACTIVO`
- **Tenant**: Mismo tenant de la orden
- **Permisos**: Usuarios con alguno de los siguientes:
  - Permiso específico: `compras.aprobar`
  - Roles: `Gerente`, `Administrador`, o `Jefe de Compras`

### 3. Envío de Notificaciones

Para cada aprobador identificado, se crea una notificación con:

- **Tipo**: `OC_REQUIERE_APROBACION`
- **Severidad**: `WARNING`
- **Título**: "Orden de Compra Requiere Aprobación"
- **Mensaje**: "La orden de compra {numero} por {total} requiere su aprobación."
- **Acción**: Link directo a la orden (`/dashboard/compras/ordenes/{id}`)

## Implementación Técnica

### Archivos Modificados

1. **notification.types.ts**
   - Agregado tipo: `OC_REQUIERE_APROBACION`
   - Agregado tipo: `OC_APROBADA`
   - Agregado tipo: `OC_RECHAZADA`

2. **compras.module.ts**
   - Importado `NotificationsModule`

3. **ordenes-compra.service.ts**
   - Inyectado `NotificationsService`
   - Agregado método `notificarAprobadores()`
   - Agregado método `enviarNotificacionesAprobadores()`
   - Integrado en el flujo de creación de órdenes

### Métodos Principales

#### `notificarAprobadores(ordenId, tenantId, total)`

Método privado que:
1. Obtiene la información de la orden
2. Busca usuarios con permisos de aprobación
3. Delega el envío de notificaciones

**Estrategia de búsqueda de aprobadores:**
- Primero intenta buscar por permiso específico `compras.aprobar`
- Si falla o no encuentra usuarios, busca por roles predefinidos
- Maneja errores sin bloquear el flujo principal

#### `enviarNotificacionesAprobadores(usuarios, orden, tenantId, total)`

Método privado que:
1. Elimina usuarios duplicados
2. Formatea el total como moneda
3. Crea notificaciones individuales para cada aprobador
4. Usa `Promise.allSettled()` para no fallar si una notificación falla

## Configuración

### Monto de Aprobación

El monto que requiere aprobación se configura en la tabla `empresa_config`:

```sql
UPDATE empresa_config 
SET monto_aprobacion_compras = 10000.00 
WHERE tenant_id = 'your-tenant-id';
```

- Si `monto_aprobacion_compras` es `NULL` o `<= 0`, no se requiere aprobación
- El monto se compara con el total de la orden (incluye IGV)

### Permisos de Aprobación

Los usuarios pueden recibir notificaciones si tienen:

**Opción 1: Permiso específico**
```sql
-- Crear permiso si no existe
INSERT INTO permissions (codigo, nombre, descripcion, modulo)
VALUES ('compras.aprobar', 'Aprobar Compras', 'Permite aprobar órdenes de compra', 'compras');

-- Asignar permiso a un rol
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.nombre = 'Jefe de Compras'
AND p.codigo = 'compras.aprobar';
```

**Opción 2: Roles predefinidos**
Los siguientes roles reciben notificaciones automáticamente:
- `Gerente`
- `Administrador`
- `Jefe de Compras`

## Manejo de Errores

El sistema está diseñado para ser resiliente:

- **Error al obtener configuración**: No requiere aprobación (permite crear la orden)
- **Error al buscar aprobadores**: Intenta estrategia alternativa por roles
- **Error al enviar notificación**: Registra en logs pero no falla la creación
- **No hay aprobadores**: Registra advertencia pero permite crear la orden

Esto asegura que el flujo de compras nunca se bloquee por problemas de notificaciones.

## Testing

### Script de Prueba

Se incluye un script PowerShell para probar la funcionalidad:

```powershell
.\test-notificar-aprobadores.ps1
```

El script:
1. Verifica la configuración de monto de aprobación
2. Crea una orden que excede el monto
3. Verifica que se crearon notificaciones
4. Limpia la orden de prueba

### Prueba Manual

1. Configurar monto de aprobación bajo (ej: 1000)
2. Crear un usuario con rol `Gerente` o `Administrador`
3. Crear una orden de compra con total > 1000
4. Verificar que:
   - La orden se crea en estado `APROBACION`
   - El usuario recibe una notificación
   - La notificación tiene el link correcto

## Logs

El sistema registra los siguientes eventos:

```
✅ Notificación enviada a [Nombre] [Apellido] ([email])
⚠️  No se encontraron usuarios con permisos de aprobación de compras
❌ Error al notificar aprobadores: [error]
```

## Futuras Mejoras

1. **Múltiples niveles de aprobación**: Soportar aprobaciones escalonadas por monto
2. **Notificaciones por email**: Enviar emails además de notificaciones in-app
3. **Recordatorios**: Notificar nuevamente si no se aprueba en X días
4. **Delegación**: Permitir que aprobadores deleguen a otros usuarios
5. **Aprobación por categoría**: Requerir aprobación según tipo de producto/servicio

## Referencias

- Tabla de notificaciones: `notificaciones`
- Tabla de configuración: `empresa_config`
- Tabla de usuarios: `usuarios_sistema`
- Tabla de roles: `roles`
- Tabla de permisos: `permissions`
