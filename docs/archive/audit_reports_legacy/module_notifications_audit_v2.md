# 🔍 AUDITORÍA EXHAUSTIVA: Módulo de Notificaciones v2

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_auditoria_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

**Fecha**: 2025-11-29
**Auditor**: Kiro AI
**Módulo**: Notificaciones (Frontend + Backend + Base de Datos)
**Versión**: 2.0 - Auditoría Completa

---

## 📋 CUESTIONARIO TÉCNICO EXHAUSTIVO (10 PREGUNTAS AVANZADAS)

---

### 🔴 PREGUNTA 1: LÓGICA DE NEGOCIO - Sincronización de Campos API

**Pregunta**: ¿Los campos de la API coinciden con lo que espera el frontend?

**Estado**: ✅ CORREGIDO (verificado en código actual)

**Análisis Técnico**:
El código actual en `NotificationItem.tsx` ya usa los campos correctos en inglés:

```typescript
// CORRECTO - Interfaz actual
export interface Notification {
  id: string
  tenant_id?: string
  usuario_id?: string
  type: string           // ✅ Correcto (inglés)
  severity: 'info' | 'warning' | 'error'  // ✅ Correcto (inglés)
  title: string          // ✅ Correcto (inglés)
  message: string        // ✅ Correcto (inglés)
  action_url?: string
  action_label?: string
  leida: boolean
  created_at: string
  leida_at?: string
}
```

**Backend mapea correctamente** (`notifications.service.ts`):
```typescript
private mapToNotification(data: any): Notification {
  return {
    title: data.titulo,    // DB español → API inglés ✅
    message: data.mensaje, // DB español → API inglés ✅
    type: data.tipo,
    severity: data.severidad,
    // ...
  }
}
```

**Verificación**: El frontend usa `notification.title` y `notification.message` correctamente.

---

### 🔴 PREGUNTA 2: LÓGICA DE NEGOCIO - Casos Extremos en Flujos

**Pregunta**: ¿Se han considerado todos los casos extremos en los flujos principales?

**Estado**: ⚠️ PROBLEMAS DETECTADOS

**Análisis Técnico**:

#### Problema 2.1: Notificaciones sin título/mensaje vacíos
```typescript
// NotificationItem.tsx línea 103-104
const title = notification.title || 'Notificación'
const message = notification.message || ''
```
**Riesgo**: Si `title` es string vacío `""`, NO se usa el fallback.

**Solución Propuesta**:
```typescript
const title = notification.title?.trim() || 'Notificación'
const message = notification.message?.trim() || ''
```

#### Problema 2.2: Fechas inválidas no manejadas completamente
```typescript
// formatDate maneja errores pero no fechas futuras
const formatDate = (dateString: string) => {
  // ...
  const diffMs = now.getTime() - date.getTime()
  // Si diffMs es negativo (fecha futura), muestra valores negativos
}
```

#### Problema 2.3: Severidad desconocida
```typescript
const config = severityConfig[notification.severity] ?? severityConfig.info
```
**Correcto**: Ya tiene fallback a `info`.

---

### 🔴 PREGUNTA 3: SEGURIDAD BACKEND - Protección de Endpoints

**Pregunta**: ¿Están todos los endpoints protegidos contra inyecciones SQL y XSS?

**Estado**: ✅ CORRECTO

**Análisis Técnico**:

1. **Protección SQL Injection**: ✅
   - Usa Supabase client con queries parametrizadas
   - NO hay SQL raw en ningún servicio
   ```typescript
   // Ejemplo seguro:
   .eq('tenant_id', tenantId)
   .eq('id', notificationId)
   ```

2. **Protección XSS**: ✅
   - React escapa automáticamente el contenido renderizado
   - No hay uso de `dangerouslySetInnerHTML`

3. **Guards de Autenticación**: ✅
   ```typescript
   @UseGuards(JwtAuthGuard, PermissionGuard)
   @ApiBearerAuth()
   ```

4. **Permisos por Endpoint**: ✅
   | Endpoint | Permiso |
   |----------|---------|
   | GET /notifications | notifications.read |
   | GET /notifications/unread | notifications.read |
   | POST /notifications | notifications.create |
   | PUT /notifications/:id/read | notifications.update |
   | DELETE /notifications/:id | notifications.delete |

---

### 🔴 PREGUNTA 4: SEGURIDAD BACKEND - Validación de Permisos por Usuario

**Pregunta**: ¿Se validan adecuadamente los permisos de usuario en cada operación?

**Estado**: ⚠️ BRECHA DE SEGURIDAD DETECTADA

**Análisis Técnico**:

#### Problema 4.1: Usuario puede eliminar notificaciones de otros usuarios
```typescript
// notifications.service.ts - deleteNotification
async deleteNotification(tenantId: string, notificationId: string, user?: AuthenticatedUser) {
  // ❌ NO valida que la notificación pertenezca al usuario
  const { error } = await this.supabaseService
    .getClient()
    .from('notificaciones')
    .delete()
    .eq('id', notificationId)
    .eq('tenant_id', tenantId)  // Solo valida tenant, NO usuario
}
```

**Impacto**: Un usuario puede eliminar notificaciones de otros usuarios del mismo tenant.

**Solución Propuesta**:
```typescript
async deleteNotification(tenantId: string, notificationId: string, user?: AuthenticatedUser) {
  // Primero verificar que la notificación pertenece al usuario
  const { data: notification } = await this.supabaseService
    .getClient()
    .from('notificaciones')
    .select('usuario_id')
    .eq('id', notificationId)
    .eq('tenant_id', tenantId)
    .single();

  if (notification?.usuario_id && notification.usuario_id !== user?.id && !user?.is_super_admin) {
    throw new ForbiddenException('No tiene permiso para eliminar esta notificación');
  }

  // Proceder con eliminación
  // ...
}
```

#### Problema 4.2: Mismo problema en markAsRead
```typescript
// markAsRead NO valida que la notificación pertenezca al usuario
```

---

### 🔴 PREGUNTA 5: RENDIMIENTO FRONTEND - Re-renders Innecesarios

**Pregunta**: ¿Hay componentes que causen re-renders innecesarios?

**Estado**: ⚠️ PROBLEMAS DETECTADOS

**Análisis Técnico**:

#### Problema 5.1: Polling sin memoización
```typescript
// NotificationBell.tsx
useEffect(() => {
  fetchUnreadCount()  // ❌ Función recreada en cada render
  const interval = setInterval(fetchUnreadCount, 30000)
  return () => clearInterval(interval)
}, [])  // ❌ Dependencias vacías pero usa `get` del hook
```

**Solución Propuesta**:
```typescript
const fetchUnreadCount = useCallback(async () => {
  // ...
}, [get])

useEffect(() => {
  fetchUnreadCount()
  const interval = setInterval(fetchUnreadCount, 30000)
  return () => clearInterval(interval)
}, [fetchUnreadCount])
```

#### Problema 5.2: Inline styles causan re-renders
```typescript
// NotificationItem.tsx - Múltiples objetos de estilo inline
style={{
  position: 'relative',
  padding: '16px',
  // ... 10+ propiedades
}}
```
**Impacto**: Cada render crea nuevos objetos de estilo.

**Solución**: Usar CSS modules o styled-components, o memoizar estilos.

---

### 🔴 PREGUNTA 6: RENDIMIENTO FRONTEND - Optimización de Llamadas API

**Pregunta**: ¿Se optimizaron las llamadas a la API para evitar sobrecarga?

**Estado**: ⚠️ PROBLEMAS DETECTADOS

**Análisis Técnico**:

#### Problema 6.1: Llamadas duplicadas
```typescript
// NotificationBell.tsx - Llama a /unread para el badge
const fetchUnreadCount = async () => {
  const response = await get('/api/notifications/unread')
  // ...
}

// NotificationPanel.tsx - Llama a /notifications al abrir
const fetchNotifications = async () => {
  const response = await get('/api/notifications')
  // ...
}
```

**Impacto**: 2 llamadas separadas cuando podrían ser 1.

**Solución Propuesta**: Endpoint unificado
```typescript
// Backend: GET /api/notifications?include_count=true
{
  success: true,
  data: {
    notifications: [...],
    unread_count: 5
  }
}
```

#### Problema 6.2: No hay caché de notificaciones
```typescript
// Cada vez que se abre el panel, se hace fetch completo
// No hay React Query, SWR, o caché manual
```

---

### 🔴 PREGUNTA 7: INTEGRIDAD DE DATOS - Consistencia Transaccional

**Pregunta**: ¿Mantiene la base de datos consistencia transaccional en operaciones críticas?

**Estado**: ⚠️ PROBLEMAS DETECTADOS

**Análisis Técnico**:

#### Problema 7.1: markAllAsRead no es atómico
```typescript
// NotificationPanel.tsx
const handleMarkAllAsRead = async () => {
  const unreadIds = notifications.filter((n) => !n.leida).map((n) => n.id)
  // ❌ Múltiples llamadas individuales, no transaccional
  await Promise.all(unreadIds.map((id) => put(`/api/notifications/${id}/read`)))
}
```

**Impacto**: Si falla una llamada, algunas notificaciones quedan marcadas y otras no.

**Solución**: El backend ya tiene `markAllAsRead` pero el frontend no lo usa:
```typescript
// Usar endpoint existente:
await put('/api/notifications/mark-all-read')
```

#### Problema 7.2: Backend markAllAsRead tampoco es transaccional
```typescript
// notifications.service.ts
async markAllAsRead(tenantId: string, usuarioId?: string) {
  // ❌ Single UPDATE, pero sin transacción explícita
  const { data, error } = await this.supabaseService
    .getClient()
    .from('notificaciones')
    .update({ leida: true, leida_at: new Date().toISOString() })
    // ...
}
```
**Nota**: En este caso, un single UPDATE es atómico en PostgreSQL, así que está OK.

---

### 🔴 PREGUNTA 8: INTEGRIDAD DE DATOS - Índices Faltantes

**Pregunta**: ¿Existen índices faltantes en consultas frecuentes?

**Estado**: ✅ CORRECTO

**Análisis Técnico**:

La migración `150__fix_notificaciones_table.sql` ya incluye los índices necesarios:

```sql
-- ✅ Índice para filtrar por tenant y estado de lectura
CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_leida
  ON notificaciones(tenant_id, leida);

-- ✅ Índice para ordenar por fecha de creación
CREATE INDEX IF NOT EXISTS idx_notificaciones_tenant_created
  ON notificaciones(tenant_id, created_at DESC);

-- ✅ Índice parcial para notificaciones de usuario específico
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario
  ON notificaciones(usuario_id) WHERE usuario_id IS NOT NULL;
```

**Consultas cubiertas**:
- `WHERE tenant_id = X AND leida = false` ✅
- `WHERE tenant_id = X ORDER BY created_at DESC` ✅
- `WHERE usuario_id = X` ✅

---

### 🔴 PREGUNTA 9: MANEJO DE ERRORES - Captura de Estados de Error

**Pregunta**: ¿Captura el sistema adecuadamente todos los posibles estados de error?

**Estado**: ⚠️ PROBLEMAS DETECTADOS

**Análisis Técnico**:

#### Problema 9.1: Errores silenciados en frontend
```typescript
// NotificationPanel.tsx
} catch (error) {
  console.error('Error fetching notifications:', error)
  setNotifications([])  // ❌ Usuario no sabe que hubo error
}
```

**Solución Propuesta**:
```typescript
const [error, setError] = useState<string | null>(null)

} catch (error) {
  console.error('Error fetching notifications:', error)
  setError('No se pudieron cargar las notificaciones')
  setNotifications([])
}

// En el render:
{error && <ErrorMessage message={error} onRetry={fetchNotifications} />}
```

#### Problema 9.2: Backend retorna success: false pero no HTTP error
```typescript
// notifications.controller.ts
} catch (error) {
  return {
    success: false,
    data: [],
    error: error.message  // ❌ Retorna 200 OK con error en body
  }
}
```

**Impacto**: El frontend debe verificar `response.success` además del status HTTP.

---

### 🔴 PREGUNTA 10: MANEJO DE ERRORES - Exposición de Información Sensible

**Pregunta**: ¿Proporciona mensajes de error útiles sin exponer información sensible?

**Estado**: ⚠️ PROBLEMAS DETECTADOS

**Análisis Técnico**:

#### Problema 10.1: Error messages exponen detalles internos
```typescript
// notifications.controller.ts
return {
  success: false,
  error: error.message  // ❌ Puede exponer stack traces o info de DB
}
```

**Ejemplo de exposición**:
```json
{
  "success": false,
  "error": "duplicate key value violates unique constraint \"notificaciones_pkey\""
}
```

**Solución Propuesta**:
```typescript
// Crear mapeo de errores seguros
const sanitizeError = (error: Error): string => {
  if (error.message.includes('duplicate key')) {
    return 'La notificación ya existe'
  }
  if (error.message.includes('foreign key')) {
    return 'Referencia inválida'
  }
  // Log el error real internamente
  this.logger.error('Error interno:', error)
  return 'Error al procesar la solicitud'
}
```

---

## 📊 RESUMEN DE HALLAZGOS

| # | Categoría | Severidad | Problema | Estado |
|---|-----------|-----------|----------|--------|
| 1 | Lógica | ✅ OK | Campos API sincronizados | CORREGIDO |
| 2 | Lógica | 🟡 MEDIO | Strings vacíos no manejados | PENDIENTE |
| 3 | Seguridad | ✅ OK | SQL Injection / XSS | PROTEGIDO |
| 4 | Seguridad | 🔴 ALTO | Usuario puede eliminar notif. de otros | PENDIENTE |
| 5 | Rendimiento | 🟡 MEDIO | Re-renders por inline styles | PENDIENTE |
| 6 | Rendimiento | 🟡 MEDIO | Llamadas API duplicadas | PENDIENTE |
| 7 | Integridad | 🟡 MEDIO | Frontend no usa markAllAsRead | PENDIENTE |
| 8 | Integridad | ✅ OK | Índices correctos | CORRECTO |
| 9 | Errores | 🟡 MEDIO | Errores silenciados en UI | PENDIENTE |
| 10 | Errores | 🟡 MEDIO | Mensajes exponen info interna | PENDIENTE |

---

## 🛠️ CORRECCIONES IMPLEMENTADAS

### Fix 1: Validación de strings vacíos en título/mensaje


**Archivo**: `apps/web/components/notifications/NotificationItem.tsx`
```typescript
// ANTES:
const title = notification.title || 'Notificación'
const message = notification.message || ''

// DESPUÉS:
const title = notification.title?.trim() || 'Notificación'
const message = notification.message?.trim() || ''
```

### Fix 2: Usar endpoint batch para marcar todas como leídas

**Archivo**: `apps/web/components/notifications/NotificationPanel.tsx`
```typescript
// ANTES (múltiples llamadas):
const unreadIds = notifications.filter((n) => !n.leida).map((n) => n.id)
await Promise.all(unreadIds.map((id) => put(`/api/notifications/${id}/read`)))

// DESPUÉS (una sola llamada):
await put('/api/notifications/mark-all-read')
```

### Fix 3: Validación de permisos de usuario en backend

**Archivo**: `apps/erp-api/src/modules/notifications/notifications.service.ts`

Agregada validación en `deleteNotification` y `markAsRead`:
```typescript
// Verificar que la notificación pertenece al usuario o es super admin
const { data: notification } = await this.supabaseService
  .getClient()
  .from('notificaciones')
  .select('usuario_id')
  .eq('id', notificationId)
  .eq('tenant_id', tenantId)
  .single();

if (notification?.usuario_id && notification.usuario_id !== user?.id && !user?.is_super_admin) {
  throw new Error('No tiene permiso para eliminar esta notificación');
}
```

### Fix 4: Manejo de errores visual en frontend

**Archivo**: `apps/web/components/notifications/NotificationPanel.tsx`

Agregado estado de error y UI de retry:
```typescript
const [error, setError] = useState<string | null>(null)

// En el render:
{error && (
  <div style={{ /* estilos */ }}>
    <p>{error}</p>
    <button onClick={fetchNotifications}>Reintentar</button>
  </div>
)}
```

### Fix 5: Sanitización de errores en backend

**Archivo**: `apps/erp-api/src/modules/notifications.controller.ts`

Agregado método `sanitizeErrorMessage`:
```typescript
private sanitizeErrorMessage(error: Error): string {
  const message = error.message || 'Error desconocido';

  // Errores conocidos que podemos mostrar
  if (message.includes('No tiene permiso')) return message;
  if (message.includes('no encontrada')) return message;

  // Errores de DB - NO exponer detalles
  if (message.includes('duplicate key')) {
    this.logger.error('DB Error:', error);
    return 'La notificación ya existe';
  }

  // Error genérico
  this.logger.error('Unhandled error:', error);
  return 'Error al procesar la solicitud';
}
```

---

## 📊 RESUMEN FINAL DE CORRECCIONES

| # | Problema | Severidad | Estado | Archivo |
|---|----------|-----------|--------|---------|
| 1 | Strings vacíos no manejados | 🟡 MEDIO | ✅ CORREGIDO | NotificationItem.tsx |
| 2 | Llamadas API múltiples | 🟡 MEDIO | ✅ CORREGIDO | NotificationPanel.tsx |
| 3 | Usuario puede eliminar notif. de otros | 🔴 ALTO | ✅ CORREGIDO | notifications.service.ts |
| 4 | Errores silenciados en UI | 🟡 MEDIO | ✅ CORREGIDO | NotificationPanel.tsx |
| 5 | Mensajes exponen info interna | 🟡 MEDIO | ✅ CORREGIDO | notifications.controller.ts |

---

## 🔒 VERIFICACIÓN DE SEGURIDAD POST-FIX

### Endpoints Protegidos
| Endpoint | Auth | Permission | Tenant Isolation | User Validation |
|----------|------|------------|------------------|-----------------|
| GET /notifications | ✅ JWT | ✅ notifications.read | ✅ | N/A |
| GET /notifications/unread | ✅ JWT | ✅ notifications.read | ✅ | N/A |
| POST /notifications | ✅ JWT | ✅ notifications.create | ✅ | N/A |
| PUT /notifications/:id/read | ✅ JWT | ✅ notifications.update | ✅ | ✅ NUEVO |
| DELETE /notifications/:id | ✅ JWT | ✅ notifications.delete | ✅ | ✅ NUEVO |

### RLS Policies
- ✅ SELECT: Solo notificaciones del tenant actual
- ✅ INSERT: Solo puede insertar en su tenant
- ✅ UPDATE: Solo puede actualizar en su tenant
- ✅ DELETE: Solo puede eliminar en su tenant

---

## 📝 RECOMENDACIONES ADICIONALES (NO CRÍTICAS)

### 1. Implementar React Query para caché
```typescript
// Recomendación futura
import { useQuery } from '@tanstack/react-query'

const { data: notifications } = useQuery({
  queryKey: ['notifications'],
  queryFn: fetchNotifications,
  staleTime: 30000,
  refetchInterval: 30000,
})
```

### 2. Memoizar estilos inline
```typescript
// Recomendación futura
const styles = useMemo(() => ({
  container: { padding: '16px', /* ... */ },
  header: { /* ... */ },
}), [])
```

### 3. Agregar iconos por tipo de notificación
```typescript
// Recomendación futura
const typeIcons = {
  stock_bajo: Package,
  certificate_expiring: Shield,
  pedido_confirmado: CheckCircle,
  // ...
}
```

---

## ✅ CHECKLIST DE VERIFICACIÓN

- [x] Notificaciones muestran título correctamente
- [x] Notificaciones muestran mensaje correctamente
- [x] Strings vacíos muestran fallback
- [x] Iconos de severidad funcionan
- [x] Marcar como leída valida permisos
- [x] Eliminar notificación valida permisos
- [x] Marcar todas usa endpoint batch
- [x] Errores de red muestran UI de retry
- [x] Errores de backend no exponen info sensible
- [x] Índices de DB optimizados
- [x] RLS configurado correctamente

---

**Auditoría completada**: 2025-11-29
**Archivos modificados**: 4
**Problemas críticos resueltos**: 1 (seguridad)
**Problemas medios resueltos**: 4


---

## ⚠️ TESTS FALTANTES

**Estado**: No existen tests unitarios ni de integración para el módulo de notificaciones.

### Tests Recomendados:

1. **notifications.service.spec.ts**
   - `createNotification` - crear notificación válida
   - `getNotifications` - filtrar por tenant, tipo, severidad
   - `markAsRead` - validar permisos de usuario
   - `deleteNotification` - validar permisos de usuario
   - `markAllAsRead` - marcar todas del usuario

2. **notifications.controller.spec.ts**
   - Endpoints protegidos con JWT
   - Permisos requeridos por endpoint
   - Sanitización de errores

3. **NotificationPanel.test.tsx**
   - Renderizado de lista vacía
   - Renderizado de notificaciones
   - Marcar como leída
   - Eliminar notificación
   - Estado de error y retry

---

## 📁 ARCHIVOS MODIFICADOS EN ESTA AUDITORÍA

1. `apps/web/components/notifications/NotificationItem.tsx`
   - Fix: Manejo de strings vacíos con `.trim()`

2. `apps/web/components/notifications/NotificationPanel.tsx`
   - Fix: Usar endpoint batch `mark-all-read`
   - Fix: Estado de error y UI de retry

3. `apps/erp-api/src/modules/notifications/notifications.service.ts`
   - Fix: Validación de permisos en `markAsRead`
   - Fix: Validación de permisos en `deleteNotification`

4. `apps/erp-api/src/modules/notifications.controller.ts`
   - Fix: Método `sanitizeErrorMessage` para no exponer info sensible
   - Fix: Todos los catch usan sanitización

---

**FIN DE AUDITORÍA**


---

## 🔐 ARQUITECTURA DE SEGURIDAD MULTI-TENANT (ACTUALIZADA)

### Capas de Protección:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAPA 1: AUTENTICACIÓN                        │
│  JwtAuthGuard - Verifica token JWT válido                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CAPA 2: AUTORIZACIÓN                         │
│  PermissionGuard + @RequirePermission('notifications.read')     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 CAPA 3: AISLAMIENTO TENANT                      │
│  @CurrentTenant() + .eq('tenant_id', tenantId)                  │
│  Usuario de Tenant A NUNCA ve datos de Tenant B                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 CAPA 4: AISLAMIENTO USUARIO                     │
│  Validación de usuario_id en operaciones sensibles              │
│  Usuario A no puede modificar notificaciones de Usuario B       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CAPA 5: RLS (PostgreSQL)                     │
│  Políticas a nivel de base de datos como última defensa         │
└─────────────────────────────────────────────────────────────────┘
```

### Tipos de Notificaciones:

| Tipo | usuario_id | Quién puede ver | Quién puede modificar |
|------|------------|-----------------|----------------------|
| Personal | UUID del usuario | Solo ese usuario | Solo ese usuario o super admin |
| Global del Tenant | NULL | Todos los usuarios del tenant | Cualquier usuario del tenant |

### Lógica de Filtrado en `getNotifications`:

```typescript
// Usuario normal: ve sus notificaciones + globales
query.or(`usuario_id.eq.${userId},usuario_id.is.null`)

// Super admin: puede ver todas o filtrar por usuario específico
query.eq('usuario_id', filteredUserId) // o sin filtro para ver todas
```

### Lógica de Modificación en `markAsRead` y `deleteNotification`:

```typescript
// Si la notificación tiene usuario_id asignado
if (notification.usuario_id && notification.usuario_id !== user.id && !user.is_super_admin) {
  throw new Error('No tiene permiso');
}
// Si usuario_id es NULL (global), cualquier usuario del tenant puede modificarla
```

### Correcciones Adicionales Aplicadas:

1. **getNotifications**: Ya no permite que un usuario pase `usuario_id` arbitrario en query params para ver notificaciones de otros usuarios.

2. **Logging de seguridad**: Se agregaron logs con prefijo `[SECURITY]` para intentos de acceso no autorizado.

---

## ✅ MATRIZ DE PERMISOS FINAL

| Operación | Usuario Normal | Super Admin |
|-----------|---------------|-------------|
| Ver sus notificaciones | ✅ | ✅ |
| Ver notificaciones globales | ✅ | ✅ |
| Ver notificaciones de otros | ❌ | ✅ |
| Marcar como leída (propia) | ✅ | ✅ |
| Marcar como leída (global) | ✅ | ✅ |
| Marcar como leída (de otro) | ❌ | ✅ |
| Eliminar (propia) | ✅ | ✅ |
| Eliminar (global) | ✅ | ✅ |
| Eliminar (de otro) | ❌ | ✅ |
| Ver notificaciones de otro tenant | ❌ | ❌ |


---

## 🆕 NUEVA FUNCIONALIDAD: Notificaciones por Rol

### Problema Identificado:
Las notificaciones solo soportaban:
- Usuario específico (`usuario_id`)
- Global para todo el tenant (`usuario_id = NULL`)

**NO había forma de enviar notificaciones a roles específicos** (ej: "Stock Bajo" solo para Almaceneros).

### Solución Implementada:

#### 1. Nueva columna en tabla `notificaciones`:
```sql
ALTER TABLE notificaciones
ADD COLUMN roles_destinatarios UUID[] DEFAULT NULL;
```

#### 2. Lógica de filtrado actualizada:

| Tipo de Notificación | usuario_id | roles_destinatarios | Quién la ve |
|---------------------|------------|---------------------|-------------|
| Personal | UUID | NULL | Solo ese usuario |
| Por Rol | NULL | [rol1, rol2] | Usuarios con esos roles |
| Global | NULL | NULL | Todos los usuarios del tenant |

#### 3. Mapeo de tipos a roles por defecto:

```typescript
const DEFAULT_NOTIFICATION_ROLES = {
  // Stock → Almacenero, Gerente de Inventario
  STOCK_BAJO: ['Almacenero', 'Gerente de Inventario', 'Administrador'],

  // Órdenes de compra → Compras
  OC_REQUIERE_APROBACION: ['Gerente de Compras', 'Administrador'],

  // Ventas → Vendedor, Gerente de Ventas
  PEDIDO_CONFIRMADO: ['Vendedor', 'Almacenero', 'Gerente de Ventas'],
  PEDIDO_LISTO_DESPACHO: ['Almacenero', 'Logística'],
  PEDIDO_LISTO_FACTURAR: ['Facturación', 'Contador'],

  // Certificados → Solo Administrador
  CERTIFICATE_EXPIRING: ['Administrador'],
  CERTIFICATE_EXPIRED: ['Administrador'],
};
```

### Archivos Modificados:

1. **`supabase/migrations/151__notificaciones_por_rol.sql`** (NUEVO)
   - Columna `roles_destinatarios UUID[]`
   - Tabla `notificacion_tipo_roles` para configuración
   - Funciones `get_user_role_ids()` y `puede_ver_notificacion()`

2. **`apps/erp-api/src/modules/notifications/notification.types.ts`**
   - Agregado `roles_destinatarios?: string[]` a interfaces
   - Agregado `DEFAULT_NOTIFICATION_ROLES` mapping

3. **`apps/erp-api/src/modules/notifications/notifications.service.ts`**
   - `createNotification`: Soporta `roles_destinatarios`
   - `getNotifications`: Filtra por roles del usuario
   - `canUserModifyNotification`: Valida permisos por rol
   - `getUserRoleIds`: Obtiene roles de un usuario
   - `getRoleIdsByNames`: Convierte nombres de rol a IDs

### Ejemplo de Uso:

```typescript
// Crear notificación para roles específicos
await notificationsService.createNotification(tenantId, {
  type: NotificationType.STOCK_BAJO,
  severity: NotificationSeverity.WARNING,
  title: 'Stock Bajo: Producto X',
  message: 'El producto X tiene stock bajo',
  roles_destinatarios: ['uuid-rol-almacenero', 'uuid-rol-gerente-inventario'],
});

// El Almacenero verá esta notificación
// El Contador NO la verá
// El Vendedor NO la verá
```

### Matriz de Visibilidad Final:

| Notificación | Admin | Almacenero | Contador | Vendedor |
|--------------|-------|------------|----------|----------|
| Stock Bajo | ✅ | ✅ | ❌ | ❌ |
| OC Requiere Aprobación | ✅ | ❌ | ❌ | ❌ |
| Pedido Confirmado | ✅ | ✅ | ❌ | ✅ |
| Pedido Listo Facturar | ✅ | ❌ | ✅ | ❌ |
| Certificado Vencido | ✅ | ❌ | ❌ | ❌ |
| Global (sin roles) | ✅ | ✅ | ✅ | ✅ |
