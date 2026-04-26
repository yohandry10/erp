'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Package, Filter, Search, RefreshCcw } from 'lucide-react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { useApi } from '@/hooks/use-api'

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

const formatCurrency = (value: number, currency: string = 'PEN') =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value)

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const candidate = value.includes('T') ? value : `${value}T00:00:00Z`
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('es-PE')
}

const fallbackStyle: React.CSSProperties = {
  border: '1px dashed rgba(220, 38, 38, 0.35)',
  borderRadius: '12px',
  background: 'rgba(254, 226, 226, 0.6)',
  padding: '1.5rem',
  color: '#b91c1c',
  fontWeight: 600,
}

function NoPermission() {
  return (
    <div style={fallbackStyle}>
      No cuentas con el permiso <code>inventario.ingresos.write</code>. Solicítalo para administrar recepciones.
    </div>
  )
}

export default function RecepcionesPage() {
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
        setRecepciones(response.data ?? [])
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
            Recepciones de compra
          </h1>
          <span
            style={{
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#15803d',
              borderRadius: '999px',
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            Compras → Inventario
          </span>
        </div>
        <p style={{ margin: 0, color: '#475569', maxWidth: '760px', lineHeight: 1.6 }}>
          Gestiona recepciones totales o parciales, asigna ubicaciones y emite el evento{' '}
          <code>RecepcionRegistradaEvent</code> para Kardex y Contabilidad. Se aplican controles multitenant y
          permisos endurecidos.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/dashboard/compras/ordenes" style={{ color: '#2563eb', fontWeight: 600 }}>
            Volver a Órdenes de Compra →
          </Link>
          <Link href="/dashboard/inventario/kardex" style={{ color: '#0f766e', fontWeight: 600 }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <section
            style={{
              border: '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: '14px',
              padding: '1.1rem',
              background: '#ffffff',
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#0f172a' }}>
              <Package size={20} />
              <span style={{ fontWeight: 600 }}>
                Recepciones cargadas: {recepciones.length.toLocaleString('es-PE')}
              </span>
            </div>
            <div style={{ color: '#475569', fontSize: '0.85rem' }}>
              Valor total filtrado: <strong>{formatCurrency(totalValorizado)}</strong>
            </div>
            <button
              type="button"
              onClick={loadRecepciones}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'white',
                color: '#1f2937',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCcw size={16} />
              Refrescar
            </button>
          </section>

          <form
            style={{
              border: '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: '14px',
              padding: '1.25rem',
              background: 'rgba(248, 250, 252, 0.85)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'flex-end',
            }}
            onSubmit={(event) => {
              event.preventDefault()
              setPagination((prev) => ({ ...prev, page: 1 }))
              loadRecepciones()
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 280px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: '#e2e8f0',
                  color: '#475569',
                }}
              >
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
                style={{
                  flex: 1,
                  padding: '0.6rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5f5',
                  background: 'white',
                }}
              />
            </div>

            <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
              <label
                style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
              >
                Estado
              </label>
              <div style={{ position: 'relative' }}>
                <Filter
                  size={16}
                  style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                />
                <select
                  value={filters.estado}
                  onChange={(event) => {
                    setFilters((prev) => ({ ...prev, estado: event.target.value as RecepcionFilters['estado'] }))
                    setPagination((prev) => ({ ...prev, page: 1 }))
                  }}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem 0.6rem 2.2rem',
                    borderRadius: '10px',
                    border: '1px solid #cbd5f5',
                    background: 'white',
                    fontSize: '0.9rem',
                  }}
                >
                  {ESTADOS.map((estado) => (
                    <option key={estado.value || 'all'} value={estado.value}>
                      {estado.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="submit"
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#1d4ed8',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={resetFilters}
                style={{
                  padding: '0.6rem 1.2rem',
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
              Cargando recepciones…
            </div>
          ) : error ? (
            <div
              style={{
                border: '1px solid rgba(239, 68, 68, 0.35)',
                background: 'rgba(254, 226, 226, 0.65)',
                borderRadius: '12px',
                padding: '1rem 1.2rem',
                color: '#b91c1c',
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          ) : recepciones.length === 0 ? (
            <div
              style={{
                border: '1px dashed rgba(148, 163, 184, 0.4)',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                color: '#94a3b8',
              }}
            >
              No encontramos recepciones con los filtros seleccionados.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {recepciones.map((recepcion) => (
                <article
                  key={recepcion.id}
                  style={{
                    border: '1px solid rgba(226, 232, 240, 0.85)',
                    borderRadius: '14px',
                    background: 'rgba(248, 250, 252, 0.95)',
                    padding: '1.1rem',
                    display: 'grid',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                        Recepción #{recepcion.numero}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                        Fecha: {formatDate(recepcion.fechaRecepcion)} · Ítems: {recepcion.totalItems}
                      </span>
                      {recepcion.orden && (
                        <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                          Orden: {recepcion.orden.numero} ·{' '}
                          {formatCurrency(recepcion.orden.total, recepcion.orden.moneda)}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        alignSelf: 'flex-start',
                        padding: '0.3rem 0.85rem',
                        borderRadius: '999px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#1d4ed8',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {recepcion.estado}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', color: '#475569', fontSize: '0.85rem' }}>
                    <span>
                      Cantidad recibida:{' '}
                      <strong style={{ color: '#0f172a' }}>
                        {recepcion.totalCantidad.toLocaleString('es-PE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </span>
                    <span>
                      Valor NI:{' '}
                      <strong style={{ color: '#0f172a' }}>
                        {formatCurrency(recepcion.totalValorizado, recepcion.orden?.moneda ?? 'PEN')}
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
                    <div
                      style={{
                        borderLeft: '3px solid rgba(59, 130, 246, 0.35)',
                        paddingLeft: '0.75rem',
                        color: '#475569',
                        fontSize: '0.85rem',
                      }}
                    >
                      {recepcion.observaciones}
                    </div>
                  )}

                  <div
                    style={{
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      borderRadius: '10px',
                      background: 'white',
                      padding: '0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem',
                    }}
                  >
                    <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                      Detalle ({recepcion.items.length})
                    </strong>
                    {recepcion.items.length === 0 ? (
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        Esta recepción aún no tiene ítems valorizados.
                      </span>
                    ) : (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                        {recepcion.items.map((item) => (
                          <li
                            key={item.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              flexWrap: 'wrap',
                              fontSize: '0.85rem',
                              color: '#475569',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                {item.producto.nombre ?? 'Producto'}
                              </span>
                              <span>
                                {item.cantidad.toLocaleString('es-PE', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                                {' × '}
                                {formatCurrency(item.costoUnitario, recepcion.orden?.moneda ?? 'PEN')}
                              </span>
                            </div>
                            <div style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                              {formatCurrency(item.valorTotal, recepcion.orden?.moneda ?? 'PEN')}
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#475569' }}>
                  <span style={{ fontSize: '0.85rem' }}>
                    Página {pagination.page} de {pagination.totalPages} · {pagination.total.toLocaleString('es-PE')} registros
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
                      disabled={pagination.page <= 1}
                      style={{
                        padding: '0.5rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        background: 'white',
                        color: pagination.page <= 1 ? '#cbd5f5' : '#1d4ed8',
                        cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                      }}
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
                      style={{
                        padding: '0.5rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        background: '#1d4ed8',
                        color: 'white',
                        cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer',
                        opacity: pagination.page >= pagination.totalPages ? 0.45 : 1,
                        fontWeight: 600,
                      }}
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
