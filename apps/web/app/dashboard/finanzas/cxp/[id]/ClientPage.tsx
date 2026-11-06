'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useCxpRead } from '@/hooks/use-cxp-read'
import { readCxpDetail, readCxpPayments } from '@/lib/finanzas/cxp-detail-contract'
import {
  ArrowLeft, FileText, Calendar, DollarSign, Building2,
  Clock, CheckCircle, XCircle, CreditCard, History
} from 'lucide-react'
import { PagoProveedorModal } from '@/components/finanzas'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { usePermission } from '@/hooks/use-permission'
import { parseDateLocal } from '@/lib/date-utils'
import CreditoProveedorPanel from './CreditoProveedorPanel'

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export default function CxpDetallePage() {
  const { currency, locale, formatCurrency: formatLocalizedCurrency, taxIdLabel } = useLocalizedMoney()
  const router = useRouter()
  const params = useParams()
  const { session } = useAuth()
  const { hasPermission: canManageCxp } = usePermission('finanzas', 'gestionar', 'cxp')
  const id = params?.id as string

  const [showPagoModal, setShowPagoModal] = useState(false)
  const tenantId = session?.user?.tenant_id || ''
  const validateDetail = useCallback((response: any) => readCxpDetail(response, id, tenantId), [id, tenantId])
  const detail = useCxpRead(`/api/finanzas/cxp/${id}`, validateDetail, Boolean(id && tenantId))
  const cxp = detail.data
  const validatePayments = useCallback((response: any) => readCxpPayments(response, cxp?.moneda || '', id, tenantId), [cxp?.moneda, id, tenantId])
  const history = useCxpRead(`/api/finanzas/cxp/${id}/pagos`, validatePayments, Boolean(cxp))
  const pagos = history.data || []
  const loading = detail.loading
  const loadingPagos = history.loading
  const pagosError = history.error
  const loadCxp = detail.reload
  const loadPagos = history.reload
  useEffect(() => { setShowPagoModal(false) }, [id, tenantId, session?.user?.id])

  const formatCurrency = (amount: number, moneda: string = currency) => {
    return formatLocalizedCurrency(toNumber(amount), moneda)
  }

  const formatDate = (dateString: string) => {
    const date = parseDateLocal(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString(locale, {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  }

  const handlePagoSuccess = () => {
    loadCxp()
    loadPagos()
  }

  const canApplyPayment = canManageCxp && cxp && history.data !== null && !history.loading && !history.error && cxp.estado !== 'PAGADA' && cxp.estado !== 'ANULADA' && cxp.saldo > 0
  const canReadPaymentContext = canManageCxp && cxp && history.data !== null && !history.loading && !history.error
  useEffect(() => { if (!canReadPaymentContext) setShowPagoModal(false) }, [canReadPaymentContext])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando cuenta por pagar...</p>
        </div>
      </div>
    )
  }

  if (!cxp) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="text-center p-12">
          <XCircle size={48} className="text-red-500" />
          <div role="alert" data-testid="cxp-detail-error">
            <p>{detail.error || 'No se pudo consultar la cuenta por pagar.'}</p>
            {detail.retryable && <button type="button" onClick={() => void loadCxp()} className="mt-2 text-primary underline">Reintentar cuenta</button>}
          </div>
          <button
            onClick={() => router.push('/dashboard/finanzas/cxp')}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 mt-4"
          >
            <ArrowLeft size={16} /> Volver a la lista
          </button>
        </div>
      </div>
    )
  }

  const esNotaFiscal = cxp.metadata?.registro_fiscal_sin_obligacion === true
  const totalPagado = esNotaFiscal ? 0 : pagos.reduce((sum, pago) => sum + Math.round(pago.monto * 100), 0) / 100
  const totalComprobante = toNumber(cxp.original_fiscal_amounts?.total ?? cxp.total)

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/finanzas/cxp')} className="p-2 rounded-lg border bg-card cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">{esNotaFiscal ? 'Nota de crédito recibida' : 'Cuenta por Pagar'}</h1>
            <p className="mt-2 text-base text-muted-foreground">{cxp.numero_documento}</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadCxp()} className="text-primary underline">Actualizar cuenta</button>
        {canApplyPayment && (
          <button
            onClick={() => setShowPagoModal(true)} className="py-3 px-6 rounded-lg border-0 bg-[#10b981] text-white cursor-pointer text-[0.875rem] font-semibold flex items-center gap-2 transition shadow"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#059669'
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#10b981'
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.2)'
            }}
          >
            <DollarSign size={18} />
            Aplicar Pago
          </button>
        )}
      </div>

      {esNotaFiscal && (
        <div className="mb-6 rounded-xl border border-blue-300/30 bg-blue-300/10 p-4">
          <p>{cxp.metadata?.devolucion_proveedor_id ? 'Esta nota sustenta la devolución ya aplicada.' : 'Esta nota ajustó la compra y su deuda. La parte que ya estaba pagada se registra como crédito disponible.'} No crea otra deuda ni representa un pago al proveedor.</p>
          {cxp.metadata?.ajustes_fiscales_preservados && Object.values(cxp.metadata.ajustes_fiscales_preservados).some((value) => Number(value) > 0) && <p className="mt-2 text-sm">Los impuestos retenidos, percibidos o depositados permanecen registrados. Esta nota no representa una devolución de SUNAT ni cancela esos comprobantes.</p>}
          <div className="mt-3 flex flex-wrap gap-4">
            <button className="text-primary underline" onClick={() => router.push(`/dashboard/finanzas/cxp/${cxp.metadata.factura_proveedor_id}`)}>Ver comprobante original</button>
            {cxp.metadata?.devolucion_proveedor_id && <button className="text-primary underline" onClick={() => router.push(`/dashboard/compras/devoluciones/${cxp.metadata.devolucion_proveedor_id}`)}>Ver devolución</button>}
          </div>
        </div>
      )}
      {cxp.metadata?.source === 'SUPPLIER_CREDIT_NC_570' && <CreditoProveedorPanel nota={cxp} onUpdated={() => { void loadCxp(); void loadPagos() }} />}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>TOTAL</h3>
            <FileText className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-blue-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-2xl">
            {formatCurrency(totalComprobante, cxp.moneda)}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">{esNotaFiscal ? 'Importe de la nota recibida' : 'Importe del comprobante original'}</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>{esNotaFiscal ? 'PAGOS REALIZADOS' : 'PAGADO'}</h3>
            <CheckCircle className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-[#10b981]" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-2xl text-[#10b981]">
            {loadingPagos ? 'Consultando…' : pagosError ? 'No disponible' : formatCurrency(totalPagado, cxp.moneda)}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">
            {pagosError ? 'No se pudo consultar los pagos' : loadingPagos ? 'Cargando pagos confirmados' : esNotaFiscal ? 'Nota recibida sin pago al proveedor' : totalPagado > 0 ? 'Pagos confirmados en banco o caja' : 'Sin pagos'}
          </div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>SALDO</h3>
            <DollarSign className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-2xl">
            {formatCurrency(cxp.saldo, cxp.moneda)}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Por pagar</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>VENCIMIENTO</h3>
            <Calendar className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-amber-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-[1.125rem]">
            {formatDate(cxp.fecha_vencimiento)}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Fecha límite</div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,_minmax(400px,_1fr))] gap-6">
        <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
          <h3 className="text-[1.125rem] font-semibold mb-4 flex items-center gap-2">
            <FileText size={20} />
            Información del Documento
          </h3>
          <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
            <div className="grid gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Número de Documento
                </div>
                <div className="text-base font-semibold">
                  {cxp.numero_documento}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Tipo de Documento
                </div>
                <div className="text-[0.875rem] font-medium">
                  {cxp.tipo_documento}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1fr] gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Fecha de Emisión
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {formatDate(cxp.fecha_emision)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Fecha de Vencimiento
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {formatDate(cxp.fecha_vencimiento)}
                  </div>
                </div>
              </div>

              {cxp.condiciones_pago && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Condiciones de Pago
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {cxp.condiciones_pago}
                    {Number(cxp.dias_credito) > 0 && ` (${cxp.dias_credito} días)`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {cxp.proveedor && (
          <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
            <h3 className="text-[1.125rem] font-semibold mb-4 flex items-center gap-2">
              <Building2 size={20} />
              Proveedor
            </h3>
            <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
              <div className="grid gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Razón Social
                  </div>
                  <div className="text-base font-semibold">
                    {cxp.proveedor.razon_social}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {taxIdLabel}
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {cxp.proveedor.ruc}
                  </div>
                </div>

                {cxp.proveedor.email && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Email
                    </div>
                    <div className="text-[0.875rem] font-medium">
                      {cxp.proveedor.email}
                    </div>
                  </div>
                )}

                {cxp.proveedor.telefono && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Teléfono
                    </div>
                    <div className="text-[0.875rem] font-medium">
                      {cxp.proveedor.telefono}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl mt-6">
        <h3 className="text-[1.125rem] font-semibold mb-4 flex items-center gap-2">
          <History size={20} />
          Historial de Pagos
        </h3>
        <button type="button" onClick={() => void loadPagos()} disabled={loadingPagos} className="mb-4 text-primary underline disabled:opacity-50">Actualizar historial</button>
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          {loadingPagos ? (
            <div className="text-center p-8 text-muted-foreground">
              <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
              <p>Cargando historial de pagos...</p>
            </div>
          ) : pagosError ? (
            <div role="alert" className="p-6 text-red-500">
              <p>{pagosError}</p>
              {history.retryable && <button type="button" onClick={() => void loadPagos()} className="mt-2 text-primary underline">Reintentar historial</button>}
            </div>
          ) : pagos.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              <CreditCard size={48} className="text-muted-foreground" />
              <p>No hay pagos registrados para esta cuenta</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-[100%]">
                <thead>
                  <tr>
                    <th className="text-left p-3 font-semibold text-xs text-muted-foreground">
                      Fecha
                    </th>
                    <th className="text-left p-3 font-semibold text-xs text-muted-foreground">
                      Cuenta Bancaria
                    </th>
                    <th className="text-left p-3 font-semibold text-xs text-muted-foreground">
                      Referencia
                    </th>
                    <th className="text-left p-3 font-semibold text-xs text-muted-foreground">
                      Método
                    </th>
                    <th className="text-center p-3 font-semibold text-xs text-muted-foreground">
                      Conciliación
                    </th>
                    <th className="text-right p-3 font-semibold text-xs text-muted-foreground">
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((pago: any) => (
                    <tr key={pago.id} className="border-b">
                      <td className="p-3 text-[0.875rem]">
                        {formatDate(pago.fecha)}
                      </td>
                      <td className="p-3 text-[0.875rem]">
                        {pago.cuenta_bancaria ? (
                          <div>
                            <div className="font-medium">{pago.cuenta_bancaria.banco}</div>
                            <div className="text-xs text-muted-foreground">
                              {pago.cuenta_bancaria.numero_cuenta}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-[0.875rem]">
                        {pago.referencia || '-'}
                      </td>
                      <td className="p-3 text-[0.875rem]">
                        <span className="py-1 px-2 rounded-[4px] text-xs font-medium bg-[#e0f2fe] text-[#0369a1]">
                          {pago.metodo_pago || 'N/A'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {pago.conciliado ? (
                          <span className="inline-flex items-center gap-1 py-1 px-2 rounded-[4px] text-xs font-medium bg-[#dcfce7] text-emerald-400">
                            <CheckCircle size={12} />
                            Conciliado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 py-1 px-2 rounded-[4px] text-xs font-medium bg-[#fef3c7] text-[#92400e]">
                            <Clock size={12} />
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right text-[0.875rem] font-bold text-[#10b981]">
                        {formatCurrency(pago.monto, cxp.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[rgba(16,_185,_129,_0.05)]">
                    <td colSpan={5} className="p-3 text-[0.875rem] font-semibold">
                      Total Pagado
                    </td>
                    <td className="p-3 text-right text-base font-bold text-[#10b981]">
                      {formatCurrency(totalPagado, cxp.moneda)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Pago Modal */}
      {canReadPaymentContext && (
        <PagoProveedorModal
          isOpen={showPagoModal}
          onClose={() => setShowPagoModal(false)}
          cxpId={cxp.id}
          cxpNumero={cxp.numero_documento}
          saldoPendiente={cxp.saldo}
          moneda={cxp.moneda}
          proveedorId={cxp.proveedor_id}
          total={cxp.total}
          canApply={Boolean(canApplyPayment)}
          onPagoSuccess={handlePagoSuccess}
        />
      )}
    </div>
  )
}

