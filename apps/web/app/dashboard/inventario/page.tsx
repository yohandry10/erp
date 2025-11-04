'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useApi } from '@/hooks/use-api'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'

type InventoryStats = {
  totalProductos: number
  valorInventario: number
  productosStockBajo: number
  movimientosHoy: number
}

type Producto = {
  id: string
  nombre: string
  codigo?: string | null
  categoria?: string | null
  activo: boolean
  stockActual: number
  stockMinimo: number
  updatedAt?: string | null
}

type Movimiento = {
  id: string
  tipo: string
  cantidad: number
  motivo?: string | null
  referencia?: string | null
  productoId?: string | null
  creadoEn?: string | null
}

type Filters = {
  search: string
  estado: 'TODOS' | 'ACTIVO' | 'INACTIVO'
  categoria: string
  soloCriticos: boolean
}

const DEFAULT_STATS: InventoryStats = {
  totalProductos: 0,
  valorInventario: 0,
  productosStockBajo: 0,
  movimientosHoy: 0,
}

const ESTADO_OPTIONS: Array<{ value: Filters['estado']; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'ACTIVO', label: 'Activos' },
  { value: 'INACTIVO', label: 'Inactivos' },
]

const formatCurrency = (value?: number | null, currency: string = 'PEN') =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value ?? 0)

const formatNumber = (value?: number | null) =>
  (value ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleString('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

function StatsFallback() {
  return <div className="status-warning">Necesitas el permiso <code>inventario.stats.read</code> para ver los indicadores.</div>
}

function ProductsFallback() {
  return (
    <div className="status-warning">
      Solicita acceso a <code>inventario.productos.read</code> para revisar el catálogo de productos.
    </div>
  )
}

function MovementsFallback() {
  return (
    <div className="status-warning">
      Necesitas <code>inventario.movimientos.read</code> para consultar la bitácora de movimientos.
    </div>
  )
}

export default function InventarioPage() {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<InventoryStats>(DEFAULT_STATS)
  const [productos, setProductos] = useState<Producto[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [filters, setFilters] = useState<Filters>({
    search: '',
    estado: 'ACTIVO',
    categoria: '',
    soloCriticos: false,
  })

  useEffect(() => {
    loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsResp, productosResp, movimientosResp] = await Promise.all([
        get('/inventario/stats'),
        get('/inventario/productos'),
        get('/inventario/movimientos?limit=8'),
      ])

      if (statsResp?.success && statsResp.data) {
        setStats({
          totalProductos: Number(statsResp.data.totalProductos ?? 0),
          valorInventario: Number(statsResp.data.valorInventario ?? 0),
          productosStockBajo: Number(statsResp.data.productosStockBajo ?? 0),
          movimientosHoy: Number(statsResp.data.movimientosHoy ?? 0),
        })
      } else {
        setStats(DEFAULT_STATS)
      }

      if (productosResp?.success && Array.isArray(productosResp.data)) {
        setProductos(
          productosResp.data.map((item: any) => ({
            id: item.id,
            nombre: item.nombre ?? 'Producto sin nombre',
            codigo: item.codigo ?? null,
            categoria: item.categoria ?? null,
            activo: item.activo !== false,
            stockActual: Number(item.stock_actual ?? 0),
            stockMinimo: Number(item.stock_minimo ?? 0),
            updatedAt: item.updated_at ?? null,
          })),
        )
      } else {
        setProductos([])
      }

      if (movimientosResp?.success && Array.isArray(movimientosResp.data)) {
        setMovimientos(
          movimientosResp.data.map((item: any, index: number) => ({
            id: item.id ?? `${item.producto_id ?? 'mov'}-${index}`,
            tipo: String(item.tipo_movimiento ?? item.tipo ?? 'MOVIMIENTO').toUpperCase(),
            cantidad: Number(item.cantidad ?? item.cantidad_recibida ?? 0),
            motivo: item.motivo ?? null,
            referencia: item.referencia ?? null,
            productoId: item.producto_id ?? null,
            creadoEn: item.created_at ?? item.fecha ?? null,
          })),
        )
      } else {
        setMovimientos([])
      }
    } catch (err) {
      console.error('Error cargando dashboard de inventario', err)
      setError('No se pudo cargar el dashboard de inventario. Intenta nuevamente.')
      setStats(DEFAULT_STATS)
      setProductos([])
      setMovimientos([])
    } finally {
      setLoading(false)
    }
  }

  const categorias = useMemo(() => {
    const set = new Set<string>()
    productos.forEach((producto) => {
      const categoria = producto.categoria?.trim()
      if (categoria) set.add(categoria)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es-PE'))
  }, [productos])

  const productoPorId = useMemo(() => {
    const map = new Map<string, Producto>()
    productos.forEach((producto) => map.set(producto.id, producto))
    return map
  }, [productos])

  const productosFiltrados = useMemo(() => {
    const termino = filters.search.trim().toLowerCase()

    return productos
      .filter((producto) => {
        if (filters.estado === 'TODOS') return true
        return filters.estado === 'ACTIVO' ? producto.activo : !producto.activo
      })
      .filter((producto) => {
        if (!filters.categoria) return true
        return producto.categoria?.toLowerCase() === filters.categoria.toLowerCase()
      })
      .filter((producto) => {
        if (!filters.soloCriticos) return true
        return producto.stockMinimo > 0 && producto.stockActual <= producto.stockMinimo
      })
      .filter((producto) => {
        if (!termino) return true
        return [producto.nombre, producto.codigo, producto.categoria]
          .filter(Boolean)
          .some((valor) => valor!.toLowerCase().includes(termino))
      })
  }, [productos, filters])

  const criticos = useMemo(
    () =>
      productosFiltrados
        .filter((producto) => producto.stockMinimo > 0 && producto.stockActual <= producto.stockMinimo)
        .slice(0, 5),
    [productosFiltrados],
  )

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Inventario</h1>
          <p className="dashboard-subtitle">
            Resumen del módulo de inventario endurecido. Los datos consideran restricciones multitenant y
            eventos de recepción y kardex.
          </p>
        </div>
        <div>
          <Link href="/dashboard/inventario/recepciones" className="btn btn-secondary">
            Recepciones →
          </Link>
          <Link href="/dashboard/inventario/kardex" className="btn btn-secondary">
            Kardex valorizado →
          </Link>
          <button type="button" onClick={loadDashboard} className="refresh-btn">
            Actualizar
          </button>
        </div>
      </header>

      {error && <div className="status-error">{error}</div>}

      {loading ? (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando…</p>
        </div>
      ) : (
        <>
          {/* Estadísticas */}
          <ProtectedComponent
            modulo="inventario"
            recurso="stats"
            accion="read"
            fallback={<StatsFallback />}
          >
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <h3>Productos</h3>
                </div>
                <div className="stat-value">{stats.totalProductos.toLocaleString('es-PE')}</div>
                <div className="stat-subtitle">Activos registrados</div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>Valor</h3>
                </div>
                <div className="stat-value">{formatCurrency(stats.valorInventario)}</div>
                <div className="stat-subtitle">Inventario valorizado</div>
              </div>

              <div className="stat-card alert">
                <div className="stat-header">
                  <h3>Críticos</h3>
                </div>
                <div className="stat-value warning">{stats.productosStockBajo.toLocaleString('es-PE')}</div>
                <div className="stat-subtitle">Stock por debajo del mínimo</div>
              </div>

              <div className="stat-card">
                <div className="stat-header">
                  <h3>Movimientos</h3>
                </div>
                <div className="stat-value">{stats.movimientosHoy.toLocaleString('es-PE')}</div>
                <div className="stat-subtitle">Registrados hoy</div>
              </div>
            </div>
          </ProtectedComponent>

          {/* Productos */}
          <ProtectedComponent
            modulo="inventario"
            recurso="productos"
            accion="read"
            fallback={<ProductsFallback />}
          >
            <div className="activity-card">
              <h2 className="activity-title">Productos</h2>
              <p className="dashboard-subtitle">
                Filtros aplicados en cliente. Los movimientos y recepciones respetan el tenant activo.
              </p>

              <div className="modal-grid">
                <input
                  type="text"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="Buscar por nombre, código o categoría"
                />
                <select
                  value={filters.estado}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, estado: event.target.value as Filters['estado'] }))
                  }
                >
                  {ESTADO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.categoria}
                  onChange={(event) => setFilters((prev) => ({ ...prev, categoria: event.target.value }))}
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {categoria}
                    </option>
                  ))}
                </select>
                <label>
                  <input
                    type="checkbox"
                    checked={filters.soloCriticos}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, soloCriticos: event.target.checked }))
                    }
                  />
                  Solo stock crítico
                </label>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Estado</th>
                    <th>Stock</th>
                    <th>Min.</th>
                    <th>Actualización</th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Sin productos que cumplan los filtros.</td>
                    </tr>
                  ) : (
                    productosFiltrados.map((producto) => {
                      const critico = producto.stockMinimo > 0 && producto.stockActual <= producto.stockMinimo
                      return (
                        <tr key={producto.id}>
                          <td>
                            <div>
                              <strong>{producto.nombre}</strong>
                              {producto.codigo && <small>Código: {producto.codigo}</small>}
                            </div>
                          </td>
                          <td>{producto.categoria ?? '—'}</td>
                          <td>
                            <span className={producto.activo ? 'status-success' : 'status-error'}>
                              {producto.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className={critico ? 'text-red-600' : ''}>{formatNumber(producto.stockActual)}</td>
                          <td>{producto.stockMinimo > 0 ? formatNumber(producto.stockMinimo) : '—'}</td>
                          <td>{formatDateTime(producto.updatedAt)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>

              {criticos.length > 0 && (
                <div className="status-error">
                  <strong>Productos críticos:</strong>{' '}
                  {criticos.map((producto) => producto.nombre).join(', ')}
                </div>
              )}
            </div>
          </ProtectedComponent>

          {/* Movimientos recientes */}
          <ProtectedComponent
            modulo="inventario"
            recurso="movimientos"
            accion="read"
            fallback={<MovementsFallback />}
          >
            <div className="activity-card">
              <div className="activity-header">
                <h2 className="activity-title">Movimientos recientes</h2>
                <Link href="/dashboard/inventario/kardex" className="btn btn-primary">
                  Ver kardex →
                </Link>
              </div>

              {movimientos.length === 0 ? (
                <p>Sin movimientos recientes.</p>
              ) : (
                <div className="activity-list">
                  {movimientos.map((movimiento) => {
                    const producto = movimiento.productoId ? productoPorId.get(movimiento.productoId) : null
                    return (
                      <div key={movimiento.id} className="activity-item">
                        <div className="activity-content">
                          <strong>{producto?.nombre ?? 'Movimiento de inventario'}</strong>
                          <div className="activity-meta-info">
                            <span>
                              Tipo:{' '}
                              <strong>{movimiento.tipo === 'ENTRADA' ? 'Entrada' : movimiento.tipo === 'SALIDA' ? 'Salida' : 'Ajuste'}</strong>
                            </span>
                            <span>
                              Cantidad: <strong>{formatNumber(movimiento.cantidad)}</strong>
                            </span>
                            {movimiento.motivo && <span>Motivo: {movimiento.motivo}</span>}
                            {movimiento.referencia && <span>Ref: {movimiento.referencia}</span>}
                          </div>
                        </div>
                        <div className="activity-time">{formatDateTime(movimiento.creadoEn)}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </ProtectedComponent>
        </>
      )}
    </div>
  )
}
