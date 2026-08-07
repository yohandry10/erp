'use client'

import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  Building2,
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/format-utils'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

interface MovimientoBancario {
  id: string
  cuenta_bancaria_id: string
  tipo: 'ABONO' | 'CARGO'
  monto: number
  fecha: string
  descripcion: string
  referencia: string | null
  conciliado: boolean
  cxp_id: string | null
  proveedor_id: string | null
  proveedores?: {
    id: string
    razon_social: string
    ruc: string
  }
  created_at: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface MovimientosBancariosTableProps {
  movimientos: MovimientoBancario[]
  loading: boolean
  moneda: string
  pagination: Pagination
  onPageChange: (page: number) => void
}

export default function MovimientosBancariosTable({
  movimientos,
  loading,
  moneda,
  pagination,
  onPageChange
}: MovimientosBancariosTableProps) {
  const { taxIdLabel, formatCurrency } = useLocalizedMoney()

  if (loading) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando movimientos...</p>
        </div>
      </div>
    )
  }

  if (movimientos.length === 0) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="text-center p-12 text-muted-foreground">
          <FileText size={48} className="text-muted-foreground" />
          <h3 className="text-[1.125rem] font-semibold mb-2">
            No hay movimientos
          </h3>
          <p>
            No se encontraron movimientos bancarios con los filtros aplicados
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-[100%] text-[0.875rem]">
          <thead>
            <tr className="bg-muted">
              <th className="py-3 px-4 text-left font-semibold text-foreground/85 text-xs">
                Fecha
              </th>
              <th className="py-3 px-4 text-left font-semibold text-foreground/85 text-xs">
                Tipo
              </th>
              <th className="py-3 px-4 text-left font-semibold text-foreground/85 text-xs">
                Descripción
              </th>
              <th className="py-3 px-4 text-left font-semibold text-foreground/85 text-xs">
                Proveedor
              </th>
              <th className="py-3 px-4 text-left font-semibold text-foreground/85 text-xs">
                Referencia
              </th>
              <th className="py-3 px-4 text-right font-semibold text-foreground/85 text-xs">
                Monto
              </th>
              <th className="py-3 px-4 text-center font-semibold text-foreground/85 text-xs">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((movimiento, index) => (
              <tr
                key={movimiento.id} className="border-b transition"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#f9fafb'
                }}
              >
                {/* Fecha */}
                <td className="p-4">
                  <div className="text-[0.875rem] font-medium text-foreground mb-0.5">
                    {formatDate(movimiento.fecha)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(movimiento.created_at)}
                  </div>
                </td>

                {/* Tipo */}
                <td className="p-4">
                  <span className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold">
                    {movimiento.tipo === 'ABONO' ? (
                      <TrendingUp size={12} />
                    ) : (
                      <TrendingDown size={12} />
                    )}
                    {movimiento.tipo}
                  </span>
                </td>

                {/* Descripción */}
                <td className="p-4">
                  <div className="text-[0.875rem] font-medium text-foreground max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {movimiento.descripcion}
                  </div>
                </td>

                {/* Proveedor */}
                <td className="p-4">
                  {movimiento.proveedores ? (
                    <div>
                      <div className="text-[0.875rem] font-medium text-foreground mb-0.5">
                        {movimiento.proveedores.razon_social}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {taxIdLabel}: {movimiento.proveedores.ruc}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[0.875rem] text-muted-foreground">
                      -
                    </span>
                  )}
                </td>

                {/* Referencia */}
                <td className="p-4">
                  {movimiento.referencia ? (
                    <span className="text-[0.875rem] font-medium text-muted-foreground">
                      {movimiento.referencia}
                    </span>
                  ) : (
                    <span className="text-[0.875rem] text-muted-foreground">
                      -
                    </span>
                  )}
                </td>

                {/* Monto */}
                <td className="p-4 text-right">
                  <span className="text-[0.875rem] font-bold">
                    {movimiento.tipo === 'ABONO' ? '+' : '-'} {formatCurrency(movimiento.monto, moneda)}
                  </span>
                </td>

                {/* Estado Conciliación */}
                <td className="p-4 text-center">
                  {movimiento.conciliado ? (
                    <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-xs font-semibold bg-[rgba(16,_185,_129,_0.1)] text-[#10b981]">
                      <CheckCircle size={12} />
                      Conciliado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-xs font-semibold bg-[rgba(245,_158,_11,_0.1)] text-amber-500">
                      <Clock size={12} />
                      Pendiente
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center mt-6 pt-6 border-t">
          <div className="text-[0.875rem] text-muted-foreground">
            Mostrando {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} movimientos
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1} className="py-2 px-3 rounded-[6px] border text-[0.875rem] font-medium flex items-center gap-1"
            >
              <ChevronLeft size={16} />
              Anterior
            </button>

            <div className="flex items-center gap-2 py-0 px-2">
              <span className="text-[0.875rem] text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages}
              </span>
            </div>

            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages} className="py-2 px-3 rounded-[6px] border text-[0.875rem] font-medium flex items-center gap-1"
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
