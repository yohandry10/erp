'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCountryContext } from '@/hooks/use-country-context'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'

interface PagoCxc {
  id: string
  fecha_pago: string
  monto: number
  moneda?: string
  metodo_pago?: string
  tipo?: string
  referencia?: string
  notas?: string
  created_at?: string
}

interface HistorialCuentaPorCobrar {
  serie?: string | null
  numero?: string | null
  moneda?: string | null
  monto_total?: number | null
  monto_pendiente?: number | null
  pagos?: PagoCxc[]
}

interface HistorialDrawerProps {
  isOpen: boolean
  onClose: () => void
  detalle: HistorialCuentaPorCobrar | null
}

const formatCurrency = (value: number, currency: string = 'PEN') =>
  Intl.NumberFormat('es-PE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value || 0)

const humanizeDate = (date?: string | null) => {
  if (!date) return '—'
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })
  } catch {
    return date
  }
}

export function HistorialDrawer({ isOpen, onClose, detalle }: HistorialDrawerProps) {
  const country = useCountryContext()
  const pagosOrdenados = (detalle?.pagos || []).slice().sort((a, b) => {
    return new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime()
  })

  const tituloDocumento = formatFiscalDocumentNumber(country.paisCodigo, detalle?.serie, detalle?.numero)
  const isLoading = !detalle

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Historial de cobranza</DialogTitle>
          <DialogDescription>
            Pagos y movimientos aplicados a la cuenta {tituloDocumento || 'seleccionada'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {isLoading ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Cargando historial...
            </div>
          ) : (
            <>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap gap-4">
              <div>
                <span className="text-muted-foreground">Saldo pendiente:</span>{' '}
                <span className="font-semibold">{formatCurrency(detalle?.monto_pendiente ?? 0, detalle?.moneda || 'PEN')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Importe original:</span>{' '}
                <span>{formatCurrency(detalle?.monto_total ?? 0, detalle?.moneda || 'PEN')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cobros registrados:</span>{' '}
                <span>{pagosOrdenados.length}</span>
              </div>
            </div>
          </div>

          {pagosOrdenados.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aún no se registran cobros ni notas de crédito para esta cuenta.
            </div>
          ) : (
            <div className="space-y-3">
              {pagosOrdenados.map((pago) => (
                <div key={pago.id} className="rounded-md border bg-background p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {formatCurrency(pago.monto, pago.moneda || detalle?.moneda || 'PEN')}
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        {pago.tipo || pago.metodo_pago || 'Pago'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{pago.fecha_pago}</div>
                      <div>{humanizeDate(pago.created_at || pago.fecha_pago)}</div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
                    <div>
                      <span className="font-medium text-foreground">Medio:</span>{' '}
                      {pago.metodo_pago || '—'}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Referencia:</span>{' '}
                      {pago.referencia || '—'}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Notas:</span>{' '}
                      {pago.notas || '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
