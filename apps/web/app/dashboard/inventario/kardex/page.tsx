'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { useApi } from '@/hooks/use-api'

type KardexMovimiento = {
  id: string
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'DEVOLUCION'
  fecha: string | null
  documento?: string | null
  estado?: string | null
  cantidad: number
  costoUnitario: number
  valorTotal: number
  moneda: string
  producto: {
    id: string
    nombre: string
    codigo?: string | null
    sku?: string | null
  }
  almacen?: {
    id: string
    nombre: string | null
    codigo?: string | null
  } | null
  ubicacion?: {
    id: string
    codigo?: string | null
  } | null
  lote?: string | null
  serie?: string | null
  fechaExpiracion?: string | null
  recepcionId?: string | null
  referenciaTipo?: string | null
}

type KardexResumen = {
  totalMovimientos: number
  totalEntradas: number
  totalSalidas: number
  valorEntradas: number
  valorSalidas: number
  saldoCantidad: number
  saldoValorizado: number
  valorPorMoneda: Record<string, number>
}

type FilterState = {
  productoId: string
  almacenId: string
  desde: string
  hasta: string
}

const DEFAULT_RESUMEN: KardexResumen = {
  totalMovimientos: 0,
  totalEntradas: 0,
  totalSalidas: 0,
  valorEntradas: 0,
  valorSalidas: 0,
  saldoCantidad: 0,
  saldoValorizado: 0,
  valorPorMoneda: {},
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}

const formatCurrency = (value?: number | null, currency: string = 'PEN') =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value ?? 0)

const formatNumber = (value?: number | null) =>
  (value ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const candidate = value.includes('T') ? value : `${value}T00:00:00Z`
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('es-PE', DATE_OPTIONS)
}

function NoPermissionBanner() {
  return (
    <div className="p-7 rounded-2xl border bg-blue-500/10 text-primary font-semibold"
    >
      Necesitas el permiso <code>inventario.kardex.read</code> para consultar el kardex valorizado.
    </div>
  )
}

export default function KardexPage() {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [movimientos, setMovimientos] = useState<KardexMovimiento[]>([])
  const [resumen, setResumen] = useState<KardexResumen>(DEFAULT_RESUMEN)
  const initialFilters: FilterState = { productoId: '', almacenId: '', desde: '', hasta: '' }
  const [filters, setFilters] = useState<FilterState>(initialFilters)
  const [pendingFilters, setPendingFilters] = useState<FilterState>(initialFilters)
  const [almacenes, setAlmacenes] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])

  const buildQuery = useCallback((source: FilterState) => {
    const params = new URLSearchParams()
    if (source.productoId) params.append('productoId', source.productoId)
    if (source.almacenId) params.append('almacenId', source.almacenId)
    if (source.desde) params.append('desde', source.desde)
    if (source.hasta) params.append('hasta', source.hasta)
    params.append('limit', '250')
    const query = params.toString()
    return query ? `?${query}` : ''
  }, [])

  const loadCatalogs = useCallback(async () => {
    try {
      setCatalogLoading(true)
      const [almacenesResp, productosResp] = await Promise.all([
        get('/inventario/almacenes'),
        get('/inventario/productos'),
      ])

      if (almacenesResp?.success) {
        setAlmacenes(Array.isArray(almacenesResp.data) ? almacenesResp.data : [])
      }

      if (productosResp?.success) {
        setProductos(Array.isArray(productosResp.data) ? productosResp.data : [])
      }
    } catch (err) {
      console.error('Error cargando catálogos de inventario', err)
    } finally {
      setCatalogLoading(false)
    }
  }, [get])

  const loadKardex = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get(`/inventario/kardex${buildQuery(filters)}`)

      if (response?.success) {
        setMovimientos(
          (Array.isArray(response.data) ? response.data : []).map((item: any) => ({
            id: item.id ?? item.recepcionItemId ?? crypto.randomUUID(),
            tipo: String(item.tipo ?? 'ENTRADA').toUpperCase() as KardexMovimiento['tipo'],
            fecha: item.fecha ?? item.fechaRecepcion ?? null,
            documento: item.documento ?? item.recepcionNumero ?? null,
            estado: item.estado ?? item.recepcionEstado ?? null,
            cantidad: Number(item.cantidad ?? item.cantidadRecibida ?? 0),
            costoUnitario: Number(item.costoUnitario ?? 0),
            valorTotal: Number(item.valorTotal ?? 0),
            moneda: item.moneda ?? item.monedaDetalle ?? 'PEN',
            producto: {
              id: item.producto?.id ?? item.productoId,
              nombre: item.producto?.nombre ?? item.productoNombre ?? 'Producto',
              codigo: item.producto?.codigo ?? item.productoCodigo ?? null,
              sku: item.producto?.sku ?? item.productoSku ?? null,
            },
            almacen: item.almacen
              ? item.almacen
              : item.almacenId
              ? {
                  id: item.almacenId,
                  nombre: item.almacenNombre ?? null,
                  codigo: item.almacenCodigo ?? null,
                }
              : null,
            ubicacion: item.ubicacion
              ? item.ubicacion
              : item.ubicacionId
              ? {
                  id: item.ubicacionId,
                  codigo: item.ubicacionCodigo ?? null,
                }
              : null,
            lote: item.lote ?? null,
            serie: item.serie ?? null,
            fechaExpiracion: item.fechaExpiracion ?? null,
            recepcionId: item.recepcionId ?? null,
            referenciaTipo: item.referenciaTipo ?? null,
          })),
        )
        const resumenPayload = response.resumen ?? {}
        setResumen({
          ...DEFAULT_RESUMEN,
          ...resumenPayload,
          valorPorMoneda: resumenPayload.valorPorMoneda ?? {},
        })
      } else {
        setMovimientos([])
        setResumen(DEFAULT_RESUMEN)
      }
    } catch (err) {
      console.error('Error cargando kardex valorizado', err)
      setError('No se pudo cargar el kardex valorizado.')
      setMovimientos([])
      setResumen(DEFAULT_RESUMEN)
    } finally {
      setLoading(false)
    }
  }, [buildQuery, filters, get])

  useEffect(() => {
    loadCatalogs()
  }, [loadCatalogs])

  useEffect(() => {
    loadKardex()
  }, [loadKardex])

  const applyFilters = (event: FormEvent) => {
    event.preventDefault()
    setFilters({ ...pendingFilters })
  }

  const resetFilters = () => {
    setPendingFilters(initialFilters)
    setFilters(initialFilters)
  }

  const resumenCards = useMemo(
    () => [
      {
        label: 'Movimientos',
        value: resumen.totalMovimientos,
        note: 'Entradas y salidas contabilizadas',
      },
      {
        label: 'Saldo unidades',
        value: resumen.saldoCantidad,
        note: `${formatNumber(resumen.totalEntradas)} entradas · ${formatNumber(resumen.totalSalidas)} salidas`,
      },
      {
        label: 'Valor movimientos',
        value: resumen.valorEntradas - resumen.valorSalidas,
        note: `${formatCurrency(resumen.valorEntradas)} entradas · ${formatCurrency(resumen.valorSalidas)} salidas`,
        formatted: formatCurrency(resumen.valorEntradas - resumen.valorSalidas),
      },
      {
        label: 'Saldo valorizado',
        value: resumen.saldoValorizado,
        note: 'Inventario valorizado',
        formatted: formatCurrency(resumen.saldoValorizado),
      },
    ],
    [resumen],
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-[1.75rem] font-bold text-foreground">Kardex valorizado</h1>
          <span className="bg-[rgba(96,_165,_250,_0.18)] text-primary rounded-full py-1 px-3 text-xs font-semibold"
          >
            Inventario → Contabilidad
          </span>
        </div>
        <p className="m-0 text-foreground/80 max-w-[760px] leading-7">
          Consulta entradas y salidas de inventario con costo valorizado, filtrando por producto, almacén y rango de
          fechas. Los datos respetan el tenant activo y exponen el total por moneda para conciliación contable.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/dashboard/inventario/recepciones" className="text-primary font-semibold hover:text-primary/80"
          >
            Ir a Recepciones →
          </Link>
          <Link
            href="/dashboard/inventario/almacenes" className="text-primary font-semibold hover:text-primary/80"
          >
            Gestionar Almacenes →
          </Link>
        </div>
      </header>

      <ProtectedComponent modulo="inventario" recurso="kardex" accion="read" fallback={<NoPermissionBanner />}>
        <div className="flex flex-col gap-6">
          <form
            onSubmit={applyFilters} className="flex flex-wrap gap-4 items-end border rounded-[0.875rem] p-5 bg-muted/40"
          >
            <div className="flex-[1_1_220px] min-w-[200px]">
              <label className="block text-[0.8rem] font-semibold text-foreground/85 mb-1.5">
                Producto
              </label>
              <select
                value={pendingFilters.productoId}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, productoId: event.target.value }))}
                disabled={catalogLoading} className="w-[100%] py-[0.7rem] px-4 rounded-[0.625rem] border text-[0.875rem] bg-card"
              >
                <option value="">Todos los productos</option>
                {productos.map((producto) => (
                  <option key={producto.id} value={producto.id}>
                    {producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-[1_1_220px] min-w-[200px]">
              <label className="block text-[0.8rem] font-semibold text-foreground/85 mb-1.5">
                Almacén
              </label>
              <select
                value={pendingFilters.almacenId}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, almacenId: event.target.value }))}
                disabled={catalogLoading} className="w-[100%] py-[0.7rem] px-4 rounded-[0.625rem] border text-[0.875rem] bg-card"
              >
                <option value="">Todos los almacenes</option>
                {almacenes.map((almacen) => (
                  <option key={almacen.id} value={almacen.id}>
                    {almacen.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-[1_1_180px] min-w-[180px]">
              <label className="block text-[0.8rem] font-semibold text-foreground/85 mb-1.5">
                Desde
              </label>
              <input
                type="date"
                value={pendingFilters.desde}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, desde: event.target.value }))} className="w-[100%] py-[0.7rem] px-4 rounded-[0.625rem] border text-[0.875rem] bg-card"
              />
            </div>

            <div className="flex-[1_1_180px] min-w-[180px]">
              <label className="block text-[0.8rem] font-semibold text-foreground/85 mb-1.5">
                Hasta
              </label>
              <input
                type="date"
                value={pendingFilters.hasta}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, hasta: event.target.value }))} className="w-[100%] py-[0.7rem] px-4 rounded-[0.625rem] border text-[0.875rem] bg-card"
              />
            </div>

            <div className="flex gap-3 items-center">
              <button
                type='submit' className="py-[0.7rem] px-6 rounded-[0.625rem] border-0 bg-blue-700 text-white font-semibold cursor-pointer"
              >
                Aplicar filtros
              </button>
              <button
                type='button'
                onClick={resetFilters} className="py-[0.7rem] px-5 rounded-[0.625rem] border bg-card text-primary font-semibold cursor-pointer"
              >
                Limpiar
              </button>
            </div>
          </form>

          {loading ? (
            <div className="flex justify-center items-center py-12 px-0 text-primary font-semibold"
            >
              Cargando kardex…
            </div>
          ) : (
            <>
              {error && (
                <div className="py-4 px-5 rounded-xl border bg-destructive/10 text-destructive font-semibold"
                >
                  {error}
                </div>
              )}

              <section className="grid gap-4 grid-cols-[repeat(auto-fit,_minmax(220px,_1fr))]"
              >
                {resumenCards.map((card) => (
                  <div
                    key={card.label} className="rounded-2xl border bg-card p-4 flex flex-col gap-1.5"
                  >
                    <span className="text-xs text-muted-foreground font-bold">
                      {card.label}
                    </span>
                    <span className="text-2xl font-bold text-foreground">
                      {'formatted' in card ? card.formatted : formatNumber(card.value)}
                    </span>
                    <span className="text-sm text-foreground/80">{card.note}</span>
                  </div>
                ))}
              </section>

              {Object.keys(resumen.valorPorMoneda ?? {}).length > 0 && (
                <section className="rounded-[0.875rem] border bg-blue-500/10 p-4 text-[#1e3a8a] text-sm flex flex-wrap gap-4"
                >
                  <strong>Valor por moneda:</strong>
                  {Object.entries(resumen.valorPorMoneda).map(([moneda, valor]) => (
                    <span key={moneda}>
                      {moneda}: {formatCurrency(valor, moneda)}
                    </span>
                  ))}
                </section>
              )}

              <section className="rounded-2xl border bg-card p-5 flex flex-col gap-4"
              >
                <h2 className="m-0 text-[1.15rem] font-bold text-foreground">Detalle de movimientos</h2>
                {movimientos.length === 0 ? (
                  <div className="text-muted-foreground text-sm">No se encontraron movimientos para los filtros seleccionados.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-[100%] min-w-[880px]">
                      <thead>
                        <tr className="border-b text-left text-foreground/80 text-xs">
                          <th className="py-[0.65rem] px-2">Fecha</th>
                          <th className="py-[0.65rem] px-2">Documento</th>
                          <th className="py-[0.65rem] px-2">Tipo</th>
                          <th className="py-[0.65rem] px-2">Producto</th>
                          <th className="py-[0.65rem] px-2">Almacén</th>
                          <th className="py-[0.65rem] px-2 text-right">Cantidad</th>
                          <th className="py-[0.65rem] px-2 text-right">Costo Unit.</th>
                          <th className="py-[0.65rem] px-2 text-right">Valor total</th>
                          <th className="py-[0.65rem] px-2">Lote / Serie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((mov) => (
                          <tr key={mov.id} className="border-b">
                            <td className="py-3 px-2 text-foreground font-semibold">{formatDateTime(mov.fecha)}</td>
                            <td className="py-3 px-2 text-foreground/80">{mov.documento ?? '—'}</td>
                            <td className="py-3 px-2">
                              <span className={mov.tipo === 'SALIDA' ? 'font-semibold text-rose-400' : 'font-semibold text-emerald-400'}>
                                {mov.tipo}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground">{mov.producto.nombre}</span>
                                <span className="text-xs text-muted-foreground">
                                  {mov.producto.codigo ?? mov.producto.sku ?? '—'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-foreground/80">
                              {mov.almacen?.nombre ?? '—'}
                              {mov.ubicacion?.codigo ? (
                                <span className="block text-xs text-muted-foreground">
                                  Ubicación: {mov.ubicacion.codigo}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-3 px-2 text-right text-foreground font-semibold">
                              {mov.tipo === 'SALIDA' ? '-' : '+'}{formatNumber(mov.cantidad)}
                            </td>
                            <td className="py-3 px-2 text-right text-foreground/80">
                              {formatCurrency(mov.costoUnitario, mov.moneda)}
                            </td>
                            <td className="py-3 px-2 text-right text-foreground font-semibold">
                              {mov.tipo === 'SALIDA' ? '-' : '+'}{formatCurrency(mov.valorTotal, mov.moneda)}
                            </td>
                            <td className="py-3 px-2 text-foreground/80">
                              {mov.lote ?? '—'} {mov.serie ? ` / ${mov.serie}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </ProtectedComponent>
    </div>
  )
}
