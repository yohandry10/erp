# Requirements Document

## Introduction

Este documento define los requerimientos para el MÓDULO VENTAS completo del sistema ERP, que agrupa: Clientes, Cotizaciones, Pedidos, Facturación (CPE) y GRE. El módulo permitirá gestionar todo el ciclo de ventas end-to-end desde la cotización hasta la facturación y guía de remisión, con flujos que se bifurcan dinámicamente según la configuración del tenant.

El flujo operativo se adapta al tipo de empresa:
- **Flujo Simple** (usar_flujo_logistica = false): Para micro/pequeñas empresas, va directo de pedido confirmado a facturación sin pasar por logística.
- **Flujo Completo** (usar_flujo_logistica = true): Para medianas/grandes empresas, incluye etapas de preparación y despacho en el módulo de Inventario.

El módulo reemplazará la entrada actual "Cotizaciones" en el sidebar por un módulo completo "Ventas" con submódulos para Clientes, Cotizaciones y Pedidos. Todo el comportamiento, pantallas y botones cambian dinámicamente según la configuración de usar_flujo_logistica y las reglas de GRE por tenant.

**Lenguaje de interfaz:** Español de Perú (terminología SUNAT).

## Requirements

### Requirement 1: Gestión de Clientes

**User Story:** Como usuario del sistema, quiero gestionar una base de datos completa de clientes con validación SUNAT, para mantener información actualizada y correcta de mis clientes.

#### Acceptance Criteria

1. WHEN el usuario accede a /dashboard/ventas/clientes THEN el sistema SHALL mostrar una lista de todos los clientes con búsqueda y filtros
2. WHEN el usuario hace clic en "Nuevo Cliente" THEN el sistema SHALL mostrar un formulario con campos para RUC/DNI, razón social, dirección, email y teléfono
3. WHEN el usuario ingresa un RUC de 11 dígitos THEN el sistema SHALL validar el formato y opcionalmente consultar con API SUNAT
4. WHEN el usuario ingresa un DNI THEN el sistema SHALL validar que tenga exactamente 8 dígitos
5. WHEN el usuario guarda un cliente THEN el sistema SHALL almacenar la información en la tabla clientes asociada al tenant
6. WHEN el usuario visualiza el detalle de un cliente THEN el sistema SHALL mostrar información general, estadísticas de compras, y historial de transacciones
7. WHEN el usuario busca un cliente THEN el sistema SHALL permitir búsqueda por RUC, DNI, nombre o razón social
8. WHEN el usuario edita un cliente THEN el sistema SHALL actualizar la información manteniendo el historial de transacciones

### Requirement 2: Creación Rápida de Clientes desde Cotización/Pedido

**User Story:** Como vendedor, quiero poder crear un cliente nuevo rápidamente mientras estoy generando una cotización o pedido, para no interrumpir mi flujo de trabajo.

#### Acceptance Criteria

1. WHEN el usuario está creando una cotización o pedido THEN el sistema SHALL mostrar un selector de cliente con búsqueda y botón "+ Nuevo"
2. WHEN el usuario hace clic en "+ Nuevo" THEN el sistema SHALL abrir un modal con formulario simplificado de cliente
3. WHEN el usuario completa el formulario rápido THEN el sistema SHALL guardar el cliente y seleccionarlo automáticamente
4. WHEN el usuario busca en el selector de cliente THEN el sistema SHALL mostrar sugerencias en tiempo real por RUC, DNI o nombre
5. IF el cliente ya existe THEN el sistema SHALL prevenir duplicados y sugerir el cliente existente

### Requirement 3: Gestión de Cotizaciones

**User Story:** Como vendedor, quiero crear y gestionar cotizaciones con múltiples productos, para enviar propuestas de venta a mis clientes.

#### Acceptance Criteria

1. WHEN el usuario accede a /dashboard/ventas/cotizaciones THEN el sistema SHALL mostrar lista de cotizaciones con estados
2. WHEN el usuario crea una nueva cotización THEN el sistema SHALL permitir seleccionar cliente y agregar productos con cantidades y precios
3. WHEN el usuario guarda una cotización THEN el sistema SHALL almacenarla con estado BORRADOR
4. WHEN el usuario visualiza una cotización THEN el sistema SHALL mostrar detalle completo con cliente, productos, subtotales, IGV y total
5. WHEN una cotización está en estado BORRADOR THEN el sistema SHALL permitir edición completa
6. WHEN el usuario marca una cotización como ENVIADA THEN el sistema SHALL cambiar el estado y registrar la fecha
7. WHEN una cotización supera su fecha de validez THEN el sistema SHALL cambiarla automáticamente a estado VENCIDA

### Requirement 4: Conversión de Cotización a Pedido

**User Story:** Como vendedor, quiero convertir una cotización aprobada en un pedido de venta con un solo clic, para agilizar el proceso de ventas.

#### Acceptance Criteria

1. WHEN el usuario visualiza una cotización en estado BORRADOR o ENVIADA THEN el sistema SHALL mostrar botón "Convertir a Pedido"
2. WHEN el usuario hace clic en "Convertir a Pedido" THEN el sistema SHALL crear un nuevo pedido con los mismos datos de la cotización
3. WHEN se crea el pedido desde cotización THEN el sistema SHALL cambiar el estado de la cotización a CONVERTIDA
4. WHEN se crea el pedido THEN el sistema SHALL asignar un número de pedido único (formato: PV-YYYY-NNN)
5. WHEN se crea el pedido THEN el sistema SHALL establecer el estado inicial como PENDIENTE
6. IF la cotización ya fue convertida THEN el sistema SHALL deshabilitar el botón "Convertir a Pedido"

### Requirement 5: Gestión de Pedidos de Venta

**User Story:** Como vendedor, quiero gestionar pedidos de venta con control de estados y reserva de inventario, para asegurar la disponibilidad de productos.

#### Acceptance Criteria

1. WHEN el usuario accede a /dashboard/ventas/pedidos THEN el sistema SHALL mostrar lista de pedidos con filtros por estado
2. WHEN el usuario crea un pedido directo THEN el sistema SHALL permitir seleccionar cliente y productos sin cotización previa
3. WHEN el usuario visualiza un pedido THEN el sistema SHALL mostrar estado actual, cliente, productos, totales y acciones disponibles
4. WHEN un pedido está en estado PENDIENTE THEN el sistema SHALL mostrar botón "Confirmar Pedido"
5. WHEN el usuario confirma un pedido THEN el sistema SHALL verificar disponibilidad de stock para todos los productos
6. IF hay stock insuficiente THEN el sistema SHALL mostrar alerta pero permitir continuar
7. WHEN se confirma un pedido con stock disponible THEN el sistema SHALL cambiar estado a CONFIRMADO

### Requirement 6: Reserva Automática de Inventario

**User Story:** Como administrador de inventario, quiero que el sistema reserve automáticamente el stock cuando se confirma un pedido, para evitar sobreventa de productos.

#### Acceptance Criteria

1. WHEN un pedido cambia a estado CONFIRMADO THEN el sistema SHALL crear movimiento de inventario tipo RESERVA
2. WHEN se crea la reserva THEN el sistema SHALL actualizar el campo stock_reservado en la tabla productos
3. WHEN se calcula stock disponible THEN el sistema SHALL usar la fórmula: stock_actual - stock_reservado
4. WHEN se cancela un pedido confirmado THEN el sistema SHALL crear movimiento tipo LIBERACION
5. WHEN se libera una reserva THEN el sistema SHALL decrementar el stock_reservado
6. WHEN se consulta disponibilidad THEN el sistema SHALL considerar solo el stock no reservado

### Requirement 7: Configuración de Flujo por Tipo de Empresa

**User Story:** Como administrador del tenant, quiero configurar si mi empresa usa flujo logístico completo o simplificado, para adaptar el sistema a mis procesos de negocio.

#### Acceptance Criteria

1. WHEN se crea un nuevo tenant THEN el sistema SHALL solicitar configuración de tipo_empresa (MICRO, PEQUEÑA, MEDIANA, GRANDE)
2. WHEN se selecciona MICRO o PEQUEÑA THEN el sistema SHALL establecer usar_flujo_logistica = false por defecto
3. WHEN se selecciona MEDIANA o GRANDE THEN el sistema SHALL establecer usar_flujo_logistica = true por defecto
4. WHEN el administrador accede a configuración THEN el sistema SHALL permitir cambiar usar_flujo_logistica manualmente
5. WHEN usar_flujo_logistica = false THEN el sistema SHALL ocultar módulos de preparación y despacho
6. WHEN usar_flujo_logistica = true THEN el sistema SHALL mostrar sección de Logística en Inventario

### Requirement 8: Flujo Simplificado (Microempresas)

**User Story:** Como microempresario, quiero un flujo de ventas simplificado que vaya directo de pedido confirmado a facturación, para reducir pasos innecesarios.

#### Acceptance Criteria

1. WHEN usar_flujo_logistica = false AND pedido está CONFIRMADO THEN el sistema SHALL cambiar automáticamente a estado LISTO_FACTURAR
2. WHEN el pedido está LISTO_FACTURAR THEN el sistema SHALL mostrar botón "Generar Factura"
3. WHEN se genera factura en flujo simplificado THEN el sistema SHALL descontar el stock en ese momento
4. WHEN se descuenta stock THEN el sistema SHALL crear movimiento tipo SALIDA
5. WHEN se descuenta stock THEN el sistema SHALL decrementar stock_actual y liberar stock_reservado
6. WHEN la factura se emite exitosamente THEN el sistema SHALL cambiar pedido a estado FACTURADO

### Requirement 9: Flujo Completo con Logística (Empresas Medianas/Grandes)

**User Story:** Como gerente de operaciones, quiero un flujo completo con etapas de preparación y despacho, para controlar mejor el proceso logístico.

#### Acceptance Criteria

1. WHEN usar_flujo_logistica = true AND pedido está CONFIRMADO THEN el sistema SHALL mantener estado CONFIRMADO y mostrar mensaje "Esperando preparación en almacén"
2. WHEN el pedido está CONFIRMADO THEN el sistema SHALL aparecer en /dashboard/inventario/logistica/ordenes-pendientes
3. WHEN personal de almacén accede a órdenes pendientes THEN el sistema SHALL mostrar lista de pedidos con botón "Preparar"
4. WHEN se hace clic en "Preparar" THEN el sistema SHALL mostrar checklist de productos del pedido
5. WHEN se marca como listo THEN el sistema SHALL cambiar pedido a estado EN_PREPARACION
6. WHEN se confirma preparación completa THEN el sistema SHALL cambiar a estado LISTO_DESPACHO
7. WHEN se confirma despacho THEN el sistema SHALL descontar stock, liberar reserva y cambiar a LISTO_FACTURAR

### Requirement 10: Generación de Factura desde Pedido

**User Story:** Como vendedor, quiero generar facturas electrónicas directamente desde pedidos confirmados, para cumplir con obligaciones tributarias.

#### Acceptance Criteria

1. WHEN un pedido está en estado LISTO_FACTURAR THEN el sistema SHALL mostrar botón "Generar Factura"
2. WHEN se hace clic en "Generar Factura" THEN el sistema SHALL tomar datos del pedido (cliente, productos, totales)
3. WHEN se genera la factura THEN el sistema SHALL usar las series configuradas en empresa_config
4. WHEN se genera la factura THEN el sistema SHALL crear documento en módulo CPE
5. WHEN la factura se emite exitosamente THEN el sistema SHALL cambiar pedido a estado FACTURADO
6. WHEN la factura se emite THEN el sistema SHALL enviar XML a SUNAT
7. IF el envío a SUNAT falla THEN el sistema SHALL mantener la factura en estado pendiente de envío

### Requirement 11: Sugerencia Automática de GRE

**User Story:** Como usuario, quiero que el sistema me sugiera generar Guía de Remisión cuando corresponda, para cumplir con regulaciones de transporte.

#### Acceptance Criteria

1. WHEN se emite una factura exitosamente THEN el sistema SHALL verificar configuración gre_automatico_habilitado
2. WHEN gre_automatico_habilitado = true AND monto > umbral_gre_automatico THEN el sistema SHALL mostrar modal sugiriendo generar GRE
3. WHEN se muestra la sugerencia THEN el sistema SHALL mostrar botones "Sí, generar GRE" y "No, omitir"
4. WHEN gre_automatico_habilitado = false THEN el sistema SHALL mostrar botón opcional "Generar GRE"
5. WHEN el usuario acepta generar GRE THEN el sistema SHALL redirigir al módulo GRE con datos precargados
6. WHEN se genera GRE THEN el sistema SHALL cambiar pedido a estado COMPLETADO_CON_GRE
7. WHEN se omite GRE THEN el sistema SHALL cambiar pedido a estado COMPLETADO

### Requirement 12: Cancelación de Pedidos

**User Story:** Como vendedor, quiero poder cancelar pedidos antes de facturar, para manejar cambios o cancelaciones de clientes.

#### Acceptance Criteria

1. WHEN un pedido está en estado PENDIENTE, CONFIRMADO, EN_PREPARACION o LISTO_DESPACHO THEN el sistema SHALL mostrar botón "Cancelar Pedido"
2. WHEN se hace clic en "Cancelar Pedido" THEN el sistema SHALL solicitar confirmación
3. WHEN se confirma cancelación THEN el sistema SHALL cambiar estado a CANCELADO
4. WHEN se cancela un pedido CONFIRMADO THEN el sistema SHALL liberar automáticamente las reservas de stock
5. WHEN se cancela un pedido THEN el sistema SHALL registrar fecha y usuario que canceló
6. IF el pedido ya está FACTURADO THEN el sistema SHALL deshabilitar opción de cancelar

### Requirement 13: Navegación y Estructura del Módulo

**User Story:** Como usuario, quiero acceder fácilmente a todas las funciones del módulo de ventas desde el sidebar, para navegar eficientemente.

#### Acceptance Criteria

1. WHEN el usuario visualiza el sidebar THEN el sistema SHALL mostrar "Ventas" en lugar de "Cotizaciones"
2. WHEN el usuario hace clic en "Ventas" THEN el sistema SHALL expandir submenu con: Clientes, Cotizaciones, Pedidos
3. WHEN el usuario hace clic en "Clientes" THEN el sistema SHALL navegar a /dashboard/ventas/clientes
4. WHEN el usuario hace clic en "Cotizaciones" THEN el sistema SHALL navegar a /dashboard/ventas/cotizaciones
5. WHEN el usuario hace clic en "Pedidos" THEN el sistema SHALL navegar a /dashboard/ventas/pedidos
6. WHEN el usuario está en cualquier página de ventas THEN el sistema SHALL resaltar la opción activa en el sidebar

### Requirement 14: Permisos y Control de Acceso

**User Story:** Como administrador, quiero controlar qué usuarios pueden realizar cada acción en el módulo de ventas, para mantener seguridad y separación de responsabilidades.

#### Acceptance Criteria

1. WHEN se define un rol THEN el sistema SHALL permitir asignar permisos granulares: ventas.clientes.*, ventas.cotizaciones.*, ventas.pedidos.*
2. WHEN un usuario sin permiso intenta acceder THEN el sistema SHALL mostrar mensaje de acceso denegado
3. WHEN un usuario tiene permiso ventas.cotizaciones.convertir_pedido THEN el sistema SHALL mostrar botón "Convertir a Pedido"
4. WHEN un usuario tiene permiso ventas.pedidos.confirmar THEN el sistema SHALL mostrar botón "Confirmar Pedido"
5. WHEN un usuario tiene permiso ventas.pedidos.generar_factura THEN el sistema SHALL mostrar botón "Generar Factura"
6. WHEN un usuario tiene permiso inventario.logistica.* THEN el sistema SHALL mostrar sección de Logística

### Requirement 15: Validaciones de Negocio

**User Story:** Como usuario del sistema, quiero que se validen automáticamente las reglas de negocio, para evitar errores y cumplir con regulaciones.

#### Acceptance Criteria

1. WHEN se agrega un producto a cotización/pedido THEN el sistema SHALL validar que el precio sea mayor a cero
2. WHEN se confirma un pedido THEN el sistema SHALL validar que tenga al menos un producto
3. WHEN se genera una factura THEN el sistema SHALL validar que no supere 999 items
4. WHEN se genera una boleta sin RUC AND monto > 700 THEN el sistema SHALL requerir generación de GRE
5. WHEN se intenta facturar THEN el sistema SHALL validar que el certificado digital esté vigente
6. WHEN se calcula total THEN el sistema SHALL aplicar correctamente IGV (18%)
7. WHEN se guarda un cliente THEN el sistema SHALL validar que no exista otro con el mismo RUC/DNI

### Requirement 16: Reportes y Estadísticas

**User Story:** Como gerente, quiero visualizar reportes y estadísticas de ventas, para tomar decisiones informadas.

#### Acceptance Criteria

1. WHEN el usuario accede al detalle de un cliente THEN el sistema SHALL mostrar total de compras, cantidad de cotizaciones, pedidos y facturas
2. WHEN el usuario visualiza lista de pedidos THEN el sistema SHALL permitir filtrar por estado, cliente y rango de fechas
3. WHEN el usuario visualiza dashboard de ventas THEN el sistema SHALL mostrar productos más vendidos
4. WHEN el usuario visualiza dashboard de ventas THEN el sistema SHALL mostrar clientes con mayor facturación
5. WHEN el usuario visualiza estadísticas THEN el sistema SHALL calcular tiempo promedio desde cotización hasta factura

### Requirement 17: Notificaciones del Sistema

**User Story:** Como usuario, quiero recibir notificaciones de eventos importantes en el flujo de ventas, para estar informado de cambios de estado.

#### Acceptance Criteria

1. WHEN una cotización se convierte a pedido THEN el sistema SHALL notificar al vendedor
2. WHEN un pedido se confirma THEN el sistema SHALL notificar al área de inventario/logística
3. WHEN un pedido está listo para despacho THEN el sistema SHALL notificar al vendedor
4. WHEN el stock está bajo al reservar THEN el sistema SHALL notificar al administrador de inventario
5. WHEN una factura se emite exitosamente THEN el sistema SHALL notificar al vendedor y al cliente
6. WHEN se genera una GRE THEN el sistema SHALL notificar al transportista configurado

### Requirement 18: Integración con Módulos Existentes

**User Story:** Como usuario del sistema, quiero que el módulo de ventas se integre correctamente con inventario y CPE, para mantener consistencia de datos.

#### Acceptance Criteria

1. WHEN se confirma un pedido THEN el sistema SHALL actualizar stock_reservado en módulo de inventario
2. WHEN se genera una factura THEN el sistema SHALL crear documento en módulo CPE con todos los datos necesarios
3. WHEN se descuenta stock THEN el sistema SHALL crear movimiento en tabla movimientos_inventario
4. WHEN se consulta disponibilidad THEN el sistema SHALL leer datos actualizados de la tabla productos
5. WHEN se genera GRE THEN el sistema SHALL vincular con la factura correspondiente
6. WHEN se cancela un pedido THEN el sistema SHALL revertir movimientos de inventario

### Requirement 19: Validaciones SUNAT y Reglas Fiscales

**User Story:** Como usuario del sistema, quiero que se validen automáticamente las reglas fiscales de SUNAT, para cumplir con las regulaciones peruanas.

#### Acceptance Criteria

1. WHEN se ingresa un RUC THEN el sistema SHALL validar que tenga exactamente 11 dígitos
2. WHEN se ingresa un DNI THEN el sistema SHALL validar que tenga exactamente 8 dígitos
3. WHEN se valida con SUNAT THEN el sistema SHALL consumir servicio de consulta RUC de manera opcional
4. WHEN se genera una boleta sin RUC AND monto > S/ 700 THEN el sistema SHALL exigir GRE o alertar según política
5. WHEN se genera un CPE THEN el sistema SHALL validar que no supere 999 ítems
6. WHEN se intenta facturar THEN el sistema SHALL validar que el certificado digital esté vigente y accesible
7. WHEN el certificado está ausente o vencido THEN el sistema SHALL mostrar mensaje claro al usuario
8. WHEN se genera CPE THEN el sistema SHALL generar XML/UBL 2.1, QR, hash y PDF
9. WHEN se envía a SUNAT THEN el sistema SHALL registrar estados: aceptado, observado, rechazado
10. WHEN hay error de envío THEN el sistema SHALL manejar reintentos y contingencias

### Requirement 20: Comportamiento Dinámico por Configuración de Empresa

**User Story:** Como usuario, quiero que la interfaz y los flujos se adapten automáticamente al tipo de empresa configurado, para tener una experiencia optimizada.

#### Acceptance Criteria

1. WHEN usar_flujo_logistica = false AND pedido está CONFIRMADO THEN el sistema SHALL mostrar botones "Generar Factura" y "Cancelar Pedido"
2. WHEN usar_flujo_logistica = false AND pedido está CONFIRMADO THEN el sistema SHALL mostrar estado "CONFIRMADO" y "Stock: RESERVADO"
3. WHEN usar_flujo_logistica = true AND pedido está CONFIRMADO THEN el sistema SHALL mostrar botones "Ver en Inventario" y "Cancelar Pedido"
4. WHEN usar_flujo_logistica = true AND pedido está CONFIRMADO THEN el sistema SHALL mostrar leyenda "Esperando preparación en almacén"
5. WHEN usar_flujo_logistica = true THEN el sistema SHALL mostrar sección "Logística" en módulo Inventario
6. WHEN usar_flujo_logistica = false THEN el sistema SHALL ocultar completamente las pantallas de logística

### Requirement 21: Pantallas de Logística en Inventario

**User Story:** Como personal de almacén, quiero gestionar órdenes de preparación y despacho desde el módulo de Inventario, para controlar el proceso logístico.

#### Acceptance Criteria

1. WHEN accedo a /dashboard/inventario/logistica/ordenes-pendientes THEN el sistema SHALL mostrar bandeja con pedidos confirmados
2. WHEN visualizo la bandeja THEN el sistema SHALL mostrar columnas: N° Pedido, Cliente, Cantidad de ítems, Acción [Preparar]
3. WHEN presiono "Preparar" THEN el sistema SHALL mostrar lista de ítems con checkbox por línea (Producto x Cantidad)
4. WHEN marco productos como preparados THEN el sistema SHALL permitir botones "Marcar como Listo" y "Cancelar"
5. WHEN confirmo preparación THEN el sistema SHALL cambiar pedido a estado EN_PREPARACION
6. WHEN el pedido está EN_PREPARACION completo THEN el sistema SHALL cambiar a LISTO_DESPACHO
7. WHEN el pedido está LISTO_DESPACHO THEN el sistema SHALL mostrar botón "Confirmar Despacho"
8. WHEN confirmo despacho THEN el sistema SHALL descontar stock real, liberar reserva y notificar a Ventas

### Requirement 22: Sugerencias de GRE Contextuales

**User Story:** Como usuario, quiero recibir sugerencias inteligentes para generar GRE según las políticas de mi empresa, para cumplir con regulaciones de transporte.

#### Acceptance Criteria

1. WHEN gre_automatico_habilitado = true AND total > umbral_gre_automatico THEN el sistema SHALL mostrar tarjeta recordatoria
2. WHEN se muestra tarjeta recordatoria THEN el sistema SHALL mostrar botones "[Sí, generar GRE]" y "[No, omitir]"
3. WHEN gre_automatico_habilitado = false THEN el sistema SHALL mostrar botones "[Generar GRE]" y "[Finalizar]"
4. WHEN gre_obligatorio = true THEN el sistema SHALL exigir generación de GRE antes de completar
5. WHEN se acepta generar GRE THEN el sistema SHALL precarga datos del pedido/factura (puntos partida/llegada, motivo, transportista, placa, conductor, peso, bultos)
6. WHEN se genera GRE exitosamente THEN el sistema SHALL cambiar pedido a COMPLETADO_CON_GRE
7. WHEN se omite GRE THEN el sistema SHALL cambiar pedido a COMPLETADO

### Requirement 23: Selector de Cliente con Creación Rápida

**User Story:** Como vendedor, quiero un selector de cliente eficiente con opción de creación rápida, para no interrumpir mi flujo de trabajo.

#### Acceptance Criteria

1. WHEN estoy en Cotización/Pedido THEN el sistema SHALL mostrar buscador por RUC, DNI o nombre
2. WHEN hago clic en "+ Nuevo Cliente (rápido)" THEN el sistema SHALL abrir modal con campos mínimos
3. WHEN el modal está abierto THEN el sistema SHALL permitir validación SUNAT opcional
4. WHEN guardo cliente rápido THEN el sistema SHALL crear cliente con datos mínimos
5. WHEN guardo cliente rápido THEN el sistema SHALL seleccionarlo automáticamente en el formulario
6. WHEN necesito completar datos THEN el sistema SHALL permitir editar cliente desde su ficha posteriormente

### Requirement 24: Listado y Gestión de Clientes

**User Story:** Como usuario, quiero gestionar mi base de clientes con herramientas de búsqueda, filtros e importación/exportación, para mantener datos organizados.

#### Acceptance Criteria

1. WHEN accedo a /dashboard/ventas/clientes THEN el sistema SHALL mostrar acciones: Nuevo, Importar, Exportar, Buscar, Filtros
2. WHEN visualizo la lista THEN el sistema SHALL mostrar columnas: RUC/DNI, Nombre, Tipo, Acciones
3. WHEN hago clic en un cliente THEN el sistema SHALL mostrar detalle con secciones: Información General, Estadísticas, Historial de Transacciones
4. WHEN visualizo estadísticas THEN el sistema SHALL mostrar totales, contadores por documento, última compra
5. WHEN visualizo historial THEN el sistema SHALL mostrar transacciones con enlaces a ver detalle
6. WHEN exporto clientes THEN el sistema SHALL generar archivo CSV/Excel con datos de clientes

### Requirement 25: Configuración Inicial por Tipo de Empresa

**User Story:** Como administrador, quiero configurar el tipo de empresa al crear el tenant, para que el sistema precargue configuraciones apropiadas.

#### Acceptance Criteria

1. WHEN creo una empresa en el asistente inicial THEN el sistema SHALL preguntar tipo_empresa (MICRO/PEQUEÑA/MEDIANA/GRANDE)
2. WHEN selecciono MICRO o PEQUEÑA THEN el sistema SHALL precargar usar_flujo_logistica = false
3. WHEN selecciono MEDIANA o GRANDE THEN el sistema SHALL precargar usar_flujo_logistica = true
4. WHEN accedo a configuración de empresa THEN el sistema SHALL permitir editar usar_flujo_logistica manualmente
5. WHEN cambio usar_flujo_logistica THEN el sistema SHALL aplicar cambios inmediatamente en toda la UI

### Requirement 26: Reglas de Concurrencia y Atomicidad

**User Story:** Como administrador del sistema, quiero que las operaciones de inventario sean atómicas y seguras, para prevenir inconsistencias de datos.

#### Acceptance Criteria

1. WHEN se confirma un pedido THEN el sistema SHALL usar operaciones atómicas para actualizar stock_actual y stock_reservado
2. WHEN se cancela un pedido THEN el sistema SHALL usar operaciones atómicas para liberar reservas
3. WHEN dos usuarios confirman pedidos simultáneamente THEN el sistema SHALL prevenir doble reserva del mismo stock
4. WHEN se descuenta stock THEN el sistema SHALL prevenir doble salida del mismo movimiento
5. WHEN hay error en transacción THEN el sistema SHALL hacer rollback completo de cambios

### Requirement 27: Trazabilidad y Auditoría

**User Story:** Como auditor, quiero tener trazabilidad completa de todas las operaciones del módulo de ventas, para cumplir con requisitos de auditoría.

#### Acceptance Criteria

1. WHEN se modifica un documento THEN el sistema SHALL registrar historial (quién, cuándo, qué cambió)
2. WHEN se cambia estado de pedido THEN el sistema SHALL registrar usuario, fecha y estado anterior/nuevo
3. WHEN se integra con SUNAT/GRE THEN el sistema SHALL registrar log con request/response resumidos
4. WHEN se consulta historial THEN el sistema SHALL mostrar timeline completo de cambios
5. WHEN se audita THEN el sistema SHALL permitir correlación entre movimientos de inventario y pedidos

### Requirement 28: Soporte Multi-Almacén (Opcional)

**User Story:** Como empresa con múltiples almacenes, quiero asociar reservas y salidas a almacenes específicos, para controlar inventario por ubicación.

#### Acceptance Criteria

1. WHEN hay múltiples almacenes configurados THEN el sistema SHALL permitir seleccionar almacén origen en pedido
2. WHEN se reserva stock THEN el sistema SHALL asociar reserva a almacén específico
3. WHEN se descuenta stock THEN el sistema SHALL descontar del almacén correcto
4. WHEN se consulta disponibilidad THEN el sistema SHALL mostrar stock por almacén

### Requirement 29: Listas de Precio y Descuentos

**User Story:** Como vendedor, quiero aplicar listas de precio y descuentos por cliente o segmento, para manejar precios diferenciados.

#### Acceptance Criteria

1. WHEN selecciono un cliente THEN el sistema SHALL cargar su lista de precio asignada
2. WHEN agrego un producto THEN el sistema SHALL aplicar precio según lista del cliente
3. WHEN aplico descuento THEN el sistema SHALL recalcular totales correctamente
4. WHEN hay precios especiales THEN el sistema SHALL no romper el flujo de cotización/pedido

### Requirement 30: Soporte Multi-Moneda

**User Story:** Como empresa que opera en múltiples monedas, quiero registrar ventas en diferentes monedas, para manejar transacciones internacionales.

#### Acceptance Criteria

1. WHEN creo cotización/pedido THEN el sistema SHALL permitir seleccionar moneda (PEN por defecto)
2. WHEN selecciono moneda diferente THEN el sistema SHALL registrar tipo de cambio del día
3. WHEN calculo totales THEN el sistema SHALL usar tipo de cambio correcto
4. WHEN genero factura THEN el sistema SHALL incluir moneda y tipo de cambio en CPE

### Requirement 31: Series y Numeraciones

**User Story:** Como usuario, quiero que el sistema maneje automáticamente series y numeraciones de documentos, para mantener secuencias correctas.

#### Acceptance Criteria

1. WHEN genero documento THEN el sistema SHALL seleccionar serie automáticamente según sede/empresa_config
2. WHEN se asigna número THEN el sistema SHALL prevenir saltos de numeración
3. WHEN se anula documento THEN el sistema SHALL registrar anulación con motivo
4. WHEN hay múltiples series THEN el sistema SHALL permitir selección manual si es necesario

### Requirement 32: Preparación para Notas de Crédito/Débito

**User Story:** Como usuario, quiero tener preparado el enlace para generar notas de crédito/débito desde facturas, para manejar devoluciones y ajustes.

#### Acceptance Criteria

1. WHEN visualizo una factura emitida THEN el sistema SHALL mostrar opción "Generar Nota de Crédito"
2. WHEN visualizo una factura emitida THEN el sistema SHALL mostrar opción "Generar Nota de Débito"
3. WHEN hago clic en generar nota THEN el sistema SHALL preparar datos base (fuera del alcance actual)
4. IF el módulo de notas no está implementado THEN el sistema SHALL mostrar mensaje "Próximamente"
