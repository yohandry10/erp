'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import {
  ArrowLeft,
  Package,
  Calendar,
  User,
  FileText,
  CheckCircle,
  AlertCircle,
  XCircle,
  MapPin,
  Hash,
  Clock
} from 'lucide-react'

interface RecepcionDetalle {
  id: string
  numero: string
  orden_id: string
  almacen_id: string
  ubicacion_id?: string
  fecha_recepcion: string
  estado: 'BORRADOR' | 'CERRADA'
  observaciones?: string
  recibido_por?: string
  cerrado_at?: string
  created_at: string
  orden?: {
    id: string
    numero: string
    proveedor_id: string
    proveedores?: {
      razon_social: string
      ruc: string
    }
  }
  almacenes?: {
    nombre: string
    codigo: string
  }
  ubicaciones?: {
    nombre: string
    codigo: string
  }
  items?: Array<{
    id: string
    producto_id: string
    cantidad: number
    calidad: 'OK' | 'OBSERVADO' | 'RECHAZADO'
    lote?: string
    serie?: string
    fecha_expiracion?: string
    observaciones?: string
    productos?: {
      nombre: string
      codigo: string
      unidad_medida?: string
    }
  }>
}

const CALIDAD_CONFIG = {
  OK: { label: 'OK', icon: CheckCircle, badge: 'bg-blue-100 text-blue-700 ring-blue-200' },
  OBSERVADO: { label: 'Observado', icon: AlertCircle, badge: 'bg-slate-100 text-slate-700 ring-slate-200' },
  RECHAZADO: { label: 'Rechazado', icon: XCircle, badge: 'bg-slate-200 text-slate-800 ring-slate-300' }
}

const pageClass = 'min-h-full bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-slate-100'
const cardClass = 'rounded-2xl border border-blue-400/20 bg-slate-950/70 p-5 shadow-xl shadow-blue-950/20 backdrop-blur'
const mutedTextClass = 'text-xs font-semibold uppercase tracking-[0.08em] text-slate-400'
const bodyTextClass = 'text-sm font-semibold text-slate-100'
const iconBoxClass = 'flex size-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-200'
const tableHeadClass = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-400'
const tableCellClass = 'px-4 py-3 text-sm text-slate-200'

export default function RecepcionDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const recepcionId = params.id as string

  const [recepcion, setRecepcion] = useState<RecepcionDetalle | null>(null)
  const [loading, setLoading] = useState(true)

  const loadRecepcion = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/compras/recepciones/${recepcionId}`)
      const recepcionData = response?.data ?? response

      if (recepcionData?.id) {
        setRecepcion(recepcionData)
      } else {
        alert('Error al cargar la recepción')
        router.push('/dashboard/compras/recepciones')
      }
    } catch (error) {
      console.error('Error loading recepcion:', error)
      alert('Error al cargar la recepción')
      router.push('/dashboard/compras/recepciones')
    } finally {
      setLoading(false)
    }
  }, [get, recepcionId, router])

  useEffect(() => {
    loadRecepcion()
  }, [loadRecepcion])

  if (loading) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="rounded-2xl border border-blue-400/20 bg-slate-950/70 px-8 py-6 text-lg font-semibold text-slate-300 shadow-xl">
            Cargando recepción...
          </div>
        </div>
      </div>
    )
  }

  if (!recepcion) {
    return (
      <div className={pageClass}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="rounded-2xl border border-slate-500/30 bg-slate-950/70 px-8 py-6 text-lg font-semibold text-slate-300 shadow-xl">
            Recepción no encontrada
          </div>
        </div>
      </div>
    )
  }

  const estadoCerrada = recepcion.estado === 'CERRADA'
  const itemsOK = recepcion.items?.filter(i => i.calidad === 'OK').length || 0
  const itemsObservados = recepcion.items?.filter(i => i.calidad === 'OBSERVADO').length || 0
  const itemsRechazados = recepcion.items?.filter(i => i.calidad === 'RECHAZADO').length || 0

  return (
    <div className={pageClass}>
      {/* Header */}
      <div className="mb-6 rounded-3xl border border-blue-400/20 bg-slate-950/80 p-6 shadow-2xl shadow-blue-950/30">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/recepciones')}
            className="mb-4 inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20"
          >
            <ArrowLeft size={16} />
            Volver a Recepciones
          </button>
          <div className="mb-2 flex flex-wrap items-center gap-4">
            <h1 className="m-0 text-3xl font-bold text-white">
              Recepción {recepcion.numero}
            </h1>
            <span
              className="inline-flex items-center gap-2 rounded-full bg-blue-500/15 px-4 py-2 text-sm font-semibold text-blue-100 ring-1 ring-blue-400/30"
            >
              {estadoCerrada ? <CheckCircle size={16} /> : <Clock size={16} />}
              {estadoCerrada ? 'Cerrada' : 'Borrador'}
            </span>
          </div>
          <p className="m-0 text-sm text-slate-300">
            Orden: {recepcion.orden?.numero || 'N/A'} - Proveedor: {recepcion.orden?.proveedores?.razon_social || 'N/A'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => router.push(`/dashboard/compras/ordenes/${recepcion.orden_id}`)}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-400/40 bg-slate-900/80 px-5 py-2.5 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20"
          >
            <FileText size={16} />
            Ver Orden
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <div className={mutedTextClass}>Total Items</div>
              <div className="mt-1 text-2xl font-bold text-white">
                {recepcion.items?.length || 0}
              </div>
            </div>
            <Package className="size-6 text-blue-200" />
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <div className={mutedTextClass}>OK</div>
              <div className="mt-1 text-2xl font-bold text-blue-100">
                {itemsOK}
              </div>
            </div>
            <CheckCircle className="size-6 text-blue-200" />
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <div className={mutedTextClass}>Observados</div>
              <div className="mt-1 text-2xl font-bold text-blue-100">
                {itemsObservados}
              </div>
            </div>
            <AlertCircle className="size-6 text-blue-200" />
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <div>
              <div className={mutedTextClass}>Rechazados</div>
              <div className="mt-1 text-2xl font-bold text-blue-100">
                {itemsRechazados}
              </div>
            </div>
            <XCircle className="size-6 text-blue-200" />
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        {/* Información General */}
        <div className={cardClass}>
          <h3 className="mb-4 text-base font-semibold text-white">
            Información General
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><FileText size={18} /></div>
              <div>
                <div className={mutedTextClass}>Número</div>
                <div className={bodyTextClass}>{recepcion.numero}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><Calendar size={18} /></div>
              <div>
                <div className={mutedTextClass}>Fecha Recepción</div>
                <div className={bodyTextClass}>
                  {new Date(recepcion.fecha_recepcion).toLocaleDateString('es-PE')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><MapPin size={18} /></div>
              <div>
                <div className={mutedTextClass}>Almacén</div>
                <div className={bodyTextClass}>
                  {recepcion.almacenes?.nombre || 'N/A'} ({recepcion.almacenes?.codigo || 'N/A'})
                </div>
              </div>
            </div>

            {recepcion.ubicaciones && (
              <div className="flex items-center gap-3">
                <div className={iconBoxClass}><MapPin size={18} /></div>
                <div>
                  <div className={mutedTextClass}>Ubicación</div>
                  <div className={bodyTextClass}>
                    {recepcion.ubicaciones.nombre} ({recepcion.ubicaciones.codigo})
                  </div>
                </div>
              </div>
            )}

            {recepcion.recibido_por && (
              <div className="flex items-center gap-3">
                <div className={iconBoxClass}><User size={18} /></div>
                <div>
                  <div className={mutedTextClass}>Recibido Por</div>
                  <div className={bodyTextClass}>{recepcion.recibido_por}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Información de la Orden */}
        <div className={cardClass}>
          <h3 className="mb-4 text-base font-semibold text-white">
            Orden de Compra
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><FileText size={18} /></div>
              <div>
                <div className={mutedTextClass}>Número OC</div>
                <div className={bodyTextClass}>
                  {recepcion.orden?.numero || 'N/A'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><User size={18} /></div>
              <div>
                <div className={mutedTextClass}>Proveedor</div>
                <div className={bodyTextClass}>
                  {recepcion.orden?.proveedores?.razon_social || 'N/A'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><Hash size={18} /></div>
              <div>
                <div className={mutedTextClass}>RUC</div>
                <div className={bodyTextClass}>
                  {recepcion.orden?.proveedores?.ruc || 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Items Recibidos */}
      <div className={`${cardClass} mb-6`}>
        <h3 className="mb-4 text-base font-semibold text-white">
          Items Recibidos
        </h3>
        <div className="overflow-x-auto rounded-xl border border-blue-400/10">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-blue-400/20 bg-blue-500/5">
                <th className={tableHeadClass}>
                  Código
                </th>
                <th className={tableHeadClass}>
                  Producto
                </th>
                <th className={`${tableHeadClass} text-center`}>
                  Cantidad
                </th>
                <th className={`${tableHeadClass} text-center`}>
                  Calidad
                </th>
                <th className={tableHeadClass}>
                  Lote
                </th>
                <th className={tableHeadClass}>
                  Serie
                </th>
                <th className={tableHeadClass}>
                  Expiración
                </th>
                <th className={tableHeadClass}>
                  Observaciones
                </th>
              </tr>
            </thead>
            <tbody>
              {recepcion.items?.map((item) => {
                const calidadConfig = CALIDAD_CONFIG[item.calidad]
                const CalidadIcon = calidadConfig.icon

                return (
                  <tr key={item.id} className="border-b border-blue-400/10 last:border-b-0 hover:bg-blue-500/5">
                    <td className={tableCellClass}>
                      {item.productos?.codigo || 'N/A'}
                    </td>
                    <td className={`${tableCellClass} font-semibold text-white`}>
                      {item.productos?.nombre || 'N/A'}
                    </td>
                    <td className={`${tableCellClass} text-center`}>
                      {item.cantidad} {item.productos?.unidad_medida || ''}
                    </td>
                    <td className={`${tableCellClass} text-center`}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${calidadConfig.badge}`}
                      >
                        <CalidadIcon size={12} />
                        {calidadConfig.label}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      {item.lote || '-'}
                    </td>
                    <td className={tableCellClass}>
                      {item.serie || '-'}
                    </td>
                    <td className={tableCellClass}>
                      {item.fecha_expiracion
                        ? new Date(item.fecha_expiracion).toLocaleDateString('es-PE')
                        : '-'
                      }
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {item.observaciones || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Observaciones Generales */}
      {recepcion.observaciones && (
        <div className={`${cardClass} mb-6`}>
          <h3 className="mb-3 text-base font-semibold text-white">
            Observaciones Generales
          </h3>
          <p className="text-sm leading-6 text-slate-300">
            {recepcion.observaciones}
          </p>
        </div>
      )}

      {/* Timeline */}
      {recepcion.cerrado_at && (
        <div className={cardClass}>
          <h3 className="mb-4 text-base font-semibold text-white">
            Historial
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><Package size={16} /></div>
              <div>
                <div className={bodyTextClass}>Creada</div>
                <div className="text-xs text-slate-400">
                  {new Date(recepcion.created_at).toLocaleString('es-PE')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={iconBoxClass}><CheckCircle size={16} /></div>
              <div>
                <div className={bodyTextClass}>Cerrada</div>
                <div className="text-xs text-slate-400">
                  {new Date(recepcion.cerrado_at).toLocaleString('es-PE')}
                </div>
                {recepcion.recibido_por && (
                  <div className="text-xs text-slate-400">
                    Por: {recepcion.recibido_por}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

