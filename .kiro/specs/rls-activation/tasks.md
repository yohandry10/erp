# Implementation Plan - Reactivación de RLS

Este plan de implementación detalla las tareas necesarias para reactivar el Row Level Security (RLS) en todas las tablas de la base de datos del sistema ERP multi-tenant.

## Tareas

- [x] 1. Crear migración base y funciones auxiliares




  - Crear archivo de migración `20251016_enable_rls_all_tables.sql`
  - Verificar existencia de funciones `get_current_tenant_id()` y `get_current_user_id()`
  - Crear función auxiliar `is_super_admin(user_id UUID)` para evitar recursión
  - Crear función auxiliar `drop_all_policies(table_name TEXT)` para limpieza idempotente
  - _Requirements: 1.1, 9.1, 9.2_

- [x] 2. Reactivar RLS en tablas de autenticación





  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_


- [x] 2.1 Configurar RLS en usuarios_sistema

  - Eliminar todas las políticas existentes en usuarios_sistema
  - Crear política `usuarios_sistema_allow_login_select` para permitir SELECT sin autenticación
  - Crear política `usuarios_sistema_authenticated_write` para INSERT/UPDATE/DELETE con validación de tenant
  - Activar RLS en usuarios_sistema
  - _Requirements: 1.1, 1.2, 1.5_


- [x] 2.2 Configurar RLS en user_roles

  - Eliminar todas las políticas existentes en user_roles
  - Crear política `user_roles_allow_login_select` para permitir SELECT sin autenticación (necesario para JOINs en login)
  - Crear política `user_roles_authenticated_write` para INSERT/UPDATE/DELETE validando a través de usuarios_sistema
  - Activar RLS en user_roles
  - _Requirements: 1.1, 1.3, 5.1, 5.2_


- [x] 2.3 Configurar RLS en roles

  - Eliminar todas las políticas existentes en roles
  - Crear política `roles_allow_login_select` para permitir SELECT sin autenticación
  - Crear política `roles_authenticated_write` para INSERT/UPDATE/DELETE con validación de tenant
  - Activar RLS en roles
  - _Requirements: 1.1, 1.3_

- [x] 3. Reactivar RLS en tablas de configuración



  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3.1 Configurar RLS en empresa_config


  - Eliminar todas las políticas existentes en empresa_config
  - Crear política `empresa_config_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en empresa_config
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 3.2 Configurar RLS en fe_configuracion

  - Crear política `fe_configuracion_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en fe_configuracion
  - _Requirements: 2.1, 2.2_

- [x] 3.3 Configurar RLS en documento_series

  - Crear política `documento_series_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en documento_series
  - _Requirements: 2.1, 2.2_

- [x] 4. Activar RLS en tablas de datos maestros




  - _Requirements: 2.1, 2.2, 2.3, 6.1_


- [x] 4.1 Configurar RLS en clientes

  - Crear política `clientes_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Crear índice `idx_clientes_tenant_activo` en (tenant_id) WHERE activo = true
  - Activar RLS en clientes
  - _Requirements: 2.1, 2.2, 6.1_


- [x] 4.2 Configurar RLS en productos

  - Crear política `productos_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Crear índice `idx_productos_tenant_activo` en (tenant_id) WHERE activo = true
  - Activar RLS en productos
  - _Requirements: 2.1, 2.2, 6.1_



- [x] 4.3 Configurar RLS en empleados





  - Crear política `empleados_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en empleados
  - _Requirements: 2.1, 2.2, 6.4_



- [x] 4.4 Configurar RLS en proveedores





  - Crear política `proveedores_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en proveedores (si la tabla existe)
  - _Requirements: 2.1, 2.2_

- [x] 5. Activar RLS en módulo de ventas





  - _Requirements: 2.1, 2.2, 6.1_


- [x] 5.1 Configurar RLS en cotizaciones

  - Crear política `cotizaciones_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en cotizaciones
  - _Requirements: 2.1, 2.2, 6.1_


- [x] 5.2 Configurar RLS en cotizacion_detalles

  - Crear política `cotizacion_detalles_tenant_isolation` validando a través de cotizaciones
  - Activar RLS en cotizacion_detalles
  - _Requirements: 2.1, 2.2_

- [x] 5.3 Configurar RLS en ventas


  - Crear política `ventas_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Crear índice `idx_ventas_tenant_created` en (tenant_id, created_at DESC)
  - Activar RLS en ventas
  - _Requirements: 2.1, 2.2, 6.1_


- [x] 5.4 Configurar RLS en venta_detalles

  - Crear política `venta_detalles_tenant_isolation` validando a través de ventas
  - Activar RLS en venta_detalles
  - _Requirements: 2.1, 2.2_


- [x] 5.5 Configurar RLS en pagos_ventas

  - Crear política `pagos_ventas_tenant_isolation` validando a través de ventas
  - Activar RLS en pagos_ventas
  - _Requirements: 2.1, 2.2_

- [x] 6. Activar RLS en módulo de documentos electrónicos



  - _Requirements: 2.1, 2.2, 6.5_


- [x] 6.1 Configurar RLS en documentos

  - Crear política `documentos_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Crear índice `idx_documentos_tenant_serie` en (tenant_id, serie, numero)
  - Activar RLS en documentos
  - _Requirements: 2.1, 2.2, 6.5_


- [x] 6.2 Configurar RLS en documento_detalles
  - Crear política `documento_detalles_tenant_isolation` con tenant_id directo
  - Activar RLS en documento_detalles
  - _Requirements: 2.1, 2.2_


- [x] 6.3 Configurar RLS en documento_archivos
  - Crear política `documento_archivos_tenant_isolation` con tenant_id directo
  - Activar RLS en documento_archivos
  - _Requirements: 2.1, 2.2_


- [x] 6.4 Configurar RLS en documento_auditoria

  - Crear política `documento_auditoria_tenant_isolation` con tenant_id directo
  - Activar RLS en documento_auditoria
  - _Requirements: 2.1, 2.2, 7.2_

- [x] 7. Activar RLS en módulo de compras




  - _Requirements: 2.1, 2.2, 6.2_


- [x] 7.1 Configurar RLS en ordenes_compra

  - Crear política `ordenes_compra_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en ordenes_compra
  - _Requirements: 2.1, 2.2, 6.2_


- [x] 7.2 Configurar RLS en orden_compra_detalles





  - Crear política `orden_compra_detalles_tenant_isolation` validando a través de ordenes_compra
  - Activar RLS en orden_compra_detalles
  - _Requirements: 2.1, 2.2_

- [x] 8. Activar RLS en módulo de contabilidad


  - _Requirements: 2.1, 2.2, 6.3_

- [x] 8.1 Configurar RLS en plan_cuentas
  - Crear política `plan_cuentas_tenant_isolation` con acceso para super admins y filtrado por tenant (si tiene tenant_id)
  - Activar RLS en plan_cuentas
  - _Requirements: 2.1, 2.2, 6.3_

- [x] 8.2 Configurar RLS en asientos_contables
  - Crear política `asientos_contables_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en asientos_contables
  - _Requirements: 2.1, 2.2, 6.3_

- [x] 8.3 Configurar RLS en detalle_asientos
  - Crear política `detalle_asientos_tenant_isolation` validando a través de asientos_contables
  - Activar RLS en detalle_asientos
  - _Requirements: 2.1, 2.2_

- [x] 8.4 Configurar RLS en cuentas_por_cobrar
  - Crear política `cuentas_por_cobrar_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en cuentas_por_cobrar
  - _Requirements: 2.1, 2.2, 6.3_

- [x] 8.5 Configurar RLS en cuentas_por_pagar
  - Crear política `cuentas_por_pagar_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en cuentas_por_pagar
  - _Requirements: 2.1, 2.2, 6.3_

- [x] 8.6 Configurar RLS en gastos
  - Crear política `gastos_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en gastos
  - _Requirements: 2.1, 2.2, 6.3_

- [x] 8.7 Configurar RLS en pagos_facturas
  - Crear política `pagos_facturas_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en pagos_facturas
  - _Requirements: 2.1, 2.2_

- [x] 8.8 Configurar RLS en tipos_cambio

  - Crear política `tipos_cambio_read_authenticated` para lectura pública
  - Crear política `tipos_cambio_write_super_admin` para escritura solo super admin
  - Activar RLS en tipos_cambio
  - _Requirements: 3.1, 3.2_

- [-] 9. Activar RLS en módulo de RRHH The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 


  - _Requirements: 2.1, 2.2, 6.4_

- [x] 9.1 Configurar RLS en contratos


  - Crear política `contratos_tenant_isolation` validando a través de empleados
  - Activar RLS en contratos
  - _Requirements: 2.1, 2.2, 6.4_


- [ ] 9.2 Configurar RLS en asistencias
  - Crear política `asistencias_tenant_isolation` validando a través de empleados
  - Activar RLS en asistencias
  - _Requirements: 2.1, 2.2, 6.4_


- [ ] 9.3 Configurar RLS en planillas
  - Crear política `planillas_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en planillas
  - _Requirements: 2.1, 2.2, 6.4_


- [ ] 9.4 Configurar RLS en planilla_detalles
  - Crear política `planilla_detalles_tenant_isolation` validando a través de planillas
  - Activar RLS en planilla_detalles
  - _Requirements: 2.1, 2.2_

- [x] 9.5 Configurar RLS en historial_pagos_planilla

  - Crear política `historial_pagos_planilla_tenant_isolation` validando a través de planillas
  - Activar RLS en historial_pagos_planilla
  - _Requirements: 2.1, 2.2_


- [ ] 9.6 Configurar RLS en rrhh_pagos
  - Crear política `rrhh_pagos_tenant_isolation` validando a través de empleados
  - Activar RLS en rrhh_pagos
  - _Requirements: 2.1, 2.2_


- [x] 9.7 Configurar RLS en asientos_contables_rrhh

  - Crear política `asientos_contables_rrhh_tenant_isolation` validando a través de planillas
  - Activar RLS en asientos_contables_rrhh
  - _Requirements: 2.1, 2.2_

 - [x] 10. Activar RLS en módulo de inventario The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 

  - _Requirements: 2.1, 2.2_

- [x] 10.1 Configurar RLS en movimientos_stock


  - Crear política `movimientos_stock_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en movimientos_stock
  - _Requirements: 2.1, 2.2_

- [x] 10.2 Configurar RLS en categorias_productos



  - Crear política `categorias_productos_tenant_isolation` con acceso para super admins y filtrado por tenant (si existe)
  - Activar RLS en categorias_productos
  - _Requirements: 2.1, 2.2_

- [x] 11. Activar RLS en tablas de seguridad y auditoría The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. EVITAR ERRORES D SINTAXIS





  - _Requirements: 2.1, 2.2, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 11.1 Configurar RLS en permisos


  - Crear política `permisos_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en permisos
  - _Requirements: 2.1, 2.2_

- [x] 11.2 Configurar RLS en rol_permisos


  - Crear política `rol_permisos_tenant_isolation` validando a través de roles
  - Activar RLS en rol_permisos
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 11.3 Configurar RLS en audit_log


  - Crear política `audit_log_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en audit_log
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 11.4 Configurar RLS en user_sessions


  - Crear política `user_sessions_own_access` para acceso a sesiones propias o super admin
  - Activar RLS en user_sessions
  - _Requirements: 7.5_

- [-] 12. Activar RLS en tablas de catálogos globales The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 


  - _Requirements: 3.1, 3.2, 3.3_

- [x] 12.1 Configurar RLS en paises


  - Crear política `paises_read_authenticated` para lectura pública
  - Crear política `paises_write_super_admin` para escritura solo super admin
  - Activar RLS en paises
  - _Requirements: 3.1, 3.2_

- [x] 12.2 Configurar RLS en tipos_impuestos


  - Crear política `tipos_impuestos_read_authenticated` para lectura pública
  - Crear política `tipos_impuestos_write_super_admin` para escritura solo super admin
  - Activar RLS en tipos_impuestos
  - _Requirements: 3.1, 3.2_

- [x] 12.3 Configurar RLS en tipos_documentos_fiscales


  - Crear política `tipos_documentos_fiscales_read_authenticated` para lectura pública
  - Crear política `tipos_documentos_fiscales_write_super_admin` para escritura solo super admin
  - Activar RLS en tipos_documentos_fiscales
  - _Requirements: 3.1, 3.2_

- [x] 12.4 Configurar RLS en configuracion_fiscal



  - Crear política `configuracion_fiscal_read_authenticated` para lectura pública
  - Crear política `configuracion_fiscal_write_super_admin` para escritura solo super admin
  - Activar RLS en configuracion_fiscal
  - _Requirements: 3.1, 3.2_

- [ ] 13. Activar RLS en tablas de sistema The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 
  - _Requirements: 3.3_

- [x] 13.1 Configurar RLS en outbox_events





  - Crear política `outbox_events_system_access` para acceso del sistema
  - Activar RLS en outbox_events
  - _Requirements: 3.3_

- [ ] 13.2 Configurar RLS en event_processing_log
  - Crear política `event_processing_log_system_access` para acceso del sistema
  - Activar RLS en event_processing_log
  - _Requirements: 3.3_

- [-] 14. Configurar RLS en tablas de finanzas adicionales The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 


  - _Requirements: 2.1, 2.2_

- [x] 14.1 Configurar RLS en cuentas_bancarias


  - Crear política `cuentas_bancarias_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en cuentas_bancarias
  - _Requirements: 2.1, 2.2_


- [ ] 14.2 Configurar RLS en movimientos_bancarios
  - Crear política `movimientos_bancarios_tenant_isolation` validando a través de cuentas_bancarias
  - Activar RLS en movimientos_bancarios
  - _Requirements: 2.1, 2.2_


- [x] 14.3 Configurar RLS en cobranzas

  - Crear política `cobranzas_tenant_isolation` con acceso para super admins y filtrado por tenant
  - Activar RLS en cobranzas
  - _Requirements: 2.1, 2.2_

- [x] 15. Configurar RLS en tablas de auditoría adicionales The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$.



  - _Requirements: 7.1, 7.2_

- [x] 15.1 Configurar RLS en auditoria_cotizaciones


  - Crear política `auditoria_cotizaciones_tenant_isolation` validando a través de cotizaciones
  - Activar RLS en auditoria_cotizaciones
  - _Requirements: 7.1, 7.2_

- [ ] 16. Configurar RLS en usuario_configuracion The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 
  - Crear política `usuario_configuracion_own_access` para acceso a configuración propia
  - Activar RLS en usuario_configuracion
  - _Requirements: 2.1, 2.2_

- [ ] 17. Agregar mensajes de verificación y resumen The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 
  - Crear bloque DO que cuente tablas con RLS activado
  - Crear bloque DO que liste todas las políticas creadas
  - Agregar mensajes informativos sobre el estado final
  - Incluir instrucciones para verificar el funcionamiento
  - _Requirements: 9.4, 9.5_

- [ ] 18. Crear script de validación post-migración
  - Crear archivo `validate_rls_activation.sql` con tests de validación
  - Incluir test de login sin contexto de sesión
  - Incluir test de filtrado por tenant
  - Incluir test de acceso de super admin
  - Incluir test de escritura con validación de tenant
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 19. Documentar excepciones y casos especiales The issue is that PostgreSQL anonymous code blocks (DO $) need to have $$ as delimiters, not just $. The error is happening because the syntax DO $ is incomplete - it should be DO $$. 
  - Agregar comentarios SQL explicando por qué usuarios_sistema permite SELECT sin auth
  - Documentar por qué user_roles y roles permiten SELECT sin auth
  - Documentar estrategia de validación para tablas de detalle
  - Documentar políticas especiales para catálogos globales
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 20. Crear documentación de troubleshooting
  - Crear archivo `RLS_TROUBLESHOOTING.md` con guía de resolución de problemas
  - Documentar error "login bloqueado por RLS" y su solución
  - Documentar error "JOIN bloqueado" y su solución
  - Documentar error "recursión infinita" y su solución
  - Documentar cómo verificar contexto de tenant
  - Documentar cómo desactivar RLS en caso de emergencia
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
