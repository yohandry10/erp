'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  Plus, 
  RefreshCw,
  FileCheck,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  XCircle
} from 'lucide-react'

interface Conciliacion {
  id: string
  periodo: string
  estado: 'ABIERTA' | 'EN_PROCESO' | 'CERRADA'
  fecha_desde: string
  fecha_hasta: string
  saldo_libro: number
  saldo_banco: number
  diferencia: number
  items_conciliados: number
  items_pendientes: number
  created_at: string
  updated_at: string
  cuentas_bancarias?: {
    id: string
    nombre: string
    banco: string
    numero_cuenta: string
    moneda: string
  }
}

type EstadoConciliacion = 'ABIERTA' | 'EN_PROCESO' | 'CERRADA'

const ESTADOS_CONFIG: Record<EstadoConciliacion, {
  label: string
  color: string
  icon: any
}> = {
  ABIERTA: {
    label: 'Abierta',
    color: '#3b82f6',
    icon: Clock
  },
  EN_PROCESO: {
    label: 'En Proceso',
    color: '#f59e0b',
    icon: AlertCircle
  },
  CERRADA: {
    label: 'Cerrada',
    color: '#10b981',
    icon: CheckCircle
  }
}

export default function ConciliacionPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([])
  const [cuentasBancarias, setCuentasBancarias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [cuentaFilter, setCuentaFilter] = useState<string>('')
  const [showNewModal, setShowNewModal] = useState(false)

  const loadConciliaciones = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (estadoFilter) params.append('estado', estadoFilter)
      if (cuentaFilter) params.append('cuenta_bancaria_id', cuentaFilter)

      const response = await get(`/api/finanzas/conciliacion?${params.toString()}`)
      
      if (response?.success) {
        const data = response.data || []
        setConciliaciones(data)
      }
    } catch (error) {
      console.error('Error loading conciliaciones:', error)
      alert('Error: No se pudieron cargar las conciliaciones')
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, cuentaFilter, get])

  const loadCuentasBancarias = useCallback(async () => {
    try {
      const response = await get('/api/finanzas/bancos/cuentas?activa=true')
      if (response?.success) {
        setCuentasBancarias(response.data || [])
      }
    } catch (error) {
      console.error('Error loading cuentas bancarias:', error)
    }
  }, [get])

  useEffect(() => {
    loadCuentasBancarias()
  }, [loadCuentasBancarias])

  useEffect(() => {
    loadConciliaciones()
  }, [loadConciliaciones])

  const handleClearFilters = () => {
    setEstadoFilter('')
    setCuentaFilter('')
  }

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    if (amount === undefined || amount === null) return '-'
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

  const isFilterActive = estadoFilter || cuentaFilter

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoConciliacion]
    if (!config) return null
    
    const Icon = config.icon
    
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
        <Icon size={14} />
        {config.label}
      </span>
    )
  }

  const totalConciliaciones = conciliaciones.length
  const abiertas = conciliaciones.filter(c => c.estado === 'ABIERTA').length
  const enProceso = conciliaciones.filter(c => c.estado === 'EN_PROCESO').length
  const cerradas = conciliaciones.filter(c => c.estado === 'CERRADA').length

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Conciliación Bancaria</h1>
          <p className="dashboard-subtitle">Concilia los movimientos bancarios con el sistema</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadConciliaciones}
            className="refresh-btn"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button 
            className="refresh-btn"
            onClick={() => setShowNewModal(true)}
          >
            <Plus size={20} />
            Nueva Conciliación
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL</h3>
            <FileCheck className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{totalConciliaciones}</div>
          <div className="stat-subtitle">Conciliaciones</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ABIERTAS</h3>
            <Clock className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{abiertas}</div>
          <div className="stat-subtitle">Por procesar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>EN PROCESO</h3>
            <AlertCircle className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value">{enProceso}</div>
          <div className="stat-subtitle">En revisión</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>CERRADAS</h3>
            <CheckCircle className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value">{cerradas}</div>
          <div className="stat-subtitle">Completadas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label>Estado</label>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="ABIERTA">Abierta</option>
              <option value="EN_PROCESO">En Proceso</option>
              <option value="CERRADA">Cerrada</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label>Cuenta Bancaria</label>
            <select
              value={cuentaFilter}
              onChange={(e) => setCuentaFilter(e.target.value)}
            >
              <option value="">Todas las cuentas</option>
              {cuentasBancarias.map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.banco} - {cuenta.numero_cuenta}
                </option>
              ))}
            </select>
          </div>

          {isFilterActive && (
            <button
              onClick={handleClearFilters}
              className="btn btn-secondary"
              style={{ color: '#ef4444' }}
            >
              <XCircle size={16} />
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Content - List */}
      <div className="activity-section">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando conciliaciones...</p>
          </div>
        ) : (
          <div className="activity-card">
            {conciliaciones.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <FileCheck size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  No hay conciliaciones bancarias
                </h3>
                <p style={{ marginBottom: '1.5rem' }}>
                  {isFilterActive
                    ? 'No se encontraron conciliaciones con los filtros aplicados'
                    : 'Crea una nueva conciliación para comenzar'}
                </p>
                {!isFilterActive && (
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="btn btn-primary"
                  >
                    <Plus size={16} />
                    Nueva Conciliación
                  </button>
                )}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Cuenta Bancaria</th>
                    <th>Fechas</th>
                    <th style={{ textAlign: 'right' }}>Saldo Libro</th>
                    <th style={{ textAlign: 'right' }}>Saldo Banco</th>
                    <th style={{ textAlign: 'right' }}>Diferencia</th>
                    <th style={{ textAlign: 'center' }}>Progreso</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliaciones.map((conciliacion) => {
                    const totalItems = (conciliacion.items_conciliados || 0) + (conciliacion.items_pendientes || 0)
                    const progreso = totalItems > 0 
                      ? Math.round(((conciliacion.items_conciliados || 0) / totalItems) * 100)
                      : 0
                    const moneda = conciliacion.cuentas_bancarias?.moneda || 'PEN'

                    return (
                      <tr key={conciliacion.id}>
                        <td>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                            {conciliacion.periodo}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                            {conciliacion.cuentas_bancarias?.banco || 'N/A'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
                            {conciliacion.cuentas_bancarias?.numero_cuenta || 'N/A'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.875rem' }}>
                            {formatDate(conciliacion.fecha_desde)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            al {formatDate(conciliacion.fecha_hasta)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: '600' }}>
                          {formatCurrency(conciliacion.saldo_libro, moneda)}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: '600' }}>
                          {formatCurrency(conciliacion.saldo_banco, moneda)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ 
                            fontSize: '0.875rem', 
                            fontWeight: '700',
                            color: Math.abs(conciliacion.diferencia || 0) < 0.01 ? '#10b981' : '#ef4444'
                          }}>
                            {formatCurrency(conciliacion.diferencia, moneda)}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                            <div style={{ 
                              width: '100%', 
                              height: '6px', 
                              background: '#e5e7eb', 
                              borderRadius: '3px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${progreso}%`,
                                height: '100%',
                                background: progreso === 100 ? '#10b981' : '#3b82f6',
                                transition: 'width 0.3s ease'
                              }} />
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '500' }}>
                              {conciliacion.items_conciliados || 0}/{totalItems}
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {getEstadoBadge(conciliacion.estado)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacion.id}`)}
                              className="btn btn-primary"
                              style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}
                            >
                              <Eye size={14} />
                              {conciliacion.estado === 'CERRADA' ? 'Ver' : 'Procesar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* New Conciliacion Modal */}
      {showNewModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">
                <Plus size={24} />
                Nueva Conciliación Bancaria
              </h2>
              <button 
                className="modal-close"
                onClick={() => setShowNewModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <NewConciliacionForm
                cuentasBancarias={cuentasBancarias}
                onSuccess={() => {
                  setShowNewModal(false)
                  loadConciliaciones()
                }}
                onCancel={() => setShowNewModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// New Conciliacion Form Component
function NewConciliacionForm({ 
  cuentasBancarias, 
  onSuccess, 
  onCancel 
}: { 
  cuentasBancarias: any[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const { post } = useApi()
  const [formData, setFormData] = useState({
    cuenta_bancaria_id: '',
    periodo: '',
    fecha_desde: '',
    fecha_hasta: ''
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.cuenta_bancaria_id || !formData.periodo || !formData.fecha_desde || !formData.fecha_hasta) {
      alert('Por favor completa todos los campos')
      return
    }

    try {
      setSubmitting(true)
      const response = await post('/api/finanzas/conciliacion', formData)
      
      if (response?.success) {
        alert('✅ Conciliación creada exitosamente')
        onSuccess()
      } else {
        alert('Error: ' + (response?.message || 'No se pudo crear la conciliación'))
      }
    } catch (error) {
      console.error('Error creating conciliacion:', error)
      alert('Error: No se pudo crear la conciliación')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label>Cuenta Bancaria *</label>
          <select
            value={formData.cuenta_bancaria_id}
            onChange={(e) => setFormData({ ...formData, cuenta_bancaria_id: e.target.value })}
            required
          >
            <option value="">Selecciona una cuenta</option>
            {cuentasBancarias.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.banco} - {cuenta.numero_cuenta} ({cuenta.moneda})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Período *</label>
          <input
            type="text"
            value={formData.periodo}
            onChange={(e) => setFormData({ ...formData, periodo: e.target.value })}
            placeholder="Ej: Enero 2024"
            required
          />
        </div>

        <div>
          <label>Fecha Desde *</label>
          <input
            type="date"
            value={formData.fecha_desde}
            onChange={(e) => setFormData({ ...formData, fecha_desde: e.target.value })}
            required
          />
        </div>

        <div>
          <label>Fecha Hasta *</label>
          <input
            type="date"
            value={formData.fecha_hasta}
            onChange={(e) => setFormData({ ...formData, fecha_hasta: e.target.value })}
            required
          />
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="modal-btn modal-btn-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="modal-btn modal-btn-primary"
          >
            {submitting ? 'Creando...' : 'Crear Conciliación'}
          </button>
        </div>
      </div>
    </form>
  )
}
