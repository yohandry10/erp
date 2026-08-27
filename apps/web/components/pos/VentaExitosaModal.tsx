'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileText, Printer, RefreshCw } from 'lucide-react'
import {
  PosDocumentPreview,
  PosDocumentData,
  printPosDocument,
} from './PosDocumentPreview'
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
    codigo?: string
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
  // Cliente aparte sólo para emitir el comprobante. `useApi` convierte un
  // `success: false` del API en excepción y, sin `throwOnError`, la traga y
  // devuelve null: el motivo se pierde por el camino y el cajero se queda con
  // «no se pudo emitir», que no le dice si es el certificado, la conexión o el
  // correlativo. Con esto llega el motivo real.
  const { post: postEmision } = useApi({
    showErrorToast: false,
    retries: 1,
    timeoutMs: 15000,
    throwOnError: true,
  })
  const [currentCpeId, setCurrentCpeId] = useState<string | null>(null)
  const [facturacionPendiente, setFacturacionPendiente] = useState(false)
  const [facturando, setFacturando] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [facturacionError, setFacturacionError] = useState<string | null>(null)
  const [cpePrintData, setCpePrintData] = useState<CpePrintData | null>(null)
  const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false)
  const documentoRef = useRef<HTMLDivElement | null>(null)
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

  /**
   * El comprobante que se va a imprimir, ya sea el CPE emitido o el ticket
   * interno de la venta.
   */
  const documentoImprimible: PosDocumentData | null = useMemo(() => {
    if (!ventaData) return null
    const cpe = cpePrintData

    if (cpe) {
      return {
        numero: [cpe.serie, cpe.numero].filter(Boolean).join('-') || ventaData.numero_ticket,
        tipo: getDocumentoLabelFromCpe(cpe.tipo_documento),
        fecha: cpe.fecha_emision || cpe.created_at || ventaData.fecha,
        clienteNombre: cpe.razon_social_receptor || ventaData.cliente_nombre,
        clienteDocumento: cpe.documento_receptor || ventaData.cliente_documento,
        subtotal: Number(cpe.total_gravadas ?? ventaData.subtotal) || 0,
        descuentos: 0,
        impuestos: Number(cpe.total_igv ?? ventaData.impuestos) || 0,
        total: Number(cpe.total_venta ?? ventaData.total) || 0,
        items: (cpe.items || []).map((item, indice) => ({
          id: indice,
          descripcion: item.nombre_producto || item.descripcion || 'Producto',
          cantidad: Number(item.cantidad) || 0,
          precioUnitario: Number(item.precio_unitario) || 0,
          total: Number(item.subtotal ?? item.valor_venta) || 0,
        })),
      }
    }

    return {
      numero: ventaData.numero_ticket,
      tipo: documentoLabel,
      fecha: ventaData.fecha,
      clienteNombre: ventaData.cliente_nombre,
      clienteDocumento: ventaData.cliente_documento,
      subtotal: Number(ventaData.subtotal) || 0,
      descuentos: 0,
      impuestos: Number(ventaData.impuestos) || 0,
      total: Number(ventaData.total) || 0,
      items: (ventaData.items || []).map((item, indice) => ({
        id: indice,
        codigo: item.codigo,
        descripcion: item.nombre,
        cantidad: Number(item.cantidad) || 0,
        precioUnitario: Number(item.precio) || 0,
        total: Number(item.subtotal) || 0,
      })),
    }
  }, [ventaData, cpePrintData, documentoLabel])

  if (!isOpen || !ventaData) return null

  /**
   * Antes esto abria una ventana emergente y lanzaba `print()` encima. Si el
   * navegador bloqueaba la emergente --lo hace en modo quiosco y en muchas
   * politicas de empresa--, el unico aviso era un `alert()`, que en pantalla
   * completa a menudo ni aparece: el cajero pulsaba y no pasaba nada.
   *
   * Ahora se muestra el mismo comprobante que ya se ve antes de cobrar, dentro
   * de la aplicacion, y se imprime con `printPosDocument`, que usa un iframe
   * oculto. Sin emergentes que bloquear y con el ticket a la vista antes de
   * gastar papel.
   */
  const handleImprimirTicket = async () => {
    if (currentCpeId && !cpePrintData) {
      await loadCpePrintData(currentCpeId).catch(() => null)
    }
    setVistaPreviaAbierta(true)
  }

  const handleVerComprobante = () => {
    window.location.assign(`/dashboard/cpe${currentCpeId ? `?cpe_id=${encodeURIComponent(currentCpeId)}` : ''}`)
  }

  const handleEmitirCpe = async () => {
    if (!ventaData.venta_id || facturando) return

    setFacturando(true)
    setFacturacionError(null)
    const ventaId = encodeURIComponent(String(ventaData.venta_id))
    try {
      const result = await postEmision(`/api/pos/reintentar-facturacion/${ventaId}`)
      const data = result?.data || result

      if (data?.success && data?.cpe_id) {
        setCurrentCpeId(data.cpe_id)
        setFacturacionPendiente(false)
        await loadCpePrintData(data.cpe_id).catch(() => null)
      } else {
        setFacturacionPendiente(true)
        setFacturacionError(data?.message || 'No se pudo emitir el CPE en este intento.')
      }
    } catch (error) {
      setFacturacionPendiente(true)
      setFacturacionError(
        error instanceof Error && error.message
          ? error.message
          : 'No se pudo emitir el CPE en este intento.',
      )
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

      {vistaPreviaAbierta && documentoImprimible && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[94vh] w-[560px] max-w-[96vw] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Vista previa de impresión</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Ticket térmico · papel de 80 mm</p>
              </div>
              <button
                type="button"
                onClick={() => setVistaPreviaAbierta(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-xl leading-none text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Cerrar vista previa"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto bg-slate-200 p-5 dark:bg-slate-950/80">
              <div ref={documentoRef}>
                <PosDocumentPreview
                  data={documentoImprimible}
                  company={{
                    nombre: empresaData?.nombre || '',
                    ruc: empresaData?.ruc || '',
                    direccion: empresaData?.direccion,
                    logoUrl: empresaData?.logo_url,
                  }}
                  format="thermal"
                  currencySymbol={currencySymbol}
                  taxLabel={taxLabel}
                  taxIdLabel={documentoFiscal}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t bg-card px-5 py-4">
              <button
                type="button"
                onClick={() => setVistaPreviaAbierta(false)}
                className="rounded-lg border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-accent"
              >
                Cerrar
              </button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => printPosDocument(
                  documentoRef.current?.querySelector('[data-pos-print-document]') as HTMLElement | null,
                  `${documentoImprimible.tipo} ${documentoImprimible.numero}`,
                  'thermal',
                )}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Imprimir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function getDocumentoLabelFromCpe(tipoDocumento?: string): string {
  if (tipoDocumento === '01') return 'FACTURA'
  if (tipoDocumento === '03') return 'BOLETA'
  return 'TICKET'
}
