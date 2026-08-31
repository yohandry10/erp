'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { apiSucceeded, unwrapApiArray, unwrapApiObject } from '@/lib/api-contract'
import { Button } from '@/components/ui/button'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'

type NoteType = '07' | '08' | '91' | '92'

interface OriginLine {
  id: string
  orden: number
  codigo_producto?: string
  descripcion: string
  unidad_medida?: string
  afectacion_igv?: string | null
  cantidad: number
  base: number
  impuesto: number
  total: number
  saldo_cantidad: number
  saldo_base: number
  saldo_impuesto: number
  saldo_total: number
}

interface Origin {
  id: string
  tipo_documento: 'FACTURA' | 'BOLETA'
  serie?: string
  numero: string
  receptor_razon_social?: string
  receptor_nombre?: string
  moneda: string
  total: number
  saldo_total?: number
  lineas?: OriginLine[]
  cpe: {
    id: string
    estado: string
  }
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  countryCode: 'PE' | 'CO'
}

interface LineDraft {
  selected: boolean
  cantidad: string
  base: string
  impuesto: string
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

const DIAN_CREDIT_REASONS = [
  ['1', 'Devolución parcial de bienes o no aceptación parcial del servicio'],
  ['2', 'Anulación de factura electrónica'],
  ['3', 'Rebaja o descuento parcial o total'],
  ['4', 'Ajuste de precio'],
  ['5', 'Otros (no disponible sin representación fiscal exacta)'],
] as const

const DIAN_DEBIT_REASONS = [
  ['1', 'Intereses'],
  ['2', 'Gastos por cobrar'],
  ['3', 'Cambio del valor'],
  ['4', 'Otros'],
] as const

export function ReferencedNoteModal({ isOpen, onClose, onSuccess, countryCode }: Props) {
  const { get: apiGet, post: apiPost } = useApiCall({
    throwOnError: true,
    showSuccessToast: false,
  })
  const [origins, setOrigins] = useState<Origin[]>([])
  const [loadingOrigins, setLoadingOrigins] = useState(false)
  const [originError, setOriginError] = useState<string | null>(null)
  const [originReload, setOriginReload] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const isColombia = countryCode === 'CO'
  const creditType: NoteType = isColombia ? '91' : '07'
  const debitType: NoteType = isColombia ? '92' : '08'
  const [type, setType] = useState<NoteType>(creditType)
  const [originId, setOriginId] = useState('')
  const [reason, setReason] = useState(isColombia ? '1' : '04')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({})
  const [confirmGlobalProration, setConfirmGlobalProration] = useState(false)
  const retryIntent = useRef<{ fingerprint: string; key: string } | null>(null)

  const isCredit = type === creditType
  const reasons = isColombia
    ? isCredit ? DIAN_CREDIT_REASONS : DIAN_DEBIT_REASONS
    : isCredit ? CREDIT_REASONS : DEBIT_REASONS
  const selected = origins.find((origin) => origin.id === originId)
  const requiresLines = isColombia && (
    (isCredit && ['1', '4'].includes(reason))
    || (!isCredit && ['1', '2', '4'].includes(reason))
  )
  const usesGlobalProration = isColombia && reason === '3'
  const isFullCancellation = isColombia && isCredit && reason === '2'
  const unsupportedReason = isColombia && isCredit && reason === '5'
  const payloadLines = (selected?.lineas ?? [])
    .filter((line) => lineDrafts[line.id]?.selected)
    .map((line) => {
      const draft = lineDrafts[line.id]
      const base = Number(draft.base)
      const impuesto = Number(draft.impuesto)
      return {
        source_document_line_id: line.id,
        cantidad: Number(draft.cantidad),
        base,
        impuesto,
        total: Number((base + impuesto).toFixed(2)),
      }
    })
  const hasInvalidPayloadLine = payloadLines.some((line) => (
    !Number.isFinite(line.cantidad) || line.cantidad <= 0
    || !Number.isFinite(line.base) || line.base <= 0
    || !Number.isFinite(line.impuesto) || line.impuesto < 0
    || !Number.isFinite(line.total) || line.total <= 0
    || Math.abs(line.total - line.base - line.impuesto) > 0.01
  ))
  const lineAmount = Number(payloadLines.reduce((sum, line) => sum + line.total, 0).toFixed(2))
  const cancellationBalance = Number(selected?.saldo_total ?? selected?.total ?? 0)
  const effectiveAmount = requiresLines
    ? lineAmount
    : isFullCancellation ? cancellationBalance : Number(amount)
  const formDisabled = loadingOrigins || origins.length === 0
  const defaultCurrency = isColombia ? 'COP' : 'PEN'

  useEffect(() => {
    setType(creditType)
    setReason(isColombia ? '1' : '04')
  }, [creditType, isColombia])

  useEffect(() => {
    if (!isOpen) return
    let active = true
    setOrigins([])
    setOriginId('')
    setOriginError(null)
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
        setOriginError(
          isColombia
            ? 'No se pudieron cargar las facturas aceptadas por DIAN. El formulario permanece bloqueado; reintenta la consulta.'
            : 'No se pudieron cargar los comprobantes fiscalmente aceptados. El formulario permanece bloqueado; reintenta la consulta.',
        )
      })
      .finally(() => active && setLoadingOrigins(false))
    return () => { active = false }
  }, [apiGet, isColombia, isOpen, originReload])

  useEffect(() => {
    setReason(isColombia ? '1' : isCredit ? '04' : '01')
  }, [isColombia, isCredit, type])

  useEffect(() => {
    setLineDrafts({})
    setConfirmGlobalProration(false)
  }, [originId, reason, type])

  useEffect(() => {
    if (isFullCancellation && selected) {
      setAmount(String(cancellationBalance))
    }
  }, [cancellationBalance, isFullCancellation, selected])

  const toggleLine = (line: OriginLine, checked: boolean) => {
    const credit = isCredit
    setLineDrafts((current) => ({
      ...current,
      [line.id]: checked
        ? {
            selected: true,
            cantidad: String(credit ? line.saldo_cantidad : line.cantidad),
            base: String(credit ? line.saldo_base : line.base),
            impuesto: String(credit ? line.saldo_impuesto : line.impuesto),
          }
        : { selected: false, cantidad: '', base: '', impuesto: '' },
    }))
  }

  const updateLine = (lineId: string, field: keyof Omit<LineDraft, 'selected'>, value: string) => {
    setLineDrafts((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ?? { selected: true, cantidad: '', base: '', impuesto: '' }),
        selected: true,
        [field]: value,
      },
    }))
  }

  const payload = useMemo(() => ({
    documento_origen_id: originId,
    tipo_documento: type,
    codigo_motivo: reason,
    motivo: description.trim(),
    monto_total: effectiveAmount,
    ...(isColombia ? {
      lineas: requiresLines ? payloadLines : [],
      prorrateo_global: usesGlobalProration && confirmGlobalProration,
    } : {}),
  }), [
    confirmGlobalProration, description, effectiveAmount, isColombia, originId,
    payloadLines, reason, requiresLines, type, usesGlobalProration,
  ])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (unsupportedReason) return
    if (requiresLines && payloadLines.length === 0) return
    if (hasInvalidPayloadLine) return
    if (usesGlobalProration && !confirmGlobalProration) return
    if (!selected || !Number.isFinite(payload.monto_total) || payload.monto_total <= 0) return
    if (isCredit && payload.monto_total - cancellationBalance > 0.01) {
      alert('La nota de crédito no puede superar el saldo fiscal restante del comprobante origen.')
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
      const resultNumber = formatFiscalDocumentNumber(
        countryCode,
        result.serie,
        result.numero,
      )
      alert(
        `${isCredit ? 'Nota de crédito' : 'Nota de débito'} ${resultNumber} creada. ` +
        `Quedó fiscalmente pendiente y sin afectar CxC, saldo a favor ni contabilidad. El efecto se aplicará sólo si ${isColombia ? 'DIAN devuelve una aceptación correlacionada' : 'SUNAT/OSE acepta la nota con CDR'}.`,
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
            <h2 className="text-2xl font-black text-foreground">
              {isColombia ? 'Nueva nota DIAN referenciada' : 'Nueva nota referenciada'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajusta una {isColombia ? 'factura electrónica' : 'factura o boleta'} sin mover inventario. Para devoluciones físicas use RMA.
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
                disabled={formDisabled}
                className="w-full rounded-lg border bg-background p-3"
                data-testid="referenced-note-type"
              >
                <option value={creditType}>Nota de crédito ({creditType})</option>
                <option value={debitType}>Nota de débito ({debitType})</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              Motivo
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={formDisabled}
                className="w-full rounded-lg border bg-background p-3"
                data-testid="referenced-note-reason"
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
              disabled={formDisabled}
              className="w-full rounded-lg border bg-background p-3"
              data-testid="referenced-note-origin"
            >
              {origins.length === 0 && (
                <option value="">
                  {loadingOrigins ? 'Buscando comprobantes aceptados…' : 'No hay comprobantes fiscales aceptados'}
                </option>
              )}
              {origins.map((origin) => (
                <option key={origin.id} value={origin.id}>
                  {formatFiscalDocumentNumber(countryCode, origin.serie, origin.numero)} · {origin.receptor_razon_social || origin.receptor_nombre || 'Cliente'} · {origin.moneda || defaultCurrency} {Number(origin.total).toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          {!loadingOrigins && originError && (
            <div
              role="alert"
              data-testid="referenced-note-origin-error"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-foreground/80"
            >
              <span>{originError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOriginReload((current) => current + 1)}
              >
                Reintentar
              </Button>
            </div>
          )}

          {!loadingOrigins && !originError && origins.length === 0 && (
            <div
              role="status"
              data-testid="referenced-note-empty-state"
              className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-foreground/80"
            >
              {isColombia
                ? 'Para emitir NC/ND DIAN necesitas una factura electrónica aceptada por DIAN del mismo contribuyente; la demo no fabrica aceptación fiscal.'
                : 'No hay facturas o boletas fiscalmente aceptadas disponibles para emitir una nota.'}
            </div>
          )}

          <label className="block space-y-2 text-sm font-semibold text-foreground">
            Sustento
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={formDisabled}
              className="min-h-24 w-full rounded-lg border bg-background p-3"
              placeholder="Explique el ajuste comercial"
            />
          </label>

          {requiresLines && (
            <fieldset className="space-y-3 rounded-xl border border-cyan-400/20 p-4">
              <legend className="px-1 text-sm font-bold text-foreground">Líneas origen afectadas</legend>
              <p className="text-xs text-muted-foreground">
                Seleccione cada línea real y declare cantidad, base e impuesto. El servidor contrasta la afectación y el saldo antes de reservar la nota.
              </p>
              {(selected?.lineas ?? []).map((line) => {
                const draft = lineDrafts[line.id]
                const exhausted = isCredit && line.saldo_total <= 0
                return (
                  <div key={line.id} className="rounded-lg border border-border p-3" data-testid={`referenced-note-line-${line.id}`}>
                    <label className="flex items-start gap-3 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={draft?.selected === true}
                        disabled={formDisabled || exhausted}
                        onChange={(event) => toggleLine(line, event.target.checked)}
                        data-testid={`referenced-note-line-select-${line.id}`}
                      />
                      <span>
                        {line.codigo_producto ? `${line.codigo_producto} · ` : ''}{line.descripcion}
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {isCredit ? 'Saldo' : 'Origen'}: {line.saldo_cantidad} {line.unidad_medida || ''} · {selected?.moneda || defaultCurrency} {Number(isCredit ? line.saldo_total : line.total).toFixed(2)} · afectación {line.afectacion_igv || 'sin código'}
                        </span>
                      </span>
                    </label>
                    {draft?.selected && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="text-xs font-semibold">Cantidad
                          <input required type="number" min="0.000001" step="0.000001" value={draft.cantidad} onChange={(event) => updateLine(line.id, 'cantidad', event.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2" aria-label={`Cantidad ${line.descripcion}`} />
                        </label>
                        <label className="text-xs font-semibold">Base
                          <input required type="number" min="0.01" step="0.01" value={draft.base} onChange={(event) => updateLine(line.id, 'base', event.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2" aria-label={`Base ${line.descripcion}`} />
                        </label>
                        <label className="text-xs font-semibold">Impuesto
                          <input required type="number" min="0" step="0.01" value={draft.impuesto} onChange={(event) => updateLine(line.id, 'impuesto', event.target.value)} className="mt-1 w-full rounded-lg border bg-background p-2" aria-label={`Impuesto ${line.descripcion}`} />
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
              {(selected?.lineas ?? []).length === 0 && (
                <div role="alert" className="rounded-lg bg-red-400/10 p-3 text-sm text-foreground">
                  El comprobante no expone líneas fiscales verificables. Este motivo queda bloqueado para evitar un prorrateo inventado.
                </div>
              )}
            </fieldset>
          )}

          {usesGlobalProration && (
            <label className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-foreground">
              <input type="checkbox" checked={confirmGlobalProration} onChange={(event) => setConfirmGlobalProration(event.target.checked)} data-testid="referenced-note-confirm-proration" />
              <span>Confirmo distribuir este ajuste global proporcionalmente entre las líneas fiscales {isCredit ? 'con saldo disponible' : 'del comprobante'}.</span>
            </label>
          )}

          {unsupportedReason && (
            <div role="alert" data-testid="referenced-note-exact-representation-error" className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-foreground">
              “Otros” no permite determinar líneas, base e impuesto de forma fiscalmente exacta. Seleccione un motivo representable; el sistema no inventará un prorrateo.
            </div>
          )}

          {isFullCancellation && (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-sm text-foreground/80">
              La anulación copiará las líneas reales por su saldo restante completo ({selected?.moneda || defaultCurrency} {cancellationBalance.toFixed(2)}). No se admite anulación parcial.
            </div>
          )}

          <label className="block space-y-2 text-sm font-semibold text-foreground">
            {requiresLines ? 'Total exacto de líneas' : isFullCancellation ? 'Saldo total a anular' : 'Importe total'} ({selected?.moneda || defaultCurrency})
            <input
              required
              type="number"
              min="0.01"
              max={isCredit ? cancellationBalance : undefined}
              step="0.01"
              value={requiresLines || isFullCancellation ? effectiveAmount || '' : amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={formDisabled || requiresLines || isFullCancellation || unsupportedReason}
              readOnly={requiresLines || isFullCancellation}
              className="w-full rounded-lg border bg-background p-3"
              data-testid="referenced-note-amount"
            />
          </label>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-foreground/80">
            Crear reserva el correlativo y congela el documento, pero no modifica CxC,
            saldo a favor ni contabilidad. Esos efectos se aplican una sola vez cuando
            {isColombia
              ? ' DIAN acepte la nota con una respuesta correlacionada; un rechazo queda sin efecto financiero.'
              : ' SUNAT/OSE acepte la nota y entregue el CDR; un rechazo queda sin efecto financiero.'}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={
              submitting || !originId || formDisabled || unsupportedReason
              || (requiresLines && payloadLines.length === 0)
              || hasInvalidPayloadLine
              || (usesGlobalProration && !confirmGlobalProration)
              || !Number.isFinite(effectiveAmount) || effectiveAmount <= 0
            } data-testid="create-referenced-note">
              {submitting ? 'Creando…' : 'Crear nota'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
