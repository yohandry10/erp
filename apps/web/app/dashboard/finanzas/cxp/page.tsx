'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  Plus, 
  RefreshCw,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Filter,
  Download,
  DollarSign,
  BarChart3,
  List
} from 'lucide-react'
import AgingCxpChart from '@/components/finanzas/AgingCxpChart'
import VencimientosAlert from '@/components/finanzas/VencimientosAlert'

interface CuentaPorPagar {
  id: string
  numero_documento: string
  proveedor_id: string
  fecha_emision: string
  fecha_vencimiento: string
  estado: string
  total: number
  saldo: number
  moneda: string
  tipo_documento: string
  observaciones?: string
  proveedores?: {
    razon_social: string
    ruc: string
  }
}

type EstadoCxp = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA' | 'ANULADA'

const ESTADOS_CONFIG: Record<EstadoCxp, {
  label: string
  color: string
  bgColor: string
  icon: any
}> = {
  PENDIENTE: {
    label: 'Pendiente',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: Clock
  },
  PARCIAL: {
    label: 'Parcial',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: AlertCircle
  },
  PAGADA: {
    label: 'Pagada',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  VENCIDA: {
    label: 'Vencida',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  },
  ANULADA: {
    label: 'Anulada',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: XCircle
  }
}

export default function CuentasPorPagarPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [cuentas, setCuentas] = useState<CuentaPorPagar[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'aging'>('list')
  
  // Filters
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [proveedorFilter, setProveedorFilter] = useState<string>('')
  const [vencimientoDesde, setVencimientoDesde] = useState<string>('')
  const [vencimientoHasta, setVencimientoHasta] = useState<string>('')

  const loadCuentas = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (estadoFilter) params.append('estado', estadoFilter)
      if (proveedorFilter) params.append('proveedor_id', proveedorFilter)
      if (vencimientoDesde) params.append('vencimiento_desde', vencimientoDesde)
      if (vencimientoHasta) params.append('vencimiento_hasta', vencimientoHasta)

      const queryString = params.toString()
      const response = await get(`/api/finanzas/cxp${queryString ? `?${queryString}` : ''}`)
      
      if (response?.success) {
        const data = response.data || []
        setCuentas(data)
      }
    } catch (error) {
      console.error('Error loading cuentas por pagar:', error)
      alert('Error: No se pudieron cargar las cuentas por pagar')
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, proveedorFilter, vencimientoDesde, vencimientoHasta, get])

  const loadProveedores = useCallback(async () => {
    try {
      const response = await get('/api/compras/proveedores?activo=true')
      if (response?.success) {
        setProveedores(response.data || [])
      }
    } catch (error) {
      console.error('Error loading proveedores:', error)
    }
  }, [get])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  useEffect(() => {
    loadCuentas()
  }, [loadCuentas])

  const handleEstadoFilterChange = (value: string) => {
    setEstadoFilter(value)
  }

  const handleProveedorFilterChange = (value: string) => {
    setProveedorFilter(value)
  }

  const handleVencimientoDesdeChange = (value: string) => {
    setVencimientoDesde(value)
  }

  const handleVencimientoHastaChange = (value: string) => {
    setVencimientoHasta(value)
  }

  const handleClearFilters = () => {
    setEstadoFilter('')
    setProveedorFilter('')
    setVencimientoDesde('')
    setVencimientoHasta('')
  }

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  const formatCurrency = (amount: number | undefined, moneda: string = 'PEN') => {
    if (!amount) return '-'
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

  const getDaysUntilDue = (vencimiento: string) => {
    const today = new Date()
    const dueDate = new Date(vencimiento)
    const diffTime = dueDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const isFilterActive = estadoFilter || proveedorFilter || vencimientoDesde || vencimientoHasta

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoCxp]
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

  const totalPendiente = cuentas
    .filter(c => c.estado === 'PENDIENTE' || c.estado === 'PARCIAL' || c.estado === 'VENCIDA')
    .reduce((sum, c) => sum + c.saldo, 0)

  const totalVencido = cuentas
    .filter(c => c.estado === 'VENCIDA')
    .reduce((sum, c) => sum + c.saldo, 0)

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Cuentas por Pagar</h1>
          <p className="dashboard-subtitle">Gestiona las cuentas por pagar a proveedores</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* View Mode Toggle */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem',
            background: '#f3f4f6',
            padding: '0.25rem',
            borderRadius: '8px'
          }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'list' ? 'white' : 'transparent',
                color: viewMode === 'list' ? '#3b82f6' : '#6b7280',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <List size={16} />
              Lista
            </button>
            <button
              onClick={() => setViewMode('aging')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'aging' ? 'white' : 'transparent',
                color: viewMode === 'aging' ? '#3b82f6' : '#6b7280',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s ease',
                boxShadow: viewMode === 'aging' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <BarChart3 size={16} />
              Aging
            </button>
          </div>
          
          <button
            onClick={loadCuentas}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button 
            className="refresh-btn"
            onClick={() => router.push('/dashboard/finanzas/cxp/nueva')}
          >
            <Plus size={20} />
            Nueva CxP
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL</h3>
            <FileText className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{cuentas.length}</div>
          <div className="stat-subtitle">Cuentas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>PENDIENTES</h3>
            <Clock className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value">
            {cuentas.filter(c => c.estado === 'PENDIENTE').length}
          </div>
          <div className="stat-subtitle">Por pagar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VENCIDAS</h3>
            <XCircle className="stat-icon" style={{ color: '#ef4444' }} />
          </div>
          <div className="stat-value">
            {cuentas.filter(c => c.estado === 'VENCIDA').length}
          </div>
          <div className="stat-subtitle">Atrasadas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>SALDO TOTAL</h3>
            <DollarSign className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value" style={{ fontSize: '1.25rem' }}>
            {formatCurrency(totalPendiente)}
          </div>
          <div className="stat-subtitle">Por pagar</div>
        </div>
      </div>

      {/* Alerts for upcoming due dates */}
      <VencimientosAlert 
        diasAdelante={7}
        proveedorId={proveedorFilter || undefined}
        onCuentaClick={(cuentaId) => router.push(`/dashboard/finanzas/cxp/${cuentaId}`)}
      />

      {/* Filters */}
      <div className="activity-section">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => handleEstadoFilterChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PARCIAL">Parcial</option>
              <option value="PAGADA">Pagada</option>
              <option value="VENCIDA">Vencida</option>
              <option value="ANULADA">Anulada</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Proveedor
            </label>
            <select
              value={proveedorFilter}
              onChange={(e) => handleProveedorFilterChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Vencimiento Desde
            </label>
            <input
              type="date"
              value={vencimientoDesde}
              onChange={(e) => handleVencimientoDesdeChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Vencimiento Hasta
            </label>
            <input
              type="date"
              value={vencimientoHasta}
              onChange={(e) => handleVencimientoHastaChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            />
          </div>

          {isFilterActive && (
            <button
              onClick={handleClearFilters}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#ef4444'
              }}
            >
              <XCircle size={16} />
              Limpiar Filtros
            </button>
          )}

          <button
            onClick={handleExport}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
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
            <Download size={16} />
            Exportar
          </button>
        </div>
      </div>

      {/* Content - Aging View or List */}
      {viewMode === 'aging' ? (
        <AgingCxpChart proveedorId={proveedorFilter || undefined} />
      ) : (
        <div className="activity-section">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Cargando cuentas por pagar...</p>
            </div>
          ) : (
            <div className="activity-card">
            {cuentas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  No hay cuentas por pagar
                </h3>
                <p style={{ marginBottom: '1.5rem' }}>
                  {isFilterActive
                    ? 'No se encontraron cuentas con los filtros aplicados'
                    : 'Las cuentas por pagar se crearán automáticamente desde las recepciones'}
                </p>
              </div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        N° Documento
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Proveedor
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Fecha Emisión
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Vencimiento
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Total
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Saldo
                      </th>
                      <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Estado
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((cuenta) => {
                      const daysUntilDue = getDaysUntilDue(cuenta.fecha_vencimiento)
                      const isOverdue = daysUntilDue < 0
                      const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7

                      return (
                        <tr key={cuenta.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                              {cuenta.numero_documento}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {cuenta.tipo_documento}
                            </div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                              {cuenta.proveedores?.razon_social || 'N/A'}
                            </div>
                            {cuenta.proveedores?.ruc && (
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                RUC: {cuenta.proveedores.ruc}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                            {formatDate(cuenta.fecha_emision)}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem' }}>
                              {formatDate(cuenta.fecha_vencimiento)}
                            </div>
                            {(isOverdue || isDueSoon) && cuenta.estado !== 'PAGADA' && cuenta.estado !== 'ANULADA' && (
                              <div style={{ 
                                fontSize: '0.75rem', 
                                color: isOverdue ? '#ef4444' : '#f59e0b',
                                fontWeight: '500'
                              }}>
                                {isOverdue 
                                  ? `Vencido hace ${Math.abs(daysUntilDue)} días`
                                  : `Vence en ${daysUntilDue} días`
                                }
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600' }}>
                            {formatCurrency(cuenta.total, cuenta.moneda)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ 
                              fontSize: '0.875rem', 
                              fontWeight: '700',
                              color: cuenta.saldo > 0 ? '#ef4444' : '#10b981'
                            }}>
                              {formatCurrency(cuenta.saldo, cuenta.moneda)}
                            </div>
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            {getEstadoBadge(cuenta.estado)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => router.push(`/dashboard/finanzas/cxp/${cuenta.id}`)}
                              style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#3b82f6',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#2563eb'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#3b82f6'
                              }}
                            >
                              <Eye size={14} />
                              Ver
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
