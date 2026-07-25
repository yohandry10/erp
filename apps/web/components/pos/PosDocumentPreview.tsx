'use client'

/* eslint-disable @next/next/no-img-element -- El documento se replica en una ventana aislada de impresión, fuera del runtime de next/image. */

import React from 'react'

export type PosDocumentFormat = 'thermal' | 'a4'

export interface PosDocumentItem {
  id?: string | number
  codigo?: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  total: number
}

export interface PosDocumentData {
  numero: string
  tipo: string
  fecha?: string
  clienteNombre?: string
  clienteDocumento?: string
  formaPago?: string
  subtotal: number
  descuentos: number
  impuestos: number
  total: number
  items: PosDocumentItem[]
}

export interface PosDocumentCompany {
  nombre: string
  ruc: string
  direccion?: string
  email?: string
  telefono?: string
  logoUrl?: string
}

interface PosDocumentPreviewProps {
  data: PosDocumentData
  company: PosDocumentCompany
  format: PosDocumentFormat
  currencySymbol?: string
  taxLabel?: string
}

export function PosDocumentPreview({
  data,
  company,
  format,
  currencySymbol = 'S/',
  taxLabel = 'IGV (18%)',
}: PosDocumentPreviewProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: getPosDocumentStyles(format) }} />
      <article
        className={`pos-print-document pos-print-document--${format}`}
        data-pos-print-document
        data-print-format={format}
      >
        <header className="pos-doc-header">
          <div className="pos-doc-company">
            {company.logoUrl ? <img src={company.logoUrl} alt={`Logo de ${company.nombre}`} /> : null}
            <strong>{company.nombre}</strong>
            <span>RUC: {company.ruc}</span>
            {company.direccion ? <span>{company.direccion}</span> : null}
            {format === 'a4' && company.email ? <span>{company.email}</span> : null}
            {format === 'a4' && company.telefono ? <span>Tel. {company.telefono}</span> : null}
          </div>
          <div className="pos-doc-identity">
            <strong>{data.tipo}</strong>
            <span>N° {data.numero}</span>
          </div>
        </header>

        <section className="pos-doc-meta">
          <div><b>Cliente</b><span>{data.clienteNombre || 'Cliente General'}</span></div>
          <div><b>Documento</b><span>{data.clienteDocumento || 'Sin documento'}</span></div>
          <div><b>Emisión</b><span>{formatDate(data.fecha)}</span></div>
          <div><b>Pago</b><span>{data.formaPago || 'Contado'}</span></div>
        </section>

        <section className="pos-doc-items" aria-label="Detalle del comprobante">
          {format === 'a4' ? (
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th className="numeric">Cant.</th>
                  <th className="numeric">P. unit.</th>
                  <th className="numeric">Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr key={item.id ?? `${item.codigo}-${index}`}>
                    <td>{item.codigo || '—'}</td>
                    <td>{item.descripcion || 'Producto sin descripción'}</td>
                    <td className="numeric">{formatQuantity(item.cantidad)}</td>
                    <td className="numeric">{formatCurrency(item.precioUnitario, currencySymbol)}</td>
                    <td className="numeric">{formatCurrency(item.total, currencySymbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="pos-doc-thermal-items">
              <div className="pos-doc-thermal-head"><span>Descripción</span><span>Importe</span></div>
              {data.items.map((item, index) => (
                <div className="pos-doc-thermal-item" key={item.id ?? `${item.codigo}-${index}`}>
                  <div><strong>{item.descripcion || 'Producto sin descripción'}</strong><span>{item.codigo || '—'}</span></div>
                  <div><span>{formatQuantity(item.cantidad)} × {formatCurrency(item.precioUnitario, currencySymbol)}</span><strong>{formatCurrency(item.total, currencySymbol)}</strong></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="pos-doc-totals" aria-label="Totales del comprobante">
          <div><span>Subtotal</span><strong>{formatCurrency(data.subtotal, currencySymbol)}</strong></div>
          {data.descuentos > 0 ? <div><span>Descuentos</span><strong>- {formatCurrency(data.descuentos, currencySymbol)}</strong></div> : null}
          <div><span>{taxLabel}</span><strong>{formatCurrency(data.impuestos, currencySymbol)}</strong></div>
          <div className="pos-doc-grand-total"><span>Total</span><strong>{formatCurrency(data.total, currencySymbol)}</strong></div>
        </section>

        <footer className="pos-doc-footer">
          <strong>Gracias por su compra</strong>
          <span>Conserve este comprobante.</span>
        </footer>
      </article>
    </>
  )
}

export function printPosDocument(source: HTMLElement | null, title: string, format: PosDocumentFormat) {
  if (!source) return false

  const printFrame = document.createElement('iframe')
  printFrame.setAttribute('title', 'Documento listo para imprimir')
  printFrame.setAttribute('aria-hidden', 'true')
  Object.assign(printFrame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(printFrame)

  const printWindow = printFrame.contentWindow
  const printDocument = printFrame.contentDocument
  if (!printWindow || !printDocument) {
    printFrame.remove()
    return false
  }

  const cleanup = () => printFrame.remove()
  printFrame.onload = () => {
    printWindow.onafterprint = cleanup
    printWindow.focus()
    printWindow.print()
    window.setTimeout(cleanup, 60_000)
  }

  printDocument.open()
  printDocument.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>${getPosDocumentStyles(format)}</style>
      </head>
      <body>${source.outerHTML}</body>
    </html>`)
  printDocument.close()
  return true
}

export function getPosDocumentStyles(format: PosDocumentFormat) {
  const page = format === 'thermal'
    ? '@page { size: 80mm auto; margin: 0; }'
    : '@page { size: A4 portrait; margin: 12mm; }'

  return `
    ${page}
    .pos-print-document, .pos-print-document * { box-sizing: border-box; }
    .pos-print-document {
      width: ${format === 'thermal' ? '80mm' : '186mm'};
      max-width: 100%;
      margin: 0 auto;
      padding: ${format === 'thermal' ? '4mm 3.5mm' : '10mm'};
      background: #fff;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: ${format === 'thermal' ? '10.5px' : '12px'};
      line-height: 1.35;
      box-shadow: 0 12px 38px rgba(15, 23, 42, .18);
    }
    .pos-doc-header { display: flex; justify-content: space-between; gap: 8mm; align-items: flex-start; padding-bottom: 5mm; border-bottom: 1px solid #94a3b8; }
    .pos-doc-company { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 1mm; }
    .pos-doc-company strong { font-size: ${format === 'thermal' ? '14px' : '20px'}; text-transform: uppercase; }
    .pos-doc-company img { max-width: ${format === 'thermal' ? '38mm' : '48mm'}; max-height: 18mm; object-fit: contain; object-position: left center; margin-bottom: 2mm; }
    .pos-doc-identity { min-width: ${format === 'thermal' ? '0' : '58mm'}; border: 1.5px solid #334155; padding: 4mm; text-align: center; }
    .pos-doc-identity strong, .pos-doc-identity span { display: block; }
    .pos-doc-identity strong { font-size: ${format === 'thermal' ? '12px' : '16px'}; text-transform: uppercase; }
    .pos-doc-identity span { margin-top: 2mm; font-weight: 700; }
    .pos-doc-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm 7mm; margin: 5mm 0; padding: 4mm 0; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
    .pos-doc-meta div { display: flex; gap: 2mm; min-width: 0; }
    .pos-doc-meta b { flex: 0 0 auto; }
    .pos-doc-meta span { min-width: 0; overflow-wrap: anywhere; }
    .pos-doc-items table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .pos-doc-items th { padding: 2.5mm 2mm; border-bottom: 1.5px solid #334155; color: #334155; font-size: 10px; text-align: left; text-transform: uppercase; }
    .pos-doc-items td { padding: 3mm 2mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
    .pos-doc-items th:first-child, .pos-doc-items td:first-child { width: 22mm; }
    .pos-doc-items th:nth-child(3), .pos-doc-items td:nth-child(3) { width: 16mm; }
    .pos-doc-items th:nth-child(4), .pos-doc-items td:nth-child(4), .pos-doc-items th:nth-child(5), .pos-doc-items td:nth-child(5) { width: 28mm; }
    .pos-doc-items .numeric { text-align: right; white-space: nowrap; }
    .pos-doc-thermal-items { border-top: 1px dashed #475569; border-bottom: 1px dashed #475569; }
    .pos-doc-thermal-head, .pos-doc-thermal-item > div { display: flex; justify-content: space-between; gap: 3mm; }
    .pos-doc-thermal-head { padding: 2mm 0; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .pos-doc-thermal-item { padding: 2.5mm 0; border-top: 1px dotted #cbd5e1; }
    .pos-doc-thermal-item > div:first-child strong { max-width: 52mm; overflow-wrap: anywhere; }
    .pos-doc-thermal-item > div span { color: #475569; }
    .pos-doc-totals { width: ${format === 'thermal' ? '100%' : '68mm'}; margin: 5mm 0 0 auto; }
    .pos-doc-totals > div { display: flex; justify-content: space-between; gap: 5mm; padding: 1mm 0; }
    .pos-doc-totals > .pos-doc-grand-total { margin-top: 2mm; padding-top: 3mm; border-top: 1.5px solid #334155; font-size: ${format === 'thermal' ? '14px' : '16px'}; text-transform: uppercase; }
    .pos-doc-footer { display: flex; flex-direction: column; align-items: center; gap: 1mm; margin-top: 6mm; padding-top: 4mm; border-top: 1px dashed #64748b; text-align: center; }
    @media print {
      html, body { margin: 0; padding: 0; background: #fff; }
      .pos-print-document { max-width: none; margin: 0; padding: ${format === 'thermal' ? '3mm' : '0'}; box-shadow: none; }
    }
    ${format === 'thermal' ? `
      .pos-doc-header { display: block; padding-bottom: 3mm; border-bottom: 0; text-align: center; }
      .pos-doc-company { align-items: center; }
      .pos-doc-company img { object-position: center; }
      .pos-doc-identity { margin-top: 3mm; border-width: 1px 0; padding: 2.5mm 0; }
      .pos-doc-meta { grid-template-columns: 1fr; gap: 1mm; margin: 3mm 0; padding: 3mm 0; }
      .pos-doc-meta div { justify-content: space-between; }
    ` : ''}
  `
}

function formatCurrency(value: number, symbol: string) {
  const numericValue = Number(value)
  return `${symbol} ${Number.isFinite(numericValue) ? numericValue.toFixed(2) : '0.00'}`
}

function formatQuantity(value: number) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return '0'
  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function formatDate(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return value || 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
}
