import React from 'react'

interface Cotizacion {
  id: string
  numero: string
  cliente_id: string
  fecha_cotizacion: string
  fecha_vencimiento: string
  vendedor: string
  moneda: string
  subtotal: number
  igv: number
  total: number
  estado: string
  probabilidad: number
  items: any[]
  observaciones?: string
  // Nuevos campos para conversión
  fecha_aprobacion?: string
  fecha_conversion?: string
  fecha_rechazo?: string
  documento_generado_id?: string
  motivo_rechazo?: string
}

interface CotizacionViewModalProps {
  isOpen: boolean
  onClose: () => void
  cotizacion: Cotizacion | null
  onActionsComplete?: () => void
}

export default function CotizacionViewModal({ isOpen, onClose, cotizacion, onActionsComplete }: CotizacionViewModalProps) {
  const [loading, setLoading] = React.useState(false)
  
  if (!isOpen || !cotizacion) return null

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getStatusColor = (estado: string) => {
    const estadoNormalizado = estado?.toUpperCase().trim() || 'BORRADOR'
    
    switch (estadoNormalizado) {
      case 'BORRADOR':
      case 'PENDIENTE': // Legacy - convertir a BORRADOR
        return { background: '#6b7280', color: 'white' }
      case 'ENVIADA':
        return { background: '#3b82f6', color: 'white' }
      case 'APROBADA':
        return { background: '#10b981', color: 'white' }
      case 'VENCIDA':
        return { background: '#dc2626', color: 'white' }
      case 'CONVERTIDA':
        return { background: '#059669', color: 'white' }
      case 'RECHAZADA':
        return { background: '#ef4444', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getProbabilityColor = (prob: number) => {
    if (prob >= 80) return '#10b981'
    if (prob >= 60) return '#f59e0b'
    if (prob >= 40) return '#f59e0b'
    return '#ef4444'
  }

  const calcularDiasVencimiento = () => {
    const fechaVencimiento = new Date(cotizacion.fecha_vencimiento)
    const hoy = new Date()
    const diasParaVencer = Math.ceil((fechaVencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diasParaVencer > 0) {
      return { texto: `Vence en ${diasParaVencer} días`, color: diasParaVencer <= 3 ? '#f59e0b' : '#10b981' }
    } else if (diasParaVencer === 0) {
      return { texto: 'Vence hoy', color: '#ef4444' }
    } else {
      return { texto: `Vencida hace ${Math.abs(diasParaVencer)} días`, color: '#dc2626' }
    }
  }

  const handleAprobar = async () => {
    try {
      setLoading(true)
      
      const response = await fetch(`/api/cotizaciones/${cotizacion.id}/aprobar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          probabilidad: 100,
          observaciones: 'Cotización aprobada para conversión'
        })
      })

      const result = await response.json()
      
      if (result.success) {
        alert('✅ Cotización aprobada exitosamente')
        onActionsComplete?.()
        onClose()
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error aprobando cotización:', error)
      alert('❌ Error aprobando cotización')
    } finally {
      setLoading(false)
    }
  }

  const handleConvertir = async () => {
    try {
      setLoading(true)
      
      const tipoDocumento = confirm('¿Generar FACTURA (Aceptar) o BOLETA (Cancelar)?') ? 'FACTURA' : 'BOLETA'
      
      const response = await fetch(`/api/cotizaciones/${cotizacion.id}/convertir-en-venta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          generar_factura: true,
          tipo_documento: tipoDocumento,
          metodo_pago: 'CONTADO',
          observaciones: 'Convertido desde cotización'
        })
      })

      const result = await response.json()
      
      if (result.success) {
        alert(`🎉 ${result.message}`)
        onActionsComplete?.()
        onClose()
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error convirtiendo cotización:', error)
      alert('❌ Error convirtiendo cotización')
    } finally {
      setLoading(false)
    }
  }

  const handleRechazar = async () => {
    const motivo = prompt('Ingrese el motivo del rechazo:')
    if (!motivo) return

    try {
      setLoading(true)
      
      const response = await fetch(`/api/cotizaciones/${cotizacion.id}/rechazar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo })
      })

      const result = await response.json()
      
      if (result.success) {
        alert('✅ Cotización rechazada')
        onActionsComplete?.()
        onClose()
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (error) {
      console.error('Error rechazando cotización:', error)
      alert('❌ Error rechazando cotización')
    } finally {
      setLoading(false)
    }
  }

  const vencimiento = calcularDiasVencimiento()
  const estadoActual = cotizacion.estado?.toUpperCase()

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          color: 'white',
          padding: '24px',
          borderRadius: '16px 16px 0 0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0 }}>
              📋 {cotizacion.numero}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1.25rem'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Estado y Total */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '20px', 
            marginBottom: '24px' 
          }}>
            <div style={{
              background: '#f8fafc',
              padding: '16px',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>Estado</h3>
              <span style={{
                ...getStatusColor(cotizacion.estado),
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}>
                {estadoActual === 'PENDIENTE' || estadoActual === 'EN PROCESO'
                  ? 'BORRADOR' 
                  : (estadoActual || 'BORRADOR')}
              </span>
            </div>
            
            <div style={{
              background: '#f0fdf4',
              padding: '16px',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>Total</h3>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                color: '#059669'
              }}>
                {formatCurrency(cotizacion.total)}
              </div>
            </div>
          </div>

          {/* Información detallada */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            fontSize: '0.875rem',
            marginBottom: '24px'
          }}>
            <div>
              <strong>Cliente:</strong><br/>
              <span style={{ color: '#6b7280' }}>{cotizacion.cliente_id}</span>
            </div>
            <div>
              <strong>Vendedor:</strong><br/>
              <span style={{ color: '#6b7280' }}>{cotizacion.vendedor || 'No asignado'}</span>
            </div>
            <div>
              <strong>Fecha Cotización:</strong><br/>
              <span style={{ color: '#6b7280' }}>{formatDate(cotizacion.fecha_cotizacion)}</span>
            </div>
            <div>
              <strong>Vencimiento:</strong><br/>
              <span style={{ color: '#6b7280' }}>{formatDate(cotizacion.fecha_vencimiento)}</span>
            </div>
            <div>
              <strong>Probabilidad:</strong><br/>
              <span style={{ color: '#6b7280' }}>{cotizacion.probabilidad}%</span>
            </div>
            <div>
              <strong>Moneda:</strong><br/>
              <span style={{ color: '#6b7280' }}>{cotizacion.moneda || 'PEN'}</span>
            </div>
          </div>

          {/* Información de seguimiento si existe */}
          {(cotizacion.fecha_aprobacion || cotizacion.fecha_conversion || cotizacion.fecha_rechazo) && (
            <div style={{
              background: '#f8fafc',
              padding: '16px',
              borderRadius: '12px',
              marginBottom: '24px'
            }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#374151' }}>Seguimiento</h3>
              {cotizacion.fecha_aprobacion && (
                <div style={{ marginBottom: '8px', fontSize: '0.875rem' }}>
                  <strong>Aprobada:</strong> {formatDate(cotizacion.fecha_aprobacion)}
                </div>
              )}
              {cotizacion.fecha_conversion && (
                <div style={{ marginBottom: '8px', fontSize: '0.875rem' }}>
                  <strong>Convertida:</strong> {formatDate(cotizacion.fecha_conversion)}
                  {cotizacion.documento_generado_id && (
                    <span style={{ color: '#059669', marginLeft: '8px' }}>
                      ✅ Documento generado
                    </span>
                  )}
                </div>
              )}
              {cotizacion.fecha_rechazo && (
                <div style={{ fontSize: '0.875rem' }}>
                  <strong>Rechazada:</strong> {formatDate(cotizacion.fecha_rechazo)}
                  {cotizacion.motivo_rechazo && (
                    <div style={{ color: '#ef4444', marginTop: '4px' }}>
                      Motivo: {cotizacion.motivo_rechazo}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Desglose financiero */}
          <div style={{
            background: '#f8fafc',
            padding: '16px',
            borderRadius: '12px',
            marginBottom: '24px'
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#374151' }}>Desglose Financiero</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>Subtotal:</span>
              <span>{formatCurrency(cotizacion.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>IGV (18%):</span>
              <span>{formatCurrency(cotizacion.igv)}</span>
            </div>
            <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontWeight: '700',
              fontSize: '1rem',
              color: '#059669'
            }}>
              <span>Total:</span>
              <span>{formatCurrency(cotizacion.total)}</span>
            </div>
          </div>

          {/* Observaciones */}
          {cotizacion.observaciones && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#374151' }}>Observaciones</h3>
              <div style={{
                background: '#fffbeb',
                padding: '12px',
                borderRadius: '8px',
                color: '#92400e',
                fontSize: '0.875rem'
              }}>
                {cotizacion.observaciones}
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones de acción */}
        <div style={{
          background: '#f8fafc',
          padding: '20px 24px',
          borderRadius: '0 0 16px 16px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: vencimiento.color, fontSize: '0.875rem', fontWeight: '600' }}>
              {vencimiento.texto}
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              {/* Botones según el estado */}
              {(estadoActual === 'BORRADOR' || estadoActual === 'ENVIADA') && (
                <>
                  <button
                    onClick={handleAprobar}
                    disabled={loading}
                    style={{
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      opacity: loading ? 0.5 : 1
                    }}
                  >
                    {loading ? '⏳' : '✅'} Aprobar
                  </button>
                  <button
                    onClick={handleRechazar}
                    disabled={loading}
                    style={{
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      opacity: loading ? 0.5 : 1
                    }}
                  >
                    {loading ? '⏳' : '❌'} Rechazar
                  </button>
                </>
              )}
              
              {estadoActual === 'APROBADA' && (
                <button
                  onClick={handleConvertir}
                  disabled={loading}
                  style={{
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    opacity: loading ? 0.5 : 1
                  }}
                >
                  {loading ? '⏳' : '🔄'} Convertir en Venta
                </button>
              )}

              {estadoActual === 'CONVERTIDA' && (
                <div style={{
                  background: '#dcfce7',
                  color: '#166534',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}>
                  ✅ Ya convertida en venta
                </div>
              )}

              {estadoActual === 'RECHAZADA' && (
                <div style={{
                  background: '#fecaca',
                  color: '#dc2626',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}>
                  ❌ Cotización rechazada
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 