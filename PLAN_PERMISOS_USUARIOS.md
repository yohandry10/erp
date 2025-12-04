# 📋 PLAN COMPLETO: Sistema de Roles y Permisos por Tenant

## 🎯 Objetivo

Implementar un sistema completo que permita que cuando el SuperAdmin crea un tenant:
1. Se creen automáticamente los **roles por defecto** (ADMIN, VENDEDOR, CAJERO, etc.)
2. Se creen automáticamente todos los **permisos** necesarios para cada módulo
3. Se asignen los **permisos correctos a cada rol**
4. El usuario administrador del tenant reciba el **rol ADMIN**
5. El administrador pueda **crear más usuarios y asignarles roles/permisos**

---

## 📊 Diagnóstico del Estado Actual

### ✅ Lo que YA existe:
| Componente | Estado | Ubicación |
|------------|--------|-----------|
| API de gestión de usuarios | ✅ Completo | `user-management.service.ts` |
| API de gestión de roles | ✅ Completo | `role.service.ts` |
| API de permisos | ✅ Completo | `permission.service.ts` |
| Tablas `roles`, `permisos`, `rol_permisos`, `user_roles` | ✅ Existen | Base de datos |
| RLS en tablas de permisos | ✅ Configurado | Migración 087 |
| Definiciones de permisos | ✅ Parcial | `ventas-permissions.ts`, `finanzas-permissions.ts` |

### ❌ Lo que FALTA:
| Componente | Estado | Impacto |
|------------|--------|---------|
| Seed de roles por defecto | ❌ No existe | Admin no puede asignar roles |
| Seed de permisos por defecto | ❌ No existe | No hay permisos que asignar |
| Asignación rol ADMIN al usuario inicial | ❌ No existe | Usuario admin sin permisos |
| Trigger automático al crear tenant | ❌ No existe | Proceso manual requerido |

---

## 🏗️ Arquitectura de la Solución

### Estructura de Tablas (Ya existentes)

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  usuarios_sistema│     │     roles       │     │    permisos     │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ tenant_id (FK)  │     │ tenant_id (FK)  │     │ tenant_id (FK)  │
│ nombre          │     │ nombre          │     │ modulo          │
│ email           │     │ descripcion     │     │ accion          │
│ ...             │     │ is_system_role  │     │ recurso         │
└────────┬────────┘     └────────┬────────┘     │ descripcion     │
         │                       │              │ activo          │
         │                       │              └────────┬────────┘
         │                       │                       │
         │    ┌──────────────────┴───────────────────────┘
         │    │
         ▼    ▼
┌─────────────────┐     ┌─────────────────┐
│   user_roles    │     │  rol_permisos   │
├─────────────────┤     ├─────────────────┤
│ usuario_sistema_id│   │ role_id (FK)    │
│ role_id (FK)    │     │ permiso_id (FK) │
│ created_at      │     │ concedido       │
└─────────────────┘     └─────────────────┘
```

### Flujo de Creación de Tenant

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUJO ACTUAL (INCOMPLETO)                        │
├─────────────────────────────────────────────────────────────────────┤
│  1. SuperAdmin llama create_demo_tenant()                           │
│  2. Se crea usuarios_sistema (usuario admin)                        │
│  3. Se crea empresa_config                                          │
│  4. Se ejecuta seed_demo_tenant() → almacenes, productos, etc.      │
│  5. ❌ NO SE CREAN ROLES                                            │
│  6. ❌ NO SE CREAN PERMISOS                                         │
│  7. ❌ NO SE ASIGNA ROL AL USUARIO                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    FLUJO NUEVO (COMPLETO)                           │
├─────────────────────────────────────────────────────────────────────┤
│  1. SuperAdmin llama create_demo_tenant()                           │
│  2. Se crea usuarios_sistema (usuario admin)                        │
│  3. Se crea empresa_config                                          │
│  4. ✅ TRIGGER: seed_roles_permisos_tenant()                        │
│     4.1 Crear roles: ADMIN, VENDEDOR, CAJERO, ALMACENERO, CONTADOR  │
│     4.2 Crear todos los permisos por módulo                         │
│     4.3 Asignar permisos a cada rol según matriz                    │
│  5. ✅ Asignar rol ADMIN al usuario creado                          │
│  6. Se ejecuta seed_demo_tenant() → almacenes, productos, etc.      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📝 Definición de Roles por Defecto

### Roles del Sistema

| Rol | Descripción | is_system_role |
|-----|-------------|----------------|
| ADMIN | Administrador del tenant - acceso total | true |
| VENDEDOR | Personal de ventas - cotizaciones, pedidos, clientes | false |
| CAJERO | Operador de caja POS | false |
| ALMACENERO | Personal de almacén - inventario, logística | false |
| CONTADOR | Personal contable - finanzas, reportes | false |
| SUPERVISOR | Supervisor con permisos de aprobación | false |

---

## 📝 Catálogo Completo de Permisos

### Módulo: VENTAS
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| clientes | ver, crear, editar, eliminar, validar_ruc | Gestión de clientes |
| cotizaciones | ver, crear, editar, eliminar, convertir_pedido | Gestión de cotizaciones |
| pedidos | ver, crear, editar, confirmar, cancelar, generar_factura | Gestión de pedidos |
| aprobaciones | ver, resolver | Aprobación de pedidos |
| rma | ver, crear, aprobar, recepcionar, generar_nota_credito | Devoluciones |
| facturas | ver, crear, anular | Facturación |
| notas_credito | ver, crear | Notas de crédito |
| notas_debito | ver, crear | Notas de débito |

### Módulo: INVENTARIO
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| productos | ver, crear, editar, eliminar | Gestión de productos |
| almacenes | ver, crear, editar | Gestión de almacenes |
| stock | ver, ajustar | Control de stock |
| movimientos | ver, crear | Movimientos de inventario |
| kardex | ver | Kardex valorizado |
| logistica | ver, preparar, despachar | Logística de pedidos |
| transferencias | ver, crear, aprobar | Transferencias entre almacenes |
| ingresos | ver, crear | Notas de ingreso |
| salidas | ver, crear | Notas de salida |

### Módulo: FINANZAS
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| cxc | ver, crear, editar | Cuentas por cobrar |
| cxp | ver, crear, editar | Cuentas por pagar |
| cobros | ver, crear, anular | Registro de cobros |
| pagos | ver, crear, anular | Registro de pagos |
| bancos | ver, crear, conciliar | Cuentas bancarias |
| tesoreria | ver, crear | Movimientos de tesorería |

### Módulo: CONTABILIDAD
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| asientos | ver, crear, editar, aprobar | Asientos contables |
| plan_cuentas | ver, crear, editar | Plan de cuentas |
| reportes | ver, exportar | Reportes contables |
| cierre | ejecutar | Cierre de período |

### Módulo: COMPRAS
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| proveedores | ver, crear, editar, eliminar | Gestión de proveedores |
| ordenes_compra | ver, crear, editar, aprobar, cancelar | Órdenes de compra |
| recepciones | ver, crear | Recepción de mercadería |

### Módulo: POS
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| ventas | ver, crear, anular | Ventas POS |
| cajas | ver, abrir, cerrar, arqueo | Gestión de cajas |
| turnos | ver, iniciar, cerrar | Turnos de caja |
| devoluciones | ver, crear | Devoluciones POS |

### Módulo: RRHH
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| empleados | ver, crear, editar, eliminar | Gestión de empleados |
| planillas | ver, crear, aprobar | Planillas de pago |
| asistencia | ver, registrar | Control de asistencia |

### Módulo: CONFIGURACION
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| empresa | ver, editar | Configuración de empresa |
| usuarios | ver, crear, editar, eliminar | Gestión de usuarios |
| roles | ver, crear, editar, eliminar | Gestión de roles |
| permisos | ver, asignar | Asignación de permisos |
| fiscal | ver, editar | Configuración fiscal |
| integraciones | ver, configurar | Integraciones externas |

### Módulo: REPORTES
| Recurso | Acciones | Descripción |
|---------|----------|-------------|
| ventas | ver, exportar | Reportes de ventas |
| inventario | ver, exportar | Reportes de inventario |
| finanzas | ver, exportar | Reportes financieros |
| dashboard | ver | Dashboard general |

---

## 📊 Matriz de Permisos por Rol

### Leyenda
- ✅ = Permiso completo (todas las acciones)
- 📖 = Solo lectura (ver)
- ⚡ = Acciones específicas
- ❌ = Sin acceso

| Módulo.Recurso | ADMIN | VENDEDOR | CAJERO | ALMACENERO | CONTADOR | SUPERVISOR |
|----------------|-------|----------|--------|------------|----------|------------|
| **VENTAS** |
| ventas.clientes | ✅ | ✅ | 📖 | ❌ | 📖 | ✅ |
| ventas.cotizaciones | ✅ | ✅ | ❌ | ❌ | 📖 | ✅ |
| ventas.pedidos | ✅ | ⚡ver,crear,editar | ❌ | 📖 | 📖 | ✅ |
| ventas.aprobaciones | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| ventas.facturas | ✅ | ⚡ver,crear | ❌ | ❌ | ✅ | ✅ |
| ventas.rma | ✅ | ⚡ver,crear | ❌ | ⚡recepcionar | 📖 | ✅ |
| **INVENTARIO** |
| inventario.productos | ✅ | 📖 | 📖 | ✅ | 📖 | ✅ |
| inventario.almacenes | ✅ | 📖 | ❌ | ✅ | 📖 | ✅ |
| inventario.stock | ✅ | 📖 | 📖 | ✅ | 📖 | ✅ |
| inventario.logistica | ✅ | 📖 | ❌ | ✅ | ❌ | ✅ |
| inventario.kardex | ✅ | ❌ | ❌ | 📖 | ✅ | ✅ |
| **FINANZAS** |
| finanzas.cxc | ✅ | 📖 | ❌ | ❌ | ✅ | ✅ |
| finanzas.cxp | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| finanzas.cobros | ✅ | ⚡ver,crear | ⚡ver,crear | ❌ | ✅ | ✅ |
| finanzas.bancos | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **CONTABILIDAD** |
| contabilidad.asientos | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| contabilidad.plan_cuentas | ✅ | ❌ | ❌ | ❌ | ✅ | 📖 |
| contabilidad.reportes | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **COMPRAS** |
| compras.proveedores | ✅ | ❌ | ❌ | 📖 | 📖 | ✅ |
| compras.ordenes_compra | ✅ | ❌ | ❌ | ⚡ver,crear | 📖 | ✅ |
| compras.recepciones | ✅ | ❌ | ❌ | ✅ | 📖 | ✅ |
| **POS** |
| pos.ventas | ✅ | ✅ | ✅ | ❌ | 📖 | ✅ |
| pos.cajas | ✅ | ❌ | ⚡abrir,cerrar,arqueo | ❌ | 📖 | ✅ |
| pos.turnos | ✅ | ❌ | ⚡iniciar,cerrar | ❌ | 📖 | ✅ |
| **CONFIGURACION** |
| configuracion.empresa | ✅ | ❌ | ❌ | ❌ | ❌ | 📖 |
| configuracion.usuarios | ✅ | ❌ | ❌ | ❌ | ❌ | 📖 |
| configuracion.roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **REPORTES** |
| reportes.dashboard | ✅ | 📖 | 📖 | 📖 | ✅ | ✅ |
| reportes.ventas | ✅ | ✅ | 📖 | ❌ | ✅ | ✅ |
| reportes.inventario | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| reportes.finanzas | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## 🔧 Implementación Técnica

### Migración 147: seed_roles_permisos_tenant.sql

```sql
-- ESTRUCTURA DE LA MIGRACIÓN:

-- PARTE 1: Función seed_permisos_tenant(p_tenant_id)
--   - Crea todos los permisos del catálogo para el tenant
--   - Usa INSERT ... ON CONFLICT DO NOTHING para idempotencia

-- PARTE 2: Función seed_roles_tenant(p_tenant_id)
--   - Crea los 6 roles por defecto
--   - Marca ADMIN como is_system_role = true

-- PARTE 3: Función seed_rol_permisos_tenant(p_tenant_id)
--   - Asigna permisos a cada rol según la matriz
--   - Usa la tabla rol_permisos

-- PARTE 4: Función principal seed_roles_permisos_tenant(p_tenant_id)
--   - Orquesta las 3 funciones anteriores
--   - Retorna JSON con estadísticas

-- PARTE 5: Función asignar_rol_admin_usuario(p_tenant_id, p_user_id)
--   - Asigna el rol ADMIN al usuario especificado

-- PARTE 6: Modificar create_demo_tenant()
--   - Llamar a seed_roles_permisos_tenant() después de crear empresa_config
--   - Llamar a asignar_rol_admin_usuario() para el usuario creado

-- PARTE 7: Trigger para nuevos tenants
--   - AFTER INSERT en empresa_config
--   - Ejecuta seed_roles_permisos_tenant() automáticamente

-- PARTE 8: Migrar tenants existentes
--   - Loop por todos los tenants sin roles
--   - Ejecutar seed para cada uno
```

### Archivos a Crear/Modificar

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/migrations/147__seed_roles_permisos_tenant.sql` | CREAR | Migración principal |
| `supabase/migrations/144__demo_create_tenant_rpc.sql` | MODIFICAR | Integrar seed de roles |

---

## ✅ Checklist de Implementación

### Fase 1: Crear Migración Base
- [ ] Crear función `seed_permisos_tenant()`
- [ ] Crear función `seed_roles_tenant()`
- [ ] Crear función `seed_rol_permisos_tenant()`
- [ ] Crear función orquestadora `seed_roles_permisos_tenant()`

### Fase 2: Integrar con Creación de Tenant
- [ ] Crear función `asignar_rol_admin_usuario()`
- [ ] Modificar `create_demo_tenant()` para usar las nuevas funciones
- [ ] Crear trigger `AFTER INSERT ON empresa_config`

### Fase 3: Migrar Tenants Existentes
- [ ] Script para detectar tenants sin roles
- [ ] Ejecutar seed para tenants existentes
- [ ] Asignar rol ADMIN a usuarios existentes

### Fase 4: Verificación
- [ ] Test: Crear nuevo tenant y verificar roles/permisos
- [ ] Test: Usuario admin puede crear usuarios
- [ ] Test: Usuario admin puede asignar roles
- [ ] Test: Permisos funcionan correctamente por rol

---

## 🧪 Casos de Prueba

### Test 1: Creación de Tenant Demo
```sql
-- Ejecutar
SELECT create_demo_tenant('TEST COMPANY', 14);

-- Verificar roles creados
SELECT * FROM roles WHERE tenant_id = '<nuevo_tenant_id>';
-- Esperado: 6 roles (ADMIN, VENDEDOR, CAJERO, ALMACENERO, CONTADOR, SUPERVISOR)

-- Verificar permisos creados
SELECT COUNT(*) FROM permisos WHERE tenant_id = '<nuevo_tenant_id>';
-- Esperado: ~80+ permisos

-- Verificar usuario tiene rol ADMIN
SELECT ur.*, r.nombre 
FROM user_roles ur 
JOIN roles r ON r.id = ur.role_id 
WHERE ur.usuario_sistema_id = '<user_id>';
-- Esperado: 1 registro con rol ADMIN
```

### Test 2: Admin Crea Usuario
```typescript
// POST /users
{
  "nombre": "Juan",
  "apellido": "Pérez",
  "email": "juan@test.com",
  "roles": ["<vendedor_role_id>"]
}
// Esperado: Usuario creado con rol VENDEDOR
```

### Test 3: Verificar Permisos por Rol
```typescript
// GET /users/:id/permissions
// Para usuario con rol VENDEDOR
// Esperado: Permisos de ventas.clientes, ventas.cotizaciones, etc.
// NO debe tener: configuracion.usuarios, contabilidad.asientos
```

---

## 📈 Métricas de Éxito

| Métrica | Valor Esperado |
|---------|----------------|
| Roles creados por tenant | 6 |
| Permisos creados por tenant | ~85 |
| Tiempo de seed | < 2 segundos |
| Tenants migrados | 100% |
| Tests pasando | 100% |

---

## 🚀 Orden de Ejecución

1. **Crear migración 147** con todas las funciones
2. **Ejecutar migración** en desarrollo
3. **Probar creación de tenant** nuevo
4. **Verificar** roles, permisos y asignaciones
5. **Migrar tenants existentes** si los hay
6. **Ejecutar tests** de integración
7. **Deploy a producción**

---

## ⚠️ Consideraciones de Seguridad

1. **SECURITY DEFINER**: Las funciones usan SECURITY DEFINER para bypass de RLS durante el seed
2. **Idempotencia**: Todas las funciones son idempotentes (ON CONFLICT DO NOTHING)
3. **Validación de tenant**: Siempre se valida que el tenant exista antes de crear datos
4. **Roles del sistema**: El rol ADMIN tiene `is_system_role = true` y no puede ser eliminado
5. **Auditoría**: Se registra en audit_log la creación de roles y permisos

---

## 📅 Fecha de Implementación

- **Creado**: 2025-11-29
- **Estado**: ✅ IMPLEMENTADO
- **Prioridad**: CRÍTICA
- **Estimación**: 2-3 horas
- **Tiempo real**: ~1 hora

---

## ✅ Implementación Completada

### Archivo Creado
- `supabase/migrations/147__seed_roles_permisos_tenant.sql`

### Funciones Implementadas
| Función | Descripción | Estado |
|---------|-------------|--------|
| `seed_permisos_tenant(UUID)` | Crea ~85 permisos para el tenant | ✅ |
| `seed_roles_tenant(UUID)` | Crea 6 roles por defecto | ✅ |
| `seed_rol_permisos_tenant(UUID)` | Asigna permisos según matriz | ✅ |
| `seed_roles_permisos_tenant(UUID)` | Función orquestadora principal | ✅ |
| `asignar_rol_admin_usuario(UUID, UUID)` | Asigna rol ADMIN a usuario | ✅ |
| `create_demo_tenant(VARCHAR, INTEGER)` | Actualizada con roles/permisos | ✅ |

### Trigger Implementado
- `trigger_seed_roles_permisos_on_tenant` - AFTER INSERT ON empresa_config

### Migración de Tenants Existentes
- Script incluido para migrar tenants sin roles
- Asigna rol ADMIN al primer usuario de cada tenant

### Permisos Creados por Módulo
| Módulo | Cantidad |
|--------|----------|
| Ventas | 28 |
| Inventario | 22 |
| Finanzas | 17 |
| Contabilidad | 10 |
| Compras | 11 |
| POS | 12 |
| RRHH | 9 |
| Configuración | 17 |
| Reportes | 7 |
| Users (API) | 1 |
| **TOTAL** | **~134** |

### Permiso Especial: users.manage
El controlador `UserManagementController` usa el permiso `users.manage` para proteger todos los endpoints de gestión de usuarios. Este permiso se crea como:
- **Módulo**: `users`
- **Recurso**: `__global__`
- **Acción**: `manage`

Este permiso se asigna automáticamente al rol ADMIN.

### Roles Creados
1. **ADMIN** - Acceso total (is_system_role = true)
2. **VENDEDOR** - Ventas, clientes, cotizaciones
3. **CAJERO** - POS, cajas, turnos
4. **ALMACENERO** - Inventario, logística
5. **CONTADOR** - Finanzas, contabilidad
6. **SUPERVISOR** - Aprobaciones, supervisión

---

## 🧪 Cómo Probar

```sql
-- 1. Crear un tenant demo
SELECT create_demo_tenant('MI EMPRESA TEST', 14);

-- 2. Verificar roles creados
SELECT * FROM roles WHERE tenant_id = '<tenant_id>';

-- 3. Verificar permisos creados
SELECT COUNT(*) FROM permisos WHERE tenant_id = '<tenant_id>';

-- 4. Verificar usuario tiene rol ADMIN
SELECT u.email, r.nombre as rol
FROM usuarios_sistema u
JOIN user_roles ur ON ur.usuario_sistema_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.tenant_id = '<tenant_id>';
```

---

## 👤 Responsable

Sistema automatizado de gestión de tenants ERP Suite.
