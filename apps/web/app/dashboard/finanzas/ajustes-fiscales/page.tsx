'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  BadgeDollarSign,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Origen = 'CLIENTE' | 'PROVEEDOR'
type Tipo = 'RETENCION' | 'PERCEPCION' | 'DETRACCION' | 'ANTICIPO'
type Mode = 'AJUSTE' | 'ANTICIPO'

interface OperacionFiscal {
  id: string
  origen: Origen
  tipo: Tipo
  cxc_id?: string
  cxp_id?: string
  monto: number
  moneda: string
  fecha: string
  referencia?: string
  estado: 'APLICADO' | 'PENDIENTE_TESORERIA' | 'ANULADO'
  created_at: string
}

interface Anticipo {
  id: string
  origen: Origen
  cliente_id?: string
  proveedor_id?: string
  monto_original: number
  monto_disponible: number
  moneda: string
  fecha: string
  referencia?: string
  estado: string
}

interface CuentaDocumento {
  id: string
  cliente_id?: string
  proveedor_id?: string
  numero_documento?: string
  numero?: string
  saldo?: number
  monto_pendiente?: number
  moneda?: string
  estado?: string
  cliente?: { razon_social?: string; nombre?: string }
  proveedor?: { razon_social?: string; nombre?: string }
  proveedores?: { razon_social?: string; nombre?: string }
}

interface Tercero {
  id: string
  razon_social?: string
  nombre?: string
  nombre_comercial?: string
}

interface CuentaBancaria {
  id: string
  nombre: string
  banco?: string
  moneda: string
  saldo: number
}

const inputClass = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground'
const tipos: Tipo[] = ['RETENCION', 'PERCEPCION', 'DETRACCION', 'ANTICIPO']

const unwrapRows = (response: any): any[] => {
  if (Array.isArray(response?.data)) return response.data
  if (Array.isArray(response?.data?.data)) return response.data.data
  return []
}

const newKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const todayInBrowser = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AjustesFiscalesPage() {
  const { get, post } = useApi({ throwOnError: true })
  const pendingIdempotencyKeys = useRef(new Map<string, string>())
  const [mode, setMode] = useState<Mode>('AJUSTE')
  const [origen, setOrigen] = useState<Origen>('CLIENTE')
  const [tipo, setTipo] = useState<Tipo>('RETENCION')
  const [cuentaId, setCuentaId] = useState('')
  const [terceroId, setTerceroId] = useState('')
  const [anticipoId, setAnticipoId] = useState('')
  const [bankId, setBankId] = useState('')
  const [monto, setMonto] = useState('')
  const [base, setBase] = useState('')
  const [tasa, setTasa] = useState('')
  const [moneda, setMoneda] = useState('PEN')
  const [fecha, setFecha] = useState('')
  const [referencia, setReferencia] = useState('')
  const [operaciones, setOperaciones] = useState<OperacionFiscal[]>([])
  const [anticipos, setAnticipos] = useState<Anticipo[]>([])
  const [cxc, setCxc] = useState<CuentaDocumento[]>([])
  const [cxp, setCxp] = useState<CuentaDocumento[]>([])
  const [clientes, setClientes] = useState<Tercero[]>([])
  const [proveedores, setProveedores] = useState<Tercero[]>([])
  const [bancos, setBancos] = useState<CuentaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [depositando, setDepositando] = useState<string | null>(null)
  const [depositBankId, setDepositBankId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        get('/api/retenciones?limit=100'),
        get('/api/retenciones/anticipos?disponibles=false&limit=100'),
        get('/api/finanzas/cxc?limit=100'),
        get('/api/finanzas/cxp?limit=100'),
        get('/api/ventas/clientes?limit=100'),
        get('/api/compras/proveedores?activo=true'),
        get('/api/finanzas/bancos/cuentas'),
      ])
      const value = (index: number) => results[index].status === 'fulfilled'
        ? (results[index] as PromiseFulfilledResult<any>).value
        : null
      setOperaciones(unwrapRows(value(0)))
      setAnticipos(unwrapRows(value(1)))
      setCxc(unwrapRows(value(2)))
      setCxp(unwrapRows(value(3)))
      setClientes(unwrapRows(value(4)))
      setProveedores(unwrapRows(value(5)))
      setBancos(unwrapRows(value(6)))
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    setFecha(todayInBrowser())
    void load()
  }, [load])

  useEffect(() => {
    setCuentaId('')
    setTerceroId('')
    setAnticipoId('')
  }, [origen, mode])

  const documentos = origen === 'CLIENTE' ? cxc : cxp
  const terceros = origen === 'CLIENTE' ? clientes : proveedores
  const anticiposDisponibles = useMemo(() => anticipos.filter((item) => {
    if (item.origen !== origen || Number(item.monto_disponible) <= 0) return false
    const documento = documentos.find((row) => row.id === cuentaId)
    const party = origen === 'CLIENTE' ? documento?.cliente_id : documento?.proveedor_id
    return !party || (origen === 'CLIENTE' ? item.cliente_id : item.proveedor_id) === party
  }), [anticipos, cuentaId, documentos, origen])

  const pendingDetractions = operaciones.filter(
    (item) => item.origen === 'PROVEEDOR' && item.tipo === 'DETRACCION' && item.estado === 'PENDIENTE_TESORERIA',
  )

  const selectedDocument = documentos.find((row) => row.id === cuentaId)
  const selectedAdvance = anticipos.find((row) => row.id === anticipoId)
  const calculatedAmount = base && tasa
    ? (Number(base) * Number(tasa) / 100).toFixed(2)
    : null

  const idempotentAttempt = (prefix: string, payload: Record<string, unknown>) => {
    const semanticKey = `${prefix}:${JSON.stringify(payload)}`
    let idempotencyKey = pendingIdempotencyKeys.current.get(semanticKey)
    if (!idempotencyKey) {
      idempotencyKey = newKey(prefix)
      pendingIdempotencyKeys.current.set(semanticKey, idempotencyKey)
    }
    return {
      semanticKey,
      body: { ...payload, idempotency_key: idempotencyKey },
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      if (mode === 'ANTICIPO') {
        const attempt = idempotentAttempt('anticipo', {
          origen,
          ...(origen === 'CLIENTE' ? { cliente_id: terceroId } : { proveedor_id: terceroId }),
          cuenta_bancaria_id: bankId,
          monto: Number(monto), moneda: moneda.toUpperCase(), fecha,
          referencia: referencia || undefined,
        })
        await post('/api/retenciones/anticipos', attempt.body)
        pendingIdempotencyKeys.current.delete(attempt.semanticKey)
      } else {
        const attempt = idempotentAttempt('ajuste-fiscal', {
          origen, tipo, cuenta_id: cuentaId, monto: Number(monto),
          base_calculo: base ? Number(base) : undefined,
          tasa: tasa ? Number(tasa) : undefined,
          moneda: moneda.toUpperCase(), fecha,
          referencia: referencia || undefined,
          anticipo_id: tipo === 'ANTICIPO' ? anticipoId : undefined,
        })
        await post('/api/retenciones/ajustes', attempt.body)
        pendingIdempotencyKeys.current.delete(attempt.semanticKey)
      }
      setMonto('')
      setBase('')
      setTasa('')
      setReferencia('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const depositar = async (operacion: OperacionFiscal) => {
    if (!depositBankId) return
    setDepositando(operacion.id)
    try {
      const attempt = idempotentAttempt(`deposito-detraccion-${operacion.id}`, {
        cuenta_bancaria_id: depositBankId,
        fecha,
        referencia: referencia || operacion.referencia || undefined,
      })
      await post(`/api/retenciones/${operacion.id}/depositar-detraccion`, attempt.body)
      pendingIdempotencyKeys.current.delete(attempt.semanticKey)
      await load()
    } finally {
      setDepositando(null)
    }
  }

  return (
    <div className="min-h-full bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-cyan-400/20 bg-card/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-primary">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Control fiscal y financiero</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight">Ajustes fiscales y anticipos</h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  Retenciones, percepciones y detracciones se aplican al documento. Un anticipo sólo puede aplicarse después de su movimiento bancario.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Nueva operación</CardTitle>
              <CardDescription>Elige si registrarás el dinero real de un anticipo o su aplicación documental.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-5 grid grid-cols-2 rounded-xl bg-muted p-1">
                {(['AJUSTE', 'ANTICIPO'] as Mode[]).map((item) => (
                  <button key={item} type="button" onClick={() => setMode(item)}
                    className={`rounded-lg px-4 py-2 text-sm font-bold transition ${mode === item ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>
                    {item === 'AJUSTE' ? 'Aplicar a documento' : 'Registrar anticipo'}
                  </button>
                ))}
              </div>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
                <label><span className={labelClass}>Origen</span>
                  <select className={inputClass} value={origen} onChange={(e) => setOrigen(e.target.value as Origen)}>
                    <option value="CLIENTE">Cliente / CxC</option><option value="PROVEEDOR">Proveedor / CxP</option>
                  </select>
                </label>

                {mode === 'AJUSTE' ? <>
                  <label><span className={labelClass}>Tipo</span>
                    <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
                      {tipos.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="sm:col-span-2"><span className={labelClass}>Documento con saldo</span>
                    <select required className={inputClass} value={cuentaId} onChange={(e) => {
                      const id = e.target.value
                      setCuentaId(id)
                      const row = documentos.find((item) => item.id === id)
                      if (row?.moneda) setMoneda(row.moneda)
                    }}>
                      <option value="">Seleccionar CxC/CxP…</option>
                      {documentos.filter((item) => !['ANULADA', 'PAGADA', 'CANCELADO'].includes(String(item.estado))).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.numero_documento || item.numero || item.id.slice(0, 8)} · saldo {Number(item.saldo ?? item.monto_pendiente ?? 0).toFixed(2)} {item.moneda}
                        </option>
                      ))}
                    </select>
                  </label>
                  {tipo === 'ANTICIPO' && <label className="sm:col-span-2"><span className={labelClass}>Anticipo disponible</span>
                    <select required className={inputClass} value={anticipoId} onChange={(e) => {
                      const id = e.target.value
                      setAnticipoId(id)
                      const advance = anticipos.find((item) => item.id === id)
                      if (advance) { setMoneda(advance.moneda); setMonto(String(advance.monto_disponible)) }
                    }}>
                      <option value="">Seleccionar anticipo real…</option>
                      {anticiposDisponibles.map((item) => <option key={item.id} value={item.id}>
                        {item.referencia || item.id.slice(0, 8)} · disponible {Number(item.monto_disponible).toFixed(2)} {item.moneda}
                      </option>)}
                    </select>
                  </label>}
                </> : <>
                  <label><span className={labelClass}>{origen === 'CLIENTE' ? 'Cliente' : 'Proveedor'}</span>
                    <select required className={inputClass} value={terceroId} onChange={(e) => setTerceroId(e.target.value)}>
                      <option value="">Seleccionar…</option>
                      {terceros.map((item) => <option key={item.id} value={item.id}>{item.razon_social || item.nombre_comercial || item.nombre || item.id}</option>)}
                    </select>
                  </label>
                  <label><span className={labelClass}>Cuenta bancaria</span>
                    <select required className={inputClass} value={bankId} onChange={(e) => {
                      const id = e.target.value
                      setBankId(id)
                      const bank = bancos.find((item) => item.id === id)
                      if (bank) setMoneda(bank.moneda)
                    }}>
                      <option value="">Seleccionar banco…</option>
                      {bancos.map((item) => <option key={item.id} value={item.id}>{item.banco || item.nombre} · {item.moneda} {Number(item.saldo).toFixed(2)}</option>)}
                    </select>
                  </label>
                </>}

                {mode === 'AJUSTE' && tipo !== 'ANTICIPO' && <>
                  <label><span className={labelClass}>Base (opcional)</span><input className={inputClass} type="number" min="0.01" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} /></label>
                  <label><span className={labelClass}>Tasa % (opcional)</span><input className={inputClass} type="number" min="0" max="100" step="0.000001" value={tasa} onChange={(e) => setTasa(e.target.value)} /></label>
                </>}
                <label><span className={labelClass}>Monto {calculatedAmount ? `· cálculo ${calculatedAmount}` : ''}</span>
                  <input required className={inputClass} type="number" min="0.01" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} max={selectedAdvance?.monto_disponible || undefined} />
                </label>
                <label><span className={labelClass}>Moneda</span><input required className={inputClass} maxLength={3} value={moneda} onChange={(e) => setMoneda(e.target.value.toUpperCase())} readOnly={Boolean(selectedDocument || selectedAdvance || (mode === 'ANTICIPO' && bankId))} /></label>
                <label><span className={labelClass}>Fecha</span><input required className={inputClass} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
                <label><span className={labelClass}>Referencia</span><input className={inputClass} value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} placeholder="Operación o constancia" /></label>
                <div className="sm:col-span-2">
                  <Button className="h-auto min-h-10 w-full whitespace-normal py-2 leading-tight" type="submit" disabled={saving || (Boolean(base) !== Boolean(tasa))}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    {mode === 'ANTICIPO' ? 'Registrar movimiento y anticipo' : 'Aplicar ajuste al documento'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Detracciones por depositar</CardTitle><CardDescription>La CxP ya fue reclasificada; este paso recién mueve el banco.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <label><span className={labelClass}>Banco para el depósito</span>
                <select className={inputClass} value={depositBankId} onChange={(e) => setDepositBankId(e.target.value)}>
                  <option value="">Seleccionar cuenta…</option>
                  {bancos.map((item) => <option key={item.id} value={item.id}>{item.banco || item.nombre} · {item.moneda} {Number(item.saldo).toFixed(2)}</option>)}
                </select>
              </label>
              {pendingDetractions.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay detracciones pendientes.</p> : pendingDetractions.map((item) => (
                <div key={item.id} className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{item.referencia || item.cxp_id}</p><p className="mt-1 text-sm text-muted-foreground">{item.fecha} · {item.moneda}</p></div><p className="text-lg font-black">{Number(item.monto).toFixed(2)}</p></div>
                  <Button className="mt-4 w-full" variant="outline" disabled={!depositBankId || depositando === item.id} onClick={() => void depositar(item)}>
                    {depositando === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />} Depositar detracción
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-5 w-5 text-primary" /> Operaciones recientes</CardTitle></CardHeader><CardContent className="space-y-2">
            {loading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin" /> : operaciones.slice(0, 12).map((item) => (
              <div key={item.id} className="grid grid-cols-1 gap-3 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto]">
                <div><p className="font-bold">{item.tipo} · {item.origen}</p><p className="text-muted-foreground">{item.referencia || (item.cxc_id || item.cxp_id)?.slice(0, 8)} · {item.fecha}</p></div>
                <div className="text-left sm:text-right"><p className="font-black">{Number(item.monto).toFixed(2)} {item.moneda}</p><p className={item.estado === 'PENDIENTE_TESORERIA' ? 'text-amber-500' : 'text-emerald-500'}>{item.estado}</p></div>
              </div>
            ))}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5 text-primary" /> Anticipos y disponibilidad</CardTitle></CardHeader><CardContent className="space-y-2">
            {loading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin" /> : anticipos.slice(0, 12).map((item) => (
              <div key={item.id} className="grid grid-cols-1 gap-3 rounded-xl border p-3 text-sm sm:grid-cols-[1fr_auto]">
                <div><p className="font-bold">{item.origen} · {item.referencia || item.id.slice(0, 8)}</p><p className="text-muted-foreground">Original {Number(item.monto_original).toFixed(2)} {item.moneda} · {item.fecha}</p></div>
                <div className="text-left sm:text-right"><p className="font-black">{Number(item.monto_disponible).toFixed(2)} {item.moneda}</p><p className="text-muted-foreground">disponible</p></div>
              </div>
            ))}
          </CardContent></Card>
        </div>
      </div>
    </div>
  )
}
