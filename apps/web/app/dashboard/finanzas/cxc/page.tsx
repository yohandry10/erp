'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  RefreshCw,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Download,
  DollarSign,
  Users
} from 'lucide-react'

interface CuentaPorCobrar {
  id: string
  serie: string
  numero: string
  cliente_id: string
  fecha_emision: string
  fecha_vencimiento: string
  estado: string
  total: number
  saldo: number
  moneda: string
  tipo_documento: string
  observaciones?: string
  clientes?: {
    razon_social: string
    documento_numero: string
  }
}

type EstadoCxc = 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO'

const ESTADOS_CONFIG: Record<EstadoCxc, {
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
  CANCELADO: {
    label: 'Cancelado',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  VENCIDO: {
    label: 'Vencido',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}

export default function CuentasPorCobrarPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [clienteFilter, setClienteFilter] = useState<string>('')
  const [vencimientoDesde, setVencimientoDesde] = useState<string>('')
  const [vencimientoHasta, setVencimientoHasta] = useState<string>('')
  const [searchFilter, setSearchFilter] = useState<string>('')

  const loadCuentas = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (estadoFilter) params.append('estado', estadoFilter)
      if (clienteFilter) params.append('cliente_id', clienteFilter)
      if (vencimientoDesde) params.append('hasta', vencimientoDesde)
      if (vencimientoHasta) params.append('hasta', vencimientoHasta)
      if (searchFilter) params.append('search', searchFilter)

      const response = await get(`/api/finanzas/cxc?${params.toString()}`)
      
      if (response?.success) {
        const data = response.data || []
        setCuentas(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Error loading cuentas por cobrar:', error)
      alert('Error: No se pudieron cargar las cuentas por cobrar')
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, clienteFilter, vencimientoDesde, vencimientoHasta, searchFilter, get])

  const loadClientes = useCallback(async () => {
    try {
      const response = await get('/api/ventas/clientes?limit=1000')
      if (response?.success) {
        setClientes(response.data || [])
      }
    } catch (error) {
      console.error('Error loading clientes:', error)
    }
  }, [get])

  useEffect(() => {
    loadClientes()
  }, [loadClientes])

  useEffect(() => {
    loadCuentas()
  }, [loadCuentas])

  const handleEstadoFilterChange = (value: string) => {
    setEstadoFilter(value)
  }

  const handleClienteFilterChange = (value: string) => {
    setClienteFilter(value)
  }

  const handleVencimientoDesdeChange = (value: string) => {
    setVencimientoDesde(value)
  }

  const handleVencimientoHastaChange = (value: string) => {
    setVencimientoHasta(value)
  }

  const handleClearFilters = () => {
    setEstadoFilter('')
    setClienteFilter('')
    setVencimientoDesde('')
    setVencimientoHasta('')
    setSearchFilter('')
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

  const isFilterActive = estadoFilter || clienteFilter || vencimientoDesde || vencimientoHasta || searchFilter

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoCxc]
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
    .filter(c => c.estado === 'PENDIENTE' || c.estado === 'PARCIAL' || c.estado === 'VENCIDO')
    .reduce((sum, c) => sum + (c.saldo || 0), 0)

  const totalVencido = cuentas
    .filter(c => c.estado === 'VENCIDO')
    .reduce((sum, c) => sum + (c.saldo || 0), 0)

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Cuentas por Cobrar</h1>
          <p className="dashboard-subtitle">Gestiona las cuentas por cobrar de clientes</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadCuentas}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            onClick={handleExport}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6'
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <Download size={16} />
            Exportar
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
          <div className="stat-subtitle">Por cobrar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VENCIDAS</h3>
            <XCircle className="stat-icon" style={{ color: '#ef4444' }} />
          </div>
          <div className="stat-value">
            {cuentas.filter(c => c.estado === 'VENCIDO').length}
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
          <div className="stat-subtitle">Por cobrar</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Búsqueda
            </label>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Buscar por número, serie, cliente..."
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
              <option value="CANCELADO">Cancelado</option>
              <option value="VENCIDO">Vencido</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Cliente
            </label>
            <select
              value={clienteFilter}
              onChange={(e) => handleClienteFilterChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="">Todos los clientes</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.razon_social || cliente.nombre_comercial || 'Sin nombre'}
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
                color: '#ef4444',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#ef4444'
                e.currentTarget.style.background = '#fef2f2'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db'
                e.currentTarget.style.background = 'white'
              }}
            >
              <XCircle size={16} />
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="activity-section">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando cuentas por cobrar...</p>
          </div>
        ) : (
          <div className="activity-card">
            {cuentas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  No hay cuentas por cobrar
                </h3>
                <p style={{ marginBottom: '1.5rem' }}>
                  {isFilterActive
                    ? 'No se encontraron cuentas con los filtros aplicados'
                    : 'Las cuentas por cobrar se crearán automáticamente desde las ventas'}
                </p>
              </div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Documento
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Cliente
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
                      const numeroCompleto = `${cuenta.serie || ''}-${cuenta.numero || ''}`.replace(/^-/, '')
                      const daysUntilDue = getDaysUntilDue(cuenta.fecha_vencimiento)
                      const isOverdue = daysUntilDue < 0
                      const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7

                      return (
                        <tr key={cuenta.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                              {numeroCompleto || 'N/A'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {cuenta.tipo_documento || 'N/A'}
                            </div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                              {cuenta.clientes?.razon_social || 'N/A'}
                            </div>
                            {cuenta.clientes?.documento_numero && (
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                Doc: {cuenta.clientes.documento_numero}
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
                            {(isOverdue || isDueSoon) && cuenta.estado !== 'CANCELADO' && (
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
                              onClick={() => router.push(`/dashboard/finanzas/cxc/${cuenta.id}`)}
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
    </div>
  )
}

