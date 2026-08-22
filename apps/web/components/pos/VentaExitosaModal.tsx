'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileText, Printer, RefreshCw } from 'lucide-react'
import { printTicket } from './TicketPrint'
import { useCountryContext } from '@/hooks/use-country-context'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { multiplicarMoneda } from '@/lib/format-utils'

interface VentaExitosaData {
  venta_id: string | number
  numero_ticket: string
  total: number
  subtotal: number
  impuestos: number
  tipo_comprobante?: 'TICKET' | '01' | '03'
  tipo_emision?: 'TICKET' | 'FISCAL_INMEDIATO' | 'TICKET_CANJEADO'
  canjeable?: boolean
  estado: string
  factura_electronica: boolean
  facturacion_pendiente?: boolean
  cpe_id?: string
  cliente_nombre?: string
  cliente_id?: string
  cliente_documento?: string
  fecha?: string
  items?: Array<{
    nombre: string
    cantidad: number
    precio: number
    subtotal: number
  }>
}

interface VentaExitosaModalProps {
  isOpen: boolean
  onClose: () => void
  onCanjearTicket?: (venta: VentaExitosaData) => void
  ventaData: VentaExitosaData | null
  empresaData?: {
    nombre: string
    ruc: string
    direccion?: string
    logo_url?: string
  }
}

interface CpePrintData {
  id?: string
  serie?: string
  numero?: string | number
  tipo_documento?: '01' | '03'
  fecha_emision?: string
  created_at?: string
  razon_social_receptor?: string
  documento_receptor?: string
  tipo_documento_receptor?: string
  total_gravadas?: number
  total_igv?: number
  total_venta?: number
  estado?: string
  sunat_status?: string
  hash?: string
  hash_firma?: string
  valor_resumen?: string
  sunat_qr_content?: string
  sunat_qr_data_url?: string
  items?: Array<{
    nombre_producto?: string
    descripcion?: string
    cantidad?: number
    precio_unitario?: number
    valor_venta?: number
    subtotal?: number
  }>
}

export default function VentaExitosaModal({
  isOpen,
  onClose,
  onCanjearTicket,
  ventaData,
  empresaData,
}: VentaExitosaModalProps) {
  const country = useCountryContext()
  const { get, post } = useApi({ showErrorToast: false, retries: 1, timeoutMs: 15000 })
  const [currentCpeId, setCurrentCpeId] = useState<string | null>(null)
  const [facturacionPendiente, setFacturacionPendiente] = useState(false)
  const [facturando, setFacturando] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [facturacionError, setFacturacionError] = useState<string | null>(null)
  const [cpePrintData, setCpePrintData] = useState<CpePrintData | null>(null)
  const currencySymbol = country.simboloMoneda || 'S/'
  const taxLabel = country.impuesto || 'IGV (18%)'
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const documentoLabel = country.paisCodigo === 'AR'
    ? 'FACTURA'
    : country.paisCodigo !== 'PE'
      ? 'TICKET'
    : ventaData?.tipo_comprobante === '01'
      ? 'FACTURA'
      : ventaData?.tipo_comprobante === '03'
        ? 'BOLETA'
        : 'TICKET'
  const ticketCanjeable = Boolean(
    ventaData?.canjeable || ventaData?.tipo_emision === 'TICKET' || ventaData?.tipo_comprobante === 'TICKET',
  )

  useEffect(() => {
    if (!isOpen || !ventaData) return

    setCurrentCpeId(ventaData.cpe_id || null)
    setFacturacionPendiente(Boolean(!ticketCanjeable && ventaData.facturacion_pendiente && !ventaData.cpe_id))
    setFacturacionError(null)
    setCpePrintData(null)
  }, [isOpen, ticketCanjeable, ventaData])

  const loadCpePrintData = useCallback(async (cpeId: string): Promise<CpePrintData | null> => {
    const result = await get(`/api/cpe/comprobantes/${encodeURIComponent(cpeId)}`)
    const data = result?.data || result
    if (data?.id || data?.serie) {
      setCpePrintData(data)
      return data
    }
    return null
  }, [get])

  useEffect(() => {
    if (!isOpen || !ventaData?.venta_id || ventaData.cpe_id || ticketCanjeable) return

    let cancelled = false
    let attempts = 0
    const ventaId = encodeURIComponent(String(ventaData.venta_id))

    const consultarEstado = async () => {
      attempts += 1
      setCheckingStatus(true)
      const result = await get(`/api/pos/facturacion/${ventaId}`)
      if (cancelled) return

      const data = result?.data || result
      if (data) {
        setCurrentCpeId(data.cpe_id || null)
        setFacturacionPendiente(Boolean(data.cpe_pendiente && !data.cpe_id))
        setFacturacionError(data.error_facturacion || null)
      }
      setCheckingStatus(false)
    }

    consultarEstado()
    const timer = window.setInterval(() => {
      if (cancelled || attempts >= 4) {
        window.clearInterval(timer)
        return
      }
      consultarEstado()
    }, 3500)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [get, isOpen, ticketCanjeable, ventaData])

  useEffect(() => {
    if (!isOpen || !currentCpeId) {
      setCpePrintData(null)
      return
    }

    let cancelled = false
    loadCpePrintData(currentCpeId).then((data) => {
      if (!cancelled && data) setCpePrintData(data)
    }).catch(() => {
      if (!cancelled) setCpePrintData(null)
    })

    return () => {
      cancelled = true
    }
  }, [currentCpeId, isOpen, loadCpePrintData])

  if (!isOpen || !ventaData) return null

  const handleImprimirTicket = async () => {
    let fiscalData = cpePrintData
    if (currentCpeId && !fiscalData) {
      fiscalData = await loadCpePrintData(currentCpeId)
    }

    const printableData = fiscalData
      ? mapCpeToTicketData(fiscalData, ventaData)
      : {
      numero_ticket: ventaData.numero_ticket,
      total: ventaData.total,
      subtotal: ventaData.subtotal,
      impuestos: ventaData.impuestos,
      tipo_comprobante: ventaData.tipo_comprobante,
      cliente_nombre: ventaData.cliente_nombre,
      fecha: ventaData.fecha,
      items: ventaData.items,
      representacion_fiscal: false,
    }

    printTicket(printableData, empresaData, {
      currencySymbol,
      taxLabel,
      documentoFiscal,
      documentoLabel: fiscalData ? getDocumentoLabelFromCpe(fiscalData.tipo_documento) : documentoLabel,
      locale: country.locale,
      fiscalAuthority: country.servicioFiscal,
    })
  }

  const handleVerComprobante = () => {
    window.location.assign(`/dashboard/cpe${currentCpeId ? `?cpe_id=${encodeURIComponent(currentCpeId)}` : ''}`)
  }

  const handleEmitirCpe = async () => {
    if (!ventaData.venta_id || facturando) return

    setFacturando(true)
    setFacturacionError(null)
    const ventaId = encodeURIComponent(String(ventaData.venta_id))
    const result = await post(`/api/pos/reintentar-facturacion/${ventaId}`)
    const data = result?.data || result

    if (data?.success && data?.cpe_id) {
      setCurrentCpeId(data.cpe_id)
      setFacturacionPendiente(false)
      await loadCpePrintData(data.cpe_id).catch(() => null)
    } else {
      setFacturacionPendiente(true)
      setFacturacionError(data?.message || 'No se pudo emitir el CPE en este intento.')
    }
    setFacturando(false)
  }

  const formatMoney = (value: number) => value.toFixed(2)
  const formatCurrency = (value: number) => `${currencySymbol} ${formatMoney(value)}`

  const cpeListo = Boolean(currentCpeId)
  const puedeEmitirCpe = !ticketCanjeable && !cpeListo && Boolean(ventaData.venta_id)

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-cyan-300/20 bg-background text-foreground shadow-[0_28px_80px_rgba(0,0,0,0.55)] dark:bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-cyan-300/15 bg-gradient-to-br from-background via-muted/50 to-cyan-950/70 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-primary">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/80">Venta registrada</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{ventaData.numero_ticket}</h2>
              </div>
            </div>
            <Badge className="border border-cyan-300/20 bg-cyan-400/10 text-primary">
              {ventaData.estado}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-border/70 bg-card/75 p-4">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-3">
              <span className="text-sm text-muted-foreground">Cliente</span>
              <span className="max-w-[250px] text-right text-sm font-semibold text-foreground">
                {ventaData.cliente_nombre || 'Cliente General'}
              </span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">{formatCurrency(ventaData.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{taxLabel}</span>
                <span className="font-medium text-foreground">{formatCurrency(ventaData.impuestos)}</span>
              </div>
              <div className="flex items-end justify-between pt-3">
                <span className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Total</span>
                <span className="text-3xl font-black text-primary">{formatCurrency(ventaData.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-400/10 p-4 text-sm text-primary">
            {cpeListo
              ? <CheckCircle2 className="h-5 w-5 text-primary" />
              : ticketCanjeable
                ? <FileText className="h-5 w-5 text-primary" />
                : <Clock3 className="h-5 w-5 text-primary" />}
            <div>
              <p className="font-semibold">
                {cpeListo
                  ? 'Comprobante electrónico generado'
                  : ticketCanjeable ? 'Ticket interno listo para canje' : 'Comprobante pendiente de emisión fiscal'}
              </p>
              <p className="text-xs text-cyan-100/75">
                {cpeListo
                  ? 'Disponible para revisión fiscal.'
                  : ticketCanjeable
                    ? 'La venta, el cobro y el stock ya quedaron confirmados. El correlativo fiscal se reservará sólo cuando elijas factura o boleta.'
                  : facturacionPendiente || checkingStatus
                    ? 'La venta ya quedó registrada. Puedes emitir/reintentar el CPE ahora o continuar vendiendo mientras el worker fiscal lo procesa.'
                    : 'La venta quedó registrada, pero el estado fiscal debe verificarse antes de cerrar el control diario.'}
              </p>
            </div>
          </div>

          {facturacionError && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-400 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400 dark:text-amber-200" />
              <div>
                <p className="font-semibold">CPE pendiente de atención</p>
                <p className="text-xs text-amber-100/80">{facturacionError}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" onClick={handleImprimirTicket} className="h-12 gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <Printer className="h-4 w-4" />
              {cpeListo ? 'Imprimir CPE' : 'Imprimir ticket'}
            </Button>
            {ticketCanjeable && onCanjearTicket ? (
              <Button
                type="button"
                onClick={() => onCanjearTicket(ventaData)}
                variant="outline"
                className="h-12 gap-2 border-amber-300/30 bg-card text-amber-700 hover:bg-muted dark:text-amber-200"
              >
                <FileText className="h-4 w-4" />
                Canjear ticket
              </Button>
            ) : cpeListo ? (
              <Button
                type="button"
                onClick={handleVerComprobante}
                variant="outline"
                className="h-12 gap-2 border-cyan-300/25 bg-card text-primary hover:bg-muted"
              >
                <Eye className="h-4 w-4" />
                Ver CPE
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleEmitirCpe}
                disabled={!puedeEmitirCpe || facturando || checkingStatus}
                variant="outline"
                className="h-12 gap-2 border-cyan-300/25 bg-card text-primary hover:bg-muted disabled:opacity-45"
              >
                <RefreshCw className={`h-4 w-4 ${facturando ? 'animate-spin' : ''}`} />
                {facturando ? 'Emitiendo' : checkingStatus ? 'Verificando' : 'Emitir CPE'}
              </Button>
            )}
          </div>

          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="h-12 w-full bg-muted text-foreground hover:bg-muted"
          >
            Continuar vendiendo
          </Button>
        </div>
      </div>
    </div>
  )
}

function mapCpeToTicketData(cpeData: CpePrintData, ventaData: NonNullable<VentaExitosaModalProps['ventaData']>) {
  return {
    numero_ticket: formatCpeNumber(cpeData, ventaData.numero_ticket),
    total: Number(cpeData.total_venta ?? ventaData.total ?? 0),
    subtotal: Number(cpeData.total_gravadas ?? ventaData.subtotal ?? 0),
    impuestos: Number(cpeData.total_igv ?? ventaData.impuestos ?? 0),
    tipo_comprobante: cpeData.tipo_documento ?? ventaData.tipo_comprobante,
    cliente_nombre: cpeData.razon_social_receptor || ventaData.cliente_nombre,
    cliente_documento: cpeData.documento_receptor,
    cliente_tipo_documento: cpeData.tipo_documento_receptor,
    fecha: cpeData.fecha_emision || cpeData.created_at || ventaData.fecha,
    hash: cpeData.valor_resumen || cpeData.hash_firma || cpeData.hash,
    hash_firma: cpeData.hash_firma,
    sunat_qr_content: cpeData.sunat_qr_content,
    sunat_qr_data_url: cpeData.sunat_qr_data_url,
    representacion_fiscal: Boolean(cpeData.sunat_qr_data_url),
    cpe_emitido: true,
    estado_sunat: cpeData.sunat_status || cpeData.estado,
    items: Array.isArray(cpeData.items) && cpeData.items.length > 0
      ? cpeData.items.map((item) => {
          const cantidad = Number(item.cantidad ?? 1)
          const precio = Number(item.precio_unitario ?? 0)
          return {
            nombre: item.nombre_producto || item.descripcion || 'Producto',
            cantidad,
            precio,
            subtotal: Number(item.valor_venta ?? item.subtotal ?? multiplicarMoneda(cantidad, precio)),
          }
        })
      : ventaData.items,
  }
}

function formatCpeNumber(cpeData: CpePrintData, fallback: string): string {
  if (!cpeData.serie || cpeData.numero === undefined || cpeData.numero === null) return fallback

  const rawNumber = String(cpeData.numero)
  const parsed = Number.parseInt(rawNumber, 10)
  const formattedNumber = Number.isFinite(parsed)
    ? String(parsed).padStart(8, '0')
    : rawNumber

  return `${cpeData.serie}-${formattedNumber}`
}

function getDocumentoLabelFromCpe(tipoDocumento?: string): string {
  if (tipoDocumento === '01') return 'FACTURA'
  if (tipoDocumento === '03') return 'BOLETA'
  return 'TICKET'
}
