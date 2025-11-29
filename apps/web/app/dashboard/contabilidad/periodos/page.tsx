'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Lock, Unlock, CheckCircle, AlertCircle, PlusCircle } from 'lucide-react'
import PeriodoCierreWizard from '@/components/contabilidad/PeriodoCierreWizard'
import { useApi } from '@/hooks/use-api'

interface Periodo {
  id: string
  tenant_id: string
  anio: number
  mes: number
  estado: 'ABIERTO' | 'CERRADO' | 'BLOQUEADO'
  fecha_cierre?: string
  cerrado_por?: string
  created_at: string
  updated_at: string
}

export default function PeriodosPage() {
  const router = useRouter()
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [selectedPeriodo, setSelectedPeriodo] = useState<Periodo | null>(null)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  useEffect(() => {
    fetchPeriodos()
  }, [])

  const fetchPeriodos = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await apiCall('/contabilidad/periodos')
      const periodosData = result?.data || []
      
      // Ordenar por año y mes descendente
      const sorted = [...periodosData].sort((a: Periodo, b: Periodo) => {
        if (a.anio !== b.anio) return b.anio - a.anio
        return b.mes - a.mes
      })
      
      setPeriodos(sorted)
    } catch (err) {
      console.error('Error fetching períodos:', err)
      setError('Error al cargar los períodos contables')
    } finally {
      setLoading(false)
    }
  }

  const formatPeriodo = (anio: number, mes: number) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `${meses[mes - 1]} ${anio}`
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'ABIERTO':
        return { bg: '#dcfce7', text: '#166534', icon: Unlock }
      case 'CERRADO':
        return { bg: '#fee2e2', text: '#991b1b', icon: Lock }
      case 'BLOQUEADO':
        return { bg: '#fef3c7', text: '#92400e', icon: AlertCircle }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', icon: Calendar }
    }
  }

  const getEstadoIcon = (estado: string) => {
    const { icon: Icon } = getEstadoColor(estado)
    return <Icon size={16} />
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Períodos Contables</h1>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem',
          background: 'white',
          borderRadius: '12px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid #e5e7eb',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }} />
            <p style={{ color: '#6b7280' }}>Cargando períodos...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Períodos Contables</h1>
        </div>
        <div style={{
          padding: '2rem',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          color: '#991b1b'
        }}>
          <p style={{ margin: 0, fontWeight: '600' }}>⚠️ {error}</p>
          <button
            onClick={fetchPeriodos}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Períodos Contables</h1>
          <p className="dashboard-subtitle">
            Gestión de períodos contables por año y mes
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/contabilidad/periodos/nuevo')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2563eb'
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#3b82f6'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <PlusCircle size={20} />
          Crear Período
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          padding: '1.5rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{
              padding: '0.5rem',
              background: '#dbeafe',
              borderRadius: '8px',
              display: 'flex'
            }}>
              <Calendar size={20} style={{ color: '#3b82f6' }} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
              TOTAL PERÍODOS
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
            {periodos.length}
          </p>
        </div>

        <div style={{
          padding: '1.5rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{
              padding: '0.5rem',
              background: '#dcfce7',
              borderRadius: '8px',
              display: 'flex'
            }}>
              <Unlock size={20} style={{ color: '#059669' }} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
              ABIERTOS
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#059669' }}>
            {periodos.filter(p => p.estado === 'ABIERTO').length}
          </p>
        </div>

        <div style={{
          padding: '1.5rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{
              padding: '0.5rem',
              background: '#fee2e2',
              borderRadius: '8px',
              display: 'flex'
            }}>
              <Lock size={20} style={{ color: '#dc2626' }} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
              CERRADOS
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#dc2626' }}>
            {periodos.filter(p => p.estado === 'CERRADO').length}
          </p>
        </div>

        <div style={{
          padding: '1.5rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{
              padding: '0.5rem',
              background: '#fef3c7',
              borderRadius: '8px',
              display: 'flex'
            }}>
              <AlertCircle size={20} style={{ color: '#d97706' }} />
            </div>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
              BLOQUEADOS
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#d97706' }}>
            {periodos.filter(p => p.estado === 'BLOQUEADO').length}
          </p>
        </div>
      </div>

      {/* Períodos List */}
      {periodos.length === 0 ? (
        <div style={{
          padding: '3rem',
          background: 'white',
          borderRadius: '12px',
          textAlign: 'center',
          border: '2px dashed #d1d5db'
        }}>
          <Calendar size={48} style={{ color: '#9ca3af', margin: '0 auto 1rem' }} />
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>
            No hay períodos contables
          </p>
          <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
            Crea tu primer período contable para comenzar
          </p>
          <button
            onClick={() => router.push('/dashboard/contabilidad/periodos/nuevo')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            <PlusCircle size={20} />
            Crear Período
          </button>
        </div>
      ) : (
        <div style={{
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Período
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Año
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Mes
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Estado
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Fecha Cierre
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'right',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((periodo) => {
                  const estadoColor = getEstadoColor(periodo.estado)
                  
                  return (
                    <tr
                      key={periodo.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f9fafb'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white'
                      }}
                    >
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            padding: '0.5rem',
                            background: '#f3f4f6',
                            borderRadius: '8px',
                            display: 'flex'
                          }}>
                            <Calendar size={20} style={{ color: '#6b7280' }} />
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: '600', color: '#1f2937' }}>
                              {formatPeriodo(periodo.anio, periodo.mes)}
                            </p>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                              ID: {periodo.id.substring(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem', color: '#1f2937', fontWeight: '500' }}>
                        {periodo.anio}
                      </td>
                      <td style={{ padding: '1rem', color: '#1f2937', fontWeight: '500' }}>
                        {String(periodo.mes).padStart(2, '0')}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.375rem 0.75rem',
                          background: estadoColor.bg,
                          color: estadoColor.text,
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          {getEstadoIcon(periodo.estado)}
                          {periodo.estado}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
                        {periodo.fecha_cierre 
                          ? new Date(periodo.fecha_cierre).toLocaleDateString('es-PE', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })
                          : '-'
                        }
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {periodo.estado === 'ABIERTO' && (
                            <button
                              onClick={() => {
                                setSelectedPeriodo(periodo)
                                setShowWizard(true)
                              }}
                              style={{
                                padding: '0.5rem 1rem',
                                background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.375rem'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-1px)'
                                e.currentTarget.style.boxShadow = '0 4px 6px rgba(217, 119, 6, 0.3)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.boxShadow = 'none'
                              }}
                            >
                              <Lock size={14} />
                              Cerrar
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/dashboard/contabilidad/periodos/${periodo.id}`)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: '#f3f4f6',
                              color: '#374151',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '600',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#e5e7eb'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#f3f4f6'
                            }}
                          >
                            Ver Detalle
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div style={{
        marginTop: '2rem',
        padding: '1.5rem',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '12px'
      }}>
        <h4 style={{
          margin: '0 0 0.5rem 0',
          fontSize: '1rem',
          fontWeight: '600',
          color: '#1e40af'
        }}>
          💡 Acerca de los Períodos Contables
        </h4>
        <p style={{
          margin: 0,
          fontSize: '0.875rem',
          color: '#1e40af',
          lineHeight: '1.6'
        }}>
          Los períodos contables permiten organizar y controlar las operaciones contables por mes y año.
          Un período <strong>ABIERTO</strong> permite registrar asientos, un período <strong>CERRADO</strong> no permite
          nuevos movimientos, y un período <strong>BLOQUEADO</strong> está completamente restringido.
        </p>
      </div>

      {/* Wizard Modal */}
      {showWizard && selectedPeriodo && (
        <PeriodoCierreWizard
          periodoId={selectedPeriodo.id}
          anio={selectedPeriodo.anio}
          mes={selectedPeriodo.mes}
          onClose={() => {
            setShowWizard(false)
            setSelectedPeriodo(null)
          }}
          onSuccess={() => {
            setShowWizard(false)
            setSelectedPeriodo(null)
            fetchPeriodos()
          }}
        />
      )}

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
