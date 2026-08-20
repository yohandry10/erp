'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { Plus, Search, Filter, Eye, FileText, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseDateLocal } from '@/lib/date-utils'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

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
  const { formatCurrency } = useLocalizedMoney()
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
        // El API expone el join como `clientes` (singular embebido de PostgREST); se normaliza a `cliente`.
        setPedidos((response.data || []).map((pedido: any) => ({
          ...pedido,
          cliente: pedido.cliente || pedido.clientes,
        })))
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
      return format(parseDateLocal(fecha), 'dd/MM/yyyy', { locale: es })
    } catch {
      return fecha
    }
  }

  const formatMonto = (monto: number) => {
    return formatCurrency(monto)
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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Pedidos de Venta</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestiona pedidos y controla el flujo de ventas</p>
        </div>
        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={handleNuevoPedido}>
          <Plus size={20} />
          Nuevo Pedido
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5  mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>TOTAL PEDIDOS</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
              <FileText />
            </span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{pedidos.length}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Pedidos registrados</div>
        </div>
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>FILTRADOS</h3>
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
              <Filter />
            </span>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{filteredPedidos.length}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Pedidos mostrados</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex gap-4 mb-4 flex-wrap">
          <div className="flex-[1] min-w-[300px] relative">
            <Search
              size={20} className="absolute left-4 top-[50%] -translate-y-1/2 text-muted-foreground"
            />
            <input aria-label="Buscar"
              type="text"
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-lg border text-[0.875rem]"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)} className="py-3 px-4 rounded-lg border cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Filter size={16} />
            Filtros
          </button>

          <button
            onClick={loadPedidos}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-3 px-4"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-6 p-4 bg-muted rounded-lg border">
            <div>
              <label htmlFor="pedidos-estado" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Estado
              </label>
              <select id="pedidos-estado"
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
              <label htmlFor="pedidos-cliente" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Cliente
              </label>
              <input id="pedidos-cliente"
                type="text"
                placeholder="Filtrar por cliente..."
                value={clienteFilter}
                onChange={(e) => setClienteFilter(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>

            <div>
              <label htmlFor="pedidos-fecha-desde" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Fecha Desde
              </label>
              <input id="pedidos-fecha-desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>

            <div>
              <label htmlFor="pedidos-fecha-hasta" className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Fecha Hasta
              </label>
              <input id="pedidos-fecha-hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>
          </div>
        )}

        {/* Table */}
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
              <p>Cargando pedidos...</p>
            </div>
          ) : filteredPedidos.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <FileText size={48} className="text-muted-foreground" />
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
                    <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                      Número
                    </th>
                    <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                      Cliente
                    </th>
                    <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                      Fecha
                    </th>
                    <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                      Estado
                    </th>
                    <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                      Estado Crédito
                    </th>
                    <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                      Total
                    </th>
                    <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
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
                        <div className="text-[0.875rem] font-semibold text-foreground">
                          {pedido.cliente?.razon_social || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pedido.cliente?.numero_documento || pedido.cliente?.ruc || ''}
                        </div>
                      </td>
                      <td className="p-4 text-[0.875rem] text-muted-foreground">
                        {formatFecha(pedido.fecha_pedido)}
                      </td>
                      <td className="p-4">
                        <span className="py-1 px-3 rounded-full text-xs font-medium">
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
                            onClick={() => handleVerDetalle(pedido.id)} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground"
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
          <div className="mt-4 text-[0.875rem] text-muted-foreground">
            Mostrando {filteredPedidos.length} de {pedidos.length} pedidos
          </div>
        )}
      </div>
    </div>
  )
}
