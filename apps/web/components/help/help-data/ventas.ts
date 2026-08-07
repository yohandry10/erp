import { HelpItem } from '../types'

export const ventasHelp: Record<string, HelpItem> = {
  'ventas.cliente': {
    key: 'ventas.cliente',
    title: 'Cliente',
    description: 'Selecciona el cliente para esta operación.',
    tips: [
      'Busca por identificador fiscal, documento personal o razón social',
      'Puedes crear un cliente nuevo desde aquí'
    ],
    link: '/dashboard/ventas/clientes'
  },
  'ventas.cotizacion': {
    key: 'ventas.cotizacion',
    title: 'Cotización',
    description: 'Propuesta comercial sin compromiso de venta.',
    tips: [
      'Tiene vigencia configurable (ej: 15 días)',
      'Puede convertirse en pedido cuando el cliente confirme'
    ]
  },
  'ventas.pedido': {
    key: 'ventas.pedido',
    title: 'Pedido',
    description: 'Compromiso de venta que reserva stock.',
    tips: [
      'El stock se reserva automáticamente',
      'Requiere aprobación si excede límite de crédito'
    ]
  },
  'ventas.factura': {
    key: 'ventas.factura',
    title: 'Factura',
    description: 'Comprobante fiscal para empresas.',
    tips: [
      'Requiere un cliente con identificador fiscal válido',
      'La emisión usa la autoridad fiscal configurada para el tenant'
    ]
  },
  'ventas.boleta': {
    key: 'ventas.boleta',
    title: 'Documento a consumidor final',
    description: 'Comprobante fiscal o equivalente para consumidores finales.',
    tips: [
      'No requiere datos del cliente',
      'Su transmisión o consolidación depende de las reglas del país'
    ]
  },
  'ventas.descuento': {
    key: 'ventas.descuento',
    title: 'Descuento',
    description: 'Reducción del precio de venta.',
    tips: [
      'Puede requerir aprobación según monto',
      'Se aplica antes de impuestos'
    ]
  },
  'ventas.condicion_pago': {
    key: 'ventas.condicion_pago',
    title: 'Condición de Pago',
    description: 'Define cuándo debe pagar el cliente.',
    tips: [
      'Contado: Pago inmediato',
      'Crédito 30/60/90: Días para pagar'
    ]
  },
  'ventas.nota_credito': {
    key: 'ventas.nota_credito',
    title: 'Nota de Crédito',
    description: 'Documento para anular o modificar una factura.',
    tips: [
      'Debe referenciar la factura original',
      'Puede ser por devolución, descuento o anulación'
    ]
  },
  'ventas.guia_remision': {
    key: 'ventas.guia_remision',
    title: 'Guía de Remisión',
    description: 'Documento para el traslado de mercadería.',
    tips: [
      'Obligatoria para transporte de bienes',
      'Incluye datos del transportista'
    ]
  }
}
