# INFORME DE AUDITORÍA TÉCNICA - PARTE 2
## MÓDULOS: USUARIOS, PERMISSIONS, AUDIT

---

### 2.3 MÓDULO USUARIOS (Gestión de Usuarios)

#### 2.3.1 Descripción Real del Módulo

**Ubicación:** `apps/erp-api/src/modules/usuarios/`

**Archivos Clave:**
- `user-management.controller.ts` - 13 endpoints con protección JWT
- `user-management.service.ts` - 350+ líneas de lógica completa
- `usuarios.module.ts` - Configuración del módulo
- `dto/` - CreateUserDto, UpdateUserDto, UserFiltersDto, AssignRolesDto

**Responsabilidad:** Gestión completa de usuarios dentro de cada tenant (CRUD, roles, activación/desactivación, reset de contraseñas).

#### 2.3.2 Endpoints y Lógica de Backend

**Endpoints REALES Identificados (todos con `@UseGuards(JwtAuthGuard)`):**
- `GET /api/users` - Listar usuarios con paginación y filtros
- `GET /api/users/:id` - Obtener usuario por ID con roles
- `POST /api/users` - Crear nuevo usuario
- `PUT /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Eliminar usuario
- `POST /api/users/:id/activate` - Activar usuario
- `POST /api/users/:id/deactivate` - Desactivar usuario y revocar sesiones
- `POST /api/users/:id/reset-password` - Generar token de reset
- `GET /api/users/:id/roles` - Obtener roles del usuario
- `POST /api/users/:id/roles` - Asignar roles al usuario
- `DELETE /api/users/:id/roles/:roleId` - Remover rol del usuario
- `GET /api/users/:id/permissions` - Obtener permisos agregados del usuario
- `GET /api/users/:id/audit-logs` - Obtener historial de auditoría del usuario

**Validaciones REALES:**
- ✅ Email único dentro del tenant
- ✅ Contraseña temporal generada con `crypto.randomBytes` (12 caracteres)
- ✅ Hash de contraseña con bcrypt (10 rounds)
- ✅ Validación de pertenencia al tenant en TODAS las operaciones
- ✅ Validación de roles pertenecen al tenant antes de asignar
- ✅ Prevención de duplicados en asignación de roles
- ✅ Revocación de sesiones al desactivar usuario
- ✅ Token de reset con expiración de 24 horas
- ✅ Auditoría de eliminación de usuarios

**Integración:**
- ✅ Usa `@CurrentTenant()` decorator en todos los endpoints
- ✅ Inyecta `PermissionService` para consultar permisos
- ✅ Inyecta `AuditService` para logging de acciones
- ✅ Elimina datos sensibles (`password_hash`, `password_reset_token`) de responses

#### 2.3.3 Persistencia y Base de Datos

**Tablas Relacionadas:**
- `usuarios_sistema` - Usuarios (verificada en sección 2.1)
- `user_roles` - Asignación de roles a usuarios
- `roles` - Roles por tenant
- `user_sessions` - Sesiones activas (revocadas al desactivar)
- `audit_log` - Registro de eliminaciones

**Columnas Críticas:**
- `tenant_id` - ✅ Presente y filtrado en TODAS las queries
- `estado` - ACTIVO/INACTIVO
- `email` - Único por tenant
- `password_hash` - Hasheado con bcrypt

**RLS:**
- ✅ `usuarios_sistema` tiene RLS habilitado
- ✅ `user_roles` tiene RLS (verificado en código)
- ✅ Todas las queries filtran por `tenant_id`

#### 2.3.4 Frontend Asociado

**Componentes:**
- `apps/web/components/admin/UserForm.tsx` - Formulario de creación/edición
- `apps/web/components/admin/UserList.tsx` - Lista de usuarios
- `apps/web/components/admin/RoleAssignment.tsx` - Asignación de roles
- `apps/web/components/admin/PermissionViewer.tsx` - Visualización de permisos
- `apps/web/app/dashboard/usuarios/` - Páginas de gestión

**Flujo:**
1. Admin accede a `/dashboard/usuarios`
2. Lista usuarios del tenant actual
3. Crea/edita usuario con formulario
4. Asigna roles desde modal
5. Visualiza permisos agregados del usuario

#### 2.3.5 Flujo de Negocio End-to-End

```
Admin → Crear Usuario Form → POST /api/users
  ↓
UserManagementService.createUser()
  ├─ 1. Valida email único en tenant
  ├─ 2. Genera contraseña temporal (crypto.randomBytes)
  ├─ 3. Hashea contraseña con bcrypt
  ├─ 4. Inserta en usuarios_sistema con tenant_id
  ├─ 5. Si roles proporcionados: asigna en user_roles
  └─ 6. Retorna usuario + contraseña temporal
  ↓
Admin entrega credenciales al usuario
  ↓
Usuario hace primer login y cambia contraseña
```

**Estado:** ✅ **COMPLETO Y FUNCIONAL**

#### 2.3.6 Seguridad, Permisos y Multi-Tenant

**Fortalezas VERIFICADAS:**
- ✅ **Todos los endpoints protegidos con `JwtAuthGuard`**
- ✅ **`@CurrentTenant()` usado en TODOS los endpoints**
- ✅ **Validación de tenant en TODAS las operaciones de BD**
- ✅ Email único por tenant (no global)
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Contraseñas temporales seguras (crypto.randomBytes)
- ✅ Revocación de sesiones al desactivar
- ✅ Datos sensibles eliminados de responses
- ✅ Auditoría de eliminaciones
- ✅ Validación de roles pertenecen al tenant

**Riesgos Identificados:**
- ⚠️ **NO hay guards de permisos específicos** - Cualquier usuario autenticado puede gestionar usuarios
- ⚠️ **Falta `@RequirePermission('usuarios', 'create', 'usuarios')`** en endpoints críticos
- ⚠️ Contraseña temporal retornada en response (debería enviarse por email)
- ⚠️ Token de reset retornado en response (debería enviarse por email)

#### 2.3.7 Pruebas y Cobertura

**Tests Encontrados:**
- ❌ NO se encontraron tests de user management

**Casos Críticos Sin Tests:**
- Creación de usuario con email duplicado
- Asignación de roles
- Validación de tenant en operaciones
- Desactivación y revocación de sesiones
- Reset de contraseña

#### 2.3.8 Riesgos / Huecos / Deuda Técnica

**CRÍTICO:**
1. **Falta control de permisos granular** - Endpoints NO tienen `@RequirePermission()`. Cualquier usuario autenticado puede:
   - Crear usuarios
   - Eliminar usuarios
   - Asignar roles
   - Desactivar usuarios
   - Resetear contraseñas

**MEDIO:**
2. **Sin tests de integración** - Módulo crítico sin cobertura
3. **Credenciales en response** - Contraseñas temporales y tokens deberían enviarse por email
4. **Sin validación de email** - No se verifica que el email sea válido antes de crear usuario

**BAJO:**
5. Sin límite de usuarios por tenant
6. Sin validación de fortaleza de contraseña al crear usuario

#### 2.3.9 Endurecimiento Recomendado

1. **URGENTE:** Agregar guards de permisos en endpoints críticos:
   ```typescript
   @Post()
   @RequirePermission('usuarios', 'create', 'usuarios')
   async createUser() { ... }
   
   @Delete(':id')
   @RequirePermission('usuarios', 'delete', 'usuarios')
   async deleteUser() { ... }
   
   @Post(':id/roles')
   @RequirePermission('usuarios', 'assign_roles', 'usuarios')
   async assignRoles() { ... }
   ```

2. **URGENTE:** Implementar envío de emails:
   - Contraseña temporal por email al crear usuario
   - Token de reset por email (no en response)

3. **ALTA PRIORIDAD:** Agregar tests de integración completos

4. **RECOMENDADO:**
   - Validar formato de email con regex
   - Implementar validación de fortaleza de contraseña
   - Agregar límite de usuarios por tenant según plan
   - Implementar confirmación de email antes de activar usuario

---

### 2.4 MÓDULO PERMISSIONS (Control de Acceso RBAC)

#### 2.4.1 Descripción Real del Módulo

**Ubicación:** `apps/erp-api/src/modules/permissions/`

**Archivos Clave:**
- `permission.controller.ts` - 1 endpoint (GET /permissions)
- `permission.service.ts` - 350+ líneas con lógica RBAC completa
- `role.controller.ts` - Endpoints de gestión de roles
- `role.service.ts` - Lógica de roles
- `types.ts` - Interfaces Permission, RolePermission
- `guards/permissions.guard.ts` - Guard de validación de permisos

**Responsabilidad:** Sistema completo de control de acceso basado en roles (RBAC) con permisos granulares por módulo-acción-recurso.

#### 2.4.2 Endpoints y Lógica de Backend

**Endpoints REALES Identificados:**

**PermissionController:**
- `GET /api/permissions` - Obtener todos los permisos del tenant

**Métodos del Service (usados internamente):**
- `getPermissions(tenantId)` - Lista permisos del tenant
- `getRolePermissions(tenantId, roleId)` - Permisos de un rol
- `assignPermissionToRole(tenantId, roleId, permissionId)` - Asignar permiso a rol
- `revokePermissionFromRole(tenantId, roleId, permissionId)` - Revocar permiso de rol
- `checkUserPermission(userId, tenantId, modulo, accion, recurso)` - Validar permiso de usuario
- `getUserPermissions(userId, tenantId)` - Permisos agregados del usuario

**Validaciones REALES:**
- ✅ **Super-admin bypass** - Si `is_super_admin === true`, retorna `true` sin validar
- ✅ Cache de permisos (5 minutos TTL) para performance
- ✅ Validación de rol pertenece al tenant
- ✅ Validación de permiso pertenece al tenant
- ✅ Prevención de duplicados en asignación
- ✅ Deduplicación de permisos al agregar desde múltiples roles
- ✅ Filtrado por `activo === true`

**Estructura de Permisos:**
```typescript
{
  modulo: string;    // 'ventas', 'compras', 'inventario'
  accion: string;    // 'create', 'read', 'update', 'delete', 'export'
  recurso: string;   // 'facturas', 'productos', 'clientes'
  tenant_id: string;
  activo: boolean;
}
```

#### 2.4.3 Persistencia y Base de Datos

**Tablas Relacionadas:**
- `permisos` - Catálogo de permisos por tenant
- `roles` - Roles por tenant
- `rol_permisos` - Asignación de permisos a roles (con flag `concedido`)
- `user_roles` - Asignación de roles a usuarios

**Flujo de Validación:**
```
Usuario → user_roles → roles → rol_permisos → permisos
```

**RLS:**
- ✅ Todas las tablas tienen `tenant_id`
- ✅ Queries filtran por tenant en el código

#### 2.4.4 Frontend Asociado

**Componentes:**
- `apps/web/components/admin/PermissionViewer.tsx` - Visualización de permisos
- `apps/web/components/admin/RoleAssignment.tsx` - Asignación de roles
- `apps/web/components/auth/ProtectedComponent.tsx` - Wrapper que valida permisos
- `apps/web/hooks/use-permission.ts` - Hook para validar permisos en UI

**Uso en Frontend:**
```typescript
// Proteger componente completo
<ProtectedComponent permission="ventas.create.facturas">
  <CrearFacturaButton />
</ProtectedComponent>

// Hook para validar permisos
const { hasPermission } = usePermission();
if (hasPermission('ventas', 'delete', 'facturas')) {
  // Mostrar botón eliminar
}
```

#### 2.4.5 Flujo de Negocio End-to-End

```
Request → JwtAuthGuard → PermissionGuard
  ↓
PermissionGuard.canActivate()
  ├─ 1. Extrae metadata de @RequirePermission(modulo, accion, recurso)
  ├─ 2. Si no hay metadata → permite acceso
  ├─ 3. Extrae user del request
  ├─ 4. Si user.is_super_admin → permite acceso
  ├─ 5. Llama PermissionService.checkUserPermission()
  └─ 6. Si no tiene permiso → ForbiddenException
  ↓
PermissionService.checkUserPermission()
  ├─ 1. Verifica cache (5 min TTL)
  ├─ 2. Consulta user_roles del usuario
  ├─ 3. Consulta rol_permisos de esos roles
  ├─ 4. Filtra por modulo, accion, recurso, tenant_id, activo
  ├─ 5. Cachea resultado
  └─ 6. Retorna true/false
```

**Estado:** ✅ **COMPLETO Y FUNCIONAL**

#### 2.4.6 Seguridad, Permisos y Multi-Tenant

**Fortalezas VERIFICADAS:**
- ✅ **Sistema RBAC completo y funcional**
- ✅ **Super-admin bypass implementado**
- ✅ **Cache de permisos para performance**
- ✅ **Validación granular: módulo + acción + recurso**
- ✅ **Filtrado por tenant en todas las queries**
- ✅ **Deduplicación de permisos**
- ✅ **Guard `PermissionGuard` implementado y funcional**

**Riesgos Identificados:**
- ⚠️ **Guard NO está aplicado globalmente** - Cada controller debe agregarlo manualmente
- ⚠️ **Muchos endpoints NO tienen `@RequirePermission()`** - Como vimos en módulo USUARIOS
- ⚠️ Cache por usuario, no invalida al cambiar roles

#### 2.4.7 Pruebas y Cobertura

**Tests Encontrados:**
- ❌ NO se encontraron tests de permissions

**Casos Críticos Sin Tests:**
- Validación de permisos
- Super-admin bypass
- Cache de permisos
- Asignación/revocación de permisos
- Agregación de permisos desde múltiples roles

#### 2.4.8 Riesgos / Huecos / Deuda Técnica

**CRÍTICO:**
1. **Guard no aplicado globalmente** - Cada controller debe agregar manualmente `@UseGuards(PermissionGuard)` y `@RequirePermission()`. Esto es propenso a errores humanos.

**MEDIO:**
2. **Sin tests** - Sistema crítico de seguridad sin cobertura
3. **Cache no se invalida** - Si se cambian roles de un usuario, cache puede quedar desactualizado hasta 5 minutos
4. **Sin auditoría de cambios de permisos** - No se registra quién asignó/revocó permisos

**BAJO:**
5. Sin UI para gestión de permisos (solo roles)
6. Sin validación de permisos conflictivos

#### 2.4.9 Endurecimiento Recomendado

1. **URGENTE:** Aplicar `PermissionGuard` globalmente en `app.module.ts`:
   ```typescript
   providers: [
     {
       provide: APP_GUARD,
       useClass: PermissionGuard,
     }
   ]
   ```

2. **URGENTE:** Auditar TODOS los controllers y agregar `@RequirePermission()` donde falte

3. **ALTA PRIORIDAD:** Agregar tests completos del sistema RBAC

4. **RECOMENDADO:**
   - Invalidar cache al cambiar roles de usuario
   - Agregar auditoría de cambios de permisos
   - Implementar UI para gestión de permisos
   - Agregar validación de permisos conflictivos

---

### 2.5 MÓDULO AUDIT (Auditoría y Trazabilidad)

#### 2.5.1 Descripción Real del Módulo

**Ubicación:** `apps/erp-api/src/modules/audit/`

**Archivos Clave:**
- `audit.controller.ts` - 4 endpoints de consulta
- `audit.service.ts` - 450+ líneas con logging completo
- `audit.module.ts` - Configuración del módulo
- `dto/` - AuditLogDto, AuditFiltersDto
- `interceptors/audit.interceptor.ts` - Interceptor automático

**Responsabilidad:** Sistema completo de auditoría y trazabilidad de acciones, con logging de integraciones externas (SUNAT, GRE, etc.).

#### 2.5.2 Endpoints y Lógica de Backend

**Endpoints REALES Identificados (todos con `@UseGuards(JwtAuthGuard)`):**
- `GET /api/audit-logs` - Listar logs con filtros y paginación
- `GET /api/audit-logs/user/:userId` - Historial de un usuario
- `GET /api/audit-logs/resource/:tableName/:resourceId` - Historial de un recurso
- `GET /api/audit-logs/integrations` - Logs de integraciones externas

**Métodos del Service:**
- `logAction(auditLog)` - Registrar acción (non-blocking)
- `registrarCambio(entidad, accion, usuario, cambios, tenantId)` - Registrar cambio con detalle
- `getAuditLogs(tenantId, filters)` - Consultar logs con filtros
- `getUserAuditLogs(tenantId, userId)` - Historial de usuario
- `getResourceAuditLogs(tenantId, tableName, resourceId)` - Historial de recurso
- `logIntegracion(servicio, operacion, request, response, correlacion, tenantId)` - Log de integración
- `getIntegrationLogs(tenantId, filters)` - Consultar logs de integración

**Validaciones REALES:**
- ✅ **Logging non-blocking** - Errores en audit NO rompen operación principal
- ✅ **Filtrado automático por tenant_id**
- ✅ **Cálculo de campos cambiados** en UPDATE
- ✅ **Redacción de datos sensibles** (password, token, api_key, secret, certificado)
- ✅ **Truncado de payloads grandes** (máx 5000 caracteres)
- ✅ **Metadata adicional** (IP, user-agent, duration_ms)

**Estructura de Audit Log:**
```typescript
{
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id?: string;
  old_values?: object;
  new_values?: object;
  changed_fields?: string[];  // Solo campos que cambiaron
  user_id?: string;
  tenant_id: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
  metadata?: object;
}
```

**Estructura de Integration Log:**
```typescript
{
  tenant_id: string;
  servicio: string;  // 'SUNAT', 'GRE', 'OSE'
  operacion: string;  // 'enviar_factura', 'consultar_ruc'
  correlacion_id?: string;  // pedido_id, factura_id
  correlacion_tipo?: string;  // 'pedido', 'factura'
  request_summary: object;  // Redactado
  response_summary: object;  // Redactado
  status: 'SUCCESS' | 'ERROR' | 'PENDING' | 'TIMEOUT';
  status_code?: number;
  error_message?: string;
  duration_ms?: number;
  timestamp: Date;
}
```

#### 2.5.3 Persistencia y Base de Datos

**Tablas Relacionadas:**
- `audit_log` - Logs de acciones en el sistema
- `integration_logs` - Logs de integraciones externas

**Columnas Críticas:**
- `tenant_id` - ✅ Presente en ambas tablas
- `timestamp` - Ordenamiento cronológico
- `operation` - Tipo de operación
- `changed_fields` - Campos modificados (solo UPDATE)

**RLS:**
- ✅ Queries filtran por `tenant_id`
- ⚠️ **PENDIENTE VERIFICAR:** RLS en tablas de audit

#### 2.5.4 Frontend Asociado

**Componentes:**
- ⚠️ **NO SE ENCONTRARON** componentes específicos de auditoría en `apps/web/components/`
- Auditoría se consulta desde otros módulos (ej: `GET /users/:id/audit-logs`)

#### 2.5.5 Flujo de Negocio End-to-End

```
Operación de Negocio (ej: crear usuario)
  ↓
Service ejecuta operación
  ↓
Service llama AuditService.logAction() o registrarCambio()
  ↓
AuditService inserta en audit_log
  ├─ Si error: log error pero NO lanza excepción
  └─ Operación principal continúa sin interrupción
  ↓
Admin consulta logs: GET /audit-logs?table_name=usuarios_sistema
```

**Integración Externa:**
```
CPE Service envía factura a SUNAT
  ↓
Mide duración de llamada
  ↓
Llama AuditService.logIntegracion()
  ├─ Redacta datos sensibles (certificado, tokens)
  ├─ Trunca payloads grandes
  └─ Inserta en integration_logs
  ↓
Admin consulta: GET /audit-logs/integrations?servicio=SUNAT
```

**Estado:** ✅ **COMPLETO Y FUNCIONAL**

#### 2.5.6 Seguridad, Permisos y Multi-Tenant

**Fortalezas VERIFICADAS:**
- ✅ **Logging non-blocking** - No rompe operaciones
- ✅ **Redacción automática de datos sensibles**
- ✅ **Filtrado por tenant en todas las queries**
- ✅ **Truncado de payloads grandes**
- ✅ **Cálculo automático de campos cambiados**
- ✅ **Metadata rica** (IP, user-agent, duration)

**Riesgos Identificados:**
- ⚠️ **NO hay guards de permisos** - Cualquier usuario puede consultar audit logs
- ⚠️ **Sin UI dedicada** - No hay pantalla de auditoría en frontend
- ⚠️ **RLS no verificado** en tablas de audit

#### 2.5.7 Pruebas y Cobertura

**Tests Encontrados:**
- ❌ NO se encontraron tests de audit

**Casos Críticos Sin Tests:**
- Logging non-blocking
- Redacción de datos sensibles
- Truncado de payloads
- Cálculo de campos cambiados
- Filtrado por tenant

#### 2.5.8 Riesgos / Huecos / Deuda Técnica

**CRÍTICO:**
1. **Sin control de permisos** - Cualquier usuario puede ver audit logs de todo el tenant
2. **RLS no verificado** - Tablas de audit pueden no tener RLS

**MEDIO:**
3. **Sin tests** - Sistema crítico sin cobertura
4. **Sin UI dedicada** - No hay pantalla para explorar auditoría
5. **Sin retención de logs** - No hay política de limpieza/archivado

**BAJO:**
6. Sin alertas de acciones sospechosas
7. Sin exportación de logs para compliance

#### 2.5.9 Endurecimiento Recomendado

1. **URGENTE:** Agregar guards de permisos:
   ```typescript
   @Get()
   @RequirePermission('audit', 'read', 'logs')
   async getAuditLogs() { ... }
   ```

2. **URGENTE:** Verificar y habilitar RLS en `audit_log` e `integration_logs`

3. **ALTA PRIORIDAD:**
   - Agregar tests completos
   - Implementar UI de auditoría en frontend
   - Implementar política de retención de logs

4. **RECOMENDADO:**
   - Alertas de acciones sospechosas
   - Exportación de logs para compliance
   - Dashboard de auditoría con métricas

---

## RESUMEN EJECUTIVO PARTE 2

### Módulos Auditados:
- ✅ **USUARIOS:** Funcional pero sin control de permisos granular
- ✅ **PERMISSIONS:** Sistema RBAC completo pero no aplicado globalmente
- ✅ **AUDIT:** Sistema completo pero sin control de acceso

### Hallazgos Críticos:
1. **Módulo USUARIOS sin guards de permisos** - Cualquier usuario puede gestionar usuarios
2. **PermissionGuard no aplicado globalmente** - Propenso a errores humanos
3. **Módulo AUDIT sin control de acceso** - Cualquier usuario puede ver logs
4. **Sin tests en módulos críticos** - USUARIOS, PERMISSIONS, AUDIT sin cobertura

### Fortalezas Identificadas:
- Sistema RBAC completo y funcional
- Auditoría completa con redacción de datos sensibles
- Multi-tenant correctamente implementado
- Logging de integraciones externas

### Próximos Módulos (Parte 3):
- VENTAS
- INVENTARIO
- CPE
- GRE
- FINANZAS
