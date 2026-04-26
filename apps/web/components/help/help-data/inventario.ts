import { HelpItem } from '../types'

export const inventarioHelp: Record<string, HelpItem> = {
  'inventario.producto': {
    key: 'inventario.producto',
    title: 'Producto',
    description: 'Artículo que se compra, almacena y vende.',
    tips: [
      'Usa códigos únicos para cada producto',
      'Configura unidades de medida correctamente'
    ],
    link: '/dashboard/inventario/productos'
  },
  'inventario.stock': {
    key: 'inventario.stock',
    title: 'Stock',
    description: 'Cantidad disponible de un producto.',
    tips: [
      'Stock mínimo genera alertas automáticas',
      'Stock reservado no está disponible para venta'
    ]
  },
  'inventario.almacen': {
    key: 'inventario.almacen',
    title: 'Almacén',
    description: 'Ubicación física donde se guarda mercadería.',
    tips: [
      'Cada almacén tiene su propio stock',
      'Puedes transferir entre almacenes'
    ]
  },
  'inventario.lote': {
    key: 'inventario.lote',
    title: 'Lote',
    description: 'Grupo de productos con misma fecha de producción.',
    tips: [
      'Útil para trazabilidad',
      'Permite control de vencimientos (FEFO)'
    ]
  },
  'inventario.serie': {
    key: 'inventario.serie',
    title: 'Número de Serie',
    description: 'Identificador único de cada unidad.',
    tips: [
      'Obligatorio para productos serializados',
      'Permite rastrear cada unidad vendida'
    ]
  },
  'inventario.kardex': {
    key: 'inventario.kardex',
    title: 'Kardex',
    description: 'Registro de movimientos de un producto.',
    tips: [
      'Muestra entradas, salidas y saldos',
      'Útil para auditoría de inventario'
    ]
  },
  'inventario.ajuste': {
    key: 'inventario.ajuste',
    title: 'Ajuste de Inventario',
    description: 'Corrección de stock por diferencias físicas.',
    tips: [
      'Requiere motivo del ajuste',
      'Genera asiento contable automático'
    ]
  },
  'inventario.transferencia': {
    key: 'inventario.transferencia',
    title: 'Transferencia',
    description: 'Movimiento de stock entre almacenes.',
    tips: [
      'Selecciona origen y destino',
      'El stock se mueve al confirmar recepción'
    ]
  }
}
