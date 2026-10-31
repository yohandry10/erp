'use client'

import { useState } from 'react'
import { useFinanceReport } from '@/hooks/use-finance-report'
import FinanceReportStatus from './FinanceReportStatus'
import { readAgingReport, sumReportMoney } from '@/lib/finanzas/report-read-contract'
import { BarChart3, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react'
import { useCountryContext } from '@/hooks/use-country-context'

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
  onReadyChange?: (ready: boolean) => void
}

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const emptyRange = { cantidad: 0, monto: 0 }

const normalizeAgingData = (raw: any, moneda: string): AgingData => {
  const resumen: any = Object.fromEntries(['rango_0_30','rango_31_60','rango_61_90','rango_mas_90','total'].map(key => [key,{ cantidad:0,monto:0 }]))
  const providers = new Map<string, any>()
  const detalle = raw.detalle.filter((row: any) => row.moneda === moneda)
  for (const row of detalle) {
    if (row.dias_vencidos <= 0) continue
    resumen[row.rango].cantidad += 1
    resumen[row.rango].monto = sumReportMoney([resumen[row.rango].monto, row.saldo])
    resumen.total.cantidad += 1
    resumen.total.monto = sumReportMoney([resumen.total.monto, row.saldo])
    const provider = providers.get(row.proveedor_id) ?? { proveedor_id:row.proveedor_id,
      proveedor_razon_social:row.proveedor_razon_social,proveedor_ruc:row.proveedor_ruc,
      rango_0_30:0,rango_31_60:0,rango_61_90:0,rango_mas_90:0,por_vencer:0,total:0,cantidad_cxp:0 }
    provider[row.rango] = sumReportMoney([provider[row.rango],row.saldo])
    provider.total = sumReportMoney([provider.total,row.saldo]); provider.cantidad_cxp += 1
    providers.set(row.proveedor_id,provider)
  }
  return { fecha_reporte:raw.fecha_reporte,resumen,detalle,
    por_proveedor:Array.from(providers.values()).sort((a,b) => b.total-a.total) }
}

export default function AgingCxpChart({ proveedorId, onReadyChange }: AgingCxpChartProps) {
  const country = useCountryContext()
  const taxIdLabel = country.paisCodigo === 'AR' ? 'CUIT' : country.paisCodigo === 'CO' ? 'NIT' : 'RUC'
  const [selectedMoneda, setSelectedMoneda] = useState(country.moneda || 'PEN')
  const { data, loading, error, reload: loadAgingData } = useFinanceReport(
    `/api/finanzas/cxp/aging${proveedorId ? `?proveedor_id=${proveedorId}` : ''}`, readAgingReport, onReadyChange)
  const monedas = Array.from(new Set<string>((data?.detalle ?? []).map((row: any) => row.moneda))).sort()
  const moneda = monedas.includes(selectedMoneda) ? selectedMoneda : monedas[0] || country.moneda || 'PEN'
  const agingData = data ? normalizeAgingData(data, moneda) : null

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: moneda,
    }).format(toNumber(amount))
  }

  if (loading || error) return <FinanceReportStatus loading={loading} retry={loadAgingData} />

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
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl p-8 text-center">
        <BarChart3 size={48} className="text-muted-foreground" />
        <h3 className="text-[1.125rem] font-semibold mb-2 text-foreground/85">
          No hay cuentas vencidas
        </h3>
        <p className="text-muted-foreground">
          {monedas.length ? `Todas las cuentas por pagar en ${moneda} están al día` : 'No hay cuentas por pagar pendientes en el corte consultado'}
        </p>
        {monedas.length > 1 && <select aria-label="Moneda Aging" value={moneda} onChange={event => setSelectedMoneda(event.target.value)}>{monedas.map(code => <option key={code} value={code}>{code}</option>)}</select>}
        <button type="button" onClick={loadAgingData} className="mt-4 rounded border px-4 py-2">Actualizar</button>
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
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      <div className="mb-4"><label htmlFor="aging-cxp-moneda">Moneda</label><select id="aging-cxp-moneda" value={moneda} onChange={event => setSelectedMoneda(event.target.value)} className="ml-3 rounded border p-2">{monedas.map(code => <option key={code} value={code}>{code}</option>)}</select></div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-blue-500" />
          <div>
            <h3 className="text-[1.125rem] font-semibold text-foreground">
              Aging de Cuentas por Pagar
            </h3>
            <p className="text-[0.875rem] text-muted-foreground mt-1">
              Antigüedad de deudas vencidas
            </p>
          </div>
        </div>
        <button
          onClick={loadAgingData} className="py-2 px-4 rounded-[6px] border bg-card cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-8">
        <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
          <div className="text-xs font-semibold text-muted-foreground">
            Total Vencido
          </div>
          <div className="text-[1.75rem] font-bold mt-2 text-foreground">
            {formatCurrency(resumen.total.monto)}
          </div>
          <div className="text-[0.875rem] mt-1 text-muted-foreground">
            {resumen.total.cantidad} cuenta{resumen.total.cantidad !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
          <div className="text-xs font-semibold text-muted-foreground">
            Más Crítico (+90 días)
          </div>
          <div className="text-[1.75rem] font-bold mt-2 text-rose-400">
            {formatCurrency(resumen.rango_mas_90.monto)}
          </div>
          <div className="text-[0.875rem] mt-1 text-muted-foreground">
            {resumen.rango_mas_90.cantidad} cuenta{resumen.rango_mas_90.cantidad !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Aging Bars */}
      <div className="mb-8">
        <h4 className="text-[0.875rem] font-semibold text-foreground/85 mb-4">
          Distribución por Antigüedad
        </h4>
        <div className="flex flex-col gap-4">
          {ranges.map((range, index) => (
            <div key={index}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[0.875rem] font-medium text-foreground/85">
                  {range.label}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    {range.cantidad} cuenta{range.cantidad !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[0.875rem] font-semibold">
                    {formatCurrency(range.monto)}
                  </span>
                </div>
              </div>
              <div className="w-[100%] h-8 rounded-[6px] overflow-hidden relative">
                <div className="h-[100%] transition flex items-center justify-end pr-3" style={{ width: `${range.percentage}%`, backgroundColor: range.color }}>
                  {range.percentage > 15 && (
                    <span className="text-xs font-semibold text-white">
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
            <h4 className="text-[0.875rem] font-semibold text-foreground/85">
              Proveedores con Mayor Deuda Vencida
            </h4>
          </div>
          <div className="overflow-auto">
            <table className="w-[100%]">
              <thead>
                <tr>
                  <th className="text-left p-3 font-semibold text-xs text-muted-foreground">
                    Proveedor
                  </th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">
                    0-30
                  </th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">
                    31-60
                  </th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">
                    61-90
                  </th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">
                    +90
                  </th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">
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
                      <div className="text-xs text-muted-foreground">
                        {taxIdLabel}: {proveedor.proveedor_ruc} • {proveedor.cantidad_cxp} cuenta{proveedor.cantidad_cxp !== 1 ? 's' : ''}
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
                    <td className="p-3 text-right text-[0.875rem] font-bold text-foreground">
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
