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
  const { get, post } = useApi()
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

  const handlePreparar = async (pedido: PedidoVenta) => {
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

  if (!isFlujologistica) {
    return null
  }

  if (configLoading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando configuración...</p>
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
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <div className="activity-card">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando órdenes...</p>
          </div>
        ) : ordenes.length === 0 ? (
          <div className="activity-empty">
            <Package />
            <h3>No hay órdenes pendientes</h3>
            <p>Todas las órdenes han sido procesadas</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N° Pedido</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Cantidad de Ítems</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((orden) => (
                <tr key={orden.id}>
                  <td>
                    <div>
                      <strong>{orden.numero}</strong>
                      <Badge className="status-success">Confirmado</Badge>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div>{orden.cliente?.razon_social || 'N/A'}</div>
                      <small>{orden.cliente?.documento_numero || ''}</small>
                    </div>
                  </td>
                  <td>{formatFecha(orden.fecha)}</td>
                  <td>{orden.detalle?.length || 0}</td>
                  <td>
                    <Button
                      onClick={() => handlePreparar(orden)}
                      className="btn-primary"
                      size="sm"
                    >
                      <Package />
                      Preparar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && ordenes.length > 0 && (
        <div className="stat-subtitle">
          {ordenes.length} {ordenes.length === 1 ? 'orden pendiente' : 'órdenes pendientes'}
        </div>
      )}

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
