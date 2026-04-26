'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cotizacion, EstadoCotizacion } from '@/types/ventas'
import CotizacionForm, { CotizacionFormData } from '@/components/ventas/CotizacionForm'
import ConvertirPedidoButton from '@/components/ventas/ConvertirPedidoButton'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft, Edit, FileText, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADO_COLORS: Record<EstadoCotizacion, { bg: string; text: string }> = {
  [EstadoCotizacion.BORRADOR]: { bg: '#f3f4f6', text: '#1f2937' },
  [EstadoCotizacion.ENVIADA]: { bg: '#dbeafe', text: '#1e40af' },
  [EstadoCotizacion.APROBADA]: { bg: '#dcfce7', text: '#166534' },
  [EstadoCotizacion.RECHAZADA]: { bg: '#fee2e2', text: '#991b1b' },
  [EstadoCotizacion.CONVERTIDA]: { bg: '#ede9fe', text: '#5b21b6' },
  [EstadoCotizacion.VENCIDA]: { bg: '#ffedd5', text: '#9a3412' },
}

export default function CotizacionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)

  const cotizacionId = params.id as string

  useEffect(() => {
    loadCotizacion()
  }, [cotizacionId])

  const loadCotizacion = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/cotizaciones/${cotizacionId}`)
      
      if (response?.success && response.data) {
        setCotizacion(response.data)
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo cargar la cotización',
          variant: 'destructive'
        })
        router.push('/dashboard/ventas/cotizaciones')
      }
    } catch (error) {
      console.error('Error loading cotización:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar la cotización',
        variant: 'destructive'
      })
      router.push('/dashboard/ventas/cotizaciones')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (data: CotizacionFormData) => {
    try {
      const response = await put(`/api/ventas/cotizaciones/${cotizacionId}`, data)
      
      if (response?.success) {
        toast({
          title: 'Éxito',
          description: 'Cotización actualizada correctamente'
        })
        setIsEditing(false)
        loadCotizacion()
      } else {
        throw new Error(response?.message || 'Error al actualizar la cotización')
      }
    } catch (error: any) {
      console.error('Error updating cotización:', error)
      throw error
    }
  }

  const handleConversionSuccess = (pedidoId?: string) => {
    loadCotizacion()

    toast({
      title: 'Cotización convertida',
      description: pedidoId
        ? 'La cotización fue convertida. Puedes ir al pedido recién creado.'
        : 'La cotización fue convertida correctamente.',
      action: pedidoId ? (
        <button
          type="button"
          className="text-sm font-semibold text-primary underline mt-2"
          onClick={() => router.push(`/dashboard/ventas/pedidos/${pedidoId}`)}
        >
          Ver pedido
        </button>
      ) : undefined
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-600">Cargando cotización...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!cotizacion) {
    return null
  }

  const canEdit = cotizacion.estado === EstadoCotizacion.BORRADOR
  const canConvert = cotizacion.estado === EstadoCotizacion.BORRADOR || 
                     cotizacion.estado === EstadoCotizacion.ENVIADA
  const isConverted = cotizacion.estado === EstadoCotizacion.CONVERTIDA

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => router.back()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              color: 'var(--primary-700)',
              background: 'rgba(255, 255, 255, 0.8)',
              border: '1px solid var(--primary-200)',
              borderRadius: 'var(--border-radius)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-50)'
              e.currentTarget.style.borderColor = 'var(--primary-300)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'
              e.currentTarget.style.borderColor = 'var(--primary-200)'
            }}
          >
            <ArrowLeft style={{ width: '1.125rem', height: '1.125rem' }} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--primary-900)', margin: 0 }}>
                Cotización {cotizacion.numero}
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.5rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.875rem',
                fontWeight: '600',
                background: ESTADO_COLORS[cotizacion.estado].bg,
                color: ESTADO_COLORS[cotizacion.estado].text
              }}>
                {cotizacion.estado}
              </span>
            </div>
            <p style={{ fontSize: '1rem', color: 'var(--primary-600)', margin: 0 }}>
              {isEditing ? 'Editando cotización' : 'Detalle de la cotización'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isEditing && canEdit && (
            <button
              onClick={() => setIsEditing(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: 'var(--primary-700)',
                background: 'white',
                border: '2px solid var(--primary-200)',
                borderRadius: 'var(--border-radius)',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--primary-50)'
                e.currentTarget.style.borderColor = 'var(--primary-300)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white'
                e.currentTarget.style.borderColor = 'var(--primary-200)'
              }}
            >
              <Edit style={{ width: '1rem', height: '1rem' }} />
              Editar
            </button>
          )}
          
          {!isEditing && canConvert && !isConverted && (
            <ConvertirPedidoButton
              cotizacionId={cotizacion.id}
              onSuccess={handleConversionSuccess}
            />
          )}
        </div>
      </div>

      {/* Converted Message */}
      {isConverted && (
        <div style={{
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: 'var(--border-radius-lg)',
          padding: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#7c3aed', margin: '0 0 0.25rem 0' }}>
                Esta cotización ya fue convertida a pedido
              </p>
              <p style={{ fontSize: '0.875rem', color: '#7c3aed', margin: 0 }}>
                No se puede editar ni convertir nuevamente
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {isEditing ? (
        <CotizacionForm
          cotizacion={cotizacion}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Cliente Info */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
              Información del Cliente
            </h3>
            {cotizacion.cliente ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Razón Social</p>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                    {cotizacion.cliente.razon_social}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Documento</p>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                    {cotizacion.cliente.documento_tipo}: {cotizacion.cliente.documento_numero}
                  </p>
                </div>
                {cotizacion.cliente.email && (
                  <div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Email</p>
                    <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                      {cotizacion.cliente.email}
                    </p>
                  </div>
                )}
                {cotizacion.cliente.telefono && (
                  <div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Teléfono</p>
                    <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                      {cotizacion.cliente.telefono}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--primary-500)' }}>Cliente no disponible</p>
            )}
          </div>

          {/* Fechas */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
              Fechas
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Fecha de Emisión</p>
                <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                  {formatDate(cotizacion.fecha)}
                </p>
              </div>
              {cotizacion.fecha_vencimiento && (
                <div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginBottom: '0.25rem' }}>Fecha de Vencimiento</p>
                  <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', margin: 0 }}>
                    {formatDate(cotizacion.fecha_vencimiento)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Productos */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
              Productos
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--primary-50)', borderBottom: '2px solid var(--primary-200)' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                      Descripción
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                      Cantidad
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                      Precio Unit.
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary-700)', textTransform: 'uppercase' }}>
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cotizacion.detalle.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--primary-100)' }}>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--primary-900)' }}>
                        {item.descripcion}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', color: 'var(--primary-900)' }}>
                        {item.cantidad}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', color: 'var(--primary-900)' }}>
                        {formatCurrency(item.precio_unitario)}
                      </td>
                      <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: '600', color: 'var(--primary-900)' }}>
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
              Totales
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '28rem', marginLeft: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--primary-600)' }}>Subtotal:</span>
                <span style={{ fontWeight: '600' }}>{formatCurrency(cotizacion.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--primary-600)' }}>IGV (18%):</span>
                <span style={{ fontWeight: '600' }}>{formatCurrency(cotizacion.igv)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.125rem',
                fontWeight: '700',
                borderTop: '2px solid var(--primary-200)',
                paddingTop: '0.5rem',
                marginTop: '0.5rem'
              }}>
                <span>Total:</span>
                <span>{formatCurrency(cotizacion.total)}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          {cotizacion.notas && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
              backdropFilter: 'blur(20px) saturate(180%)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid rgba(255, 255, 255, 0.3)'
            }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--primary-900)', marginBottom: '1rem' }}>
                Notas
              </h3>
              <p style={{ color: 'var(--primary-700)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {cotizacion.notas}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
