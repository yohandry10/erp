'use client'

'use client'

import { useEffect, useState } from 'react'
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
  const [monto, setMonto] = useState('')
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().split('T')[0])
  const [serie, setSerie] = useState('')
  const [numero, setNumero] = useState('')
  const [motivo, setMotivo] = useState('Ajuste por nota de crédito')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !cuenta) {
      return
    }

    setMonto(String(cuenta.saldo ?? ''))
    setSerie(cuenta.serie ?? '')
    setNumero(cuenta.numero ?? '')
    setError(null)
  }, [isOpen, cuenta])

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
      const generateIdempotencyKey = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID()
        }
        return `cxc-nota-credito-${Date.now()}`
      }

      const payload = {
        monto: montoNumber,
        fecha_emision: fechaEmision,
        serie: serie || undefined,
        numero: numero || undefined,
        motivo: motivo || undefined,
        referencia: referencia || undefined,
        notas: notas || undefined,
        idempotency_key: generateIdempotencyKey(),
      }

      const response = await post(`/api/finanzas/cxc/${cuenta.id}/notas-credito`, payload)
      if (response) {
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
          <DialogTitle>Aplicar nota de crédito</DialogTitle>
          <DialogDescription>
            Registra una nota de crédito asociada a la cuenta seleccionada.
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
              {submitting ? 'Aplicando...' : 'Aplicar nota de crédito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
