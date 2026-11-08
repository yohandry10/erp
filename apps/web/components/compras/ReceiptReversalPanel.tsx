'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { archiveReceiptReversal, newReceiptReversalIntent, readReceiptReversalIntent, readReceiptReversalOutcome,
  receiptReversalPendingKey, receiptReversalRequest, type ReceiptReversalIntent } from '@/lib/compras/receipt-reversal-operation'

export function ReceiptReversalPanel({ receiptId, receiptNumber, canCreate, onChanged }: {
  receiptId: string; receiptNumber: string; canCreate: boolean; onChanged: () => void
}) {
  const { session, loading: authLoading } = useAuth()
  const { hasPermission: allowed, loading: permissionLoading } = usePermission('compras', 'cerrar', 'recepciones')
  const { post } = useApi({ requireLive: true, throwOnError: true, retries: 0, showErrorToast: false, showSuccessToast: false })
  const scope = useMemo(() => ({ tenantId: session?.user?.tenant_id || '', actorId: session?.user?.id || '', receiptId }), [session?.user?.tenant_id, session?.user?.id, receiptId])
  const key = `${scope.tenantId}:${scope.actorId}:${receiptId}`
  const active = useRef(''), revision = useRef(0), busy = useRef(false), callback = useRef(onChanged)
  active.current = !authLoading && !permissionLoading && allowed && scope.tenantId && scope.actorId ? key : ''
  callback.current = onChanged
  const [pending, setPending] = useState<ReceiptReversalIntent | null>(null), [ready, setReady] = useState('')
  const [storageError, setStorageError] = useState<string | null>(null), [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false), [notice, setNotice] = useState<string | null>(null), [open, setOpen] = useState(false)
  const [noticeKind, setNoticeKind] = useState<'COMMITTED' | 'ABANDONED' | null>(null)
  const [motivo, setMotivo] = useState(''), [fecha, setFecha] = useState(''), [confirmed, setConfirmed] = useState(false)
  const invalidate = useCallback(() => { revision.current++ }, [])
  const restore = useCallback(async () => {
    const generation = revision.current
    if (active.current !== key) return
    setReady(''); setStorageError(null); setError(null); setPending(null)
    try {
      const value = await readReceiptReversalIntent(localStorage.getItem(receiptReversalPendingKey(scope)), scope)
      if (generation !== revision.current || active.current !== key) return
      setPending(value); if (value) setOpen(true); setReady(key)
    } catch {
      if (generation === revision.current && active.current === key) setStorageError('No se pudo leer la solicitud original. Se conserva y se bloquea otra anulación.')
    }
  }, [key, scope])
  useEffect(() => {
    revision.current++; busy.current = false; setWorking(false); setReady(''); setPending(null); setStorageError(null); setError(null); setNotice(null)
    setOpen(false); setMotivo(''); setFecha(''); setConfirmed(false); setNoticeKind(null)
    void restore()
    return invalidate
  }, [restore, authLoading, permissionLoading, allowed, invalidate])
  useEffect(() => {
    if (active.current !== key) return
    const update = (event: StorageEvent) => {
      if (event.key !== null && event.key !== receiptReversalPendingKey(scope)) return
      revision.current++
      setStorageError('La solicitud cambió en otra ventana. Vuelva a comprobar el pendiente antes de continuar.'); setReady('')
    }
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [key, scope, allowed, authLoading, permissionLoading])

  const run = async (action: 'write' | 'read' | 'resolve') => {
    if (busy.current || active.current !== key || ready !== key || storageError || (action === 'write' ? !canCreate || !!pending || !confirmed : !pending)) return
    const generation = revision.current, current = () => active.current === key && revision.current === generation
    busy.current = true; setWorking(true); setError(null); setNotice(null)
    try {
      if (!navigator.onLine) throw new Error('Se requiere conexión. Se conservan los datos para continuar.')
      if (!navigator.locks?.request) throw new Error('No se puede reservar esta solicitud en la ventana. Vuelva a abrir la aplicación; sus datos se conservan.')
      await navigator.locks.request('erp.receipt-reversal:' + key, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Otra ventana está resolviendo esta recepción. Se conserva la solicitud original.')
        if (!current()) return
        const pendingKey = receiptReversalPendingKey(scope), previous = localStorage.getItem(pendingKey)
        let intent: ReceiptReversalIntent
        if (action === 'write') {
          if (previous !== null) throw new Error('Existe una solicitud original. Vuelva a comprobar el pendiente antes de preparar otra.')
          intent = await newReceiptReversalIntent(scope, receiptNumber, { motivo, fecha_contable: fecha })
          if (!current()) return
          const raw = JSON.stringify(intent)
          localStorage.setItem(pendingKey, raw)
          if (localStorage.getItem(pendingKey) !== raw) throw new Error('No se pudo conservar la solicitud. No se envió la anulación.')
          setPending(intent)
        } else {
          intent = (await readReceiptReversalIntent(previous, scope))!
          if (!intent || JSON.stringify(intent) !== JSON.stringify(pending)) throw new Error('El pendiente cambió. Se conserva sin enviar otra solicitud.')
        }
        if (!current()) return
        const response = await post(`/api/compras/recepciones/${intent.receiptId}/anular${action === 'read' ? '/recibo' : action === 'resolve' ? '/resolver' : ''}`, receiptReversalRequest(intent))
        const outcome = await readReceiptReversalOutcome(response, intent, action === 'resolve')
        if (!current()) return
        await archiveReceiptReversal(localStorage, intent, outcome)
        if (!current()) return
        setPending(null); setMotivo(''); setFecha(''); setConfirmed(false); setOpen(false)
        setNoticeKind(outcome.status)
        setNotice(outcome.status === 'COMMITTED' ? 'Anulación confirmada. El inventario y el cumplimiento de la orden quedaron revertidos. La contabilidad se procesa por separado.'
          : 'La solicitud original no se aplicó y su clave quedó cerrada. Puede preparar otra solicitud cuando la recepción lo permita.')
        callback.current()
      })
    } catch (reason) {
      if (current()) { setError(reason instanceof Error ? reason.message : 'No se pudo confirmar el resultado. Conserve la solicitud y consúltela con conexión.'); void restorePendingAfterFailure() }
    } finally { if (active.current === key) { busy.current = false; setWorking(false) } }
  }
  async function restorePendingAfterFailure() {
    const generation = revision.current
    try {
      const value = await readReceiptReversalIntent(localStorage.getItem(receiptReversalPendingKey(scope)), scope)
      if (active.current === key && revision.current === generation) setPending(value)
    } catch { if (active.current === key && revision.current === generation) setStorageError('No se pudo comprobar el almacenamiento original. Se bloquea otra anulación.') }
  }
  if (authLoading || permissionLoading || !scope.tenantId || !scope.actorId || !allowed) return null
  if (!canCreate && !pending && !storageError && !notice) return null
  const disabled = working || ready !== key || !!storageError
  const button = 'min-h-11 rounded-lg border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
  return <section className="mb-6 rounded-xl border border-border bg-card p-5 text-foreground" aria-labelledby="receipt-reversal-title" aria-busy={working}>
    <h2 id="receipt-reversal-title" className="text-lg font-semibold">{pending ? 'Anulación pendiente de verificar' : notice ? noticeKind === 'ABANDONED' ? 'Solicitud resuelta' : 'Anulación confirmada' : 'Anular recepción'}</h2>
    {notice && <p role="status" className="mt-3 max-w-prose text-sm">{notice}</p>}
    {notice && noticeKind === 'ABANDONED' && canCreate && <button type="button" className={`${button} mt-3`} disabled={disabled} onClick={() => { setNotice(null); setOpen(true) }}>Preparar otra solicitud</button>}
    {error && <p role="alert" className="mt-3 max-w-prose whitespace-pre-wrap break-words text-sm text-destructive">{error}</p>}
    {storageError && <div className="mt-3"><p role="alert" className="max-w-prose text-sm text-destructive">{storageError}</p>
      <button type="button" className={`${button} mt-3`} disabled={working} onClick={() => { void restore(); callback.current() }}>Volver a comprobar pendiente</button></div>}
    {pending ? <div className="mt-3 space-y-3">
      <p className="max-w-prose text-sm text-muted-foreground">Se conserva la solicitud de {pending.receiptNumber}. Consulte si ya se aplicó antes de preparar otra anulación.</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0"><dt className="font-medium">Motivo original</dt><dd className="whitespace-pre-wrap break-words text-muted-foreground">{pending.body.motivo}</dd></div>
        <div><dt className="font-medium">Fecha contable</dt><dd className="text-muted-foreground">{pending.body.fecha_contable}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-3"><button type="button" className={`${button} bg-primary text-primary-foreground`} disabled={disabled} onClick={() => void run('read')}>{working ? 'Verificando…' : 'Consultar resultado'}</button>
        <button type="button" className={button} disabled={disabled} onClick={() => void run('resolve')}>Resolver pendiente</button></div>
      <p className="max-w-prose text-sm text-muted-foreground">Resolver recupera una anulación ya confirmada. Si no se aplicó, cierra esta solicitud para impedir que llegue más tarde.</p>
    </div> : canCreate && !notice && <>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">Se conservará el documento original y se retirarán las cantidades aceptadas de la orden. La recepción debe conservar stock disponible y no tener factura vinculada ni devolución activa.</p>
      {!open ? <button type="button" className={`${button} mt-4`} disabled={disabled} onClick={() => setOpen(true)}>Preparar anulación</button>
        : <form className="mt-4 max-w-xl space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void run('write') }}>
          <div><label htmlFor="receipt-reversal-reason" className="mb-1 block text-sm font-medium">Motivo de anulación</label>
            <textarea id="receipt-reversal-reason" required minLength={5} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={disabled}
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          <div><label htmlFor="receipt-reversal-date" className="mb-1 block text-sm font-medium">Fecha contable de la anulación</label>
            <input id="receipt-reversal-date" type="date" required value={fecha} onChange={e => setFecha(e.target.value)} disabled={disabled} aria-describedby="receipt-reversal-date-help"
              className="min-h-11 rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p id="receipt-reversal-date-help" className="mt-1 text-sm text-muted-foreground">Seleccione una fecha en un período abierto.</p></div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={disabled} className="mt-0.5 size-5 shrink-0 accent-primary" />Confirmo que deseo anular toda esta recepción.</label>
          <div className="flex flex-wrap gap-3"><button type="submit" disabled={disabled || !confirmed} className={`${button} bg-destructive text-destructive-foreground`}>{working ? 'Confirmando…' : 'Anular recepción'}</button>
            <button type="button" className={button} disabled={working} onClick={() => setOpen(false)}>Volver al detalle</button></div>
        </form>}
    </>}
  </section>
}
