'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { parseDateLocal } from '@/lib/date-utils'
import { Cotizacion, EstadoCotizacion } from '@/types/ventas'
import CotizacionForm, { CotizacionFormData } from '@/components/ventas/CotizacionForm'
import ConvertirPedidoButton from '@/components/ventas/ConvertirPedidoButton'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft, CheckCircle2, Edit, FileText, Loader2, Send, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { useTaxConfig } from '@/hooks/useTaxConfig'

const ESTADO_COLORS: Record<EstadoCotizacion, { bg: string; text: string }> = {
  [EstadoCotizacion.BORRADOR]: { bg: '#f3f4f6', text: '#1f2937' },
  [EstadoCotizacion.ENVIADA]: { bg: '#dbeafe', text: '#1e40af' },
  [EstadoCotizacion.APROBADA]: { bg: '#dcfce7', text: '#166534' },
  [EstadoCotizacion.RECHAZADA]: { bg: '#fee2e2', text: '#991b1b' },
  [EstadoCotizacion.CONVERTIDA]: { bg: '#ede9fe', text: '#5b21b6' },
  [EstadoCotizacion.VENCIDA]: { bg: '#ffedd5', text: '#9a3412' },
}

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export default function CotizacionDetailPage() {
  const { formatCurrency: formatLocalizedCurrency } = useLocalizedMoney()
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  const router = useRouter()
  const params = useParams()
  const { get, put, post } = useApi()
  const { hasPermission: canEditCotizacion, loading: editPermissionLoading } = usePermission(
    'ventas',
    'editar',
    'cotizaciones',
  )
  const { hasPermission: canApproveCotizacion, loading: approvePermissionLoading } = usePermission(
    'ventas',
    'approve',
    'cotizaciones',
  )
  const { hasPermission: canConvertCotizacion, loading: convertPermissionLoading } = usePermission(
    'ventas',
    'convertir_pedido',
    'cotizaciones',
  )

  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [transitioning, setTransitioning] = useState<'enviar' | 'aprobar' | 'rechazar' | null>(null)

  const cotizacionId = params.id as string

  const loadCotizacion = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/cotizaciones/${cotizacionId}`)

      if (response?.success && response.data) {
        setCotizacion(response.data)
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo cargar la cotización',
          variant: 'destructive'
        })
        router.push('/dashboard/ventas/cotizaciones')
      }
    } catch (error) {
      console.error('Error loading cotización:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar la cotización',
        variant: 'destructive'
      })
      router.push('/dashboard/ventas/cotizaciones')
    } finally {
      setLoading(false)
    }
  }, [cotizacionId, get, router])

  useEffect(() => {
    loadCotizacion()
  }, [loadCotizacion])

  const handleUpdate = async (data: CotizacionFormData) => {
    try {
      const response = await put(`/api/ventas/cotizaciones/${cotizacionId}`, data)

      if (response?.success) {
        toast({
          title: 'Éxito',
          description: 'Cotización actualizada correctamente'
        })
        setIsEditing(false)
        loadCotizacion()
      } else {
        throw new Error(response?.message || 'Error al actualizar la cotización')
      }
    } catch (error: any) {
      console.error('Error updating cotización:', error)
      throw error
    }
  }

  const handleConversionSuccess = (pedidoId?: string) => {
    loadCotizacion()

    toast({
      title: 'Cotización convertida',
      description: pedidoId
        ? 'La cotización fue convertida. Puedes ir al pedido recién creado.'
        : 'La cotización fue convertida correctamente.',
      action: pedidoId ? (
        <button
          type="button"
          className="text-sm font-semibold text-primary underline mt-2"
          onClick={() => router.push(`/dashboard/ventas/pedidos/${pedidoId}`)}
        >
          Ver pedido
        </button>
      ) : undefined
    })
  }

  const formatCurrency = (amount: number) => {
    return formatLocalizedCurrency(toNumber(amount))
  }

  const handleEstadoTransition = async (accion: 'enviar' | 'aprobar' | 'rechazar') => {
    let motivo: string | undefined

    if (accion === 'enviar') {
      if (!window.confirm(`¿Marcar la cotización ${cotizacion?.numero ?? ''} como enviada?`)) {
        return
      }
    } else {
      const decision = accion === 'aprobar' ? 'aprobar' : 'rechazar'
      const motivoIngresado = window.prompt(
        `Motivo u observación para ${decision} la cotización ${cotizacion?.numero ?? ''} (opcional):`,
      )
      if (motivoIngresado === null) {
        return
      }
      motivo = motivoIngresado.trim() || undefined
    }

    try {
      setTransitioning(accion)
      const response = await post(
        `/api/ventas/cotizaciones/${cotizacionId}/${accion}`,
        motivo ? { motivo } : {},
      )

      if (!response?.success) {
        throw new Error(response?.message || 'No se pudo actualizar el estado de la cotización')
      }

      const estadoFinal = accion === 'enviar'
        ? 'enviada'
        : accion === 'aprobar'
          ? 'aprobada'
          : 'rechazada'
      toast({
        title: 'Estado actualizado',
        description: `La cotización quedó ${estadoFinal}.`,
      })
      await loadCotizacion()
    } catch (error: any) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: error?.message || 'Intenta nuevamente.',
        variant: 'destructive',
      })
    } finally {
      setTransitioning(null)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return format(parseDateLocal(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
            <p className="text-foreground/80">Cargando cotización...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!cotizacion) {
    return null
  }

  const canEdit = cotizacion.estado === EstadoCotizacion.BORRADOR
  const canSend = cotizacion.estado === EstadoCotizacion.BORRADOR
  const canDecide = cotizacion.estado === EstadoCotizacion.BORRADOR ||
                    cotizacion.estado === EstadoCotizacion.ENVIADA
  const canConvert = cotizacion.estado === EstadoCotizacion.BORRADOR ||
                     cotizacion.estado === EstadoCotizacion.ENVIADA ||
                     cotizacion.estado === EstadoCotizacion.APROBADA
  const isConverted = cotizacion.estado === EstadoCotizacion.CONVERTIDA
  const detalle = Array.isArray(cotizacion.detalle) ? cotizacion.detalle : []

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()} className="inline-flex items-center justify-center p-2 text-[var(--primary-700)] bg-card/80 border cursor-pointer transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-50)'
              e.currentTarget.style.borderColor = 'var(--primary-300)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'
              e.currentTarget.style.borderColor = 'var(--primary-200)'
            }}
          >
            <ArrowLeft className="w-[1.125rem] h-[1.125rem]" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-[2rem] font-black text-[var(--primary-900)] m-0">
                Cotización {cotizacion.numero}
              </h1>
              <span className="inline-flex items-center py-2 px-4 rounded-full text-[0.875rem] font-semibold">
                {cotizacion.estado}
              </span>
            </div>
            <p className="text-base text-[var(--primary-600)] m-0">
              {isEditing ? 'Editando cotización' : 'Detalle de la cotización'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {!isEditing && canEdit && canEditCotizacion && !editPermissionLoading && (
            <button
              onClick={() => setIsEditing(true)} className="inline-flex items-center gap-2 py-3 px-6 text-[0.875rem] font-semibold text-[var(--primary-700)] bg-card cursor-pointer transition"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--primary-50)'
                e.currentTarget.style.borderColor = 'var(--primary-300)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white'
                e.currentTarget.style.borderColor = 'var(--primary-200)'
              }}
            >
              <Edit className="w-4 h-4" />
              Editar
            </button>
          )}

          {!isEditing && canSend && canEditCotizacion && !editPermissionLoading && (
            <Button
              type="button"
              variant="outline"
              disabled={transitioning !== null}
              onClick={() => handleEstadoTransition('enviar')}
            >
              {transitioning === 'enviar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </Button>
          )}

          {!isEditing && canDecide && canApproveCotizacion && !approvePermissionLoading && (
            <>
              <Button
                type="button"
                variant="success"
                disabled={transitioning !== null}
                onClick={() => handleEstadoTransition('aprobar')}
              >
                {transitioning === 'aprobar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Aprobar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={transitioning !== null}
                onClick={() => handleEstadoTransition('rechazar')}
              >
                {transitioning === 'rechazar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Rechazar
              </Button>
            </>
          )}

          {!isEditing && canConvert && !isConverted && (
            <ConvertirPedidoButton
              cotizacionId={cotizacion.id}
              disabled={transitioning !== null || convertPermissionLoading || !canConvertCotizacion}
              onSuccess={handleConversionSuccess}
            />
          )}
        </div>
      </div>

      {/* Converted Message */}
      {isConverted && (
        <div className="bg-[rgba(139,_92,_246,_0.1)] border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.875rem] font-semibold text-violet-400 mt-0 mr-0 mb-1 ml-0">
                Esta cotización ya fue convertida a pedido
              </p>
              <p className="text-[0.875rem] text-violet-400 m-0">
                No se puede editar ni convertir nuevamente
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isEditing ? (
        <CotizacionForm
          cotizacion={cotizacion}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Cliente Info */}
          <div className="p-6 shadow border">
            <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">
              Información del Cliente
            </h3>
            {cotizacion.cliente ? (
              <div className="grid grid-cols-[repeat(2,_1fr)] gap-4">
                <div>
                  <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Razón Social</p>
                  <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                    {cotizacion.cliente.razon_social}
                  </p>
                </div>
                <div>
                  <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Documento</p>
                  <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                    {cotizacion.cliente.documento_tipo}: {cotizacion.cliente.documento_numero}
                  </p>
                </div>
                {cotizacion.cliente.email && (
                  <div>
                    <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Email</p>
                    <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                      {cotizacion.cliente.email}
                    </p>
                  </div>
                )}
                {cotizacion.cliente.telefono && (
                  <div>
                    <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Teléfono</p>
                    <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                      {cotizacion.cliente.telefono}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[var(--primary-500)]">Cliente no disponible</p>
            )}
          </div>

          {/* Fechas */}
          <div className="p-6 shadow border">
            <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">
              Fechas
            </h3>
            <div className="grid grid-cols-[repeat(2,_1fr)] gap-4">
              <div>
                <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Fecha de Emisión</p>
                <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                  {formatDate(cotizacion.fecha)}
                </p>
              </div>
              {cotizacion.fecha_vencimiento && (
                <div>
                  <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Fecha de Vencimiento</p>
                  <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                    {formatDate(cotizacion.fecha_vencimiento)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Productos */}
          <div className="p-6 shadow border">
            <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">
              Productos
            </h3>
            <div className="overflow-x-auto">
              <table className="w-[100%]">
                <thead>
                  <tr className="bg-card/85 group-data-[erp-theme=light]/dashboard:bg-muted/30">
                    <th className="p-4 text-left text-xs font-semibold text-[var(--primary-700)]">
                      Descripción
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-[var(--primary-700)]">
                      Cantidad
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-[var(--primary-700)]">
                      Precio Unit.
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-[var(--primary-700)]">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-4 text-[0.875rem] text-[var(--primary-900)]">
                        {item.descripcion}
                      </td>
                      <td className="p-4 text-[0.875rem] text-right text-[var(--primary-900)]">
                        {item.cantidad}
                      </td>
                      <td className="p-4 text-[0.875rem] text-right text-[var(--primary-900)]">
                        {formatCurrency(item.precio_unitario)}
                      </td>
                      <td className="p-4 text-[0.875rem] text-right font-semibold text-[var(--primary-900)]">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales */}
          <div className="p-6 shadow border">
            <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">
              Totales
            </h3>
            <div className="flex flex-col gap-2 max-w-[28rem] ml-auto">
              <div className="flex justify-between text-[0.875rem]">
                <span className="text-[var(--primary-600)]">Subtotal:</span>
                <span className="font-semibold">{formatCurrency(cotizacion.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[0.875rem]">
                <span className="text-[var(--primary-600)]">{nombreImpuesto} ({Math.round(tasaIgv * 100)}%):</span>
                <span className="font-semibold">{formatCurrency(cotizacion.igv)}</span>
              </div>
              <div className="flex justify-between text-[1.125rem] font-bold pt-2 mt-2">
                <span>Total:</span>
                <span>{formatCurrency(cotizacion.total)}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          {cotizacion.notas && (
            <div className="p-6 shadow border">
              <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">
                Notas
              </h3>
              <p className="text-[var(--primary-700)] m-0">
                {cotizacion.notas}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

