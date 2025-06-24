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
}

interface CotizacionViewModalProps {
  isOpen: boolean
  onClose: () => void
  cotizacion: Cotizacion | null
}

export default function CotizacionViewModal({ isOpen, onClose, cotizacion }: CotizacionViewModalProps) {
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
      case 'VENCIDA':
        return { background: '#dc2626', color: 'white' }
      case 'CONVERTIDA':
        return { background: '#059669', color: 'white' }
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

  const vencimiento = calcularDiasVencimiento()

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
          maxWidth: '800px',
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
                                  {cotizacion.estado?.toUpperCase() === 'PENDIENTE' || cotizacion.estado?.toUpperCase() === 'EN PROCESO'
                    ? 'BORRADOR' 
                    : (cotizacion.estado?.toUpperCase() || 'BORRADOR')}
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

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
} 