'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck2, FileCheck2, Loader2, RefreshCw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Warning { codigo: string; mensaje: string; bloquea_presentacion?: boolean }
interface DeclaracionAnual {
  id: string; ejercicio: number; regimen: string; version: number; estado: string
  constancia_numero?: string | null; fecha_presentacion?: string | null
  adiciones_tributarias: number; deducciones_tributarias: number
  perdidas_compensables: number; pagos_cuenta_renta: number
  credito_itan_renta: number; otros_creditos_renta: number; deducciones_itan: number
}
interface CalculoAnual {
  ejercicio: number; regimen: string; formulario: string; uit: number
  ingresos_netos: number; resultado_contable: number
  adiciones_tributarias: number; deducciones_tributarias: number; perdidas_compensables: number
  renta_neta_imponible: number; impuesto_renta_calculado: number
  pagos_cuenta_renta: number; credito_itan_renta: number; otros_creditos_renta: number
  renta_por_pagar: number; saldo_favor_renta: number
  activos_netos: number; deducciones_itan: number; base_imponible_itan: number; itan_calculado: number
  warnings: Warning[]
  source_snapshot: { corte: string; cantidad_ventas: number; ejercicio_cerrado: boolean }
  declaracion_vigente?: DeclaracionAnual | null
}

const currentYear = new Date().getFullYear()
const inputClass = 'mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function RentaAnualPage() {
  const { get, post } = useApi({ showErrorToast: true })
  const [ejercicio, setEjercicio] = useState(Math.max(2024, currentYear - 1))
  const [calculo, setCalculo] = useState<CalculoAnual | null>(null)
  const [historial, setHistorial] = useState<DeclaracionAnual[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [constancia, setConstancia] = useState('')
  const [fechaPresentacion, setFechaPresentacion] = useState('')
  const [ajustes, setAjustes] = useState({
    adiciones_tributarias: '0', deducciones_tributarias: '0', perdidas_compensables: '0',
    pagos_cuenta_renta: '', credito_itan_renta: '0', otros_creditos_renta: '0',
    deducciones_itan: '0', notas: '',
  })

  const money = (value: number | null | undefined) => new Intl.NumberFormat('es-PE', {
    style: 'currency', currency: 'PEN', minimumFractionDigits: 2,
  }).format(Number(value || 0))

  const payload = useMemo(() => ({
    ejercicio,
    adiciones_tributarias: Number(ajustes.adiciones_tributarias || 0),
    deducciones_tributarias: Number(ajustes.deducciones_tributarias || 0),
    perdidas_compensables: Number(ajustes.perdidas_compensables || 0),
    ...(ajustes.pagos_cuenta_renta === '' ? {} : { pagos_cuenta_renta: Number(ajustes.pagos_cuenta_renta) }),
    credito_itan_renta: Number(ajustes.credito_itan_renta || 0),
    otros_creditos_renta: Number(ajustes.otros_creditos_renta || 0),
    deducciones_itan: Number(ajustes.deducciones_itan || 0),
    ...(ajustes.notas.trim() ? { notas: ajustes.notas.trim() } : {}),
  }), [ajustes, ejercicio])

  const adoptar = (row?: DeclaracionAnual | null) => {
    if (!row) return
    setAjustes((current) => ({
      ...current,
      adiciones_tributarias: String(row.adiciones_tributarias || 0),
      deducciones_tributarias: String(row.deducciones_tributarias || 0),
      perdidas_compensables: String(row.perdidas_compensables || 0),
      pagos_cuenta_renta: String(row.pagos_cuenta_renta || 0),
      credito_itan_renta: String(row.credito_itan_renta || 0),
      otros_creditos_renta: String(row.otros_creditos_renta || 0),
      deducciones_itan: String(row.deducciones_itan || 0),
    }))
    setConstancia(row.constancia_numero || '')
  }

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      const [calcResponse, historyResponse] = await Promise.all([
        get(`/api/contabilidad/impuestos/anual?ejercicio=${ejercicio}`),
        get('/api/contabilidad/impuestos/anuales?limite=24'),
      ])
      if (!calcResponse?.success) throw new Error(calcResponse?.message || 'No se pudo calcular Renta Anual')
      setCalculo(calcResponse.data)
      adoptar(calcResponse.data?.declaracion_vigente)
      if (historyResponse?.success) setHistorial(historyResponse.data || [])
    } catch (err: any) { setError(err?.message || 'No se pudo cargar Renta Anual') }
    finally { setCargando(false) }
  }, [ejercicio, get])

  useEffect(() => { cargar() }, [cargar])

  const ejecutar = async (guardar: boolean) => {
    setProcesando(true); setError(null); setMensaje(null)
    try {
      const response = await post(guardar ? '/api/contabilidad/impuestos/anual' : '/api/contabilidad/impuestos/anual/calcular', payload)
      if (!response?.success) throw new Error(response?.message || 'No se pudo procesar el borrador anual')
      if (guardar) {
        setMensaje('Nueva versión guardada. Presente FV 710 e ITAN en SUNAT antes de registrar la constancia.')
        await cargar()
      } else {
        setCalculo(response.data)
        setMensaje('Cálculo actualizado; todavía no está guardado ni presentado.')
      }
    } catch (err: any) { setError(err?.message || 'No se pudo procesar el borrador anual') }
    finally { setProcesando(false) }
  }

  const registrar = async () => {
    const vigente = calculo?.declaracion_vigente
    if (!vigente?.id || !constancia.trim()) { setError('Guarda el borrador e ingresa la constancia obtenida en SUNAT.'); return }
    setProcesando(true); setError(null); setMensaje(null)
    try {
      const response = await post(`/api/contabilidad/impuestos/anuales/${vigente.id}/constancia`, {
        constancia: constancia.trim(),
        ...(fechaPresentacion ? { fecha_presentacion: new Date(fechaPresentacion).toISOString() } : {}),
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar la constancia')
      setMensaje('Constancia anual externa registrada y versión anterior rectificada, si correspondía.')
      await cargar()
    } catch (err: any) { setError(err?.message || 'No se pudo registrar la constancia') }
    finally { setProcesando(false) }
  }

  const setField = (field: string, value: string) => setAjustes((current) => ({ ...current, [field]: value }))
  const vigente = calculo?.declaracion_vigente
  const bloqueada = calculo?.warnings.some((warning) => warning.bloquea_presentacion)

  return <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
    <div className="mx-auto max-w-[1500px] space-y-4">
      <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4"><span className="flex size-12 items-center justify-center rounded-xl bg-cyan-400/10 text-primary"><CalendarCheck2 /></span><div>
            <h1 className="text-3xl font-bold">Renta Anual e ITAN — Perú</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Conciliación asistida del FV 710 desde resultados y balance. Las reparaciones tributarias y exclusiones ITAN requieren sustento del contador.</p>
          </div></div>
          <div className="flex items-end gap-2"><label><span className={labelClass}>Ejercicio</span><input type="number" min="2024" max={currentYear} value={ejercicio} onChange={(event) => setEjercicio(Number(event.target.value))} className={`${inputClass} w-28`} /></label>
            <Button variant="outline" onClick={cargar} disabled={cargando} className="gap-2"><RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />Actualizar</Button></div>
        </div>
      </section>

      <div className="flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /><p><strong>No presenta a SUNAT.</strong> El sistema congela el papel de trabajo; sólo la constancia obtenida en SOL acredita la presentación.</p></div>
      {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-600">{error}</div>}
      {mensaje && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-700">{mensaje}</div>}

      {cargando || !calculo ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : <>
        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{[
          ['Régimen', calculo.regimen], ['Formulario', calculo.formulario.replaceAll('_', ' ')], ['UIT', money(calculo.uit)],
          ['Renta por pagar', money(calculo.renta_por_pagar)], ['ITAN calculado', money(calculo.itan_calculado)],
          ['Estado', vigente ? `${vigente.estado} · v${vigente.version}` : 'Sin guardar'],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-4"><div className={labelClass}>{label}</div><div className="mt-2 font-bold">{value}</div></div>)}</section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-cyan-400/20 bg-card/70"><CardHeader><CardTitle>Base contable</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{[
            ['Ingresos netos', calculo.ingresos_netos], ['Resultado contable', calculo.resultado_contable], ['Activos netos', calculo.activos_netos], ['Pagos a cuenta detectados', calculo.pagos_cuenta_renta],
          ].map(([label, value]) => <div key={label as string} className="rounded-xl border border-cyan-400/15 p-3"><div className={labelClass}>{label}</div><div className="mt-1 font-bold">{money(value as number)}</div></div>)}
            <p className="sm:col-span-2 text-xs text-muted-foreground">Corte {new Date(calculo.source_snapshot.corte).toLocaleString('es-PE')} · {calculo.source_snapshot.cantidad_ventas} CPE · ejercicio {calculo.source_snapshot.ejercicio_cerrado ? 'cerrado' : 'abierto'}.</p>
          </CardContent></Card>
          <Card className="border-cyan-400/20 bg-card/70"><CardHeader><CardTitle>Conciliación tributaria</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{[
            ['adiciones_tributarias', 'Adiciones tributarias'], ['deducciones_tributarias', 'Deducciones tributarias'], ['perdidas_compensables', 'Pérdidas compensables'], ['pagos_cuenta_renta', 'Pagos a cuenta (revisable)'], ['credito_itan_renta', 'Crédito ITAN contra renta'], ['otros_creditos_renta', 'Otros créditos de renta'], ['deducciones_itan', 'Deducciones/exclusiones ITAN'],
          ].map(([field, label]) => <label key={field}><span className={labelClass}>{label}</span><input type="number" min="0" step="0.01" value={(ajustes as any)[field]} placeholder={field === 'pagos_cuenta_renta' ? money(calculo.pagos_cuenta_renta) : undefined} onChange={(event) => setField(field, event.target.value)} className={inputClass} /></label>)}
            <label className="sm:col-span-2"><span className={labelClass}>Notas y sustento</span><textarea value={ajustes.notas} onChange={(event) => setField('notas', event.target.value)} className={`${inputClass} min-h-20`} /></label>
            <div className="flex gap-2 sm:col-span-2"><Button variant="outline" onClick={() => ejecutar(false)} disabled={procesando}>Recalcular</Button><Button onClick={() => ejecutar(true)} disabled={procesando}>Guardar versión</Button></div>
          </CardContent></Card>
        </div>

        <Card className="border-cyan-400/20 bg-card/70"><CardHeader><CardTitle>Determinación</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
          ['Renta neta imponible', calculo.renta_neta_imponible], ['Impuesto a la renta', calculo.impuesto_renta_calculado], ['Saldo a favor', calculo.saldo_favor_renta], ['Base imponible ITAN', calculo.base_imponible_itan], ['ITAN', calculo.itan_calculado],
        ].map(([label, value]) => <div key={label as string} className="rounded-xl border border-cyan-400/15 p-3"><div className={labelClass}>{label}</div><div className="mt-1 font-bold">{money(value as number)}</div></div>)}</CardContent></Card>

        <Card className="border-amber-400/30 bg-amber-400/5"><CardHeader><CardTitle>Advertencias y controles</CardTitle></CardHeader><CardContent className="space-y-2">{calculo.warnings.map((warning) => <div key={warning.codigo} className="flex gap-3 rounded-xl border border-amber-400/20 p-3 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /><p>{warning.mensaje}{warning.bloquea_presentacion && <strong> Bloquea la constancia.</strong>}</p></div>)}</CardContent></Card>

        <Card className="border-cyan-400/20 bg-card/70"><CardHeader><CardTitle>Constancia FV 710 externa</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <label><span className={labelClass}>Número de constancia</span><input value={constancia} onChange={(event) => setConstancia(event.target.value)} className={inputClass} disabled={vigente?.estado === 'PRESENTADA'} /></label>
          <label><span className={labelClass}>Fecha y hora</span><input type="datetime-local" value={fechaPresentacion} onChange={(event) => setFechaPresentacion(event.target.value)} className={inputClass} disabled={vigente?.estado === 'PRESENTADA'} /></label>
          <Button onClick={registrar} disabled={procesando || bloqueada || !vigente || vigente.estado === 'PRESENTADA'} className="gap-2"><FileCheck2 className="h-4 w-4" />Registrar constancia</Button>
        </CardContent></Card>

        <Card className="border-cyan-400/20 bg-card/70"><CardHeader><CardTitle>Historial anual</CardTitle></CardHeader><CardContent className="space-y-2">{historial.length === 0 ? <p className="text-sm text-muted-foreground">Sin versiones guardadas.</p> : historial.map((row) => <div key={row.id} className="flex justify-between rounded-xl border border-cyan-400/15 p-3 text-sm"><strong>{row.ejercicio} · v{row.version} · {row.regimen}</strong><span>{row.estado}{row.constancia_numero ? ` · ${row.constancia_numero}` : ''}</span></div>)}</CardContent></Card>
      </>}
    </div>
  </div>
}
