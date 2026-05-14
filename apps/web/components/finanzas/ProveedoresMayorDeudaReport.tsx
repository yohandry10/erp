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
      <div className="activity-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#6b7280' }}>Cargando proveedores con mayor deuda...</p>
      </div>
    )
  }

  if (proveedores.length === 0) {
    return (
      <div className="activity-card" style={{ padding: '3rem', textAlign: 'center' }}>
        <TrendingDown size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
          No hay deudas pendientes
        </h3>
        <p style={{ color: '#6b7280' }}>
          No hay proveedores con deuda pendiente
        </p>
      </div>
    )
  }

  const maxDeuda = Math.max(...proveedores.map(p => p.deuda_total))

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
          <TrendingDown size={24} style={{ color: '#ef4444' }} />
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
              Proveedores con Mayor Deuda
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Top {proveedores.length} proveedores por deuda pendiente
            </p>
          </div>
        </div>
        <button
          onClick={loadProveedores}
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
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', opacity: 0.9 }}>
            Deuda Total
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '0.5rem' }}>
            {formatCurrency(getTotalDeuda())}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', opacity: 0.9 }}>
            {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}
          </div>
        </div>

        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', color: '#991b1b' }}>
            Deuda Vencida
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '0.5rem', color: '#dc2626' }}>
            {formatCurrency(getTotalVencida())}
          </div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#991b1b' }}>
            {((getTotalVencida() / getTotalDeuda()) * 100).toFixed(1)}% del total
          </div>
        </div>
      </div>

      {/* Proveedores List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {proveedores.map((proveedor, index) => {
          const porcentajeVencida = (proveedor.deuda_vencida / proveedor.deuda_total) * 100
          const barWidth = (proveedor.deuda_total / maxDeuda) * 100
          
          return (
            <div
              key={proveedor.proveedor_id}
              style={{
                padding: '1.5rem',
                borderRadius: '12px',
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'white',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                    <span style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: index < 3 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'rgba(107, 114, 128, 0.1)',
                      color: index < 3 ? 'white' : '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.875rem',
                      fontWeight: '700'
                    }}>
                      {index + 1}
                    </span>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                        {proveedor.razon_social}
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        RUC: {proveedor.ruc} • {proveedor.cantidad_cxp} cuenta{proveedor.cantidad_cxp !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827' }}>
                    {formatCurrency(proveedor.deuda_total)}
                  </div>
                  {proveedor.monedas.length > 1 && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Multi-moneda
                    </div>
                  )}
                </div>
              </div>

              {/* Deuda Bar */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{
                  width: '100%',
                  height: '32px',
                  background: 'rgba(0,0,0,0.05)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  <div style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
                    transition: 'width 0.5s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: '0.75rem'
                  }}>
                    {barWidth > 20 && (
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600', 
                        color: 'white' 
                      }}>
                        {barWidth.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Deuda Vencida
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#dc2626' }}>
                    {formatCurrency(proveedor.deuda_vencida)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>
                    {porcentajeVencida.toFixed(1)}% del total
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Por Vencer
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#f59e0b' }}>
                    {formatCurrency(proveedor.deuda_por_vencer)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Días Prom. Vencimiento
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    {proveedor.dias_promedio_vencimiento > 0 
                      ? `${proveedor.dias_promedio_vencimiento} días`
                      : 'Al día'
                    }
                  </div>
                </div>
              </div>

              {/* Alert for high overdue */}
              {porcentajeVencida > 50 && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertTriangle size={16} style={{ color: '#dc2626' }} />
                  <span style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: '500' }}>
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
