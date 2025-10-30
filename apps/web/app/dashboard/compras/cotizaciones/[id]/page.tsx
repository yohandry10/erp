'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  ArrowLeft, 
  Edit, 
  Send, 
  CheckCircle, 
  XCircle, 
  FileText,
  Calendar,
  User,
  DollarSign,
  Package,
  Clock,
  AlertCircle,
  ShoppingCart
} from 'lucide-react'

interface CotizacionDetalle {
  id: string
  numero: string
  proveedor_id: string
  fecha_cotizacion: string
  fecha_vencimiento: string
  validez_dias: number
  estado: 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA'
  subtotal: number
  igv: number
  total: number
  moneda: string
  observaciones?: string
  orden_compra_id?: string
  enviado_at?: string
  aprobado_at?: string
  rechazado_at?: string
  motivo_rechazo?: string
  created_at: string
  proveedores?: {
    razon_social: string
    ruc: string
    email?: string
    telefono?: string
  }
  detalles?: Array<{
    id: string
    producto_id: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    productos?: {
      nombre: string
      codigo: string
      unidad_medida?: string
    }
  }>
}

const ESTADO_CONFIG = {
  BORRADOR: { label: 'Borrador', color: '#6b7280', bgColor: '#f3f4f6', icon: Edit },
  ENVIADA: { label: 'Enviada', color: '#3b82f6', bgColor: '#dbeafe', icon: Send },
  APROBADA: { label: 'Aprobada', color: '#10b981', bgColor: '#d1fae5', icon: CheckCircle },
  RECHAZADA: { label: 'Rechazada', color: '#ef4444', bgColor: '#fee2e2', icon: XCircle },
  VENCIDA: { label: 'Vencida', color: '#f59e0b', bgColor: '#fef3c7', icon: Clock }
}

export default function CotizacionDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()
  const cotizacionId = params.id as string

  const [cotizacion, setCotizacion] = useState<CotizacionDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    loadCotizacion()
  }, [cotizacionId])

  const loadCotizacion = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/compras/cotizaciones/${cotizacionId}`)
      
      if (response?.success && response.data) {
        setCotizacion(response.data)
      } else {
        alert('Error al cargar la cotización')
        router.push('/dashboard/compras/cotizaciones')
      }
    } catch (error) {
      console.error('Error loading cotizacion:', error)
      alert('Error al cargar la cotización')
      router.push('/dashboard/compras/cotizaciones')
    } finally {
      setLoading(false)
    }
  }

  const handleEnviar = async () => {
    if (!confirm('¿Está seguro de enviar esta cotización al proveedor?')) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/enviar`, {})
      
      if (response?.success) {
        alert('✅ Cotización enviada exitosamente')
        loadCotizacion()
      } else {
        alert(`Error: ${response?.message || 'No se pudo enviar la cotización'}`)
      }
    } catch (error: any) {
      console.error('Error enviando cotización:', error)
      alert(`Error: ${error.message || 'No se pudo enviar la cotización'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleAprobar = async () => {
    if (!confirm('¿Está seguro de aprobar esta cotización?')) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/aprobar`, {})
      
      if (response?.success) {
        alert('✅ Cotización aprobada exitosamente')
        loadCotizacion()
      } else {
        alert(`Error: ${response?.message || 'No se pudo aprobar la cotización'}`)
      }
    } catch (error: any) {
      console.error('Error aprobando cotización:', error)
      alert(`Error: ${error.message || 'No se pudo aprobar la cotización'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRechazar = async () => {
    const motivo = prompt('Ingrese el motivo del rechazo:')
    if (!motivo) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/rechazar`, { motivo })
      
      if (response?.success) {
        alert('✅ Cotización rechazada')
        loadCotizacion()
      } else {
        alert(`Error: ${response?.message || 'No se pudo rechazar la cotización'}`)
      }
    } catch (error: any) {
      console.error('Error rechazando cotización:', error)
      alert(`Error: ${error.message || 'No se pudo rechazar la cotización'}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleConvertirOC = async () => {
    if (!confirm('¿Está seguro de convertir esta cotización en una Orden de Compra?')) return

    try {
      setActionLoading(true)
      const response = await post(`/api/compras/cotizaciones/${cotizacionId}/convertir-oc`, {})
      
      if (response?.success && response.data?.orden_id) {
        alert('✅ Orden de Compra creada exitosamente')
        router.push(`/dashboard/compras/ordenes/${response.data.orden_id}`)
      } else {
        alert(`Error: ${response?.message || 'No se pudo convertir a OC'}`)
      }
    } catch (error: any) {
      console.error('Error convirtiendo a OC:', error)
      alert(`Error: ${error.message || 'No se pudo convertir a OC'}`)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '1.125rem', color: '#6b7280' }}>Cargando cotización...</div>
        </div>
      </div>
    )
  }

  if (!cotizacion) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '1.125rem', color: '#ef4444' }}>Cotización no encontrada</div>
        </div>
      </div>
    )
  }

  const estadoConfig = ESTADO_CONFIG[cotizacion.estado]
  const EstadoIcon = estadoConfig.icon
  const isVencida = new Date(cotizacion.fecha_vencimiento) < new Date()
  const puedeEnviar = cotizacion.estado === 'BORRADOR'
  const puedeAprobar = cotizacion.estado === 'ENVIADA' && !isVencida
  const puedeRechazar = cotizacion.estado === 'ENVIADA'
  const puedeConvertir = cotizacion.estado === 'APROBADA' && !cotizacion.orden_compra_id && !isVencida

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/cotizaciones')}
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
            Volver a Cotizaciones
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <h1 className="dashboard-title" style={{ marginBottom: 0 }}>
              Cotización {cotizacion.numero}
            </h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: estadoConfig.color,
                backgroundColor: estadoConfig.bgColor
              }}
            >
              <EstadoIcon size={16} />
              {estadoConfig.label}
            </span>
          </div>
          <p className="dashboard-subtitle">
            Proveedor: {cotizacion.proveedores?.razon_social || 'N/A'}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {puedeEnviar && (
            <button
              onClick={handleEnviar}
              disabled={actionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary-600)',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                opacity: actionLoading ? 0.6 : 1
              }}
            >
              <Send size={16} />
              Enviar
            </button>
          )}

          {puedeAprobar && (
            <button
              onClick={handleAprobar}
              disabled={actionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: '#10b981',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                opacity: actionLoading ? 0.6 : 1
              }}
            >
              <CheckCircle size={16} />
              Aprobar
            </button>
          )}

          {puedeRechazar && (
            <button
              onClick={handleRechazar}
              disabled={actionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: '1px solid #ef4444',
                background: 'white',
                color: '#ef4444',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                opacity: actionLoading ? 0.6 : 1
              }}
            >
              <XCircle size={16} />
              Rechazar
            </button>
          )}

          {puedeConvertir && (
            <button
              onClick={handleConvertirOC}
              disabled={actionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary-600)',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                opacity: actionLoading ? 0.6 : 1
              }}
            >
              <ShoppingCart size={16} />
              Convertir a OC
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Información General */}
        <div className="dashboard-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
            Información General
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileText size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Número</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{cotizacion.numero}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Calendar size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Fecha Cotización</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {new Date(cotizacion.fecha_cotizacion).toLocaleDateString('es-PE')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Clock size={18} style={{ color: isVencida ? '#ef4444' : '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Fecha Vencimiento</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500', color: isVencida ? '#ef4444' : 'inherit' }}>
                  {new Date(cotizacion.fecha_vencimiento).toLocaleDateString('es-PE')}
                  {isVencida && ' (Vencida)'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <DollarSign size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Moneda</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{cotizacion.moneda}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Información del Proveedor */}
        <div className="dashboard-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
            Proveedor
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <User size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Razón Social</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {cotizacion.proveedores?.razon_social || 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileText size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>RUC</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {cotizacion.proveedores?.ruc || 'N/A'}
                </div>
              </div>
            </div>

            {cotizacion.proveedores?.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Send size={18} style={{ color: '#6b7280' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Email</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {cotizacion.proveedores.email}
                  </div>
                </div>
              </div>
            )}

            {cotizacion.proveedores?.telefono && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <User size={18} style={{ color: '#6b7280' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Teléfono</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {cotizacion.proveedores.telefono}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Productos */}
      <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
          Productos
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Código
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Producto
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Cantidad
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Precio Unit.
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {cotizacion.detalles?.map((detalle) => (
                <tr key={detalle.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                    {detalle.productos?.codigo || 'N/A'}
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                    {detalle.productos?.nombre || 'N/A'}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
                    {detalle.cantidad} {detalle.productos?.unidad_medida || ''}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem' }}>
                    {cotizacion.moneda} {detalle.precio_unitario.toFixed(2)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '500' }}>
                    {cotizacion.moneda} {detalle.subtotal.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '2px solid #e5e7eb' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '300px', marginLeft: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: '#6b7280' }}>Subtotal:</span>
              <span style={{ fontWeight: '500' }}>{cotizacion.moneda} {cotizacion.subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: '#6b7280' }}>IGV (18%):</span>
              <span style={{ fontWeight: '500' }}>{cotizacion.moneda} {cotizacion.igv.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.125rem', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
              <span style={{ fontWeight: '600' }}>Total:</span>
              <span style={{ fontWeight: '700', color: 'var(--primary-600)' }}>
                {cotizacion.moneda} {cotizacion.total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      {cotizacion.observaciones && (
        <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#111827' }}>
            Observaciones
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.5' }}>
            {cotizacion.observaciones}
          </p>
        </div>
      )}

      {/* Timeline */}
      {(cotizacion.enviado_at || cotizacion.aprobado_at || cotizacion.rechazado_at) && (
        <div className="dashboard-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
            Historial
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {cotizacion.enviado_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Send size={16} style={{ color: '#3b82f6' }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Enviada</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {new Date(cotizacion.enviado_at).toLocaleString('es-PE')}
                  </div>
                </div>
              </div>
            )}

            {cotizacion.aprobado_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <CheckCircle size={16} style={{ color: '#10b981' }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Aprobada</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {new Date(cotizacion.aprobado_at).toLocaleString('es-PE')}
                  </div>
                </div>
              </div>
            )}

            {cotizacion.rechazado_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <XCircle size={16} style={{ color: '#ef4444' }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Rechazada</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {new Date(cotizacion.rechazado_at).toLocaleString('es-PE')}
                  </div>
                  {cotizacion.motivo_rechazo && (
                    <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                      Motivo: {cotizacion.motivo_rechazo}
                    </div>
                  )}
                </div>
              </div>
            )}

            {cotizacion.orden_compra_id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <ShoppingCart size={16} style={{ color: '#10b981' }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Convertida a OC</div>
                  <button
                    onClick={() => router.push(`/dashboard/compras/ordenes/${cotizacion.orden_compra_id}`)}
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--primary-600)',
                      textDecoration: 'underline',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer'
                    }}
                  >
                    Ver Orden de Compra
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
