'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { TrendingDown, RefreshCw, AlertTriangle } from 'lucide-react'

interface ProveedorDeuda {
  proveedor_id: string
  razon_social: string
  ruc: string
  deuda_total: number
  cantidad_cxp: number
  deuda_vencida: number
  deuda_por_vencer: number
  dias_promedio_vencimiento: number
  monedas: Array<{
    moneda: string
    monto: number
  }>
}

interface ProveedoresMayorDeudaProps {
  limite?: number
}

export default function ProveedoresMayorDeudaReport({ limite = 20 }: ProveedoresMayorDeudaProps) {
  const { get } = useApi()
  const [proveedores, setProveedores] = useState<ProveedorDeuda[]>([])
  const [loading, setLoading] = useState(true)

  const loadProveedores = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/finanzas/cxp/proveedores-mayor-deuda?limite=${limite}`)
      
      if (response?.success) {
        setProveedores(response.data || [])
      }
    } catch (error) {
      console.error('Error loading proveedores:', error)
    } finally {
      setLoading(false)
    }
  }, [get, limite])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  const formatCurrency = (amount: number, currency: string = 'PEN') => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const getTotalDeuda = () => {
    return proveedores.reduce((sum, p) => sum + p.deuda_total, 0)
  }

  const getTotalVencida = () => {
    return proveedores.reduce((sum, p) => sum + p.deuda_vencida, 0)
  }

  if (loading) {
    return (
      <div className="activity-card p-8 text-center">
        <div className="loading-spinner"></div>
        <p className="text-gray-500">Cargando proveedores con mayor deuda...</p>
      </div>
    )
  }

  if (proveedores.length === 0) {
    return (
      <div className="activity-card p-12 text-center">
        <TrendingDown size={48} className="text-gray-400" />
        <h3 className="text-[1.125rem] font-semibold mb-2 text-gray-700">
          No hay deudas pendientes
        </h3>
        <p className="text-gray-500">
          No hay proveedores con deuda pendiente
        </p>
      </div>
    )
  }

  const maxDeuda = Math.max(...proveedores.map(p => p.deuda_total))

  return (
    <div className="activity-card">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div className="flex items-center gap-3">
          <TrendingDown size={24} className="text-red-500" />
          <div>
            <h3 className="text-[1.125rem] font-semibold text-gray-900">
              Proveedores con Mayor Deuda
            </h3>
            <p className="text-[0.875rem] text-gray-500 mt-1">
              Top {proveedores.length} proveedores por deuda pendiente
            </p>
          </div>
        </div>
        <button
          onClick={loadProveedores} className="py-2 px-4 rounded-[6px] border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-8">
        <div className="p-4 rounded-2 text-white">
          <div className="text-3 font-semibold opacity-[0.9]">
            Deuda Total
          </div>
          <div className="text-7 font-bold mt-2">
            {formatCurrency(getTotalDeuda())}
          </div>
          <div className="text-[0.875rem] mt-1 opacity-[0.9]">
            {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}
          </div>
        </div>

        <div className="p-4 rounded-2 bg-[rgba(239,_68,_68,_0.1)] border">
          <div className="text-3 font-semibold text-red-800">
            Deuda Vencida
          </div>
          <div className="text-6 font-bold mt-2 text-red-600">
            {formatCurrency(getTotalVencida())}
          </div>
          <div className="text-[0.875rem] mt-1 text-red-800">
            {((getTotalVencida() / getTotalDeuda()) * 100).toFixed(1)}% del total
          </div>
        </div>
      </div>

      {/* Proveedores List */}
      <div className="flex flex-col gap-4">
        {proveedores.map((proveedor, index) => {
          const porcentajeVencida = (proveedor.deuda_vencida / proveedor.deuda_total) * 100
          const barWidth = (proveedor.deuda_total / maxDeuda) * 100
          
          return (
            <div
              key={proveedor.proveedor_id} className="p-6 rounded-3 border bg-white transition"
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div className="flex justify-between mb-4">
                <div className="flex-[1]">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-[0.875rem] font-bold">
                      {index + 1}
                    </span>
                    <div>
                      <h4 className="text-4 font-semibold text-gray-900">
                        {proveedor.razon_social}
                      </h4>
                      <p className="text-3 text-gray-500">
                        RUC: {proveedor.ruc} • {proveedor.cantidad_cxp} cuenta{proveedor.cantidad_cxp !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-5 font-bold text-gray-900">
                    {formatCurrency(proveedor.deuda_total)}
                  </div>
                  {proveedor.monedas.length > 1 && (
                    <div className="text-3 text-gray-500 mt-1">
                      Multi-moneda
                    </div>
                  )}
                </div>
              </div>

              {/* Deuda Bar */}
              <div className="mb-4">
                <div className="w-[100%] h-8 bg-[rgba(0,0,0,0.05)] rounded-[6px] overflow-hidden relative">
                  <div className="h-[100%] transition flex items-center justify-end pr-3">
                    {barWidth > 20 && (
                      <span className="text-3 font-semibold text-white">
                        {barWidth.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4">
                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    Deuda Vencida
                  </div>
                  <div className="text-[0.875rem] font-semibold text-red-600">
                    {formatCurrency(proveedor.deuda_vencida)}
                  </div>
                  <div className="text-3 text-red-800">
                    {porcentajeVencida.toFixed(1)}% del total
                  </div>
                </div>
                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    Por Vencer
                  </div>
                  <div className="text-[0.875rem] font-semibold text-amber-500">
                    {formatCurrency(proveedor.deuda_por_vencer)}
                  </div>
                </div>
                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    Días Prom. Vencimiento
                  </div>
                  <div className="text-[0.875rem] font-semibold text-gray-700">
                    {proveedor.dias_promedio_vencimiento > 0 
                      ? `${proveedor.dias_promedio_vencimiento} días`
                      : 'Al día'
                    }
                  </div>
                </div>
              </div>

              {/* Alert for high overdue */}
              {porcentajeVencida > 50 && (
                <div className="mt-4 p-3 rounded-[6px] bg-[rgba(239,_68,_68,_0.1)] flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-600" />
                  <span className="text-3 text-red-800 font-medium">
                    Más del 50% de la deuda está vencida - Requiere atención prioritaria
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
