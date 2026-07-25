'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { AlertCircle, Printer, RefreshCw, X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface CpeViewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentType: string
}

interface CpeItem {
  nombre_producto?: string
  descripcion?: string
  cantidad?: number
  precio_unitario?: number
  valor_venta?: number
  subtotal?: number
}

interface CpeData {
  serie: string
  numero: string | number
  created_at: string
  fecha_emision?: string
  razon_social_emisor: string
  ruc_emisor: string
  logo_url?: string
  razon_social_receptor: string
  documento_receptor: string
  tipo_documento_receptor: string
  total_gravadas: number
  total_igv: number
  total_venta: number
  moneda: string
  estado: string
  hash: string
  hash_firma?: string
  valor_resumen?: string
  sunat_qr_content?: string
  sunat_qr_data_url?: string
  items: CpeItem[]
  tipo_documento: string
  tasa_igv?: number
  tasa_impuesto?: number
}

export default function CpeViewModal({
  isOpen,
  onClose,
  documentId,
  documentType,
}: CpeViewModalProps) {
  const [cpeData, setCpeData] = useState<CpeData | null>(null)
  const [loading, setLoading] = useState(false)
  const api = useApi()

  useEffect(() => {
    if (isOpen && documentId) {
      loadCpeData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, documentId])

  const loadCpeData = async () => {
    setLoading(true)
    try {
      // Usar el endpoint correcto: /api/cpe/comprobantes/:id
      const response = await api.get(`/api/cpe/comprobantes/${documentId}`)

      if (response?.success && response?.data) {
        setCpeData(response.data)
      } else {
        console.error('Error al cargar CPE:', response?.message || 'Sin datos')
        setCpeData(null)
      }
    } catch (error) {
      console.error('Error al cargar CPE:', error)
      setCpeData(null)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    // Generar ticket térmico de 80mm en lugar de imprimir el modal completo
    if (!cpeData) return

    const formatMoney = (value: number) => `${cpeData.moneda} ${value.toFixed(2)}`
    const formatDate = (dateStr?: string) => new Date(dateStr || Date.now()).toLocaleDateString('es-PE')
    const taxLabel = getTaxLabel(cpeData)
    const hashValue = cpeData.valor_resumen || cpeData.hash_firma || cpeData.hash || ''

    const itemsHtml = Array.isArray(cpeData.items) && cpeData.items.length > 0
      ? cpeData.items.map((item, idx) => {
          const qty = item.cantidad ?? 1
          const unit = item.precio_unitario ?? 0
          const total = item.valor_venta ?? item.subtotal ?? qty * unit
          return `
            <div>
              <span>${escapeHtml(qty)}x ${escapeHtml(item.nombre_producto || item.descripcion || 'Producto')}</span>
              <span>${escapeHtml(formatMoney(total))}</span>
            </div>
          `
        }).join('')
      : '<div>Sin detalle de productos</div>'

    const printWindow = window.open('', '_blank', 'width=350,height=600')

    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para imprimir')
      return
    }

    const numeroFormateado = `${cpeData.serie}-${(typeof cpeData.numero === 'number' ? cpeData.numero : parseInt(String(cpeData.numero || '0'), 10)).toString().padStart(8, '0')}`

    // Generar HTML del logo si existe
    const logoUrl = safeImageUrl(cpeData.logo_url)
    const logoHtml = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" />`
      : ''
    const qrUrl = safeImageUrl(cpeData.sunat_qr_data_url)
    const qrHtml = qrUrl
      ? `<div class="qr"><img src="${escapeHtml(qrUrl)}" alt="Código QR SUNAT" /></div>`
      : ''
    const qrContentHtml = cpeData.sunat_qr_content
      ? `<div class="qr-content">${escapeHtml(cpeData.sunat_qr_content)}</div>`
      : ''
    const documentTypeName = getDocumentTypeName()

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(documentTypeName)} ${escapeHtml(numeroFormateado)}</title>
        <style>${getThermalPrintStyles()}</style>
      </head>
      <body>
        <div class="header">
          ${logoHtml ? `<div class="logo">${logoHtml}</div>` : ''}
          <div class="empresa">${escapeHtml(cpeData.razon_social_emisor || 'NEON SYSTEM')}</div>
          <div class="ruc">RUC: ${escapeHtml(cpeData.ruc_emisor || '20000000001')}</div>
          <div class="tipo-doc">${escapeHtml(documentTypeName)}</div>
          <div class="numero">${escapeHtml(numeroFormateado)}</div>
          <div class="fecha">${escapeHtml(formatDate(cpeData.fecha_emision || cpeData.created_at))}</div>
        </div>

        <div class="seccion">
          <div class="label">CLIENTE:</div>
          <div class="valor">${escapeHtml(cpeData.razon_social_receptor || 'Cliente General')}</div>
          <div class="valor">${cpeData.tipo_documento_receptor === '6' ? 'RUC' : 'DNI'}: ${escapeHtml(cpeData.documento_receptor || '-')}</div>
        </div>

        <div class="items">
          <div>
            <span>DESCRIPCIÓN</span>
            <span>TOTAL</span>
          </div>
          ${itemsHtml}
        </div>

        <div class="totales">
          <div class="total-row"><span>Subtotal:</span><span>${escapeHtml(formatMoney(cpeData.total_gravadas || 0))}</span></div>
          <div class="total-row"><span>${escapeHtml(taxLabel)}:</span><span>${escapeHtml(formatMoney(cpeData.total_igv || 0))}</span></div>
          <div class="total-row total-final"><span>TOTAL:</span><span>${escapeHtml(formatMoney(cpeData.total_venta || 0))}</span></div>
        </div>

        <div class="footer">
          ${qrHtml}
          <div class="hash">Valor resumen/Hash: ${escapeHtml(hashValue || 'N/A')}</div>
          ${qrContentHtml}
          <div>Representación impresa del ${escapeHtml(documentTypeName)}</div>
          <div>¡Gracias por su compra!</div>
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

  const getDocumentTypeName = () => {
    switch (documentType) {
      case '01':
        return 'FACTURA ELECTRÓNICA'
      case '03':
        return 'BOLETA DE VENTA ELECTRÓNICA'
      case '07':
        return 'NOTA DE CRÉDITO ELECTRÓNICA'
      case '08':
        return 'NOTA DE DÉBITO ELECTRÓNICA'
      default:
        return 'COMPROBANTE ELECTRÓNICO'
    }
  }

  const getTaxLabel = (data: Pick<CpeData, 'total_gravadas' | 'total_igv' | 'tasa_igv' | 'tasa_impuesto'>) => {
    const explicitRate = Number(data.tasa_igv ?? data.tasa_impuesto)
    const derivedRate = Number(data.total_gravadas) > 0
      ? (Number(data.total_igv || 0) / Number(data.total_gravadas)) * 100
      : 18
    const rate = Number.isFinite(explicitRate) && explicitRate > 0
      ? (explicitRate <= 1 ? explicitRate * 100 : explicitRate)
      : derivedRate
    return `IGV (${Number(rate.toFixed(2))}%)`
  }

  const getThermalPrintStyles = () => `
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
    .empresa { font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .ruc, .tipo-doc, .numero, .fecha, .seccion { margin-top: 4px; }
    .tipo-doc, .numero { font-weight: 700; }
    .logo img { max-width: 38mm; max-height: 18mm; object-fit: contain; margin-bottom: 3mm; }
    .items { margin: 8px 0; border-top: 1px dashed #333; border-bottom: 1px dashed #333; padding: 5px 0; }
    .items > div, .total-row { display: flex; justify-content: space-between; gap: 6px; }
    .items > div + div, .total-row + .total-row { margin-top: 3px; }
    .items span:first-child { flex: 1; overflow-wrap: anywhere; }
    .items span:last-child { white-space: nowrap; text-align: right; }
    .table-head { font-weight: 700; }
    .total-final { border-top: 1px solid #111; padding-top: 4px; font-weight: 700; font-size: 13px; }
    .footer { margin-top: 8px; border-top: 1px dashed #333; padding-top: 5px; }
    .qr { text-align: center; margin: 7px 0 4px; }
    .qr img { width: 28mm; height: 28mm; object-fit: contain; image-rendering: pixelated; }
    .hash, .qr-content { overflow-wrap: anywhere; word-break: break-word; font-size: 8px; }
  `

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="relative max-h-[95vh] w-[95%] max-w-7xl overflow-auto rounded-lg border border-cyan-400/20 bg-background text-foreground shadow-2xl shadow-cyan-950/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-cyan-400/10 bg-card/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge variant="outline" className="mb-2 border-cyan-400/30 bg-cyan-400/10 text-primary">
                Vista CPE
              </Badge>
              <h2 className="text-xl font-semibold tracking-normal text-foreground">{getDocumentTypeName()}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {cpeData
                  ? `${cpeData.serie}-${(typeof cpeData.numero === 'number'
                      ? cpeData.numero
                      : parseInt(String(cpeData.numero || '0'), 10)
                    )
                      .toString()
                    .padStart(8, '0')}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handlePrint}
                className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white"
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
              <Button
                onClick={onClose}
                variant="outline"
                size="icon"
                className="border-cyan-400/20 bg-card/80 text-foreground/90 hover:bg-cyan-400/10"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex min-h-96 flex-col items-center justify-center gap-4">
              <RefreshCw className="h-9 w-9 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Cargando comprobante...</p>
            </div>
          ) : cpeData ? (
            <div className="space-y-5">
              <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                <div className="rounded-lg border border-cyan-400/15 bg-card/50 p-4 text-center">
                  <h1 className="text-2xl font-semibold text-foreground">NEON SYSTEM</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Sistema Empresarial Integrado</p>
                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                    <p><strong>RUC:</strong> {cpeData.ruc_emisor}</p>
                    <p><strong>Razón social:</strong> {cpeData.razon_social_emisor}</p>
                    <p className="md:col-span-2">Dirección: Lima, Perú</p>
                  </div>
                </div>

                <div className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
                  <div className="rounded-md border border-cyan-400/25 bg-cyan-400/10 p-4 text-center">
                    <h2 className="text-sm font-semibold uppercase text-primary">{getDocumentTypeName()}</h2>
                    <p className="mt-2 text-xl font-semibold text-foreground">
                      {cpeData.serie} -{' '}
                      {(typeof cpeData.numero === 'number'
                        ? cpeData.numero
                        : parseInt(String(cpeData.numero || '0'), 10)
                      )
                        .toString()
                        .padStart(8, '0')}
                    </p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <p><strong>Fecha:</strong> {new Date(cpeData.created_at).toLocaleDateString('es-PE')}</p>
                    <p><strong>Estado:</strong> {cpeData.estado}</p>
                    <p><strong>Moneda:</strong> {cpeData.moneda}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase text-cyan-200/80">Datos del cliente</h3>
                <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                  <p><strong>Cliente:</strong> {cpeData.razon_social_receptor}</p>
                  <p><strong>Documento:</strong> {cpeData.documento_receptor}</p>
                  <p>
                    <strong>Tipo de documento:</strong>{' '}
                    {cpeData.tipo_documento_receptor === '1'
                      ? 'DNI'
                      : cpeData.tipo_documento_receptor === '6'
                        ? 'RUC'
                        : 'Otro'}
                  </p>
                </div>
              </section>

              <section className="rounded-lg border border-cyan-400/15 bg-card/50">
                <div className="border-b border-cyan-400/10 p-4">
                  <h3 className="text-sm font-semibold uppercase text-cyan-200/80">Detalle de productos</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-cyan-400/10 hover:bg-transparent">
                      <TableHead className="text-center">#</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-center">Cantidad</TableHead>
                      <TableHead className="text-right">Precio unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(cpeData.items) && cpeData.items.length > 0 ? (
                      cpeData.items.map((item, index) => {
                        const qty = item.cantidad ?? 1
                        const unit = item.precio_unitario ?? 0
                        return (
                          <TableRow key={`${index}-${item.nombre_producto ?? item.descripcion ?? 'item'}`} className="border-cyan-400/10">
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell className="font-medium text-foreground">
                              {item.nombre_producto || item.descripcion || 'Producto'}
                            </TableCell>
                            <TableCell className="text-center">{qty}</TableCell>
                            <TableCell className="text-right">
                              {cpeData.moneda} {unit.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {cpeData.moneda} {(qty * unit).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No hay productos disponibles
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase text-cyan-200/80">Información de seguridad</h3>
                  <p className="text-sm font-semibold text-foreground/90">Hash de seguridad:</p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    {cpeData.valor_resumen || cpeData.hash_firma || cpeData.hash || 'N/A'}
                  </p>
                  {cpeData.sunat_qr_content && (
                    <>
                      <p className="mt-4 text-sm font-semibold text-foreground/90">Contenido QR SUNAT:</p>
                      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{cpeData.sunat_qr_content}</p>
                    </>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">Representación impresa del {getDocumentTypeName()}</p>
                </div>

                <div className="rounded-lg border border-cyan-400/15 bg-card/50 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase text-cyan-200/80">Resumen de totales</h3>
                  <div className="space-y-3 text-sm">
                    <TotalRow label="Subtotal" value={`${cpeData.moneda} ${(cpeData.total_gravadas || 0).toFixed(2)}`} />
                    <TotalRow label={getTaxLabel(cpeData)} value={`${cpeData.moneda} ${(cpeData.total_igv || 0).toFixed(2)}`} />
                    <div className="flex justify-between border-t border-cyan-400/10 pt-3 text-base font-semibold text-primary">
                      <span>TOTAL:</span>
                      <span>{cpeData.moneda} {(cpeData.total_venta || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </section>

              <footer className="border-t border-cyan-400/10 pt-4 text-center text-xs text-muted-foreground">
                <p className="font-semibold text-muted-foreground">NEON SYSTEM - Sistema Empresarial Integrado</p>
                <p className="mt-1">
                  Documento generado automáticamente el {new Date().toLocaleDateString('es-PE')}
                </p>
                <p className="mt-1">
                  Para consultas sobre este documento, contacte al emisor
                </p>
              </footer>
            </div>
          ) : (
            <Alert className="border-amber-300/30 bg-amber-300/10 text-amber-400 dark:text-amber-200">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No se pudo cargar el comprobante</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-muted-foreground">
      <span>{label}:</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
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
