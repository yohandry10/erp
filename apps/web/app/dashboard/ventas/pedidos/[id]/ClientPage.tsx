'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { toast } from '@/components/ui/use-toast'
import GenerarFacturaButton from '@/components/ventas/GenerarFacturaButton'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADO_COLORS: Record<EstadoPedido, { bg: string; text: string }> = {
  [EstadoPedido.PENDIENTE]: { bg: '#fef3c7', text: '#92400e' },
  [EstadoPedido.PENDIENTE_APROBACION]: { bg: '#fed7aa', text: '#9a3412' },
  [EstadoPedido.CONFIRMADO]: { bg: '#dbeafe', text: '#1e40af' },
  [EstadoPedido.EN_PREPARACION]: { bg: '#e9d5ff', text: '#6b21a8' },
  [EstadoPedido.LISTO_DESPACHO]: { bg: '#c7d2fe', text: '#4338ca' },
  [EstadoPedido.DESPACHO_PARCIAL]: { bg: '#fde68a', text: '#78350f' },
  [EstadoPedido.LISTO_FACTURAR]: { bg: '#d1fae5', text: '#065f46' },
  [EstadoPedido.FACTURADO]: { bg: '#ccfbf1', text: '#115e59' },
  [EstadoPedido.COMPLETADO]: { bg: '#f3f4f6', text: '#374151' },
  [EstadoPedido.COMPLETADO_CON_GRE]: { bg: '#d1fae5', text: '#047857' },
  [EstadoPedido.CANCELADO]: { bg: '#fee2e2', text: '#991b1b' }
}

export default function PedidoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()
  const { config: empresaConfig, loading: empresaConfigLoading } = useEmpresaConfig()

  const [pedido, setPedido] = useState<PedidoVenta | null>(null)
  const [loading, setLoading] = useState(true)

  const pedidoId = params.id as string

  const loadPedido = useCallback(async () => {
    try {
      setLoading(true)
      console.debug('[PedidoDetailPage] Cargando pedido...', { pedidoId })
      const response = await get(`/ventas/pedidos/${pedidoId}`)

      console.debug('[PedidoDetailPage] Respuesta detalle pedido', response)
      if (response?.success && response.data) {
        setPedido(response.data)
        console.debug('[PedidoDetailPage] Estado pedido actualizado', {
          estado: response.data?.estado,
          factura_id: response.data?.factura_id,
        })
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo cargar el pedido',
          variant: 'destructive'
        })
        router.push('/dashboard/ventas/pedidos')
      }
    } catch (error) {
      console.error('Error loading pedido:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar el pedido',
        variant: 'destructive'
      })
      router.push('/dashboard/ventas/pedidos')
    } finally {
      setLoading(false)
    }
  }, [get, pedidoId, router])

  useEffect(() => {
    loadPedido()
  }, [loadPedido])

  const handleFacturaGenerada = (result: { facturaId: string | null; sugerioGre: boolean }) => {
    setPedido((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        estado: EstadoPedido.FACTURADO,
        factura_id: result.facturaId ?? prev.factura_id ?? null,
      }
    })

    console.debug('[PedidoDetailPage] Factura generada (optimista)', {
      pedidoId,
      facturaId: result.facturaId,
      sugerioGre: result.sugerioGre,
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12 px-0">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-[var(--primary-400)]" />
            <p className="text-[var(--primary-600)]">Cargando pedido...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!pedido) {
    return null
  }

  const clienteInfo = (pedido as any).cliente ?? (pedido as any).clientes ?? null
  const clienteDocumento = clienteInfo
    ? (clienteInfo.numero_documento ?? clienteInfo.documento_numero ?? clienteInfo.ruc ?? clienteInfo.codigo ?? null)
    : null
  const clienteTipoDocumento = String(
    clienteInfo?.documento_tipo ?? clienteInfo?.tipo_documento ?? '',
  ).trim().toUpperCase()
  const tipoDocumentoPedido =
    (clienteTipoDocumento === 'RUC' || clienteTipoDocumento === '6') && /^\d{11}$/.test(String(clienteDocumento ?? ''))
      ? 'factura'
      : 'boleta'

  const facturaButtonConfig = {
    usar_flujo_logistica: empresaConfig?.usar_flujo_logistica ?? false,
    gre_obligatorio: empresaConfig?.gre_obligatorio ?? false,
    gre_automatico_habilitado: empresaConfig?.gre_automatico_habilitado ?? true,
  }

  const usaFlujoLogistica = facturaButtonConfig.usar_flujo_logistica
  const estadoPedido = pedido.estado
  const puedeGenerarFactura =
    estadoPedido === EstadoPedido.LISTO_FACTURAR ||
    (!usaFlujoLogistica && estadoPedido === EstadoPedido.CONFIRMADO)

  const requierePasosLogisticaPrevios =
    usaFlujoLogistica &&
    estadoPedido !== EstadoPedido.LISTO_FACTURAR &&
    estadoPedido !== EstadoPedido.FACTURADO &&
    estadoPedido !== EstadoPedido.COMPLETADO &&
    estadoPedido !== EstadoPedido.COMPLETADO_CON_GRE

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
                Pedido {pedido.numero}
              </h1>
              <span className="inline-flex items-center py-2 px-4 rounded-full text-[0.875rem] font-semibold">
                {pedido.estado}
              </span>
            </div>
            <p className="text-base text-[var(--primary-600)] m-0">
              Creado el {formatDate(pedido.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Botones de Acción */}
      {pedido.estado === EstadoPedido.PENDIENTE && (
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={async () => {
              try {
                const response = await post(`/ventas/pedidos/${pedidoId}/confirmar`, { forzar_confirmacion: false })
                if (!response?.success) {
                  const warningText = response?.warnings?.length
                    ? response.warnings.map((w: any) => `${w.descripcion || 'Producto'}: solicitado ${w.solicitado}, disponible ${w.disponible}`).join(' | ')
                    : 'No se pudo confirmar el pedido'
                  throw new Error(warningText)
                }
                toast({
                  title: 'Pedido confirmado',
                  description: 'El pedido ha sido confirmado exitosamente'
                })
                await loadPedido()
              } catch (error: any) {
                const warnings = error?.data?.warnings
                const warningText = warnings?.length
                  ? warnings.map((w: any) => `${w.descripcion || 'Producto'}: solicitado ${w.solicitado}, disponible ${w.disponible}${w.reservado != null ? `, reservado ${w.reservado}` : ''}`).join(' | ')
                  : null
                toast({
                  title: 'Error',
                  description: warningText || error?.message || 'No se pudo confirmar el pedido',
                  variant: 'destructive'
                })
              }
            }} className="inline-flex items-center gap-2 py-3 px-6 text-[0.875rem] font-semibold text-white bg-[var(--gradient-primary)] border-0 cursor-pointer transition shadow"
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
          >
            Confirmar Pedido
          </button>
        </div>
      )}

      {/* Guía breve del flujo logístico */}
      {!empresaConfigLoading && (
        <div className="border bg-[rgba(59,130,246,0.05)] py-4 px-5 flex flex-col gap-1.5 text-[var(--primary-700)]"
        >
          <strong className="text-[var(--primary-800)]">¿Qué sigue?</strong>
          <div className="flex gap-3 flex-wrap text-[0.95rem]">
            <span className="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-card rounded-full border">
              1) Confirmar pedido
            </span>
            <span className="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-card rounded-full border">
              2) Preparar en Logística
            </span>
            <span className="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-card rounded-full border">
              3) Despachar (si aplica)
            </span>
            <span className="inline-flex items-center gap-1.5 py-1.5 px-2.5 bg-card rounded-full border">
              4) Facturar
            </span>
          </div>
          <span className="text-sm">
            Usa el botón “Ir a Logística” para preparar y despachar. Luego regresa aquí para facturar cuando el pedido esté listo.
          </span>
        </div>
      )}

      {!empresaConfigLoading && puedeGenerarFactura && (
        <div className="flex gap-3 flex-wrap">
          <GenerarFacturaButton
            pedidoId={pedidoId}
            onSuccess={loadPedido}
            config={facturaButtonConfig}
            tipoDocumento={tipoDocumentoPedido}
            onGenerated={handleFacturaGenerada}
          />
        </div>
      )}

      {requierePasosLogisticaPrevios && (
        <div className="border border-dashed p-4 bg-[var(--primary-50)] text-[var(--primary-700)] flex justify-between items-center gap-4 flex-wrap"
        >
          <div>
            <strong>Flujo logístico activo</strong>
            <p className="mt-1 mr-0 mb-0 ml-0 text-[var(--primary-600)]">
              Completa la preparación y despacho en Inventario → Logística para avanzar el pedido a
              LISTO_FACTURAR y habilitar la emisión de la factura.
            </p>
          </div>
          <button
            onClick={() => {
              const target =
                pedido.estado === EstadoPedido.EN_PREPARACION
                  ? '/dashboard/inventario/logistica/listo-despacho'
                  : '/dashboard/inventario/logistica/ordenes-pendientes'
              router.push(target)
            }} className="py-2 px-4 border-0 bg-[var(--primary-600)] text-white font-semibold cursor-pointer"
          >
            {pedido.estado === EstadoPedido.EN_PREPARACION ? 'Ir a Despachos' : 'Ir a Logística'}
          </button>
        </div>
      )}

      {/* Cliente Info */}
      <div className="p-6 shadow border">
        <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">
          Información del Cliente
        </h3>
        {clienteInfo ? (
          <div className="grid grid-cols-[repeat(2,_1fr)] gap-4">
            <div>
              <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Razón Social</p>
              <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                {clienteInfo.razon_social || clienteInfo.nombre_comercial || 'N/D'}
              </p>
            </div>
            <div>
              <p className="text-[0.875rem] text-[var(--primary-600)] mb-1">Documento</p>
              <p className="text-base font-semibold text-[var(--primary-900)] m-0">
                {clienteInfo.documento_tipo || clienteInfo.tipo_documento || 'N/A'}: {clienteDocumento || 'N/A'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[var(--primary-500)]">Cliente no disponible</p>
        )}
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
              {pedido.detalle?.map((item, index) => (
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
            <span className="font-medium text-[var(--primary-900)]">{formatCurrency(pedido.subtotal)}</span>
          </div>
          <div className="flex justify-between text-[0.875rem]">
            <span className="text-[var(--primary-600)]">IGV (18%):</span>
            <span className="font-medium text-[var(--primary-900)]">{formatCurrency(pedido.igv)}</span>
          </div>
          <div className="flex justify-between text-[1.125rem] font-bold pt-2 mt-2 text-[var(--primary-900)]">
            <span>Total:</span>
            <span>{formatCurrency(pedido.total)}</span>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      {pedido.observaciones && (
        <div className="p-6 shadow border">
          <h3 className="text-[1.125rem] font-semibold text-[var(--primary-900)] mb-4">
            Observaciones
          </h3>
          <p className="text-[0.875rem] text-[var(--primary-700)] m-0">
            {pedido.observaciones}
          </p>
        </div>
      )}
    </div>
  )
}
