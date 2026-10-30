'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { useCountryContext } from '@/hooks/use-country-context'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'
import { fiscalDateForCountry } from '@/lib/fiscal-date'
import { confirmCxcCollection } from '@/lib/finanzas/cxc-collection-contract'
import { CXC_COLLECTION_METHODS, cxcCollectionAccount, cxcCollectionExpectation, cxcCollectionPayload, cxcCollectionPendingKey, newCxcCollectionIntent, readCxcCollectionBanks, readCxcCollectionIntent } from '@/lib/finanzas/cxc-collection-operation'
import type { CxcCollectionAccount, CxcCollectionBank, CxcCollectionIntent } from '@/lib/finanzas/cxc-collection-operation'

interface CobroModalProps { isOpen: boolean; cuenta: CxcCollectionAccount | null; onClose: () => void; onSuccess: () => void }
const announcePendingChange = () => window.dispatchEvent(new Event('erp:cxc-collection-pending'))

export function CobroModal({ isOpen, cuenta, onClose, onSuccess }: CobroModalProps) {
  const country = useCountryContext()
  const { session, loading: authLoading } = useAuth()
  const { hasPermission: canCollect, loading: permissionLoading } = usePermission('finanzas', 'write', 'cxc.cobros')
  const { get, post } = useApi({ requireLive: true, showSuccessToast: false, showErrorToast: false, throwOnError: true, retries: 0 })
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || ''
  const scopeKey = `${tenantId}:${actorId}:${cuenta?.id || ''}`
  const activeScope = useRef(''), generation = useRef(0), submitting = useRef(false)
  activeScope.current = isOpen && cuenta && !authLoading && !permissionLoading && canCollect ? scopeKey : ''
  const [monto, setMonto] = useState(''), [fechaPago, setFechaPago] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO'), [cuentaBancariaId, setCuentaBancariaId] = useState('SIN_CUENTA')
  const [referencia, setReferencia] = useState(''), [notas, setNotas] = useState('')
  const [pending, setPending] = useState<CxcCollectionIntent | null>(null), [pendingRaw, setPendingRaw] = useState<string | null>(null)
  const [ready, setReady] = useState(''), [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null), [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [banks, setBanks] = useState<CxcCollectionBank[]>([]), [bankLoading, setBankLoading] = useState(false)
  const [bankLoaded, setBankLoaded] = useState(false), [bankError, setBankError] = useState<string | null>(null)
  const bankGeneration = useRef(0)

  const restore = useCallback(() => {
    if (!cuenta || activeScope.current !== scopeKey) return
    setError(null); setRecoveryError(null); setPending(null); setPendingRaw(null)
    setBanks([]); setBankLoaded(false); setBankLoading(false); setBankError(null); bankGeneration.current += 1
    try {
      const raw = localStorage.getItem(cxcCollectionPendingKey({ tenantId, actorId }, cuenta.id))
      const intent = readCxcCollectionIntent(raw, { tenantId, actorId }, cuenta.id)
      setPending(intent); setPendingRaw(raw)
      const payload = intent ? cxcCollectionPayload(intent) : null
      setMonto(payload ? String(payload.monto) : cuenta.saldo > 0 ? String(cuenta.saldo) : '')
      setFechaPago(payload?.fecha_pago || fiscalDateForCountry(country.paisCodigo))
      setMetodoPago(payload?.metodo_pago || 'EFECTIVO'); setCuentaBancariaId(payload?.cuenta_bancaria_id || 'SIN_CUENTA')
      setReferencia(payload?.referencia || ''); setNotas(payload?.notas || '')
    } catch { setRecoveryError('No se pudo recuperar el cobro pendiente. Se conserva sin reemplazarlo; no se puede enviar otro cobro.') }
    setReady(scopeKey)
  }, [cuenta, scopeKey, tenantId, actorId, country.paisCodigo])

  useEffect(() => {
    generation.current += 1; bankGeneration.current += 1; submitting.current = false
    setSaving(false); setReady(''); setPending(null); setPendingRaw(null); setError(null); setRecoveryError(null)
    if (activeScope.current === scopeKey) restore()
    return () => { generation.current += 1; bankGeneration.current += 1 }
  }, [isOpen, scopeKey, authLoading, permissionLoading, canCollect, restore])

  useEffect(() => {
    if (!isOpen || !cuenta || activeScope.current !== scopeKey) return
    const changed = (event: StorageEvent) => {
      if (event.key !== cxcCollectionPendingKey({ tenantId, actorId }, cuenta.id)) return
      if (submitting.current) setRecoveryError('El cobro pendiente cambió en otra ventana. Se conserva la solicitud enviada para revisar su confirmación.')
      else restore()
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [isOpen, cuenta, scopeKey, tenantId, actorId, restore])

  const loadBanks = useCallback(async () => {
    if (!cuenta || activeScope.current !== scopeKey) return
    const context = scopeKey, revision = generation.current, request = ++bankGeneration.current
    const current = () => activeScope.current === context && generation.current === revision && bankGeneration.current === request
    setBanks([]); setBankLoaded(false); setBankLoading(true); setBankError(null)
    try {
      const response = await get('/api/finanzas/bancos/cuentas')
      const rows = readCxcCollectionBanks(response, tenantId, cuenta.moneda)
      if (current()) { setBanks(rows); setBankLoaded(true) }
    } catch { if (current()) setBankError('No se pudo consultar el catálogo completo de cuentas bancarias. Reintenta la consulta.') }
    finally { if (current()) setBankLoading(false) }
  }, [get, tenantId, cuenta, scopeKey])

  useEffect(() => {
    if (isOpen && ready === scopeKey && !pending && !recoveryError && metodoPago !== 'EFECTIVO') void loadBanks()
    return () => { bankGeneration.current += 1 }
  }, [isOpen, ready, scopeKey, pending, recoveryError, metodoPago, loadBanks])

  const displayed = useMemo(() => pending ? cxcCollectionAccount(pending) : cuenta, [pending, cuenta])
  const requiresBank = metodoPago !== 'EFECTIVO'
  const frozen = saving || Boolean(pending) || Boolean(recoveryError)
  const newBankReady = !requiresBank || bankLoaded && !bankLoading && !bankError && banks.some(bank => bank.id === cuentaBancariaId)
  const formatCurrency = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: displayed?.moneda || 'PEN' }).format(value)
  const documentNumber = displayed ? formatFiscalDocumentNumber(country.paisCodigo, displayed.serie, displayed.numero) || displayed.id : ''
  const handleClose = () => { if (!submitting.current) onClose() }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cuenta || submitting.current || activeScope.current !== scopeKey || ready !== scopeKey || recoveryError) return
    if (!pending) {
      if (!/^\d+(?:\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) { setError('El monto debe ser mayor a cero y tener hasta dos decimales'); return }
      if (Math.round(Number(monto) * 100) > Math.round(cuenta.saldo * 100)) { setError(`El monto no puede superar el saldo pendiente (${formatCurrency(cuenta.saldo)})`); return }
      if (!newBankReady) { setError('Consulta las cuentas bancarias y selecciona una cuenta activa de la misma moneda'); return }
      if (requiresBank && !referencia.trim()) { setError('Ingrese la referencia de la operación bancaria'); return }
    }
    submitting.current = true; setSaving(true); setError(null)
    const context = scopeKey, revision = generation.current
    const current = () => activeScope.current === context && generation.current === revision
    try {
      if (!navigator.locks?.request) throw new Error('No se puede reservar el cobro en esta ventana. Se conserva el pendiente; vuelve a abrir la aplicación.')
      await navigator.locks.request('erp.cxc.collection:' + scopeKey, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Otra ventana está confirmando este cobro. Se conserva la solicitud original; reintenta su consulta.')
        if (!current()) return
        const key = cxcCollectionPendingKey({ tenantId, actorId }, cuenta.id)
        const storedRaw = localStorage.getItem(key), stored = readCxcCollectionIntent(storedRaw, { tenantId, actorId }, cuenta.id)
        let intent: CxcCollectionIntent, raw: string
        if (pending) {
          if (storedRaw !== pendingRaw || !stored) throw new Error('El pendiente cambió. Se conserva sin reemplazarlo ni enviar otro cobro.')
          intent = stored; raw = storedRaw!
        } else {
          if (stored) { restore(); throw new Error('Ya existe un cobro pendiente en otra ventana. Se conserva su solicitud original.') }
          intent = newCxcCollectionIntent(cuenta, { monto, fechaPago, metodoPago, cuentaBancariaId, referencia, notas }, { tenantId, actorId })
          raw = JSON.stringify(intent)
          localStorage.setItem(key, raw)
          if (localStorage.getItem(key) !== raw) throw new Error('No se pudo conservar la solicitud original. No se envió el cobro.')
          setPending(intent); setPendingRaw(raw); announcePendingChange()
        }
        if (!current()) return
        const response = await post(`/api/finanzas/cxc/${intent.cuenta.id}/pagos`, cxcCollectionPayload(intent))
        if (!current()) return
        confirmCxcCollection(response, cxcCollectionExpectation(intent))
        if (localStorage.getItem(key) !== raw) throw new Error('El pendiente cambió antes de guardar la confirmación. Se conserva para revisar el mismo cobro.')
        localStorage.removeItem(key)
        if (localStorage.getItem(key) !== null) throw new Error('El recibo fue verificado, pero el pendiente local requiere revisión. Reintenta el mismo cobro.')
        setPending(null); setPendingRaw(null); announcePendingChange(); onSuccess(); onClose()
      })
    } catch (err: any) { if (current()) setError(err?.message || 'El cobro no está confirmado. Se conserva la solicitud original para reintentar.') }
    finally { if (current()) { submitting.current = false; setSaving(false) } }
  }

  return <Dialog open={isOpen} onOpenChange={open => { if (!open) handleClose() }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{pending ? 'Confirmar cobro pendiente' : 'Registrar cobro'}</DialogTitle>
        <DialogDescription>Cuenta por cobrar {documentNumber}.</DialogDescription></DialogHeader>
      {pending && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">El cobro sigue pendiente de confirmar. Se conserva su solicitud original al cerrar o recargar. El reintento usa los mismos datos.</p>}
      {recoveryError && <div role="alert" data-testid="cxc-collection-recovery-error" className="text-sm text-destructive">{recoveryError}<Button type="button" variant="outline" onClick={restore} disabled={saving}>Reintentar lectura del pendiente</Button></div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset disabled={frozen || ready !== scopeKey || !canCollect} className="grid grid-cols-1 gap-4">
          <div><Label htmlFor="monto">Monto</Label><Input id="monto" type="text" inputMode="decimal" pattern="^[0-9]+([.][0-9]{1,2})?$" value={monto} onChange={e => setMonto(e.target.value)} required />
            <p className="mt-1 text-xs text-muted-foreground">Saldo al preparar el cobro: {formatCurrency(displayed?.saldo || 0)}</p></div>
          <div><Label htmlFor="fecha_pago">Fecha de cobro</Label><Input id="fecha_pago" type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} required /></div>
          <div><Label htmlFor="metodo_pago">Método de pago</Label><select id="metodo_pago" value={metodoPago} onChange={e => { setMetodoPago(e.target.value); setCuentaBancariaId('SIN_CUENTA') }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {CXC_COLLECTION_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></div>
          {requiresBank && <div><Label htmlFor="cuenta_bancaria_id">Cuenta bancaria *</Label><select id="cuenta_bancaria_id" value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)} disabled={bankLoading || !bankLoaded || Boolean(bankError)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="SIN_CUENTA">{bankLoading ? 'Consultando cuentas...' : 'Selecciona una cuenta bancaria'}</option>
            {pending && <option value={cxcCollectionPayload(pending).cuenta_bancaria_id}>Cuenta del cobro pendiente</option>}
            {!pending && banks.map(bank => <option key={bank.id} value={bank.id}>{bank.nombre || bank.banco} - {bank.numero_cuenta}</option>)}</select>
            {!pending && bankLoaded && banks.length === 0 && <p className="mt-1 text-sm">No hay cuentas activas en {displayed?.moneda}.</p>}</div>}
          <div><Label htmlFor="referencia">Referencia</Label><Input id="referencia" value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={120} required={requiresBank} /></div>
          <div><Label htmlFor="notas">Notas internas</Label><Textarea id="notas" value={notas} onChange={e => setNotas(e.target.value)} maxLength={1000} rows={3} /></div>
        </fieldset>
        {!pending && requiresBank && bankError && <div role="alert" data-testid="cxc-collection-banks-error" className="text-sm text-destructive">{bankError}<Button type="button" variant="outline" onClick={() => void loadBanks()} disabled={saving || bankLoading}>Reintentar cuentas bancarias</Button></div>}
        {error && <p role="alert" data-testid="cxc-collection-error" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={handleClose} disabled={saving}>Cerrar</Button>
          <Button type="submit" disabled={saving || ready !== scopeKey || !canCollect || Boolean(recoveryError) || !pending && !newBankReady}>{saving ? 'Confirmando...' : pending ? 'Reintentar mismo cobro' : 'Registrar cobro'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
