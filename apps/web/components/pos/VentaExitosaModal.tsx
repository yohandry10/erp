'use client'

import { printTicket } from './TicketPrint'
import { useCountryContext } from '@/hooks/use-country-context'

interface VentaExitosaModalProps {
  isOpen: boolean
  onClose: () => void
  ventaData: {
    venta_id: string | number
    numero_ticket: string
    total: number
    subtotal: number
    impuestos: number
    estado: string
    factura_electronica: boolean
    cpe_id?: string
    cliente_nombre?: string
    fecha?: string
    items?: Array<{
      nombre: string
      cantidad: number
      precio: number
      subtotal: number
    }>
  } | null
  empresaData?: {
    nombre: string
    ruc: string
    direccion?: string
    logo_url?: string
  }
}

export default function VentaExitosaModal({ isOpen, onClose, ventaData, empresaData }: VentaExitosaModalProps) {
  const country = useCountryContext()
  const currencySymbol = country.simboloMoneda || 'S/'
  const taxLabel = country.impuesto || 'IGV (18%)'
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const documentoLabel = country.paisCodigo === 'PE' ? 'BOLETA' : 'TICKET'

  if (!isOpen || !ventaData) return null

  const handleImprimirTicket = () => {
    // Imprimir ticket térmico directamente
    printTicket({
      numero_ticket: ventaData.numero_ticket,
      total: ventaData.total,
      subtotal: ventaData.subtotal,
      impuestos: ventaData.impuestos,
      cliente_nombre: ventaData.cliente_nombre,
      fecha: ventaData.fecha,
      items: ventaData.items,
    }, empresaData, {
      currencySymbol,
      taxLabel,
      documentoFiscal,
      documentoLabel,
    })
  }

  const handleVerComprobante = () => {
    if (!ventaData.cpe_id) {
      alert('No hay CPE asociado')
      return
    }
    window.open(`/dashboard/cpe`, '_blank')
  }

  const formatMoney = (value: number) => value.toFixed(2)
  const formatCurrency = (value: number) => `${currencySymbol} ${formatMoney(value)}`

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '450px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con icono de éxito */}
        <div
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            padding: '24px',
            textAlign: 'center',
            color: 'white',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              fontSize: '32px',
            }}
          >
            ✓
          </div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            ¡Venta Exitosa!
          </h2>
          <p style={{ margin: '8px 0 0', opacity: 0.9, fontSize: '14px' }}>
            {ventaData.factura_electronica ? 'Comprobante electrónico generado' : 'Venta registrada'}
          </p>
        </div>

        {/* Contenido */}
        <div style={{ padding: '24px' }}>
          {/* Número de ticket destacado */}
          <div
            style={{
              backgroundColor: '#f3f4f6',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
              marginBottom: '20px',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>
              Ticket
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {ventaData.numero_ticket}
            </p>
          </div>

          {/* Detalles de la venta */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ color: '#6b7280' }}>Cliente</span>
              <span style={{ fontWeight: '500' }}>{ventaData.cliente_nombre || 'Cliente General'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ color: '#6b7280' }}>Subtotal</span>
              <span>{formatCurrency(ventaData.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
              <span style={{ color: '#6b7280' }}>{taxLabel}</span>
              <span>{formatCurrency(ventaData.impuestos)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', marginTop: '4px' }}>
              <span style={{ fontSize: '18px', fontWeight: 'bold' }}>TOTAL</span>
              <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                {formatCurrency(ventaData.total)}
              </span>
            </div>
          </div>

          {/* Estado del CPE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              backgroundColor: ventaData.factura_electronica ? '#ecfdf5' : '#fef3c7',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            <span style={{ fontSize: '20px' }}>
              {ventaData.factura_electronica ? '✅' : '⏳'}
            </span>
            <span style={{ fontSize: '14px', color: ventaData.factura_electronica ? '#065f46' : '#92400e' }}>
              {ventaData.factura_electronica 
                ? 'Boleta electrónica generada correctamente' 
                : 'Comprobante pendiente de emisión'}
            </span>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <button
              onClick={handleImprimirTicket}
              disabled={!ventaData.cpe_id}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: ventaData.cpe_id ? '#3b82f6' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: ventaData.cpe_id ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              🖨️ Imprimir
            </button>
            <button
              onClick={handleVerComprobante}
              disabled={!ventaData.cpe_id}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: ventaData.cpe_id ? '#10b981' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: ventaData.cpe_id ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              👁️ Ver CPE
            </button>
          </div>

          {/* Botón cerrar */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Continuar Vendiendo
          </button>
        </div>
      </div>
    </div>
  )
}
