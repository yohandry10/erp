# Requirements Document - Reactivación de RLS (Row Level Security)

## Introducción

Este documento define los requerimientos para reactivar el control de acceso a nivel de fila (RLS) en todas las tablas de la base de datos del sistema ERP multi-tenant. El objetivo es garantizar el aislamiento de datos entre tenants y mantener la seguridad sin afectar la funcionalidad existente, especialmente el proceso de autenticación.

El sistema actualmente tiene RLS desactivado en las tablas principales (usuarios_sistema, user_roles, roles, empresa_config) debido a problemas previos con el proceso de login. Esta implementación debe resolver esos problemas y activar RLS de manera segura en todas las tablas del sistema.

## Contexto del Sistema

- **Sistema multi-tenant**: Cada tenant (empresa) tiene sus propios datos aislados
- **Tenant por defecto**: `550e8400-e29b-41d4-a716-446655440000`
- **Super admins**: Usuarios con acceso global a todos los tenants
- **Funciones de contexto existentes**: `get_current_tenant_id()` y `get_current_user_id()`
- **Tablas críticas**: usuarios_sistema, user_roles, roles, empresa_config, permisos, y todas las tablas de módulos (ventas, compras, contabilidad, RRHH, documentos, etc.)

## Requirements

### Requirement 1: Reactivar RLS en Tablas de Autenticación

**User Story:** Como administrador del sistema, quiero que las tablas de autenticación tengan RLS activado, para que los datos estén protegidos sin bloquear el proceso de login.

#### Acceptance Criteria

1. WHEN un usuario intenta hacer login THEN el sistema SHALL permitir la lectura de usuarios_sistema, user_roles y roles sin autenticación previa
2. WHEN un usuario está autenticado THEN el sistema SHALL filtrar automáticamente los datos por tenant_id
3. WHEN un super admin accede al sistema THEN el sistema SHALL permitir acceso a todos los tenants
4. IF el usuario no está autenticado THEN el sistema SHALL permitir solo operaciones SELECT necesarias para el login
5. WHEN se activa RLS en usuarios_sistema THEN el proceso de login SHALL funcionar correctamente sin errores

### Requirement 2: Implementar Políticas RLS para Todas las Tablas con tenant_id

**User Story:** Como desarrollador del sistema, quiero que todas las tablas con tenant_id tengan políticas RLS consistentes, para garantizar el aislamiento de datos entre tenants.

#### Acceptance Criteria

1. WHEN se consulta cualquier tabla con tenant_id THEN el sistema SHALL filtrar automáticamente por el tenant_id del usuario actual
2. WHEN un super admin consulta una tabla THEN el sistema SHALL permitir acceso a registros de todos los tenants
3. IF una tabla tiene tenant_id THEN el sistema SHALL tener una política RLS activa
4. WHEN se inserta un registro THEN el sistema SHALL validar que el tenant_id corresponda al tenant del usuario
5. WHEN se actualiza o elimina un registro THEN el sistema SHALL verificar que pertenezca al tenant del usuario

### Requirement 3: Manejar Tablas sin tenant_id

**User Story:** Como arquitecto del sistema, quiero que las tablas sin tenant_id (catálogos, configuraciones globales) tengan políticas RLS apropiadas, para mantener la seguridad sin bloquear funcionalidad.

#### Acceptance Criteria

1. WHEN se accede a una tabla de catálogo (paises, tipos_impuestos, etc.) THEN el sistema SHALL permitir lectura a usuarios autenticados
2. WHEN se modifica una tabla de configuración global THEN el sistema SHALL requerir permisos de super admin
3. IF una tabla es de solo lectura THEN el sistema SHALL permitir SELECT a todos los usuarios autenticados
4. WHEN se accede a tablas de auditoría THEN el sistema SHALL filtrar por tenant_id o permitir acceso solo a super admins

### Requirement 4: Garantizar Compatibilidad con el Proceso de Login

**User Story:** Como usuario del sistema, quiero poder iniciar sesión sin problemas, para que el RLS no interfiera con la autenticación.

#### Acceptance Criteria

1. WHEN un usuario envía credenciales de login THEN el sistema SHALL poder consultar usuarios_sistema sin contexto de sesión previo
2. WHEN se valida la contraseña THEN el sistema SHALL poder leer el hash almacenado sin restricciones RLS
3. WHEN se cargan los roles del usuario THEN el sistema SHALL poder hacer JOIN con user_roles y roles
4. IF el login es exitoso THEN el sistema SHALL establecer el contexto de tenant_id y user_id para las siguientes consultas
5. WHEN se establece la sesión THEN todas las consultas subsecuentes SHALL respetar las políticas RLS

### Requirement 5: Implementar Políticas para Tablas de Relaciones (Many-to-Many)

**User Story:** Como desarrollador, quiero que las tablas de relaciones (rol_permisos, user_roles, etc.) tengan políticas RLS adecuadas, para mantener la integridad referencial y seguridad.

#### Acceptance Criteria

1. WHEN se consulta una tabla de relación THEN el sistema SHALL verificar que ambas entidades relacionadas pertenezcan al tenant del usuario
2. WHEN un super admin gestiona permisos THEN el sistema SHALL permitir acceso a todas las relaciones
3. IF una tabla de relación no tiene tenant_id directo THEN el sistema SHALL validar a través de las tablas relacionadas
4. WHEN se crea una relación THEN el sistema SHALL verificar que el usuario tenga acceso a ambas entidades
5. WHEN se elimina una relación THEN el sistema SHALL verificar permisos sobre ambas entidades

### Requirement 6: Proteger Tablas de Módulos de Negocio

**User Story:** Como usuario de un tenant, quiero que mis datos de ventas, compras, contabilidad y RRHH estén completamente aislados de otros tenants, para garantizar privacidad y seguridad.

#### Acceptance Criteria

1. WHEN se consultan ventas, cotizaciones o facturas THEN el sistema SHALL mostrar solo registros del tenant actual
2. WHEN se consultan compras u órdenes de compra THEN el sistema SHALL filtrar por tenant_id automáticamente
3. WHEN se accede a datos contables (asientos, plan de cuentas) THEN el sistema SHALL aislar por tenant
4. WHEN se consultan datos de RRHH (empleados, planillas) THEN el sistema SHALL aplicar filtrado por tenant
5. WHEN se accede a documentos electrónicos THEN el sistema SHALL garantizar aislamiento por tenant

### Requirement 7: Implementar Políticas para Tablas de Auditoría y Logs

**User Story:** Como auditor del sistema, quiero que los logs y auditorías estén protegidos por RLS, para que cada tenant solo vea sus propios registros de auditoría.

#### Acceptance Criteria

1. WHEN se consulta audit_log THEN el sistema SHALL mostrar solo registros del tenant actual (excepto super admins)
2. WHEN se consulta documento_auditoria THEN el sistema SHALL filtrar por tenant_id del documento
3. WHEN un super admin consulta auditorías THEN el sistema SHALL permitir acceso a todos los tenants
4. IF se registra una acción de auditoría THEN el sistema SHALL usar el tenant_id del contexto actual
5. WHEN se consultan logs de sesiones THEN el sistema SHALL filtrar por usuario o tenant según el rol

### Requirement 8: Validar Funcionamiento Post-Activación

**User Story:** Como administrador del sistema, quiero verificar que todas las funcionalidades sigan operando correctamente después de activar RLS, para garantizar que no se rompa ninguna funcionalidad existente.

#### Acceptance Criteria

1. WHEN se activa RLS THEN el proceso de login SHALL funcionar sin errores
2. WHEN un usuario normal accede al sistema THEN SHALL ver solo datos de su tenant
3. WHEN un super admin accede al sistema THEN SHALL ver datos de todos los tenants
4. WHEN se ejecutan operaciones CRUD THEN el sistema SHALL aplicar filtrado automático por tenant
5. WHEN se ejecutan consultas con JOINs THEN las políticas RLS SHALL aplicarse correctamente en todas las tablas involucradas

### Requirement 9: Crear Migración Idempotente y Segura

**User Story:** Como DevOps, quiero una migración que pueda ejecutarse de manera segura en producción, para activar RLS sin causar downtime o pérdida de datos.

#### Acceptance Criteria

1. WHEN se ejecuta la migración THEN SHALL ser idempotente (puede ejecutarse múltiples veces sin errores)
2. WHEN se crean políticas THEN el sistema SHALL eliminar políticas existentes primero para evitar duplicados
3. IF una tabla ya tiene RLS activado THEN la migración SHALL actualizar las políticas sin errores
4. WHEN se ejecuta la migración THEN SHALL incluir mensajes informativos del progreso
5. WHEN la migración finaliza THEN SHALL mostrar un resumen de tablas protegidas y políticas creadas

### Requirement 10: Documentar Excepciones y Casos Especiales

**User Story:** Como desarrollador futuro, quiero que las excepciones y casos especiales estén documentados, para entender por qué ciertas tablas tienen políticas diferentes.

#### Acceptance Criteria

1. WHEN una tabla tiene políticas especiales THEN SHALL estar documentado en comentarios SQL
2. WHEN se permite acceso sin autenticación THEN SHALL estar justificado en la documentación
3. IF una tabla no tiene RLS THEN SHALL estar documentado el motivo
4. WHEN se crean políticas complejas THEN SHALL incluir comentarios explicativos
5. WHEN se documenta una excepción THEN SHALL incluir el contexto y la razón de la decisión
