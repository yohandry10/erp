'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { Plus, Search, Filter, Eye, FileText, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADO_COLORS: Record<EstadoPedido, { bg: string, text: string }> = {
  [EstadoPedido.PENDIENTE]: { bg: 'rgba(234, 179, 8, 0.1)', text: '#ca8a04' },
  [EstadoPedido.CONFIRMADO]: { bg: 'rgba(59, 130, 246, 0.1)', text: '#2563eb' },
  [EstadoPedido.EN_PREPARACION]: { bg: 'rgba(139, 92, 246, 0.1)', text: '#7c3aed' },
  [EstadoPedido.LISTO_DESPACHO]: { bg: 'rgba(99, 102, 241, 0.1)', text: '#4f46e5' },
  [EstadoPedido.LISTO_FACTURAR]: { bg: 'rgba(16, 185, 129, 0.1)', text: '#059669' },
  [EstadoPedido.FACTURADO]: { bg: 'rgba(20, 184, 166, 0.1)', text: '#0d9488' },
  [EstadoPedido.COMPLETADO]: { bg: 'rgba(156, 163, 175, 0.1)', text: '#6b7280' },
  [EstadoPedido.COMPLETADO_CON_GRE]: { bg: 'rgba(5, 150, 105, 0.1)', text: '#047857' },
  [EstadoPedido.CANCELADO]: { bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626' }
}

const ESTADO_LABELS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'Pendiente',
  [EstadoPedido.CONFIRMADO]: 'Confirmado',
  [EstadoPedido.EN_PREPARACION]: 'En Preparación',
  [EstadoPedido.LISTO_DESPACHO]: 'Listo Despacho',
  [EstadoPedido.LISTO_FACTURAR]: 'Listo Facturar',
  [EstadoPedido.FACTURADO]: 'Facturado',
  [EstadoPedido.COMPLETADO]: 'Completado',
  [EstadoPedido.COMPLETADO_CON_GRE]: 'Completado con GRE',
  [EstadoPedido.CANCELADO]: 'Cancelado'
}

export default function PedidosPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [pedidos, setPedidos] = useState<PedidoVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<EstadoPedido | ''>('')
  const [clienteFilter, setClienteFilter] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadPedidos()
  }, [])

  const loadPedidos = async () => {
    try {
      setLoading(true)
      const response = await get('/api/ventas/pedidos')
      if (response?.success) {
        setPedidos(response.data || [])
      }
    } catch (error) {
      console.error('Error loading pedidos:', error)
      alert('❌ Error: No se pudieron cargar los pedidos')
    } finally {
      setLoading(false)
    }
  }

  const filteredPedidos = pedidos.filter(pedido => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesNumero = pedido.numero.toLowerCase().includes(search)
      const matchesCliente = pedido.cliente?.razon_social?.toLowerCase().includes(search)
      if (!matchesNumero && !matchesCliente) return false
    }

    if (estadoFilter && pedido.estado !== estadoFilter) return false

    if (clienteFilter && pedido.cliente?.razon_social?.toLowerCase().includes(clienteFilter.toLowerCase()) === false) {
      return false
    }

    if (fechaDesde && new Date(pedido.fecha) < new Date(fechaDesde)) return false
    if (fechaHasta && new Date(pedido.fecha) > new Date(fechaHasta)) return false

    return true
  })

  const handleNuevoPedido = () => {
    router.push('/dashboard/ventas/pedidos/nuevo')
  }

  const handleVerDetalle = (pedidoId: string) => {
    router.push(`/dashboard/ventas/pedidos/${pedidoId}`)
  }

  const formatFecha = (fecha: string) => {
    try {
      return format(new Date(fecha), 'dd/MM/yyyy', { locale: es })
    } catch {
      return fecha
    }
  }

  const formatMonto = (monto: number) => {
    return `S/ ${monto.toFixed(2)}`
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Pedidos de Venta</h1>
          <p className="dashboard-subtitle">Gestiona pedidos y controla el flujo de ventas</p>
        </div>
        <button className="refresh-btn" onClick={handleNuevoPedido}>
          <Plus size={20} />
          Nuevo Pedido
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL PEDIDOS</h3>
            <FileText className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{pedidos.length}</div>
          <div className="stat-subtitle">Pedidos registrados</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <h3>FILTRADOS</h3>
            <Filter className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value">{filteredPedidos.length}</div>
          <div className="stat-subtitle">Pedidos mostrados</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="activity-section">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search 
              size={20} 
              style={{ 
                position: 'absolute', 
                left: '1rem', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: '#9ca3af' 
              }} 
            />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 3rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: showFilters ? '#3b82f6' : 'white',
              color: showFilters ? 'white' : '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Filter size={16} />
            Filtros
          </button>

          <button
            onClick={loadPedidos}
            className="refresh-btn"
            style={{ padding: '0.75rem 1rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem', 
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Estado
              </label>
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value as EstadoPedido | '')}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              >
                <option value="">Todos</option>
                {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Cliente
              </label>
              <input
                type="text"
                placeholder="Filtrar por cliente..."
                value={clienteFilter}
                onChange={(e) => setClienteFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Fecha Desde
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Fecha Hasta
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="activity-card">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Cargando pedidos...</p>
            </div>
          ) : filteredPedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                No se encontraron pedidos
              </h3>
              <p style={{ marginBottom: '1.5rem' }}>
                {searchTerm || estadoFilter || clienteFilter || fechaDesde || fechaHasta
                  ? 'Intenta ajustar los filtros de búsqueda'
                  : 'Crea tu primer pedido haciendo clic en "Nuevo Pedido"'}
              </p>
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Número
                    </th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Cliente
                    </th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Fecha
                    </th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Estado
                    </th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Total
                    </th>
                    <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPedidos.map((pedido) => (
                    <tr key={pedido.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                          {pedido.numero}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          {pedido.cliente?.razon_social || 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {pedido.cliente?.documento_numero || ''}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        {formatFecha(pedido.fecha)}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          background: ESTADO_COLORS[pedido.estado].bg,
                          color: ESTADO_COLORS[pedido.estado].text
                        }}>
                          {ESTADO_LABELS[pedido.estado]}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: '600' }}>
                        {formatMonto(pedido.total)}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleVerDetalle(pedido.id)}
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Results Summary */}
        {!loading && filteredPedidos.length > 0 && (
          <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Mostrando {filteredPedidos.length} de {pedidos.length} pedidos
          </div>
        )}
      </div>
    </div>
  )
}
