'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  ArrowLeft, 
  Package, 
  Calendar,
  User,
  FileText,
  CheckCircle,
  AlertCircle,
  XCircle,
  MapPin,
  Hash,
  Clock
} from 'lucide-react'

interface RecepcionDetalle {
  id: string
  numero: string
  orden_id: string
  almacen_id: string
  ubicacion_id?: string
  fecha_recepcion: string
  estado: 'BORRADOR' | 'CERRADA'
  observaciones?: string
  recibido_por?: string
  cerrado_at?: string
  created_at: string
  orden?: {
    id: string
    numero: string
    proveedor_id: string
    proveedores?: {
      razon_social: string
      ruc: string
    }
  }
  almacenes?: {
    nombre: string
    codigo: string
  }
  ubicaciones?: {
    nombre: string
    codigo: string
  }
  items?: Array<{
    id: string
    producto_id: string
    cantidad: number
    calidad: 'OK' | 'OBSERVADO' | 'RECHAZADO'
    lote?: string
    serie?: string
    fecha_expiracion?: string
    observaciones?: string
    productos?: {
      nombre: string
      codigo: string
      unidad_medida?: string
    }
  }>
}

const CALIDAD_CONFIG = {
  OK: { label: 'OK', color: '#10b981', bgColor: '#d1fae5', icon: CheckCircle },
  OBSERVADO: { label: 'Observado', color: '#f59e0b', bgColor: '#fef3c7', icon: AlertCircle },
  RECHAZADO: { label: 'Rechazado', color: '#ef4444', bgColor: '#fee2e2', icon: XCircle }
}

export default function RecepcionDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const recepcionId = params.id as string

  const [recepcion, setRecepcion] = useState<RecepcionDetalle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecepcion()
  }, [recepcionId])

  const loadRecepcion = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/compras/recepciones/${recepcionId}`)
      
      if (response?.success && response.data) {
        setRecepcion(response.data)
      } else {
        alert('Error al cargar la recepción')
        router.push('/dashboard/compras/recepciones')
      }
    } catch (error) {
      console.error('Error loading recepcion:', error)
      alert('Error al cargar la recepción')
      router.push('/dashboard/compras/recepciones')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '1.125rem', color: '#6b7280' }}>Cargando recepción...</div>
        </div>
      </div>
    )
  }

  if (!recepcion) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '1.125rem', color: '#ef4444' }}>Recepción no encontrada</div>
        </div>
      </div>
    )
  }

  const estadoCerrada = recepcion.estado === 'CERRADA'
  const itemsOK = recepcion.items?.filter(i => i.calidad === 'OK').length || 0
  const itemsObservados = recepcion.items?.filter(i => i.calidad === 'OBSERVADO').length || 0
  const itemsRechazados = recepcion.items?.filter(i => i.calidad === 'RECHAZADO').length || 0

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/recepciones')}
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
            Volver a Recepciones
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <h1 className="dashboard-title" style={{ marginBottom: 0 }}>
              Recepción {recepcion.numero}
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
                color: estadoCerrada ? '#10b981' : '#6b7280',
                backgroundColor: estadoCerrada ? '#d1fae5' : '#f3f4f6'
              }}
            >
              {estadoCerrada ? <CheckCircle size={16} /> : <Clock size={16} />}
              {estadoCerrada ? 'Cerrada' : 'Borrador'}
            </span>
          </div>
          <p className="dashboard-subtitle">
            Orden: {recepcion.orden?.numero || 'N/A'} - Proveedor: {recepcion.orden?.proveedores?.razon_social || 'N/A'}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => router.push(`/dashboard/compras/ordenes/${recepcion.orden_id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--primary-600)',
              background: 'white',
              color: 'var(--primary-600)',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <FileText size={16} />
            Ver Orden
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="dashboard-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Total Items</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                {recepcion.items?.length || 0}
              </div>
            </div>
            <Package size={24} style={{ color: '#6b7280' }} />
          </div>
        </div>

        <div className="dashboard-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>OK</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
                {itemsOK}
              </div>
            </div>
            <CheckCircle size={24} style={{ color: '#10b981' }} />
          </div>
        </div>

        <div className="dashboard-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Observados</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
                {itemsObservados}
              </div>
            </div>
            <AlertCircle size={24} style={{ color: '#f59e0b' }} />
          </div>
        </div>

        <div className="dashboard-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Rechazados</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>
                {itemsRechazados}
              </div>
            </div>
            <XCircle size={24} style={{ color: '#ef4444' }} />
          </div>
        </div>
      </div>

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
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{recepcion.numero}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Calendar size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Fecha Recepción</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {new Date(recepcion.fecha_recepcion).toLocaleDateString('es-PE')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MapPin size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Almacén</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {recepcion.almacenes?.nombre || 'N/A'} ({recepcion.almacenes?.codigo || 'N/A'})
                </div>
              </div>
            </div>

            {recepcion.ubicaciones && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <MapPin size={18} style={{ color: '#6b7280' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Ubicación</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {recepcion.ubicaciones.nombre} ({recepcion.ubicaciones.codigo})
                  </div>
                </div>
              </div>
            )}

            {recepcion.recibido_por && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <User size={18} style={{ color: '#6b7280' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Recibido Por</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{recepcion.recibido_por}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Información de la Orden */}
        <div className="dashboard-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
            Orden de Compra
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileText size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Número OC</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {recepcion.orden?.numero || 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <User size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Proveedor</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {recepcion.orden?.proveedores?.razon_social || 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Hash size={18} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>RUC</div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {recepcion.orden?.proveedores?.ruc || 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Items Recibidos */}
      <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
          Items Recibidos
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
                <th style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Calidad
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Lote
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Serie
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Expiración
                </th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Observaciones
                </th>
              </tr>
            </thead>
            <tbody>
              {recepcion.items?.map((item) => {
                const calidadConfig = CALIDAD_CONFIG[item.calidad]
                const CalidadIcon = calidadConfig.icon
                
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {item.productos?.codigo || 'N/A'}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {item.productos?.nombre || 'N/A'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.875rem' }}>
                      {item.cantidad} {item.productos?.unidad_medida || ''}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: calidadConfig.color,
                          backgroundColor: calidadConfig.bgColor
                        }}
                      >
                        <CalidadIcon size={12} />
                        {calidadConfig.label}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {item.lote || '-'}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {item.serie || '-'}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {item.fecha_expiracion 
                        ? new Date(item.fecha_expiracion).toLocaleDateString('es-PE')
                        : '-'
                      }
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {item.observaciones || '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Observaciones Generales */}
      {recepcion.observaciones && (
        <div className="dashboard-card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#111827' }}>
            Observaciones Generales
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.5' }}>
            {recepcion.observaciones}
          </p>
        </div>
      )}

      {/* Timeline */}
      {recepcion.cerrado_at && (
        <div className="dashboard-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem', color: '#111827' }}>
            Historial
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Package size={16} style={{ color: '#6b7280' }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Creada</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {new Date(recepcion.created_at).toLocaleString('es-PE')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <CheckCircle size={16} style={{ color: '#10b981' }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Cerrada</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {new Date(recepcion.cerrado_at).toLocaleString('es-PE')}
                </div>
                {recepcion.recibido_por && (
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Por: {recepcion.recibido_por}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
