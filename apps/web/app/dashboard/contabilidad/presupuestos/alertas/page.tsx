'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  AlertTriangle, 
  AlertCircle, 
  TrendingUp, 
  DollarSign,
  Calendar,
  Building2,
  FileText,
  RefreshCw,
  ArrowLeft,
  CheckCircle2
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface Alerta {
  presupuesto_id: string
  nivel_alerta: 'SOBREGIRO' | 'ADVERTENCIA'
  severidad: 'CRITICO' | 'ALTO'
  porcentaje_ejecutado: number
  monto_presupuestado: number
  monto_ejecutado: number
  monto_comprometido: number
  monto_disponible: number
  excedente: number
  centro_costo: {
    id: string
    codigo: string
    nombre: string
  }
  cuenta: {
    id: string
    codigo: string
    nombre: string
  }
  periodo: {
    id: string
    anio: number
    mes: number
    descripcion: string
  }
  mensaje: string
  fecha_deteccion: string
}

interface ResumenAlertas {
  total_alertas: number
  sobregiros: {
    cantidad: number
    total_excedente: number
    alertas: Alerta[]
  }
  advertencias: {
    cantidad: number
    total_en_riesgo: number
    alertas: Alerta[]
  }
  fecha_generacion: string
}

export default function AlertasSobregirosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resumen, setResumen] = useState<ResumenAlertas | null>(null)
  const [filtroNivel, setFiltroNivel] = useState<'TODOS' | 'SOBREGIRO' | 'ADVERTENCIA'>('TODOS')
  const [error, setError] = useState<string | null>(null)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  const fetchAlertas = useCallback(async () => {
    try {
      setError(null)
      const result = await apiCall('/contabilidad/presupuestos/alertas/resumen')
      setResumen(result?.data || null)
    } catch (err) {
      console.error('Error fetching alertas:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiCall])

  useEffect(() => {
    fetchAlertas()
  }, [fetchAlertas])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAlertas()
  }

  const getAlertasFiltradas = (): Alerta[] => {
    if (!resumen) return []
    
    if (filtroNivel === 'SOBREGIRO') {
      return resumen.sobregiros.alertas
    } else if (filtroNivel === 'ADVERTENCIA') {
      return resumen.advertencias.alertas
    } else {
      return [...resumen.sobregiros.alertas, ...resumen.advertencias.alertas]
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const getAlertColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#ef4444' : '#f59e0b'
  }

  const getAlertBgColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#fef2f2' : '#fffbeb'
  }

  const getAlertBorderColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#fecaca' : '#fde68a'
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '400px' 
        }}>
          <div style={{ textAlign: 'center' }}>
            <RefreshCw size={48} style={{ 
              color: '#3b82f6', 
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }} />
            <p style={{ color: '#6b7280', fontSize: '1rem' }}>
              Cargando alertas de sobregiro...
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div style={{
          padding: '2rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <AlertCircle size={48} style={{ color: '#ef4444', margin: '0 auto 1rem' }} />
          <h3 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Error al cargar alertas</h3>
          <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</p>
          <button
            onClick={handleRefresh}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const alertasFiltradas = getAlertasFiltradas()

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            aria-label="Volver a presupuestos"
            onClick={() => router.push('/dashboard/contabilidad/presupuestos')}
            style={{
              padding: '0.5rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ArrowLeft size={20} style={{ color: '#6b7280' }} />
          </button>
          <div>
            <h1 className="dashboard-title">Alertas de Sobregiro Presupuestal</h1>
            <p className="dashboard-subtitle">
              Monitoreo de presupuestos con advertencias y sobregiros
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '0.75rem 1.5rem',
            background: refreshing ? '#e5e7eb' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <RefreshCw 
            size={16} 
            style={{ 
              animation: refreshing ? 'spin 1s linear infinite' : 'none' 
            }} 
          />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Resumen Cards */}
      {resumen && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          {/* Total Alertas */}
          <div style={{
            padding: '1.5rem',
            background: 'white',
            borderRadius: '12px',
            border: '2px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                padding: '0.75rem',
                background: '#eff6ff',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertCircle size={24} style={{ color: '#3b82f6' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                  Total Alertas
                </p>
                <p style={{ fontSize: '2rem', fontWeight: '700', color: '#111827', margin: 0 }}>
                  {resumen.total_alertas}
                </p>
              </div>
            </div>
          </div>

          {/* Sobregiros */}
          <div style={{
            padding: '1.5rem',
            background: 'white',
            borderRadius: '12px',
            border: '2px solid #fecaca',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                padding: '0.75rem',
                background: '#fef2f2',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={24} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                  Sobregiros (&gt;100%)
                </p>
                <p style={{ fontSize: '2rem', fontWeight: '700', color: '#ef4444', margin: 0 }}>
                  {resumen.sobregiros.cantidad}
                </p>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#991b1b', margin: 0 }}>
              Excedente: {formatCurrency(resumen.sobregiros.total_excedente)}
            </p>
          </div>

          {/* Advertencias */}
          <div style={{
            padding: '1.5rem',
            background: 'white',
            borderRadius: '12px',
            border: '2px solid #fde68a',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                padding: '0.75rem',
                background: '#fffbeb',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertCircle size={24} style={{ color: '#f59e0b' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                  Advertencias (&gt;90%)
                </p>
                <p style={{ fontSize: '2rem', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                  {resumen.advertencias.cantidad}
                </p>
              </div>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#92400e', margin: 0 }}>
              En riesgo: {formatCurrency(resumen.advertencias.total_en_riesgo)}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap'
      }}>
        {(['TODOS', 'SOBREGIRO', 'ADVERTENCIA'] as const).map((nivel) => (
          <button
            key={nivel}
            onClick={() => setFiltroNivel(nivel)}
            style={{
              padding: '0.75rem 1.5rem',
              background: filtroNivel === nivel ? '#3b82f6' : 'white',
              color: filtroNivel === nivel ? 'white' : '#6b7280',
              border: `2px solid ${filtroNivel === nivel ? '#3b82f6' : '#e5e7eb'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
          >
            {nivel === 'TODOS' ? 'Todas' : nivel === 'SOBREGIRO' ? 'Sobregiros' : 'Advertencias'}
          </button>
        ))}
      </div>

      {/* Lista de Alertas */}
      {alertasFiltradas.length === 0 ? (
        <div style={{
          padding: '3rem',
          background: 'white',
          borderRadius: '12px',
          border: '2px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <CheckCircle2 size={64} style={{ color: '#10b981', margin: '0 auto 1rem' }} />
          <h3 style={{ color: '#111827', marginBottom: '0.5rem' }}>
            ¡No hay alertas activas!
          </h3>
          <p style={{ color: '#6b7280', margin: 0 }}>
            Todos los presupuestos están dentro de los límites normales
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {alertasFiltradas.map((alerta) => (
            <div
              key={alerta.presupuesto_id}
              style={{
                padding: '1.5rem',
                background: getAlertBgColor(alerta.nivel_alerta),
                border: `2px solid ${getAlertBorderColor(alerta.nivel_alerta)}`,
                borderRadius: '12px',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {alerta.nivel_alerta === 'SOBREGIRO' ? (
                    <AlertTriangle size={32} style={{ color: getAlertColor(alerta.nivel_alerta) }} />
                  ) : (
                    <AlertCircle size={32} style={{ color: getAlertColor(alerta.nivel_alerta) }} />
                  )}
                  <div>
                    <div style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      background: getAlertColor(alerta.nivel_alerta),
                      color: 'white',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem'
                    }}>
                      {alerta.nivel_alerta}
                    </div>
                    <h3 style={{ 
                      fontSize: '1.125rem', 
                      fontWeight: '600', 
                      color: '#111827',
                      margin: 0
                    }}>
                      {alerta.centro_costo.nombre}
                    </h3>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ 
                    fontSize: '2rem', 
                    fontWeight: '700', 
                    color: getAlertColor(alerta.nivel_alerta),
                    margin: 0,
                    lineHeight: 1
                  }}>
                    {alerta.porcentaje_ejecutado.toFixed(1)}%
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                    Ejecutado
                  </p>
                </div>
              </div>

              {/* Mensaje */}
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#374151',
                margin: '0 0 1rem 0',
                lineHeight: '1.5'
              }}>
                {alerta.mensaje}
              </p>

              {/* Detalles */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={16} style={{ color: '#6b7280' }} />
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                      Cuenta
                    </p>
                    <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827', margin: 0 }}>
                      {alerta.cuenta.codigo} - {alerta.cuenta.nombre}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={16} style={{ color: '#6b7280' }} />
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                      Período
                    </p>
                    <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827', margin: 0 }}>
                      {alerta.periodo.descripcion}
                    </p>
                  </div>
                </div>
              </div>

              {/* Montos */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
                padding: '1rem',
                background: 'white',
                borderRadius: '8px'
              }}>
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem 0' }}>
                    Presupuestado
                  </p>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', margin: 0 }}>
                    {formatCurrency(alerta.monto_presupuestado)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem 0' }}>
                    Ejecutado
                  </p>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: getAlertColor(alerta.nivel_alerta), margin: 0 }}>
                    {formatCurrency(alerta.monto_ejecutado)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem 0' }}>
                    Disponible
                  </p>
                  <p style={{ 
                    fontSize: '1rem', 
                    fontWeight: '600', 
                    color: alerta.monto_disponible < 0 ? '#ef4444' : '#10b981', 
                    margin: 0 
                  }}>
                    {formatCurrency(alerta.monto_disponible)}
                  </p>
                </div>
                {alerta.nivel_alerta === 'SOBREGIRO' && (
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem 0' }}>
                      Excedente
                    </p>
                    <p style={{ fontSize: '1rem', fontWeight: '600', color: '#ef4444', margin: 0 }}>
                      {formatCurrency(alerta.excedente)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      {resumen && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#6b7280',
          textAlign: 'center'
        }}>
          Última actualización: {new Date(resumen.fecha_generacion).toLocaleString('es-PE')}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
