-- =====================================================
-- MIGRACIÓN: Datos iniciales para Base de Conocimiento
-- Fecha: 2025-11-29
-- Descripción: Preguntas frecuentes por módulo y rol
-- =====================================================

-- =====================================================
-- MÓDULO: POS (Punto de Venta)
-- =====================================================

INSERT INTO knowledge_base (categoria, rol, pregunta, palabras_clave, respuesta, pasos, url_modulo, orden) VALUES

-- Cajero - Apertura de caja
('pos', 'cajero', '¿Cómo abro la caja?', 
 ARRAY['caja', 'abrir', 'apertura', 'inicio', 'turno', 'monto inicial'],
 'Para abrir tu caja debes declarar el monto inicial con el que empiezas tu turno. Este monto se comparará al cierre.',
 '[{"paso": 1, "texto": "Ir a POS desde el menú principal"}, {"paso": 2, "texto": "Click en el botón Abrir Caja"}, {"paso": 3, "texto": "Contar el efectivo físico"}, {"paso": 4, "texto": "Ingresar el monto inicial"}, {"paso": 5, "texto": "Confirmar apertura"}]'::jsonb,
 '/dashboard/pos', 1),

-- Cajero - Cierre de caja
('pos', 'cajero', '¿Cómo cierro la caja?',
 ARRAY['caja', 'cerrar', 'cierre', 'cuadre', 'arqueo', 'fin turno'],
 'El cierre de caja te permite cuadrar tu turno. Debes contar el efectivo y declarar el monto final.',
 '[{"paso": 1, "texto": "Click en Cerrar Caja"}, {"paso": 2, "texto": "Contar todo el efectivo físico"}, {"paso": 3, "texto": "Ingresar el monto contado"}, {"paso": 4, "texto": "Agregar notas si hay diferencias"}, {"paso": 5, "texto": "Confirmar cierre"}]'::jsonb,
 '/dashboard/pos', 2),

-- Cajero - Procesar venta
('pos', 'cajero', '¿Cómo proceso una venta?',
 ARRAY['venta', 'vender', 'cobrar', 'producto', 'cliente', 'pago'],
 'Para procesar una venta, busca los productos, agrégalos al carrito, selecciona el cliente y método de pago.',
 '[{"paso": 1, "texto": "Buscar producto por nombre o código"}, {"paso": 2, "texto": "Click en el producto para agregarlo"}, {"paso": 3, "texto": "Ajustar cantidad si es necesario"}, {"paso": 4, "texto": "Seleccionar cliente"}, {"paso": 5, "texto": "Elegir método de pago"}, {"paso": 6, "texto": "Click en Procesar Venta"}]'::jsonb,
 '/dashboard/pos', 3),

-- Cajero - Métodos de pago
('pos', 'cajero', '¿Qué métodos de pago puedo usar?',
 ARRAY['pago', 'efectivo', 'tarjeta', 'transferencia', 'yape', 'plin'],
 'Puedes recibir pagos en efectivo, tarjeta de crédito/débito, transferencia bancaria, Yape o Plin según la configuración.',
 '[{"paso": 1, "texto": "Efectivo: Ingresa monto recibido, sistema calcula vuelto"}, {"paso": 2, "texto": "Tarjeta: Se registra el monto exacto"}, {"paso": 3, "texto": "Transferencia: Ingresa número de operación"}, {"paso": 4, "texto": "Yape/Plin: Verifica el pago en tu celular"}]'::jsonb,
 '/dashboard/pos', 4),

-- Cajero - Descuentos
('pos', 'cajero', '¿Cómo aplico un descuento?',
 ARRAY['descuento', 'rebaja', 'promoción', 'porcentaje'],
 'Puedes aplicar descuentos por producto o a la venta total. Algunos descuentos requieren autorización.',
 '[{"paso": 1, "texto": "Agregar productos al carrito"}, {"paso": 2, "texto": "Click en el icono de descuento del producto"}, {"paso": 3, "texto": "Ingresar porcentaje o monto"}, {"paso": 4, "texto": "Si excede tu límite, solicitar autorización"}]'::jsonb,
 '/dashboard/pos', 5),

-- Cajero - Boleta vs Factura
('pos', 'cajero', '¿Cuándo emito boleta y cuándo factura?',
 ARRAY['boleta', 'factura', 'comprobante', 'ruc', 'dni'],
 'Boleta para consumidores finales (DNI o sin documento). Factura para empresas (requiere RUC válido).',
 '[{"paso": 1, "texto": "Boleta: Cliente con DNI o sin documento"}, {"paso": 2, "texto": "Factura: Cliente debe tener RUC"}, {"paso": 3, "texto": "Ventas > S/700 sin RUC generan Guía de Remisión"}]'::jsonb,
 '/dashboard/pos', 6),

-- =====================================================
-- MÓDULO: VENTAS
-- =====================================================

-- Vendedor - Crear cotización
('ventas', 'vendedor', '¿Cómo creo una cotización?',
 ARRAY['cotización', 'cotizar', 'presupuesto', 'propuesta', 'precio'],
 'Las cotizaciones son propuestas comerciales sin compromiso. Puedes enviarlas por email al cliente.',
 '[{"paso": 1, "texto": "Ir a Ventas → Cotizaciones"}, {"paso": 2, "texto": "Click en Nueva Cotización"}, {"paso": 3, "texto": "Seleccionar cliente"}, {"paso": 4, "texto": "Agregar productos y cantidades"}, {"paso": 5, "texto": "Aplicar descuentos si corresponde"}, {"paso": 6, "texto": "Guardar y enviar PDF"}]'::jsonb,
 '/dashboard/ventas/cotizaciones', 1),

-- Vendedor - Convertir cotización
('ventas', 'vendedor', '¿Cómo convierto una cotización en pedido?',
 ARRAY['convertir', 'cotización', 'pedido', 'confirmar', 'aceptar'],
 'Cuando el cliente acepta la cotización, puedes convertirla en pedido con un click. El stock se reserva automáticamente.',
 '[{"paso": 1, "texto": "Abrir la cotización aceptada"}, {"paso": 2, "texto": "Click en Convertir a Pedido"}, {"paso": 3, "texto": "Verificar datos"}, {"paso": 4, "texto": "Confirmar conversión"}, {"paso": 5, "texto": "El stock queda reservado"}]'::jsonb,
 '/dashboard/ventas/cotizaciones', 2),

-- Vendedor - Crear cliente
('ventas', 'vendedor', '¿Cómo registro un cliente nuevo?',
 ARRAY['cliente', 'nuevo', 'registrar', 'crear', 'ruc', 'dni'],
 'Puedes crear clientes desde el módulo de ventas. El sistema valida el RUC/DNI con SUNAT/RENIEC.',
 '[{"paso": 1, "texto": "Ir a Ventas → Clientes"}, {"paso": 2, "texto": "Click en Nuevo Cliente"}, {"paso": 3, "texto": "Seleccionar tipo: Persona o Empresa"}, {"paso": 4, "texto": "Ingresar RUC o DNI"}, {"paso": 5, "texto": "Click en Validar para autocompletar datos"}, {"paso": 6, "texto": "Completar información adicional"}, {"paso": 7, "texto": "Guardar"}]'::jsonb,
 '/dashboard/ventas/clientes', 3),

-- Vendedor - Generar factura
('ventas', 'vendedor', '¿Cómo genero una factura?',
 ARRAY['factura', 'generar', 'emitir', 'comprobante', 'sunat'],
 'Las facturas se generan desde pedidos despachados. Se envían automáticamente a SUNAT.',
 '[{"paso": 1, "texto": "Ir al pedido despachado"}, {"paso": 2, "texto": "Click en Generar Factura"}, {"paso": 3, "texto": "Verificar datos del cliente"}, {"paso": 4, "texto": "Confirmar emisión"}, {"paso": 5, "texto": "Sistema envía a SUNAT automáticamente"}, {"paso": 6, "texto": "PDF disponible para enviar al cliente"}]'::jsonb,
 '/dashboard/ventas/facturas', 4),

-- =====================================================
-- MÓDULO: INVENTARIO
-- =====================================================

-- Almacenero - Ver stock
('inventario', 'almacenero', '¿Cómo veo el stock de un producto?',
 ARRAY['stock', 'inventario', 'cantidad', 'disponible', 'existencia'],
 'Puedes ver el stock desde el listado de productos o desde el Kardex para ver movimientos.',
 '[{"paso": 1, "texto": "Ir a Inventario → Productos"}, {"paso": 2, "texto": "Buscar el producto"}, {"paso": 3, "texto": "Ver columna Stock Disponible"}, {"paso": 4, "texto": "Click en el producto para ver detalle por almacén"}]'::jsonb,
 '/dashboard/inventario/productos', 1),

-- Almacenero - Ajuste de inventario
('inventario', 'almacenero', '¿Cómo hago un ajuste de inventario?',
 ARRAY['ajuste', 'inventario', 'diferencia', 'corregir', 'stock'],
 'Los ajustes corrigen diferencias entre el stock del sistema y el físico. Requieren motivo.',
 '[{"paso": 1, "texto": "Ir a Inventario → Ajustes"}, {"paso": 2, "texto": "Click en Nuevo Ajuste"}, {"paso": 3, "texto": "Seleccionar almacén"}, {"paso": 4, "texto": "Buscar y agregar productos"}, {"paso": 5, "texto": "Ingresar cantidad real"}, {"paso": 6, "texto": "Seleccionar motivo del ajuste"}, {"paso": 7, "texto": "Confirmar ajuste"}]'::jsonb,
 '/dashboard/inventario/ajustes', 2),

-- Almacenero - Transferencia
('inventario', 'almacenero', '¿Cómo transfiero productos entre almacenes?',
 ARRAY['transferencia', 'mover', 'almacén', 'traslado'],
 'Las transferencias mueven stock de un almacén a otro. El receptor debe confirmar la recepción.',
 '[{"paso": 1, "texto": "Ir a Inventario → Transferencias"}, {"paso": 2, "texto": "Click en Nueva Transferencia"}, {"paso": 3, "texto": "Seleccionar almacén origen"}, {"paso": 4, "texto": "Seleccionar almacén destino"}, {"paso": 5, "texto": "Agregar productos y cantidades"}, {"paso": 6, "texto": "Enviar transferencia"}, {"paso": 7, "texto": "Receptor confirma recepción"}]'::jsonb,
 '/dashboard/inventario/transferencias', 3),

-- =====================================================
-- MÓDULO: FINANZAS
-- =====================================================

-- Contador - Cuentas por cobrar
('finanzas', 'contador', '¿Cómo veo las cuentas por cobrar?',
 ARRAY['cuentas', 'cobrar', 'pendiente', 'deuda', 'cliente'],
 'Las cuentas por cobrar muestran las facturas pendientes de pago de tus clientes.',
 '[{"paso": 1, "texto": "Ir a Finanzas → Cuentas por Cobrar"}, {"paso": 2, "texto": "Ver listado de facturas pendientes"}, {"paso": 3, "texto": "Filtrar por cliente o fecha"}, {"paso": 4, "texto": "Ver detalle de cada cuenta"}]'::jsonb,
 '/dashboard/finanzas/cuentas-cobrar', 1),

-- Contador - Registrar cobro
('finanzas', 'contador', '¿Cómo registro un cobro?',
 ARRAY['cobro', 'pago', 'recibir', 'cliente', 'factura'],
 'Los cobros se aplican a facturas pendientes. Puedes hacer cobros parciales o totales.',
 '[{"paso": 1, "texto": "Ir a Finanzas → Cobros"}, {"paso": 2, "texto": "Click en Nuevo Cobro"}, {"paso": 3, "texto": "Seleccionar cliente"}, {"paso": 4, "texto": "Ver facturas pendientes"}, {"paso": 5, "texto": "Seleccionar facturas a cobrar"}, {"paso": 6, "texto": "Ingresar monto y método de pago"}, {"paso": 7, "texto": "Confirmar cobro"}]'::jsonb,
 '/dashboard/finanzas/cobros', 2),

-- =====================================================
-- MÓDULO: CONFIGURACIÓN (Admin)
-- =====================================================

-- Admin - Crear usuario
('configuracion', 'admin', '¿Cómo creo un usuario nuevo?',
 ARRAY['usuario', 'crear', 'nuevo', 'acceso', 'cuenta'],
 'Los usuarios se crean desde Configuración. Cada usuario tiene un rol que define sus permisos.',
 '[{"paso": 1, "texto": "Ir a Configuración → Usuarios"}, {"paso": 2, "texto": "Click en Nuevo Usuario"}, {"paso": 3, "texto": "Ingresar nombre y email"}, {"paso": 4, "texto": "Seleccionar rol (Cajero, Vendedor, etc.)"}, {"paso": 5, "texto": "Definir contraseña temporal"}, {"paso": 6, "texto": "Guardar usuario"}]'::jsonb,
 '/dashboard/configuracion/usuarios', 1),

-- Admin - Configurar empresa
('configuracion', 'admin', '¿Cómo configuro los datos de mi empresa?',
 ARRAY['empresa', 'configurar', 'ruc', 'razón social', 'logo'],
 'Los datos de empresa aparecen en todos los comprobantes. Incluye RUC, razón social y logo.',
 '[{"paso": 1, "texto": "Ir a Configuración → Empresa"}, {"paso": 2, "texto": "Completar datos fiscales"}, {"paso": 3, "texto": "Subir logo de la empresa"}, {"paso": 4, "texto": "Configurar dirección y contacto"}, {"paso": 5, "texto": "Guardar cambios"}]'::jsonb,
 '/dashboard/configuracion/empresa', 2),

-- Admin - Series de comprobantes
('configuracion', 'admin', '¿Cómo configuro las series de comprobantes?',
 ARRAY['serie', 'comprobante', 'factura', 'boleta', 'numeración'],
 'Las series definen la numeración de tus comprobantes. Cada punto de venta puede tener su serie.',
 '[{"paso": 1, "texto": "Ir a Configuración → Series"}, {"paso": 2, "texto": "Ver series existentes"}, {"paso": 3, "texto": "Click en Nueva Serie"}, {"paso": 4, "texto": "Seleccionar tipo de comprobante"}, {"paso": 5, "texto": "Ingresar código de serie (ej: F001)"}, {"paso": 6, "texto": "Asignar a punto de venta"}, {"paso": 7, "texto": "Guardar"}]'::jsonb,
 '/dashboard/configuracion/series', 3);

-- =====================================================
-- PREGUNTAS GENERALES (todos los roles)
-- =====================================================

INSERT INTO knowledge_base (categoria, rol, pregunta, palabras_clave, respuesta, pasos, url_modulo, orden) VALUES

('general', NULL, '¿Cómo cambio mi contraseña?',
 ARRAY['contraseña', 'password', 'clave', 'cambiar', 'seguridad'],
 'Puedes cambiar tu contraseña desde tu perfil de usuario.',
 '[{"paso": 1, "texto": "Click en tu nombre (esquina superior derecha)"}, {"paso": 2, "texto": "Seleccionar Mi Perfil"}, {"paso": 3, "texto": "Click en Cambiar Contraseña"}, {"paso": 4, "texto": "Ingresar contraseña actual"}, {"paso": 5, "texto": "Ingresar nueva contraseña"}, {"paso": 6, "texto": "Confirmar nueva contraseña"}, {"paso": 7, "texto": "Guardar"}]'::jsonb,
 '/dashboard/perfil', 1),

('general', NULL, '¿Cómo cierro sesión?',
 ARRAY['cerrar', 'sesión', 'salir', 'logout', 'desconectar'],
 'Puedes cerrar sesión desde el menú de usuario.',
 '[{"paso": 1, "texto": "Click en tu nombre (esquina superior derecha)"}, {"paso": 2, "texto": "Click en Cerrar Sesión"}, {"paso": 3, "texto": "Confirmar cierre"}]'::jsonb,
 '/dashboard', 2),

('general', NULL, '¿Qué hago si el sistema está lento?',
 ARRAY['lento', 'demora', 'carga', 'problema', 'error'],
 'Si el sistema está lento, prueba refrescar la página o limpiar el caché del navegador.',
 '[{"paso": 1, "texto": "Presionar F5 para refrescar"}, {"paso": 2, "texto": "Si persiste, presionar Ctrl+Shift+R"}, {"paso": 3, "texto": "Verificar conexión a internet"}, {"paso": 4, "texto": "Si continúa, contactar soporte"}]'::jsonb,
 '/dashboard', 3);
