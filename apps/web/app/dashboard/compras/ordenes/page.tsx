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
  Package,
  AlertCircle,
  Eye,
  Edit,
  LayoutGrid,
  List,
  Download,
  Filter
} from 'lucide-react'

interface OrdenCompra {
  id: string
  numero: string
  proveedor_id: string
  fecha_orden: string
  fecha_entrega_esperada?: string
  estado: string
  subtotal: number
  igv: number
  total: number
  moneda: string
  observaciones?: string
  proveedores?: {
    razon_social: string
    ruc: string
  }
  detalles?: any[]
}

type EstadoOrden = 'BORRADOR' | 'APROBACION' | 'APROBADA' | 'PARCIAL' | 'RECIBIDA' | 'CERRADA' | 'ANULADA'

const ESTADOS_CONFIG: Record<EstadoOrden, {
  label: string
  color: string
  bgColor: string
  icon: any
}> = {
  BORRADOR: {
    label: 'Borrador',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: Edit
  },
  APROBACION: {
    label: 'En Aprobación',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: Clock
  },
  APROBADA: {
    label: 'Aprobada',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  PARCIAL: {
    label: 'Parcial',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: Package
  },
  RECIBIDA: {
    label: 'Recibida',
    color: '#059669',
    bgColor: 'rgba(5, 150, 105, 0.1)',
    icon: CheckCircle
  },
  CERRADA: {
    label: 'Cerrada',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: FileText
  },
  ANULADA: {
    label: 'Anulada',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}

const ESTADO_QUICK_FILTERS: Array<{ label: string; value: '' | EstadoOrden }> = [
  { label: 'Todas', value: '' },
  { label: 'Borrador', value: 'BORRADOR' },
  { label: 'En aprobación', value: 'APROBACION' },
  { label: 'Aprobada', value: 'APROBADA' },
  { label: 'Parcial', value: 'PARCIAL' },
  { label: 'Recibida', value: 'RECIBIDA' },
  { label: 'Anulada', value: 'ANULADA' },
]

export default function OrdenesCompraPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  
  // Filters
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [proveedorFilter, setProveedorFilter] = useState<string>('')
  const [fechaDesde, setFechaDesde] = useState<string>('')
  const [fechaHasta, setFechaHasta] = useState<string>('')
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalOrdenes, setTotalOrdenes] = useState(0)
  const itemsPerPage = 10

  const loadOrdenes = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (estadoFilter) params.append('estado', estadoFilter)
      if (proveedorFilter) params.append('proveedor_id', proveedorFilter)
      if (fechaDesde) params.append('fecha_desde', fechaDesde)
      if (fechaHasta) params.append('fecha_hasta', fechaHasta)
      
      // Only add pagination for list view
      if (viewMode === 'list') {
        const offset = (currentPage - 1) * itemsPerPage
        params.append('limit', itemsPerPage.toString())
        params.append('offset', offset.toString())
      }

      const response = await get(`/compras/ordenes?${params.toString()}`)
      
      if (response?.success) {
        const data = response.data || []
        setOrdenes(data)
        setTotalOrdenes(response.count || data.length)
        setTotalPages(Math.ceil((response.count || data.length) / itemsPerPage))
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
      alert('Error: No se pudieron cargar las órdenes de compra')
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, proveedorFilter, fechaDesde, fechaHasta, currentPage, viewMode, get])

  const loadProveedores = useCallback(async () => {
    try {
      const response = await get('/compras/proveedores?activo=true')
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
    loadOrdenes()
  }, [loadOrdenes])

  const handleEstadoFilterChange = (value: string) => {
    setEstadoFilter(value)
    setCurrentPage(1)
  }

  const handleProveedorFilterChange = (value: string) => {
    setProveedorFilter(value)
    setCurrentPage(1)
  }

  const handleFechaDesdeChange = (value: string) => {
    setFechaDesde(value)
    setCurrentPage(1)
  }

  const handleFechaHastaChange = (value: string) => {
    setFechaHasta(value)
    setCurrentPage(1)
  }

  const handleClearFilters = () => {
    setEstadoFilter('')
    setProveedorFilter('')
    setFechaDesde('')
    setFechaHasta('')
    setCurrentPage(1)
  }

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    const parsed = new Date(dateString)
    if (Number.isNaN(parsed.getTime())) return '—'
    return parsed.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const getOrdenesByEstado = (estado: EstadoOrden) => {
    return ordenes.filter(orden => orden.estado === estado)
  }

  const isFilterActive = estadoFilter || proveedorFilter || fechaDesde || fechaHasta

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoOrden]
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

  const renderKanbanColumn = (estado: EstadoOrden) => {
    const config = ESTADOS_CONFIG[estado]
    const ordenesEstado = getOrdenesByEstado(estado)
    const Icon = config.icon

    return (
      <div
        key={estado}
        style={{
          flex: '1',
          minWidth: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        {/* Column Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: '12px',
            padding: '1rem 1.5rem',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: config.bgColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: config.color
              }}
            >
              <Icon size={20} />
            </div>
            <div>
              <h3 style={{ 
                fontSize: '0.875rem', 
                fontWeight: '700', 
                color: 'var(--primary-800)',
                margin: 0,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {config.label}
              </h3>
              <p style={{ 
                fontSize: '0.75rem', 
                color: 'var(--primary-500)', 
                margin: 0 
              }}>
                {ordenesEstado.length} {ordenesEstado.length === 1 ? 'orden' : 'órdenes'}
              </p>
            </div>
          </div>
          <div
            style={{
              background: config.bgColor,
              color: config.color,
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.875rem',
              fontWeight: '700'
            }}
          >
            {ordenesEstado.length}
          </div>
        </div>

        {/* Column Content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            minHeight: '400px',
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: '0.5rem'
          }}
        >
          {ordenesEstado.length === 0 ? (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--primary-400)',
                border: '2px dashed var(--primary-200)'
              }}
            >
              <Icon size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              <p style={{ fontSize: '0.875rem', margin: 0 }}>
                No hay órdenes en {config.label.toLowerCase()}
              </p>
            </div>
          ) : (
            ordenesEstado.map((orden) => (
              <div
                key={orden.id}
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  boxShadow: 'var(--shadow-md)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-xl)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                }}
                onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}`)}
              >
                {/* Top Border Indicator */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: config.color,
                    borderRadius: '12px 12px 0 0'
                  }}
                />

                {/* Order Number */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: '700',
                    color: 'var(--primary-800)',
                    fontFamily: 'monospace',
                    marginBottom: '0.25rem'
                  }}>
                    {orden.numero}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--primary-500)'
                  }}>
                    {formatDate(orden.fecha_orden)}
                  </div>
                </div>

                {/* Provider */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: 'var(--primary-700)',
                    marginBottom: '0.25rem'
                  }}>
                    {orden.proveedores?.razon_social || 'Proveedor N/A'}
                  </div>
                  {orden.proveedores?.ruc && (
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--primary-500)'
                    }}>
                      RUC: {orden.proveedores.ruc}
                    </div>
                  )}
                </div>

                {/* Total */}
                <div
                  style={{
                    background: config.bgColor,
                    borderRadius: '8px',
                    padding: '0.75rem',
                    marginBottom: '0.75rem'
                  }}
                >
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--primary-600)',
                    marginBottom: '0.25rem'
                  }}>
                    Total
                  </div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: '700',
                    color: config.color
                  }}>
                    {formatCurrency(orden.total)}
                  </div>
                </div>

                {/* Expected Delivery */}
                {orden.fecha_entrega_esperada && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--primary-500)',
                    marginBottom: '0.75rem'
                  }}>
                    <Clock size={14} />
                    <span>Entrega: {formatDate(orden.fecha_entrega_esperada)}</span>
                  </div>
                )}

                {/* Actions */}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--primary-200)'
                }}>
                  {(orden.estado === 'APROBADA' || orden.estado === 'PARCIAL') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/dashboard/inventario/recepciones?oc=${orden.id}`)
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#0ea5e9',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.25rem',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#0284c7'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#0ea5e9'
                      }}
                    >
                      <Package size={14} />
                      Recepcionar
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/dashboard/compras/ordenes/${orden.id}`)
                    }}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--blue-500)',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--blue-600)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--blue-500)'
                    }}
                  >
                    <Eye size={14} />
                    Ver
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Órdenes de Compra</h1>
          <p className="dashboard-subtitle">Gestiona tus órdenes de compra con vista kanban o lista</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* View Mode Toggle */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem',
            background: 'white',
            padding: '0.25rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db'
          }}>
            <button
              onClick={() => setViewMode('kanban')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'kanban' ? '#3b82f6' : 'transparent',
                color: viewMode === 'kanban' ? 'white' : '#6b7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
            >
              <LayoutGrid size={16} />
              Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'list' ? '#3b82f6' : 'transparent',
                color: viewMode === 'list' ? 'white' : '#6b7280',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
            >
              <List size={16} />
              Lista
            </button>
          </div>
          
          <button
            onClick={loadOrdenes}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button 
            className="refresh-btn"
            onClick={() => router.push('/dashboard/compras/ordenes/nueva')}
          >
            <Plus size={20} />
            Nueva Orden
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
          <div className="stat-value">{ordenes.length}</div>
          <div className="stat-subtitle">Órdenes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>EN APROBACIÓN</h3>
            <Clock className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value">
            {ordenes.filter(o => o.estado === 'APROBACION').length}
          </div>
          <div className="stat-subtitle">Pendientes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>APROBADAS</h3>
            <CheckCircle className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value">
            {ordenes.filter(o => o.estado === 'APROBADA').length}
          </div>
          <div className="stat-subtitle">Listas</div>
        </div>

      <div className="stat-card">
        <div className="stat-header">
          <h3>RECIBIDAS</h3>
          <Package className="stat-icon" style={{ color: '#059669' }} />
        </div>
        <div className="stat-value">
          {ordenes.filter(o => o.estado === 'RECIBIDA').length}
        </div>
        <div className="stat-subtitle">Completadas</div>
      </div>
    </div>

    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}
    >
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Estados:</span>
      {ESTADO_QUICK_FILTERS.map((filter) => {
        const isActive = estadoFilter === filter.value
        return (
          <button
            key={filter.label}
            onClick={() => handleEstadoFilterChange(filter.value)}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: '999px',
              border: isActive ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(148, 163, 184, 0.4)',
              background: isActive ? 'rgba(59, 130, 246, 0.12)' : 'rgba(148, 163, 184, 0.12)',
              color: isActive ? '#1d4ed8' : '#475569',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {filter.label}
          </button>
        )
      })}
    </div>

      {/* Filters - Only show in list view */}
      {viewMode === 'list' && (
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
                <option value="BORRADOR">Borrador</option>
                <option value="APROBACION">En Aprobación</option>
                <option value="APROBADA">Aprobada</option>
                <option value="PARCIAL">Parcial</option>
                <option value="RECIBIDA">Recibida</option>
                <option value="CERRADA">Cerrada</option>
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
                Fecha Desde
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => handleFechaDesdeChange(e.target.value)}
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
                Fecha Hasta
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => handleFechaHastaChange(e.target.value)}
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
      )}

      {/* Content - Kanban or List */}
      <div className="activity-section">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando órdenes de compra...</p>
          </div>
        ) : viewMode === 'kanban' ? (
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              overflowX: 'auto',
              paddingBottom: '1rem'
            }}
          >
            {renderKanbanColumn('BORRADOR')}
            {renderKanbanColumn('APROBACION')}
            {renderKanbanColumn('APROBADA')}
            {renderKanbanColumn('PARCIAL')}
            {renderKanbanColumn('RECIBIDA')}
            {renderKanbanColumn('CERRADA')}
            {renderKanbanColumn('ANULADA')}
          </div>
        ) : (
          /* List View */
          <div className="activity-card">
            {ordenes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                  No hay órdenes de compra
                </h3>
                <p style={{ marginBottom: '1.5rem' }}>
                  {isFilterActive
                    ? 'No se encontraron órdenes con los filtros aplicados'
                    : 'Comienza creando tu primera orden de compra'}
                </p>
                {!isFilterActive && (
                  <button
                    onClick={() => router.push('/dashboard/compras/ordenes/nueva')}
                    className="refresh-btn"
                  >
                    <Plus size={16} />
                    Crear Primera Orden
                  </button>
                )}
              </div>
            ) : (
              <>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          N° Orden
                        </th>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Proveedor
                        </th>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Fecha Orden
                        </th>
                        <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Fecha Entrega
                        </th>
                        <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                          Total
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
                      {ordenes.map((orden) => (
                        <tr key={orden.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                              {orden.numero}
                            </div>
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                              {orden.proveedores?.razon_social || 'N/A'}
                            </div>
                            {orden.proveedores?.ruc && (
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                RUC: {orden.proveedores.ruc}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#374151' }}>
                            {formatDate(orden.fecha_orden)}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            {orden.fecha_entrega_esperada ? (
                              <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                                {formatDate(orden.fecha_entrega_esperada)}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                            {formatCurrency(orden.total)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center' }}>
                            {getEstadoBadge(orden.estado)}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              {(orden.estado === 'APROBADA' || orden.estado === 'PARCIAL') && (
                                <button
                                  onClick={() => router.push(`/dashboard/inventario/recepciones?oc=${orden.id}`)}
                                  style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#0ea5e9',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                  title="Recepcionar OC"
                                >
                                  <Package size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}`)}
                                style={{
                                  padding: '0.5rem',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#3b82f6',
                                  color: 'white',
                                  cursor: 'pointer'
                                }}
                                title="Ver detalle"
                              >
                                <Eye size={16} />
                              </button>
                              {orden.estado === 'BORRADOR' && (
                                <button
                                  onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}/editar`)}
                                  style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#10b981',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ 
                    padding: '1rem', 
                    borderTop: '1px solid rgba(0,0,0,0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                      Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                      <strong>{Math.min(currentPage * itemsPerPage, totalOrdenes)}</strong> de{' '}
                      <strong>{totalOrdenes}</strong> órdenes
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          background: currentPage === 1 ? '#f3f4f6' : 'white',
                          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Anterior
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            style={{
                              padding: '0.5rem 1rem',
                              borderRadius: '6px',
                              border: '1px solid #d1d5db',
                              background: currentPage === pageNum ? '#3b82f6' : 'white',
                              color: currentPage === pageNum ? 'white' : '#374151',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              minWidth: '40px'
                            }}
                          >
                            {pageNum}
                          </button>
                        )
                      })}
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          background: currentPage === totalPages ? '#f3f4f6' : 'white',
                          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
