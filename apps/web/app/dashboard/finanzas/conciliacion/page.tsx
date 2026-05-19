'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { formatDate as formatDateOnly } from '@/lib/format-utils'
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

  const isFilterActive = estadoFilter || cuentaFilter

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoConciliacion]
    if (!config) return null
    
    const Icon = config.icon
    
    return (
      <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-3 font-medium text-white">
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
        <div className="flex gap-4 items-center">
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
            <FileCheck className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">{totalConciliaciones}</div>
          <div className="stat-subtitle">Conciliaciones</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ABIERTAS</h3>
            <Clock className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">{abiertas}</div>
          <div className="stat-subtitle">Por procesar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>EN PROCESO</h3>
            <AlertCircle className="stat-icon text-amber-500" />
          </div>
          <div className="stat-value">{enProceso}</div>
          <div className="stat-subtitle">En revisión</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>CERRADAS</h3>
            <CheckCircle className="stat-icon text-[#10b981]" />
          </div>
          <div className="stat-value">{cerradas}</div>
          <div className="stat-subtitle">Completadas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section mb-8">
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-[1] min-w-[200px]">
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

          <div className="flex-[1] min-w-[200px]">
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
              className="btn btn-secondary text-red-500"
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
              <div className="text-center p-12 text-gray-500">
                <FileCheck size={48} className="text-gray-400" />
                <h3 className="text-[1.125rem] font-semibold mb-2">
                  No hay conciliaciones bancarias
                </h3>
                <p className="mb-6">
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
                    <th className="text-right">Saldo Libro</th>
                    <th className="text-right">Saldo Banco</th>
                    <th className="text-right">Diferencia</th>
                    <th className="text-center">Progreso</th>
                    <th className="text-center">Estado</th>
                    <th className="text-right">Acciones</th>
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
                          <div className="text-[0.875rem] font-semibold">
                            {conciliacion.periodo}
                          </div>
                        </td>
                        <td>
                          <div className="text-[0.875rem] font-medium">
                            {conciliacion.cuentas_bancarias?.banco || 'N/A'}
                          </div>
                          <div className="text-3 text-gray-500">
                            {conciliacion.cuentas_bancarias?.numero_cuenta || 'N/A'}
                          </div>
                        </td>
                        <td>
                          <div className="text-[0.875rem]">
                            {formatDateOnly(conciliacion.fecha_desde)}
                          </div>
                          <div className="text-3 text-gray-500">
                            al {formatDateOnly(conciliacion.fecha_hasta)}
                          </div>
                        </td>
                        <td className="text-right text-[0.875rem] font-semibold">
                          {formatCurrency(conciliacion.saldo_libro, moneda)}
                        </td>
                        <td className="text-right text-[0.875rem] font-semibold">
                          {formatCurrency(conciliacion.saldo_banco, moneda)}
                        </td>
                        <td className="text-right">
                          <div className="text-[0.875rem] font-bold">
                            {formatCurrency(conciliacion.diferencia, moneda)}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-[100%] h-[6px] bg-[#e5e7eb] rounded-[3px] overflow-hidden">
                              <div className="h-[100%] transition" />
                            </div>
                            <div className="text-3 text-gray-500 font-medium">
                              {conciliacion.items_conciliados || 0}/{totalItems}
                            </div>
                          </div>
                        </td>
                        <td className="text-center">
                          {getEstadoBadge(conciliacion.estado)}
                        </td>
                        <td className="text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacion.id}`)}
                              className="btn btn-primary text-3 py-2 px-4"
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
      <div className="flex flex-col gap-4">
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
