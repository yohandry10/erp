'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { parseDateLocal } from '@/lib/date-utils'
import {
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Package,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
  Truck,
  Download,
  RefreshCw
} from 'lucide-react'
import AprobacionesPanel from '@/components/compras/AprobacionesPanel'
import AprobarOrdenModal from '@/components/compras/AprobarOrdenModal'
import RechazarOrdenModal from '@/components/compras/RechazarOrdenModal'
import RecepcionesPanel from '@/components/compras/RecepcionesPanel'
import toast from 'react-hot-toast'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { useTaxConfig } from '@/hooks/useTaxConfig'

interface OrdenCompraDetalle {
  id: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  cantidad_recibida: number
  subtotal?: number
}

interface OrdenCompra {
  id: string
  numero: string
  proveedor_id: string
  cotizacion_id?: string
  fecha_orden: string
  fecha_entrega_esperada?: string
  condiciones_pago?: string
  dias_credito?: number
  almacen_destino_id?: string
  estado: string
  subtotal: number
  igv: number
  total: number
  moneda: string
  observaciones?: string
  proveedor?: {
    razon_social: string
    ruc: string
    email?: string
    telefono?: string
  }
  detalles?: OrdenCompraDetalle[]
  created_at: string
  updated_at: string
}

type EstadoOrden = 'BORRADOR' | 'APROBACION' | 'APROBADA' | 'PARCIAL' | 'RECIBIDA' | 'CERRADA' | 'ANULADA'

const ESTADOS_CONFIG: Record<EstadoOrden, { label: string; icon: any; className: string }> = {
  BORRADOR: { label: 'Borrador', icon: Edit, className: 'bg-muted/80 text-foreground ring-slate-500/40' },
  APROBACION: { label: 'En Aprobación', icon: Clock, className: 'bg-blue-500/20 text-primary dark:text-blue-200 ring-blue-400/40' },
  APROBADA: { label: 'Aprobada', icon: CheckCircle, className: 'bg-blue-500/25 text-primary dark:text-blue-200 ring-blue-300/40' },
  PARCIAL: { label: 'Parcial', icon: Package, className: 'bg-cyan-500/20 text-primary ring-cyan-300/40' },
  RECIBIDA: { label: 'Recibida', icon: CheckCircle, className: 'bg-cyan-500/25 text-primary ring-cyan-300/40' },
  CERRADA: { label: 'Cerrada', icon: FileText, className: 'bg-muted/80 text-foreground ring-slate-500/40' },
  ANULADA: { label: 'Anulada', icon: XCircle, className: 'bg-muted text-foreground ring-slate-500/40' }
}

const pageClass = 'min-h-full bg-gradient-to-br from-background via-muted/50 to-background p-6 text-foreground'
const panelClass = 'rounded-2xl border border-blue-400/20 bg-card/70 p-5 shadow-xl shadow-blue-950/20 backdrop-blur'
const panelHeaderClass = 'mb-5 flex items-center gap-3 border-b border-blue-400/20 pb-4'
const iconBoxClass = 'flex size-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-primary dark:text-blue-200'
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'
const valueClass = 'm-0 text-sm font-semibold text-foreground'
const actionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/15 px-4 py-2.5 text-sm font-semibold text-primary dark:text-blue-200 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60'
const primaryActionClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryActionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-500/40 bg-card/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted'
const tableHeadClass = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'
const tableCellClass = 'px-4 py-3 text-sm text-foreground/90'

export default function OrdenCompraDetallePage() {
  const { formatCurrency: formatLocalizedCurrency, currency, locale, taxIdLabel } = useLocalizedMoney()
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()

  const [orden, setOrden] = useState<OrdenCompra | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAprobarModal, setShowAprobarModal] = useState(false)
  const [showRechazarModal, setShowRechazarModal] = useState(false)

  const ordenId = params.id as string | undefined

  const loadOrden = useCallback(async () => {
    if (!ordenId) return

    try {
      setLoading(true)
      setError(null)
      const response = await get(`/api/compras/ordenes/${ordenId}`)

      if (response?.success && response.data) {
        setOrden(response.data)
      } else {
        setError('No se pudo cargar la orden de compra')
      }
    } catch (err: any) {
      console.error('Error loading orden:', err)
      setError(err.message || 'Error al cargar la orden de compra')
    } finally {
      setLoading(false)
    }
  }, [get, ordenId])

  useEffect(() => {
    loadOrden()
  }, [loadOrden])

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return formatLocalizedCurrency(amount)
  }

  const formatDate = (dateString: string) => {
    return parseDateLocal(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const CONDICIONES_LABELS: Record<string, string> = {
    CONTADO: 'Contado',
    CREDITO_15: 'Crédito 15 días',
    CREDITO_30: 'Crédito 30 días',
    CREDITO_45: 'Crédito 45 días',
    CREDITO_60: 'Crédito 60 días',
    CREDITO_90: 'Crédito 90 días',
  }

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoOrden]
    if (!config) return null

    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${config.className}`}>
        <Icon size={16} />
        {config.label}
      </span>
    )
  }

  const cantidadPendiente = (detalle: OrdenCompraDetalle) => {
    return detalle.cantidad - (detalle.cantidad_recibida || 0)
  }

  const porcentajeRecibido = () => {
    if (!orden?.detalles || orden.detalles.length === 0) return 0
    const totalCantidad = orden.detalles.reduce((sum, d) => sum + d.cantidad, 0)
    const totalRecibido = orden.detalles.reduce((sum, d) => sum + (d.cantidad_recibida || 0), 0)
    return totalCantidad > 0 ? (totalRecibido / totalCantidad) * 100 : 0
  }

  const handleAprobar = async (comentarios?: string) => {
    try {
      const response = await post(`/api/compras/ordenes/${params.id}/aprobar`, {
        comentarios
      })

      if (response?.success) {
        await loadOrden()
        toast.success('✅ Orden de compra aprobada exitosamente')
      } else {
        throw new Error(response?.message || 'Error al aprobar la orden')
      }
    } catch (err: any) {
      console.error('Error al aprobar orden:', err)
      toast.error(`❌ Error: ${err.message || 'No se pudo aprobar la orden'}`)
      throw err
    }
  }

  const handleRechazar = async (motivoRechazo: string) => {
    try {
      const response = await post(`/api/compras/ordenes/${params.id}/rechazar`, {
        motivo_rechazo: motivoRechazo
      })

      if (response?.success) {
        await loadOrden()
        toast.success('✅ Orden de compra rechazada exitosamente')
      } else {
        throw new Error(response?.message || 'Error al rechazar la orden')
      }
    } catch (err: any) {
      console.error('Error al rechazar orden:', err)
      toast.error(`❌ Error: ${err.message || 'No se pudo rechazar la orden'}`)
      throw err
    }
  }

  if (loading) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className={panelClass}>Cargando orden de compra...</div>
        </div>
      </div>
    )
  }

  if (error || !orden) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className={`${panelClass} max-w-xl text-center`}>
            <AlertCircle className="mx-auto mb-4 size-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">Error al cargar la orden</h3>
            <p className="mb-6 text-sm text-muted-foreground">{error || 'Orden no encontrada'}</p>
            <button onClick={() => router.push('/dashboard/compras/ordenes')} className={secondaryActionClass}>
              <ArrowLeft size={16} />
              Volver a Órdenes
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={pageClass}>
      <div className="mb-6 rounded-3xl border border-blue-400/20 bg-card/80 p-6 shadow-2xl shadow-blue-950/30">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button onClick={() => router.push('/dashboard/compras/ordenes')} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-primary dark:text-blue-200 transition hover:bg-blue-500/20">
              <ArrowLeft size={16} />
              Volver a Órdenes de Compra
            </button>
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <h1 className="m-0 text-3xl font-bold text-foreground">Orden de Compra {orden.numero}</h1>
              {getEstadoBadge(orden.estado)}
            </div>
            <p className="m-0 text-sm text-muted-foreground">Creada el {formatDate(orden.created_at)}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={loadOrden} className={secondaryActionClass}>
              <RefreshCw size={16} />
              Actualizar
            </button>
            {orden.estado === 'BORRADOR' && (
              <ProtectedComponent modulo="compras" accion="update" recurso="ordenes" fallback={null}>
                <button onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}/editar`)} className={primaryActionClass}>
                  <Edit size={16} />
                  Editar
                </button>
              </ProtectedComponent>
            )}
            <button onClick={() => toast('📥 Funcionalidad de descarga próximamente')} className={secondaryActionClass}>
              <Download size={16} />
              Descargar PDF
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="grid gap-6">
          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><User size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Información del Proveedor</h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>Razón Social</label>
                <p className={valueClass}>{orden.proveedor?.razon_social || 'N/A'}</p>
              </div>

              <div>
                <label className={labelClass}>{taxIdLabel}</label>
                <p className={valueClass}>{orden.proveedor?.ruc || 'N/A'}</p>
              </div>

              {orden.proveedor?.email && (
                <div>
                  <label className={labelClass}>Email</label>
                  <p className="m-0 text-sm text-foreground/90">{orden.proveedor.email}</p>
                </div>
              )}

              {orden.proveedor?.telefono && (
                <div>
                  <label className={labelClass}>Teléfono</label>
                  <p className="m-0 text-sm text-foreground/90">{orden.proveedor.telefono}</p>
                </div>
              )}
            </div>
          </div>

          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><Package size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Productos Solicitados</h2>
            </div>

            <div className="overflow-auto rounded-xl border border-blue-400/10">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-blue-400/20 bg-blue-500/5">
                    <th className={tableHeadClass}>Producto</th>
                    <th className={`${tableHeadClass} text-right`}>Cantidad</th>
                    <th className={`${tableHeadClass} text-right`}>Recibido</th>
                    <th className={`${tableHeadClass} text-right`}>Pendiente</th>
                    <th className={`${tableHeadClass} text-right`}>Precio Unit.</th>
                    <th className={`${tableHeadClass} text-right`}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {orden.detalles && orden.detalles.length > 0 ? (
                    orden.detalles.map((detalle, index) => (
                      <tr key={detalle.id || index} className="border-b border-blue-400/10 last:border-b-0 hover:bg-blue-500/5">
                        <td className={`${tableCellClass} font-semibold text-foreground`}>{detalle.descripcion}</td>
                        <td className={`${tableCellClass} text-right`}>{detalle.cantidad}</td>
                        <td className={`${tableCellClass} text-right font-semibold text-primary dark:text-blue-200`}>{detalle.cantidad_recibida || 0}</td>
                        <td className={`${tableCellClass} text-right font-semibold text-muted-foreground`}>{cantidadPendiente(detalle)}</td>
                        <td className={`${tableCellClass} text-right`}>{formatCurrency(detalle.precio_unitario)}</td>
                        <td className={`${tableCellClass} text-right font-semibold text-foreground`}>{formatCurrency(detalle.cantidad * detalle.precio_unitario)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No hay productos en esta orden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid content-start gap-6">
          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><DollarSign size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Resumen</h2>
            </div>

            <div className="grid gap-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold text-foreground">{formatCurrency(orden.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{nombreImpuesto} ({Math.round(tasaIgv * 100)}%)</span>
                <span className="font-semibold text-foreground">{formatCurrency(orden.igv)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-blue-400/20 pt-4">
                <span className="font-bold text-foreground">Total</span>
                <span className="text-xl font-bold text-primary dark:text-blue-200">{formatCurrency(orden.total)}</span>
              </div>
              <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-3">
                <div className="mb-1 text-xs text-muted-foreground">Moneda</div>
                <div className="text-sm font-semibold text-foreground">{orden.moneda || currency}</div>
              </div>
            </div>
          </div>

          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div className={iconBoxClass}><Calendar size={20} /></div>
              <h2 className="m-0 text-lg font-bold text-foreground">Fechas</h2>
            </div>

            <div className="grid gap-4">
              <div>
                <label className={labelClass}>Fecha de Orden</label>
                <p className={valueClass}>{formatDate(orden.fecha_orden)}</p>
              </div>

              {orden.fecha_entrega_esperada && (
                <div>
                  <label className={labelClass}>Fecha de Entrega Esperada</label>
                  <p className={valueClass}>{formatDate(orden.fecha_entrega_esperada)}</p>
                </div>
              )}

              {orden.condiciones_pago && (
                <div>
                  <label className={labelClass}>Condiciones de Pago</label>
                  <p className={valueClass}>
                    {CONDICIONES_LABELS[orden.condiciones_pago] ?? orden.condiciones_pago}
                    {orden.dias_credito ? ` (${orden.dias_credito} días)` : ''}
                  </p>
                </div>
              )}
            </div>
          </div>

          {(orden.estado === 'PARCIAL' || orden.estado === 'RECIBIDA') && (
            <div className={panelClass}>
              <div className={panelHeaderClass}>
                <div className={iconBoxClass}><Truck size={20} /></div>
                <h2 className="m-0 text-lg font-bold text-foreground">Progreso de Recepción</h2>
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Recibido</span>
                  <span className="text-sm font-bold text-primary dark:text-blue-200">{porcentajeRecibido().toFixed(1)}%</span>
                </div>
                <progress className="h-3 w-full accent-blue-500" value={porcentajeRecibido()} max={100} />
              </div>

              <button onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}/recepciones`)} className={`${primaryActionClass} w-full`}>
                <Truck size={16} />
                Ver Recepciones
              </button>
            </div>
          )}

          {(orden.estado === 'APROBACION' || orden.estado === 'BORRADOR' || orden.estado === 'PENDIENTE') && (
            <div className={panelClass}>
              <div className={panelHeaderClass}>
                <h2 className="m-0 text-lg font-bold text-foreground">Aprobación</h2>
              </div>

              <div className="grid gap-3">
                <ProtectedComponent modulo="compras" accion="aprobar" recurso="ordenes_compra" fallback={null}>
                  <button onClick={() => setShowAprobarModal(true)} className={`${primaryActionClass} w-full`}>
                    <CheckCircle size={16} />
                    Aprobar Orden
                  </button>
                </ProtectedComponent>

                <ProtectedComponent modulo="compras" accion="rechazar" recurso="ordenes_compra" fallback={null}>
                  <button onClick={() => setShowRechazarModal(true)} className={`${secondaryActionClass} w-full`}>
                    <XCircle size={16} />
                    Rechazar Orden
                  </button>
                </ProtectedComponent>
              </div>
            </div>
          )}

          {(orden.estado === 'APROBACION' || orden.estado === 'APROBADA' || orden.estado === 'ANULADA') && (
            <AprobacionesPanel ordenId={orden.id} estadoOrden={orden.estado} />
          )}

          {orden.estado === 'APROBADA' && (
            <div className={panelClass}>
              <div className={panelHeaderClass}>
                <h2 className="m-0 text-lg font-bold text-foreground">Acciones</h2>
              </div>

              <button onClick={() => router.push(`/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`)} className={`${primaryActionClass} w-full`}>
                <Package size={16} />
                Crear Recepción
              </button>
            </div>
          )}
        </div>
      </div>

      {orden.observaciones && (
        <div className={`${panelClass} mb-6`}>
          <div className={panelHeaderClass}>
            <div className={iconBoxClass}><FileText size={20} /></div>
            <h2 className="m-0 text-lg font-bold text-foreground">Observaciones</h2>
          </div>
          <p className="m-0 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{orden.observaciones}</p>
        </div>
      )}

      {(orden.estado === 'PARCIAL' || orden.estado === 'RECIBIDA' || orden.estado === 'CERRADA') && (
        <RecepcionesPanel ordenId={orden.id} />
      )}

      <AprobarOrdenModal
        isOpen={showAprobarModal}
        onClose={() => setShowAprobarModal(false)}
        onConfirm={handleAprobar}
        ordenNumero={orden.numero}
      />

      <RechazarOrdenModal
        isOpen={showRechazarModal}
        onClose={() => setShowRechazarModal(false)}
        onConfirm={handleRechazar}
        ordenNumero={orden.numero}
      />
    </div>
  )
}
