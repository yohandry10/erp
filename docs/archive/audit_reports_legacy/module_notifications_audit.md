# Auditoría Exhaustiva: Módulo de Notificaciones

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
**Módulo**: Notificaciones (Frontend + Backend)

---

## 🔴 PROBLEMA CRÍTICO IDENTIFICADO

### Desincronización de Campos Backend ↔ Frontend

**Descripción**: El backend retorna campos en inglés (`title`, `message`) pero el frontend espera campos en español (`titulo`, `mensaje`).

**Evidencia**:

**Backend (notifications.service.ts - mapToNotification)**:
```typescript
return {
  title: data.titulo,      // ← Mapea DB.titulo → API.title
  message: data.mensaje,   // ← Mapea DB.mensaje → API.message
  // ...
}
```

**Frontend (NotificationItem.tsx)**:
```typescript
interface Notification {
  titulo: string;   // ← Espera 'titulo'
  mensaje: string;  // ← Espera 'mensaje'
}
// Renderiza:
{notification.titulo || 'Sin título'}
{notification.mensaje || 'Sin mensaje'}
```

**Resultado**: Siempre muestra "Sin título" y "Sin mensaje" porque `notification.titulo` es `undefined`.

---

## Cuestionario Técnico Exhaustivo

### 1. LÓGICA DE NEGOCIO

#### P1: ¿Los campos de la API coinciden con lo que espera el frontend?
**Estado**: ❌ FALLA CRÍTICA

**Análisis**:
- Backend retorna: `{ title, message, type, severity }`
- Frontend espera: `{ titulo, mensaje, tipo, severidad }`

**Solución**: Unificar nomenclatura. Opción A: Cambiar frontend. Opción B: Cambiar backend.
**Recomendación**: Cambiar frontend para usar inglés (estándar en APIs REST).

#### P2: ¿Se manejan todos los tipos de notificación?
**Estado**: ⚠️ PARCIAL

**Análisis**: El backend define 20+ tipos de notificación pero el frontend solo maneja 3 severidades visuales.

**Tipos definidos**:
- CERTIFICATE_EXPIRING, CERTIFICATE_EXPIRED
- COTIZACION_CONVERTIDA, PEDIDO_CONFIRMADO
- STOCK_BAJO, FACTURA_EMITIDA
- OC_REQUIERE_APROBACION, etc.

**Mejora sugerida**: Agregar iconos específicos por tipo, no solo por severidad.

---

### 2. SEGURIDAD BACKEND

#### P3: ¿Están protegidos los endpoints contra acceso no autorizado?
**Estado**: ✅ CORRECTO

**Evidencia**:
```typescript
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('notifications.read')
```

Todos los endpoints tienen:
- JwtAuthGuard (autenticación)
- PermissionGuard (autorización)
- @RequirePermission (permisos específicos)

#### P4: ¿Se valida el tenant en cada operación?
**Estado**: ✅ CORRECTO

**Evidencia**:
```typescript
@CurrentTenant() tenantId: string
// Usado en todas las queries:
.eq('tenant_id', tenantId)
```

#### P5: ¿Hay protección contra inyección SQL?
**Estado**: ✅ CORRECTO

Usa Supabase client con queries parametrizadas, no SQL raw.

---

### 3. RENDIMIENTO FRONTEND

#### P6: ¿Hay re-renders innecesarios?
**Estado**: ⚠️ MEJORABLE

**Problema**: El componente NotificationBell hace polling cada 30 segundos sin memoización.

```typescript
useEffect(() => {
  fetchUnreadCount()
  const interval = setInterval(fetchUnreadCount, 30000)
  return () => clearInterval(interval)
}, [])
```

**Mejora**: Usar React Query o SWR para cache automático.

#### P7: ¿Se optimizan las llamadas a la API?
**Estado**: ⚠️ MEJORABLE

**Problema**: Se hacen 2 llamadas separadas:
1. `/api/notifications/unread` (para el badge)
2. `/api/notifications` (al abrir panel)

**Mejora**: Unificar en una sola llamada que retorne count + lista.

---

### 4. INTEGRIDAD DE DATOS

#### P8: ¿Existe la tabla `notificaciones` con los campos correctos?
**Estado**: ⚠️ VERIFICAR

**Campos esperados en DB**:
- id, tenant_id, usuario_id
- tipo, severidad
- titulo, mensaje
- action_url, action_label
- leida, leida_at
- created_at

**Acción**: Verificar migración de la tabla.

#### P9: ¿Hay índices para consultas frecuentes?
**Estado**: ⚠️ VERIFICAR

**Consultas frecuentes**:
- `WHERE tenant_id = X AND leida = false`
- `WHERE tenant_id = X ORDER BY created_at DESC`

**Índices recomendados**:
```sql
CREATE INDEX idx_notif_tenant_leida ON notificaciones(tenant_id, leida);
CREATE INDEX idx_notif_tenant_created ON notificaciones(tenant_id, created_at DESC);
```

---

### 5. MANEJO DE ERRORES

#### P10: ¿Se manejan errores de red en el frontend?
**Estado**: ✅ CORRECTO

```typescript
try {
  const response = await get('/api/notifications')
  // ...
} catch (error) {
  console.error('Error fetching notifications:', error)
  setNotifications([])
}
```

---

## Resumen de Problemas Encontrados

| # | Severidad | Problema | Estado |
|---|-----------|----------|--------|
| 1 | 🔴 CRÍTICO | Campos API no coinciden con frontend | PENDIENTE |
| 2 | 🟡 MEDIO | Falta memoización en polling | PENDIENTE |
| 3 | 🟡 MEDIO | Llamadas API duplicadas | PENDIENTE |
| 4 | 🟢 BAJO | Iconos genéricos por severidad | OPCIONAL |

---

## Solución Implementada

### Fix #1: Actualizar Frontend para usar campos en inglés

**Archivo**: `apps/web/components/notifications/NotificationItem.tsx`

**Cambios**:
```typescript
// ANTES (incorrecto):
interface Notification {
  titulo: string;
  mensaje: string;
  tipo: string;
  severidad: 'info' | 'warning' | 'error';
}

// DESPUÉS (correcto):
interface Notification {
  title: string;
  message: string;
  type: string;
  severity: 'info' | 'warning' | 'error';
}
```

---

## Verificación Post-Fix

- [ ] Notificaciones muestran título correctamente
- [ ] Notificaciones muestran mensaje correctamente
- [ ] Iconos de severidad funcionan
- [ ] Marcar como leída funciona
- [ ] Eliminar notificación funciona
- [ ] Badge de conteo se actualiza

---

## Archivos Modificados

1. **`apps/web/components/notifications/NotificationItem.tsx`**
   - Cambiado interface para usar `title` y `message` (inglés) en lugar de `titulo` y `mensaje`
   - Agregado manejo de campos vacíos/undefined
   - Mejorado formateo de fechas con try-catch

2. **`supabase/migrations/150__fix_notificaciones_table.sql`**
   - Asegura que la tabla tenga todos los campos necesarios
   - Agrega índices para consultas frecuentes
   - Configura RLS correctamente

---

## Causa Raíz del Problema

El backend en `notifications.service.ts` hace un mapeo de campos:
```typescript
private mapToNotification(data: any): Notification {
  return {
    title: data.titulo,    // DB español → API inglés
    message: data.mensaje, // DB español → API inglés
    // ...
  }
}
```

Pero el frontend esperaba los campos en español (`titulo`, `mensaje`), causando que siempre mostrara "Sin título" y "Sin mensaje".

**Solución aplicada**: Actualizar el frontend para usar los campos en inglés que retorna la API.
