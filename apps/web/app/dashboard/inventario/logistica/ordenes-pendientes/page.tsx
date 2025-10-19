'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'
import { PedidoVenta, EstadoPedido } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Package, AlertCircle, RefreshCw } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { PreparacionPedidoModal } from '@/components/ventas/PreparacionPedidoModal'

export default function OrdenesPendientesPage() {
  const router = useRouter()
  const { get } = useApi()
  const { config, loading: configLoading, isFlujologistica } = useEmpresaConfig()
  
  const [ordenes, setOrdenes] = useState<PedidoVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPedido, setSelectedPedido] = useState<PedidoVenta | null>(null)
  const [showPreparacionModal, setShowPreparacionModal] = useState(false)

  useEffect(() => {
    if (isFlujologistica) {
      loadOrdenes()
    }
  }, [isFlujologistica])

  const loadOrdenes = async () => {
    try {
      setLoading(true)
      const response = await get('/inventario/logistica/ordenes-pendientes')
      if (response?.success) {
        setOrdenes(response.data || [])
      } else if (Array.isArray(response)) {
        setOrdenes(response)
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las órdenes pendientes',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handlePreparar = (pedido: PedidoVenta) => {
    setSelectedPedido(pedido)
    setShowPreparacionModal(true)
  }

  const formatFecha = (fecha: string) => {
    try {
      return format(new Date(fecha), 'dd/MM/yyyy', { locale: es })
    } catch {
      return fecha
    }
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
          <h1 className="dashboard-title">Órdenes Pendientes de Preparación</h1>
          <p className="dashboard-subtitle">Gestiona los pedidos confirmados listos para preparar</p>
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
            <Package className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p className="text-lg font-medium">No hay órdenes pendientes</p>
            <p className="text-sm">
              Todas las órdenes han sido procesadas
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
                    Cantidad de Ítems
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acción
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
                      <Badge className="mt-1 bg-blue-100 text-blue-800">
                        Confirmado
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button
                        onClick={() => handlePreparar(orden)}
                        className="bg-blue-600 hover:bg-blue-700"
                        size="sm"
                      >
                        <Package className="w-4 h-4 mr-1" />
                        Preparar
                      </Button>
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
          {ordenes.length} {ordenes.length === 1 ? 'orden pendiente' : 'órdenes pendientes'}
        </div>
      )}

      {/* Preparación Modal */}
      {showPreparacionModal && selectedPedido && (
        <PreparacionPedidoModal
          pedido={selectedPedido}
          onClose={() => {
            setShowPreparacionModal(false)
            setSelectedPedido(null)
          }}
          onSuccess={loadOrdenes}
        />
      )}
    </div>
  )
}
