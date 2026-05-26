'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Eye, Printer, RefreshCw } from 'lucide-react'
import { printTicket } from './TicketPrint'
import { useCountryContext } from '@/hooks/use-country-context'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface VentaExitosaModalProps {
  isOpen: boolean
  onClose: () => void
  ventaData: {
    venta_id: string | number
    numero_ticket: string
    total: number
    subtotal: number
    impuestos: number
    tipo_comprobante?: '01' | '03'
    estado: string
    factura_electronica: boolean
    facturacion_pendiente?: boolean
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
  const { get, post } = useApi({ showErrorToast: false, retries: 1, timeoutMs: 15000 })
  const [currentCpeId, setCurrentCpeId] = useState<string | null>(null)
  const [facturacionPendiente, setFacturacionPendiente] = useState(false)
  const [facturando, setFacturando] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [facturacionError, setFacturacionError] = useState<string | null>(null)
  const currencySymbol = country.simboloMoneda || 'S/'
  const taxLabel = country.impuesto || 'IGV (18%)'
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const documentoLabel = country.paisCodigo !== 'PE'
    ? 'TICKET'
    : ventaData?.tipo_comprobante === '01'
      ? 'FACTURA'
      : ventaData?.tipo_comprobante === '03'
        ? 'BOLETA'
        : 'TICKET'

  useEffect(() => {
    if (!isOpen || !ventaData) return

    setCurrentCpeId(ventaData.cpe_id || null)
    setFacturacionPendiente(Boolean(ventaData.facturacion_pendiente && !ventaData.cpe_id))
    setFacturacionError(null)
  }, [isOpen, ventaData])

  useEffect(() => {
    if (!isOpen || !ventaData?.venta_id || ventaData.cpe_id) return

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
  }, [get, isOpen, ventaData])

  if (!isOpen || !ventaData) return null

  const handleImprimirTicket = () => {
    // Imprimir ticket térmico directamente
    printTicket({
      numero_ticket: ventaData.numero_ticket,
      total: ventaData.total,
      subtotal: ventaData.subtotal,
      impuestos: ventaData.impuestos,
      tipo_comprobante: ventaData.tipo_comprobante,
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
    } else {
      setFacturacionPendiente(true)
      setFacturacionError(data?.message || 'No se pudo emitir el CPE en este intento.')
    }
    setFacturando(false)
  }

  const formatMoney = (value: number) => value.toFixed(2)
  const formatCurrency = (value: number) => `${currencySymbol} ${formatMoney(value)}`

  const cpeListo = Boolean(currentCpeId)
  const puedeEmitirCpe = !cpeListo && Boolean(ventaData.venta_id)

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950 text-slate-100 shadow-[0_28px_80px_rgba(0,0,0,0.55)] dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-cyan-300/15 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/70 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200/80">Venta registrada</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{ventaData.numero_ticket}</h2>
              </div>
            </div>
            <Badge className="border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
              {ventaData.estado}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/75 p-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-700/70 pb-3">
              <span className="text-sm text-slate-400">Cliente</span>
              <span className="max-w-[250px] text-right text-sm font-semibold text-slate-100">
                {ventaData.cliente_nombre || 'Cliente General'}
              </span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-medium text-slate-100">{formatCurrency(ventaData.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{taxLabel}</span>
                <span className="font-medium text-slate-100">{formatCurrency(ventaData.impuestos)}</span>
              </div>
              <div className="flex items-end justify-between pt-3">
                <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">Total</span>
                <span className="text-3xl font-black text-cyan-200">{formatCurrency(ventaData.total)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-400/10 p-4 text-sm text-cyan-50">
            {cpeListo ? <CheckCircle2 className="h-5 w-5 text-cyan-200" /> : <Clock3 className="h-5 w-5 text-cyan-200" />}
            <div>
              <p className="font-semibold">
                {cpeListo ? 'Comprobante electrónico generado' : 'Comprobante pendiente de emisión fiscal'}
              </p>
              <p className="text-xs text-cyan-100/75">
                {cpeListo
                  ? 'Disponible para revisión fiscal.'
                  : facturacionPendiente || checkingStatus
                    ? 'La venta ya quedó registrada. Puedes emitir/reintentar el CPE ahora o continuar vendiendo mientras el worker fiscal lo procesa.'
                    : 'La venta quedó registrada, pero el estado fiscal debe verificarse antes de cerrar el control diario.'}
              </p>
            </div>
          </div>

          {facturacionError && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-50">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-200" />
              <div>
                <p className="font-semibold">CPE pendiente de atención</p>
                <p className="text-xs text-amber-100/80">{facturacionError}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" onClick={handleImprimirTicket} className="h-12 gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <Printer className="h-4 w-4" />
              Imprimir ticket
            </Button>
            {cpeListo ? (
              <Button
                type="button"
                onClick={handleVerComprobante}
                variant="outline"
                className="h-12 gap-2 border-cyan-300/25 bg-slate-900 text-cyan-100 hover:bg-slate-800"
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
                className="h-12 gap-2 border-cyan-300/25 bg-slate-900 text-cyan-100 hover:bg-slate-800 disabled:opacity-45"
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
            className="h-12 w-full bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            Continuar vendiendo
          </Button>
        </div>
      </div>
    </div>
  )
}
