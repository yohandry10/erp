import { GuiaModulo } from './types'

/**
 * Ficha por pantalla: qué es, qué puedes hacer y con qué se conecta.
 *
 * El "conectaCon" no es decorativo: es lo que la gente no adivina sola. Casi
 * nadie descubre por su cuenta que recepcionar una compra mueve el kardex y
 * levanta una cuenta por pagar, y esa es justamente la parte que hace que el
 * sistema valga la pena.
 *
 * La clave es la ruta. La búsqueda es por prefijo más largo, así que una ruta
 * hija sin ficha propia hereda la de su padre.
 */
export const guias: Record<string, GuiaModulo> = {
  '/dashboard': {
    titulo: 'Dashboard ejecutivo',
    queEs: 'La foto del día de tu negocio. Reúne en una pantalla las ventas, las compras, el inventario valorizado y las alertas abiertas.',
    quePuedesHacer: [
      'Ver ventas del mes y del día, y compras del periodo',
      'Revisar la actividad reciente con cada documento que la originó',
      'Detectar alertas de stock bajo u órdenes pendientes',
    ],
    conectaCon: ['Todos los módulos: cada cifra proviene de una operación registrada, no de un cálculo aparte'],
  },

  '/dashboard/pos': {
    titulo: 'Punto de venta',
    queEs: 'La pantalla del mostrador. Aquí se cobra: se arma la venta, se elige el medio de pago y se emite el comprobante.',
    quePuedesHacer: [
      'Buscar productos por nombre, código o escáner (F2 buscar, F4 escáner, F8 cobrar)',
      'Elegir entre ticket interno, boleta o factura al momento de cobrar',
      'Cobrar en efectivo, tarjeta, transferencia o Yape/Plin, incluso mezclando medios',
      'Abrir y cerrar caja, y consultar las ventas del día',
    ],
    conectaCon: [
      'Inventario: al aceptarse la venta se descuenta el stock',
      'CPE: la venta fiscal genera el comprobante electrónico',
      'Cuentas por cobrar y Contabilidad: la venta levanta el cobro y su asiento',
    ],
  },

  '/dashboard/documentos': {
    titulo: 'Gestión documental',
    queEs: 'El archivo central de facturas, boletas, notas y contratos, con su estado frente a SUNAT.',
    quePuedesHacer: [
      'Filtrar por tipo, estado, RUC del cliente, serie y rango de fechas',
      'Descargar el XML firmado y reenviar a SUNAT',
      'Tramitar bajas fiscales RA (facturas) y RC (boletas)',
    ],
    conectaCon: [
      'CPE: un comprobante solo admite baja fiscal después de que su nota de crédito y la reversa de deuda, stock y pedido quedaron cerradas',
    ],
  },

  '/dashboard/contabilidad': {
    titulo: 'Contabilidad',
    queEs: 'Los libros contables armados a partir de lo que ya operaste. No se transcribe nada a mano.',
    quePuedesHacer: [
      'Consultar estado de resultados, balance de comprobación y registro de compras',
      'Revisar kardex valorizado, libro caja y bancos, y activos fijos',
      'Controlar periodos, centros de costo, presupuestos y consolidación',
      'Preparar los libros electrónicos y los impuestos de Perú (IGV, renta, ITAN)',
    ],
    conectaCon: ['Ventas, Compras, Inventario y RRHH: cada operación deja su asiento'],
  },

  '/dashboard/analytics': {
    titulo: 'Analytics financiero',
    queEs: 'Indicadores de gerencia explicados en castellano, con recomendaciones y señales de alerta.',
    quePuedesHacer: [
      'Ver liquidez, cuentas por cobrar y pagar, y ciclo de efectivo por periodo',
      'Comparar semanal, mensual, trimestral o anual',
      'Exportar a CSV',
    ],
    conectaCon: ['Finanzas y Contabilidad: los indicadores salen de tus saldos reales'],
  },

  '/dashboard/inventario': {
    titulo: 'Catálogo de productos',
    queEs: 'El maestro de productos con su stock actual y su valorización.',
    quePuedesHacer: [
      'Consultar stock por producto y su mínimo configurado',
      'Filtrar por categoría, estado o solo stock crítico',
      'Ver el valor total del inventario',
    ],
    conectaCon: ['POS y Compras: toda entrada o salida se refleja aquí y en el kardex'],
  },

  '/dashboard/inventario/categorias': {
    titulo: 'Categorías de productos',
    queEs: 'La clasificación del catálogo, con campos propios según el tipo de producto.',
    quePuedesHacer: ['Crear y editar categorías', 'Definir campos específicos por tipo de producto'],
    conectaCon: ['Catálogo: las categorías filtran productos en el POS y en los reportes'],
  },

  '/dashboard/inventario/almacenes': {
    titulo: 'Almacenes y ubicaciones',
    queEs: 'La estructura física donde vive tu mercadería.',
    quePuedesHacer: ['Crear almacenes y ubicaciones', 'Activarlos o desactivarlos según tu operación'],
    conectaCon: [
      'Recepciones y Kardex: un almacén no se puede desactivar si conserva stock, reservas o ubicaciones activas',
    ],
  },

  '/dashboard/inventario/recepciones': {
    titulo: 'Recepciones de compra',
    queEs: 'El punto donde la mercadería comprada entra de verdad a tu inventario.',
    quePuedesHacer: [
      'Recepcionar total o parcialmente una orden de compra',
      'Registrar control de calidad y asignar almacén y lotes',
    ],
    conectaCon: [
      'Compras: parte de una orden existente',
      'Kardex y Contabilidad: al confirmar emite el evento que alimenta ambos',
    ],
  },

  '/dashboard/inventario/kardex': {
    titulo: 'Kardex valorizado',
    queEs: 'El historial de cada movimiento físico con su costo y moneda congelados al momento de la operación.',
    quePuedesHacer: [
      'Consultar entradas, salidas, ajustes y devoluciones',
      'Filtrar por producto, almacén y periodo',
    ],
    conectaCon: ['Contabilidad: es el puente entre el inventario y los libros'],
  },

  '/dashboard/inventario/operaciones': {
    titulo: 'Ajustes y transferencias',
    queEs: 'Donde se corrigen diferencias de conteo y se mueve mercadería entre almacenes.',
    quePuedesHacer: [
      'Registrar un ajuste por diferencia de inventario, con su asiento',
      'Trasladar existencias entre almacenes sin alterar el valor total',
    ],
    conectaCon: ['Kardex y Contabilidad: todo ajuste queda trazado'],
  },

  '/dashboard/inventario/logistica/ordenes-pendientes': {
    titulo: 'Órdenes pendientes de preparación',
    queEs: 'La cola de pedidos confirmados que esperan ser preparados en almacén.',
    quePuedesHacer: ['Ver los ítems de cada pedido', 'Marcar un pedido como preparado'],
    conectaCon: ['Pedidos de venta: llegan aquí al confirmarse', 'Listo para despacho: siguiente etapa'],
  },

  '/dashboard/inventario/logistica/listo-despacho': {
    titulo: 'Órdenes listas para despacho',
    queEs: 'Los pedidos ya preparados que esperan salir.',
    quePuedesHacer: ['Revisar el detalle antes de despachar', 'Confirmar el despacho'],
    conectaCon: ['Inventario: el despacho mueve el stock', 'GRE: puede requerir guía de remisión'],
  },

  '/dashboard/cpe': {
    titulo: 'Comprobantes de pago electrónicos',
    queEs: 'Facturas, boletas y notas con su serie, correlativo y estado frente a SUNAT.',
    quePuedesHacer: [
      'Emitir un CPE o una nota de crédito/débito',
      'Consultar el estado: aceptado, enviado o rechazado',
      'Descargar el PDF o el XML, y anular',
    ],
    conectaCon: ['POS y Ventas: el comprobante nace de la venta', 'Cuentas por cobrar: la factura levanta el cobro'],
  },

  '/dashboard/gre': {
    titulo: 'Guías de remisión electrónica',
    queEs: 'El documento que respalda el traslado de mercadería.',
    quePuedesHacer: [
      'Emitir una GRE con transporte público o privado',
      'Seguir el estado del traslado hasta la entrega',
    ],
    conectaCon: ['Despachos: el traslado parte de un pedido despachado'],
  },

  '/dashboard/sire': {
    titulo: 'Reportes SIRE',
    queEs: 'La comparación entre tus registros y las propuestas de ventas y compras de SUNAT.',
    quePuedesHacer: [
      'Generar el reporte del periodo',
      'Aceptar la propuesta oficial y conservar el ticket SUNAT',
    ],
    conectaCon: [
      'CPE y Compras: el contraste usa tus comprobantes',
      'Ojo: la generación final del libro se realiza en SOL, no aquí',
    ],
  },

  '/dashboard/compras': {
    titulo: 'Gestión de compras',
    queEs: 'Las órdenes a proveedores y su seguimiento hasta que la mercadería llega.',
    quePuedesHacer: [
      'Crear órdenes de compra y administrar proveedores',
      'Filtrar por estado o proveedor',
      'Recepcionar una orden aprobada',
    ],
    conectaCon: [
      'Inventario: la recepción sube el stock',
      'Cuentas por pagar: la compra levanta la obligación',
      'Contabilidad: queda su asiento',
    ],
  },

  '/dashboard/ventas/clientes': {
    titulo: 'Clientes',
    queEs: 'Tu cartera, distinguiendo persona de empresa con su documento de identidad.',
    quePuedesHacer: [
      'Registrar clientes con RUC o DNI',
      'Importar y exportar la cartera en bloque',
    ],
    conectaCon: ['POS, Cotizaciones y CPE: el cliente se elige al vender y determina si puedes facturar'],
  },

  '/dashboard/ventas/cotizaciones': {
    titulo: 'Cotizaciones',
    queEs: 'Las propuestas enviadas a clientes, con su fecha de vencimiento.',
    quePuedesHacer: [
      'Crear cotizaciones y seguir su estado: borrador, enviada, aprobada, rechazada, convertida o vencida',
    ],
    conectaCon: ['Pedidos: una cotización aprobada se convierte en pedido'],
  },

  '/dashboard/ventas/pedidos': {
    titulo: 'Pedidos de venta',
    queEs: 'Los compromisos de venta en firme y su avance operativo.',
    quePuedesHacer: [
      'Crear pedidos y seguir su estado',
      'Revisar el estado de crédito del cliente antes de que avance',
    ],
    conectaCon: [
      'Aprobaciones: si excede el crédito o los límites, pasa a autorización',
      'Logística: al confirmarse entra en preparación y despacho',
    ],
  },

  '/dashboard/ventas/aprobaciones': {
    titulo: 'Bandeja de aprobaciones',
    queEs: 'Los pedidos que requieren autorización por crédito, descuento o límites configurados.',
    quePuedesHacer: ['Revisar el monto comprometido', 'Aprobar o rechazar la excepción'],
    conectaCon: ['Pedidos: quien vende no es quien autoriza la excepción'],
  },

  '/dashboard/ventas/rma': {
    titulo: 'RMA y devoluciones',
    queEs: 'El flujo completo de una devolución de cliente, con estados y responsables.',
    quePuedesHacer: [
      'Registrar la solicitud y decidirla de forma segregada',
      'Recepcionar la mercadería devuelta',
      'Cerrar con nota de crédito y saldo a favor',
    ],
    conectaCon: ['Inventario, CPE y Cuentas por cobrar: la devolución revierte stock, comprobante y deuda'],
  },

  '/dashboard/finanzas/cxc': {
    titulo: 'Cuentas por cobrar',
    queEs: 'Lo que tus clientes te deben, con vencimientos y días de atraso.',
    quePuedesHacer: [
      'Registrar cobros totales o parciales',
      'Emitir nota de crédito, reprogramar y consultar el historial',
    ],
    conectaCon: ['Ventas y CPE: cada cuenta nace de una factura', 'Tesorería: alimenta la proyección de caja'],
  },

  '/dashboard/finanzas/cxp': {
    titulo: 'Cuentas por pagar',
    queEs: 'Lo que le debes a tus proveedores, con vencimientos y antigüedad.',
    quePuedesHacer: ['Consultar la lista o la vista de aging por rangos de días', 'Filtrar por proveedor y periodo'],
    conectaCon: ['Compras: la obligación nace al recepcionar', 'Tesorería: define los próximos pagos'],
  },

  '/dashboard/finanzas/bancos': {
    titulo: 'Cuentas bancarias',
    queEs: 'Tus cuentas y sus saldos disponibles.',
    quePuedesHacer: ['Registrar cuentas', 'Consultar saldo y movimientos por cuenta'],
    conectaCon: ['Tesorería y Conciliación: son la base del saldo real'],
  },

  '/dashboard/finanzas/tesoreria': {
    titulo: 'Tesorería',
    queEs: 'La visión de caja: cuánto tienes, cuánto entra y cuánto sale.',
    quePuedesHacer: [
      'Ver la proyección de flujo a 30 días',
      'Revisar los pagos próximos y programarlos',
      'Ejecutar pagos masivos',
    ],
    conectaCon: [
      'Cuentas por cobrar y por pagar: la proyección es tu saldo bancario más lo que te deben menos lo que debes',
    ],
  },

  '/dashboard/finanzas/conciliacion': {
    titulo: 'Conciliación bancaria',
    queEs: 'El cruce entre lo que el sistema registra y lo que el banco reporta.',
    quePuedesHacer: ['Crear una conciliación por cuenta y periodo', 'Seguirla desde abierta hasta cerrada'],
    conectaCon: ['Bancos y Contabilidad: cuadra los movimientos con los libros'],
  },

  '/dashboard/finanzas/reportes': {
    titulo: 'Reportes financieros',
    queEs: 'Los informes consolidados del área de finanzas.',
    quePuedesHacer: [
      'Consultar aging de cuentas por pagar y ranking de proveedores por deuda',
      'Revisar movimientos bancarios y flujo de caja proyectado',
      'Imprimir o exportar a PDF',
    ],
    conectaCon: ['Cuentas por pagar, Bancos y Tesorería'],
  },

  '/dashboard/usuarios': {
    titulo: 'Usuarios, roles y permisos',
    queEs: 'Quién entra al sistema y qué puede hacer dentro.',
    quePuedesHacer: [
      'Crear usuarios y asignarles un rol',
      'Definir roles propios con permisos por acción',
      'Activar, desactivar o suspender cuentas',
    ],
    conectaCon: [
      'Todos los módulos: el permiso decide quién vende en el POS, quién cierra una recepción o quién desconcilia una partida',
    ],
  },

  '/dashboard/rrhh': {
    titulo: 'Recursos humanos',
    queEs: 'La gestión de tu personal: contratación, asistencia y pagos.',
    quePuedesHacer: [
      'Registrar empleados con su documento, puesto y fecha de ingreso',
      'Administrar contratos, asistencia, candidatos y pagos',
      'Calcular planillas',
    ],
    conectaCon: ['Contabilidad: la planilla genera su asiento en el libro correspondiente'],
  },

  '/dashboard/rrhh/planilla-electronica': {
    titulo: 'PLAME y T-Registro',
    queEs: 'La preparación de la planilla electrónica que exige SUNAT.',
    quePuedesHacer: [
      'Preparar PLAME y las fuentes de T-Registro',
      'Validar y generar el archivo, conservando versión, huellas, ticket y CIR',
    ],
    conectaCon: [
      'RRHH: parte de tus planillas calculadas',
      'Ojo: el ZIP del ERP no se carga directo a SOL; primero pasa por PVS',
    ],
  },

  '/dashboard/rrhh/liquidaciones': {
    titulo: 'Liquidaciones y CTS',
    queEs: 'El cálculo y pago del cese de un empleado, y los depósitos semestrales de CTS.',
    quePuedesHacer: [
      'Calcular una liquidación sin afectar todavía al empleado',
      'Confirmar, que genera el devengo y aplica el cese en un solo paso',
      'Revertir, que restaura saldo y obligación sin borrar la historia',
    ],
    conectaCon: ['Contabilidad y Bancos: el pago deja su asiento y su movimiento bancario'],
  },

  '/dashboard/configuracion': {
    titulo: 'Configuración',
    queEs: 'Los datos de tu empresa y las reglas con las que opera el sistema.',
    quePuedesHacer: [
      'Configurar RUC, razón social, dirección fiscal y ubigeo',
      'Definir las series de factura, boleta y notas',
      'Ajustar la configuración de planilla y del flujo logístico',
    ],
    conectaCon: [
      'CPE y GRE: sin certificado digital a nombre del RUC emisor no hay emisión fiscal real',
    ],
  },

  '/dashboard/offline': {
    titulo: 'Modo offline',
    queEs: 'La red de seguridad para cuando se cae el internet.',
    quePuedesHacer: [
      'Ver las operaciones en cola local y sus reintentos',
      'Forzar la sincronización contra el servidor',
    ],
    conectaCon: ['POS: permite seguir vendiendo y sincronizar al recuperar conexión'],
  },

  '/dashboard/audit-logs': {
    titulo: 'Registros de auditoría',
    queEs: 'El rastro de quién hizo qué dentro del sistema. Es una pantalla restringida: requiere permiso explícito para abrirse.',
    quePuedesHacer: [
      'Consultar el historial de acciones registradas en tu empresa',
      'Rastrear una operación hasta el usuario que la ejecutó',
    ],
    conectaCon: ['Usuarios y roles: el permiso decide quién puede leer esta bitácora'],
  },

  '/dashboard/ayuda': {
    titulo: 'Centro de ayuda',
    queEs: 'Los recursos para aprender a usar el sistema a tu ritmo.',
    quePuedesHacer: [
      'Repetir los tours interactivos por rol: cajero, vendedor y administrador',
      'Consultar los atajos de teclado',
      'Preguntarle al asistente según el módulo en el que estés',
    ],
    conectaCon: ['Todos los módulos'],
  },
}
