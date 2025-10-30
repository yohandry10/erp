'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  ArrowLeft,
  FileText,
  Calendar,
  User,
  Package,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
  Truck,
  Download,
  RefreshCw
} from 'lucide-react'
import AprobacionesPanel from '@/components/compras/AprobacionesPanel'
import AprobarOrdenModal from '@/components/compras/AprobarOrdenModal'
import RechazarOrdenModal from '@/components/compras/RechazarOrdenModal'
import RecepcionesPanel from '@/components/compras/RecepcionesPanel'

interface OrdenCompraDetalle {
  id: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  cantidad_recibida: number
  subtotal?: number
}

interface OrdenCompra {
  id: string
  numero: string
  proveedor_id: string
  cotizacion_id?: string
  fecha_orden: string
  fecha_entrega_esperada?: string
  condiciones_pago?: string
  dias_credito?: number
  almacen_destino_id?: string
  estado: string
  subtotal: number
  igv: number
  total: number
  moneda: string
  observaciones?: string
  proveedores?: {
    razon_social: string
    ruc: string
    email?: string
    telefono?: string
  }
  detalles?: OrdenCompraDetalle[]
  created_at: string
  updated_at: string
}

type EstadoOrden = 'BORRADOR' | 'APROBACION' | 'APROBADA' | 'PARCIAL' | 'RECIBIDA' | 'CERRADA' | 'ANULADA'

const ESTADOS_CONFIG: Record<EstadoOrden, {
  label: string
  color: string
  bgColor: string
  icon: any
}> = {
  BORRADOR: {
    label: 'Borrador',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: Edit
  },
  APROBACION: {
    label: 'En Aprobación',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: Clock
  },
  APROBADA: {
    label: 'Aprobada',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  PARCIAL: {
    label: 'Parcial',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    icon: Package
  },
  RECIBIDA: {
    label: 'Recibida',
    color: '#059669',
    bgColor: 'rgba(5, 150, 105, 0.1)',
    icon: CheckCircle
  },
  CERRADA: {
    label: 'Cerrada',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: FileText
  },
  ANULADA: {
    label: 'Anulada',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}

export default function OrdenCompraDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()
  
  const [orden, setOrden] = useState<OrdenCompra | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAprobarModal, setShowAprobarModal] = useState(false)
  const [showRechazarModal, setShowRechazarModal] = useState(false)

  const loadOrden = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get(`/api/compras/ordenes/${params.id}`)
      
      if (response?.success && response.data) {
        setOrden(response.data)
      } else {
        setError('No se pudo cargar la orden de compra')
      }
    } catch (err: any) {
      console.error('Error loading orden:', err)
      setError(err.message || 'Error al cargar la orden de compra')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (params.id) {
      loadOrden()
    }
  }, [params.id])

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
      month: 'long',
      day: 'numeric'
    })
  }

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoOrden]
    if (!config) return null
    
    const Icon = config.icon
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: '600',
        background: config.color,
        color: 'white'
      }}>
        <Icon size={16} />
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando orden de compra...</p>
        </div>
      </div>
    )
  }

  if (error || !orden) {
    return (
      <div className="dashboard-container">
        <div className="activity-section">
          <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>
            <AlertCircle size={48} style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Error al cargar la orden
            </h3>
            <p style={{ marginBottom: '1.5rem' }}>{error || 'Orden no encontrada'}</p>
            <button
              onClick={() => router.push('/dashboard/compras/ordenes')}
              className="refresh-btn"
            >
              <ArrowLeft size={16} />
              Volver a Órdenes
            </button>
          </div>
        </div>
      </div>
    )
  }

  const cantidadPendiente = (detalle: OrdenCompraDetalle) => {
    return detalle.cantidad - (detalle.cantidad_recibida || 0)
  }

  const porcentajeRecibido = () => {
    if (!orden.detalles || orden.detalles.length === 0) return 0
    const totalCantidad = orden.detalles.reduce((sum, d) => sum + d.cantidad, 0)
    const totalRecibido = orden.detalles.reduce((sum, d) => sum + (d.cantidad_recibida || 0), 0)
    return totalCantidad > 0 ? (totalRecibido / totalCantidad) * 100 : 0
  }

  const handleAprobar = async (comentarios?: string) => {
    try {
      const response = await post(`/api/compras/ordenes/${params.id}/aprobar`, {
        comentarios
      })

      if (response?.success) {
        await loadOrden()
        alert('✅ Orden de compra aprobada exitosamente')
      } else {
        throw new Error(response?.message || 'Error al aprobar la orden')
      }
    } catch (err: any) {
      console.error('Error al aprobar orden:', err)
      alert(`❌ Error: ${err.message || 'No se pudo aprobar la orden'}`)
      throw err
    }
  }

  const handleRechazar = async (motivoRechazo: string) => {
    try {
      const response = await post(`/api/compras/ordenes/${params.id}/rechazar`, {
        motivo_rechazo: motivoRechazo
      })

      if (response?.success) {
        await loadOrden()
        alert('✅ Orden de compra rechazada exitosamente')
      } else {
        throw new Error(response?.message || 'Error al rechazar la orden')
      }
    } catch (err: any) {
      console.error('Error al rechazar orden:', err)
      alert(`❌ Error: ${err.message || 'No se pudo rechazar la orden'}`)
      throw err
    }
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/ordenes')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Órdenes de Compra
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <h1 className="dashboard-title">Orden de Compra {orden.numero}</h1>
            {getEstadoBadge(orden.estado)}
          </div>
          <p className="dashboard-subtitle">
            Creada el {formatDate(orden.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadOrden}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          {orden.estado === 'BORRADOR' && (
            <button
              onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}/editar`)}
              className="refresh-btn"
              style={{ background: 'var(--blue-500)', color: 'white' }}
            >
              <Edit size={16} />
              Editar
            </button>
          )}
          <button
            onClick={() => alert('📥 Funcionalidad de descarga próximamente')}
            className="refresh-btn"
          >
            <Download size={16} />
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Left Column - Order Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Provider Information */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--blue-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--blue-600)'
              }}>
                <User size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                Información del Proveedor
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Razón Social
                </label>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                  {orden.proveedores?.razon_social || 'N/A'}
                </p>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  RUC
                </label>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                  {orden.proveedores?.ruc || 'N/A'}
                </p>
              </div>

              {orden.proveedores?.email && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--primary-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Email
                  </label>
                  <p style={{ fontSize: '0.875rem', color: 'var(--primary-700)', margin: 0 }}>
                    {orden.proveedores.email}
                  </p>
                </div>
              )}

              {orden.proveedores?.telefono && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--primary-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Teléfono
                  </label>
                  <p style={{ fontSize: '0.875rem', color: 'var(--primary-700)', margin: 0 }}>
                    {orden.proveedores.telefono}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Order Details - Items Table */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--emerald-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--emerald-600)'
              }}>
                <Package size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                Productos Solicitados
              </h2>
            </div>

            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--primary-200)' }}>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Producto
                    </th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Cantidad
                    </th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Recibido
                    </th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Pendiente
                    </th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Precio Unit.
                    </th>
                    <th style={{ 
                      textAlign: 'right', 
                      padding: '0.75rem', 
                      fontWeight: '600', 
                      fontSize: '0.75rem', 
                      textTransform: 'uppercase', 
                      color: 'var(--primary-600)',
                      letterSpacing: '0.05em'
                    }}>
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orden.detalles && orden.detalles.length > 0 ? (
                    orden.detalles.map((detalle, index) => (
                      <tr key={detalle.id || index} style={{ borderBottom: '1px solid var(--primary-100)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                            {detalle.descripcion}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                          {detalle.cantidad}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <span style={{
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: detalle.cantidad_recibida > 0 ? 'var(--emerald-600)' : 'var(--primary-400)'
                          }}>
                            {detalle.cantidad_recibida || 0}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <span style={{
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: cantidadPendiente(detalle) > 0 ? 'var(--amber-600)' : 'var(--primary-400)'
                          }}>
                            {cantidadPendiente(detalle)}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                          {formatCurrency(detalle.precio_unitario)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                          {formatCurrency(detalle.cantidad * detalle.precio_unitario)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--primary-400)' }}>
                        No hay productos en esta orden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - Summary & Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Order Summary */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--amber-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--amber-600)'
              }}>
                <DollarSign size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                Resumen
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Subtotal</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(orden.subtotal)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>IGV (18%)</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(orden.igv)}
                </span>
              </div>

              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                paddingTop: '1rem',
                borderTop: '2px solid var(--primary-200)'
              }}>
                <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)' }}>Total</span>
                <span style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--blue-600)' }}>
                  {formatCurrency(orden.total)}
                </span>
              </div>

              <div style={{ 
                background: 'var(--blue-50)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginTop: '0.5rem'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>
                  Moneda
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {orden.moneda || 'PEN'}
                </div>
              </div>
            </div>
          </div>

          {/* Order Dates */}
          <div className="activity-card">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '2px solid var(--primary-100)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--primary-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-600)'
              }}>
                <Calendar size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                Fechas
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  color: 'var(--primary-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}>
                  Fecha de Orden
                </label>
                <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                  {formatDate(orden.fecha_orden)}
                </p>
              </div>

              {orden.fecha_entrega_esperada && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--primary-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Fecha de Entrega Esperada
                  </label>
                  <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                    {formatDate(orden.fecha_entrega_esperada)}
                  </p>
                </div>
              )}

              {orden.condiciones_pago && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: 'var(--primary-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.5rem'
                  }}>
                    Condiciones de Pago
                  </label>
                  <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)', margin: 0 }}>
                    {orden.condiciones_pago}
                    {orden.dias_credito && ` (${orden.dias_credito} días)`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Reception Progress */}
          {(orden.estado === 'PARCIAL' || orden.estado === 'RECIBIDA') && (
            <div className="activity-card">
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '2px solid var(--primary-100)'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'var(--emerald-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--emerald-600)'
                }}>
                  <Truck size={20} />
                </div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                  Progreso de Recepción
                </h2>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-700)' }}>
                    Recibido
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--emerald-600)' }}>
                    {porcentajeRecibido().toFixed(1)}%
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '12px',
                  background: 'var(--primary-100)',
                  borderRadius: '9999px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${porcentajeRecibido()}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--emerald-500), var(--emerald-600))',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              <button
                onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}/recepciones`)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--emerald-500)',
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
                  e.currentTarget.style.background = 'var(--emerald-600)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--emerald-500)'
                }}
              >
                <Truck size={16} />
                Ver Recepciones
              </button>
            </div>
          )}

          {/* Approval Actions */}
          {(orden.estado === 'APROBACION' || orden.estado === 'BORRADOR' || orden.estado === 'PENDIENTE') && (
            <div className="activity-card">
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '2px solid var(--primary-100)'
              }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                  Aprobación
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={() => setShowAprobarModal(true)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--emerald-500)',
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
                    e.currentTarget.style.background = 'var(--emerald-600)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--emerald-500)'
                  }}
                >
                  <CheckCircle size={16} />
                  Aprobar Orden
                </button>

                <button
                  onClick={() => setShowRechazarModal(true)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid var(--red-300)',
                    background: 'white',
                    color: 'var(--red-600)',
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
                    e.currentTarget.style.background = 'var(--red-50)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white'
                  }}
                >
                  <XCircle size={16} />
                  Rechazar Orden
                </button>
              </div>
            </div>
          )}

          {/* Approvals Panel */}
          {(orden.estado === 'APROBACION' || orden.estado === 'APROBADA' || orden.estado === 'ANULADA') && (
            <AprobacionesPanel ordenId={orden.id} estadoOrden={orden.estado} />
          )}

          {/* Actions */}
          {orden.estado === 'APROBADA' && (
            <div className="activity-card">
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '2px solid var(--primary-100)'
              }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
                  Acciones
                </h2>
              </div>

              <button
                onClick={() => router.push(`/dashboard/compras/recepciones/nueva?orden_id=${orden.id}`)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--blue-500)',
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
                  e.currentTarget.style.background = 'var(--blue-600)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--blue-500)'
                }}
              >
                <Package size={16} />
                Crear Recepción
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Observations */}
      {orden.observaciones && (
        <div className="activity-card">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem',
            marginBottom: '1rem',
            paddingBottom: '1rem',
            borderBottom: '2px solid var(--primary-100)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--amber-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--amber-600)'
            }}>
              <FileText size={20} />
            </div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
              Observaciones
            </h2>
          </div>
          <p style={{ 
            fontSize: '0.875rem', 
            color: 'var(--primary-700)', 
            lineHeight: '1.6',
            margin: 0,
            whiteSpace: 'pre-wrap'
          }}>
            {orden.observaciones}
          </p>
        </div>
      )}

      {/* Recepciones Panel */}
      {(orden.estado === 'PARCIAL' || orden.estado === 'RECIBIDA' || orden.estado === 'CERRADA') && (
        <RecepcionesPanel ordenId={orden.id} />
      )}

      {/* Modals */}
      <AprobarOrdenModal
        isOpen={showAprobarModal}
        onClose={() => setShowAprobarModal(false)}
        onConfirm={handleAprobar}
        ordenNumero={orden.numero}
      />

      <RechazarOrdenModal
        isOpen={showRechazarModal}
        onClose={() => setShowRechazarModal(false)}
        onConfirm={handleRechazar}
        ordenNumero={orden.numero}
      />
    </div>
  )
}
