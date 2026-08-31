'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useApi } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'

interface CuentaPorCobrarResumen {
  id: string
  saldo: number
  moneda: string
  serie?: string | null
  numero?: string | null
}

interface NotaCreditoModalProps {
  isOpen: boolean
  cuenta: CuentaPorCobrarResumen | null
  onClose: () => void
  onSuccess: () => void
}

const formatCurrency = (value: number, currency: string = 'PEN') =>
  Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value || 0)

export function NotaCreditoModal({ isOpen, cuenta, onClose, onSuccess }: NotaCreditoModalProps) {
  const { post } = useApi({ showSuccessToast: true })
  const country = useCountryContext()
  const isColombia = country.paisCodigo === 'CO'
  const [monto, setMonto] = useState('')
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().split('T')[0])
  const [serie, setSerie] = useState('')
  const [numero, setNumero] = useState('')
  const [motivo, setMotivo] = useState('Ajuste por nota de crédito')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')
  const [codigoMotivo, setCodigoMotivo] = useState('10')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retryIntent = useRef<{ fingerprint: string; key: string } | null>(null)

  useEffect(() => {
    if (!isOpen || !cuenta) {
      return
    }

    setMonto(String(cuenta.saldo ?? ''))
    setSerie(cuenta.serie ?? '')
    setNumero(cuenta.numero ?? '')
    setCodigoMotivo(isColombia ? '1' : '10')
    setError(null)
  }, [isOpen, cuenta, isColombia])

  const handleClose = () => {
    if (submitting) return
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cuenta) return

    const montoNumber = parseFloat(monto)
    if (Number.isNaN(montoNumber) || montoNumber <= 0) {
      setError('El monto de la nota de crédito debe ser mayor a cero')
      return
    }

    if (montoNumber - (cuenta.saldo ?? 0) > 0.05) {
      setError(
        `El monto no puede superar el saldo pendiente (${formatCurrency(cuenta.saldo ?? 0, cuenta.moneda)})`
      )
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      const basePayload = {
        monto: montoNumber,
        fecha_emision: fechaEmision,
        serie: serie || undefined,
        numero: numero || undefined,
        motivo: motivo || undefined,
        referencia: referencia || undefined,
        notas: notas || undefined,
        codigo_motivo: codigoMotivo,
      }

      const fingerprint = JSON.stringify(basePayload)
      if (!retryIntent.current || retryIntent.current.fingerprint !== fingerprint) {
        retryIntent.current = {
          fingerprint,
          key: `cxc-note-ui:${crypto.randomUUID()}`,
        }
      }
      const payload = { ...basePayload, idempotency_key: retryIntent.current.key }

      const response = await post(`/api/finanzas/cxc/${cuenta.id}/notas-credito`, payload)
      if (response) {
        retryIntent.current = null
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      console.error('Error aplicando nota de crédito', err)
      setError(err?.message ?? 'No se pudo aplicar la nota de crédito')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isColombia ? 'Emitir nota crédito DIAN 91' : 'Aplicar nota de crédito'}</DialogTitle>
          <DialogDescription>
            {isColombia
              ? 'Crea una nota 91 referenciada. La CxC sólo se ajustará después de que la DIAN acepte el documento.'
              : 'Registra una nota de crédito asociada a la cuenta seleccionada.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="nc-monto">Monto</Label>
              <Input
                id="nc-monto"
                type="number"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Saldo actual: {formatCurrency(cuenta?.saldo ?? 0, cuenta?.moneda || 'PEN')}
              </p>
            </div>

            <div>
              <Label htmlFor="nc-fecha">Fecha de emisión</Label>
              <Input
                id="nc-fecha"
                type="date"
                value={fechaEmision}
                onChange={(e) => setFechaEmision(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nc-serie">Serie</Label>
                <Input id="nc-serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="nc-numero">Número</Label>
                <Input id="nc-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </div>
            </div>

            <div>
              <Label htmlFor="nc-codigo-motivo">Código de motivo</Label>
              <select
                id="nc-codigo-motivo"
                value={codigoMotivo}
                onChange={(event) => setCodigoMotivo(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {(isColombia
                  ? [
                      ['1', 'Devolución parcial o no aceptación parcial'],
                      ['2', 'Anulación de factura electrónica'],
                      ['3', 'Rebaja o descuento'],
                      ['4', 'Ajuste de precio'],
                      ['5', 'Otros'],
                    ]
                  : [
                      ['04', 'Descuento global'],
                      ['05', 'Descuento por ítem'],
                      ['08', 'Bonificación'],
                      ['09', 'Disminución en el valor'],
                      ['10', 'Otros conceptos'],
                      ['11', 'Ajuste de exportación'],
                      ['12', 'Ajuste IVAP'],
                      ['13', 'Corrección del monto neto pendiente'],
                    ]
                ).map(([code, label]) => <option key={code} value={code}>{code} - {label}</option>)}
              </select>
            </div>

            <div>
              <Label htmlFor="nc-motivo">Motivo</Label>
              <Input
                id="nc-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo de la nota de crédito"
              />
            </div>

            <div>
              <Label htmlFor="nc-referencia">Referencia</Label>
              <Input
                id="nc-referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Documento o correlativo de nota de crédito"
              />
            </div>

            <div>
              <Label htmlFor="nc-notas">Notas internas</Label>
              <Textarea
                id="nc-notas"
                rows={3}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Procesando...' : isColombia ? 'Crear nota DIAN 91' : 'Aplicar nota de crédito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
