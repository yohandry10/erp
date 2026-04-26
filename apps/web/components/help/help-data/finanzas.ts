import { HelpItem } from '../types'

export const finanzasHelp: Record<string, HelpItem> = {
  'finanzas.cuenta_cobrar': {
    key: 'finanzas.cuenta_cobrar',
    title: 'Cuenta por Cobrar',
    description: 'Deuda de un cliente por una venta a crédito.',
    tips: [
      'Se genera automáticamente al facturar a crédito',
      'Puedes registrar cobros parciales'
    ],
    link: '/dashboard/finanzas/cuentas-cobrar'
  },
  'finanzas.cuenta_pagar': {
    key: 'finanzas.cuenta_pagar',
    title: 'Cuenta por Pagar',
    description: 'Deuda con un proveedor por una compra a crédito.',
    tips: [
      'Se genera al registrar factura de compra',
      'Controla fechas de vencimiento'
    ],
    link: '/dashboard/finanzas/cuentas-pagar'
  },
  'finanzas.cobro': {
    key: 'finanzas.cobro',
    title: 'Cobro',
    description: 'Registro de pago recibido de un cliente.',
    tips: [
      'Selecciona las facturas a cancelar',
      'Puedes aplicar a múltiples facturas'
    ]
  },
  'finanzas.pago': {
    key: 'finanzas.pago',
    title: 'Pago',
    description: 'Registro de pago realizado a un proveedor.',
    tips: [
      'Selecciona las facturas a pagar',
      'Registra el método de pago usado'
    ]
  },
  'finanzas.banco': {
    key: 'finanzas.banco',
    title: 'Cuenta Bancaria',
    description: 'Cuenta de banco de la empresa.',
    tips: [
      'Registra todas las cuentas activas',
      'Concilia movimientos periódicamente'
    ]
  },
  'finanzas.conciliacion': {
    key: 'finanzas.conciliacion',
    title: 'Conciliación Bancaria',
    description: 'Comparación entre registros y estado de cuenta.',
    tips: [
      'Hazlo mensualmente',
      'Identifica diferencias y ajusta'
    ]
  },
  'finanzas.flujo_caja': {
    key: 'finanzas.flujo_caja',
    title: 'Flujo de Caja',
    description: 'Proyección de ingresos y egresos.',
    tips: [
      'Basado en cuentas por cobrar y pagar',
      'Ayuda a planificar liquidez'
    ]
  }
}
