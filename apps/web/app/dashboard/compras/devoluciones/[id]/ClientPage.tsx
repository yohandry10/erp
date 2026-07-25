'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import {
  ArrowLeft,
  PackageX,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  User,
  Calendar,
  AlertCircle
} from 'lucide-react'

interface DevolucionItem {
  id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  motivo?: string
  motivo_detalle?: string
  observaciones?: string
  producto?: {
    codigo: string
    nombre: string
    unidad_medida: string
  }
}

interface Devolucion {
  id: string
  numero: string
  recepcion_id?: string
  orden_id: string
  proveedor_id: string
  fecha_devolucion: string
  estado: 'PENDIENTE' | 'EMITIDA' | 'ANULADA'
  motivo: string
  subtotal: number
  igv: number
  total: number
  observaciones?: string
  emitido_por?: string
  emitido_at?: string
  created_at: string
  created_by?: string
  orden?: {
    id: string
    numero: string
  }
  proveedor?: {
    id: string
    razon_social: string
    ruc: string
    direccion?: string
    telefono?: string
    email?: string
  }
  recepcion?: {
    id: string
    numero: string
    fecha_recepcion: string
  }
  items?: DevolucionItem[]
}

const ESTADO_CONFIG = {
  PENDIENTE: { icon: Clock, className: 'bg-blue-500/20 text-primary dark:text-blue-200 ring-blue-400/40' },
  EMITIDA: { icon: CheckCircle, className: 'bg-cyan-500/20 text-primary ring-cyan-300/40' },
  ANULADA: { icon: XCircle, className: 'bg-muted text-foreground ring-slate-500/40' }
}

const pageClass = 'min-h-full bg-gradient-to-br from-background via-muted/50 to-background p-6 text-foreground'
const panelClass = 'rounded-2xl border border-blue-400/20 bg-card/70 p-5 shadow-xl shadow-blue-950/20 backdrop-blur'
const panelHeaderClass = 'mb-5 flex items-center gap-3 border-b border-blue-400/20 pb-4'
const iconBoxClass = 'flex size-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-primary dark:text-blue-200'
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'
const valueClass = 'm-0 text-sm font-semibold text-foreground'
const primaryActionClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryActionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-500/40 bg-card/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted'
const tableHeadClass = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'
const tableCellClass = 'px-4 py-3 text-sm text-foreground/90'

export default function DevolucionDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()

  const [devolucion, setDevolucion] = useState<Devolucion | null>(null)
  const [loading, setLoading] = useState(true)
  const [emitiendo, setEmitiendo] = useState(false)
  const [pageMessage, setPageMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const devolucionId = params.id as string | undefined

  const loadDevolucion = useCallback(async () => {
    if (!devolucionId) return

    try {
      setLoading(true)
      setPageMessage(null)
      const response = await get(`/api/compras/devoluciones/${devolucionId}`)
      const devolucionData = response?.data ?? response
      if (devolucionData?.id) {
        setDevolucion(devolucionData)
      }
    } catch (error) {
      console.error('Error loading devolucion:', error)
      setPageMessage({ type: 'error', text: 'No se pudo cargar la devolución.' })
    } finally {
      setLoading(false)
    }
  }, [devolucionId, get])

  useEffect(() => {
    loadDevolucion()
  }, [loadDevolucion])

  const handleEmitir = async () => {
    if (!devolucion || devolucion.estado !== 'PENDIENTE' || emitiendo) {
      return
    }

    try {
      setEmitiendo(true)
      setPageMessage(null)
      const response = await post(`/api/compras/devoluciones/${devolucion.id}/emitir`, {})
      const devolucionEmitida = response?.data ?? response

      if (devolucionEmitida?.id || response?.success) {
        setPageMessage({ type: 'success', text: 'Devolución emitida correctamente.' })
        await loadDevolucion()
      } else {
        setPageMessage({ type: 'error', text: response?.message || 'No se pudo emitir la devolución.' })
      }
    } catch (error) {
      console.error('Error emitiendo devolucion:', error)
      setPageMessage({ type: 'error', text: 'No se pudo emitir la devolución.' })
    } finally {
      setEmitiendo(false)
    }
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getEstadoBadge = (estado: Devolucion['estado']) => {
    const config = ESTADO_CONFIG[estado] || ESTADO_CONFIG.PENDIENTE
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${config.className}`}>
        <Icon size={16} />
        {estado}
      </span>
    )
  }

  if (loading) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className={panelClass}>Cargando devolución...</div>
        </div>
      </div>
    )
  }

  if (!devolucion) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className={`${panelClass} max-w-xl text-center`}>
            <PackageX className="mx-auto mb-4 size-12 text-muted-foreground" />
            <p className="m-0 text-sm text-muted-foreground">Devolución no encontrada</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={pageClass}>
      <div className="mb-6 rounded-3xl border border-blue-400/20 bg-card/80 p-6 shadow-2xl shadow-blue-950/30">
        <button onClick={() => router.back()} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-primary dark:text-blue-200 transition hover:bg-blue-500/20">
          <ArrowLeft size={18} />
          Volver
        </button>

        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <h1 className="m-0 text-3xl font-bold text-foreground">Devolución {devolucion.numero}</h1>
              {getEstadoBadge(devolucion.estado)}
            </div>
            <p className="m-0 text-sm text-muted-foreground">Creada el {formatDateTime(devolucion.created_at)}</p>
          </div>

          {devolucion.estado === 'PENDIENTE' && (
            <button onClick={handleEmitir} disabled={emitiendo} className={primaryActionClass}>
              <CheckCircle size={18} />
              {emitiendo ? 'Emitiendo...' : 'Emitir Devolución'}
            </button>
          )}
        </div>
      </div>

      {pageMessage && (
        <div className={`mb-6 rounded-xl border p-4 text-sm font-semibold ${pageMessage.type === 'error' ? 'border-slate-500/40 bg-card/80 text-foreground' : 'border-blue-400/30 bg-blue-500/10 text-primary dark:text-blue-200'}`}>
          <div className="flex items-center gap-3">
            {pageMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            {pageMessage.text}
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="grid gap-6">
          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><FileText size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Información de la Devolución</h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>Número</label>
                <p className={valueClass}>{devolucion.numero}</p>
              </div>
              <div>
                <label className={labelClass}>Fecha</label>
                <p className={valueClass}>{formatDate(devolucion.fecha_devolucion)}</p>
              </div>
              <div>
                <label className={labelClass}>Orden de Compra</label>
                <p className={valueClass}>{devolucion.orden?.numero || 'N/A'}</p>
              </div>
              {devolucion.recepcion && (
                <div>
                  <label className={labelClass}>Recepción</label>
                  <p className={valueClass}>{devolucion.recepcion.numero}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Recibida: {formatDate(devolucion.recepcion.fecha_recepcion)}</p>
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-blue-400/20 pt-5">
              <label className={labelClass}>Motivo</label>
              <p className="mb-4 text-sm font-semibold text-foreground">{devolucion.motivo}</p>
              {devolucion.observaciones && (
                <>
                  <label className={labelClass}>Observaciones</label>
                  <p className="m-0 text-sm leading-6 text-muted-foreground">{devolucion.observaciones}</p>
                </>
              )}
            </div>

            {devolucion.estado === 'EMITIDA' && (
              <div className="mt-5 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 size-5 shrink-0 text-primary dark:text-blue-200" />
                  <div>
                    <p className="mb-1 font-semibold text-primary dark:text-blue-200">Devolución emitida</p>
                    <p className="m-0 text-sm text-muted-foreground">
                      Emitida el {devolucion.emitido_at ? formatDateTime(devolucion.emitido_at) : 'N/A'}
                      {devolucion.emitido_por && ` por ${devolucion.emitido_por}`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><PackageX size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Items Devueltos</h2>
            </div>

            <div className="overflow-x-auto rounded-xl border border-blue-400/10">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-blue-400/20 bg-blue-500/5">
                    <th className={tableHeadClass}>Producto</th>
                    <th className={`${tableHeadClass} text-center`}>Cantidad</th>
                    <th className={`${tableHeadClass} text-right`}>Precio Unit.</th>
                    <th className={`${tableHeadClass} text-right`}>Subtotal</th>
                    <th className={tableHeadClass}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {devolucion.items?.map((item) => (
                    <tr key={item.id} className="border-b border-blue-400/10 last:border-b-0 hover:bg-blue-500/5">
                      <td className={tableCellClass}>
                        <div className="font-semibold text-foreground">{item.producto?.nombre || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">{item.producto?.codigo || 'N/A'}</div>
                      </td>
                      <td className={`${tableCellClass} text-center font-semibold text-foreground`}>
                        {item.cantidad} {item.producto?.unidad_medida || ''}
                      </td>
                      <td className={`${tableCellClass} text-right`}>{formatCurrency(item.precio_unitario)}</td>
                      <td className={`${tableCellClass} text-right font-semibold text-foreground`}>{formatCurrency(item.subtotal)}</td>
                      <td className={tableCellClass}>
                        <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground ring-1 ring-slate-500/40">
                          {item.motivo || devolucion.motivo}
                        </span>
                        {item.motivo_detalle && <div className="mt-2 text-xs text-muted-foreground">{item.motivo_detalle}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto mt-6 grid max-w-sm gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-semibold text-foreground">{formatCurrency(devolucion.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IGV (18%):</span>
                <span className="font-semibold text-foreground">{formatCurrency(devolucion.igv)}</span>
              </div>
              <div className="flex justify-between border-t border-blue-400/20 pt-2 text-lg">
                <span className="font-semibold text-foreground">Total:</span>
                <span className="font-bold text-primary dark:text-blue-200">{formatCurrency(devolucion.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid content-start gap-6">
          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><User size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Proveedor</h2>
            </div>
            <div className="grid gap-4">
              <div>
                <p className={valueClass}>{devolucion.proveedor?.razon_social || 'N/A'}</p>
                <p className="mt-1 text-xs text-muted-foreground">RUC: {devolucion.proveedor?.ruc || 'N/A'}</p>
              </div>
              {devolucion.proveedor?.direccion && (
                <div>
                  <label className={labelClass}>Dirección</label>
                  <p className="m-0 text-sm text-muted-foreground">{devolucion.proveedor.direccion}</p>
                </div>
              )}
              {devolucion.proveedor?.telefono && (
                <div>
                  <label className={labelClass}>Teléfono</label>
                  <p className="m-0 text-sm text-muted-foreground">{devolucion.proveedor.telefono}</p>
                </div>
              )}
              {devolucion.proveedor?.email && (
                <div>
                  <label className={labelClass}>Email</label>
                  <p className="m-0 text-sm text-muted-foreground">{devolucion.proveedor.email}</p>
                </div>
              )}
            </div>
          </div>

          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><Calendar size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Auditoría</h2>
            </div>
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 size-5 shrink-0 text-primary dark:text-blue-200" />
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Creada</p>
                  <p className={valueClass}>{formatDateTime(devolucion.created_at)}</p>
                </div>
              </div>

              {devolucion.created_by && (
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 size-5 shrink-0 text-primary dark:text-blue-200" />
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Creada por</p>
                    <p className={valueClass}>{devolucion.created_by}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-primary dark:text-blue-200" />
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Estado actual</p>
                  <p className={valueClass}>{devolucion.estado}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

