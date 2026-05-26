'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useCountryContext } from '@/hooks/use-country-context'

interface TicketPrintProps {
  ventaData: {
    numero_ticket: string
    total: number
    subtotal: number
    impuestos: number
    tipo_comprobante?: '01' | '03'
    cliente_nombre?: string
    fecha?: string
    items?: Array<{
      nombre: string
      cantidad: number
      precio: number
      subtotal: number
    }>
  }
  empresaData?: {
    nombre: string
    ruc: string
    direccion?: string
    logo_url?: string
  }
  onPrintComplete?: () => void
}

export default function TicketPrint({ ventaData, empresaData, onPrintComplete }: TicketPrintProps) {
  const ticketRef = useRef<HTMLDivElement>(null)
  const country = useCountryContext()
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const taxLabel = country.impuesto || 'IGV (18%)'
  const currencySymbol = country.simboloMoneda || 'S/'
  const documentoLabel = getDocumentoLabel(country.paisCodigo, ventaData.tipo_comprobante)

  const handlePrint = useCallback(() => {
    if (!ticketRef.current) return

    const printContent = ticketRef.current.innerHTML
    const printWindow = window.open('', '_blank', 'width=300,height=600')
    
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para imprimir')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket ${ventaData.numero_ticket}</title>
        <style>${getTicketPrintStyles()}</style>
      </head>
      <body>
        ${printContent}
      </body>
      </html>
    `)

    printWindow.document.close()
    
    printWindow.onload = () => {
      printWindow.focus()
      printWindow.print()
      printWindow.onafterprint = () => {
        printWindow.close()
        onPrintComplete?.()
      }
    }
  }, [onPrintComplete, ventaData.numero_ticket])

  useEffect(() => {
    // Auto-imprimir cuando se monta el componente
    const timer = setTimeout(() => {
      handlePrint()
    }, 100)
    return () => clearTimeout(timer)
  }, [handlePrint])

  const formatMoney = (value: number) => `${currencySymbol} ${value.toFixed(2)}`
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleString('es-PE')
    return new Date(dateStr).toLocaleString('es-PE')
  }

  return (
    <div className="hidden">
      <div ref={ticketRef} className="ticket">
        {/* Header */}
        <div className="header">
          <div className="empresa-nombre">{empresaData?.nombre || 'NEON SYSTEM'}</div>
          <div className="empresa-ruc">{documentoFiscal}: {empresaData?.ruc || '20000000001'}</div>
          {empresaData?.direccion && <div>{empresaData.direccion}</div>}
          <div className="ticket-numero">{documentoLabel}: {ventaData.numero_ticket}</div>
          <div className="fecha">{formatDate(ventaData.fecha)}</div>
        </div>

        {/* Cliente */}
        <div className="cliente">
          <strong>Cliente:</strong> {ventaData.cliente_nombre || 'Cliente General'}
        </div>

        {/* Items */}
        <div className="items">
          {ventaData.items && ventaData.items.length > 0 ? (
            ventaData.items.map((item, idx) => (
              <div key={idx} className="item">
                <span className="item-nombre">
                  {item.cantidad}x {item.nombre}
                </span>
                <span className="item-precio">{formatMoney(item.subtotal)}</span>
              </div>
            ))
          ) : (
            <div className="item">
              <span className="item-nombre">Productos</span>
              <span className="item-precio">{formatMoney(ventaData.subtotal)}</span>
            </div>
          )}
        </div>

        {/* Totales */}
        <div className="totales">
          <div className="total-row">
            <span>Subtotal:</span>
            <span>{formatMoney(ventaData.subtotal)}</span>
          </div>
          <div className="total-row">
            <span>{taxLabel}:</span>
            <span>{formatMoney(ventaData.impuestos)}</span>
          </div>
          <div className="total-row total-final">
            <span>TOTAL:</span>
            <span>{formatMoney(ventaData.total)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          <div>¡Gracias por su compra!</div>
          <div>Conserve este ticket</div>
        </div>
      </div>
    </div>
  )
}

// Función helper para imprimir ticket desde cualquier lugar
export function printTicket(
  ventaData: TicketPrintProps['ventaData'],
  empresaData?: TicketPrintProps['empresaData'],
  context?: {
    currencySymbol?: string
    taxLabel?: string
    documentoFiscal?: string
    documentoLabel?: string
  }
) {
  const currencySymbol = context?.currencySymbol ?? 'S/'
  const taxLabel = context?.taxLabel ?? 'IGV (18%)'
  const documentoFiscal = context?.documentoFiscal ?? 'RUC'
  const documentoLabel = context?.documentoLabel ?? getDocumentoLabel('PE', ventaData.tipo_comprobante)
  const formatMoney = (value: number) => `${currencySymbol} ${value.toFixed(2)}`
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleString('es-PE')
    return new Date(dateStr).toLocaleString('es-PE')
  }

  const itemsHtml = ventaData.items && ventaData.items.length > 0
    ? ventaData.items.map(item => `
        <div class="item">
          <span class="item-nombre">${item.cantidad}x ${item.nombre}</span>
          <span class="item-precio">${formatMoney(item.subtotal)}</span>
        </div>
      `).join('')
    : `<div class="item">
        <span class="item-nombre">Productos</span>
        <span class="item-precio">${formatMoney(ventaData.subtotal)}</span>
       </div>`

  const printWindow = window.open('', '_blank', 'width=350,height=500')
  
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir')
    return
  }

  // Generar HTML del logo si existe
  const logoHtml = empresaData?.logo_url 
    ? `<img src="${empresaData.logo_url}" alt="Logo" />`
    : ''

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ticket ${ventaData.numero_ticket}</title>
      <style>${getTicketPrintStyles()}</style>
    </head>
    <body>
      <div class="header">
        ${logoHtml ? `<div class="logo">${logoHtml}</div>` : ''}
        <div class="empresa-nombre">${empresaData?.nombre || 'NEON SYSTEM'}</div>
        <div class="empresa-ruc">${documentoFiscal}: ${empresaData?.ruc || '20000000001'}</div>
        ${empresaData?.direccion ? `<div>${empresaData.direccion}</div>` : ''}
        <div class="ticket-numero">${documentoLabel}: ${ventaData.numero_ticket}</div>
        <div class="fecha">${formatDate(ventaData.fecha)}</div>
      </div>
      <div class="cliente"><strong>Cliente:</strong> ${ventaData.cliente_nombre || 'Cliente General'}</div>
      <div class="items">${itemsHtml}</div>
      <div class="totales">
        <div class="total-row"><span>Subtotal:</span><span>${formatMoney(ventaData.subtotal)}</span></div>
        <div class="total-row"><span>${taxLabel}:</span><span>${formatMoney(ventaData.impuestos)}</span></div>
        <div class="total-row total-final"><span>TOTAL:</span><span>${formatMoney(ventaData.total)}</span></div>
      </div>
      <div class="footer">
        <div>¡Gracias por su compra!</div>
        <div>Conserve este ticket</div>
      </div>
    </body>
    </html>
  `)

  printWindow.document.close()
  printWindow.onload = () => {
    printWindow.focus()
    printWindow.print()
  }
}

function getDocumentoLabel(countryCode?: string, tipoComprobante?: string): string {
  if (countryCode !== 'PE') return 'TICKET'
  if (tipoComprobante === '01') return 'FACTURA'
  if (tipoComprobante === '03') return 'BOLETA'
  return 'TICKET'
}

function getTicketPrintStyles(): string {
  return `
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      width: 80mm;
      margin: 0;
      padding: 3mm;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.25;
    }
    .header, .footer { text-align: center; }
    .empresa-nombre { font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .empresa-ruc, .fecha, .cliente { margin-top: 3px; }
    .ticket-numero { margin-top: 6px; font-weight: 700; }
    .logo img { max-width: 38mm; max-height: 18mm; object-fit: contain; margin-bottom: 3mm; }
    .items { margin: 8px 0; border-top: 1px dashed #333; border-bottom: 1px dashed #333; padding: 5px 0; }
    .item, .total-row { display: flex; justify-content: space-between; gap: 6px; }
    .item + .item, .total-row + .total-row { margin-top: 3px; }
    .item-nombre { flex: 1; overflow-wrap: anywhere; }
    .item-precio { white-space: nowrap; text-align: right; }
    .totales { margin-top: 6px; }
    .total-final { border-top: 1px solid #111; padding-top: 4px; font-weight: 700; font-size: 13px; }
    .footer { margin-top: 8px; border-top: 1px dashed #333; padding-top: 5px; }
  `
}
