# Solución: Error 401 en Dashboard API

## Problema Identificado

Los endpoints `/api/dashboard/stats` y `/api/dashboard/activities` estaban retornando error 401 "Usuario no autenticado", a pesar de que el usuario estaba correctamente autenticado en otros endpoints.

### Logs del Error
```
[Nest] 4012  - 30/10/2025, 20:29:42    WARN [GlobalExceptionFilter] GET /api/dashboard/stats - 401 - Usuario no autenticado
[Nest] 4012  - 30/10/2025, 20:29:42    WARN [GlobalExceptionFilter] GET /api/dashboard/activities - 401 - Usuario no autenticado
```

## Análisis de la Causa Raíz

### 1. **Falta de Módulos Importados en DashboardModule**

El [`DashboardModule`](apps/erp-api/src/modules/dashboard/dashboard.module.ts) no importaba los módulos necesarios para que los guards funcionaran correctamente:

**Antes:**
```typescript
@Module({
  imports: [SupabaseModule, CacheModule],
  controllers: [DashboardController],
  providers: [DashboardMetricsService],
  exports: [DashboardMetricsService]
})
export class DashboardModule {}
```

**Problema:** 
- El [`DashboardController`](apps/erp-api/src/modules/dashboard.controller.ts:14) usa [`@UseGuards(JwtAuthGuard, PermissionGuard)`](apps/erp-api/src/modules/dashboard.controller.ts:12)
- Sin importar `AuthModule`, el [`JwtAuthGuard`](apps/erp-api/src/modules/auth/guards/jwt-auth.guard.ts:24) no puede inyectar sus dependencias
- Sin importar `PermissionsModule` explícitamente, el [`PermissionGuard`](apps/erp-api/src/common/guards/permission.guard.ts:11) no puede acceder al [`PermissionService`](apps/erp-api/src/modules/permissions/permission.service.ts:9)

### 2. **Permisos Faltantes en la Base de Datos**

Los endpoints requieren permisos específicos:
- [`@RequirePermission('dashboard.stats.read')`](apps/erp-api/src/modules/dashboard.controller.ts:168) para `/api/dashboard/stats`
- [`@RequirePermission('dashboard.activities.read')`](apps/erp-api/src/modules/dashboard.controller.ts:213) para `/api/dashboard/activities`

Estos permisos no existían en la tabla `permisos` ni estaban asignados al rol `SUPER_ADMIN`.

## Solución Implementada

### 1. **Actualización del DashboardModule**

**Archivo:** [`apps/erp-api/src/modules/dashboard/dashboard.module.ts`](apps/erp-api/src/modules/dashboard/dashboard.module.ts)

```typescript
import { Module } from '@nestjs/common';
import { DashboardController } from '../dashboard.controller';
import { SupabaseModule } from '../../shared/supabase/supabase.module';
import { CacheModule } from '../../shared/cache/cache.module';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [SupabaseModule, CacheModule, AuthModule, PermissionsModule],
  controllers: [DashboardController],
  providers: [DashboardMetricsService],
  exports: [DashboardMetricsService]
})
export class DashboardModule {}
```

**Cambios:**
- ✅ Importado `AuthModule` para que [`JwtAuthGuard`](apps/erp-api/src/modules/auth/guards/jwt-auth.guard.ts:24) funcione
- ✅ Importado `PermissionsModule` explícitamente para [`PermissionGuard`](apps/erp-api/src/common/guards/permission.guard.ts:11)

### 2. **Script SQL para Crear Permisos**

**Archivo:** [`supabase/fix-dashboard-permissions.sql`](supabase/fix-dashboard-permissions.sql)

El script realiza las siguientes acciones:

1. **Crea los permisos necesarios:**
   - `dashboard.read.stats` - Ver estadísticas del dashboard
   - `dashboard.read.activities` - Ver actividades recientes del dashboard

2. **Asigna los permisos al rol SUPER_ADMIN:**
   - Inserta registros en `rol_permisos` vinculando los permisos con el rol
   - Usa `ON CONFLICT` para evitar duplicados

3. **Verifica la asignación:**
   - Consulta final para confirmar que los permisos están correctamente asignados

## Pasos para Aplicar la Solución

### 1. Reiniciar el Backend

El cambio en [`DashboardModule`](apps/erp-api/src/modules/dashboard/dashboard.module.ts) requiere reiniciar el servidor NestJS:

```bash
# Detener el servidor actual (Ctrl+C)
# Luego reiniciar
npm run dev
```

### 2. Ejecutar el Script SQL

Conectarse a la base de datos Supabase y ejecutar:

```bash
psql -h <supabase-host> -U postgres -d postgres -f supabase/fix-dashboard-permissions.sql
```

O desde el SQL Editor de Supabase Dashboard, copiar y ejecutar el contenido de [`fix-dashboard-permissions.sql`](supabase/fix-dashboard-permissions.sql).

## Verificación

### 1. Verificar que los Guards se Ejecutan

Después de reiniciar, los logs deberían mostrar:

```
[Nest] DEBUG [JwtAuthGuard] [JWT] canActivate START - Path: /api/dashboard/stats
[Nest] DEBUG [JwtAuthGuard] [JWT] super.canActivate result: true
[Nest] DEBUG [JwtAuthGuard] [JWT] ✓ superadmin@neon.com - Tenant: 550e8400-...
```

### 2. Verificar Permisos en la Base de Datos

```sql
SELECT 
  r.nombre AS rol,
  p.modulo,
  p.accion,
  p.recurso,
  p.descripcion,
  rp.concedido
FROM rol_permisos rp
INNER JOIN roles r ON r.id = rp.role_id
INNER JOIN permisos p ON p.id = rp.permiso_id
WHERE r.nombre = 'SUPER_ADMIN'
  AND p.modulo = 'dashboard'
ORDER BY p.recurso;
```

**Resultado esperado:**
```
rol          | modulo    | accion | recurso    | descripcion                          | concedido
-------------|-----------|--------|------------|--------------------------------------|----------
SUPER_ADMIN  | dashboard | read   | activities | Ver actividades recientes del dashboard | true
SUPER_ADMIN  | dashboard | read   | stats      | Ver estadísticas del dashboard       | true
```

### 3. Probar los Endpoints

```bash
# Obtener token de autenticación
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@neon.com","password":"tu-password"}'

# Probar endpoint de estadísticas
curl -X GET http://localhost:3000/api/dashboard/stats \
  -H "Authorization: Bearer <token>"

# Probar endpoint de actividades
curl -X GET http://localhost:3000/api/dashboard/activities \
  -H "Authorization: Bearer <token>"
```

**Respuesta esperada:** Status 200 con datos del dashboard

## Lecciones Aprendidas

1. **Importación de Módulos:** Cuando un controlador usa guards que dependen de servicios de otros módulos, esos módulos deben ser importados explícitamente, incluso si están marcados como `@Global()`.

2. **Permisos Granulares:** El sistema de permisos requiere que cada endpoint protegido tenga sus permisos correspondientes en la base de datos y asignados a los roles apropiados.

3. **Orden de Guards:** El orden en [`@UseGuards(JwtAuthGuard, PermissionGuard)`](apps/erp-api/src/modules/dashboard.controller.ts:12) es importante:
   - Primero [`JwtAuthGuard`](apps/erp-api/src/modules/auth/guards/jwt-auth.guard.ts:24) valida el token y establece `request.user`
   - Luego [`PermissionGuard`](apps/erp-api/src/common/guards/permission.guard.ts:11) verifica los permisos usando `request.user`

## Archivos Modificados

1. ✅ [`apps/erp-api/src/modules/dashboard/dashboard.module.ts`](apps/erp-api/src/modules/dashboard/dashboard.module.ts) - Agregados imports de AuthModule y PermissionsModule
2. ✅ [`supabase/fix-dashboard-permissions.sql`](supabase/fix-dashboard-permissions.sql) - Script para crear y asignar permisos

## Estado Final

- ✅ [`DashboardModule`](apps/erp-api/src/modules/dashboard/dashboard.module.ts) correctamente configurado con todas las dependencias
- ✅ Permisos `dashboard.stats.read` y `dashboard.activities.read` creados
- ✅ Permisos asignados al rol `SUPER_ADMIN`
- ✅ Endpoints `/api/dashboard/stats` y `/api/dashboard/activities` funcionando correctamente