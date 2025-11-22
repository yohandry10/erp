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
      const response = await get('/inventario/logistica/listo-despacho')
      if (response?.success) {
        setOrdenes(response.data || [])
      } else if (Array.isArray(response)) {
        setOrdenes(response)
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
          <h1 className="dashboard-title">Órdenes Listas para Despacho</h1>
          <p className="dashboard-subtitle">Confirma el despacho de pedidos preparados</p>
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
            <Truck />
            <h3>No hay órdenes listas para despacho</h3>
            <p>Las órdenes aparecerán aquí cuando estén preparadas</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>N° Pedido</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Ítems</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((orden) => (
                <tr key={orden.id}>
                  <td>
                    <div>
                      <strong>{orden.numero}</strong>
                      <Badge className="status-success">Listo Despacho</Badge>
                    </div>
                  </td>
                  <td>
                    <div>
                      <div>{orden.cliente?.razon_social || 'N/A'}</div>
                      <small>{orden.cliente?.documento_numero || ''}</small>
                    </div>
                  </td>
                  <td>{formatFecha((orden as any).fecha || orden.created_at)}</td>
                  <td>{orden.detalle?.length || 0}</td>
                  <td><strong>{formatMonto(orden.total)}</strong></td>
                  <td>
                    <div className="modal-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerDetalle(orden.id)}
                        className="btn-secondary"
                      >
                        <Eye />
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
        )}
      </div>

      {!loading && ordenes.length > 0 && (
        <div className="stat-subtitle">
          {ordenes.length} {ordenes.length === 1 ? 'orden lista' : 'órdenes listas'} para despacho
        </div>
      )}
    </div>
  )
}
