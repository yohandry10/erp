'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, FileInput, RefreshCw, RotateCcw, Send, ShieldAlert } from 'lucide-react'
import { fetchApi } from '@/lib/api-fetch'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type DianEventCode = '030' | '031' | '032' | '033' | '034'

interface ProviderOption {
  id: string
  ruc?: string
  razon_social?: string
}

interface ReceivedDianEvent {
  id: string
  operationId?: string | null
  eventCode?: DianEventCode | null
  eventCude?: string | null
  state?: string | null
  resultKind?: string | null
  responseCode?: string | null
  error?: string | null
  retryAt?: string | null
  attempt?: number | null
  canRetry?: boolean
  capabilities?: {
    retry?: boolean
    reconcile?: boolean
  }
}

interface ReceivedDianInvoice {
  id: string
  cufe: string
  documentId: string
  issueDate: string
  currencyCode: string
  payableAmount: number | string
  issuer?: { name?: string; number?: string }
  state: string
  proveedorId: string
  cuentaPorPagarId?: string | null
  events?: ReceivedDianEvent[]
}

export interface IssuedDianInvoice {
  id: string
  serie: string
  numero: number
  fechaEmision: string
  cliente: string
  total: number
  moneda: string
  estado: string
  tipoDocumento?: string
  tipoComprobante?: string
}

interface Props {
  fiscalReady: boolean
  isDemo: boolean
  issuedInvoices: IssuedDianInvoice[]
}

interface EventIntent {
  anchorId: string
  anchorKind: 'RECEIVED' | 'ISSUED'
  label: string
  eventCode: DianEventCode
}

interface ResponsiblePersonForm {
  identityType: '13' | '22' | '31' | '41'
  identityNumber: string
  firstName: string
  familyName: string
  jobTitle: string
  organizationDepartment: string
}

const CLAIM_REASONS = {
  '01': 'Documento con inconsistencias',
  '02': 'Mercancía no entregada totalmente',
  '03': 'Mercancía no entregada parcialmente',
  '04': 'Servicio no prestado',
} as const

function eventLabel(code: DianEventCode): string {
  return {
    '030': 'Acuse de recibo de la FEV',
    '031': 'Reclamo de la FEV',
    '032': 'Recibo de bienes o servicios',
    '033': 'Aceptación expresa',
    '034': 'Aceptación tácita',
  }[code]
}

function responseMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  const direct = [record.message, record.error, record.descripcionRespuesta]
    .find((value) => typeof value === 'string' && value.trim().length > 0)
  if (typeof direct === 'string') return direct
  const nested = record.data
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>
    const value = [nestedRecord.message, nestedRecord.error]
      .find((item) => typeof item === 'string' && item.trim().length > 0)
    if (typeof value === 'string') return value
  }
  return fallback
}

function payloadData<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const direct = record.data
  if (Array.isArray(direct)) return direct as T[]
  if (direct && typeof direct === 'object' && Array.isArray((direct as Record<string, unknown>).data)) {
    return (direct as Record<string, unknown>).data as T[]
  }
  return []
}

function idempotencyKey(storageKey: string, prefix: string): string {
  const current = window.sessionStorage.getItem(storageKey)
  if (current) return current
  const next = `${prefix}:${window.crypto.randomUUID()}`
  window.sessionStorage.setItem(storageKey, next)
  return next
}

function shortCode(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  if (normalized.length <= 18) return normalized || '—'
  return `${normalized.slice(0, 10)}…${normalized.slice(-6)}`
}

export function DianEventsPanel({ fiscalReady, isDemo, issuedInvoices }: Props) {
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [receivedInvoices, setReceivedInvoices] = useState<ReceivedDianInvoice[]>([])
  const [cufe, setCufe] = useState('')
  const [providerId, setProviderId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [intent, setIntent] = useState<EventIntent | null>(null)
  const [responsible, setResponsible] = useState<ResponsiblePersonForm>({
    identityType: '13',
    identityNumber: '',
    firstName: '',
    familyName: '',
    jobTitle: '',
    organizationDepartment: '',
  })
  const [claimReason, setClaimReason] = useState<keyof typeof CLAIM_REASONS>('01')
  const [swornConfirmation, setSwornConfirmation] = useState(false)
  const { hasPermission: canReadReceived, loading: readPermissionLoading } = usePermission(
    'cpe', 'ver', 'dian.facturas_recibidas',
  )
  const { hasPermission: canManageReceived, loading: managePermissionLoading } = usePermission(
    'cpe', 'gestionar', 'dian.facturas_recibidas',
  )
  const { hasPermission: canEmitTacit, loading: tacitPermissionLoading } = usePermission(
    'cpe', 'emitir', 'dian.eventos_034',
  )

  const realTenant = !isDemo
  const writesEnabled = fiscalReady && realTenant
  const permissionsLoading = readPermissionLoading
    || managePermissionLoading
    || tacitPermissionLoading

  const loadData = useCallback(async () => {
    if (!realTenant || readPermissionLoading) {
      setReceivedInvoices([])
      setProviders([])
      setAccessDenied(false)
      return
    }
    if (!canReadReceived) {
      setReceivedInvoices([])
      setProviders([])
      setAccessDenied(true)
      return
    }
    setLoading(true)
    setAccessDenied(false)
    try {
      const receivedResponse = await fetchApi(
        '/api/cpe/dian/facturas-recibidas?limit=50',
        { method: 'GET' },
      )
      if (receivedResponse.status === 403) {
        setAccessDenied(true)
        setReceivedInvoices([])
      } else {
        const receivedPayload = await receivedResponse.json().catch(() => null)
        if (!receivedResponse.ok) {
          throw new Error(responseMessage(receivedPayload, `HTTP ${receivedResponse.status}`))
        }
        setReceivedInvoices(payloadData<ReceivedDianInvoice>(receivedPayload))
      }
      if (writesEnabled && canManageReceived) {
        const providersResponse = await fetchApi(
          '/api/compras/proveedores?activo=true&limit=100',
          { method: 'GET' },
        )
        const providersPayload = await providersResponse.json().catch(() => null)
        setProviders(providersResponse.ok
          ? payloadData<ProviderOption>(providersPayload)
          : [])
      } else {
        setProviders([])
      }
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo cargar la bandeja DIAN',
      })
    } finally {
      setLoading(false)
    }
  }, [canManageReceived, canReadReceived, readPermissionLoading, realTenant, writesEnabled])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const acceptedIssuedInvoices = useMemo(
    () => issuedInvoices.filter((document) =>
      document.estado === 'ACEPTADO'
      && String(document.tipoDocumento ?? document.tipoComprobante ?? '') === '01',
    ),
    [issuedInvoices],
  )

  const importInvoice = async () => {
    if (!writesEnabled || !canManageReceived) {
      setMessage({ tone: 'error', text: 'La importación requiere habilitación DIAN y permiso de gestión.' })
      return
    }
    const normalizedCufe = cufe.trim().toUpperCase()
    if (!/^[0-9A-F]{96}$/.test(normalizedCufe) || !providerId) {
      setMessage({ tone: 'error', text: 'Ingresa un CUFE de 96 caracteres y selecciona el proveedor correcto.' })
      return
    }
    const storageKey = `dian-import:${normalizedCufe}:${providerId}`
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetchApi('/api/cpe/dian/facturas-recibidas/importar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey(storageKey, 'dian-import-ui'),
        },
        body: JSON.stringify({ cufe: normalizedCufe, proveedorId: providerId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseMessage(payload, `HTTP ${response.status}`))
      window.sessionStorage.removeItem(storageKey)
      setCufe('')
      setMessage({ tone: 'success', text: 'FEV recibida comprobada directamente en DIAN e importada.' })
      await loadData()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo importar la FEV recibida',
      })
    } finally {
      setSaving(false)
    }
  }

  const startEvent = (next: EventIntent) => {
    setIntent(next)
    setSwornConfirmation(false)
    setMessage(null)
  }

  const submitEvent = async () => {
    if (!intent) return
    const canWriteIntent = intent.anchorKind === 'RECEIVED'
      ? canManageReceived
      : canEmitTacit
    if (!writesEnabled || !canWriteIntent) {
      setMessage({ tone: 'error', text: 'Tu rol o la habilitación DIAN no permite registrar este evento.' })
      return
    }
    const needsPerson = intent.eventCode === '030' || intent.eventCode === '032'
    if (needsPerson && Object.values(responsible).some((value) => !String(value).trim())) {
      setMessage({ tone: 'error', text: 'Completa la persona responsable del acuse o recibo.' })
      return
    }
    if (intent.eventCode === '034' && !swornConfirmation) {
      setMessage({ tone: 'error', text: 'La aceptación tácita exige confirmar la declaración juramentada.' })
      return
    }
    const storageKey = `dian-event:${intent.anchorKind}:${intent.anchorId}:${intent.eventCode}`
    const endpoint = intent.anchorKind === 'RECEIVED'
      ? `/api/cpe/dian/facturas-recibidas/${encodeURIComponent(intent.anchorId)}/eventos`
      : `/api/cpe/${encodeURIComponent(intent.anchorId)}/dian/eventos`
    const body: Record<string, unknown> = { eventCode: intent.eventCode }
    if (needsPerson) body.responsiblePerson = responsible
    if (intent.eventCode === '031') {
      body.claimReason = { listId: claimReason, name: CLAIM_REASONS[claimReason] }
    }
    if (intent.eventCode === '034') body.swornConfirmation = true

    setSaving(true)
    setMessage(null)
    try {
      const response = await fetchApi(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey(storageKey, 'dian-event-ui'),
        },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseMessage(payload, `HTTP ${response.status}`))
      const result = payload && typeof payload === 'object'
        ? ((payload as Record<string, unknown>).data ?? payload) as Record<string, unknown>
        : {}
      if (result.success !== true || result.resultKind !== 'ACCEPTED' || result.responseCode !== '00') {
        throw new Error(responseMessage(
          result,
          'DIAN no confirmó el evento con código 00; se conservará para reconciliación.',
        ))
      }
      window.sessionStorage.removeItem(storageKey)
      setIntent(null)
      setMessage({ tone: 'success', text: `${eventLabel(intent.eventCode)} registrado y reconciliado con DIAN.` })
      await loadData()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo registrar el evento DIAN',
      })
      // Si el I/O externo quedó incierto, el servidor conserva la operación.
      // Recargar permite recuperarla por operationId aun si se perdió el
      // sessionStorage del intento original.
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  const retryReceivedEvent = async (event: ReceivedDianEvent) => {
    const operationId = String(event.operationId ?? event.id ?? '').trim()
    if (!writesEnabled || !canManageReceived || !operationId) {
      setMessage({ tone: 'error', text: 'El evento no tiene una operación DIAN reintentable para tu rol.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetchApi(
        `/api/cpe/dian/facturas-recibidas/eventos/${encodeURIComponent(operationId)}/reintentar`,
        { method: 'POST' },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseMessage(payload, `HTTP ${response.status}`))
      const result = payload && typeof payload === 'object'
        ? ((payload as Record<string, unknown>).data ?? payload) as Record<string, unknown>
        : {}
      setMessage(result.resultKind === 'ACCEPTED' && result.responseCode === '00'
        ? { tone: 'success', text: 'DIAN confirmó el evento durante la reconciliación.' }
        : {
            tone: 'info',
            text: responseMessage(result, 'La operación fue reconciliada y conserva su estado autoritativo.'),
          })
      await loadData()
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'No se pudo reconciliar el evento DIAN',
      })
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  if (!realTenant) {
    return (
      <Card className="border-amber-400/30 bg-amber-500/10" data-testid="dian-events-panel" data-operational="false">
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <h2 className="font-bold text-foreground">Recepción y eventos DIAN</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isDemo
                ? 'La demo muestra este flujo, pero no consulta ni registra eventos reales en DIAN.'
                : 'Completa certificado, Software ID/PIN, numeración, TestSet y estado HABILITADO antes de operar facturas recibidas.'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className="border-cyan-400/20 bg-card/70"
      data-testid="dian-events-panel"
      data-operational={writesEnabled ? 'true' : 'false'}
    >
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground">Recepción y eventos DIAN</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              La FEV se descarga por CUFE desde DIAN, se liga al proveedor y conserva XML, firma y evidencia inmutables.
            </p>
          </div>
          <Button type="button" variant="outline" disabled={loading || permissionsLoading} onClick={() => void loadData()} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {!writesEnabled && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
            El historial local permanece disponible, pero importar o registrar eventos está bloqueado hasta completar la habilitación DIAN.
          </div>
        )}

        {accessDenied ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
            Tu rol no puede ver facturas recibidas DIAN. Solicita el permiso de lectura de Compras/Contabilidad correspondiente.
          </div>
        ) : writesEnabled && canManageReceived ? (
          <div className="grid gap-3 rounded-2xl border border-border bg-background/40 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)_auto]">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              CUFE de la factura recibida
              <input
                data-testid="dian-received-cufe"
                value={cufe}
                onChange={(event) => setCufe(event.target.value.replace(/\s/g, '').toUpperCase())}
                maxLength={96}
                placeholder="96 caracteres hexadecimales"
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Proveedor
              <select
                data-testid="dian-received-provider"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Selecciona…</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.razon_social || 'Proveedor'} · {provider.ruc || 'sin NIT'}
                  </option>
                ))}
              </select>
            </label>
            <Button
              data-testid="dian-import-received"
              type="button"
              disabled={saving || accessDenied || permissionsLoading}
              onClick={() => void importInvoice()}
              className="mt-auto gap-2"
            >
              <FileInput className="h-4 w-4" />
              Importar desde DIAN
            </Button>
          </div>
        ) : canReadReceived && !managePermissionLoading ? (
          <div className="rounded-xl border border-border bg-background/35 p-4 text-sm text-muted-foreground">
            {!writesEnabled && canManageReceived
              ? 'Historial disponible. Importar FEV y registrar eventos se habilitará al completar la configuración y habilitación DIAN.'
              : !writesEnabled
                ? 'Historial disponible en modo lectura. Para operar también debes completar la habilitación DIAN y contar con permiso de gestión.'
                : 'Vista de sólo lectura. Importar FEV y registrar eventos requiere el permiso de gestión DIAN.'}
          </div>
        ) : null}

        {message && (
          <div
            role="status"
            className={`rounded-xl border p-3 text-sm ${
              message.tone === 'success'
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : message.tone === 'error'
                  ? 'border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-300'
                  : 'border-cyan-400/30 bg-cyan-500/10 text-foreground'
            }`}
          >
            {message.text}
          </div>
        )}

        {intent && writesEnabled && (
          <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="dian-event-composer">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">{intent.eventCode}</p>
                <h3 className="font-bold text-foreground">{eventLabel(intent.eventCode)}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{intent.label}</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => setIntent(null)}>Cancelar</Button>
            </div>

            {(intent.eventCode === '030' || intent.eventCode === '032') && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <select
                  aria-label="Tipo de identificación responsable"
                  value={responsible.identityType}
                  onChange={(event) => setResponsible((current) => ({
                    ...current,
                    identityType: event.target.value as ResponsiblePersonForm['identityType'],
                  }))}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="13">Cédula de ciudadanía</option>
                  <option value="22">Cédula de extranjería</option>
                  <option value="31">NIT</option>
                  <option value="41">Pasaporte</option>
                </select>
                {([
                  ['identityNumber', 'Número de identificación'],
                  ['firstName', 'Nombres'],
                  ['familyName', 'Apellidos'],
                  ['jobTitle', 'Cargo'],
                  ['organizationDepartment', 'Área responsable'],
                ] as const).map(([field, placeholder]) => (
                  <input
                    key={field}
                    aria-label={placeholder}
                    value={responsible[field]}
                    onChange={(event) => setResponsible((current) => ({ ...current, [field]: event.target.value }))}
                    placeholder={placeholder}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                ))}
              </div>
            )}

            {intent.eventCode === '031' && (
              <label className="mt-4 block text-sm font-semibold text-foreground">
                Motivo DIAN
                <select
                  value={claimReason}
                  onChange={(event) => setClaimReason(event.target.value as keyof typeof CLAIM_REASONS)}
                  className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {Object.entries(CLAIM_REASONS).map(([code, label]) => (
                    <option key={code} value={code}>{code} · {label}</option>
                  ))}
                </select>
              </label>
            )}

            {intent.eventCode === '034' && (
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={swornConfirmation}
                  onChange={(event) => setSwornConfirmation(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  Declaro bajo juramento que transcurrió el plazo legal desde el recibo de bienes o servicios y que DIAN no registra reclamo ni aceptación expresa incompatibles.
                </span>
              </label>
            )}

            <Button
              data-testid="dian-submit-event"
              type="button"
              disabled={saving}
              onClick={() => void submitEvent()}
              className="mt-4 gap-2"
            >
              <Send className="h-4 w-4" />
              {saving ? 'Consultando y enviando…' : 'Consultar secuencia y registrar'}
            </Button>
          </section>
        )}

        <section>
          <h3 className="font-bold text-foreground">Facturas recibidas comprobadas</h3>
          <div className="mt-3 space-y-3" data-testid="dian-received-list">
            {receivedInvoices.map((invoice) => {
              const acceptedCodes = new Set(
                (invoice.events ?? [])
                  .filter((event) => event.resultKind === 'ACCEPTED')
                  .map((event) => event.eventCode),
              )
              const blockedByDecision = acceptedCodes.has('031') || acceptedCodes.has('033') || acceptedCodes.has('034')
              const can032 = acceptedCodes.has('030') && !acceptedCodes.has('032')
              const canDecision = acceptedCodes.has('030') && acceptedCodes.has('032') && !blockedByDecision
              return (
                <article key={invoice.id} className="rounded-2xl border border-border bg-background/35 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-emerald-500" />
                        <span className="font-bold text-foreground">{invoice.documentId}</span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">DIAN aceptada</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {invoice.issuer?.name || 'Emisor'} · NIT {invoice.issuer?.number || '—'} · {invoice.issueDate}
                      </p>
                      <p className="mt-1 text-xs font-mono text-muted-foreground">CUFE {shortCode(invoice.cufe)}</p>
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {invoice.currencyCode} {Number(invoice.payableAmount || 0).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    {writesEnabled && canManageReceived && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={acceptedCodes.has('030')}
                        onClick={() => startEvent({ anchorId: invoice.id, anchorKind: 'RECEIVED', label: invoice.documentId, eventCode: '030' })}
                      >030 Acuse</Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!can032}
                        onClick={() => startEvent({ anchorId: invoice.id, anchorKind: 'RECEIVED', label: invoice.documentId, eventCode: '032' })}
                      >032 Recibo</Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canDecision}
                        onClick={() => startEvent({ anchorId: invoice.id, anchorKind: 'RECEIVED', label: invoice.documentId, eventCode: '031' })}
                      >031 Reclamar</Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canDecision}
                        onClick={() => startEvent({ anchorId: invoice.id, anchorKind: 'RECEIVED', label: invoice.documentId, eventCode: '033' })}
                      >033 Aceptar</Button>
                    </div>
                    )}
                  </div>
                  {(invoice.events ?? []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                      {(invoice.events ?? []).map((event) => {
                        const retryAllowed = writesEnabled
                          && canManageReceived
                          && event.capabilities?.retry === true
                          && event.canRetry === true
                        return (
                          <div key={event.id} className="flex items-center gap-2 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                            <span>
                              {event.eventCode || '—'} · {event.resultKind || event.state || 'PENDIENTE'} · CUDE {shortCode(event.eventCude)}
                              {event.attempt ? ` · intento ${event.attempt}` : ''}
                            </span>
                            {retryAllowed && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={saving}
                                data-testid={`dian-retry-event-${event.operationId || event.id}`}
                                onClick={() => void retryReceivedEvent(event)}
                                className="h-6 gap-1 rounded-full px-2 text-xs"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Reconciliar
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </article>
              )
            })}
            {!loading && receivedInvoices.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                {accessDenied
                  ? 'Tu rol no tiene acceso a la bandeja DIAN.'
                  : writesEnabled && canManageReceived
                    ? 'No hay FEV recibidas importadas. Usa el CUFE y el proveedor para traer la primera directamente desde DIAN.'
                    : 'No hay FEV recibidas visibles para este tenant.'}
              </p>
            )}
          </div>
        </section>

        {canEmitTacit && (
        <section className="border-t border-border pt-5">
          <h3 className="font-bold text-foreground">Candidatas a aceptación tácita de facturas emitidas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta lista es preliminar. Antes de habilitar el 034, el servidor consulta a DIAN y comprueba secuencia, incompatibilidades y plazo legal.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {acceptedIssuedInvoices.slice(0, 10).map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/35 p-3">
                <div>
                  <p className="font-bold text-foreground">{invoice.serie}-{invoice.numero}</p>
                  <p className="text-xs text-muted-foreground">{invoice.cliente} · {invoice.fechaEmision}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!writesEnabled}
                  onClick={() => startEvent({
                    anchorId: invoice.id,
                    anchorKind: 'ISSUED',
                    label: `${invoice.serie}-${invoice.numero}`,
                    eventCode: '034',
                  })}
                >034 Tácita</Button>
              </div>
            ))}
            {acceptedIssuedInvoices.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay facturas DIAN emitidas y aceptadas candidatas.</p>
            )}
          </div>
        </section>
        )}
      </CardContent>
    </Card>
  )
}
