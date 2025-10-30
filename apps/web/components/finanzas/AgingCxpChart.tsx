'use client'

import { useEffect, useState } from 'react'
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

export default function AgingCxpChart({ proveedorId }: AgingCxpChartProps) {
  const { get } = useApi()
  const [agingData, setAgingData] = useState<AgingData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadAgingData = async () => {
    try {
      setLoading(true)
      const params = proveedorId ? `?proveedor_id=${proveedorId}` : ''
      const response = await get(`/api/finanzas/cxp/aging${params}`)
      
      if (response?.success) {
        setAgingData(response.data)
      }
    } catch (error) {
      console.error('Error loading aging data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgingData()
  }, [proveedorId])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="activity-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#6b7280' }}>Cargando reporte de aging...</p>
      </div>
    )
  }

  if (!agingData || agingData.resumen.total.cantidad === 0) {
    return (
      <div className="activity-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <BarChart3 size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
          No hay cuentas vencidas
        </h3>
        <p style={{ color: '#6b7280' }}>
          Todas las cuentas por pagar están al día
        </p>
      </div>
    )
  }

  const { resumen, por_proveedor } = agingData

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
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BarChart3 size={24} style={{ color: '#3b82f6' }} />
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
              Aging de Cuentas por Pagar
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Antigüedad de deudas vencidas
            </p>
          </div>
        </div>
        <button
          onClick={loadAgingData}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: 'white'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', opacity: 0.9 }}>
            Total Vencido
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '0.5rem' }}>
            {formatCurrency(resumen.total.monto)}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', opacity: 0.9 }}>
            {resumen.total.cantidad} cuenta{resumen.total.cantidad !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', color: '#991b1b' }}>
            Más Crítico (+90 días)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '0.5rem', color: '#dc2626' }}>
            {formatCurrency(resumen.rango_mas_90.monto)}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#991b1b' }}>
            {resumen.rango_mas_90.cantidad} cuenta{resumen.rango_mas_90.cantidad !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Aging Bars */}
      <div style={{ marginBottom: '2rem' }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
          Distribución por Antigüedad
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {ranges.map((range, index) => (
            <div key={index}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '0.5rem'
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                  {range.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {range.cantidad} cuenta{range.cantidad !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: range.color }}>
                    {formatCurrency(range.monto)}
                  </span>
                </div>
              </div>
              <div style={{
                width: '100%',
                height: '32px',
                background: range.bgColor,
                borderRadius: '6px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${range.percentage}%`,
                  height: '100%',
                  background: range.color,
                  transition: 'width 0.5s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '0.75rem'
                }}>
                  {range.percentage > 15 && (
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: '600', 
                      color: 'white' 
                    }}>
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
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            <AlertTriangle size={18} style={{ color: '#ef4444' }} />
            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
              Proveedores con Mayor Deuda Vencida
            </h4>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ 
                    textAlign: 'left', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Proveedor
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    0-30
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    31-60
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    61-90
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    +90
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {por_proveedor.slice(0, 10).map((proveedor, index) => (
                  <tr key={proveedor.proveedor_id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                        {proveedor.proveedor_razon_social}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        RUC: {proveedor.proveedor_ruc} • {proveedor.cantidad_cxp} cuenta{proveedor.cantidad_cxp !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      color: proveedor.rango_0_30 > 0 ? '#f59e0b' : '#9ca3af'
                    }}>
                      {proveedor.rango_0_30 > 0 ? formatCurrency(proveedor.rango_0_30) : '-'}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      color: proveedor.rango_31_60 > 0 ? '#f97316' : '#9ca3af'
                    }}>
                      {proveedor.rango_31_60 > 0 ? formatCurrency(proveedor.rango_31_60) : '-'}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      color: proveedor.rango_61_90 > 0 ? '#ef4444' : '#9ca3af'
                    }}>
                      {proveedor.rango_61_90 > 0 ? formatCurrency(proveedor.rango_61_90) : '-'}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: proveedor.rango_mas_90 > 0 ? '#dc2626' : '#9ca3af'
                    }}>
                      {proveedor.rango_mas_90 > 0 ? formatCurrency(proveedor.rango_mas_90) : '-'}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      fontWeight: '700',
                      color: '#111827'
                    }}>
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
