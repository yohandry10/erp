'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Calendar, Lock, Unlock, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react'
import PeriodoCierreWizard from '@/components/contabilidad/PeriodoCierreWizard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
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

export default function PeriodoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const periodoId = params.id as string | undefined

  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [reopening, setReopening] = useState(false)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  // Estado para diálogo de confirmación
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  })

  const fetchPeriodo = useCallback(async () => {
    if (!periodoId) return

    try {
      setLoading(true)
      setError(null)
      
      const result = await apiCall(`/contabilidad/periodos/${periodoId}`)
      setPeriodo(result?.data)
    } catch (err) {
      console.error('Error fetching período:', err)
      setError('Error al cargar el período contable')
    } finally {
      setLoading(false)
    }
  }, [apiCall, periodoId])

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
        return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' }
      case 'CERRADO':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
      case 'BLOQUEADO':
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
    }
  }

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'ABIERTO':
        return <Unlock size={20} />
      case 'CERRADO':
        return <Lock size={20} />
      case 'BLOQUEADO':
        return <AlertCircle size={20} />
      default:
        return <Calendar size={20} />
    }
  }

  const handleReabrirPeriodo = async () => {
    setReopening(true)
    setError(null)

    try {
      const response = await apiCall(`/contabilidad/periodos/${periodoId}/reabrir`, { method: 'POST' })
      if (response?.success === false) {
        throw new Error(response.message || 'Error al reabrir el período')
      }
      await fetchPeriodo()
    } catch (err: any) {
      console.error('Error reopening período:', err)
      setError(err.message || 'Error al reabrir el período contable')
    } finally {
      setReopening(false)
    }
  }

  useEffect(() => {
    fetchPeriodo()
  }, [fetchPeriodo])

  if (loading) {
    return (
      <div className="dashboard-container">
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
            <p style={{ color: '#6b7280' }}>Cargando período...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !periodo) {
    return (
      <div className="dashboard-container">
        <div style={{
          padding: '2rem',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          color: '#991b1b'
        }}>
          <p style={{ margin: 0, fontWeight: '600' }}>⚠️ {error || 'Período no encontrado'}</p>
          <button
            onClick={() => router.push('/dashboard/contabilidad/periodos')}
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
            Volver a Períodos
          </button>
        </div>
      </div>
    )
  }

  const estadoColor = getEstadoColor(periodo.estado)

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/contabilidad/periodos')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'transparent',
              color: '#64748b',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
              marginBottom: '1rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)'
              e.currentTarget.style.color = '#334155'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#64748b'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Períodos
          </button>
          <h1 className="dashboard-title">Período Contable</h1>
          <p className="dashboard-subtitle">
            {formatPeriodo(periodo.anio, periodo.mes)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {periodo.estado === 'ABIERTO' && (
            <button
              onClick={() => setShowWizard(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            >
              <Lock size={20} />
              Cerrar Período
            </button>
          )}
          {periodo.estado === 'CERRADO' && (
            <button
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Reabrir Período',
                  message: '¿Está seguro de reabrir este período contable?\n\nEsto permitirá realizar nuevos movimientos contables.',
                  variant: 'warning',
                  onConfirm: handleReabrirPeriodo
                })
              }}
              disabled={reopening}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: reopening ? '#9ca3af' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: reopening ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
                transition: 'all 0.2s',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                opacity: reopening ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!reopening) {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            >
              <Unlock size={20} />
              {reopening ? 'Reabriendo...' : 'Reabrir Período (Superadmin)'}
            </button>
          )}
        </div>
      </div>

      {/* Period Info Card */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        marginBottom: '2rem'
      }}>
        <div style={{
          padding: '2rem',
          borderBottom: '1px solid #f3f4f6'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '2rem'
          }}>
            {/* Estado */}
            <div>
              <p style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.75rem',
                fontWeight: '700',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Estado
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: estadoColor.bg,
                color: estadoColor.text,
                border: `1px solid ${estadoColor.border}`,
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}>
                {getEstadoIcon(periodo.estado)}
                {periodo.estado}
              </div>
            </div>

            {/* Año */}
            <div>
              <p style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.75rem',
                fontWeight: '700',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Año
              </p>
              <p style={{
                margin: 0,
                fontSize: '1.5rem',
                fontWeight: '700',
                color: '#1f2937'
              }}>
                {periodo.anio}
              </p>
            </div>

            {/* Mes */}
            <div>
              <p style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.75rem',
                fontWeight: '700',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Mes
              </p>
              <p style={{
                margin: 0,
                fontSize: '1.5rem',
                fontWeight: '700',
                color: '#1f2937'
              }}>
                {String(periodo.mes).padStart(2, '0')}
              </p>
            </div>

            {/* Fecha de Cierre */}
            {periodo.fecha_cierre && (
              <div>
                <p style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Fecha de Cierre
                </p>
                <p style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#1f2937'
                }}>
                  {new Date(periodo.fecha_cierre).toLocaleDateString('es-PE', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Additional Info */}
        <div style={{
          padding: '1.5rem 2rem',
          background: '#f9fafb'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem'
          }}>
            <div>
              <p style={{
                margin: '0 0 0.25rem 0',
                fontSize: '0.75rem',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                ID del Período
              </p>
              <p style={{
                margin: 0,
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#1f2937',
                fontFamily: 'monospace'
              }}>
                {periodo.id}
              </p>
            </div>

            <div>
              <p style={{
                margin: '0 0 0.25rem 0',
                fontSize: '0.75rem',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Fecha de Creación
              </p>
              <p style={{
                margin: 0,
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#1f2937'
              }}>
                {new Date(periodo.created_at).toLocaleDateString('es-PE', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            </div>

            {periodo.cerrado_por && (
              <div>
                <p style={{
                  margin: '0 0 0.25rem 0',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Cerrado Por
                </p>
                <p style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#1f2937',
                  fontFamily: 'monospace'
                }}>
                  {periodo.cerrado_por}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div style={{
        padding: '1.5rem',
        background: periodo.estado === 'ABIERTO' ? '#dcfce7' : '#eff6ff',
        border: `1px solid ${periodo.estado === 'ABIERTO' ? '#bbf7d0' : '#bfdbfe'}`,
        borderRadius: '12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem'
        }}>
          {periodo.estado === 'ABIERTO' ? (
            <CheckCircle size={24} style={{ color: '#059669', flexShrink: 0, marginTop: '0.125rem' }} />
          ) : (
            <Lock size={24} style={{ color: '#2563eb', flexShrink: 0, marginTop: '0.125rem' }} />
          )}
          <div>
            <h4 style={{
              margin: '0 0 0.5rem 0',
              fontSize: '1rem',
              fontWeight: '600',
              color: periodo.estado === 'ABIERTO' ? '#166534' : '#1e40af'
            }}>
              {periodo.estado === 'ABIERTO' 
                ? 'Período Abierto' 
                : periodo.estado === 'CERRADO'
                ? 'Período Cerrado'
                : 'Período Bloqueado'
              }
            </h4>
            <p style={{
              margin: 0,
              fontSize: '0.875rem',
              color: periodo.estado === 'ABIERTO' ? '#166534' : '#1e40af',
              lineHeight: '1.6'
            }}>
              {periodo.estado === 'ABIERTO' 
                ? 'Este período está abierto y permite el registro de nuevos asientos contables. Puedes cerrarlo cuando hayas terminado todas las operaciones del mes.'
                : periodo.estado === 'CERRADO'
                ? 'Este período está cerrado y no permite el registro de nuevos asientos contables. Solo un superadministrador puede reabrirlo.'
                : 'Este período está bloqueado y no permite ninguna modificación.'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Wizard Modal */}
      {showWizard && (
        <PeriodoCierreWizard
          periodoId={periodo.id}
          anio={periodo.anio}
          mes={periodo.mes}
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            setShowWizard(false)
            fetchPeriodo()
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes modal-overlay-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-content-enter {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
