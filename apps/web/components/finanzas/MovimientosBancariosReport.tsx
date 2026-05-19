'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { FileText, RefreshCw, Download, Filter } from 'lucide-react'

interface MovimientoBancario {
  id: string
  cuenta_bancaria_id: string
  cuenta_nombre: string
  banco: string
  tipo: 'ABONO' | 'CARGO'
  monto: number
  moneda: string
  fecha: string
  descripcion: string
  referencia: string
  conciliado: boolean
  saldo_despues: number
}

interface MovimientosReportProps {
  fechaDesde?: string
  fechaHasta?: string
}

export default function MovimientosBancariosReport({ fechaDesde, fechaHasta }: MovimientosReportProps) {
  const { get } = useApi()
  const [movimientos, setMovimientos] = useState<MovimientoBancario[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'ABONO' | 'CARGO'>('TODOS')
  const [filtroConciliado, setFiltroConciliado] = useState<'TODOS' | 'SI' | 'NO'>('TODOS')

  const loadMovimientos = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (fechaDesde) params.append('fecha_desde', fechaDesde)
      if (fechaHasta) params.append('fecha_hasta', fechaHasta)
      
      const response = await get(`/api/finanzas/bancos/movimientos/periodo?${params.toString()}`)
      
      if (response?.success) {
        setMovimientos(response.data || [])
      }
    } catch (error) {
      console.error('Error loading movimientos:', error)
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta, get])

  useEffect(() => {
    loadMovimientos()
  }, [loadMovimientos])

  const formatCurrency = (amount: number, currency: string = 'PEN') => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  // Apply filters
  const movimientosFiltrados = movimientos.filter(mov => {
    if (filtroTipo !== 'TODOS' && mov.tipo !== filtroTipo) return false
    if (filtroConciliado === 'SI' && !mov.conciliado) return false
    if (filtroConciliado === 'NO' && mov.conciliado) return false
    return true
  })

  // Calculate totals
  const totales = movimientosFiltrados.reduce((acc, mov) => {
    const key = mov.moneda
    if (!acc[key]) {
      acc[key] = { abonos: 0, cargos: 0, neto: 0 }
    }
    if (mov.tipo === 'ABONO') {
      acc[key].abonos += mov.monto
    } else {
      acc[key].cargos += mov.monto
    }
    acc[key].neto = acc[key].abonos - acc[key].cargos
    return acc
  }, {} as Record<string, { abonos: number; cargos: number; neto: number }>)

  if (loading) {
    return (
      <div className="activity-card p-8 text-center">
        <div className="loading-spinner"></div>
        <p className="text-gray-500">Cargando movimientos bancarios...</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div className="flex items-center gap-3">
          <FileText size={24} className="text-amber-500" />
          <div>
            <h3 className="text-[1.125rem] font-semibold text-gray-900">
              Movimientos Bancarios por Período
            </h3>
            <p className="text-[0.875rem] text-gray-500 mt-1">
              {movimientosFiltrados.length} movimiento{movimientosFiltrados.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadMovimientos} className="py-2 px-4 rounded-[6px] border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div>
          <label className="text-3 font-semibold text-gray-500 block mb-1">
            Tipo
          </label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as any)} className="p-2 rounded-[6px] border text-[0.875rem]"
          >
            <option value="TODOS">Todos</option>
            <option value="ABONO">Abonos</option>
            <option value="CARGO">Cargos</option>
          </select>
        </div>
        <div>
          <label className="text-3 font-semibold text-gray-500 block mb-1">
            Conciliado
          </label>
          <select
            value={filtroConciliado}
            onChange={(e) => setFiltroConciliado(e.target.value as any)} className="p-2 rounded-[6px] border text-[0.875rem]"
          >
            <option value="TODOS">Todos</option>
            <option value="SI">Conciliados</option>
            <option value="NO">Sin conciliar</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-8">
        {Object.entries(totales).map(([moneda, datos]) => (
          <div key={moneda} className="p-4 rounded-2 text-white">
            <div className="text-3 font-semibold opacity-[0.9]">
              Flujo Neto {moneda}
            </div>
            <div className="text-7 font-bold mt-2">
              {formatCurrency(datos.neto, moneda)}
            </div>
            <div className="text-3 mt-2 opacity-[0.9]">
              Abonos: {formatCurrency(datos.abonos, moneda)}
            </div>
            <div className="text-3 opacity-[0.9]">
              Cargos: {formatCurrency(datos.cargos, moneda)}
            </div>
          </div>
        ))}
      </div>

      {/* Movements Table */}
      {movimientosFiltrados.length === 0 ? (
        <div className="p-12 text-center">
          <FileText size={48} className="text-gray-400" />
          <p className="text-gray-500">No hay movimientos en el período seleccionado</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-[100%]">
            <thead>
              <tr>
                <th className="text-left p-3 font-semibold text-3 text-gray-500">
                  Fecha
                </th>
                <th className="text-left p-3 font-semibold text-3 text-gray-500">
                  Cuenta / Banco
                </th>
                <th className="text-left p-3 font-semibold text-3 text-gray-500">
                  Descripción
                </th>
                <th className="text-center p-3 font-semibold text-3 text-gray-500">
                  Tipo
                </th>
                <th className="text-right p-3 font-semibold text-3 text-gray-500">
                  Monto
                </th>
                <th className="text-center p-3 font-semibold text-3 text-gray-500">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map((mov) => (
                <tr key={mov.id} className="border-b">
                  <td className="p-3 text-[0.875rem]">
                    {formatDate(mov.fecha)}
                  </td>
                  <td className="p-3">
                    <div className="text-[0.875rem] font-medium">
                      {mov.cuenta_nombre}
                    </div>
                    <div className="text-3 text-gray-500">
                      {mov.banco}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="text-[0.875rem]">
                      {mov.descripcion}
                    </div>
                    {mov.referencia && (
                      <div className="text-3 text-gray-500">
                        Ref: {mov.referencia}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className="py-1 px-3 rounded-full text-3 font-semibold">
                      {mov.tipo}
                    </span>
                  </td>
                  <td className="p-3 text-right text-[0.875rem] font-semibold">
                    {mov.tipo === 'ABONO' ? '+' : '-'}{formatCurrency(mov.monto, mov.moneda)}
                  </td>
                  <td className="p-3 text-center">
                    <span className="py-1 px-3 rounded-full text-3 font-semibold">
                      {mov.conciliado ? 'Conciliado' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
