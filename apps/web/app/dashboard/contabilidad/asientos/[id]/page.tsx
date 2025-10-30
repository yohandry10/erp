'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  ArrowLeft,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download
} from 'lucide-react'

interface DetalleAsiento {
  id: string
  cuenta_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  debe: number
  haber: number
  concepto: string
  centro_costo_id?: string
  centro_costo_nombre?: string
}

interface AsientoContable {
  id: string
  tenant_id: string
  numero_asiento: string
  fecha: string
  concepto: string
  referencia?: string
  total_debe: number
  total_haber: number
  estado: 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'
  origen?: string
  source_event_id?: string
  created_at: string
  updated_at: string
  detalles?: DetalleAsiento[]
}

type EstadoAsiento = 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'

const ESTADOS_CONFIG: Record<EstadoAsiento, {
  label: string
  color: string
  bgColor: string
  icon: any
}> = {
  BORRADOR: {
    label: 'Borrador',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: FileText
  },
  CONFIRMADO: {
    label: 'Confirmado',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  ANULADO: {
    label: 'Anulado',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}

export default function AsientoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  
  const [asiento, setAsiento] = useState<AsientoContable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAsiento = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get(`/api/contabilidad/asientos/${params.id}`)
      
      if (response?.success && response.data) {
        setAsiento(response.data)
      } else {
        setError('No se pudo cargar el asiento contable')
      }
    } catch (err: any) {
      console.error('Error loading asiento:', err)
      setError(err.message || 'Error al cargar el asiento contable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (params.id) {
      loadAsiento()
    }
  }, [params.id])

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return 'S/ 0.00'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoAsiento]
    if (!config) return null
    
    const Icon = config.icon
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: '600',
        background: config.color,
        color: 'white'
      }}>
        <Icon size={16} />
        {config.label}
      </span>
    )
  }

  const isBalanced = () => {
    if (!asiento) return false
    return Math.abs(asiento.total_debe - asiento.total_haber) < 0.01
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando asiento contable...</p>
        </div>
      </div>
    )
  }

  if (error || !asiento) {
    return (
      <div className="dashboard-container">
        <div className="activity-section">
          <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>
            <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Error al cargar el asiento
            </h3>
            <p style={{ marginBottom: '1.5rem' }}>{error || 'Asiento no encontrado'}</p>
            <button
              onClick={() => router.push('/dashboard/contabilidad/asientos')}
              className="refresh-btn"
            >
              <ArrowLeft size={16} />
              Volver a Asientos
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/contabilidad/asientos')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Asientos Contables
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <h1 className="dashboard-title">Asiento {asiento.numero_asiento}</h1>
            {getEstadoBadge(asiento.estado)}
            {!isBalanced() && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.875rem',
                fontWeight: '600',
                background: '#ef4444',
                color: 'white'
              }}>
                <AlertCircle size={16} />
                Descuadrado
              </span>
            )}
          </div>
          <p className="dashboard-subtitle">
            Creado el {formatDate(asiento.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadAsiento}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            onClick={() => alert('📥 Funcionalidad de descarga próximamente')}
            className="refresh-btn"
          >
            <Download size={16} />
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Left Column - Asiento Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Asiento Information */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--blue-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--blue-600)'
              }}>
                <FileText size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                Información del Asiento
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Número de Asiento
                </label>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                  {asiento.numero_asiento}
                </p>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Fecha
                </label>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                  {formatDate(asiento.fecha)}
                </p>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Concepto
                </label>
                <p style={{ fontSize: '0.875rem', color: 'var(--primary-700)', margin: 0 }}>
                  {asiento.concepto}
                </p>
              </div>

              {asiento.referencia && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--primary-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Referencia
                  </label>
                  <p style={{ fontSize: '0.875rem', color: 'var(--primary-700)', margin: 0 }}>
                    {asiento.referencia}
                  </p>
                </div>
              )}

              {asiento.origen && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--primary-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Origen
                  </label>
                  <p style={{ fontSize: '0.875rem', color: 'var(--primary-700)', margin: 0 }}>
                    {asiento.origen}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Detalles - Debe y Haber Table */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'var(--emerald-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--emerald-600)'
                }}>
                  <FileText size={20} />
                </div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                  Detalle del Asiento (Debe / Haber)
                </h2>
              </div>
              {isBalanced() ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: 'var(--emerald-100)',
                  color: 'var(--emerald-700)'
                }}>
                  <CheckCircle size={14} />
                  Balanceado
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: 'var(--red-100)',
                  color: 'var(--red-700)'
                }}>
                  <AlertCircle size={14} />
                  Descuadrado
                </span>
              )}
            </div>

            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--primary-200)' }}>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Cuenta
                    </th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Concepto
                    </th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Centro de Costo
                    </th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Debe
                    </th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Haber
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {asiento.detalles && asiento.detalles.length > 0 ? (
                    asiento.detalles.map((detalle, index) => (
                      <tr key={detalle.id || index} style={{ borderBottom: '1px solid var(--primary-100)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-500)', marginBottom: '0.25rem' }}>
                            {detalle.cuenta_codigo}
                          </div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                            {detalle.cuenta_nombre}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                          {detalle.concepto}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                          {detalle.centro_costo_nombre || '-'}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <span style={{
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: detalle.debe > 0 ? 'var(--emerald-600)' : 'var(--primary-400)'
                          }}>
                            {detalle.debe > 0 ? formatCurrency(detalle.debe) : '-'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <span style={{
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: detalle.haber > 0 ? 'var(--blue-600)' : 'var(--primary-400)'
                          }}>
                            {detalle.haber > 0 ? formatCurrency(detalle.haber) : '-'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--primary-400)' }}>
                        No hay detalles en este asiento
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ 
                    borderTop: '2px solid var(--primary-200)',
                    background: 'var(--primary-50)'
                  }}>
                    <td colSpan={3} style={{ 
                      padding: '1rem', 
                      fontSize: '1rem', 
                      fontWeight: '700', 
                      color: 'var(--primary-800)' 
                    }}>
                      TOTALES
                    </td>
                    <td style={{ 
                      padding: '1rem', 
                      textAlign: 'right', 
                      fontSize: '1rem', 
                      fontWeight: '700', 
                      color: 'var(--emerald-600)' 
                    }}>
                      {formatCurrency(asiento.total_debe)}
                    </td>
                    <td style={{ 
                      padding: '1rem', 
                      textAlign: 'right', 
                      fontSize: '1rem', 
                      fontWeight: '700', 
                      color: 'var(--blue-600)' 
                    }}>
                      {formatCurrency(asiento.total_haber)}
                    </td>
                  </tr>
                  {!isBalanced() && (
                    <tr style={{ background: 'var(--red-50)' }}>
                      <td colSpan={3} style={{ 
                        padding: '1rem', 
                        fontSize: '0.875rem', 
                        fontWeight: '600', 
                        color: 'var(--red-700)' 
                      }}>
                        DIFERENCIA
                      </td>
                      <td colSpan={2} style={{ 
                        padding: '1rem', 
                        textAlign: 'right', 
                        fontSize: '0.875rem', 
                        fontWeight: '700', 
                        color: 'var(--red-700)' 
                      }}>
                        {formatCurrency(Math.abs(asiento.total_debe - asiento.total_haber))}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Totals Summary */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--amber-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--amber-600)'
              }}>
                <FileText size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                Resumen
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Total Debe</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--emerald-600)' }}>
                  {formatCurrency(asiento.total_debe)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Total Haber</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--blue-600)' }}>
                  {formatCurrency(asiento.total_haber)}
                </span>
              </div>

              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                paddingTop: '1rem',
                borderTop: '2px solid var(--primary-200)'
              }}>
                <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)' }}>Diferencia</span>
                <span style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '700', 
                  color: isBalanced() ? 'var(--emerald-600)' : 'var(--red-600)' 
                }}>
                  {formatCurrency(Math.abs(asiento.total_debe - asiento.total_haber))}
                </span>
              </div>

              {isBalanced() && (
                <div style={{ 
                  background: 'var(--emerald-50)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <CheckCircle size={16} style={{ color: 'var(--emerald-600)' }} />
                  <div style={{ fontSize: '0.75rem', color: 'var(--emerald-700)', fontWeight: '600' }}>
                    El asiento está balanceado correctamente
                  </div>
                </div>
              )}

              {!isBalanced() && (
                <div style={{ 
                  background: 'var(--red-50)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={16} style={{ color: 'var(--red-600)' }} />
                  <div style={{ fontSize: '0.75rem', color: 'var(--red-700)', fontWeight: '600' }}>
                    El asiento está descuadrado
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--primary-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-600)'
              }}>
                <Calendar size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                Información Adicional
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Estado
                </label>
                <div>
                  {getEstadoBadge(asiento.estado)}
                </div>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Fecha de Creación
                </label>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                  {formatDate(asiento.created_at)}
                </p>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Última Actualización
                </label>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                  {formatDate(asiento.updated_at)}
                </p>
              </div>

              {asiento.source_event_id && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--primary-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    ID Evento Origen
                  </label>
                  <p style={{ 
                    fontSize: '0.75rem', 
                    fontFamily: 'monospace', 
                    color: 'var(--primary-700)', 
                    margin: 0,
                    wordBreak: 'break-all'
                  }}>
                    {asiento.source_event_id}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
