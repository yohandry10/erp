'use client'

import { guias } from './guias'
import { GuiaModulo } from './types'

export type { GuiaModulo }
export { guias }

const RUTAS_EXCLUSIVAS_PERU = new Set(['/dashboard/gre', '/dashboard/sire', '/dashboard/rrhh/planilla-electronica'])

const GUIAS_ARGENTINA: Record<string, GuiaModulo> = {
  '/dashboard/pos': {
    titulo: 'Punto de venta',
    queEs: 'La pantalla del mostrador. Aquí se arma la venta, se registra el cobro y se prepara el comprobante correspondiente.',
    quePuedesHacer: [
      'Buscar productos por nombre, código o escáner (F2 buscar, F4 escáner, F8 cobrar)',
      'Elegir entre ticket interno o el comprobante fiscal habilitado para la operación',
      'Cobrar en efectivo, tarjeta o transferencia, incluso combinando medios',
      'Abrir y cerrar caja, y consultar las ventas del día',
    ],
    conectaCon: [
      'Inventario: al aceptarse la venta se descuenta el stock',
      'Comprobantes ARCA: la venta fiscal prepara el comprobante electrónico',
      'Cuentas por cobrar y Contabilidad: la venta registra el cobro y su asiento',
    ],
  },
  '/dashboard/documentos': {
    titulo: 'Gestión documental',
    queEs: 'El archivo central de facturas A, B o C, notas, contratos y documentos emitidos mediante ARCA.',
    quePuedesHacer: [
      'Filtrar por tipo, estado, CUIT o DNI del cliente, punto de venta y rango de fechas',
      'Consultar el estado fiscal, el CAE y la trazabilidad del comprobante',
      'Descargar los documentos disponibles y continuar la operación desde Comprobantes ARCA',
    ],
    conectaCon: ['Comprobantes ARCA: concentra los documentos autorizados y sus notas referenciadas'],
  },
  '/dashboard/contabilidad': {
    titulo: 'Contabilidad',
    queEs: 'Los libros contables armados a partir de lo que ya operaste. No se transcribe nada a mano.',
    quePuedesHacer: [
      'Consultar estado de resultados, balance de comprobación y registro de compras',
      'Revisar kardex valorizado, libro caja y bancos, y activos fijos',
      'Controlar periodos, centros de costo, presupuestos y consolidación',
      'Revisar los asientos e impuestos configurados para la empresa argentina',
    ],
    conectaCon: ['Ventas, Compras, Inventario y RRHH: cada operación deja su asiento'],
  },
  '/dashboard/inventario/logistica/listo-despacho': {
    titulo: 'Órdenes listas para despacho',
    queEs: 'Los pedidos ya preparados que esperan salir.',
    quePuedesHacer: ['Revisar el detalle antes de despachar', 'Confirmar el despacho'],
    conectaCon: ['Pedidos de venta: originan la preparación', 'Inventario: el despacho mueve el stock'],
  },
  '/dashboard/cpe': {
    titulo: 'Comprobantes ARCA',
    queEs: 'Facturas A, B o C y sus notas de crédito o débito, con punto de venta, correlativo y estado de autorización ante ARCA.',
    quePuedesHacer: [
      'Preparar facturas y notas según la condición frente al IVA del emisor y del receptor',
      'Consultar el estado de autorización, el CAE y su vencimiento',
      'Descargar el PDF con el código QR reglamentario',
    ],
    conectaCon: ['POS y Ventas: el comprobante nace de la operación', 'Cuentas por cobrar: la factura registra el importe pendiente'],
  },
  '/dashboard/ventas/clientes': {
    titulo: 'Clientes',
    queEs: 'Tu cartera, con la identidad y la condición frente al IVA necesarias para operar y facturar en Argentina.',
    quePuedesHacer: ['Registrar clientes con CUIT, CUIL, CDI o DNI, según corresponda', 'Definir su condición frente al IVA', 'Importar y exportar la cartera en bloque'],
    conectaCon: ['POS, Cotizaciones y Comprobantes ARCA: el receptor se elige al vender y determina la clase del comprobante'],
  },
  '/dashboard/rrhh/liquidaciones': {
    titulo: 'Liquidaciones finales',
    queEs: 'El cálculo y pago del cierre laboral de una persona empleada.',
    quePuedesHacer: ['Calcular una liquidación sin afectar todavía al empleado', 'Confirmar el cierre, su devengo y el cese en un solo paso', 'Revertir la operación sin borrar su historia'],
    conectaCon: ['Contabilidad y Bancos: el pago deja su asiento y su movimiento bancario'],
  },
  '/dashboard/configuracion': {
    titulo: 'Configuración',
    queEs: 'Los datos de tu empresa y las reglas con las que opera el sistema en Argentina.',
    quePuedesHacer: [
      'Configurar CUIT, razón social, domicilio y provincia fiscal',
      'Definir la condición frente al IVA y el punto de venta ARCA',
      'Revisar la configuración laboral y del flujo logístico',
    ],
    conectaCon: ['Comprobantes ARCA: la emisión real requiere un certificado correspondiente al CUIT emisor'],
  },
}

/**
 * El catálogo base conserva la ayuda peruana vigente. Argentina elimina los
 * módulos que no existen en su menú y sustituye cada ficha fiscal compartida
 * antes de renderizarla, para que nunca haya un flash de otra jurisdicción.
 */
export function getGuiasPorPais(paisCodigo: string | null | undefined): Record<string, GuiaModulo> {
  const codigo = paisCodigo?.trim().toUpperCase()
  if (!codigo) return {}
  if (codigo !== 'AR') return guias

  return Object.fromEntries(
    Object.entries(guias)
      .filter(([ruta]) => !RUTAS_EXCLUSIVAS_PERU.has(ruta))
      .map(([ruta, guia]) => [ruta, GUIAS_ARGENTINA[ruta] ?? guia]),
  )
}

/**
 * Devuelve la ficha de la ruta actual buscando el prefijo más largo que
 * coincida. Así una subruta sin ficha propia hereda la de su módulo padre en
 * vez de dejar al usuario sin ninguna ayuda.
 */
export function getGuiaPorRuta(pathname: string | null | undefined, paisCodigo?: string | null): GuiaModulo | null {
  if (!pathname) return null

  // Next.js puede entregar la ruta con o sin barra final segun la navegacion.
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  let mejor: string | null = null
  const guiasDisponibles = paisCodigo === undefined ? guias : getGuiasPorPais(paisCodigo)
  for (const clave of Object.keys(guiasDisponibles)) {
    if (ruta === clave || ruta.startsWith(`${clave}/`)) {
      if (mejor === null || clave.length > mejor.length) mejor = clave
    }
  }

  return mejor ? guiasDisponibles[mejor] : null
}

export interface GrupoGuias {
  area: string
  modulos: Array<{ ruta: string; guia: GuiaModulo }>
}

/** Área a la que pertenece una ruta, deducida de su prefijo. */
function areaDeRuta(ruta: string): string {
  if (ruta.startsWith('/dashboard/inventario')) return 'Inventario y logística'
  if (ruta.startsWith('/dashboard/ventas')) return 'Ventas'
  if (ruta.startsWith('/dashboard/finanzas')) return 'Finanzas'
  if (ruta.startsWith('/dashboard/rrhh')) return 'Recursos humanos'
  if (['/dashboard/cpe', '/dashboard/gre', '/dashboard/sire', '/dashboard/documentos'].includes(ruta)) {
    return 'Facturación y fiscal'
  }
  if (['/dashboard/configuracion', '/dashboard/usuarios', '/dashboard/offline', '/dashboard/ayuda', '/dashboard/audit-logs'].includes(ruta)) {
    return 'Sistema'
  }
  return 'General'
}

const ORDEN_AREAS = ['General', 'Ventas', 'Inventario y logística', 'Facturación y fiscal', 'Finanzas', 'Recursos humanos', 'Sistema']

/** Todas las fichas agrupadas por área, para navegarlas como catálogo. */
export function agruparGuias(paisCodigo?: string | null): GrupoGuias[] {
  const porArea = new Map<string, GrupoGuias['modulos']>()

  const guiasDisponibles = paisCodigo === undefined ? guias : getGuiasPorPais(paisCodigo)
  for (const [ruta, guia] of Object.entries(guiasDisponibles)) {
    const area = areaDeRuta(ruta)
    if (!porArea.has(area)) porArea.set(area, [])
    porArea.get(area)!.push({ ruta, guia })
  }

  return ORDEN_AREAS.filter((a) => porArea.has(a)).map((area) => ({
    area,
    modulos: porArea.get(area)!.sort((a, b) => a.guia.titulo.localeCompare(b.guia.titulo, 'es')),
  }))
}
