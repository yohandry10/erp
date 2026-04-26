'use client'

import { FileText, ShoppingCart, Receipt, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'
import { TransaccionHistorial } from '@/types/ventas'

interface HistorialTransaccionesProps {
  transacciones: TransaccionHistorial[]
  className?: string
}

export default function HistorialTransacciones({
  transacciones,
  className = ''
}: HistorialTransaccionesProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return format(date, "d 'de' MMM, yyyy", { locale: es })
    } catch {
      return dateString
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(value)
  }

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'COTIZACION':
        return <FileText className="w-5 h-5 text-blue-600" />
      case 'PEDIDO':
        return <ShoppingCart className="w-5 h-5 text-purple-600" />
      case 'FACTURA':
        return <Receipt className="w-5 h-5 text-green-600" />
      default:
        return <FileText className="w-5 h-5 text-gray-600" />
    }
  }

  const getEstadoBadgeColor = (estado: string) => {
    const colors: Record<string, string> = {
      PENDIENTE: 'bg-gray-100 text-gray-800',
      CONFIRMADO: 'bg-blue-100 text-blue-800',
      EN_PREPARACION: 'bg-yellow-100 text-yellow-800',
      LISTO_DESPACHO: 'bg-purple-100 text-purple-800',
      LISTO_FACTURAR: 'bg-indigo-100 text-indigo-800',
      FACTURADO: 'bg-green-100 text-green-800',
      COMPLETADO: 'bg-green-100 text-green-800',
      COMPLETADO_CON_GRE: 'bg-green-100 text-green-800',
      CANCELADO: 'bg-red-100 text-red-800',
      BORRADOR: 'bg-gray-100 text-gray-800',
      ENVIADA: 'bg-blue-100 text-blue-800',
      APROBADA: 'bg-green-100 text-green-800',
      RECHAZADA: 'bg-red-100 text-red-800',
      CONVERTIDA: 'bg-purple-100 text-purple-800',
      VENCIDA: 'bg-orange-100 text-orange-800',
      EMITIDA: 'bg-green-100 text-green-800',
      ANULADA: 'bg-red-100 text-red-800'
    }
    return colors[estado] || 'bg-gray-100 text-gray-800'
  }

  const getLink = (transaccion: TransaccionHistorial) => {
    switch (transaccion.tipo) {
      case 'COTIZACION':
        return `/dashboard/ventas/cotizaciones/${transaccion.id}`
      case 'PEDIDO':
        return `/dashboard/ventas/pedidos/${transaccion.id}`
      case 'FACTURA':
        return `/dashboard/cpe/documentos/${transaccion.id}`
      default:
        return '#'
    }
  }

  if (!transacciones || transacciones.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        No hay transacciones registradas
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Número
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transacciones.map((transaccion) => (
              <tr key={transaccion.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {getIcon(transaccion.tipo)}
                    <span className="text-sm font-medium text-gray-900">
                      {transaccion.tipo}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-900 font-mono">
                    {transaccion.numero}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-gray-600">
                    {formatDate(transaccion.fecha)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEstadoBadgeColor(
                      transaccion.estado
                    )}`}
                  >
                    {transaccion.estado}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(transaccion.total)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <Link
                    href={getLink(transaccion)}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Ver detalle
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
