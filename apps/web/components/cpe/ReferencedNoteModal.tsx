'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { apiSucceeded, unwrapApiArray, unwrapApiObject } from '@/lib/api-contract'
import { Button } from '@/components/ui/button'

type NoteType = '07' | '08'

interface Origin {
  id: string
  tipo_documento: 'FACTURA' | 'BOLETA'
  serie: string
  numero: string
  receptor_razon_social?: string
  receptor_nombre?: string
  moneda: string
  total: number
  cpe: {
    id: string
    estado: string
  }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const CREDIT_REASONS = [
  ['04', 'Descuento global'],
  ['05', 'Descuento por ítem'],
  ['08', 'Bonificación'],
  ['09', 'Disminución en el valor'],
  ['10', 'Otros conceptos'],
  ['11', 'Ajustes de operaciones de exportación'],
  ['12', 'Ajustes afectos al IVAP'],
  ['13', 'Corrección del monto neto pendiente de pago'],
] as const

const DEBIT_REASONS = [
  ['01', 'Intereses por mora'],
  ['02', 'Aumento en el valor'],
  ['03', 'Penalidades u otros conceptos'],
] as const

export function ReferencedNoteModal({ isOpen, onClose, onSuccess }: Props) {
  const { get: apiGet, post: apiPost } = useApiCall({
    throwOnError: true,
    showSuccessToast: false,
  })
  const [origins, setOrigins] = useState<Origin[]>([])
  const [loadingOrigins, setLoadingOrigins] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [type, setType] = useState<NoteType>('07')
  const [originId, setOriginId] = useState('')
  const [reason, setReason] = useState('04')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const retryIntent = useRef<{ fingerprint: string; key: string } | null>(null)

  const reasons = type === '07' ? CREDIT_REASONS : DEBIT_REASONS
  const selected = origins.find((origin) => origin.id === originId)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setLoadingOrigins(true)
    apiGet('/api/cpe/notas-referenciadas/origenes')
      .then((response) => {
        if (!active) return
        const next = unwrapApiArray<Origin>(response)
        setOrigins(next)
        if (next.length > 0) setOriginId((current) => current || next[0].id)
      })
      .catch(() => {
        if (!active) return
        setOrigins([])
        setOriginId('')
      })
      .finally(() => active && setLoadingOrigins(false))
    return () => { active = false }
  }, [apiGet, isOpen])

  useEffect(() => {
    setReason(type === '07' ? '04' : '01')
  }, [type])

  const payload = useMemo(() => ({
    documento_origen_id: originId,
    tipo_documento: type,
    codigo_motivo: reason,
    motivo: description.trim(),
    monto_total: Number(amount),
  }), [amount, description, originId, reason, type])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || !Number.isFinite(payload.monto_total) || payload.monto_total <= 0) return
    if (type === '07' && payload.monto_total - Number(selected.total) > 0.01) {
      alert('La nota de crédito no puede superar el total del comprobante origen.')
      return
    }
    const fingerprint = JSON.stringify(payload)
    if (!retryIntent.current || retryIntent.current.fingerprint !== fingerprint) {
      retryIntent.current = {
        fingerprint,
        key: `note-ui:${crypto.randomUUID()}`,
      }
    }
    setSubmitting(true)
    try {
      const response = await apiPost('/api/cpe/notas-referenciadas', payload, {
        headers: { 'Idempotency-Key': retryIntent.current.key },
      })
      if (!apiSucceeded(response)) return
      const result = unwrapApiObject<any>(response, {})
      retryIntent.current = null
      alert(
        `${type === '07' ? 'Nota de crédito' : 'Nota de débito'} ${result.serie ?? ''}-${result.numero ?? ''} creada. ` +
        'El efecto financiero ya quedó registrado; firme y envíe cuando el cliente configure su certificado.',
      )
      onSuccess()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-cyan-400/20 bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-foreground">Nueva nota referenciada</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajusta una factura o boleta sin mover inventario. Para devoluciones físicas use RMA.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-muted-foreground" aria-label="Cerrar">×</button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              Tipo
              <select
                value={type}
                onChange={(event) => setType(event.target.value as NoteType)}
                className="w-full rounded-lg border bg-background p-3"
                data-testid="referenced-note-type"
              >
                <option value="07">Nota de crédito (07)</option>
                <option value="08">Nota de débito (08)</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              Motivo
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-lg border bg-background p-3"
              >
                {reasons.map(([code, label]) => <option key={code} value={code}>{code} - {label}</option>)}
              </select>
            </label>
          </div>

          <label className="block space-y-2 text-sm font-semibold text-foreground">
            Comprobante afectado
            <select
              required
              value={originId}
              onChange={(event) => setOriginId(event.target.value)}
              disabled={loadingOrigins}
              className="w-full rounded-lg border bg-background p-3"
              data-testid="referenced-note-origin"
            >
              {origins.map((origin) => (
                <option key={origin.id} value={origin.id}>
                  {origin.serie}-{origin.numero} · {origin.receptor_razon_social || origin.receptor_nombre || 'Cliente'} · {origin.moneda} {Number(origin.total).toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2 text-sm font-semibold text-foreground">
            Sustento
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-24 w-full rounded-lg border bg-background p-3"
              placeholder="Explique el ajuste comercial"
            />
          </label>

          <label className="block space-y-2 text-sm font-semibold text-foreground">
            Importe total ({selected?.moneda ?? 'PEN'})
            <input
              required
              type="number"
              min="0.01"
              max={type === '07' ? selected?.total : undefined}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-lg border bg-background p-3"
              data-testid="referenced-note-amount"
            />
          </label>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-foreground/80">
            La creación confirma documento, CxC o saldo a favor y asiento por outbox. No exige certificado. La firma y transmisión fiscal son pasos posteriores.
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting || !originId || loadingOrigins} data-testid="create-referenced-note">
              {submitting ? 'Creando…' : 'Crear nota'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
