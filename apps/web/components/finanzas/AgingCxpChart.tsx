'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { BarChart3, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react'

interface AgingData {
  fecha_reporte: string
  resumen: {
    rango_0_30: { cantidad: number; monto: number }
    rango_31_60: { cantidad: number; monto: number }
    rango_61_90: { cantidad: number; monto: number }
    rango_mas_90: { cantidad: number; monto: number }
    total: { cantidad: number; monto: number }
  }
  por_proveedor: Array<{
    proveedor_id: string
    proveedor_razon_social: string
    proveedor_ruc: string
    rango_0_30: number
    rango_31_60: number
    rango_61_90: number
    rango_mas_90: number
    por_vencer: number
    total: number
    cantidad_cxp: number
  }>
  detalle: Array<{
    id: string
    proveedor_razon_social: string
    numero_documento: string
    fecha_vencimiento: string
    dias_vencidos: number
    saldo: number
    moneda: string
    rango: string
  }>
}

interface AgingCxpChartProps {
  proveedorId?: string
}

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const emptyRange = { cantidad: 0, monto: 0 }

const normalizeAgingData = (raw: any): AgingData => ({
  fecha_reporte: raw?.fecha_reporte || new Date().toISOString(),
  resumen: {
    rango_0_30: {
      cantidad: toNumber(raw?.resumen?.rango_0_30?.cantidad),
      monto: toNumber(raw?.resumen?.rango_0_30?.monto),
    },
    rango_31_60: {
      cantidad: toNumber(raw?.resumen?.rango_31_60?.cantidad),
      monto: toNumber(raw?.resumen?.rango_31_60?.monto),
    },
    rango_61_90: {
      cantidad: toNumber(raw?.resumen?.rango_61_90?.cantidad),
      monto: toNumber(raw?.resumen?.rango_61_90?.monto),
    },
    rango_mas_90: {
      cantidad: toNumber(raw?.resumen?.rango_mas_90?.cantidad),
      monto: toNumber(raw?.resumen?.rango_mas_90?.monto),
    },
    total: {
      cantidad: toNumber(raw?.resumen?.total?.cantidad),
      monto: toNumber(raw?.resumen?.total?.monto),
    },
  },
  por_proveedor: Array.isArray(raw?.por_proveedor) ? raw.por_proveedor : [],
  detalle: Array.isArray(raw?.detalle) ? raw.detalle : [],
})

export default function AgingCxpChart({ proveedorId }: AgingCxpChartProps) {
  const { get } = useApi()
  const [agingData, setAgingData] = useState<AgingData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadAgingData = useCallback(async () => {
    try {
      setLoading(true)
      const params = proveedorId ? `?proveedor_id=${proveedorId}` : ''
      const response = await get(`/api/finanzas/cxp/aging${params}`)

      if (response?.success) {
        setAgingData(normalizeAgingData(response.data))
      }
    } catch (error) {
      console.error('Error loading aging data:', error)
    } finally {
      setLoading(false)
    }
  }, [get, proveedorId])

  useEffect(() => {
    loadAgingData()
  }, [loadAgingData])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(toNumber(amount))
  }

  if (loading) {
    return (
      <div className="activity-card p-8 text-center">
        <div className="loading-spinner"></div>
        <p className="text-gray-500">Cargando reporte de aging...</p>
      </div>
    )
  }

  const resumen = agingData?.resumen ?? {
    rango_0_30: emptyRange,
    rango_31_60: emptyRange,
    rango_61_90: emptyRange,
    rango_mas_90: emptyRange,
    total: emptyRange,
  }
  const por_proveedor = agingData?.por_proveedor ?? []

  if (!agingData || resumen.total.cantidad === 0) {
    return (
      <div className="activity-card p-8 text-center">
        <BarChart3 size={48} className="text-gray-400" />
        <h3 className="text-[1.125rem] font-semibold mb-2 text-gray-700">
          No hay cuentas vencidas
        </h3>
        <p className="text-gray-500">
          Todas las cuentas por pagar están al día
        </p>
      </div>
    )
  }

  // Calculate percentages for visual bars
  const maxMonto = Math.max(
    resumen.rango_0_30.monto,
    resumen.rango_31_60.monto,
    resumen.rango_61_90.monto,
    resumen.rango_mas_90.monto
  )

  const ranges = [
    {
      label: '0-30 días',
      cantidad: resumen.rango_0_30.cantidad,
      monto: resumen.rango_0_30.monto,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.1)',
      percentage: maxMonto > 0 ? (resumen.rango_0_30.monto / maxMonto) * 100 : 0
    },
    {
      label: '31-60 días',
      cantidad: resumen.rango_31_60.cantidad,
      monto: resumen.rango_31_60.monto,
      color: '#f97316',
      bgColor: 'rgba(249, 115, 22, 0.1)',
      percentage: maxMonto > 0 ? (resumen.rango_31_60.monto / maxMonto) * 100 : 0
    },
    {
      label: '61-90 días',
      cantidad: resumen.rango_61_90.cantidad,
      monto: resumen.rango_61_90.monto,
      color: '#ef4444',
      bgColor: 'rgba(239, 68, 68, 0.1)',
      percentage: maxMonto > 0 ? (resumen.rango_61_90.monto / maxMonto) * 100 : 0
    },
    {
      label: '+90 días',
      cantidad: resumen.rango_mas_90.cantidad,
      monto: resumen.rango_mas_90.monto,
      color: '#dc2626',
      bgColor: 'rgba(220, 38, 38, 0.1)',
      percentage: maxMonto > 0 ? (resumen.rango_mas_90.monto / maxMonto) * 100 : 0
    }
  ]

  return (
    <div className="activity-card">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-blue-500" />
          <div>
            <h3 className="text-[1.125rem] font-semibold text-gray-900">
              Aging de Cuentas por Pagar
            </h3>
            <p className="text-[0.875rem] text-gray-500 mt-1">
              Antigüedad de deudas vencidas
            </p>
          </div>
        </div>
        <button
          onClick={loadAgingData} className="py-2 px-4 rounded-[6px] border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-8">
        <div className="p-4 rounded-2 text-white">
          <div className="text-3 font-semibold opacity-[0.9]">
            Total Vencido
          </div>
          <div className="text-7 font-bold mt-2">
            {formatCurrency(resumen.total.monto)}
          </div>
          <div className="text-[0.875rem] mt-1 opacity-[0.9]">
            {resumen.total.cantidad} cuenta{resumen.total.cantidad !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="p-4 rounded-2 bg-[rgba(239,_68,_68,_0.1)] border">
          <div className="text-3 font-semibold text-red-800">
            Más Crítico (+90 días)
          </div>
          <div className="text-6 font-bold mt-2 text-red-600">
            {formatCurrency(resumen.rango_mas_90.monto)}
          </div>
          <div className="text-[0.875rem] mt-1 text-red-800">
            {resumen.rango_mas_90.cantidad} cuenta{resumen.rango_mas_90.cantidad !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Aging Bars */}
      <div className="mb-8">
        <h4 className="text-[0.875rem] font-semibold text-gray-700 mb-4">
          Distribución por Antigüedad
        </h4>
        <div className="flex flex-col gap-4">
          {ranges.map((range, index) => (
            <div key={index}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[0.875rem] font-medium text-gray-700">
                  {range.label}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-3 text-gray-500">
                    {range.cantidad} cuenta{range.cantidad !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[0.875rem] font-semibold">
                    {formatCurrency(range.monto)}
                  </span>
                </div>
              </div>
              <div className="w-[100%] h-8 rounded-[6px] overflow-hidden relative">
                <div className="h-[100%] transition flex items-center justify-end pr-3">
                  {range.percentage > 15 && (
                    <span className="text-3 font-semibold text-white">
                      {range.percentage.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Debtors */}
      {por_proveedor.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-red-500" />
            <h4 className="text-[0.875rem] font-semibold text-gray-700">
              Proveedores con Mayor Deuda Vencida
            </h4>
          </div>
          <div className="overflow-auto">
            <table className="w-[100%]">
              <thead>
                <tr>
                  <th className="text-left p-3 font-semibold text-3 text-gray-500">
                    Proveedor
                  </th>
                  <th className="text-right p-3 font-semibold text-3 text-gray-500">
                    0-30
                  </th>
                  <th className="text-right p-3 font-semibold text-3 text-gray-500">
                    31-60
                  </th>
                  <th className="text-right p-3 font-semibold text-3 text-gray-500">
                    61-90
                  </th>
                  <th className="text-right p-3 font-semibold text-3 text-gray-500">
                    +90
                  </th>
                  <th className="text-right p-3 font-semibold text-3 text-gray-500">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {por_proveedor.slice(0, 10).map((proveedor, index) => (
                  <tr key={proveedor.proveedor_id} className="border-b">
                    <td className="p-3">
                      <div className="text-[0.875rem] font-medium">
                        {proveedor.proveedor_razon_social}
                      </div>
                      <div className="text-3 text-gray-500">
                        RUC: {proveedor.proveedor_ruc} • {proveedor.cantidad_cxp} cuenta{proveedor.cantidad_cxp !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td className="p-3 text-right text-[0.875rem]">
                      {proveedor.rango_0_30 > 0 ? formatCurrency(proveedor.rango_0_30) : '-'}
                    </td>
                    <td className="p-3 text-right text-[0.875rem]">
                      {proveedor.rango_31_60 > 0 ? formatCurrency(proveedor.rango_31_60) : '-'}
                    </td>
                    <td className="p-3 text-right text-[0.875rem]">
                      {proveedor.rango_61_90 > 0 ? formatCurrency(proveedor.rango_61_90) : '-'}
                    </td>
                    <td className="p-3 text-right text-[0.875rem] font-semibold">
                      {proveedor.rango_mas_90 > 0 ? formatCurrency(proveedor.rango_mas_90) : '-'}
                    </td>
                    <td className="p-3 text-right text-[0.875rem] font-bold text-gray-900">
                      {formatCurrency(proveedor.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
