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
        return <FileText className="w-5 h-5 text-primary" />
      case 'PEDIDO':
        return <ShoppingCart className="w-5 h-5 text-violet-400" />
      case 'FACTURA':
        return <Receipt className="w-5 h-5 text-emerald-400" />
      default:
        return <FileText className="w-5 h-5 text-foreground/80" />
    }
  }

  const getEstadoBadgeColor = (estado: string) => {
    const colors: Record<string, string> = {
      PENDIENTE: 'bg-muted text-foreground',
      CONFIRMADO: 'bg-primary/10 text-primary',
      EN_PREPARACION: 'bg-amber-500/10 text-amber-400',
      LISTO_DESPACHO: 'bg-violet-500/10 text-violet-400',
      LISTO_FACTURAR: 'bg-primary/10 text-primary',
      FACTURADO: 'bg-emerald-500/10 text-emerald-400',
      COMPLETADO: 'bg-emerald-500/10 text-emerald-400',
      COMPLETADO_CON_GRE: 'bg-emerald-500/10 text-emerald-400',
      CANCELADO: 'bg-destructive/10 text-destructive',
      BORRADOR: 'bg-muted text-foreground',
      ENVIADA: 'bg-primary/10 text-primary',
      APROBADA: 'bg-emerald-500/10 text-emerald-400',
      RECHAZADA: 'bg-destructive/10 text-destructive',
      CONVERTIDA: 'bg-violet-500/10 text-violet-400',
      VENCIDA: 'bg-amber-500/10 text-amber-400',
      EMITIDA: 'bg-emerald-500/10 text-emerald-400',
      ANULADA: 'bg-destructive/10 text-destructive'
    }
    return colors[estado] || 'bg-muted text-foreground'
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
      <div className={`text-center py-8 text-muted-foreground ${className}`}>
        No hay transacciones registradas
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Número
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-gray-200">
            {transacciones.map((transaccion) => (
              <tr key={transaccion.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {getIcon(transaccion.tipo)}
                    <span className="text-sm font-medium text-foreground">
                      {transaccion.tipo}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-foreground font-mono">
                    {transaccion.numero}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-sm text-foreground/80">
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
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(transaccion.total)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <Link
                    href={getLink(transaccion)}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary transition-colors"
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
