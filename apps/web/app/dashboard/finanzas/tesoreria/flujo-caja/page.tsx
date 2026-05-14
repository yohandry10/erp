'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  DollarSign,
  Download,
  Filter
} from 'lucide-react'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  moneda: string
  saldo_actual: number
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

interface ItemProyeccion {
  tipo: 'INGRESO' | 'EGRESO'
  concepto: string
  descripcion: string
  monto: number
  referencia_id: string
}

interface ProyeccionDia {
  fecha: string
  moneda: string
  saldo_inicial: number
  ingresos: number
  egresos: number
  flujo_neto: number
  saldo_final: number
  items: ItemProyeccion[]
}

interface FlujoCajaData {
  periodo: {
    fecha_desde: string
    fecha_hasta: string
    dias: number
  }
  cuentas_bancarias: CuentaBancaria[]
  resumen: ResumenFlujo[]
  proyeccion: ProyeccionDia[]
  estadisticas: {
    total_cxp_pendientes: number
    total_cxc_pendientes: number
    total_movimientos: number
  }
}

export default function FlujoCajaPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [flujoCajaData, setFlujoCajaData] = useState<FlujoCajaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [diasProyeccion, setDiasProyeccion] = useState(90)
  const [monedaFiltro, setMonedaFiltro] = useState<string>('TODAS')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const loadFlujoCaja = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=${diasProyeccion}`)
      
      if (response?.success) {
        setFlujoCajaData(response.data)
      }
    } catch (error) {
      console.error('Error loading flujo de caja:', error)
    } finally {
      setLoading(false)
    }
  }, [get, diasProyeccion])

  useEffect(() => {
    loadFlujoCaja()
  }, [loadFlujoCaja])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const toggleDayExpansion = (fecha: string) => {
    const newExpanded = new Set(expandedDays)
    if (newExpanded.has(fecha)) {
      newExpanded.delete(fecha)
    } else {
      newExpanded.add(fecha)
    }
    setExpandedDays(newExpanded)
  }

  const proyeccionFiltrada = flujoCajaData?.proyeccion.filter(
    p => monedaFiltro === 'TODAS' || p.moneda === monedaFiltro
  ) || []

  const monedasDisponibles = Array.from(
    new Set(flujoCajaData?.proyeccion.map(p => p.moneda) || [])
  )

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => router.push('/dashboard/finanzas/tesoreria')}
            aria-label="Volver a tesorería"
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="dashboard-title">Proyección de Flujo de Caja</h1>
            <p className="dashboard-subtitle">
              Visualiza los ingresos y egresos proyectados para los próximos {diasProyeccion} días
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadFlujoCaja}
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
          <p>Generando proyección de flujo de caja...</p>
        </div>
      ) : !flujoCajaData ? (
        <div className="activity-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            Error al cargar datos
          </h3>
          <p style={{ color: '#6b7280' }}>No se pudo cargar la proyección de flujo de caja</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="activity-section">
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={16} style={{ color: '#6b7280' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                  Filtros:
                </span>
              </div>
              
              <select
                value={diasProyeccion}
                onChange={(e) => setDiasProyeccion(Number(e.target.value))}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                <option value={30}>30 días</option>
                <option value={60}>60 días</option>
                <option value={90}>90 días</option>
                <option value={180}>180 días</option>
              </select>

              {monedasDisponibles.length > 1 && (
                <select
                  value={monedaFiltro}
                  onChange={(e) => setMonedaFiltro(e.target.value)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="TODAS">Todas las monedas</option>
                  {monedasDisponibles.map(moneda => (
                    <option key={moneda} value={moneda}>{moneda}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="activity-section">
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem' }}>
              Resumen por Moneda
            </h2>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {flujoCajaData.resumen.map((resumen) => (
                <div key={resumen.moneda} className="activity-card" style={{ padding: '1.5rem' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.5rem' }}>
                      {resumen.moneda}
                    </h3>
                    <div style={{ fontSize: '2rem', fontWeight: '700', color: '#111827' }}>
                      {formatCurrency(resumen.saldo_proyectado, resumen.moneda)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Saldo proyectado al final del período
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.75rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Saldo actual:</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                        {formatCurrency(resumen.saldo_actual, resumen.moneda)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <TrendingUp size={16} style={{ color: '#10b981' }} />
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Ingresos:</span>
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#10b981' }}>
                        +{formatCurrency(resumen.total_ingresos, resumen.moneda)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <TrendingDown size={16} style={{ color: '#ef4444' }} />
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Egresos:</span>
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#ef4444' }}>
                        -{formatCurrency(resumen.total_egresos, resumen.moneda)}
                      </span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid #e5e7eb'
                    }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>Flujo Neto:</span>
                      <span style={{ 
                        fontSize: '1rem',
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
                      padding: '0.75rem',
                      borderRadius: '6px',
                      background: resumen.alerta === 'SALDO_NEGATIVO' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: resumen.alerta === 'SALDO_NEGATIVO' ? '#ef4444' : '#f59e0b',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertCircle size={16} />
                      {resumen.alerta === 'SALDO_NEGATIVO' 
                        ? '⚠️ Saldo negativo proyectado' 
                        : '⚠️ Saldo bajo proyectado (< 20% del actual)'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Statistics */}
          <div className="activity-section">
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="stat-card">
                <div className="stat-header">
                  <h3>CUENTAS BANCARIAS</h3>
                  <DollarSign className="stat-icon" style={{ color: '#3b82f6' }} />
                </div>
                <div className="stat-value">
                  {flujoCajaData.cuentas_bancarias.length}
                </div>
                <div className="stat-subtitle">
                  Cuentas activas
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>CXP PENDIENTES</h3>
                  <TrendingDown className="stat-icon" style={{ color: '#ef4444' }} />
                </div>
                <div className="stat-value">
                  {flujoCajaData.estadisticas.total_cxp_pendientes}
                </div>
                <div className="stat-subtitle">
                  Egresos proyectados
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>CXC PENDIENTES</h3>
                  <TrendingUp className="stat-icon" style={{ color: '#10b981' }} />
                </div>
                <div className="stat-value">
                  {flujoCajaData.estadisticas.total_cxc_pendientes}
                </div>
                <div className="stat-subtitle">
                  Ingresos proyectados
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>DÍAS CON MOVIMIENTOS</h3>
                  <Calendar className="stat-icon" style={{ color: '#8b5cf6' }} />
                </div>
                <div className="stat-value">
                  {proyeccionFiltrada.length}
                </div>
                <div className="stat-subtitle">
                  De {flujoCajaData.periodo.dias} días totales
                </div>
              </div>
            </div>
          </div>

          {/* Daily Projection */}
          <div className="activity-section">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                Proyección Día por Día
              </h2>
            </div>

            <div className="activity-card">
              {proyeccionFiltrada.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                  <Calendar size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    No hay movimientos proyectados
                  </h3>
                  <p>No se encontraron ingresos o egresos para el período seleccionado</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {proyeccionFiltrada.map((dia, index) => {
                    const isExpanded = expandedDays.has(dia.fecha)
                    const isNegative = dia.saldo_final < 0
                    const isLow = dia.saldo_final < dia.saldo_inicial * 0.2 && dia.saldo_final >= 0
                    
                    return (
                      <div 
                        key={`${dia.fecha}-${dia.moneda}`}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: isNegative ? 'rgba(239, 68, 68, 0.02)' : 'white'
                        }}
                      >
                        {/* Day Header */}
                        <div
                          onClick={() => toggleDayExpansion(dia.fecha)}
                          style={{
                            padding: '1rem 1.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: isExpanded ? '#f9fafb' : 'white',
                            transition: 'background 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                            <div style={{ minWidth: '140px' }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                                {formatDate(dia.fecha)}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                {dia.moneda}
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '2rem', flex: 1 }}>
                              <div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                  Ingresos
                                </div>
                                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#10b981' }}>
                                  +{formatCurrency(dia.ingresos, dia.moneda)}
                                </div>
                              </div>
                              
                              <div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                  Egresos
                                </div>
                                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#ef4444' }}>
                                  -{formatCurrency(dia.egresos, dia.moneda)}
                                </div>
                              </div>
                              
                              <div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                  Flujo Neto
                                </div>
                                <div style={{ 
                                  fontSize: '0.875rem', 
                                  fontWeight: '700',
                                  color: dia.flujo_neto >= 0 ? '#10b981' : '#ef4444'
                                }}>
                                  {dia.flujo_neto >= 0 ? '+' : ''}{formatCurrency(dia.flujo_neto, dia.moneda)}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                                Saldo Final
                              </div>
                              <div style={{ 
                                fontSize: '1rem', 
                                fontWeight: '700',
                                color: isNegative ? '#ef4444' : '#111827'
                              }}>
                                {formatCurrency(dia.saldo_final, dia.moneda)}
                              </div>
                            </div>

                            {(isNegative || isLow) && (
                              <AlertCircle 
                                size={20} 
                                style={{ color: isNegative ? '#ef4444' : '#f59e0b' }} 
                              />
                            )}

                            <div style={{ 
                              fontSize: '1.25rem',
                              color: '#6b7280',
                              transition: 'transform 0.2s ease',
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                            }}>
                              ▼
                            </div>
                          </div>
                        </div>

                        {/* Day Details */}
                        {isExpanded && dia.items.length > 0 && (
                          <div style={{ 
                            padding: '1rem 1.5rem',
                            background: '#f9fafb',
                            borderTop: '1px solid #e5e7eb'
                          }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                              Detalle de Movimientos ({dia.items.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {dia.items.map((item, itemIndex) => (
                                <div 
                                  key={itemIndex}
                                  style={{
                                    padding: '0.75rem 1rem',
                                    background: 'white',
                                    borderRadius: '6px',
                                    border: '1px solid #e5e7eb',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    {item.tipo === 'INGRESO' ? (
                                      <TrendingUp size={18} style={{ color: '#10b981' }} />
                                    ) : (
                                      <TrendingDown size={18} style={{ color: '#ef4444' }} />
                                    )}
                                    <div>
                                      <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                                        {item.concepto}
                                      </div>
                                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                        {item.descripcion}
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ 
                                    fontSize: '0.875rem', 
                                    fontWeight: '600',
                                    color: item.tipo === 'INGRESO' ? '#10b981' : '#ef4444'
                                  }}>
                                    {item.tipo === 'INGRESO' ? '+' : '-'}{formatCurrency(item.monto, dia.moneda)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
