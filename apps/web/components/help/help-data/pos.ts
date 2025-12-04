import { HelpItem } from '../types'

export const posHelp: Record<string, HelpItem> = {
  'pos.apertura_caja': {
    key: 'pos.apertura_caja',
    title: 'Apertura de Caja',
    description: 'Ingresa el monto inicial con el que empiezas tu turno.',
    tips: [
      'Cuenta el efectivo físico antes de ingresar',
      'Este monto se comparará al cierre para detectar diferencias'
    ],
    link: '/dashboard/pos'
  },
  'pos.cierre_caja': {
    key: 'pos.cierre_caja',
    title: 'Cierre de Caja',
    description: 'Finaliza tu turno declarando el efectivo final.',
    tips: [
      'Cuenta todo el efectivo antes de cerrar',
      'El sistema calculará si hay sobrante o faltante'
    ]
  },
  'pos.buscar_producto': {
    key: 'pos.buscar_producto',
    title: 'Buscar Producto',
    description: 'Busca por nombre, código o escanea código de barras.',
    tips: [
      'Usa el lector de códigos para mayor rapidez',
      'Puedes buscar por nombre parcial'
    ]
  },
  'pos.metodo_pago': {
    key: 'pos.metodo_pago',
    title: 'Método de Pago',
    description: 'Selecciona cómo pagará el cliente.',
    tips: [
      'Efectivo: Ingresa monto recibido para calcular vuelto',
      'Tarjeta: Se registra el total exacto',
      'Puedes combinar métodos de pago'
    ]
  },
  'pos.monto_recibido': {
    key: 'pos.monto_recibido',
    title: 'Monto Recibido',
    description: 'Ingresa el dinero que te entrega el cliente.',
    tips: [
      'El sistema calcula el vuelto automáticamente',
      'Verifica el monto antes de confirmar'
    ]
  },
  'pos.descuento': {
    key: 'pos.descuento',
    title: 'Descuento',
    description: 'Aplica descuento al producto o a la venta total.',
    tips: [
      'Requiere autorización según configuración',
      'Puede ser porcentaje o monto fijo'
    ]
  },
  'pos.cliente': {
    key: 'pos.cliente',
    title: 'Cliente',
    description: 'Selecciona o registra el cliente para la venta.',
    tips: [
      'Para boleta puedes usar "Cliente General"',
      'Para factura es obligatorio seleccionar cliente con RUC'
    ]
  },
  'pos.tipo_comprobante': {
    key: 'pos.tipo_comprobante',
    title: 'Tipo de Comprobante',
    description: 'Elige el documento a emitir.',
    tips: [
      'Boleta: Para consumidores finales',
      'Factura: Para empresas (requiere RUC)',
      'Nota de Venta: Sin valor fiscal'
    ]
  }
}
