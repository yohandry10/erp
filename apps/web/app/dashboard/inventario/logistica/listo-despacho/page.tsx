'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Truck, RefreshCw, Eye } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ConfirmarDespachoButton } from '@/components/ventas/ConfirmarDespachoButton'

export default function ListoDespachoPage() {
  const router = useRouter()
  const { get } = useApi()
  const { config, loading: configLoading, isFlujologistica } = useEmpresaConfig()
  
  const [ordenes, setOrdenes] = useState<PedidoVenta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isFlujologistica) {
      loadOrdenes()
    }
  }, [isFlujologistica])

  const loadOrdenes = async () => {
    try {
      setLoading(true)
      // Get all pedidos and filter by LISTO_DESPACHO status
      const response = await get('/ventas/pedidos')
      if (response?.success) {
        const allPedidos = response.data || []
        const listoDespacho = allPedidos.filter(
          (p: PedidoVenta) => p.estado === EstadoPedido.LISTO_DESPACHO
        )
        setOrdenes(listoDespacho)
      } else if (Array.isArray(response)) {
        const listoDespacho = response.filter(
          (p: PedidoVenta) => p.estado === EstadoPedido.LISTO_DESPACHO
        )
        setOrdenes(listoDespacho)
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las órdenes listas para despacho',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerDetalle = (pedidoId: string) => {
    router.push(`/dashboard/ventas/pedidos/${pedidoId}`)
  }

  const formatFecha = (fecha: string) => {
    try {
      return format(new Date(fecha), 'dd/MM/yyyy', { locale: es })
    } catch {
      return fecha
    }
  }

  const formatMonto = (monto: number) => {
    return `S/ ${monto.toFixed(2)}`
  }

  // Si el flujo logístico no está habilitado, no mostrar nada
  if (!isFlujologistica) {
    return null
  }

  // Mientras carga la configuración, mostrar loading
  if (configLoading) {
    return (
      <div className="dashboard-container">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Cargando configuración...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Órdenes Listas para Despacho</h1>
          <p className="dashboard-subtitle">Confirma el despacho de pedidos preparados</p>
        </div>
        <Button onClick={loadOrdenes} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Ordenes Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Cargando órdenes...</p>
          </div>
        ) : ordenes.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Truck className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p className="text-lg font-medium">No hay órdenes listas para despacho</p>
            <p className="text-sm">
              Las órdenes aparecerán aquí cuando estén preparadas
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    N° Pedido
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ítems
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ordenes.map((orden) => (
                  <tr key={orden.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {orden.numero}
                      </div>
                      <Badge className="mt-1 bg-indigo-100 text-indigo-800">
                        Listo Despacho
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {orden.cliente?.razon_social || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {orden.cliente?.documento_numero || ''}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatFecha(orden.fecha)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm font-medium text-gray-900">
                        {orden.detalle?.length || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatMonto(orden.total)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerDetalle(orden.id)}
                          className="text-gray-600 hover:text-gray-700"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver
                        </Button>
                        <ConfirmarDespachoButton
                          pedidoId={orden.id}
                          pedidoNumero={orden.numero}
                          onSuccess={loadOrdenes}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Results Summary */}
      {!loading && ordenes.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          {ordenes.length} {ordenes.length === 1 ? 'orden lista' : 'órdenes listas'} para despacho
        </div>
      )}
    </div>
  )
}
