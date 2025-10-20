# Implementation Plan

## Overview

Este plan de implementación convierte el diseño del Módulo de Ventas en una serie de tareas incrementales y ejecutables. El enfoque prioriza:
1. Infraestructura base (modelos, migraciones, configuración)
2. Backend API (servicios, controladores, validaciones)
3. Frontend UI (páginas, componentes, flujos)
4. Integraciones (inventario, CPE, GRE)
5. Características avanzadas (reportes, notificaciones, permisos)

Cada tarea está diseñada para ser ejecutable por un agente de código, construyendo incrementalmente sobre tareas previas.

## 🔍 VALIDACIÓN OBLIGATORIA EN CADA TAREA

**IMPORTANTE:** Cada tarea DEBE seguir este proceso de validación:

1. **Implementar la funcionalidad solicitada** en la tarea
2. **Ejecutar validación TypeScript**: `npx tsc --noEmit` en `apps/erp-api`
3. **Corregir TODOS los errores de la implementación actual** (errores introducidos por la tarea)
4. **Corregir 10 errores adicionales** de los errores pre-existentes en el proyecto
5. **Verificar que la validación pase** sin errores en los archivos modificados

**Objetivo:** Reducir progresivamente los errores de TypeScript del proyecto (actualmente 105 errores en 14 archivos) mientras se implementan nuevas funcionalidades.

**Nota:** Al inicio de la tarea 2, había 105 errores. Cada tarea debe reducir este número en al menos 10 errores adicionales.

## ⚠️ REGLA IMPORTANTE: NO CREAR ARCHIVOS DE DOCUMENTACIÓN

**AL COMPLETAR CADA TAREA:**
- ❌ **NO crear archivos .md** (markdown)
- ❌ **NO crear archivos .txt** (texto)
- ❌ **NO crear archivos de documentación** de ningún tipo
- ✅ **SOLO implementar código funcional** (TypeScript, JavaScript, SQL, etc.)
- ✅ **Actualizar código existente** según sea necesario

Esta regla aplica para TODAS las tareas del plan de implementación.

**IMPORTANTE - Fases de Implementación:**

**FASE 1 (MVP):** Tareas 1-24 implementan el flujo base completo:
- Gestión de clientes, cotizaciones y pedidos
- Flujos adaptativos (simple vs completo) configurables por tenant
- Reserva y liberación de inventario
- Integración con CPE y GRE
- Permisos, auditoría y reportes básicos

**FASE 2 (ERP Real):** Mejoras futuras (no incluidas en este plan de tareas):
- Aprobaciones internas
- Control de crédito y CxC
- Multialmacén con ubicaciones
- Lotes y series (FEFO)
- Picking y packing separados
- Backorder y parciales
- Facturación parcial/consolidada
- Anticipos y devoluciones (RMA)
- Asientos contables automáticos
- Multi-moneda y listas de precio

**Este plan de tareas se enfoca en FASE 1 (MVP) para tener un sistema funcional y operativo.**

## Tasks

- [x] 1. Configurar estructura base del módulo y migraciones de base de datos




  - Crear archivo `/supabase/migrations/001_crear_tablas_ventas.sql` con tablas: clientes, cotizaciones, cotizaciones_detalle, pedidos_venta, pedidos_venta_detalle
  - Crear archivo `/supabase/migrations/002_agregar_stock_reservado.sql` para agregar campo stock_reservado a tabla productos
  - Crear archivo `/supabase/migrations/003_configuracion_tenant_ventas.sql` para agregar campos a empresa_config: tipo_empresa, usar_flujo_logistica, gre_obligatorio, gre_automatico_habilitado, umbral_gre_automatico
  - Crear archivo `/supabase/migrations/004_movimientos_inventario_ventas.sql` para tabla movimientos_inventario con tipos RESERVA, LIBERACION, SALIDA
  - Crear archivo `/supabase/migrations/005_indices_ventas.sql` para índices de optimización
  - Crear archivo `/supabase/migrations/006_funciones_stock.sql` para función stock_disponible(producto_id)
  - Todos los scripts deben incluir políticas RLS (Row Level Security)
  - _Requirements: 1.5, 6.2, 6.3, 7.1, 7.2, 25.1, 25.2_

- [x] 2. Implementar módulo de Clientes (Backend)





- [x] 2.1 Crear entidades y DTOs de Cliente


  - Crear entity Cliente con todos los campos (tipo, documento_tipo, documento_numero, razon_social, etc.)
  - Crear CreateClienteDto con validaciones (class-validator)
  - Crear UpdateClienteDto
  - Crear ValidarRucDto
  - _Requirements: 1.2, 1.3, 1.4, 19.1, 19.2_


- [x] 2.2 Implementar ClientesService


  - Crear método create() con validación de duplicados por RUC/DNI
  - Crear método findAll() con filtros y búsqueda
  - Crear método findOne() con relaciones
  - Crear método update() con validaciones
  - Crear método delete() con verificación de dependencias
  - Crear método validarRUC() para integración con API SUNAT
  - _Requirements: 1.1, 1.5, 1.7, 1.8, 19.3_

- [x] 2.3 Implementar ClientesController


  - Crear endpoint GET /api/ventas/clientes (listar con paginación)
  - Crear endpoint POST /api/ventas/clientes (crear)
  - Crear endpoint GET /api/ventas/clientes/:id (obtener)
  - Crear endpoint PUT /api/ventas/clientes/:id (actualizar)
  - Crear endpoint DELETE /api/ventas/clientes/:id (eliminar)
  - Crear endpoint POST /api/ventas/clientes/validar-ruc (validar con SUNAT)
  - Aplicar guards de autenticación y permisos
  - _Requirements: 1.1, 1.2, 1.6, 14.1, 14.2_

- [ ]* 2.4 Escribir tests para ClientesModule
  - Crear tests unitarios para ClientesService (CRUD, validaciones)
  - Crear tests de integración para ClientesController
  - Mockear dependencias externas (SUNAT API)
  - _Requirements: 1.5, 15.7_


- [x] 3. Implementar módulo de Cotizaciones (Backend)




- [x] 3.1 Crear entidades y DTOs de Cotización


  - Crear entity Cotizacion con campos y relaciones
  - Crear entity CotizacionDetalle
  - Crear CreateCotizacionDto con validaciones
  - Crear UpdateCotizacionDto
  - Crear ConvertirPedidoDto
  - _Requirements: 3.2, 3.3, 3.4_

- [x] 3.2 Implementar CotizacionesService


  - Crear método create() con cálculo de totales (subtotal, IGV, total)
  - Crear método findAll() con filtros por estado
  - Crear método findOne() con detalles y cliente
  - Crear método update() con recálculo de totales
  - Crear método delete()
  - Crear método convertirAPedido() que crea pedido y cambia estado a CONVERTIDA
  - Implementar lógica de vencimiento automático de cotizaciones
  - _Requirements: 3.1, 3.5, 3.6, 3.7, 4.2, 4.3, 4.4_

- [x] 3.3 Implementar CotizacionesController


  - Crear endpoint GET /api/ventas/cotizaciones (listar)
  - Crear endpoint POST /api/ventas/cotizaciones (crear)
  - Crear endpoint GET /api/ventas/cotizaciones/:id (obtener)
  - Crear endpoint PUT /api/ventas/cotizaciones/:id (actualizar)
  - Crear endpoint DELETE /api/ventas/cotizaciones/:id (eliminar)
  - Crear endpoint POST /api/ventas/cotizaciones/:id/convertir-pedido
  - Aplicar guards de permisos
  - _Requirements: 3.1, 4.1, 4.6, 14.3_

- [ ]* 3.4 Escribir tests para CotizacionesModule
  - Tests unitarios para CotizacionesService
  - Tests de integración para conversión a pedido
  - _Requirements: 3.3, 4.2_


- [x] 4. Implementar módulo de Pedidos de Venta (Backend)



- [x] 4.1 Crear entidades y DTOs de Pedido


  - Crear entity PedidoVenta con todos los estados
  - Crear entity PedidoDetalle
  - Crear CreatePedidoDto
  - Crear UpdatePedidoDto
  - Crear ConfirmarPedidoDto
  - Crear CancelarPedidoDto
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 4.2 Implementar PedidosService - Operaciones básicas


  - Crear método create() con cálculo de totales
  - Crear método findAll() con filtros por estado, cliente, fechas
  - Crear método findOne() con detalles completos
  - Crear método update()
  - Crear método updateEstado() con validaciones de transición
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 4.3 Implementar PedidosService - Confirmar pedido con reserva de stock


  - Crear método confirmarPedido() que verifica stock disponible
  - Implementar lógica de alerta si stock insuficiente (permitir continuar)
  - Crear movimientos de inventario tipo RESERVA
  - Actualizar stock_reservado en productos
  - Cambiar estado a CONFIRMADO
  - Aplicar bifurcación: si usar_flujo_logistica=false → cambiar a LISTO_FACTURAR
  - _Requirements: 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 7.5, 8.1_

- [x] 4.4 Implementar PedidosService - Cancelar pedido con liberación


  - Crear método cancelarPedido() con validación de estado
  - Crear movimientos tipo LIBERACION
  - Decrementar stock_reservado
  - Cambiar estado a CANCELADO
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [x] 4.5 Implementar PedidosService - Generar factura


  - Crear método generarFactura() con validación de estado LISTO_FACTURAR
  - Si usar_flujo_logistica=false: descontar stock aquí (SALIDA + liberar reserva)
  - Integrar con CPEService para crear factura
  - Actualizar pedido con factura_id y estado FACTURADO
  - Verificar si debe sugerir GRE (gre_automatico_habilitado + umbral)
  - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 4.6 Implementar PedidosController


  - Crear endpoint GET /api/ventas/pedidos (listar)
  - Crear endpoint POST /api/ventas/pedidos (crear)
  - Crear endpoint GET /api/ventas/pedidos/:id (obtener)
  - Crear endpoint PUT /api/ventas/pedidos/:id (actualizar)
  - Crear endpoint POST /api/ventas/pedidos/:id/confirmar
  - Crear endpoint POST /api/ventas/pedidos/:id/cancelar
  - Crear endpoint POST /api/ventas/pedidos/:id/generar-factura
  - Aplicar guards de permisos
  - _Requirements: 5.1, 5.4, 14.4, 14.5_

- [ ]* 4.7 Escribir tests para PedidosModule
  - Tests unitarios para confirmar pedido
  - Tests unitarios para cancelar pedido
  - Tests unitarios para generar factura
  - Tests de integración con InventarioService
  - _Requirements: 5.7, 6.1, 12.4_


- [x] 5. Implementar módulo de Logística (Backend - solo si usar_flujo_logistica=true)



- [x] 5.1 Crear DTOs de Logística


  - Crear PrepararPedidoDto
  - Crear ConfirmarDespachoDto
  - _Requirements: 9.3, 9.4, 9.5_

- [x] 5.2 Implementar LogisticaService


  - Crear método getOrdenesPendientes() que lista pedidos en estado CONFIRMADO
  - Crear método prepararPedido() que cambia estado a EN_PREPARACION
  - Crear método marcarListoDespacho() que cambia a LISTO_DESPACHO
  - Crear método confirmarDespacho() que descuenta stock real (SALIDA), libera reserva y cambia a LISTO_FACTURAR
  - _Requirements: 9.1, 9.2, 9.6, 9.7, 21.5, 21.6, 21.7, 21.8_


- [x] 5.3 Implementar LogisticaController

  - Crear endpoint GET /api/inventario/logistica/ordenes-pendientes
  - Crear endpoint POST /api/inventario/logistica/:pedidoId/preparar
  - Crear endpoint POST /api/inventario/logistica/:pedidoId/marcar-listo
  - Crear endpoint POST /api/inventario/logistica/:pedidoId/confirmar-despacho
  - Aplicar guards de permisos inventario.logistica.*
  - _Requirements: 9.2, 14.6, 21.1, 21.2_

- [ ]* 5.4 Escribir tests para LogisticaModule
  - Tests unitarios para flujo de preparación
  - Tests unitarios para confirmar despacho
  - _Requirements: 9.7_


- [-] 6. Implementar servicio de Inventario (mejoras para reservas)


- [x] 6.1 Mejorar InventarioService con métodos de reserva



  - Crear método getStockDisponible(producto_id) que calcula stock_actual - stock_reservado
  - Crear método crearMovimiento(tipo, cantidad, referencia) genérico
  - Crear método reservarStock(producto_id, cantidad) que crea RESERVA y actualiza stock_reservado
  - Crear método liberarReserva(producto_id, cantidad) que crea LIBERACION y decrementa stock_reservado
  - Crear método descontarStock(producto_id, cantidad) que crea SALIDA, decrementa stock_actual y libera reserva
  - Implementar operaciones atómicas con transacciones
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 26.1, 26.2, 26.3, 26.4_

- [ ]* 6.2 Escribir tests para InventarioService
  - Tests unitarios para reservarStock
  - Tests unitarios para liberarReserva
  - Tests unitarios para descontarStock
  - Tests de concurrencia
  - _Requirements: 6.3, 26.1_


- [x] 7. Implementar integración con módulo CPE




- [x] 7.1 Crear CPEIntegrationService


  - Crear método generarFacturaDesdepedido(pedido) que prepara datos para CPE
  - Mapear datos de pedido a formato CPE (cliente, items, totales)
  - Validar que no supere 999 items
  - Validar certificado digital vigente
  - Llamar a CPEService existente para generar XML/UBL 2.1, QR, hash, PDF
  - Manejar respuestas de SUNAT (aceptado, observado, rechazado)
  - Registrar estados y reintentos
  - _Requirements: 10.2, 10.3, 10.6, 10.7, 15.3, 15.5, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10_

- [ ]* 7.2 Escribir tests para CPEIntegrationService
  - Tests unitarios para mapeo de datos
  - Tests de validaciones (999 items, certificado)
  - Mockear CPEService
  - _Requirements: 15.3, 19.5_


- [x] 8. Implementar integración con módulo GRE




- [x] 8.1 Crear GREIntegrationService

  - Crear método verificarSugerenciaGRE(pedido, config) que evalúa si sugerir GRE
  - Verificar gre_automatico_habilitado y umbral_gre_automatico
  - Verificar gre_obligatorio
  - Crear método prepararDatosGRE(pedido, factura) que precarga datos (puntos partida/llegada, motivo, transportista, placa, conductor, peso, bultos)
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 22.1, 22.2, 22.3, 22.4, 22.5_

- [ ]* 8.2 Escribir tests para GREIntegrationService
  - Tests unitarios para lógica de sugerencia
  - Tests para diferentes configuraciones de tenant
  - _Requirements: 11.2, 22.1_


- [-] 9. Implementar sistema de notificaciones


- [x] 9.1 Crear NotificationsService para eventos de ventas



  - Crear método emit(evento, datos) genérico
  - Implementar evento 'cotizacion.convertida'
  - Implementar evento 'pedido.confirmado'
  - Implementar evento 'pedido.listo_despacho'
  - Implementar evento 'pedido.listo_facturar'
  - Implementar evento 'stock.bajo'
  - Implementar evento 'factura.emitida'
  - Implementar evento 'gre.generada'
  - Registrar notificaciones en bitácora
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [ ]* 9.2 Escribir tests para NotificationsService
  - Tests unitarios para emisión de eventos
  - Tests de integración con módulos
  - _Requirements: 17.1_


- [x] 10. Implementar sistema de permisos granulares




- [x] 10.1 Definir permisos en PermissionsModule


  - Definir permisos ventas.clientes.ver, crear, editar, eliminar
  - Definir permisos ventas.cotizaciones.ver, crear, convertir_pedido
  - Definir permisos ventas.pedidos.ver, confirmar, cancelar, generar_factura
  - Definir permisos inventario.logistica.ver, preparar, despachar
  - _Requirements: 14.1, 14.3, 14.4, 14.5, 14.6_

- [x] 10.2 Crear guards de permisos


  - Crear PermissionsGuard reutilizable
  - Aplicar guards en todos los endpoints de ClientesController
  - Aplicar guards en todos los endpoints de CotizacionesController
  - Aplicar guards en todos los endpoints de PedidosController
  - Aplicar guards en todos los endpoints de LogisticaController
  - _Requirements: 14.2_

- [ ]* 10.3 Escribir tests para sistema de permisos
  - Tests de acceso denegado sin permisos
  - Tests de acceso permitido con permisos
  - _Requirements: 14.2_


- [x] 11. Implementar auditoría y trazabilidad





- [x] 11.1 Crear AuditService

  - Crear método registrarCambio(entidad, accion, usuario, cambios)
  - Crear tabla audit_log si no existe
  - Implementar interceptor para auditar automáticamente cambios en entidades
  - _Requirements: 27.1, 27.2_


- [x] 11.2 Implementar logging de integraciones

  - Crear método logIntegracion(servicio, request, response, correlacion)
  - Registrar logs de SUNAT/GRE con request/response resumidos
  - Implementar correlación entre movimientos y pedidos
  - _Requirements: 27.3, 27.5_

- [x] 11.3 Crear endpoints de consulta de historial


  - Crear endpoint GET /api/ventas/pedidos/:id/historial
  - Crear endpoint GET /api/ventas/cotizaciones/:id/historial
  - Mostrar timeline de cambios
  - _Requirements: 27.4_

- [ ]* 11.4 Escribir tests para AuditService
  - Tests unitarios para registro de cambios
  - Tests de interceptor
  - _Requirements: 27.1_


- [x] 12. Implementar Frontend - Estructura y navegación






- [x] 12.1 Actualizar Sidebar con módulo Ventas




  - Modificar componente Sidebar para reemplazar "Cotizaciones" por "Ventas"
  - Agregar submenu con: Clientes, Cotizaciones, Pedidos
  - Configurar rutas: /dashboard/ventas/clientes, /dashboard/ventas/cotizaciones, /dashboard/ventas/pedidos
  - Implementar resaltado de opción activa


  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 12.2 Crear layout base para módulo Ventas




  - Crear layout compartido para páginas de ventas
  - Implementar breadcrumbs
  - Configurar estilos consistentes
  - _Requirements: 13.6_

-

- [ ] 13. Implementar Frontend - Módulo de Clientes




- [x] 13.1 Crear página de lista de clientes


  - Crear /dashboard/ventas/clientes/page.tsx
  - Implementar tabla con columnas: RUC/DNI, Nombre, Tipo, Acciones
  - Agregar barra de acciones: Nuevo, Importar, Exportar, Buscar, Filtros
  - Implementar búsqueda en tiempo real
  - Implementar filtros por tipo de cliente
  - Implementar paginación
  - _Requirements: 1.1, 1.7, 24.1, 24.2_

- [x] 13.2 Crear componente ClienteForm


  - Crear formulario con React Hook Form y Zod
  - Agregar campos: tipo, documento_tipo, documento_numero, razon_social, nombre_comercial, direccion, email, telefono
  - Implementar validaciones: RUC 11 dígitos, DNI 8 dígitos
  - Agregar botón "Validar con SUNAT" (opcional)
  - Implementar manejo de errores
  - _Requirements: 1.2, 1.3, 1.4, 19.1, 19.2, 19.3_

- [x] 13.3 Crear página de nuevo cliente


  - Crear /dashboard/ventas/clientes/nuevo/page.tsx
  - Integrar ClienteForm
  - Implementar submit que llama a POST /api/ventas/clientes
  - Redirigir a lista tras crear exitosamente
  - _Requirements: 1.2_

- [x] 13.4 Crear página de detalle de cliente


  - Crear /dashboard/ventas/clientes/[id]/page.tsx
  - Mostrar sección Información General con datos del cliente
  - Mostrar sección Estadísticas (totales, contadores por documento, última compra)
  - Mostrar sección Historial de Transacciones con tabla
  - Agregar enlaces a ver detalle de cada transacción
  - Agregar botón "Editar"
  - _Requirements: 1.6, 24.3, 24.4, 24.5_

- [x] 13.5 Crear componente ClienteSelector


  - Crear selector con búsqueda por RUC, DNI o nombre
  - Implementar búsqueda en tiempo real con debounce
  - Mostrar sugerencias en dropdown
  - Agregar botón "+ Nuevo Cliente (rápido)"
  - _Requirements: 2.1, 2.4, 23.1_

- [x] 13.6 Crear modal ClienteQuickCreate


  - Crear modal con formulario simplificado
  - Campos mínimos: tipo, documento, nombre
  - Opción de validar con SUNAT
  - Al guardar, seleccionar automáticamente en selector
  - _Requirements: 2.2, 2.3, 23.2, 23.3, 23.4, 23.5, 23.6_

-

- [x] 14. Implementar Frontend - Módulo de Cotizaciones



- [x] 14.1 Crear página de lista de cotizaciones


  - Crear /dashboard/ventas/cotizaciones/page.tsx
  - Implementar tabla con columnas: Número, Cliente, Fecha, Vencimiento, Estado, Total, Acciones
  - Agregar filtros por estado
  - Implementar búsqueda
  - Agregar botón "Nueva Cotización"
  - _Requirements: 3.1_

- [x] 14.2 Crear componente CotizacionForm


  - Crear formulario con secciones: Cliente, Productos, Totales
  - Integrar ClienteSelector
  - Implementar selector de productos con cantidades y precios
  - Calcular automáticamente subtotal, IGV (18%), total
  - Agregar campo de notas
  - Agregar campo de fecha de vencimiento
  - _Requirements: 3.2, 15.6_

- [x] 14.3 Crear página de nueva cotización


  - Crear /dashboard/ventas/cotizaciones/nueva/page.tsx
  - Integrar CotizacionForm
  - Implementar submit que llama a POST /api/ventas/cotizaciones
  - Redirigir a detalle tras crear
  - _Requirements: 3.2_

- [x] 14.4 Crear página de detalle/editar cotización


  - Crear /dashboard/ventas/cotizaciones/[id]/page.tsx
  - Mostrar información completa de cotización
  - Si estado es BORRADOR: permitir edición con CotizacionForm
  - Si estado es BORRADOR o ENVIADA: mostrar botón "Convertir a Pedido"
  - Si estado es CONVERTIDA: deshabilitar botón y mostrar enlace al pedido
  - Implementar badges de estado visual
  - _Requirements: 3.4, 3.5, 4.1, 4.6_

- [x] 14.5 Crear componente ConvertirPedidoButton


  - Crear botón con confirmación
  - Llamar a POST /api/ventas/cotizaciones/:id/convertir-pedido
  - Redirigir al pedido creado
  - Mostrar notificación de éxito
  - _Requirements: 4.2, 4.3_



- [x] 15. Implementar Frontend - Módulo de Pedidos






- [x] 15.1 Crear página de lista de pedidos


  - Crear /dashboard/ventas/pedidos/page.tsx
  - Implementar tabla con columnas: Número, Cliente, Fecha, Estado, Total, Acciones
  - Agregar filtros por estado, cliente, rango de fechas
  - Implementar búsqueda
  - Agregar botón "Nuevo Pedido"
  - _Requirements: 5.1_

- [x] 15.2 Crear componente PedidoForm


  - Crear formulario similar a CotizacionForm
  - Integrar ClienteSelector
  - Implementar selector de productos
  - Calcular totales automáticamente
  - _Requirements: 5.2_

- [x] 15.3 Crear página de nuevo pedido


  - Crear /dashboard/ventas/pedidos/nuevo/page.tsx
  - Integrar PedidoForm
  - Implementar submit que llama a POST /api/ventas/pedidos
  - Redirigir a detalle tras crear
  - _Requirements: 5.2_

- [x] 15.4 Crear página de detalle de pedido con lógica dinámica


  - Crear /dashboard/ventas/pedidos/[id]/page.tsx
  - Mostrar información completa del pedido
  - Implementar lógica condicional según estado y configuración de tenant
  - Mostrar timeline de estados
  - _Requirements: 5.3, 20.1, 20.2, 20.3, 20.4_

- [x] 15.5 Implementar botones dinámicos según estado (Flujo Simple)

  - Si usar_flujo_logistica=false AND estado=PENDIENTE: mostrar "Confirmar Pedido"
  - Si usar_flujo_logistica=false AND estado=CONFIRMADO: mostrar "Generar Factura" y "Cancelar Pedido"
  - Si usar_flujo_logistica=false AND estado=CONFIRMADO: mostrar "Stock: RESERVADO"
  - _Requirements: 5.4, 8.1, 20.1, 20.2_

- [x] 15.6 Implementar botones dinámicos según estado (Flujo Completo)

  - Si usar_flujo_logistica=true AND estado=CONFIRMADO: mostrar "Ver en Inventario" y "Cancelar Pedido"
  - Si usar_flujo_logistica=true AND estado=CONFIRMADO: mostrar leyenda "Esperando preparación en almacén"
  - Si estado=LISTO_FACTURAR: mostrar "Generar Factura"
  - _Requirements: 9.1, 20.3, 20.4_

- [x] 15.7 Crear componente ConfirmarPedidoButton


  - Crear botón con confirmación
  - Llamar a POST /api/ventas/pedidos/:id/confirmar
  - Manejar respuesta con warnings de stock
  - Si hay warnings, mostrar modal con detalles y opción de continuar
  - Actualizar vista tras confirmar
  - _Requirements: 5.5, 5.6_

- [x] 15.8 Crear componente CancelarPedidoButton


  - Crear botón con confirmación y campo de motivo
  - Llamar a POST /api/ventas/pedidos/:id/cancelar
  - Actualizar vista tras cancelar
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 15.9 Crear componente GenerarFacturaButton


  - Crear botón con confirmación
  - Llamar a POST /api/ventas/pedidos/:id/generar-factura
  - Manejar respuesta con sugerencia de GRE
  - Si sugerir_gre=true, mostrar modal de sugerencia GRE
  - _Requirements: 10.1, 11.2, 11.3_

- [x] 15.10 Crear modal de sugerencia GRE


  - Mostrar tarjeta recordatoria según configuración
  - Si gre_automatico_habilitado=true: mostrar "[Sí, generar GRE]" y "[No, omitir]"
  - Si gre_automatico_habilitado=false: mostrar "[Generar GRE]" y "[Finalizar]"
  - Redirigir a módulo GRE si acepta
  - _Requirements: 11.2, 11.3, 11.4, 22.1, 22.2, 22.3_

- [x] 15.11 Crear componente StockWarning


  - Mostrar alerta clara cuando hay stock insuficiente
  - Listar productos con stock disponible vs solicitado
  - Permitir continuar de todas formas
  - _Requirements: 5.6_

- [x] 15.12 Crear componente FlujoPedidoTimeline


  - Mostrar timeline visual del flujo según configuración
  - Resaltar estado actual
  - Mostrar estados futuros según usar_flujo_logistica
  - _Requirements: 5.3_


- [x] 16. Implementar Frontend - Módulo de Logística (solo si usar_flujo_logistica=true)




- [x] 16.1 Crear página de órdenes pendientes de preparación


  - Crear /dashboard/inventario/logistica/ordenes-pendientes/page.tsx
  - Mostrar bandeja con columnas: N° Pedido, Cliente, Cantidad de ítems, Acción
  - Agregar botón "Preparar" por cada pedido
  - Ocultar completamente si usar_flujo_logistica=false
  - _Requirements: 9.2, 20.5, 20.6, 21.1, 21.2_

- [x] 16.2 Crear modal de preparación de pedido


  - Mostrar lista de ítems con checkbox por línea
  - Mostrar Producto x Cantidad por cada ítem
  - Agregar botones "Marcar como Listo" y "Cancelar"
  - _Requirements: 21.3, 21.4_

- [x] 16.3 Crear página de órdenes listas para despacho


  - Crear /dashboard/inventario/logistica/listo-despacho/page.tsx
  - Mostrar pedidos en estado LISTO_DESPACHO
  - Agregar botón "Confirmar Despacho" por cada pedido
  - _Requirements: 21.7_

- [x] 16.4 Crear componente ConfirmarDespachoButton


  - Crear botón con confirmación
  - Llamar a POST /api/inventario/logistica/:pedidoId/confirmar-despacho
  - Mostrar notificación de éxito
  - _Requirements: 21.8_


- [x] 17. Implementar componentes compartidos





- [x] 17.1 Crear componente ClienteCard


  - Mostrar información resumida de cliente
  - Usar en detalles de cotizaciones y pedidos
  - _Requirements: 3.4, 5.3_

- [x] 17.2 Crear componente ProductoLineItem


  - Mostrar ítem de producto en lista
  - Incluir descripción, cantidad, precio unitario, subtotal
  - _Requirements: 3.2, 5.2_

- [x] 17.3 Crear componente TotalesCard


  - Mostrar card con subtotal, IGV, total
  - Calcular automáticamente
  - _Requirements: 3.2, 5.2_

- [x] 17.4 Crear componente EstadoTimeline


  - Mostrar timeline de cambios de estado
  - Incluir fecha, usuario, estado anterior/nuevo
  - _Requirements: 27.4_

- [x] 17.5 Crear componente HistorialTransacciones


  - Mostrar tabla de historial
  - Incluir enlaces a ver detalle
  - _Requirements: 1.6, 24.5_

- [x] 17.6 Crear badges de estado


  - Crear CotizacionEstadoBadge con colores por estado
  - Crear PedidoEstadoBadge con colores por estado
  - _Requirements: 3.1, 5.1_


- [x] 18. Implementar configuración de empresa




- [x] 18.1 Agregar campos de configuración en asistente inicial


  - Modificar asistente de creación de empresa
  - Agregar pregunta de tipo_empresa (MICRO/PEQUEÑA/MEDIANA/GRANDE)
  - Precargar usar_flujo_logistica según tipo seleccionado
  - Agregar campos gre_obligatorio, gre_automatico_habilitado, umbral_gre_automatico
  - _Requirements: 7.1, 7.2, 7.3, 25.1, 25.2, 25.3_



- [x] 18.2 Crear página de configuración de ventas





  - Crear /dashboard/configuracion/ventas/page.tsx
  - Permitir editar usar_flujo_logistica manualmente
  - Permitir editar configuración de GRE


  - Mostrar advertencia al cambiar usar_flujo_logistica
  - _Requirements: 7.4, 25.4, 25.5_



- [x] 18.3 Implementar hook useEmpresaConfig



  - Crear hook para obtener configuración del tenant actual
  - Cachear configuración en contexto
  - Usar en componentes que necesitan lógica condicional
  - _Requirements: 7.5, 7.6, 20.1, 20.3_


- [x] 19. Implementar validaciones y reglas de negocio en Frontend








- [x] 19.1 Crear validaciones de formularios con Zod


  - Crear schema de validación para Cliente (RUC 11 dígitos, DNI 8 dígitos)
  - Crear schema de validación para Cotización
  - Crear schema de validación para Pedido
  - Validar que precio > 0
  - Validar que cantidad > 0
  - _Requirements: 15.1, 15.2, 19.1, 19.2_

- [x] 19.2 Implementar validación de límite de ítems


  - Validar que no se superen 999 ítems en cotización/pedido
  - Mostrar mensaje claro si se alcanza el límite
  - _Requirements: 15.3, 19.5_

- [x] 19.3 Implementar validación de boleta sin RUC


  - Si tipo de documento es Boleta AND cliente sin RUC AND total > 700
  - Mostrar alerta y requerir GRE
  - _Requirements: 15.4, 19.4_

- [x] 19.4 Implementar validación de certificado digital


  - Antes de generar factura, verificar certificado vigente
  - Mostrar mensaje claro si está ausente o vencido
  - _Requirements: 15.5, 19.6, 19.7_





- [x] 20. Implementar reportes y estadísticas

- [x] 20.1 Crear página de reportes de ventas


  - Crear /dashboard/ventas/reportes/page.tsx
  - Implementar filtros por rango de fechas, vendedor, cliente, estado
  - _Requirements: 16.1, 16.7_

- [x] 20.2 Implementar reporte de ventas por cliente


  - Mostrar tabla con cliente, periodo, moneda, estado, total
  - Permitir exportar a CSV/Excel
  - _Requirements: 16.1_

- [x] 20.3 Implementar reporte de cotizaciones pendientes


  - Mostrar cotizaciones en estado ENVIADA o BORRADOR
  - Incluir vigencia y probabilidad si aplica
  - _Requirements: 16.2_

- [x] 20.4 Implementar dashboard de pedidos por estado


  - Crear tablero visual con contadores por estado
  - Mostrar gráfico de distribución
  - _Requirements: 16.3_

- [x] 20.5 Implementar reporte de productos más vendidos


  - Mostrar tabla con producto, unidades vendidas, importe total
  - Permitir ordenar por unidades o importe
  - _Requirements: 16.4_

- [x] 20.6 Implementar reporte de top clientes


  - Mostrar clientes con mayor facturación
  - Incluir gráfico de barras
  - _Requirements: 16.5_

- [x] 20.7 Implementar métrica de lead time comercial


  - Calcular tiempo promedio desde cotización hasta factura
  - Mostrar en dashboard
  - _Requirements: 16.6_


- [ ] 21. Implementar características avanzadas opcionales
- [ ] 21.1 Implementar soporte multi-almacén (opcional)
  - Agregar campo almacen_id en pedidos si hay múltiples almacenes
  - Asociar reservas y salidas a almacén específico
  - Mostrar stock por almacén en consultas
  - _Requirements: 28.1, 28.2, 28.3, 28.4_

- [ ] 21.2 Implementar listas de precio y descuentos (opcional)
  - Agregar campo lista_precio_id en clientes
  - Cargar precios según lista al seleccionar cliente
  - Permitir aplicar descuentos en línea de producto
  - Recalcular totales automáticamente
  - _Requirements: 29.1, 29.2, 29.3, 29.4_

- [ ] 21.3 Implementar soporte multi-moneda (opcional)
  - Agregar campo moneda en cotizaciones y pedidos
  - Registrar tipo de cambio del día
  - Calcular totales con tipo de cambio
  - Incluir moneda en CPE
  - _Requirements: 30.1, 30.2, 30.3, 30.4_

- [ ] 21.4 Implementar gestión de series y numeraciones
  - Crear tabla series_documentos si no existe
  - Implementar lógica de selección automática de serie
  - Prevenir saltos de numeración
  - Registrar anulaciones con motivo
  - _Requirements: 31.1, 31.2, 31.3, 31.4_

- [ ] 21.5 Preparar enlaces para notas de crédito/débito
  - Agregar botones "Generar Nota de Crédito" y "Generar Nota de Débito" en detalle de factura
  - Mostrar mensaje "Próximamente" si módulo no está implementado
  - _Requirements: 32.1, 32.2, 32.3, 32.4_


- [ ] 22. Implementar migraciones y datos iniciales
- [ ] 22.1 Crear seeds de datos iniciales
  - Crear archivo `/supabase/seed_ventas_inicial.sql` con:
    - Series de CPE por defecto
    - Numeraciones iniciales para cotizaciones y pedidos
    - Impuestos (IGV 18% por defecto)
    - Umbral GRE (700 por defecto)
    - Tipos de traslado GRE
  - _Requirements: 15.6_

- [ ] 22.2 Crear script de backfill para datos existentes
  - Crear archivo `/supabase/backfill_stock_reservado.sql` que:
    - Inicializa stock_reservado a 0 para todos los productos
    - Recalcula reservas de pedidos confirmados existentes
    - Verifica integridad de datos
  - _Requirements: 6.2_

- [ ] 22.3 Crear documentación de migraciones
  - Crear archivo `/supabase/README_MIGRACIONES_VENTAS.md` que documente:
    - Orden de ejecución de migraciones
    - Cambios en esquema de base de datos
    - Proceso de backfill
    - Guía de rollback si es necesario
  - _Requirements: 18.1_


- [ ] 23. Testing end-to-end y validación
- [ ] 23.1 Crear tests E2E para flujo simple
  - Test: Crear cotización → Convertir a pedido → Confirmar → Generar factura
  - Verificar que stock se descuenta correctamente en facturación
  - Verificar que reservas se liberan correctamente
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 23.2 Crear tests E2E para flujo completo
  - Test: Crear cotización → Convertir a pedido → Confirmar → Preparar → Despachar → Generar factura
  - Verificar que stock se descuenta en despacho
  - Verificar que pedido llega a LISTO_FACTURAR después de despacho
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [ ] 23.3 Crear tests E2E para cancelación de pedidos
  - Test: Confirmar pedido → Cancelar → Verificar liberación de reservas
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 23.4 Crear tests E2E para sugerencia de GRE
  - Test: Generar factura con monto > umbral → Verificar sugerencia de GRE
  - Test: Generar factura con monto < umbral → No sugerir GRE
  - _Requirements: 11.1, 11.2, 11.3_

- [ ] 23.5 Validar criterios de aceptación
  - Verificar que empresa con usar_flujo_logistica=false puede facturar sin logística
  - Verificar que empresa con usar_flujo_logistica=true requiere preparación y despacho
  - Verificar alertas de stock insuficiente
  - Verificar sugerencias de GRE según configuración
  - Verificar auditoría completa de operaciones
  - Verificar que reportes muestran datos consistentes
  - Verificar que Sidebar muestra "Ventas" con submódulos
  - Verificar validaciones SUNAT (RUC, DNI, 999 ítems, tope boleta)
  - _Requirements: Todos los criterios de aceptación_


- [ ] 24. Documentación y entrega
- [ ] 24.1 Crear documentación técnica
  - Documentar arquitectura del módulo
  - Documentar endpoints de API
  - Documentar modelos de datos
  - Documentar flujos de negocio
  - _Requirements: 18.1, 18.2, 18.3_

- [ ] 24.2 Crear documentación de usuario
  - Crear guía de uso del módulo de Ventas
  - Documentar flujo simple vs flujo completo
  - Documentar configuración de empresa
  - Crear guía de reportes
  - _Requirements: 7.1, 7.2, 8.1, 9.1_

- [ ] 24.3 Crear guía de migración
  - Documentar proceso de migración desde sistema anterior
  - Documentar importación de clientes
  - Documentar configuración inicial
  - _Requirements: 24.6_

- [ ] 24.4 Realizar revisión final
  - Verificar que todos los requirements están implementados
  - Verificar que no hay código duplicado
  - Verificar que el código sigue estándares del proyecto
  - Verificar que todos los tests pasan
  - _Requirements: Todos_

## Notes

- Las tareas marcadas con * son opcionales (principalmente tests unitarios)
- El orden de las tareas está diseñado para construir incrementalmente
- Cada tarea debe completarse antes de pasar a la siguiente
- Las integraciones con módulos existentes (CPE, GRE, Inventario) asumen que esos módulos ya están implementados
- La implementación debe respetar el lenguaje de interfaz en español de Perú (terminología SUNAT)
- Todos los nombres de entidades, campos y endpoints deben seguir las convenciones definidas en el diseño
