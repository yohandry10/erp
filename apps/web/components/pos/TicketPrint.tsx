'use client'

/* eslint-disable @next/next/no-img-element -- La impresion termica clona HTML en una ventana nueva y usa QR/logo dinamicos o data URLs; next/image no aplica en ese documento impreso. */

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
    cliente_documento?: string
    cliente_tipo_documento?: string
    fecha?: string
    hash?: string
    hash_firma?: string
    sunat_qr_content?: string
    sunat_qr_data_url?: string
    representacion_fiscal?: boolean
    cpe_emitido?: boolean
    estado_sunat?: string
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
  const locale = country.locale || 'es-PE'
  const fiscalAuthority = country.servicioFiscal || 'SUNAT'
  const currencySymbol = country.simboloMoneda || 'S/'
  const documentoLabel = getDocumentoLabel(country.paisCodigo, ventaData.tipo_comprobante)
  const fiscalLegend = getFiscalLegend(ventaData, documentoLabel, fiscalAuthority)
  const receiverDocLabel = getReceiverDocLabel(ventaData.cliente_tipo_documento, documentoFiscal)
  const qrUrl = safeImageUrl(ventaData.sunat_qr_data_url)
  const hashValue = ventaData.hash_firma || ventaData.hash

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
        <title>Ticket ${escapeHtml(ventaData.numero_ticket)}</title>
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

  const formatMoney = (value: number) => `${currencySymbol} ${value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleString(locale)
    return new Date(dateStr).toLocaleString(locale)
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
          {ventaData.cliente_documento && (
            <div>{receiverDocLabel}: {ventaData.cliente_documento}</div>
          )}
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
          {qrUrl && (
            <div className="qr">
              <img src={qrUrl} alt={`Código QR ${fiscalAuthority}`} />
            </div>
          )}
          {hashValue && <div className="hash">Valor resumen/Hash: {hashValue}</div>}
          {ventaData.estado_sunat && <div className="fiscal-status">Estado {fiscalAuthority}: {ventaData.estado_sunat}</div>}
          <div className="fiscal-note">{fiscalLegend}</div>
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
    locale?: string
    fiscalAuthority?: string
  }
) {
  const currencySymbol = context?.currencySymbol ?? 'S/'
  const taxLabel = context?.taxLabel ?? 'IGV (18%)'
  const documentoFiscal = context?.documentoFiscal ?? 'RUC'
  const documentoLabel = context?.documentoLabel ?? getDocumentoLabel('PE', ventaData.tipo_comprobante)
  const locale = context?.locale ?? 'es-PE'
  const fiscalAuthority = context?.fiscalAuthority ?? 'SUNAT'
  const fiscalLegend = getFiscalLegend(ventaData, documentoLabel, fiscalAuthority)
  const receiverDocLabel = getReceiverDocLabel(ventaData.cliente_tipo_documento, documentoFiscal)
  const hashValue = ventaData.hash_firma || ventaData.hash
  const formatMoney = (value: number) => `${currencySymbol} ${value.toLocaleString(context?.locale ?? 'es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleString(locale)
    return new Date(dateStr).toLocaleString(locale)
  }

  const itemsHtml = ventaData.items && ventaData.items.length > 0
    ? ventaData.items.map(item => `
        <div class="item">
          <span class="item-nombre">${escapeHtml(item.cantidad)}x ${escapeHtml(item.nombre)}</span>
          <span class="item-precio">${escapeHtml(formatMoney(item.subtotal))}</span>
        </div>
      `).join('')
    : `<div class="item">
        <span class="item-nombre">Productos</span>
        <span class="item-precio">${escapeHtml(formatMoney(ventaData.subtotal))}</span>
       </div>`

  const printWindow = window.open('', '_blank', 'width=350,height=500')

  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir')
    return
  }

  // Generar HTML del logo si existe
  const logoUrl = safeImageUrl(empresaData?.logo_url)
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" />`
    : ''
  const qrUrl = safeImageUrl(ventaData.sunat_qr_data_url)
  const qrHtml = qrUrl
    ? `<div class="qr"><img src="${escapeHtml(qrUrl)}" alt="Código QR ${escapeHtml(fiscalAuthority)}" /></div>`
    : ''
  const receiverDocHtml = ventaData.cliente_documento
    ? `<div>${escapeHtml(receiverDocLabel)}: ${escapeHtml(ventaData.cliente_documento)}</div>`
    : ''
  const hashHtml = hashValue
    ? `<div class="hash">Valor resumen/Hash: ${escapeHtml(hashValue)}</div>`
    : ''
  const qrContentHtml = ventaData.sunat_qr_content
    ? `<div class="qr-content">${escapeHtml(ventaData.sunat_qr_content)}</div>`
    : ''
  const estadoSunatHtml = ventaData.estado_sunat
    ? `<div class="fiscal-status">Estado ${escapeHtml(fiscalAuthority)}: ${escapeHtml(ventaData.estado_sunat)}</div>`
    : ''

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ticket ${escapeHtml(ventaData.numero_ticket)}</title>
      <style>${getTicketPrintStyles()}</style>
    </head>
    <body>
      <div class="header">
        ${logoHtml ? `<div class="logo">${logoHtml}</div>` : ''}
        <div class="empresa-nombre">${escapeHtml(empresaData?.nombre || 'NEON SYSTEM')}</div>
        <div class="empresa-ruc">${escapeHtml(documentoFiscal)}: ${escapeHtml(empresaData?.ruc || '20000000001')}</div>
        ${empresaData?.direccion ? `<div>${escapeHtml(empresaData.direccion)}</div>` : ''}
        <div class="ticket-numero">${escapeHtml(documentoLabel)}: ${escapeHtml(ventaData.numero_ticket)}</div>
        <div class="fecha">${escapeHtml(formatDate(ventaData.fecha))}</div>
      </div>
      <div class="cliente"><strong>Cliente:</strong> ${escapeHtml(ventaData.cliente_nombre || 'Cliente General')}${receiverDocHtml}</div>
      <div class="items">${itemsHtml}</div>
      <div class="totales">
        <div class="total-row"><span>Subtotal:</span><span>${escapeHtml(formatMoney(ventaData.subtotal))}</span></div>
        <div class="total-row"><span>${escapeHtml(taxLabel)}:</span><span>${escapeHtml(formatMoney(ventaData.impuestos))}</span></div>
        <div class="total-row total-final"><span>TOTAL:</span><span>${escapeHtml(formatMoney(ventaData.total))}</span></div>
      </div>
      <div class="footer">
        ${qrHtml}
        ${hashHtml}
        ${qrContentHtml}
        ${estadoSunatHtml}
        <div class="fiscal-note">${escapeHtml(fiscalLegend)}</div>
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
  if (countryCode === 'AR') {
    if (['1', '6', '11', '19', '51', '01'].includes(String(tipoComprobante))) return 'FACTURA'
    if (['3', '8', '13', '21', '53'].includes(String(tipoComprobante))) return 'NOTA DE CRÉDITO'
    if (['2', '7', '12', '20', '52'].includes(String(tipoComprobante))) return 'NOTA DE DÉBITO'
    return 'TICKET'
  }
  if (countryCode !== 'PE') return 'TICKET'
  if (tipoComprobante === '01') return 'FACTURA'
  if (tipoComprobante === '03') return 'BOLETA'
  return 'TICKET'
}

function getFiscalLegend(
  ventaData: TicketPrintProps['ventaData'],
  documentoLabel: string,
  fiscalAuthority: string,
): string {
  if (ventaData.representacion_fiscal && ventaData.sunat_qr_data_url) {
    return `Representación impresa de ${documentoLabel}`
  }

  if (ventaData.cpe_emitido) {
    return `Comprobante fiscal generado. QR ${fiscalAuthority} no disponible para impresión.`
  }

  if (ventaData.tipo_comprobante === '01' || ventaData.tipo_comprobante === '03') {
    return 'Comprobante interno de caja. CPE pendiente de emisión fiscal.'
  }

  return 'Comprobante interno de caja'
}

function getReceiverDocLabel(tipoDocumento: string | undefined, documentoFiscal: string): string {
  if (tipoDocumento === '6' || tipoDocumento === 'CUIT' || tipoDocumento === 'RUC') {
    return documentoFiscal
  }
  if (tipoDocumento === '1') return 'DNI'
  if (tipoDocumento === '4') return 'Carné de extranjería'
  if (tipoDocumento === '7') return 'Pasaporte'
  return 'Documento'
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char]
  })
}

function safeImageUrl(value?: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value, window.location.origin)
    if (!['http:', 'https:', 'data:'].includes(url.protocol)) return null
    if (url.protocol === 'data:' && !/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(url.href)) return null
    return url.href
  } catch {
    return null
  }
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
    .qr { text-align: center; margin: 7px 0 4px; }
    .qr img { width: 28mm; height: 28mm; object-fit: contain; image-rendering: pixelated; }
    .hash, .qr-content, .fiscal-status, .fiscal-note { overflow-wrap: anywhere; word-break: break-word; }
    .hash, .qr-content, .fiscal-status { font-size: 8px; }
    .fiscal-note { margin-top: 4px; font-weight: 700; }
  `
}
