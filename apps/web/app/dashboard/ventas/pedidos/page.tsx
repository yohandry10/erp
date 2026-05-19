'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { Plus, Search, Filter, Eye, FileText, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADO_COLORS: Record<EstadoPedido, { bg: string, text: string }> = {
  [EstadoPedido.PENDIENTE]: { bg: 'rgba(234, 179, 8, 0.1)', text: '#ca8a04' },
  [EstadoPedido.PENDIENTE_APROBACION]: { bg: 'rgba(249, 115, 22, 0.12)', text: '#c2410c' },
  [EstadoPedido.CONFIRMADO]: { bg: 'rgba(59, 130, 246, 0.1)', text: '#2563eb' },
  [EstadoPedido.EN_PREPARACION]: { bg: 'rgba(139, 92, 246, 0.1)', text: '#7c3aed' },
  [EstadoPedido.LISTO_DESPACHO]: { bg: 'rgba(99, 102, 241, 0.1)', text: '#4f46e5' },
  [EstadoPedido.DESPACHO_PARCIAL]: { bg: 'rgba(245, 158, 11, 0.1)', text: '#b45309' },
  [EstadoPedido.LISTO_FACTURAR]: { bg: 'rgba(16, 185, 129, 0.1)', text: '#059669' },
  [EstadoPedido.FACTURADO]: { bg: 'rgba(20, 184, 166, 0.1)', text: '#0d9488' },
  [EstadoPedido.COMPLETADO]: { bg: 'rgba(156, 163, 175, 0.1)', text: '#6b7280' },
  [EstadoPedido.COMPLETADO_CON_GRE]: { bg: 'rgba(5, 150, 105, 0.1)', text: '#047857' },
  [EstadoPedido.CANCELADO]: { bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626' }
}

const ESTADO_LABELS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'Pendiente',
  [EstadoPedido.PENDIENTE_APROBACION]: 'Pendiente de aprobación',
  [EstadoPedido.CONFIRMADO]: 'Confirmado',
  [EstadoPedido.EN_PREPARACION]: 'En Preparación',
  [EstadoPedido.LISTO_DESPACHO]: 'Listo Despacho',
  [EstadoPedido.DESPACHO_PARCIAL]: 'Despacho parcial',
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

  const loadPedidos = useCallback(async () => {
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
  }, [get])

  useEffect(() => {
    loadPedidos()
  }, [loadPedidos])

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

    if (fechaDesde && new Date(pedido.fecha_pedido) < new Date(fechaDesde)) return false
    if (fechaHasta && new Date(pedido.fecha_pedido) > new Date(fechaHasta)) return false

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

  const renderEstadoCredito = (estado?: string, requiere?: boolean) => {
    const map: Record<string, { bg: string; text: string }> = {
      BLOQUEADO: { bg: 'rgba(239, 68, 68, 0.12)', text: '#b91c1c' },
      REVISION: { bg: 'rgba(251, 191, 36, 0.15)', text: '#b45309' },
      APROBADO: { bg: 'rgba(34, 197, 94, 0.12)', text: '#166534' },
      APROBADO_MANUAL: { bg: 'rgba(34, 197, 94, 0.12)', text: '#166534' },
      OK: { bg: 'rgba(34, 197, 94, 0.12)', text: '#166534' },
      SIN_EVALUAR: { bg: 'rgba(148, 163, 184, 0.12)', text: '#475569' },
    }

    const normalized = (estado || 'SIN_EVALUAR').toUpperCase()
    const style = map[normalized] || map.SIN_EVALUAR

    return (
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center py-1 px-3 rounded-full text-[0.72rem] font-semibold"
        >
          {normalized}
        </span>
        {requiere && (
          <span className="text-[0.7rem] font-semibold text-[#c2410c] bg-[rgba(249,_115,_22,_0.08)] rounded-[4px] inline-flex py-[0.15rem] px-2"
          >
            Requiere aprobación
          </span>
        )}
      </div>
    )
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
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL PEDIDOS</h3>
            <FileText className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">{pedidos.length}</div>
          <div className="stat-subtitle">Pedidos registrados</div>
        </div>
        <div className="stat-card">
          <div className="stat-header">
            <h3>FILTRADOS</h3>
            <Filter className="stat-icon text-[#10b981]" />
          </div>
          <div className="stat-value">{filteredPedidos.length}</div>
          <div className="stat-subtitle">Pedidos mostrados</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="activity-section">
        <div className="flex gap-4 mb-4 flex-wrap">
          <div className="flex-[1] min-w-[300px] relative">
            <Search
              size={20} className="absolute left-4 top-[50%] -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-2 border text-[0.875rem]"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)} className="py-3 px-4 rounded-2 border cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Filter size={16} />
            Filtros
          </button>

          <button
            onClick={loadPedidos}
            className="refresh-btn py-3 px-4"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-6 p-4 bg-[#f9fafb] rounded-2 border">
            <div>
              <label className="block text-[0.875rem] font-medium text-gray-700 mb-2">
                Estado
              </label>
              <select
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value as EstadoPedido | '')} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              >
                <option value="">Todos</option>
                {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[0.875rem] font-medium text-gray-700 mb-2">
                Cliente
              </label>
              <input
                type="text"
                placeholder="Filtrar por cliente..."
                value={clienteFilter}
                onChange={(e) => setClienteFilter(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>

            <div>
              <label className="block text-[0.875rem] font-medium text-gray-700 mb-2">
                Fecha Desde
              </label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>

            <div>
              <label className="block text-[0.875rem] font-medium text-gray-700 mb-2">
                Fecha Hasta
              </label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
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
            <div className="text-center p-12 text-gray-500">
              <FileText size={48} className="text-gray-400" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No se encontraron pedidos
              </h3>
              <p className="mb-6">
                {searchTerm || estadoFilter || clienteFilter || fechaDesde || fechaHasta
                  ? 'Intenta ajustar los filtros de búsqueda'
                  : 'Crea tu primer pedido haciendo clic en "Nuevo Pedido"'}
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-[100%]">
                <thead>
                  <tr>
                    <th className="text-left p-4 font-semibold text-3 text-gray-500">
                      Número
                    </th>
                    <th className="text-left p-4 font-semibold text-3 text-gray-500">
                      Cliente
                    </th>
                    <th className="text-left p-4 font-semibold text-3 text-gray-500">
                      Fecha
                    </th>
                    <th className="text-left p-4 font-semibold text-3 text-gray-500">
                      Estado
                    </th>
                    <th className="text-left p-4 font-semibold text-3 text-gray-500">
                      Estado Crédito
                    </th>
                    <th className="text-left p-4 font-semibold text-3 text-gray-500">
                      Total
                    </th>
                    <th className="text-right p-4 font-semibold text-3 text-gray-500">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPedidos.map((pedido) => (
                    <tr key={pedido.id} className="border-b">
                      <td className="p-4">
                        <div className="text-[0.875rem] font-semibold">
                          {pedido.numero}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-[0.875rem] font-semibold text-gray-900">
                          {pedido.cliente?.razon_social || 'N/A'}
                        </div>
                        <div className="text-3 text-gray-500">
                          {pedido.cliente?.documento_numero || ''}
                        </div>
                      </td>
                      <td className="p-4 text-[0.875rem] text-gray-500">
                        {formatFecha(pedido.fecha_pedido)}
                      </td>
                      <td className="p-4">
                        <span className="py-1 px-3 rounded-full text-3 font-medium">
                          {ESTADO_LABELS[pedido.estado]}
                        </span>
                      </td>
                      <td className="p-4">
                        {renderEstadoCredito(pedido.estado_credito, pedido.requiere_aprobacion)}
                      </td>
                      <td className="p-4 text-[0.875rem] font-semibold">
                        {formatMonto(pedido.total)}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleVerDetalle(pedido.id)} className="p-2 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer"
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
          <div className="mt-4 text-[0.875rem] text-gray-500">
            Mostrando {filteredPedidos.length} de {pedidos.length} pedidos
          </div>
        )}
      </div>
    </div>
  )
}
