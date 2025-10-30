'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Calendar, TrendingUp, AlertCircle, FileText, DollarSign } from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface CentroCosto {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

interface Periodo {
  id: string
  anio: number
  mes: number
  estado: string
}

interface PresupuestoItem {
  id: string
  cuenta_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  monto_presupuestado: number
  monto_ejecutado: number
  porcentaje_ejecutado: number
  monto_disponible: number
  alerta: 'NORMAL' | 'ADVERTENCIA' | 'SOBREGIRO' | null
}

interface ReporteGastos {
  centro_costo: CentroCosto
  periodo: {
    fecha_desde: string
    fecha_hasta: string
  }
  gastos_por_cuenta: Array<{
    cuenta_codigo: string
    cuenta_nombre: string
    total_debe: number
    total_haber: number
    saldo: number
    cantidad_movimientos: number
  }>
  resumen: {
    total_gastos: number
    total_movimientos: number
    cuenta_mayor_gasto: {
      codigo: string
      nombre: string
      monto: number
    } | null
  }
}

export default function CentroCostoDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { get } = useApi()
  const [centro, setCentro] = useState<CentroCosto | null>(null)
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<string>('')
  const [presupuestos, setPresupuestos] = useState<PresupuestoItem[]>([])
  const [reporteGastos, setReporteGastos] = useState<ReporteGastos | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPresupuestos, setLoadingPresupuestos] = useState(false)
  const [loadingReporte, setLoadingReporte] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'presupuestos' | 'gastos'>('presupuestos')

  useEffect(() => {
    loadCentro()
    loadPeriodos()
  }, [params.id])

  useEffect(() => {
    if (selectedPeriodoId && centro) {
      if (activeTab === 'presupuestos') {
        loadPresupuestos()
      } else {
        loadReporteGastos()
      }
    }
  }, [selectedPeriodoId, centro, activeTab])

  const loadCentro = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await get(`/api/contabilidad/centros-costo/${params.id}`)

      if (response?.success && response.data) {
        setCentro(response.data)
      } else {
        setError(response?.message || 'Error al cargar el centro de costo')
      }
    } catch (err) {
      console.error('Error loading centro:', err)
      setError('Error al cargar el centro de costo')
    } finally {
      setLoading(false)
    }
  }

  const loadPeriodos = async () => {
    try {
      const response = await get('/api/contabilidad/periodos')

      if (response?.success && response.data) {
        const periodosAbiertos = response.data.filter((p: Periodo) => p.estado === 'ABIERTO')
        setPeriodos(periodosAbiertos)
        
        if (periodosAbiertos.length > 0) {
          setSelectedPeriodoId(periodosAbiertos[0].id)
        }
      }
    } catch (err) {
      console.error('Error loading periodos:', err)
    }
  }

  const loadPresupuestos = async () => {
    if (!selectedPeriodoId || !centro) return

    try {
      setLoadingPresupuestos(true)
      setError(null)

      const response = await get(
        `/api/contabilidad/presupuestos/centro/${centro.id}/periodo/${selectedPeriodoId}`
      )

      if (response?.success && response.data) {
        setPresupuestos(response.data)
      } else {
        setPresupuestos([])
      }
    } catch (err) {
      console.error('Error loading presupuestos:', err)
      setError('Error al cargar los presupuestos')
    } finally {
      setLoadingPresupuestos(false)
    }
  }

  const loadReporteGastos = async () => {
    if (!selectedPeriodoId || !centro) return

    try {
      setLoadingReporte(true)
      setError(null)

      const periodo = periodos.find(p => p.id === selectedPeriodoId)
      if (!periodo) return

      const fechaDesde = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-01`
      const lastDay = new Date(periodo.anio, periodo.mes, 0).getDate()
      const fechaHasta = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${lastDay}`

      const response = await get(
        `/api/contabilidad/centros-costo/${centro.id}/reporte-gastos?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`
      )

      if (response?.success && response.data) {
        setReporteGastos(response.data)
      } else {
        setReporteGastos(null)
      }
    } catch (err) {
      console.error('Error loading reporte gastos:', err)
      setError('Error al cargar el reporte de gastos')
    } finally {
      setLoadingReporte(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const getAlertColor = (alerta: string | null) => {
    switch (alerta) {
      case 'SOBREGIRO':
        return '#ef4444'
      case 'ADVERTENCIA':
        return '#f59e0b'
      default:
        return '#10b981'
    }
  }

  const getAlertBgColor = (alerta: string | null) => {
    switch (alerta) {
      case 'SOBREGIRO':
        return '#fee2e2'
      case 'ADVERTENCIA':
        return '#fef3c7'
      default:
        return '#d1fae5'
    }
  }

  const getAlertText = (alerta: string | null) => {
    switch (alerta) {
      case 'SOBREGIRO':
        return 'Sobregiro'
      case 'ADVERTENCIA':
        return 'Advertencia'
      default:
        return 'Normal'
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>Cargando...</p>
      </div>
    )
  }

  if (error && !centro) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          color: '#991b1b'
        }}>
          {error}
        </div>
      </div>
    )
  }

  if (!centro) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>Centro de costo no encontrado</p>
      </div>
    )
  }

  const selectedPeriodo = periodos.find(p => p.id === selectedPeriodoId)

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <button
            onClick={() => router.push('/dashboard/contabilidad/centros-costo')}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb'
              e.currentTarget.style.borderColor = '#d1d5db'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white'
              e.currentTarget.style.borderColor = '#e5e7eb'
            }}
          >
            <ArrowLeft size={20} color="#6b7280" />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <Building2 size={24} color="#3b82f6" />
              <h1 className="dashboard-title" style={{ margin: 0 }}>
                {centro.codigo} - {centro.nombre}
              </h1>
            </div>
            {centro.descripcion && (
              <p className="dashboard-subtitle" style={{ margin: 0 }}>
                {centro.descripcion}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => router.push(`/dashboard/contabilidad/presupuestos/comparacion?centroId=${centro.id}&periodoId=${selectedPeriodoId}`)}
              className="secondary-btn"
              style={{ padding: '0.75rem 1.5rem' }}
              disabled={!selectedPeriodoId}
              title={!selectedPeriodoId ? 'Selecciona un período primero' : 'Ver comparación completa'}
            >
              Ver Comparación Completa
            </button>
            <button
              onClick={() => router.push(`/dashboard/contabilidad/centros-costo/${centro.id}/editar`)}
              className="secondary-btn"
              style={{ padding: '0.75rem 1.5rem' }}
            >
              Editar
            </button>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Calendar size={20} color="#6b7280" />
          <label style={{ fontWeight: '500', color: '#374151' }}>
            Período:
          </label>
          <select
            value={selectedPeriodoId}
            onChange={(e) => setSelectedPeriodoId(e.target.value)}
            style={{
              flex: 1,
              maxWidth: '300px',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: '#374151'
            }}
          >
            <option value="">Seleccionar período</option>
            {periodos.map((periodo) => (
              <option key={periodo.id} value={periodo.id}>
                {new Date(periodo.anio, periodo.mes - 1).toLocaleDateString('es-PE', {
                  year: 'numeric',
                  month: 'long'
                })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <button
          onClick={() => setActiveTab('presupuestos')}
          style={{
            padding: '1rem 1.5rem',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontWeight: '500',
            color: activeTab === 'presupuestos' ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === 'presupuestos' ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <DollarSign size={18} />
            <span>Presupuestos vs Real</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('gastos')}
          style={{
            padding: '1rem 1.5rem',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontWeight: '500',
            color: activeTab === 'gastos' ? '#3b82f6' : '#6b7280',
            borderBottom: activeTab === 'gastos' ? '2px solid #3b82f6' : '2px solid transparent',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} />
            <span>Reporte de Gastos</span>
          </div>
        </button>
      </div>

      {/* Content */}
      {!selectedPeriodoId ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '3rem',
          textAlign: 'center',
          border: '1px solid #e5e7eb'
        }}>
          <Calendar size={48} color="#d1d5db" style={{ margin: '0 auto 1rem' }} />
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>
            Selecciona un período para ver la información
          </p>
        </div>
      ) : activeTab === 'presupuestos' ? (
        <div>
          {loadingPresupuestos ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <p style={{ color: '#6b7280' }}>Cargando presupuestos...</p>
            </div>
          ) : presupuestos.length === 0 ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <FileText size={48} color="#d1d5db" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: '#6b7280', fontSize: '1rem', marginBottom: '0.5rem' }}>
                No hay presupuestos configurados para este centro de costo en el período seleccionado
              </p>
              <button
                onClick={() => router.push('/dashboard/contabilidad/presupuestos/nuevo')}
                className="primary-btn"
                style={{ marginTop: '1rem' }}
              >
                Crear Presupuesto
              </button>
            </div>
          ) : (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{
                        padding: '1rem',
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '0.875rem'
                      }}>
                        Cuenta
                      </th>
                      <th style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '0.875rem'
                      }}>
                        Presupuestado
                      </th>
                      <th style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '0.875rem'
                      }}>
                        Ejecutado
                      </th>
                      <th style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '0.875rem'
                      }}>
                        Disponible
                      </th>
                      <th style={{
                        padding: '1rem',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '0.875rem'
                      }}>
                        % Ejecutado
                      </th>
                      <th style={{
                        padding: '1rem',
                        textAlign: 'center',
                        fontWeight: '600',
                        color: '#374151',
                        fontSize: '0.875rem'
                      }}>
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {presupuestos.map((item) => (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f9fafb'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                      >
                        <td style={{ padding: '1rem' }}>
                          <div>
                            <div style={{ fontWeight: '500', color: '#111827', marginBottom: '0.25rem' }}>
                              {item.cuenta_codigo}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              {item.cuenta_nombre}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '500', color: '#111827' }}>
                          {formatCurrency(item.monto_presupuestado)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '500', color: '#111827' }}>
                          {formatCurrency(item.monto_ejecutado)}
                        </td>
                        <td style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontWeight: '500',
                          color: item.monto_disponible < 0 ? '#ef4444' : '#10b981'
                        }}>
                          {formatCurrency(item.monto_disponible)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                            <span style={{ fontWeight: '500', color: '#111827' }}>
                              {formatPercentage(item.porcentaje_ejecutado)}
                            </span>
                            <div style={{
                              width: '100px',
                              height: '8px',
                              backgroundColor: '#e5e7eb',
                              borderRadius: '4px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${Math.min(item.porcentaje_ejecutado, 100)}%`,
                                height: '100%',
                                backgroundColor: getAlertColor(item.alerta),
                                transition: 'width 0.3s'
                              }} />
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            backgroundColor: getAlertBgColor(item.alerta),
                            color: getAlertColor(item.alerta)
                          }}>
                            {item.alerta === 'SOBREGIRO' || item.alerta === 'ADVERTENCIA' ? (
                              <AlertCircle size={12} />
                            ) : null}
                            {getAlertText(item.alerta)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <td style={{ padding: '1rem', fontWeight: '600', color: '#111827' }}>
                        TOTAL
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#111827' }}>
                        {formatCurrency(presupuestos.reduce((sum, item) => sum + item.monto_presupuestado, 0))}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#111827' }}>
                        {formatCurrency(presupuestos.reduce((sum, item) => sum + item.monto_ejecutado, 0))}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#111827' }}>
                        {formatCurrency(presupuestos.reduce((sum, item) => sum + item.monto_disponible, 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {loadingReporte ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <p style={{ color: '#6b7280' }}>Cargando reporte...</p>
            </div>
          ) : !reporteGastos || reporteGastos.gastos_por_cuenta.length === 0 ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '3rem',
              textAlign: 'center',
              border: '1px solid #e5e7eb'
            }}>
              <FileText size={48} color="#d1d5db" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: '#6b7280', fontSize: '1rem' }}>
                No hay gastos registrados para este centro de costo en el período seleccionado
              </p>
            </div>
          ) : (
            <div>
              {/* Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <DollarSign size={20} color="#3b82f6" />
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
                      Total Gastos
                    </span>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                    {formatCurrency(reporteGastos.resumen.total_gastos)}
                  </div>
                </div>

                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <FileText size={20} color="#10b981" />
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
                      Total Movimientos
                    </span>
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                    {reporteGastos.resumen.total_movimientos}
                  </div>
                </div>

                {reporteGastos.resumen.cuenta_mayor_gasto && (
                  <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <TrendingUp size={20} color="#f59e0b" />
                      <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
                        Mayor Gasto
                      </span>
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', marginBottom: '0.25rem' }}>
                      {reporteGastos.resumen.cuenta_mayor_gasto.codigo}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      {reporteGastos.resumen.cuenta_mayor_gasto.nombre}
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ef4444' }}>
                      {formatCurrency(reporteGastos.resumen.cuenta_mayor_gasto.monto)}
                    </div>
                  </div>
                )}
              </div>

              {/* Gastos Table */}
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                overflow: 'hidden'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{
                          padding: '1rem',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.875rem'
                        }}>
                          Cuenta
                        </th>
                        <th style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.875rem'
                        }}>
                          Debe
                        </th>
                        <th style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.875rem'
                        }}>
                          Haber
                        </th>
                        <th style={{
                          padding: '1rem',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.875rem'
                        }}>
                          Saldo
                        </th>
                        <th style={{
                          padding: '1rem',
                          textAlign: 'center',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.875rem'
                        }}>
                          Movimientos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporteGastos.gastos_por_cuenta.map((gasto, index) => (
                        <tr
                          key={index}
                          style={{
                            borderBottom: '1px solid #e5e7eb',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f9fafb'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <td style={{ padding: '1rem' }}>
                            <div>
                              <div style={{ fontWeight: '500', color: '#111827', marginBottom: '0.25rem' }}>
                                {gasto.cuenta_codigo}
                              </div>
                              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                {gasto.cuenta_nombre}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '500', color: '#111827' }}>
                            {formatCurrency(gasto.total_debe)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '500', color: '#111827' }}>
                            {formatCurrency(gasto.total_haber)}
                          </td>
                          <td style={{
                            padding: '1rem',
                            textAlign: 'right',
                            fontWeight: '500',
                            color: gasto.saldo < 0 ? '#ef4444' : '#10b981'
                          }}>
                            {formatCurrency(Math.abs(gasto.saldo))}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                            {gasto.cantidad_movimientos}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
