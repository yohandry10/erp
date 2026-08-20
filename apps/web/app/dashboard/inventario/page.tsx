'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useApi } from '@/hooks/use-api'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { AlertTriangle, Boxes, ClipboardList, Package, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageShell } from '@/components/erp/page-shell'
import { MetricCard } from '@/components/erp/metric-card'
import { useCountryContext } from '@/hooks/use-country-context'

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
  return <div className="rounded-2xl border border-cyan-400/20 bg-card/60 p-4 text-sm text-primary group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-800">Necesitas el permiso <code>inventario.stats.read</code> para ver los indicadores.</div>
}

function ProductsFallback() {
  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-card/60 p-4 text-sm text-primary group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-800">
      Solicita acceso a <code>inventario.productos.read</code> para revisar el catálogo de productos.
    </div>
  )
}



export default function InventarioPage() {
  const country = useCountryContext()
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<InventoryStats>(DEFAULT_STATS)
  const [productos, setProductos] = useState<Producto[]>([])
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
      const [statsResp, productosResp] = await Promise.all([
        get('/inventario/stats'),
        get('/inventario/productos'),
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
            stockActual: Number(item.stock_actual ?? item.stock ?? 0),
            stockMinimo: Number(item.stock_minimo ?? 0),
            updatedAt: item.updated_at ?? null,
          })),
        )
      } else {
        setProductos([])
      }
    } catch (err) {
      console.error('Error cargando dashboard de inventario', err)
      setError('No se pudo cargar el dashboard de inventario. Intenta nuevamente.')
      setStats(DEFAULT_STATS)
      setProductos([])
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
    <PageShell
      title="Productos"
      description="Catálogo de productos, stock crítico y control de inventario por tenant."
      actions={
        <>
          <Button asChild variant="secondary"><Link href="/dashboard/inventario/productos">Ver todos</Link></Button>
          <Button type="button" onClick={loadDashboard} className="gap-2"><RefreshCw className="h-4 w-4" /> Actualizar</Button>
        </>
      }
    >
      {error && <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:border-amber-200 group-data-[erp-theme=light]/dashboard:bg-amber-50 group-data-[erp-theme=light]/dashboard:text-amber-800">{error}</div>}

      {loading ? (
        <div className="grid min-h-[320px] place-items-center rounded-3xl border border-cyan-400/20 bg-card/60 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground/85">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300 group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:border-t-blue-600" />
            <p className="text-sm font-semibold">Cargando inventario...</p>
          </div>
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Productos" value={stats.totalProductos.toLocaleString('es-PE')} description="Activos registrados" icon={Package} tone="info" />
              <MetricCard title="Valor inventario" value={formatCurrency(stats.valorInventario, country.moneda || 'PEN')} description="Inventario valorizado" icon={Boxes} tone="success" />
              <MetricCard title="Stock crítico" value={stats.productosStockBajo.toLocaleString('es-PE')} description="Por debajo del mínimo" icon={AlertTriangle} tone="warning" />
            </div>
          </ProtectedComponent>

          {/* Productos */}
          <ProtectedComponent
            modulo="inventario"
            recurso="productos"
            accion="read"
            fallback={<ProductsFallback />}
          >
            <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground"><ClipboardList className="h-5 w-5 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" /> Productos</CardTitle>
                <p className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                  Filtros de operación sobre catálogo, stock crítico y última actualización.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Input aria-label="Buscar por nombre, código o categoría"
                  type="text"
                  value={filters.search}
                  onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="Buscar por nombre, código o categoría"
                  className="bg-card/70 text-foreground group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground"
                />
                <select aria-label="Estado"
                  value={filters.estado}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, estado: event.target.value as Filters['estado'] }))
                  }
                  className="h-10 rounded-md border border-cyan-400/20 bg-card/70 px-3 text-sm text-foreground group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground"
                >
                  {ESTADO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select aria-label="Categoria"
                  value={filters.categoria}
                  onChange={(event) => setFilters((prev) => ({ ...prev, categoria: event.target.value }))}
                  className="h-10 rounded-md border border-cyan-400/20 bg-card/70 px-3 text-sm text-foreground group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground"
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {categoria}
                    </option>
                  ))}
                </select>
                <label className="flex min-h-10 items-center gap-2 rounded-md border border-cyan-400/20 bg-card/70 px-3 text-sm text-foreground/90 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:text-foreground/85">
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

              <div className="overflow-auto rounded-2xl border border-cyan-400/15 group-data-[erp-theme=light]/dashboard:border-border">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-primary/80 group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Producto</th>
                    <th className="px-4 py-3 text-left">Categoría</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="px-4 py-3 text-right">Min.</th>
                    <th className="px-4 py-3 text-left">Actualización</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-400/10 group-data-[erp-theme=light]/dashboard:divide-slate-100">
                  {productosFiltrados.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground" colSpan={6}>Sin productos que cumplan los filtros.</td>
                    </tr>
                  ) : (
                    productosFiltrados.map((producto) => {
                      const critico = producto.stockMinimo > 0 && producto.stockActual <= producto.stockMinimo
                      return (
                        <tr key={producto.id}>
                          <td className="px-4 py-3">
                            <div>
                              <strong className="block text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">{producto.nombre}</strong>
                              {producto.codigo && <small className="text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Código: {producto.codigo}</small>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{producto.categoria ?? '—'}</td>
                          <td className="px-4 py-3">
                            <Badge className={producto.activo ? 'border-cyan-300/30 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700' : 'border-border/25 bg-slate-300/10 text-foreground/90 group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground/85'}>
                              {producto.activo ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
                          <td className={critico ? 'px-4 py-3 text-right font-bold text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:text-amber-700' : 'px-4 py-3 text-right'}>{formatNumber(producto.stockActual)}</td>
                          <td className="px-4 py-3 text-right">{producto.stockMinimo > 0 ? formatNumber(producto.stockMinimo) : '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{formatDateTime(producto.updatedAt)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
              </div>

              {criticos.length > 0 && (
                <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:border-amber-200 group-data-[erp-theme=light]/dashboard:bg-amber-50 group-data-[erp-theme=light]/dashboard:text-amber-800">
                  <strong>Productos críticos:</strong>{' '}
                  {criticos.map((producto) => producto.nombre).join(', ')}
                </div>
              )}
              </CardContent>
            </Card>
          </ProtectedComponent>

        </>
      )}
    </PageShell>
  )
}
