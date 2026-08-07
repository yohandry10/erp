'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Package, Filter, Search, RefreshCcw } from 'lucide-react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { useApi } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'

type RecepcionEstado = 'BORRADOR' | 'PENDIENTE' | 'CONFIRMADA' | 'PARCIAL' | 'COMPLETADA' | 'ANULADA'

type Recepcion = {
  id: string
  numero: string
  fechaRecepcion?: string | null
  estado: string
  observaciones?: string | null
  greProveedor?: string | null
  orden?: {
    id: string
    numero: string
    moneda: string
    total: number
  } | null
  proveedor?: {
    id: string
    razonSocial: string
    documentoTipo?: string | null
    documentoNumero?: string | null
  } | null
  totalItems: number
  totalCantidad: number
  totalValorizado: number
  almacenes: Array<{ id: string; nombre: string | null; codigo?: string | null }>
  items: Array<{
    id: string
    cantidad: number
    costoUnitario: number
    valorTotal: number
    producto: { id: string; nombre?: string; codigo?: string | null }
    almacen?: { id: string; nombre?: string | null }
  }>
}

type RecepcionResponse = {
  success: boolean
  data: Recepcion[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

type RecepcionFilters = {
  estado: '' | RecepcionEstado
  almacenId: string
  search: string
}

const ESTADOS: Array<{ value: RecepcionFilters['estado']; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'BORRADOR', label: 'Borrador' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'PARCIAL', label: 'Recepción parcial' },
  { value: 'CONFIRMADA', label: 'Confirmada' },
  { value: 'COMPLETADA', label: 'Completada' },
  { value: 'ANULADA', label: 'Anulada' },
]

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const formatCurrency = (value: number, currency: string = 'PEN', locale: string = 'es-PE') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(toNumber(value))

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const candidate = value.includes('T') ? value : `${value}T00:00:00Z`
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('es-PE')
}

function NoPermission() {
  return (
    <div className="rounded-xl border border-cyan-400/25 bg-card/70 p-6 font-semibold text-primary shadow-lg shadow-cyan-950/20">
      No cuentas con el permiso{' '}
      <code className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-primary">
        inventario.ingresos.write
      </code>
      . Solicítalo para administrar recepciones.
    </div>
  )
}

function RecepcionesContent() {
  const country = useCountryContext()
  const formatTenantCurrency = (value: number, currency?: string) =>
    formatCurrency(value, currency || country.moneda || 'PEN', country.locale || 'es-PE')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [filters, setFilters] = useState<RecepcionFilters>({
    estado: '',
    almacenId: '',
    search: '',
  })

  const ocParam = searchParams.get('oc')

  useEffect(() => {
    // Si viene de CTA de OC, usar número en búsqueda
    if (ocParam && !filters.search) {
      setFilters((prev) => ({ ...prev, search: ocParam }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocParam])

  useEffect(() => {
    loadRecepciones()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, pagination.page])

  const buildQueryParams = () => {
    const params = new URLSearchParams()
    params.set('page', String(pagination.page))
    params.set('limit', String(pagination.limit))
    if (filters.estado) params.set('estado', filters.estado)
    if (filters.almacenId) params.set('almacenId', filters.almacenId)
    if (filters.search) params.set('search', filters.search.trim())
    return params.toString()
  }

  const loadRecepciones = async () => {
    try {
      setLoading(true)
      setError(null)
      const response: RecepcionResponse | null = await get(`/inventario/recepciones?${buildQueryParams()}`)
      if (response?.success) {
        setRecepciones((Array.isArray(response.data) ? response.data : []).map((recepcion: any) => ({
          ...recepcion,
          numero: recepcion?.numero || 'N/A',
          estado: recepcion?.estado || 'BORRADOR',
          totalItems: toNumber(recepcion?.totalItems),
          totalCantidad: toNumber(recepcion?.totalCantidad),
          totalValorizado: toNumber(recepcion?.totalValorizado),
          almacenes: Array.isArray(recepcion?.almacenes) ? recepcion.almacenes : [],
          items: Array.isArray(recepcion?.items)
            ? recepcion.items.map((item: any, index: number) => ({
                ...item,
                id: item?.id || `${recepcion?.id || 'recepcion'}-${index}`,
                cantidad: toNumber(item?.cantidad),
                costoUnitario: toNumber(item?.costoUnitario),
                valorTotal: toNumber(item?.valorTotal),
                producto: item?.producto || { id: '', nombre: 'Producto', codigo: null },
              }))
            : [],
        })))
        setPagination((prev) => response.pagination ?? prev)
      } else {
        setRecepciones([])
        setPagination((prev) => ({ ...prev, total: 0, totalPages: 0 }))
      }
    } catch (err) {
      console.error('Error cargando recepciones', err)
      setError('No pudimos cargar las recepciones. Intenta nuevamente.')
      setRecepciones([])
      setPagination((prev) => ({ ...prev, total: 0, totalPages: 0 }))
    } finally {
      setLoading(false)
    }
  }

  const resetFilters = () => {
    setFilters({ estado: '', almacenId: '', search: '' })
    setPagination((prev) => ({ ...prev, page: 1 }))
    if (ocParam) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('oc')
      router.replace(`/dashboard/inventario/recepciones?${params.toString()}`, { scroll: false })
    }
  }

  const totalValorizado = useMemo(
    () => recepciones.reduce((sum, recepcion) => sum + (recepcion.totalValorizado ?? 0), 0),
    [recepciones],
  )

  return (
    <div className="grid gap-5 text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">
      <header className="rounded-3xl border border-cyan-300/20 bg-card/80 p-5 shadow-2xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:shadow-slate-300/30 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight text-white group-data-[erp-theme=light]/dashboard:text-foreground md:text-3xl">
            Recepciones de compra
          </h1>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary group-data-[erp-theme=light]/dashboard:text-blue-700">
            Compras → Inventario
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
          Gestiona recepciones totales o parciales, asigna ubicaciones y emite el evento{' '}
          <code className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-1.5 py-0.5 text-primary group-data-[erp-theme=light]/dashboard:text-blue-700">
            RecepcionRegistradaEvent
          </code>{' '}
          para Kardex y Contabilidad. Se aplican controles multitenant y permisos endurecidos.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
          <Link className="text-primary hover:text-white group-data-[erp-theme=light]/dashboard:text-blue-700" href="/dashboard/compras/ordenes">
            Volver a Órdenes de Compra →
          </Link>
          <Link className="text-primary hover:text-white group-data-[erp-theme=light]/dashboard:text-blue-700" href="/dashboard/inventario/kardex">
            Revisar Kardex →
          </Link>
        </div>
      </header>

      <ProtectedComponent
        modulo="inventario"
        recurso="ingresos"
        accion="write"
        fallback={<NoPermission />}
      >
        <div className="grid gap-4">
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-300/20 bg-card/70 p-4 shadow-xl shadow-blue-950/15 group-data-[erp-theme=light]/dashboard:bg-card">
            <div className="flex items-center gap-2 text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-foreground">
              <Package size={20} className="text-primary group-data-[erp-theme=light]/dashboard:text-blue-700" />
              <span>
                Recepciones cargadas: {recepciones.length.toLocaleString('es-PE')}
              </span>
            </div>
            <div className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
              Valor total filtrado: <strong className="text-white group-data-[erp-theme=light]/dashboard:text-foreground">{formatTenantCurrency(totalValorizado)}</strong>
            </div>
            <button
              type="button"
              onClick={loadRecepciones}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-cyan-400/20 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700"
            >
              <RefreshCcw size={16} />
              Refrescar
            </button>
          </section>

          <form
            className="flex flex-wrap items-end gap-4 rounded-2xl border border-cyan-300/20 bg-card/70 p-4 shadow-xl shadow-blue-950/15 group-data-[erp-theme=light]/dashboard:bg-card"
            onSubmit={(event) => {
              event.preventDefault()
              setPagination((prev) => ({ ...prev, page: 1 }))
              loadRecepciones()
            }}
          >
            <div className="flex min-w-[280px] flex-1 items-center gap-2">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:text-blue-700">
                <Search size={18} />
              </span>
              <input
                type="text"
                placeholder="Buscar por número, proveedor u orden"
                value={filters.search}
                onChange={(event) => {
                  setFilters((prev) => ({ ...prev, search: event.target.value }))
                  setPagination((prev) => ({ ...prev, page: 1 }))
                }}
                className="h-10 flex-1 rounded-xl border border-cyan-300/20 bg-card/60 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-cyan-400/30 group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground"
              />
            </div>

            <div className="min-w-[200px] flex-1">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
                Estado
              </label>
              <div className="relative">
                <Filter size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={filters.estado}
                onChange={(event) => {
                  setFilters((prev) => ({ ...prev, estado: event.target.value as RecepcionFilters['estado'] }))
                  setPagination((prev) => ({ ...prev, page: 1 }))
                }}
                  className="h-10 w-full rounded-xl border border-cyan-300/20 bg-card/60 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-cyan-400/30 group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground"
                >
                  {ESTADOS.map((estado) => (
                    <option key={estado.value || 'all'} value={estado.value}>
                      {estado.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-foreground shadow-lg shadow-cyan-950/20 hover:bg-cyan-300"
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-xl border border-cyan-300/25 bg-transparent px-4 py-2.5 text-sm font-bold text-primary hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:text-blue-700"
              >
                Limpiar
              </button>
            </div>
          </form>

          {loading ? (
            <div className="rounded-2xl border border-cyan-300/20 bg-card/70 p-8 text-center font-semibold text-primary group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-blue-700">
              Cargando recepciones…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-cyan-300/25 bg-card/80 p-4 font-semibold text-primary group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-blue-700">
              {error}
            </div>
          ) : recepciones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-cyan-300/25 bg-card/60 p-8 text-center text-muted-foreground group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-muted-foreground">
              No encontramos recepciones con los filtros seleccionados.
            </div>
          ) : (
            <div className="grid gap-4">
              {recepciones.map((recepcion) => (
                <article
                  key={recepcion.id}
                  className="grid gap-4 rounded-2xl border border-cyan-300/15 bg-card/70 p-4 shadow-xl shadow-blue-950/10 group-data-[erp-theme=light]/dashboard:bg-card"
                >
                  <div className="flex flex-wrap justify-between gap-4">
                    <div className="grid gap-1">
                      <span className="text-base font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                        Recepción #{recepcion.numero}
                      </span>
                      <span className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                        Fecha: {formatDate(recepcion.fechaRecepcion)} · Ítems: {recepcion.totalItems}
                      </span>
                      {recepcion.orden && (
                        <span className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                          Orden: {recepcion.orden.numero} ·{' '}
                          {formatTenantCurrency(recepcion.orden.total, recepcion.orden.moneda)}
                        </span>
                      )}
                    </div>
                    <span className="self-start rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary group-data-[erp-theme=light]/dashboard:text-blue-700">
                      {recepcion.estado}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                    <span>
                      Cantidad recibida:{' '}
                      <strong className="text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                        {toNumber(recepcion.totalCantidad).toLocaleString('es-PE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </span>
                    <span>
                      Valor NI:{' '}
                      <strong className="text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                        {formatTenantCurrency(recepcion.totalValorizado, recepcion.orden?.moneda)}
                      </strong>
                    </span>
                    {recepcion.proveedor && (
                      <span>
                        Proveedor: <strong>{recepcion.proveedor.razonSocial}</strong>{' '}
                        {recepcion.proveedor.documentoNumero
                          ? `(${recepcion.proveedor.documentoTipo ?? ''} ${recepcion.proveedor.documentoNumero})`
                          : ''}
                      </span>
                    )}
                    {recepcion.greProveedor && <span>GRE Proveedor: {recepcion.greProveedor}</span>}
                  </div>

                  {recepcion.observaciones && (
                    <div className="border-l-2 border-cyan-300/40 pl-3 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                      {recepcion.observaciones}
                    </div>
                  )}

                  <div className="grid gap-2 rounded-xl border border-cyan-300/15 bg-card/70 p-3 group-data-[erp-theme=light]/dashboard:bg-muted/30">
                    <strong className="text-sm text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                      Detalle ({recepcion.items.length})
                    </strong>
                    {recepcion.items.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        Esta recepción aún no tiene ítems valorizados.
                      </span>
                    ) : (
                      <ul className="grid gap-2">
                        {recepcion.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex flex-wrap justify-between gap-3 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80"
                          >
                            <div className="grid">
                              <span className="font-semibold text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                                {item.producto?.nombre ?? 'Producto'}
                              </span>
                              <span>
                                {toNumber(item.cantidad).toLocaleString('es-PE', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                                {' × '}
                                {formatTenantCurrency(item.costoUnitario, recepcion.orden?.moneda)}
                              </span>
                            </div>
                            <div className="text-right font-semibold text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                              {formatTenantCurrency(item.valorTotal, recepcion.orden?.moneda)}
                              <div className="text-xs text-muted-foreground">
                                {item.almacen?.nombre ?? 'Sin almacén'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}

              {pagination.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                  <span>
                    Página {pagination.page} de {pagination.totalPages} · {pagination.total.toLocaleString('es-PE')} registros
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
                      disabled={pagination.page <= 1}
                      className="rounded-xl border border-cyan-300/25 px-3 py-2 font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-45 group-data-[erp-theme=light]/dashboard:text-blue-700"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: Math.min(prev.page + 1, prev.totalPages),
                        }))
                      }
                      disabled={pagination.page >= pagination.totalPages}
                      className="rounded-xl bg-cyan-400 px-3 py-2 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ProtectedComponent>
    </div>
  )
}

export default function RecepcionesPage() {
  return (
    <Suspense fallback={null}>
      <RecepcionesContent />
    </Suspense>
  )
}
