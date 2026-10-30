'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import toast from 'react-hot-toast'

const inputClass = 'w-full rounded-lg border border-border bg-background p-2 text-sm'
const today = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

export default function CreditoProveedorPanel({ nota, onUpdated }: { nota: any; onUpdated: () => void }) {
  const { get, post } = useApi({ throwOnError: true })
  const { hasPermission: canManage } = usePermission('finanzas', 'gestionar', 'cxp')
  const { hasPermission: canRefund } = usePermission('finanzas', 'gestionar', 'bancos')
  const { formatCurrency } = useLocalizedMoney()
  const router = useRouter()
  const intent = useRef<{ fingerprint: string; key: string } | null>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ accion: 'APLICACION', monto: '', fecha: today(), factura_id: '', cuenta_bancaria_id: '', tipo_cambio: '', referencia: '' })
  const available = Number(nota.saldo_credito_proveedor || 0)
  const load = useCallback(async () => {
    setError(''); setLoading(true)
    try {
      const [history, targets, accounts] = await Promise.all([
        get(`/api/finanzas/cxp/${nota.id}/credito-movimientos`),
        get(`/api/finanzas/cxp?proveedor_id=${encodeURIComponent(nota.proveedor_id)}`),
        canRefund ? get('/api/finanzas/bancos/cuentas') : Promise.resolve({ success: true, data: [] }),
      ])
      if (!history?.success || !targets?.success || !accounts?.success) throw new Error('No se pudo consultar el crédito o sus destinos')
      setMovements(history.data || [])
      setInvoices((targets.data || []).filter((row: any) => row.moneda === nota.moneda && row.tipo_documento !== 'NOTA_CREDITO' && Number(row.saldo) > 0 && row.estado !== 'ANULADA'))
      setBanks((accounts.data || []).filter((row: any) => row.moneda === nota.moneda && row.activa !== false && row.activo !== false && String(row.estado).toUpperCase() === 'ACTIVO'))
    } catch (failure: any) { setError(failure?.message || 'No se pudo consultar el crédito') }
    finally { setLoading(false) }
  }, [nota.id, nota.proveedor_id, nota.moneda, get, canRefund])
  useEffect(() => { void load() }, [load])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(form.monto)
    if (!(amount > 0) || amount > available) return toast.error('El importe debe estar dentro del crédito disponible')
    const payload = {
      accion: form.accion, monto: amount, fecha: form.fecha,
      ...(form.accion === 'APLICACION' ? { factura_id: form.factura_id }
        : { cuenta_bancaria_id: form.cuenta_bancaria_id, tipo_cambio: nota.moneda === 'PEN' ? 1 : Number(form.tipo_cambio), referencia: form.referencia.trim() || undefined }),
    }
    const fingerprint = JSON.stringify([nota.id, payload])
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: `supplier-credit:${crypto.randomUUID()}` }
    setSaving(true)
    try {
      const response = await post(`/api/finanzas/cxp/${nota.id}/usar-credito`, {
        ...payload, idempotency_key: intent.current.key,
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo confirmar la operación')
      toast.success(form.accion === 'APLICACION' ? 'Crédito aplicado a la factura' : 'Reembolso registrado en el banco')
      intent.current = null
      setForm((current) => ({ ...current, monto: '' }))
      onUpdated(); await load()
    } catch (failure: any) { toast.error(failure?.message || 'No se pudo utilizar el crédito; puede reintentar') }
    finally { setSaving(false) }
  }
  return <section className="mb-6 space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="text-lg font-bold">Crédito disponible del proveedor: {formatCurrency(available, nota.moneda)}</h2>
    {error && <div role="alert" className="text-sm text-red-500">{error} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></div>}
    {canManage && available > 0 && <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <label>Operación<select className={inputClass} disabled={saving} value={form.accion} onChange={(e) => setForm({ ...form, accion: e.target.value })}><option value="APLICACION">Aplicar a otra factura</option>{canRefund && <option value="REEMBOLSO">Reembolso recibido por banco</option>}</select></label>
      <label>Importe<input required type="number" step="0.01" min="0.01" max={available} className={inputClass} disabled={saving} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></label>
      <label>Fecha<input required type="date" min={String(nota.fecha_emision).slice(0, 10)} className={inputClass} disabled={saving} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></label>
      {form.accion === 'APLICACION' ? <label>Factura pendiente<select required className={inputClass} disabled={saving || loading} value={form.factura_id} onChange={(e) => setForm({ ...form, factura_id: e.target.value })}><option value="">Seleccione factura</option>{invoices.map((row) => <option key={row.id} value={row.id}>{row.numero_documento} · saldo {Number(row.saldo).toFixed(2)}</option>)}</select>{!loading && !error && invoices.length === 0 && <span className="text-xs">No hay facturas pendientes del mismo proveedor y moneda.</span>}</label> : <>
        <label>Banco que recibió el reembolso<select required className={inputClass} disabled={saving || loading} value={form.cuenta_bancaria_id} onChange={(e) => setForm({ ...form, cuenta_bancaria_id: e.target.value })}><option value="">Seleccione cuenta bancaria</option>{banks.map((row) => <option key={row.id} value={row.id}>{row.nombre || row.banco} · {row.numero_cuenta}</option>)}</select></label>
        <label>Referencia bancaria<input maxLength={120} className={inputClass} disabled={saving} value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} /></label>
        {nota.moneda !== 'PEN' && <label>Tipo de cambio del reembolso<input required type="number" step="0.000001" min="0.000001" className={inputClass} disabled={saving} value={form.tipo_cambio} onChange={(e) => setForm({ ...form, tipo_cambio: e.target.value })} /></label>}
      </>}
      <div className="md:col-span-2"><button type="submit" disabled={saving || loading || !!error} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{saving ? 'Registrando…' : form.accion === 'APLICACION' ? 'Aplicar crédito' : 'Registrar reembolso'}</button></div>
    </form>}
    <h3 className="font-semibold">Historial del crédito</h3>
    {loading ? <p>Consultando movimientos…</p> : <div className="overflow-x-auto"><table><thead><tr><th>Fecha</th><th>Operación</th><th>Importe</th><th>Saldo</th><th>Destino</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id}><td>{String(row.fecha).slice(0, 10)}</td><td>{row.tipo}</td><td>{formatCurrency(Number(row.monto), row.moneda)}</td><td>{formatCurrency(Number(row.saldo_nuevo), row.moneda)}</td><td>{row.factura_id ? <button className="text-primary underline" onClick={() => router.push(`/dashboard/finanzas/cxp/${row.factura_id}`)}>Ver factura</button> : row.movimiento_bancario_id ? 'Reembolso bancario' : '—'}</td></tr>)}</tbody></table></div>}
  </section>
}
