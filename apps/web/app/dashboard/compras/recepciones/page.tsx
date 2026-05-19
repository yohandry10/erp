'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  Plus, 
  RefreshCw,
  Package,
  Clock,
  CheckCircle,
  FileText,
  Eye
} from 'lucide-react'

interface OrdenCompra {
  id: string
  numero: string
  proveedor_id: string
  fecha_orden: string
  fecha_entrega_esperada?: string
  estado: string
  subtotal: number
  igv: number
  total: number
  moneda: string
  proveedores?: {
    razon_social: string
    ruc: string
  }
  detalles?: Array<{
    id: string
    producto_id: string
    cantidad: number
    cantidad_recibida: number
    productos?: {
      nombre: string
      codigo: string
    }
  }>
}

export default function RecepcionesPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [ordenesPendientes, setOrdenesPendientes] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)

  const loadOrdenesPendientes = useCallback(async () => {
    try {
      setLoading(true)
      // Get orders that are APROBADA or PARCIAL (can receive items)
      const response = await get('/api/compras/ordenes?estado=APROBADA,PARCIAL')
      
      if (response?.success) {
        const ordenes = response.data || []
        // Filter orders that have pending items to receive
        const ordenesPendientes = ordenes.filter((orden: OrdenCompra) => {
          if (!orden.detalles || orden.detalles.length === 0) return false
          // Check if there are items with pending quantity
          return orden.detalles.some(detalle => 
            (detalle.cantidad_recibida || 0) < detalle.cantidad
          )
        })
        setOrdenesPendientes(ordenesPendientes)
      }
    } catch (error) {
      console.error('Error loading ordenes pendientes:', error)
      alert('Error: No se pudieron cargar las órdenes pendientes')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadOrdenesPendientes()
  }, [loadOrdenesPendientes])

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getPendingQuantity = (orden: OrdenCompra) => {
    if (!orden.detalles) return 0
    return orden.detalles.reduce((total, detalle) => {
      return total + (detalle.cantidad - (detalle.cantidad_recibida || 0))
    }, 0)
  }

  const getReceivedPercentage = (orden: OrdenCompra) => {
    if (!orden.detalles || orden.detalles.length === 0) return 0
    const totalCantidad = orden.detalles.reduce((sum, d) => sum + d.cantidad, 0)
    const totalRecibida = orden.detalles.reduce((sum, d) => sum + (d.cantidad_recibida || 0), 0)
    return totalCantidad > 0 ? Math.round((totalRecibida / totalCantidad) * 100) : 0
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Recepciones de Mercancía</h1>
          <p className="dashboard-subtitle">Selecciona una orden de compra para recepcionar mercancía</p>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={loadOrdenesPendientes}
            className="refresh-btn py-3 px-6"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>ÓRDENES PENDIENTES</h3>
            <Package className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">{ordenesPendientes.length}</div>
          <div className="stat-subtitle">Con items por recibir</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>APROBADAS</h3>
            <CheckCircle className="stat-icon text-[#10b981]" />
          </div>
          <div className="stat-value">
            {ordenesPendientes.filter(o => o.estado === 'APROBADA').length}
          </div>
          <div className="stat-subtitle">Sin recepciones</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>PARCIALES</h3>
            <Clock className="stat-icon text-amber-500" />
          </div>
          <div className="stat-value">
            {ordenesPendientes.filter(o => o.estado === 'PARCIAL').length}
          </div>
          <div className="stat-subtitle">Recepción parcial</div>
        </div>
      </div>

      {/* Content */}
      <div className="activity-section">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando órdenes pendientes...</p>
          </div>
        ) : ordenesPendientes.length === 0 ? (
          <div className="activity-card text-center p-12">
            <Package size={48} className="text-gray-400" />
            <h3 className="text-[1.125rem] font-semibold mb-2 text-gray-700">
              No hay órdenes pendientes de recepción
            </h3>
            <p className="text-gray-500 mb-6">
              Todas las órdenes aprobadas han sido recepcionadas completamente
            </p>
            <button
              onClick={() => router.push('/dashboard/compras/ordenes')}
              className="refresh-btn"
            >
              <FileText size={16} />
              Ver Órdenes de Compra
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,_minmax(400px,_1fr))] gap-6">
            {ordenesPendientes.map((orden) => {
              const pendingQty = getPendingQuantity(orden)
              const receivedPct = getReceivedPercentage(orden)
              
              return (
                <div
                  key={orden.id} className="rounded-3 p-6 shadow border cursor-pointer transition relative overflow-hidden"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-xl)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                  }}
                  onClick={() => router.push(`/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`)}
                >
                  {/* Top Border Indicator */}
                  <div className="absolute top-0 left-0 right-0 h-[4px]"
                  />

                  {/* Estado Badge */}
                  <div className="mb-4">
                    <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-3 font-medium text-white">
                      {orden.estado === 'APROBADA' ? <CheckCircle size={14} /> : <Clock size={14} />}
                      {orden.estado === 'APROBADA' ? 'Aprobada' : 'Parcial'}
                    </span>
                  </div>

                  {/* Order Number */}
                  <div className="mb-3">
                    <div className="text-[0.875rem] font-bold text-[var(--primary-800)] mb-1">
                      {orden.numero}
                    </div>
                    <div className="text-3 text-[var(--primary-500)]">
                      {formatDate(orden.fecha_orden)}
                    </div>
                  </div>

                  {/* Provider */}
                  <div className="mb-4">
                    <div className="text-[0.875rem] font-semibold text-[var(--primary-700)] mb-1">
                      {orden.proveedores?.razon_social || 'Proveedor N/A'}
                    </div>
                    {orden.proveedores?.ruc && (
                      <div className="text-3 text-[var(--primary-500)]">
                        RUC: {orden.proveedores.ruc}
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-3 text-[var(--primary-600)] font-semibold">
                        Progreso de Recepción
                      </span>
                      <span className="text-3 text-[var(--primary-600)] font-bold">
                        {receivedPct}%
                      </span>
                    </div>
                    <div className="w-[100%] h-2 bg-[var(--primary-200)] rounded-full overflow-hidden">
                      <div className="h-[100%] transition" />
                    </div>
                  </div>

                  {/* Pending Items */}
                  <div className="bg-[rgba(59,_130,_246,_0.1)] rounded-2 p-3 mb-4"
                  >
                    <div className="text-3 text-[var(--primary-600)] mb-1">
                      Items Pendientes
                    </div>
                    <div className="text-6 font-bold text-blue-500">
                      {pendingQty}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="bg-[rgba(16,_185,_129,_0.1)] rounded-2 p-3 mb-4"
                  >
                    <div className="text-3 text-[var(--primary-600)] mb-1">
                      Total Orden
                    </div>
                    <div className="text-5 font-bold text-[#10b981]">
                      {formatCurrency(orden.total)}
                    </div>
                  </div>

                  {/* Expected Delivery */}
                  {orden.fecha_entrega_esperada && (
                    <div className="flex items-center gap-2 text-3 text-[var(--primary-500)] mb-4">
                      <Clock size={14} />
                      <span>Entrega esperada: {formatDate(orden.fecha_entrega_esperada)}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`)
                      }} className="flex-[1] p-3 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer text-[0.875rem] font-semibold flex items-center justify-center gap-2 transition"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#2563eb'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#3b82f6'
                      }}
                    >
                      <Plus size={16} />
                      Recepcionar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/dashboard/compras/ordenes/${orden.id}`)
                      }} className="p-3 rounded-[6px] border bg-white text-[var(--primary-700)] cursor-pointer text-[0.875rem] font-semibold flex items-center justify-center transition"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--primary-50)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white'
                      }}
                      title="Ver detalle de orden"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
