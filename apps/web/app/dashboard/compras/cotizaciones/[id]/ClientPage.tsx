'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import {
  ArrowLeft,
  Edit,
  Send,
  CheckCircle,
  XCircle,
  FileText,
  Calendar,
  User,
  DollarSign,
  Package,
  Clock,
  ShoppingCart
} from 'lucide-react'

interface CotizacionDetalle {
  id: string
  numero: string
  proveedor_id: string
  fecha_cotizacion: string
  fecha_vencimiento: string
  validez_dias: number
  estado: 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA'
  subtotal: number
  igv: number
  total: number
  moneda: string
  observaciones?: string
  orden_compra_id?: string
  enviado_at?: string
  aprobado_at?: string
  rechazado_at?: string
  motivo_rechazo?: string
  created_at: string
  proveedores?: {
    razon_social: string
    ruc: string
    email?: string
    telefono?: string
  }
  detalles?: Array<{
    id: string
    producto_id: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    productos?: {
      nombre: string
      codigo: string
      unidad_medida?: string
    }
  }>
}

const ESTADO_CONFIG = {
  BORRADOR: { label: 'Borrador', icon: Edit, className: 'bg-slate-700/80 text-slate-100 ring-slate-500/40' },
  ENVIADA: { label: 'Enviada', icon: Send, className: 'bg-blue-500/20 text-blue-100 ring-blue-400/40' },
  APROBADA: { label: 'Aprobada', icon: CheckCircle, className: 'bg-blue-500/25 text-blue-50 ring-blue-300/40' },
  RECHAZADA: { label: 'Rechazada', icon: XCircle, className: 'bg-slate-800 text-slate-100 ring-slate-500/40' },
  VENCIDA: { label: 'Vencida', icon: Clock, className: 'bg-slate-700/80 text-slate-100 ring-slate-500/40' }
}

const pageClass = 'min-h-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-slate-100'
const panelClass = 'rounded-2xl border border-blue-400/20 bg-slate-950/70 p-5 shadow-xl shadow-blue-950/20 backdrop-blur'
const panelHeaderClass = 'mb-5 flex items-center gap-3 border-b border-blue-400/20 pb-4'
const iconBoxClass = 'flex size-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-200'
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400'
const valueClass = 'm-0 text-sm font-semibold text-slate-100'
const actionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/15 px-4 py-2.5 text-sm font-semibold text-blue-50 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60'
const primaryActionClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryActionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-500/40 bg-slate-900/70 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
const tableHeadClass = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-400'
const tableCellClass = 'px-4 py-3 text-sm text-slate-200'

type EstadoCotizacionKey = keyof typeof ESTADO_CONFIG

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('es-PE')
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString('es-PE')
}

const normalizeEstado = (estado?: string): EstadoCotizacionKey => {
  const candidate = String(estado || 'BORRADOR').toUpperCase()
  return candidate in ESTADO_CONFIG ? (candidate as EstadoCotizacionKey) : 'BORRADOR'
}

export default function CotizacionDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()
  const cotizacionId = params.id as string

  const [cotizacion, setCotizacion] = useState<CotizacionDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const loadCotizacion = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/compras/cotizaciones/${cotizacionId}`)

      if (response?.success && response.data) {
        setCotizacion(response.data)
      } else {
        alert('Error al cargar la cotización')
        router.push('/dashboard/compras/cotizaciones')
      }
    } catch (error) {
      console.error('Error loading cotizacion:', error)
      alert('Error al cargar la cotización')
      router.push('/dashboard/compras/cotizaciones')
    } finally {
      setLoading(false)
    }
  }, [cotizacionId, get, router])

  useEffect(() => {
    loadCotizacion()
  }, [loadCotizacion])

  const handleEnviar = async () => {
    if (!confirm('¿Está seguro de enviar esta cotización al proveedor?')) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/enviar`, {})

      if (response?.success) {
        alert('✅ Cotización enviada exitosamente')
        loadCotizacion()
      } else {
        alert(`Error: ${response?.message || 'No se pudo enviar la cotización'}`)
      }
    } catch (error: any) {
      console.error('Error enviando cotización:', error)
      alert(`Error: ${error.message || 'No se pudo enviar la cotización'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleAprobar = async () => {
    if (!confirm('¿Está seguro de aprobar esta cotización?')) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/aprobar`, {})

      if (response?.success) {
        alert('✅ Cotización aprobada exitosamente')
        loadCotizacion()
      } else {
        alert(`Error: ${response?.message || 'No se pudo aprobar la cotización'}`)
      }
    } catch (error: any) {
      console.error('Error aprobando cotización:', error)
      alert(`Error: ${error.message || 'No se pudo aprobar la cotización'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRechazar = async () => {
    const motivo = prompt('Ingrese el motivo del rechazo:')
    if (!motivo) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/rechazar`, { motivo })

      if (response?.success) {
        alert('✅ Cotización rechazada')
        loadCotizacion()
      } else {
        alert(`Error: ${response?.message || 'No se pudo rechazar la cotización'}`)
      }
    } catch (error: any) {
      console.error('Error rechazando cotización:', error)
      alert(`Error: ${error.message || 'No se pudo rechazar la cotización'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleConvertirOC = async () => {
    if (!confirm('¿Está seguro de convertir esta cotización en una Orden de Compra?')) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/convertir-oc`, {})

      if (response?.success && response.data?.orden_id) {
        alert('✅ Orden de Compra creada exitosamente')
        router.push(`/dashboard/compras/ordenes/${response.data.orden_id}`)
      } else {
        alert(`Error: ${response?.message || 'No se pudo convertir a OC'}`)
      }
    } catch (error: any) {
      console.error('Error convirtiendo a OC:', error)
      alert(`Error: ${error.message || 'No se pudo convertir a OC'}`)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className={panelClass}>Cargando cotización...</div>
        </div>
      </div>
    )
  }

  if (!cotizacion) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className={panelClass}>Cotización no encontrada</div>
        </div>
      </div>
    )
  }

  const estado = normalizeEstado(cotizacion.estado)
  const estadoConfig = ESTADO_CONFIG[estado]
  const EstadoIcon = estadoConfig.icon
  const vencimiento = cotizacion.fecha_vencimiento ? new Date(cotizacion.fecha_vencimiento) : null
  const isVencida = !!vencimiento && !Number.isNaN(vencimiento.getTime()) && vencimiento < new Date()
  const puedeEnviar = estado === 'BORRADOR'
  const puedeAprobar = estado === 'ENVIADA' && !isVencida
  const puedeRechazar = estado === 'ENVIADA'
  const puedeConvertir = estado === 'APROBADA' && !cotizacion.orden_compra_id && !isVencida
  const detalles = Array.isArray(cotizacion.detalles) ? cotizacion.detalles : []
  const moneda = cotizacion.moneda || 'PEN'

  return (
    <div className={pageClass}>
      <div className="mb-6 rounded-3xl border border-blue-400/20 bg-slate-950/80 p-6 shadow-2xl shadow-blue-950/30">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button onClick={() => router.push('/dashboard/compras/cotizaciones')} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20">
              <ArrowLeft size={16} />
              Volver a Cotizaciones
            </button>
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <h1 className="m-0 text-3xl font-bold text-white">Cotización {cotizacion.numero}</h1>
              <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${estadoConfig.className}`}>
                <EstadoIcon size={16} />
                {estadoConfig.label}
              </span>
            </div>
            <p className="m-0 text-sm text-slate-300">
              Proveedor: {cotizacion.proveedores?.razon_social || 'N/A'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {puedeEnviar && (
              <button onClick={handleEnviar} disabled={actionLoading} className={primaryActionClass}>
                <Send size={16} />
                Enviar
              </button>
            )}
            {puedeAprobar && (
              <button onClick={handleAprobar} disabled={actionLoading} className={primaryActionClass}>
                <CheckCircle size={16} />
                Aprobar
              </button>
            )}
            {puedeRechazar && (
              <button onClick={handleRechazar} disabled={actionLoading} className={secondaryActionClass}>
                <XCircle size={16} />
                Rechazar
              </button>
            )}
            {puedeConvertir && (
              <button onClick={handleConvertirOC} disabled={actionLoading} className={primaryActionClass}>
                <ShoppingCart size={16} />
                Convertir a OC
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className={panelClass}>
          <div className={panelHeaderClass}>
            <div className={iconBoxClass}><FileText size={20} /></div>
            <h2 className="m-0 text-lg font-bold text-white">Información General</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Número</label>
              <p className={valueClass}>{cotizacion.numero}</p>
            </div>
            <div>
              <label className={labelClass}>Fecha Cotización</label>
              <p className={valueClass}>{formatDate(cotizacion.fecha_cotizacion)}</p>
            </div>
            <div>
              <label className={labelClass}>Fecha Vencimiento</label>
              <p className={valueClass}>{formatDate(cotizacion.fecha_vencimiento)}</p>
            </div>
            <div>
              <label className={labelClass}>Moneda</label>
              <p className={valueClass}>{moneda}</p>
            </div>
          </div>
        </div>

        <div className={panelClass}>
          <div className={panelHeaderClass}>
            <div className={iconBoxClass}><User size={20} /></div>
            <h2 className="m-0 text-lg font-bold text-white">Proveedor</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Razón Social</label>
              <p className={valueClass}>{cotizacion.proveedores?.razon_social || 'N/A'}</p>
            </div>
            <div>
              <label className={labelClass}>RUC</label>
              <p className={valueClass}>{cotizacion.proveedores?.ruc || 'N/A'}</p>
            </div>
            {cotizacion.proveedores?.email && (
              <div>
                <label className={labelClass}>Email</label>
                <p className="m-0 text-sm text-slate-200">{cotizacion.proveedores.email}</p>
              </div>
            )}
            {cotizacion.proveedores?.telefono && (
              <div>
                <label className={labelClass}>Teléfono</label>
                <p className="m-0 text-sm text-slate-200">{cotizacion.proveedores.telefono}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`${panelClass} mb-6`}>
        <div className={panelHeaderClass}>
          <div className={iconBoxClass}><Package size={20} /></div>
          <h2 className="m-0 text-lg font-bold text-white">Detalle de Productos</h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-blue-400/10">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-blue-400/20 bg-blue-500/5">
                <th className={tableHeadClass}>Código</th>
                <th className={tableHeadClass}>Producto</th>
                <th className={`${tableHeadClass} text-center`}>Cantidad</th>
                <th className={`${tableHeadClass} text-right`}>Precio Unit.</th>
                <th className={`${tableHeadClass} text-right`}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {detalles.map((detalle) => (
                <tr key={detalle.id} className="border-b border-blue-400/10 last:border-b-0 hover:bg-blue-500/5">
                  <td className={tableCellClass}>{detalle.productos?.codigo || 'N/A'}</td>
                  <td className={`${tableCellClass} font-semibold text-white`}>{detalle.productos?.nombre || 'N/A'}</td>
                  <td className={`${tableCellClass} text-center`}>{toNumber(detalle.cantidad)} {detalle.productos?.unidad_medida || ''}</td>
                  <td className={`${tableCellClass} text-right`}>{moneda} {toNumber(detalle.precio_unitario).toFixed(2)}</td>
                  <td className={`${tableCellClass} text-right font-semibold text-white`}>{moneda} {toNumber(detalle.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto mt-6 grid max-w-sm gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Subtotal:</span>
            <span className="font-semibold text-slate-100">{moneda} {toNumber(cotizacion.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">IGV (18%):</span>
            <span className="font-semibold text-slate-100">{moneda} {toNumber(cotizacion.igv).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-blue-400/20 pt-2 text-lg">
            <span className="font-semibold text-white">Total:</span>
            <span className="font-bold text-blue-100">{moneda} {toNumber(cotizacion.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {cotizacion.observaciones && (
        <div className={`${panelClass} mb-6`}>
          <h2 className="mb-3 text-lg font-bold text-white">Observaciones</h2>
          <p className="m-0 text-sm leading-6 text-slate-300">{cotizacion.observaciones}</p>
        </div>
      )}

      {(cotizacion.enviado_at || cotizacion.aprobado_at || cotizacion.rechazado_at || cotizacion.orden_compra_id) && (
        <div className={panelClass}>
          <h2 className="mb-4 text-lg font-bold text-white">Historial</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cotizacion.enviado_at && (
              <div className="flex items-center gap-3">
                <div className={iconBoxClass}><Send size={16} /></div>
                <div>
                  <div className={valueClass}>Enviada</div>
                  <div className="text-xs text-slate-400">{formatDateTime(cotizacion.enviado_at)}</div>
                </div>
              </div>
            )}
            {cotizacion.aprobado_at && (
              <div className="flex items-center gap-3">
                <div className={iconBoxClass}><CheckCircle size={16} /></div>
                <div>
                  <div className={valueClass}>Aprobada</div>
                  <div className="text-xs text-slate-400">{formatDateTime(cotizacion.aprobado_at)}</div>
                </div>
              </div>
            )}
            {cotizacion.rechazado_at && (
              <div className="flex items-center gap-3">
                <div className={iconBoxClass}><XCircle size={16} /></div>
                <div>
                  <div className={valueClass}>Rechazada</div>
                  <div className="text-xs text-slate-400">{formatDateTime(cotizacion.rechazado_at)}</div>
                  {cotizacion.motivo_rechazo && <div className="mt-1 text-xs text-slate-300">Motivo: {cotizacion.motivo_rechazo}</div>}
                </div>
              </div>
            )}
            {cotizacion.orden_compra_id && (
              <div className="flex items-center gap-3">
                <div className={iconBoxClass}><ShoppingCart size={16} /></div>
                <div>
                  <div className={valueClass}>Convertida a OC</div>
                  <button
                    onClick={() => router.push(`/dashboard/compras/ordenes/${cotizacion.orden_compra_id}`)}
                    className="mt-1 text-xs font-semibold text-blue-200 underline-offset-4 hover:underline"
                  >
                    Ver Orden de Compra
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

