'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  CreditCard,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Clock,
  CheckCircle
} from 'lucide-react'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  moneda: string
  saldo: number
}

interface PagoProximo {
  id: string
  numero_documento: string
  fecha_vencimiento: string
  saldo: number
  moneda: string
  dias_hasta_vencimiento: number
  urgencia: string
  proveedor: {
    razon_social: string
  }
}

interface ResumenFlujo {
  moneda: string
  saldo_actual: number
  total_ingresos: number
  total_egresos: number
  flujo_neto: number
  saldo_proyectado: number
  alerta: string | null
}

const URGENCIA_CONFIG = {
  VENCIDA: {
    label: 'Vencida',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
  },
  HOY: {
    label: 'Vence Hoy',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  URGENTE: {
    label: 'Urgente',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  PROXIMA: {
    label: 'Próxima',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
  },
  NORMAL: {
    label: 'Normal',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
  },
}

export default function TesoreriaPage() {
  const router = useRouter()
  const { get } = useApi({ retries: 1, timeoutMs: 8000 })
  
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [proximosPagos, setProximosPagos] = useState<PagoProximo[]>([])
  const [resumenFlujo, setResumenFlujo] = useState<ResumenFlujo[]>([])
  const [loading, setLoading] = useState(true)

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true)

      // Cargar cuentas bancarias
      const cuentasResponse = await get('/api/finanzas/bancos/cuentas')
      if (cuentasResponse?.success) {
        setCuentas(cuentasResponse.data || [])
      }

      // Cargar próximos pagos (próximos 15 días)
      const hoy = new Date()
      const en15Dias = new Date()
      en15Dias.setDate(hoy.getDate() + 15)
      
      const programacionResponse = await get(
        `/api/finanzas/tesoreria/programacion?fecha_hasta=${en15Dias.toISOString().split('T')[0]}&limit=10`
      )
      if (programacionResponse?.success) {
        setProximosPagos(programacionResponse.data || [])
      }

      // Cargar resumen de flujo de caja (próximos 30 días)
      const flujoResponse = await get('/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=30')
      if (flujoResponse?.success && flujoResponse.data?.resumen) {
        setResumenFlujo(flujoResponse.data.resumen || [])
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getUrgenciaBadge = (urgencia: string) => {
    const config = URGENCIA_CONFIG[urgencia as keyof typeof URGENCIA_CONFIG]
    if (!config) return null
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '500',
        background: config.color,
        color: 'white'
      }}>
        {config.label}
      </span>
    )
  }

  const totalSaldoPEN = cuentas
    .filter(c => c.moneda === 'PEN')
    .reduce((sum, c) => sum + c.saldo, 0)

  const totalSaldoUSD = cuentas
    .filter(c => c.moneda === 'USD')
    .reduce((sum, c) => sum + c.saldo, 0)

  const totalPorPagarPEN = proximosPagos
    .filter(p => p.moneda === 'PEN')
    .reduce((sum, p) => sum + p.saldo, 0)

  const totalPorPagarUSD = proximosPagos
    .filter(p => p.moneda === 'USD')
    .reduce((sum, p) => sum + p.saldo, 0)

  const pagosVencidos = proximosPagos.filter(p => p.urgencia === 'VENCIDA').length
  const pagosUrgentes = proximosPagos.filter(p => p.urgencia === 'HOY' || p.urgencia === 'URGENTE').length

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Tesorería</h1>
          <p className="dashboard-subtitle">Gestiona los pagos a proveedores y el flujo de caja</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadDashboardData}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando información de tesorería...</p>
        </div>
      ) : (
        <>
          {/* Saldos de Cuentas Bancarias */}
          <div className="activity-section">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Saldos Disponibles</h2>
              <button
                onClick={() => router.push('/dashboard/finanzas/bancos')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                Ver Todas las Cuentas
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              <div className="stat-card">
                <div className="stat-header">
                  <h3>SALDO PEN</h3>
                  <DollarSign className="stat-icon" style={{ color: '#10b981' }} />
                </div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                  {formatCurrency(totalSaldoPEN, 'PEN')}
                </div>
                <div className="stat-subtitle">
                  {cuentas.filter(c => c.moneda === 'PEN').length} cuenta(s)
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>SALDO USD</h3>
                  <DollarSign className="stat-icon" style={{ color: '#3b82f6' }} />
                </div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                  {formatCurrency(totalSaldoUSD, 'USD')}
                </div>
                <div className="stat-subtitle">
                  {cuentas.filter(c => c.moneda === 'USD').length} cuenta(s)
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>POR PAGAR (15 DÍAS)</h3>
                  <TrendingDown className="stat-icon" style={{ color: '#ef4444' }} />
                </div>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                  {formatCurrency(totalPorPagarPEN, 'PEN')}
                </div>
                <div className="stat-subtitle">
                  {proximosPagos.filter(p => p.moneda === 'PEN').length} pago(s)
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>ALERTAS</h3>
                  <AlertCircle className="stat-icon" style={{ color: '#f59e0b' }} />
                </div>
                <div className="stat-value">
                  {pagosVencidos + pagosUrgentes}
                </div>
                <div className="stat-subtitle">
                  {pagosVencidos} vencidos, {pagosUrgentes} urgentes
                </div>
              </div>
            </div>
          </div>

          {/* Resumen de Flujo de Caja */}
          {resumenFlujo.length > 0 && (
            <div className="activity-section">
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '1.5rem'
              }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Proyección de Flujo (30 días)</h2>
                <button
                  onClick={() => router.push('/dashboard/finanzas/tesoreria/flujo-caja')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  Ver Detalle
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                {resumenFlujo.map((resumen) => (
                  <div key={resumen.moneda} className="activity-card" style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.5rem' }}>
                        {resumen.moneda}
                      </h3>
                      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                        {formatCurrency(resumen.saldo_proyectado, resumen.moneda)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Saldo proyectado
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6b7280' }}>Ingresos:</span>
                        <span style={{ fontWeight: '600', color: '#10b981' }}>
                          +{formatCurrency(resumen.total_ingresos, resumen.moneda)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6b7280' }}>Egresos:</span>
                        <span style={{ fontWeight: '600', color: '#ef4444' }}>
                          -{formatCurrency(resumen.total_egresos, resumen.moneda)}
                        </span>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        paddingTop: '0.5rem',
                        borderTop: '1px solid #e5e7eb'
                      }}>
                        <span style={{ fontWeight: '600' }}>Flujo Neto:</span>
                        <span style={{ 
                          fontWeight: '700',
                          color: resumen.flujo_neto >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {resumen.flujo_neto >= 0 ? '+' : ''}{formatCurrency(resumen.flujo_neto, resumen.moneda)}
                        </span>
                      </div>
                    </div>

                    {resumen.alerta && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        background: resumen.alerta === 'SALDO_NEGATIVO' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                        color: resumen.alerta === 'SALDO_NEGATIVO' ? '#ef4444' : '#f59e0b',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <AlertCircle size={14} />
                        {resumen.alerta === 'SALDO_NEGATIVO' ? 'Saldo negativo proyectado' : 'Saldo bajo proyectado'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Próximos Pagos */}
          <div className="activity-section">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Próximos Pagos (15 días)</h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={() => router.push('/dashboard/finanzas/tesoreria/programacion')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Calendar size={16} />
                  Ver Programación
                </button>
                <button
                  onClick={() => router.push('/dashboard/finanzas/tesoreria/lote')}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <CreditCard size={16} />
                  Pago Masivo
                </button>
              </div>
            </div>

            <div className="activity-card">
              {proximosPagos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <CheckCircle size={48} style={{ margin: '0 auto 1rem', color: '#10b981' }} />
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    No hay pagos próximos
                  </h3>
                  <p>No hay cuentas por pagar con vencimiento en los próximos 15 días</p>
                </div>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Urgencia
                        </th>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Proveedor
                        </th>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          N° Documento
                        </th>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Vencimiento
                        </th>
                        <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Monto
                        </th>
                        <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {proximosPagos.map((pago) => (
                        <tr key={pago.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '1rem' }}>
                            {getUrgenciaBadge(pago.urgencia)}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                              {pago.proveedor?.razon_social || 'N/A'}
                            </div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                              {pago.numero_documento}
                            </div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem' }}>
                              {formatDate(pago.fecha_vencimiento)}
                            </div>
                            <div style={{ 
                              fontSize: '0.75rem', 
                              color: pago.dias_hasta_vencimiento < 0 ? '#ef4444' : '#6b7280'
                            }}>
                              {pago.dias_hasta_vencimiento < 0 
                                ? `Vencido hace ${Math.abs(pago.dias_hasta_vencimiento)} días`
                                : pago.dias_hasta_vencimiento === 0
                                ? 'Vence hoy'
                                : `Vence en ${pago.dias_hasta_vencimiento} días`
                              }
                            </div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#ef4444' }}>
                              {formatCurrency(pago.saldo, pago.moneda)}
                            </div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => router.push(`/dashboard/finanzas/cxp/${pago.id}`)}
                              style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#3b82f6',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              Ver Detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="activity-section">
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>Acciones Rápidas</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              <button
                onClick={() => router.push('/dashboard/finanzas/cxp')}
                className="activity-card"
                style={{
                  padding: '1.5rem',
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6'
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <Clock size={32} style={{ color: '#3b82f6', marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Ver Cuentas por Pagar
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Gestiona todas las cuentas por pagar a proveedores
                </p>
              </button>

              <button
                onClick={() => router.push('/dashboard/finanzas/tesoreria/programacion')}
                className="activity-card"
                style={{
                  padding: '1.5rem',
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6'
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <Calendar size={32} style={{ color: '#10b981', marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Programación de Pagos
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Planifica los pagos por fecha de vencimiento
                </p>
              </button>

              <button
                onClick={() => router.push('/dashboard/finanzas/tesoreria/lote')}
                className="activity-card"
                style={{
                  padding: '1.5rem',
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6'
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <CreditCard size={32} style={{ color: '#f59e0b', marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Pago Masivo
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Procesa múltiples pagos en una sola operación
                </p>
              </button>

              <button
                onClick={() => router.push('/dashboard/finanzas/bancos')}
                className="activity-card"
                style={{
                  padding: '1.5rem',
                  cursor: 'pointer',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6'
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <DollarSign size={32} style={{ color: '#8b5cf6', marginBottom: '1rem' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  Cuentas Bancarias
                </h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Administra las cuentas bancarias de la empresa
                </p>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
