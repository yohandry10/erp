'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2, X } from 'lucide-react'
import { fetchApi } from '@/lib/api-fetch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CpePreviewMetadata {
  id?: string
  tipo_documento?: string
  tipoDocumento?: string
  tipo_documento_fiscal?: string | null
  serie?: string
  numero?: string | number
  fecha_emision?: string
  fechaEmision?: string
  fecha_vencimiento?: string
  moneda?: string
  estado?: string
  sunat_status?: string
  dian_status?: string
  arca_status?: string
  pais_codigo?: string
  country_code?: string
  simulated?: boolean
  simulated_origin?: boolean
  fiscal_acceptance_status?: string
  ruc_emisor?: string
  razon_social_emisor?: string
  razon_social_receptor?: string
  documento_receptor?: string
  tipo_documento_receptor?: string
  direccion_receptor?: string
  total_gravadas?: number | string
  total_exoneradas?: number | string
  total_inafectas?: number | string
  total_gratuitas?: number | string
  total_descuentos?: number | string
  descuentos?: number | string
  subtotal?: number | string
  total_igv?: number | string
  total_isc?: number | string
  total_icbper?: number | string
  tasa_igv?: number | string
  total_venta?: number | string
  total?: number | string
  sunat_qr_data_url?: string | null
  dian_qr_data_url?: string | null
  fiscal_qr_data_url?: string | null
  qr_data_url?: string | null
  sunat_qr_content?: string | null
  valor_resumen?: string | null
  documento_referencia_tipo?: string
  documento_referencia_serie?: string
  documento_referencia_numero?: string | number
  documento_afectado_tipo?: string
  documento_afectado_serie?: string
  documento_afectado_numero?: string | number
  tipo_nota_credito?: string
  tipo_nota_debito?: string
  codigo_motivo_nota?: string
  tipo_nota?: string
  motivo_nota?: string
  motivo?: string
  observaciones?: string
  metadata?: Record<string, unknown>
  fiscal_print_info?: {
    authorizationNumber?: string
    authorizationPrefix?: string
    rangeFrom?: number
    rangeTo?: number
    validFrom?: string
    validTo?: string
    consecutive?: string
    generatedAt?: string
    paymentForm?: string
    paymentTerm?: string
    paymentMethod?: string
    taxQualities?: string[]
    softwareId?: string
    authorizationCode?: string
    authorizationLabel?: string
    authorizationExpiry?: string
    pointOfSale?: number
    documentNumber?: number
    specialLegend?: string | null
  } | null
  items?: CpePreviewItem[]
  emisor?: {
    ruc?: string | null
    razon_social?: string | null
    direccion_fiscal?: string | null
    telefono?: string | null
    email?: string | null
    logo_url?: string | null
  }
}

interface CpePreviewItem {
  cantidad?: number | string
  unidad_medida?: string
  unidad?: string
  descripcion?: string
  nombre_producto?: string
  codigo_producto?: string
  precio_unitario?: number | string
  precio_venta?: number | string
  valor_venta?: number | string
  subtotal?: number | string
  total_item?: number | string
  total?: number | string
}

interface CpeA4PreviewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentType?: string
  serie?: string
  numero?: string | number
}

interface FiscalPreviewProfile {
  countryCode: 'PE' | 'CO' | 'AR'
  taxIdLabel: 'RUC' | 'NIT' | 'CUIT'
  taxName: 'IGV' | 'IVA'
  authority: 'SUNAT' | 'DIAN' | 'ARCA'
  defaultTaxRate: number
}

const fiscalPreviewProfile = (country?: string): FiscalPreviewProfile => {
  const normalized = String(country || 'PE').trim().toUpperCase()
  if (normalized === 'CO') {
    return { countryCode: 'CO', taxIdLabel: 'NIT', taxName: 'IVA', authority: 'DIAN', defaultTaxRate: 19 }
  }
  if (normalized === 'AR') {
    return { countryCode: 'AR', taxIdLabel: 'CUIT', taxName: 'IVA', authority: 'ARCA', defaultTaxRate: 21 }
  }
  return { countryCode: 'PE', taxIdLabel: 'RUC', taxName: 'IGV', authority: 'SUNAT', defaultTaxRate: 18 }
}

const normalizeFiscalDocumentType = (type?: string, country?: string) => {
  const normalized = String(type || '').trim().toUpperCase()
  return normalized
}

const documentName = (type?: string, country?: string) => {
  const normalized = normalizeFiscalDocumentType(type, country)
  const { countryCode } = fiscalPreviewProfile(country)
  if (countryCode === 'CO') {
    if (normalized === '91' || normalized.includes('CRÉDITO') || normalized.includes('CREDITO')) return 'Nota de crédito'
    if (normalized === '92' || normalized.includes('DÉBITO') || normalized.includes('DEBITO')) return 'Nota de débito'
    return 'Factura'
  }
  if (countryCode === 'AR') {
    if (/^(?:003|008|013|021|053)$/.test(normalized) || normalized.includes('CRÉDITO') || normalized.includes('CREDITO')) return 'Nota de crédito'
    if (/^(?:002|007|012|020|052)$/.test(normalized) || normalized.includes('DÉBITO') || normalized.includes('DEBITO')) return 'Nota de débito'
    return 'Factura'
  }
  if (normalized.includes('03') || normalized.includes('BOLETA')) return 'Boleta de venta'
  if (normalized.includes('07') || normalized.includes('CRÉDITO') || normalized.includes('CREDITO')) return 'Nota de crédito'
  if (normalized.includes('08') || normalized.includes('DÉBITO') || normalized.includes('DEBITO')) return 'Nota de débito'
  return 'Factura'
}

const electronicDocumentTitle = (type?: string, country?: string) => {
  const name = documentName(type, country)
  const { countryCode } = fiscalPreviewProfile(country)
  if (countryCode === 'CO' && name === 'Factura') return 'Factura electrónica de venta'
  return `${name} electrónica`
}

const printedRepresentationLegend = (type?: string, country?: string) => {
  const { countryCode } = fiscalPreviewProfile(country)
  const name = documentName(type, country)
  if (countryCode === 'CO') {
    if (name === 'Factura') return 'Representación gráfica de la Factura Electrónica de Venta.'
    return `Representación gráfica de la ${name === 'Nota de crédito' ? 'Nota de Crédito' : 'Nota de Débito'} Electrónica.`
  }
  if (countryCode === 'AR') {
    if (name === 'Factura') return 'Representación gráfica de la Factura Electrónica.'
    return `Representación gráfica de la ${name === 'Nota de crédito' ? 'Nota de Crédito' : 'Nota de Débito'} Electrónica.`
  }
  const normalized = String(type || '').toUpperCase()
  if (normalized.includes('03') || normalized.includes('BOLETA')) return 'Representación impresa de la Boleta de Venta Electrónica.'
  if (normalized.includes('07') || normalized.includes('CRÉDITO') || normalized.includes('CREDITO')) return 'Representación impresa de la Nota de Crédito Electrónica.'
  if (normalized.includes('08') || normalized.includes('DÉBITO') || normalized.includes('DEBITO')) return 'Representación impresa de la Nota de Débito Electrónica.'
  return 'Representación impresa de la Factura Electrónica.'
}

const safeCpeImageUrl = (value?: string | null): string | null => {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  if (/^data:image\/(?:png|jpe?g);base64,[a-z0-9+/]+={0,2}$/i.test(normalized)) {
    // Evita introducir blobs arbitrariamente grandes en el DOM. El backend
    // aplica además el límite autoritativo de 2 MB.
    return normalized.length <= 3_000_000 ? normalized : null
  }
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

const firstFiniteNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return 0
}

const formatPreviewDate = (value?: string) => {
  const normalized = String(value || '').trim()
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized)
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`
  return normalized || 'No consignada'
}

const moneySymbol = (currency?: string) => {
  const normalized = String(currency || 'PEN').toUpperCase()
  if (normalized === 'PEN') return 'S/'
  if (normalized === 'USD') return 'US$'
  return normalized
}

const previewNoteReference = (metadata: CpePreviewMetadata) => {
  const country = fiscalPreviewProfile(metadata.pais_codigo || metadata.country_code).countryCode
  const noteType = String(metadata.tipo_documento || metadata.tipoDocumento || '').trim()
  if (country !== 'PE' || !['07', '08'].includes(noteType)) return null

  const extra = metadata.metadata || {}
  const referenceType = String(
    metadata.documento_referencia_tipo || metadata.documento_afectado_tipo
      || extra.documento_referencia_tipo || '',
  ).trim()
  const referenceSeries = String(
    metadata.documento_referencia_serie || metadata.documento_afectado_serie
      || extra.documento_referencia_serie || '',
  ).trim().toUpperCase()
  const rawReferenceNumber = String(
    metadata.documento_referencia_numero || metadata.documento_afectado_numero
      || extra.documento_referencia_numero || '',
  ).trim()
  const referenceNumber = /^\d{1,8}$/.test(rawReferenceNumber)
    ? rawReferenceNumber.padStart(8, '0')
    : rawReferenceNumber
  const reasonCode = String(
    noteType === '07'
      ? metadata.tipo_nota_credito || metadata.codigo_motivo_nota || metadata.tipo_nota
        || extra.codigo_motivo || ''
      : metadata.tipo_nota_debito || metadata.codigo_motivo_nota || metadata.tipo_nota
        || extra.codigo_motivo || '',
  ).trim()
  const reason = String(
    metadata.motivo_nota || metadata.motivo || metadata.observaciones || extra.motivo_nota || '',
  ).trim()

  return {
    document: referenceSeries && referenceNumber
      ? `${electronicDocumentTitle(referenceType, 'PE')} ${referenceSeries}-${referenceNumber}`
      : 'No consignado',
    reasonCode: reasonCode || 'No consignado',
    reason: reason || 'No consignado',
  }
}

function CpeA4Sheet({
  metadata,
  numberLabel,
}: {
  metadata: CpePreviewMetadata
  numberLabel: string
}) {
  const items = Array.isArray(metadata.items) ? metadata.items : []
  const visibleItems = items.slice(0, 6)
  const additionalItemCount = Math.max(0, items.length - visibleItems.length)
  const profile = fiscalPreviewProfile(metadata.pais_codigo || metadata.country_code)
  const currency = String(metadata.moneda || 'PEN').toUpperCase()
  const symbol = moneySymbol(currency)
  const total = firstFiniteNumber(metadata.total_venta, metadata.total)
  const tax = firstFiniteNumber(metadata.total_igv)
  const taxable = firstFiniteNumber(metadata.total_gravadas, metadata.subtotal, total - tax)
  const issuerName = metadata.emisor?.razon_social || metadata.razon_social_emisor || 'Empresa emisora'
  const issuerTaxId = metadata.emisor?.ruc || metadata.ruc_emisor || `${profile.taxIdLabel} no consignado`
  const recipientName = metadata.razon_social_receptor || 'Cliente general'
  const recipientTaxId = metadata.documento_receptor || 'Documento no consignado'
  const status = String(metadata.sunat_status || metadata.dian_status || metadata.arca_status || metadata.estado || 'PENDIENTE').replaceAll('_', ' ')
  const formatMoney = (amount: number) => `${symbol} ${amount.toFixed(2)}`
  const logoUrl = safeCpeImageUrl(metadata.emisor?.logo_url)
  const qrUrl = safeCpeImageUrl(
    metadata.fiscal_qr_data_url || metadata.dian_qr_data_url || metadata.sunat_qr_data_url || metadata.qr_data_url,
  )
  const taxRate = firstFiniteNumber(metadata.tasa_igv, taxable > 0 ? (tax / taxable) * 100 : profile.defaultTaxRate)
  const totalRows = [
    { label: 'Op. gravadas', value: taxable },
    { label: 'Op. exoneradas', value: firstFiniteNumber(metadata.total_exoneradas) },
    { label: 'Op. inafectas', value: firstFiniteNumber(metadata.total_inafectas) },
    { label: 'Op. gratuitas', value: firstFiniteNumber(metadata.total_gratuitas) },
    { label: 'Descuentos', value: firstFiniteNumber(metadata.total_descuentos, metadata.descuentos) },
    { label: 'ISC', value: firstFiniteNumber(metadata.total_isc) },
    { label: 'ICBPER', value: firstFiniteNumber(metadata.total_icbper) },
    { label: `${profile.taxName} (${Number(taxRate.toFixed(2))}%)`, value: tax },
  ].filter((row) => Math.abs(row.value) >= 0.005)
  const noteReference = previewNoteReference(metadata)
  const fiscalPrintInfo = metadata.fiscal_print_info
  const printedType = metadata.tipo_documento_fiscal || metadata.tipo_documento || metadata.tipoDocumento
  const lacksFiscalAcceptance = metadata.simulated !== false
  const evidenceStatus = String(metadata.fiscal_acceptance_status || 'LEGACY_UNVERIFIED').toUpperCase()
  const explicitDemo = evidenceStatus === 'SIMULATED' || metadata.simulated_origin === true
  const legacyUnverified = !explicitDemo && evidenceStatus === 'LEGACY_UNVERIFIED'

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-[#ffffff] p-[5%] text-[clamp(8px,1.1vw,12px)] leading-snug text-[#020617]"
      data-testid="cpe-a4-html-preview"
    >
      {lacksFiscalAcceptance && (
        <div className="pointer-events-none absolute inset-0 z-0 flex rotate-[-32deg] items-center justify-center text-[clamp(38px,8vw,72px)] font-black tracking-widest text-amber-700/10">
          {explicitDemo ? 'MUESTRA DEMO' : 'SIN VALIDEZ FISCAL'}
        </div>
      )}

      <div className="relative z-10 flex items-start justify-between gap-5 border-b-2 border-slate-900 pb-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`Logo de ${issuerName}`}
              className="h-auto max-h-16 w-[18%] max-w-24 shrink-0 object-contain"
              data-testid="cpe-a4-logo"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[1.45em] font-black uppercase tracking-tight">{issuerName}</p>
            <p className="mt-1 font-semibold">{profile.taxIdLabel}: {issuerTaxId}</p>
            <p className="mt-1 max-w-[34em]">{metadata.emisor?.direccion_fiscal || 'Dirección fiscal no consignada'}</p>
            {(metadata.emisor?.telefono || metadata.emisor?.email) && (
              <p className="mt-1 text-[#475569]">
                {[metadata.emisor?.telefono, metadata.emisor?.email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="w-[39%] shrink-0 border-2 border-slate-900 p-3 text-center">
          <p className="font-bold">{profile.taxIdLabel} {issuerTaxId}</p>
          <p className="my-2 text-[1.35em] font-black uppercase">{electronicDocumentTitle(printedType || undefined, profile.countryCode)}</p>
          <p className="text-[1.25em] font-black">{numberLabel}</p>
        </div>
      </div>

      {lacksFiscalAcceptance && (
        <div className="relative z-10 mt-3 rounded border border-amber-600 bg-amber-50 px-3 py-2 text-center font-black uppercase tracking-wide text-amber-900">
          {explicitDemo
            ? `Muestra demo · sin envío ni validez ${profile.authority}`
            : legacyUnverified
              ? 'Sin validez fiscal · procedencia legacy no verificable'
            : `Sin aceptación ni validez ${profile.authority}`}
        </div>
      )}

      <div className="relative z-10 mt-4 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 border border-slate-400 p-3">
        <span className="font-bold">Fecha de emisión:</span>
        <span>{formatPreviewDate(metadata.fecha_emision || metadata.fechaEmision)}</span>
        <span className="font-bold">Señor(es):</span>
        <span className="font-semibold uppercase">{recipientName}</span>
        <span className="font-bold">{profile.taxIdLabel} / Documento:</span>
        <span>{recipientTaxId}</span>
        <span className="font-bold">Dirección:</span>
        <span>{metadata.direccion_receptor || 'No consignada'}</span>
        <span className="font-bold">Moneda:</span>
        <span>{currency}</span>
      </div>

      <div className="relative z-10 mt-4 min-h-[30%] overflow-hidden border border-slate-500">
        <table className="w-full table-fixed border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="w-[10%] px-2 py-2 text-center">Cant.</th>
              <th className="w-[10%] px-2 py-2 text-center">Und.</th>
              <th className="w-[44%] px-2 py-2 text-left">Descripción</th>
              <th className="w-[18%] px-2 py-2 text-right">P. unit.</th>
              <th className="w-[18%] px-2 py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.length > 0 ? visibleItems.map((item, index) => {
              const quantity = firstFiniteNumber(item.cantidad, 1) || 1
              const lineTotal = firstFiniteNumber(
                item.total_item,
                item.total,
                item.precio_venta,
                item.valor_venta,
                item.subtotal,
                quantity * firstFiniteNumber(item.precio_unitario),
              )
              const unitPrice = quantity > 0 ? lineTotal / quantity : firstFiniteNumber(item.precio_unitario)
              return (
                <tr key={`${item.codigo_producto || 'item'}-${index}`} className="border-t border-[#cbd5e1] align-top">
                  <td className="px-2 py-2 text-center">{quantity}</td>
                  <td className="px-2 py-2 text-center">{String(item.unidad_medida || item.unidad || 'NIU').toUpperCase()}</td>
                  <td className="px-2 py-2"><span className="line-clamp-2" title={item.descripcion || item.nombre_producto}>{item.descripcion || item.nombre_producto || 'Producto o servicio'}</span></td>
                  <td className="px-2 py-2 text-right">{formatMoney(unitPrice)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatMoney(lineTotal)}</td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[#64748b]">
                  El comprobante no tiene líneas representables.
                </td>
              </tr>
            )}
            {additionalItemCount > 0 && (
              <tr className="border-t border-[#cbd5e1]">
                <td colSpan={5} className="px-3 py-2 text-center font-semibold text-[#475569]" data-testid="cpe-a4-additional-items">
                  + {additionalItemCount} líneas adicionales en el PDF completo
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="relative z-10 mt-4 ml-auto grid w-[48%] grid-cols-[1fr_auto] gap-x-5 gap-y-2 border-t-2 border-slate-900 pt-3 text-right">
        {totalRows.map((row) => (
          <div key={row.label} className="contents">
            <span>{row.label}:</span><span>{formatMoney(row.value)}</span>
          </div>
        ))}
        <span className="text-[1.15em] font-black">Importe total:</span>
        <span className="text-[1.15em] font-black">{formatMoney(total)}</span>
      </div>

      {profile.countryCode === 'CO' && fiscalPrintInfo && (
        <div className="relative z-10 mt-3 border border-[#64748b] bg-[#f8fafc] p-3" data-testid="cpe-dian-fiscal-info">
          <p className="mb-2 font-black uppercase">Información fiscal DIAN</p>
          <div className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-[0.92em]">
            <span className="font-bold">Autorización:</span><span>{fiscalPrintInfo.authorizationNumber}</span>
            <span className="font-bold">Prefijo y rango:</span><span>{fiscalPrintInfo.authorizationPrefix} {fiscalPrintInfo.rangeFrom} a {fiscalPrintInfo.rangeTo}</span>
            <span className="font-bold">Vigencia:</span><span>{fiscalPrintInfo.validFrom} a {fiscalPrintInfo.validTo}</span>
            <span className="font-bold">Generación/expedición:</span><span>{fiscalPrintInfo.generatedAt}</span>
            <span className="font-bold">Pago:</span><span>{fiscalPrintInfo.paymentForm} · {fiscalPrintInfo.paymentTerm} · {fiscalPrintInfo.paymentMethod}</span>
            <span className="font-bold">Calidades:</span><span>{fiscalPrintInfo.taxQualities?.join(' · ') || 'No aplican calidades adicionales'}</span>
            <span className="font-bold">Software DIAN:</span><span>{fiscalPrintInfo.softwareId}</span>
          </div>
        </div>
      )}

      {profile.countryCode === 'AR' && fiscalPrintInfo && (
        <div className="relative z-10 mt-3 border border-[#64748b] bg-[#f8fafc] p-3 text-center" data-testid="cpe-arca-authorization">
          <p className="font-black uppercase">Comprobante autorizado</p>
          <p className="mt-1"><strong>{fiscalPrintInfo.authorizationLabel || 'CAE'}:</strong> {fiscalPrintInfo.authorizationCode}</p>
          <p><strong>Vencimiento:</strong> {fiscalPrintInfo.authorizationExpiry} · <strong>Punto de venta:</strong> {String(fiscalPrintInfo.pointOfSale || '').padStart(5, '0')}</p>
          {fiscalPrintInfo.specialLegend && <p className="mt-1 font-black uppercase">{fiscalPrintInfo.specialLegend}</p>}
        </div>
      )}

      {noteReference && (
        <div
          className="relative z-10 mt-3 border border-[#64748b] bg-[#f8fafc] p-3"
          data-testid="cpe-a4-note-reference"
        >
          <p className="mb-2 font-black uppercase">Información de la nota</p>
          <div className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-1">
            <span className="font-bold">Comprobante modificado:</span>
            <span className="font-semibold uppercase">{noteReference.document}</span>
            <span className="font-bold">Código de motivo:</span>
            <span>{noteReference.reasonCode}</span>
            <span className="font-bold">Motivo o sustento:</span>
            <span>{noteReference.reason}</span>
          </div>
        </div>
      )}

      <div className="relative z-10 mt-auto flex items-end gap-4 border-t border-[#94a3b8] pt-3 text-[0.9em] text-[#475569]">
        {!lacksFiscalAcceptance && qrUrl && (
          <div className="w-[22%] max-w-[168px] shrink-0 text-center">
            <p className="mb-1 font-bold text-[#1e293b]">Código QR {profile.authority}</p>
            <img
              src={qrUrl}
              alt={`Código QR ${profile.authority} del comprobante`}
              className="mx-auto aspect-square w-full object-contain"
              data-testid="cpe-a4-qr"
            />
          </div>
        )}
        <div className="min-w-0 flex-1 text-center">
          <p>{printedRepresentationLegend(printedType || undefined, profile.countryCode)} · Estado {profile.authority}: {status}</p>
          {metadata.valor_resumen && <p className="mt-1 break-all text-[0.8em]">Valor resumen: {metadata.valor_resumen}</p>}
          {lacksFiscalAcceptance && (
            <p className="mt-1 font-bold text-amber-800">
              {explicitDemo
                ? 'Documento de demostración sin validez tributaria.'
                : legacyUnverified
                  ? 'Documento histórico de procedencia no verificable; sin validez fiscal.'
                : `Documento todavía no aceptado por ${profile.authority}; sin validez fiscal.`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CpeA4PreviewModal({
  isOpen,
  onClose,
  documentId,
  documentType,
  serie,
  numero,
}: CpeA4PreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<CpePreviewMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolvedType = metadata?.tipo_documento_fiscal || documentType || metadata?.tipo_documento || metadata?.tipoDocumento
  const resolvedCountry = metadata?.pais_codigo || metadata?.country_code || 'PE'
  const profile = fiscalPreviewProfile(resolvedCountry)
  const resolvedSerie = serie || metadata?.serie
  const resolvedNumero = numero || metadata?.numero
  const label = useMemo(() => documentName(resolvedType, resolvedCountry), [resolvedCountry, resolvedType])
  const numberLabel = resolvedSerie
    ? `${resolvedSerie}-${String(resolvedNumero ?? '').padStart(8, '0')}`
    : documentId
  const lacksFiscalAcceptance = metadata?.simulated !== false
  const evidenceStatus = String(metadata?.fiscal_acceptance_status || 'LEGACY_UNVERIFIED').toUpperCase()
  const explicitDemo = evidenceStatus === 'SIMULATED' || metadata?.simulated_origin === true
  const legacyUnverified = !explicitDemo && evidenceStatus === 'LEGACY_UNVERIFIED'

  useEffect(() => {
    if (!isOpen || !documentId) return

    const controller = new AbortController()
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)
    setPdfUrl(null)
    setMetadata(null)

    const encodedId = encodeURIComponent(documentId)
    const loadMetadata = fetchApi(`/api/cpe/comprobantes/${encodedId}`, {
      method: 'GET',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null
      const payload = await response.json().catch(() => null)
      return (payload?.data ?? payload) as CpePreviewMetadata | null
    }).catch(() => null)

    const loadPdf = fetchApi(`/api/cpe/comprobantes/${encodedId}/pdf`, {
      method: 'GET',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(detail || `El servidor respondió ${response.status}`)
      }
      const blob = await response.blob()
      if (!blob.size || !String(blob.type || 'application/pdf').includes('pdf')) {
        throw new Error('La representación A4 recibida no es un PDF válido')
      }
      const [header, trailer] = await Promise.all([
        blob.slice(0, 8).text(),
        blob.slice(Math.max(0, blob.size - 2048)).text(),
      ])
      if (
        blob.size < 512 ||
        !header.startsWith('%PDF-') ||
        !trailer.includes('startxref') ||
        !trailer.includes('%%EOF')
      ) {
        throw new Error('La representación A4 recibida tiene una estructura PDF incompleta')
      }
      return blob
    })

    void Promise.all([loadPdf, loadMetadata])
      .then(([blob, cpeMetadata]) => {
        if (!cpeMetadata) {
          throw new Error('El comprobante no tiene datos disponibles para la vista A4')
        }
        objectUrl = window.URL.createObjectURL(blob)
        setMetadata(cpeMetadata)
        setPdfUrl(objectUrl)
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return
        console.error('No se pudo cargar la vista previa A4 del CPE:', loadError)
        setError('No se pudo preparar la vista previa A4. Intenta nuevamente.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => {
      controller.abort()
      if (objectUrl) window.URL.revokeObjectURL(objectUrl)
    }
  }, [documentId, isOpen])

  const downloadPdf = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = `${label.toLowerCase().replace(/\s+/g, '-')}-${numberLabel}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const openPdf = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cpe-a4-preview-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-cyan-400/20 bg-background text-foreground shadow-2xl shadow-cyan-950/40">
        <header className="flex flex-col gap-3 border-b border-cyan-400/10 bg-card/95 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-primary">
                Resumen visual A4
              </Badge>
              <Badge variant="outline">210 × 297 mm</Badge>
              {metadata && lacksFiscalAcceptance && (
                <Badge className="border-amber-400/30 bg-amber-400/15 text-amber-700 dark:text-amber-200">
                  {explicitDemo
                    ? `Muestra demo · sin validez ${profile.authority}`
                    : legacyUnverified
                      ? 'Sin validez fiscal · legacy no verificable'
                    : `Sin aceptación ${profile.authority}`}
                </Badge>
              )}
            </div>
            <h2 id="cpe-a4-preview-title" className="mt-2 text-xl font-bold text-foreground">
              {label} {numberLabel}
            </h2>
            <p className="mt-1 text-sm font-medium text-foreground" data-testid="cpe-a4-preview-authority-note">
              El PDF descargable es la representación completa y autoritativa. Esta hoja es un resumen visual de su primera página.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Salida PDF A4 del ERP. Para conservar 210 × 297 mm, imprime en A4 con escala 100% y sin “ajustar a página”.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={downloadPdf} disabled={!pdfUrl}>
              <Download className="mr-2 h-4 w-4" />
              Descargar A4
            </Button>
            <Button type="button" onClick={openPdf} disabled={!pdfUrl}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir PDF / imprimir
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Cerrar vista previa A4">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="max-h-[calc(100vh-11rem)] overflow-auto bg-slate-200 p-3 sm:p-6 dark:bg-slate-950">
          {loading ? (
            <div className="flex min-h-[28rem] flex-col items-center justify-center gap-3 text-foreground">
              <Loader2 className="h-9 w-9 animate-spin" />
              <p>Cargando representación A4…</p>
            </div>
          ) : error ? (
            <Alert className="mx-auto max-w-2xl border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-200">
              <FileText className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : pdfUrl && metadata ? (
            <div
              className="mx-auto aspect-[210/297] w-full max-w-[794px] overflow-hidden bg-[#ffffff] shadow-2xl"
              data-testid="cpe-a4-sheet"
              aria-label="Resumen visual de la primera hoja A4; el PDF descargable es autoritativo"
            >
              <CpeA4Sheet
                metadata={metadata}
                numberLabel={numberLabel}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
