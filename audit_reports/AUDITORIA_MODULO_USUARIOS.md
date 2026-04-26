# AUDITORÍA EXHAUSTIVA: MÓDULO DE USUARIOS

## ESTADO ACTUAL: 🔄 EN REFACTORIZACIÓN

### Correcciones Aplicadas:
- ✅ Modal ahora pide contraseña al crear usuario
- ✅ Validación de contraseña (8+ chars, mayúscula, minúscula, número)
- ✅ Backend crea usuario en auth.users de Supabase
- ✅ Sincronización de ID entre auth.users y usuarios_sistema
- ✅ Modal usa useApi en lugar de fetch directo
- ✅ Rollback automático si falla algún paso de creación

### Correcciones Adicionales:
- ✅ Filtrado de menú lateral por rol (permisos actualizados en Sidebar)
- ✅ Refactorización de page.tsx en componentes:
  - `UsersStats.tsx` - Tarjetas de estadísticas
  - `UsersFilters.tsx` - Filtros de rol y estado
  - `UsersTable.tsx` - Tabla de usuarios
  - `UserRow.tsx` - Fila individual de usuario
  - `RolesSection.tsx` - Sección de roles y permisos
- ✅ page.tsx reducido de 550+ líneas a ~170 líneas

### Pendiente (mejoras futuras):
- ⏳ Envío de email de bienvenida al crear usuario
- ⏳ Cambio de contraseña para usuarios existentes
- ⏳ Recuperación de contraseña

---

## 1. PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1.1 ❌ NO HAY GESTIÓN DE CONTRASEÑAS
**Severidad: CRÍTICA**

El modal de creación de usuarios NO pide contraseña. El backend NO crea credenciales de autenticación.

**Problema:**
- El usuario se crea en `usuarios_sistema` pero NO en `auth.users` de Supabase
- El usuario creado NO puede hacer login
- No hay flujo de "invitación por email" ni "establecer contraseña"

**Solución requerida:**
1. Opción A: Generar contraseña temporal y enviar por email
2. Opción B: Enviar link de invitación para que el usuario establezca su contraseña
3. Opción C: Admin establece contraseña inicial (menos seguro)

### 1.2 ❌ NO HAY SINCRONIZACIÓN CON auth.users
**Severidad: CRÍTICA**

Los usuarios se crean en `usuarios_sistema` pero NO en la tabla `auth.users` de Supabase Auth.

**Consecuencia:** Los usuarios creados NO pueden autenticarse en el sistema.

### 1.3 ❌ ROLES NO SE CARGAN EN EL DROPDOWN
**Severidad: ALTA**

El endpoint `/usuarios-sistema/roles` no devuelve los roles correctamente o hay un problema de permisos.

**Causa identificada:** 
- El permiso `@RequirePermission('configuracion', 'ver', 'roles')` puede estar bloqueando
- Los roles existen en BD pero no se muestran en el frontend

### 1.4 ❌ NO HAY CONTROL DE ACCESO POR ROL EN EL MENÚ
**Severidad: ALTA**

Cada rol debería ver solo los módulos que le corresponden:
- VENDEDOR: Solo Ventas, Clientes, Cotizaciones
- CAJERO: Solo POS, Caja
- ALMACENERO: Solo Inventario, Recepciones
- CONTADOR: Solo Contabilidad, Finanzas, Reportes
- ADMIN: Todo

**Estado actual:** Todos ven el mismo menú.

---

## 2. PROBLEMAS DE LÓGICA DE NEGOCIO

### 2.1 ❌ Falta validación de email único global
El email debería ser único en todo el sistema, no solo por tenant.

### 2.2 ❌ Falta auditoría de cambios
No se registra quién creó/modificó/eliminó usuarios.

### 2.3 ❌ Falta historial de sesiones
No se registra el historial de logins del usuario.

### 2.4 ❌ Falta bloqueo por intentos fallidos
No hay protección contra ataques de fuerza bruta.

### 2.5 ❌ Falta política de contraseñas
No hay validación de complejidad de contraseñas.

---

## 3. PROBLEMAS DE CÓDIGO

### 3.1 Frontend (page.tsx - 550+ líneas)
- ❌ Archivo muy largo, debería dividirse en componentes
- ❌ Estilos inline en lugar de CSS/Tailwind
- ❌ Lógica de negocio mezclada con presentación
- ❌ No hay manejo de errores robusto
- ❌ No hay loading states granulares

### 3.2 Modal (UsuarioModal.tsx)
- ❌ No pide contraseña
- ❌ No valida formato de teléfono
- ❌ No muestra descripción del rol seleccionado
- ❌ Usa `fetch` directo en lugar de `useApi`
- ❌ `API_BASE_URL` no está definido (error de runtime)

### 3.3 Backend (usuarios.controller.ts)
- ❌ No crea usuario en auth.users
- ❌ No envía email de bienvenida
- ❌ No genera contraseña temporal
- ❌ No valida permisos del rol asignado
- ❌ Logs excesivos en producción

---

## 4. MATRIZ DE PERMISOS POR ROL (ESPERADA)

| Módulo | ADMIN | SUPERVISOR | VENDEDOR | CAJERO | ALMACENERO | CONTADOR |
|--------|-------|------------|----------|--------|------------|----------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| POS | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Ventas | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Clientes | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Cotizaciones | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Inventario | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Compras | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Contabilidad | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Finanzas | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Reportes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Configuración | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Usuarios | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 5. PLAN DE REFACTORIZACIÓN

### Fase 1: Correcciones Críticas (URGENTE)
1. Implementar creación de usuario en auth.users
2. Agregar campo de contraseña al modal
3. Implementar envío de email de bienvenida
4. Corregir carga de roles en dropdown

### Fase 2: Control de Acceso
1. Implementar filtrado de menú por rol
2. Implementar guards de ruta por permisos
3. Validar permisos en cada endpoint

### Fase 3: Refactorización de Código
1. Dividir page.tsx en componentes:
   - `UsersTable.tsx`
   - `UsersStats.tsx`
   - `RolesSection.tsx`
   - `UsersFilters.tsx`
2. Crear hooks personalizados:
   - `useUsers.ts`
   - `useRoles.ts`
3. Mover estilos a CSS modules o Tailwind

### Fase 4: Mejoras de Seguridad
1. Implementar política de contraseñas
2. Agregar bloqueo por intentos fallidos
3. Implementar 2FA opcional
4. Agregar auditoría completa

---

## 6. ARCHIVOS A MODIFICAR/CREAR

### Nuevos archivos:
```
apps/web/components/usuarios/
├── UsersTable.tsx
├── UsersStats.tsx
├── RolesSection.tsx
├── UsersFilters.tsx
├── UserRow.tsx
└── RoleCard.tsx

apps/web/hooks/
├── useUsers.ts
└── useRoles.ts

apps/erp-api/src/modules/usuarios/
├── usuarios.service.ts (lógica de negocio)
├── auth-sync.service.ts (sincronización con auth.users)
└── email.service.ts (envío de emails)
```

### Archivos a modificar:
- `apps/web/app/dashboard/usuarios/page.tsx` (simplificar)
- `apps/web/components/modals/UsuarioModal.tsx` (agregar contraseña)
- `apps/erp-api/src/modules/usuarios.controller.ts` (agregar auth sync)
- `apps/web/components/layout/Sidebar.tsx` (filtrar por permisos)

---

## 7. CONCLUSIÓN

El módulo de usuarios está **INCOMPLETO** y **NO FUNCIONAL** para producción.

**Problemas bloqueantes:**
1. Los usuarios creados NO pueden hacer login
2. No hay gestión de contraseñas
3. Los roles no se cargan en el dropdown
4. No hay control de acceso por rol

**Estimación de trabajo:** 3-5 días para tener un módulo funcional y seguro.
