'use client'

import { useCallback, useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { TrendingUp, RefreshCw, AlertTriangle, TrendingDown, Calendar } from 'lucide-react'

interface FlujoCajaItem {
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
  items: FlujoCajaItem[]
}

interface ResumenMoneda {
  moneda: string
  saldo_actual: number
  total_ingresos: number
  total_egresos: number
  flujo_neto: number
  saldo_proyectado: number
  alerta: 'SALDO_NEGATIVO' | 'SALDO_BAJO' | null
}

interface FlujoCajaData {
  periodo: {
    fecha_desde: string
    fecha_hasta: string
    dias: number
  }
  cuentas_bancarias: Array<{
    id: string
    nombre: string
    banco: string
    numero_cuenta: string
    moneda: string
    saldo_actual: number
  }>
  resumen: ResumenMoneda[]
  proyeccion: ProyeccionDia[]
  estadisticas: {
    total_cxp_pendientes: number
    total_cxc_pendientes: number
    total_movimientos: number
  }
}

interface FlujoCajaChartProps {
  diasProyeccion?: number
  cuentaBancariaId?: string
}

export default function FlujoCajaChart({ diasProyeccion = 90, cuentaBancariaId }: FlujoCajaChartProps) {
  const { get } = useApi()
  const [flujoCaja, setFlujoCaja] = useState<FlujoCajaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMoneda, setSelectedMoneda] = useState<string>('PEN')
  const [vistaDetallada, setVistaDetallada] = useState(false)

  const loadFlujoCaja = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append('dias_proyeccion', diasProyeccion.toString())
      if (cuentaBancariaId) params.append('cuenta_bancaria_id', cuentaBancariaId)
      
      const response = await get(`/api/finanzas/tesoreria/flujo-caja?${params.toString()}`)
      
      if (response?.success) {
        setFlujoCaja(response.data)
        if (response.data.resumen.length > 0) {
          setSelectedMoneda(response.data.resumen[0].moneda)
        }
      }
    } catch (error) {
      console.error('Error loading flujo caja:', error)
    } finally {
      setLoading(false)
    }
  }, [cuentaBancariaId, diasProyeccion, get])

  useEffect(() => {
    loadFlujoCaja()
  }, [loadFlujoCaja])

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

  const getAlertaStyle = (alerta: string | null) => {
    switch (alerta) {
      case 'SALDO_NEGATIVO':
        return { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', icon: AlertTriangle }
      case 'SALDO_BAJO':
        return { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', icon: AlertTriangle }
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="activity-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#6b7280' }}>Cargando proyección de flujo de caja...</p>
      </div>
    )
  }

  if (!flujoCaja || flujoCaja.resumen.length === 0) {
    return (
      <div className="activity-card" style={{ padding: '3rem', textAlign: 'center' }}>
        <TrendingUp size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
          No hay datos para proyectar
        </h3>
        <p style={{ color: '#6b7280' }}>
          No se encontraron cuentas bancarias activas o movimientos pendientes
        </p>
      </div>
    )
  }

  const resumenSeleccionado = flujoCaja.resumen.find(r => r.moneda === selectedMoneda) || flujoCaja.resumen[0]
  const proyeccionFiltrada = flujoCaja.proyeccion.filter(p => p.moneda === selectedMoneda)
  
  // Calculate max values for chart scaling
  const maxSaldo = Math.max(...proyeccionFiltrada.map(p => Math.max(p.saldo_inicial, p.saldo_final)))
  const minSaldo = Math.min(...proyeccionFiltrada.map(p => Math.min(p.saldo_inicial, p.saldo_final)))
  const maxFlujo = Math.max(...proyeccionFiltrada.map(p => Math.abs(p.flujo_neto)))

  // Group by week for better visualization
  const proyeccionSemanal = proyeccionFiltrada.reduce((acc, dia, index) => {
    const semana = Math.floor(index / 7)
    if (!acc[semana]) {
      acc[semana] = {
        fecha_inicio: dia.fecha,
        fecha_fin: dia.fecha,
        ingresos: 0,
        egresos: 0,
        flujo_neto: 0,
        saldo_final: dia.saldo_final,
        dias: []
      }
    }
    acc[semana].fecha_fin = dia.fecha
    acc[semana].ingresos += dia.ingresos
    acc[semana].egresos += dia.egresos
    acc[semana].flujo_neto += dia.flujo_neto
    acc[semana].saldo_final = dia.saldo_final
    acc[semana].dias.push(dia)
    return acc
  }, [] as any[])

  const alertaStyle = getAlertaStyle(resumenSeleccionado.alerta)

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
          <TrendingUp size={24} style={{ color: '#10b981' }} />
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
              Flujo de Caja Proyectado
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              {formatDate(flujoCaja.periodo.fecha_desde)} - {formatDate(flujoCaja.periodo.fecha_hasta)} ({flujoCaja.periodo.dias} días)
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setVistaDetallada(!vistaDetallada)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: vistaDetallada ? '#3b82f6' : 'white',
              color: vistaDetallada ? 'white' : '#374151',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            {vistaDetallada ? 'Vista Semanal' : 'Vista Diaria'}
          </button>
          <button
            onClick={loadFlujoCaja}
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
      </div>

      {/* Currency Selector */}
      {flujoCaja.resumen.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
            Moneda
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {flujoCaja.resumen.map((resumen) => (
              <button
                key={resumen.moneda}
                onClick={() => setSelectedMoneda(resumen.moneda)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: selectedMoneda === resumen.moneda ? '2px solid #10b981' : '1px solid #d1d5db',
                  background: selectedMoneda === resumen.moneda ? 'rgba(16, 185, 129, 0.1)' : 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: selectedMoneda === resumen.moneda ? '#059669' : '#374151'
                }}
              >
                {resumen.moneda}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
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
            Saldo Actual
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '0.5rem' }}>
            {formatCurrency(resumenSeleccionado.saldo_actual, selectedMoneda)}
          </div>
        </div>

        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.2)'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', color: '#065f46' }}>
            Ingresos Proyectados
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '0.5rem', color: '#059669' }}>
            +{formatCurrency(resumenSeleccionado.total_ingresos, selectedMoneda)}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#065f46' }}>
            {flujoCaja.estadisticas.total_cxc_pendientes} CxC pendientes
          </div>
        </div>

        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', color: '#991b1b' }}>
            Egresos Proyectados
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', marginTop: '0.5rem', color: '#dc2626' }}>
            -{formatCurrency(resumenSeleccionado.total_egresos, selectedMoneda)}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#991b1b' }}>
            {flujoCaja.estadisticas.total_cxp_pendientes} CxP pendientes
          </div>
        </div>

        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: resumenSeleccionado.saldo_proyectado >= resumenSeleccionado.saldo_actual
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', opacity: 0.9 }}>
            Saldo Proyectado
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '0.5rem' }}>
            {formatCurrency(resumenSeleccionado.saldo_proyectado, selectedMoneda)}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.9 }}>
            Flujo neto: {formatCurrency(resumenSeleccionado.flujo_neto, selectedMoneda)}
          </div>
        </div>
      </div>

      {/* Alert */}
      {alertaStyle && (
        <div style={{
          marginBottom: '2rem',
          padding: '1rem',
          borderRadius: '8px',
          background: alertaStyle.bg,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <alertaStyle.icon size={20} style={{ color: alertaStyle.color }} />
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: alertaStyle.color }}>
              {resumenSeleccionado.alerta === 'SALDO_NEGATIVO' && 'Alerta: Saldo Negativo Proyectado'}
              {resumenSeleccionado.alerta === 'SALDO_BAJO' && 'Advertencia: Saldo Bajo Proyectado'}
            </div>
            <div style={{ fontSize: '0.75rem', color: alertaStyle.color, marginTop: '0.25rem' }}>
              {resumenSeleccionado.alerta === 'SALDO_NEGATIVO' && 'El saldo proyectado será negativo. Considere ajustar pagos o buscar financiamiento.'}
              {resumenSeleccionado.alerta === 'SALDO_BAJO' && 'El saldo proyectado será menor al 20% del saldo actual. Monitoree de cerca.'}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ marginBottom: '2rem' }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
          {vistaDetallada ? 'Proyección Diaria' : 'Proyección Semanal'}
        </h4>
        
        {!vistaDetallada ? (
          // Weekly View
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {proyeccionSemanal.map((semana, index) => {
              const barWidth = maxFlujo > 0 ? (Math.abs(semana.flujo_neto) / maxFlujo) * 100 : 0
              const isPositive = semana.flujo_neto >= 0
              
              return (
                <div key={index}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <div>
                      <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                        Semana {index + 1}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                        {formatDate(semana.fecha_inicio)} - {formatDate(semana.fecha_fin)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Flujo Neto</div>
                        <div style={{ 
                          fontSize: '0.875rem', 
                          fontWeight: '600', 
                          color: isPositive ? '#059669' : '#dc2626' 
                        }}>
                          {isPositive ? '+' : ''}{formatCurrency(semana.flujo_neto, selectedMoneda)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Saldo Final</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          {formatCurrency(semana.saldo_final, selectedMoneda)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '40px',
                    background: 'rgba(0,0,0,0.05)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      width: `${barWidth}%`,
                      height: '100%',
                      background: isPositive 
                        ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
                      transition: 'width 0.5s ease',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: '0.75rem',
                      paddingRight: '0.75rem',
                      justifyContent: 'space-between'
                    }}>
                      {barWidth > 15 && (
                        <>
                          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'white' }}>
                            ↑ {formatCurrency(semana.ingresos, selectedMoneda)}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'white' }}>
                            ↓ {formatCurrency(semana.egresos, selectedMoneda)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // Daily View - Show only first 30 days for readability
          <div style={{ maxHeight: '600px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ 
                    textAlign: 'left', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Fecha
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Saldo Inicial
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Ingresos
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Egresos
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Flujo Neto
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: '#6b7280' 
                  }}>
                    Saldo Final
                  </th>
                </tr>
              </thead>
              <tbody>
                {proyeccionFiltrada.slice(0, 30).map((dia, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {formatDate(dia.fecha)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem' }}>
                      {formatCurrency(dia.saldo_inicial, selectedMoneda)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      color: dia.ingresos > 0 ? '#059669' : '#9ca3af',
                      fontWeight: dia.ingresos > 0 ? '600' : 'normal'
                    }}>
                      {dia.ingresos > 0 ? '+' : ''}{formatCurrency(dia.ingresos, selectedMoneda)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      color: dia.egresos > 0 ? '#dc2626' : '#9ca3af',
                      fontWeight: dia.egresos > 0 ? '600' : 'normal'
                    }}>
                      {dia.egresos > 0 ? '-' : ''}{formatCurrency(dia.egresos, selectedMoneda)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: dia.flujo_neto >= 0 ? '#059669' : '#dc2626'
                    }}>
                      {dia.flujo_neto >= 0 ? '+' : ''}{formatCurrency(dia.flujo_neto, selectedMoneda)}
                    </td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right', 
                      fontSize: '0.875rem',
                      fontWeight: '700',
                      color: dia.saldo_final < 0 ? '#dc2626' : '#111827'
                    }}>
                      {formatCurrency(dia.saldo_final, selectedMoneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {proyeccionFiltrada.length > 30 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                Mostrando primeros 30 días de {proyeccionFiltrada.length} días proyectados
              </div>
            )}
          </div>
        )}
      </div>

      {/* Statistics */}
      <div style={{
        padding: '1rem',
        borderRadius: '8px',
        background: 'rgba(59, 130, 246, 0.05)',
        border: '1px solid rgba(59, 130, 246, 0.1)'
      }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>
          Estadísticas de Proyección
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Total Movimientos</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
              {flujoCaja.estadisticas.total_movimientos}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>CxC Pendientes</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#059669' }}>
              {flujoCaja.estadisticas.total_cxc_pendientes}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>CxP Pendientes</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#dc2626' }}>
              {flujoCaja.estadisticas.total_cxp_pendientes}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Cuentas Bancarias</div>
            <div style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
              {flujoCaja.cuentas_bancarias.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
