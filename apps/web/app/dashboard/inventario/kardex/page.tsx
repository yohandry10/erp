'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { useApi } from '@/hooks/use-api'

type KardexMovimiento = {
  id: string
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
}

type KardexResumen = {
  totalMovimientos: number
  totalEntradas: number
  valorEntradas: number
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
  valorEntradas: 0,
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
    <div
      style={{
        padding: '1.75rem',
        borderRadius: '16px',
        border: '1px solid rgba(59, 130, 246, 0.35)',
        background: 'rgba(191, 219, 254, 0.45)',
        color: '#1d4ed8',
        fontWeight: 600,
      }}
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
        note: 'Entradas contabilizadas',
      },
      {
        label: 'Cantidad total',
        value: resumen.totalEntradas,
        note: 'Unidades recibidas',
      },
      {
        label: 'Valor entradas',
        value: resumen.valorEntradas,
        note: 'Total valorizado',
        formatted: formatCurrency(resumen.valorEntradas),
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>Kardex valorizado</h1>
          <span
            style={{
              background: 'rgba(96, 165, 250, 0.18)',
              color: '#1d4ed8',
              borderRadius: '999px',
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            Inventario → Contabilidad
          </span>
        </div>
        <p style={{ margin: 0, color: '#475569', maxWidth: '760px', lineHeight: 1.6 }}>
          Consulta las entradas de inventario con costo valorizado, filtrando por producto, almacén y rango de
          fechas. Los datos respetan el tenant activo y exponen el total por moneda para conciliación contable.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            href="/dashboard/inventario/recepciones"
            style={{ color: '#166534', fontWeight: 600, textDecoration: 'none' }}
          >
            Ir a Recepciones →
          </Link>
          <Link
            href="/dashboard/inventario/almacenes"
            style={{ color: '#1e3a8a', fontWeight: 600, textDecoration: 'none' }}
          >
            Gestionar Almacenes →
          </Link>
        </div>
      </header>

      <ProtectedComponent modulo="inventario" recurso="kardex" accion="read" fallback={<NoPermissionBanner />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <form
            onSubmit={applyFilters}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'flex-end',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: '14px',
              padding: '1.25rem',
              background: 'rgba(248, 250, 252, 0.85)',
            }}
          >
            <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Producto
              </label>
              <select
                value={pendingFilters.productoId}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, productoId: event.target.value }))}
                disabled={catalogLoading}
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5f5',
                  fontSize: '0.875rem',
                  background: 'white',
                }}
              >
                <option value="">Todos los productos</option>
                {productos.map((producto) => (
                  <option key={producto.id} value={producto.id}>
                    {producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Almacén
              </label>
              <select
                value={pendingFilters.almacenId}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, almacenId: event.target.value }))}
                disabled={catalogLoading}
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5f5',
                  fontSize: '0.875rem',
                  background: 'white',
                }}
              >
                <option value="">Todos los almacenes</option>
                {almacenes.map((almacen) => (
                  <option key={almacen.id} value={almacen.id}>
                    {almacen.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 180px', minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Desde
              </label>
              <input
                type="date"
                value={pendingFilters.desde}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, desde: event.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5f5',
                  fontSize: '0.875rem',
                  background: 'white',
                }}
              />
            </div>

            <div style={{ flex: '1 1 180px', minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Hasta
              </label>
              <input
                type="date"
                value={pendingFilters.hasta}
                onChange={(event) => setPendingFilters((prev) => ({ ...prev, hasta: event.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5f5',
                  fontSize: '0.875rem',
                  background: 'white',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type='submit'
                style={{
                  padding: '0.7rem 1.4rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#1d4ed8',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Aplicar filtros
              </button>
              <button
                type='button'
                onClick={resetFilters}
                style={{
                  padding: '0.7rem 1.2rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  background: 'white',
                  color: '#1d4ed8',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Limpiar
              </button>
            </div>
          </form>

          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '3rem 0',
                color: '#1d4ed8',
                fontWeight: 600,
              }}
            >
              Cargando kardex…
            </div>
          ) : (
            <>
              {error && (
                <div
                  style={{
                    padding: '1rem 1.25rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    background: 'rgba(254, 226, 226, 0.65)',
                    color: '#b91c1c',
                    fontWeight: 600,
                  }}
                >
                  {error}
                </div>
              )}

              <section
                style={{
                  display: 'grid',
                  gap: '1rem',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                {resumenCards.map((card) => (
                  <div
                    key={card.label}
                    style={{
                      borderRadius: '16px',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      background: 'white',
                      padding: '1.1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700 }}>
                      {card.label}
                    </span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
                      {'formatted' in card ? card.formatted : formatNumber(card.value)}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#475569' }}>{card.note}</span>
                  </div>
                ))}
              </section>

              {Object.keys(resumen.valorPorMoneda ?? {}).length > 0 && (
                <section
                  style={{
                    borderRadius: '14px',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    background: 'rgba(191, 219, 254, 0.35)',
                    padding: '1rem',
                    color: '#1e3a8a',
                    fontSize: '0.9rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <strong>Valor por moneda:</strong>
                  {Object.entries(resumen.valorPorMoneda).map(([moneda, valor]) => (
                    <span key={moneda}>
                      {moneda}: {formatCurrency(valor, moneda)}
                    </span>
                  ))}
                </section>
              )}

              <section
                style={{
                  borderRadius: '16px',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: '#ffffff',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Detalle de entradas</h2>
                {movimientos.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No se encontraron movimientos para los filtros seleccionados.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '880px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569', fontSize: '0.75rem' }}>
                          <th style={{ padding: '0.65rem 0.5rem' }}>Fecha</th>
                          <th style={{ padding: '0.65rem 0.5rem' }}>Documento</th>
                          <th style={{ padding: '0.65rem 0.5rem' }}>Producto</th>
                          <th style={{ padding: '0.65rem 0.5rem' }}>Almacén</th>
                          <th style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>Cantidad</th>
                          <th style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>Costo Unit.</th>
                          <th style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>Valor total</th>
                          <th style={{ padding: '0.65rem 0.5rem' }}>Lote / Serie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((mov) => (
                          <tr key={mov.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.75rem 0.5rem', color: '#0f172a', fontWeight: 600 }}>{formatDateTime(mov.fecha)}</td>
                            <td style={{ padding: '0.75rem 0.5rem', color: '#475569' }}>{mov.documento ?? '—'}</td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>{mov.producto.nombre}</span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  {mov.producto.codigo ?? mov.producto.sku ?? '—'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', color: '#475569' }}>
                              {mov.almacen?.nombre ?? '—'}
                              {mov.ubicacion?.codigo ? (
                                <span style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8' }}>
                                  Ubicación: {mov.ubicacion.codigo}
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                              {formatNumber(mov.cantidad)}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#475569' }}>
                              {formatCurrency(mov.costoUnitario, mov.moneda)}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                              {formatCurrency(mov.valorTotal, mov.moneda)}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', color: '#475569' }}>
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
