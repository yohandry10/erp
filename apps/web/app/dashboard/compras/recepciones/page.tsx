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
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadOrdenesPendientes}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>ÓRDENES PENDIENTES</h3>
            <Package className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{ordenesPendientes.length}</div>
          <div className="stat-subtitle">Con items por recibir</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>APROBADAS</h3>
            <CheckCircle className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value">
            {ordenesPendientes.filter(o => o.estado === 'APROBADA').length}
          </div>
          <div className="stat-subtitle">Sin recepciones</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>PARCIALES</h3>
            <Clock className="stat-icon" style={{ color: '#f59e0b' }} />
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
          <div className="activity-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <Package size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
              No hay órdenes pendientes de recepción
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
            {ordenesPendientes.map((orden) => {
              const pendingQty = getPendingQuantity(orden)
              const receivedPct = getReceivedPercentage(orden)
              
              return (
                <div
                  key={orden.id}
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    boxShadow: 'var(--shadow-md)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
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
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '4px',
                      background: orden.estado === 'APROBADA' ? '#10b981' : '#f59e0b',
                      borderRadius: '12px 12px 0 0'
                    }}
                  />

                  {/* Estado Badge */}
                  <div style={{ marginBottom: '1rem' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: orden.estado === 'APROBADA' ? '#10b981' : '#f59e0b',
                      color: 'white'
                    }}>
                      {orden.estado === 'APROBADA' ? <CheckCircle size={14} /> : <Clock size={14} />}
                      {orden.estado === 'APROBADA' ? 'Aprobada' : 'Parcial'}
                    </span>
                  </div>

                  {/* Order Number */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: '700',
                      color: 'var(--primary-800)',
                      fontFamily: 'monospace',
                      marginBottom: '0.25rem'
                    }}>
                      {orden.numero}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--primary-500)'
                    }}>
                      {formatDate(orden.fecha_orden)}
                    </div>
                  </div>

                  {/* Provider */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: 'var(--primary-700)',
                      marginBottom: '0.25rem'
                    }}>
                      {orden.proveedores?.razon_social || 'Proveedor N/A'}
                    </div>
                    {orden.proveedores?.ruc && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--primary-500)'
                      }}>
                        RUC: {orden.proveedores.ruc}
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: '600' }}>
                        Progreso de Recepción
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: '700' }}>
                        {receivedPct}%
                      </span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      background: 'var(--primary-200)',
                      borderRadius: '9999px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${receivedPct}%`,
                        height: '100%',
                        background: receivedPct === 100 ? '#10b981' : '#3b82f6',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>

                  {/* Pending Items */}
                  <div
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      marginBottom: '1rem'
                    }}
                  >
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--primary-600)',
                      marginBottom: '0.25rem'
                    }}>
                      Items Pendientes
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: '700',
                      color: '#3b82f6'
                    }}>
                      {pendingQty}
                    </div>
                  </div>

                  {/* Total */}
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      marginBottom: '1rem'
                    }}
                  >
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'var(--primary-600)',
                      marginBottom: '0.25rem'
                    }}>
                      Total Orden
                    </div>
                    <div style={{
                      fontSize: '1.25rem',
                      fontWeight: '700',
                      color: '#10b981'
                    }}>
                      {formatCurrency(orden.total)}
                    </div>
                  </div>

                  {/* Expected Delivery */}
                  {orden.fecha_entrega_esperada && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.75rem',
                      color: 'var(--primary-500)',
                      marginBottom: '1rem'
                    }}>
                      <Clock size={14} />
                      <span>Entrega esperada: {formatDate(orden.fecha_entrega_esperada)}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--primary-200)'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`)
                      }}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#3b82f6',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease'
                      }}
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
                      }}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--primary-300)',
                        background: 'white',
                        color: 'var(--primary-700)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
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
