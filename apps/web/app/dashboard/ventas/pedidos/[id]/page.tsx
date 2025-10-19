'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileText, Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  ConfirmarPedidoButton,
  CancelarPedidoButton,
  GenerarFacturaButton,
  StockWarning,
  FlujoPedidoTimeline
} from '@/components/ventas'

const ESTADO_COLORS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'bg-yellow-100 text-yellow-800',
  [EstadoPedido.CONFIRMADO]: 'bg-blue-100 text-blue-800',
  [EstadoPedido.EN_PREPARACION]: 'bg-purple-100 text-purple-800',
  [EstadoPedido.LISTO_DESPACHO]: 'bg-indigo-100 text-indigo-800',
  [EstadoPedido.LISTO_FACTURAR]: 'bg-green-100 text-green-800',
  [EstadoPedido.FACTURADO]: 'bg-teal-100 text-teal-800',
  [EstadoPedido.COMPLETADO]: 'bg-gray-100 text-gray-800',
  [EstadoPedido.COMPLETADO_CON_GRE]: 'bg-emerald-100 text-emerald-800',
  [EstadoPedido.CANCELADO]: 'bg-red-100 text-red-800'
}

const ESTADO_LABELS: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'Pendiente',
  [EstadoPedido.CONFIRMADO]: 'Confirmado',
  [EstadoPedido.EN_PREPARACION]: 'En Preparación',
  [EstadoPedido.LISTO_DESPACHO]: 'Listo Despacho',
  [EstadoPedido.LISTO_FACTURAR]: 'Listo Facturar',
  [EstadoPedido.FACTURADO]: 'Facturado',
  [EstadoPedido.COMPLETADO]: 'Completado',
  [EstadoPedido.COMPLETADO_CON_GRE]: 'Completado con GRE',
  [EstadoPedido.CANCELADO]: 'Cancelado'
}

export default function PedidoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const { config, loading: configLoading } = useEmpresaConfig()
  
  const pedidoId = params.id as string
  
  const [pedido, setPedido] = useState<PedidoVenta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPedido()
  }, [pedidoId])

  const loadPedido = async () => {
    try {
      setLoading(true)
      const response = await get(`/ventas/pedidos/${pedidoId}`)
      if (response?.success) {
        setPedido(response.data)
      }
    } catch (error) {
      console.error('Error loading pedido:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar el pedido',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    router.push('/dashboard/ventas/pedidos')
  }

  const handleRefresh = () => {
    loadPedido()
  }

  const formatFecha = (fecha: string) => {
    try {
      return format(new Date(fecha), "dd 'de' MMMM 'de' yyyy", { locale: es })
    } catch {
      return fecha
    }
  }

  const formatMonto = (monto: number) => {
    return `S/ ${monto.toFixed(2)}`
  }

  if (loading || configLoading) {
    return (
      <div className="dashboard-container">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="dashboard-container">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Pedido no encontrado
          </h3>
          <Button onClick={handleBack} variant="outline">
            Volver a Pedidos
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a Pedidos
        </Button>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="dashboard-title">Pedido {pedido.numero}</h1>
            <p className="dashboard-subtitle">
              Creado el {formatFecha(pedido.created_at)}
            </p>
          </div>
          <Badge className={ESTADO_COLORS[pedido.estado]}>
            {ESTADO_LABELS[pedido.estado]}
          </Badge>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-6">
        <FlujoPedidoTimeline
          estadoActual={pedido.estado}
          usarFlujoLogistica={config?.usar_flujo_logistica || false}
        />
      </div>

      {/* Action Buttons - Dynamic based on state and config */}
      <div className="mb-6 flex gap-4">
        {/* Flujo Simple */}
        {!config?.usar_flujo_logistica && pedido.estado === EstadoPedido.PENDIENTE && (
          <ConfirmarPedidoButton
            pedidoId={pedido.id}
            onSuccess={handleRefresh}
          />
        )}

        {!config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
          <>
            <GenerarFacturaButton
              pedidoId={pedido.id}
              onSuccess={handleRefresh}
              config={{
                usar_flujo_logistica: config?.usar_flujo_logistica || false,
                gre_automatico_habilitado: config?.gre_automatico_habilitado !== false,
                gre_obligatorio: config?.gre_obligatorio || false
              }}
            />
            <CancelarPedidoButton
              pedidoId={pedido.id}
              onSuccess={handleRefresh}
            />
          </>
        )}

        {/* Flujo Completo */}
        {config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
          <>
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/inventario/logistica/ordenes-pendientes')}
            >
              Ver en Inventario
            </Button>
            <CancelarPedidoButton
              pedidoId={pedido.id}
              onSuccess={handleRefresh}
            />
          </>
        )}

        {/* Common for both flows */}
        {pedido.estado === EstadoPedido.LISTO_FACTURAR && (
          <GenerarFacturaButton
            pedidoId={pedido.id}
            onSuccess={handleRefresh}
            config={{
              usar_flujo_logistica: config?.usar_flujo_logistica || false,
              gre_automatico_habilitado: config?.gre_automatico_habilitado !== false,
              gre_obligatorio: config?.gre_obligatorio || false
            }}
          />
        )}

        {/* Cancel button for other states */}
        {[EstadoPedido.PENDIENTE, EstadoPedido.EN_PREPARACION, EstadoPedido.LISTO_DESPACHO].includes(pedido.estado) && (
          <CancelarPedidoButton
            pedidoId={pedido.id}
            onSuccess={handleRefresh}
          />
        )}
      </div>

      {/* Status Messages */}
      {config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            ℹ️ Esperando preparación en almacén
          </p>
        </div>
      )}

      {!config?.usar_flujo_logistica && pedido.estado === EstadoPedido.CONFIRMADO && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            ✓ Stock: RESERVADO
          </p>
        </div>
      )}

      {/* Cliente Info */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600">Razón Social</label>
            <p className="font-medium">{pedido.cliente?.razon_social || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Documento</label>
            <p className="font-medium">
              {pedido.cliente?.documento_tipo} {pedido.cliente?.documento_numero}
            </p>
          </div>
          {pedido.cliente?.direccion && (
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600">Dirección</label>
              <p className="font-medium">{pedido.cliente.direccion}</p>
            </div>
          )}
        </div>
      </div>

      {/* Productos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Productos</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Descripción
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Cantidad
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Precio Unit.
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pedido.detalle.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {item.descripcion}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {item.cantidad}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {formatMonto(item.precio_unitario)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                    {formatMonto(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totales */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Totales</h3>
        <div className="space-y-2 max-w-md ml-auto">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-medium">{formatMonto(pedido.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">IGV (18%):</span>
            <span className="font-medium">{formatMonto(pedido.igv)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total:</span>
            <span>{formatMonto(pedido.total)}</span>
          </div>
        </div>
      </div>

      {/* Notas */}
      {pedido.notas && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Notas</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{pedido.notas}</p>
        </div>
      )}
    </div>
  )
}
