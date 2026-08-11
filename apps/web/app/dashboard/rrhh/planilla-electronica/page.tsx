'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileCheck2, Loader2, RefreshCw, Save } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { fetchApi } from '@/lib/api-fetch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const inputClass = 'mt-1 w-full rounded-xl border border-cyan-400/20 bg-card px-3 py-2 text-sm outline-none focus:border-cyan-300'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.1em] text-primary/80'
const camposFicha = [
  ['apellido_paterno', 'Apellido paterno'], ['apellido_materno', 'Apellido materno'],
  ['situacion_educativa_codigo', 'Situación educativa (Tabla 9)'], ['ocupacion_codigo', 'Ocupación (Tabla 30)'],
  ['tipo_contrato_codigo', 'Contrato (Tabla 12)'], ['categoria_ocupacional_codigo', 'Categoría ocupacional (Tabla 24)'],
  ['tipo_trabajador_codigo', 'Tipo trabajador (Tabla 8)'], ['regimen_salud_codigo', 'Régimen salud (Tabla 32)'],
  ['regimen_pensionario_codigo', 'Régimen pensionario (Tabla 11)'], ['establecimiento_codigo', 'Establecimiento (4 dígitos)'],
] as const

export default function PlanillaElectronicaPeruPage() {
  const { get, post, put } = useApi({ showErrorToast: true })
  const [planillas, setPlanillas] = useState<any[]>([])
  const [planillaId, setPlanillaId] = useState('')
  const [paquete, setPaquete] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [fichas, setFichas] = useState<Record<string, any>>({})
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [evidencia, setEvidencia] = useState({ ticket_tregistro: '', cir_tregistro: '', constancia_plame: '', fecha_presentacion: '' })
  const mutationIntents = useRef(new Map<string, string>())
  const intentFor = (signature: string) => {
    const existing = mutationIntents.current.get(signature)
    if (existing) return existing
    const key = `rrhh-plame:${crypto.randomUUID()}`
    mutationIntents.current.set(signature, key)
    return key
  }

  const cargarBase = useCallback(async () => {
    setCargando(true)
    const [planillasResponse, historialResponse] = await Promise.all([
      get('/api/rrhh/planillas'), get('/api/rrhh/peru/planilla-electronica/paquetes/historial'),
    ])
    const items = Array.isArray(planillasResponse) ? planillasResponse : planillasResponse?.data || []
    setPlanillas(items)
    setHistorial(Array.isArray(historialResponse) ? historialResponse : historialResponse?.data || [])
    setPlanillaId((actual) => actual || items.find((item: any) => ['calculada', 'aprobada', 'pagada'].includes(String(item.estado).toLowerCase()))?.id || items[0]?.id || '')
    setCargando(false)
  }, [get])

  const previsualizar = useCallback(async () => {
    if (!planillaId) return
    setCargando(true)
    const response = await get(`/api/rrhh/peru/planilla-electronica/${planillaId}/preview`)
    const preview = response?.data ?? response
    if (preview) {
      setPaquete(preview)
      setFichas(Object.fromEntries((preview.trabajadores || []).map((item: any) => [item.empleado_id, { ...item.ficha, _horas_ordinarias: item.jornada?.horas_ordinarias ?? '', _dias_no_laborados: item.jornada?.dias_no_laborados ?? 0 }])))
    }
    setCargando(false)
  }, [get, planillaId])

  useEffect(() => { cargarBase() }, [cargarBase])
  useEffect(() => { previsualizar() }, [previsualizar])

  const guardarFicha = async (empleadoId: string) => {
    setProcesando(true)
    const signature = `ficha:${empleadoId}:${JSON.stringify(fichas[empleadoId] || {})}`
    const response = await put(`/api/rrhh/peru/planilla-electronica/empleados/${empleadoId}/ficha`, fichas[empleadoId], {
      headers: { 'Idempotency-Key': intentFor(signature) },
    })
    if (response) { mutationIntents.current.delete(signature); setMensaje('Ficha SUNAT guardada. Se recalcularon los bloqueos.'); await previsualizar() }
    setProcesando(false)
  }

  const guardarJornada = async (trabajador: any) => {
    setProcesando(true)
    const valores = fichas[trabajador.empleado_id] || {}
    const signature = `jornada:${trabajador.detalle_id}:${valores._horas_ordinarias}:${valores._dias_no_laborados}`
    const response = await put(`/api/rrhh/peru/planilla-electronica/detalles/${trabajador.detalle_id}/jornada`, {
      horas_ordinarias: Number(valores._horas_ordinarias), dias_no_laborados: Number(valores._dias_no_laborados),
    }, {
      headers: { 'Idempotency-Key': intentFor(signature) },
    })
    if (response) { mutationIntents.current.delete(signature); setMensaje('Jornada PLAME guardada con fuente manual del contador.'); await previsualizar() }
    setProcesando(false)
  }

  const guardarPaquete = async () => {
    setProcesando(true)
    const signature = `paquete:${planillaId}`
    const response = await post(`/api/rrhh/peru/planilla-electronica/${planillaId}/paquetes`, {}, {
      headers: { 'Idempotency-Key': intentFor(signature) },
    })
    if (response) { mutationIntents.current.delete(signature); setMensaje('Versión congelada con huellas SHA-256. Descárgala para revisión/PVS.'); await cargarBase() }
    setProcesando(false)
  }

  const descargar = async (item: any) => {
    const response = await fetchApi(`/api/rrhh/peru/planilla-electronica/paquetes/${item.id}/descargar`)
    if (!response.ok) return
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `PLANILLA_ELECTRONICA_${item.periodo}_v${item.version}.zip`
    link.click()
    URL.revokeObjectURL(url)
  }

  const registrarEvidencia = async () => {
    const vigente = historial.find((item) => item.planilla_id === planillaId && item.vigente)
    const requiereTregistro = Number(vigente?.resumen?.tregistro_novedades || 0) > 0
    if (!vigente || !evidencia.constancia_plame.trim() || (requiereTregistro && (!evidencia.ticket_tregistro.trim() || !evidencia.cir_tregistro.trim()))) return
    setProcesando(true)
    const signature = `evidencia:${vigente.id}:${JSON.stringify(evidencia)}`
    const response = await post(`/api/rrhh/peru/planilla-electronica/paquetes/${vigente.id}/evidencia`, {
      ticket_tregistro: evidencia.ticket_tregistro.trim(), cir_tregistro: evidencia.cir_tregistro.trim(),
      constancia_plame: evidencia.constancia_plame.trim(),
      ...(evidencia.fecha_presentacion ? { fecha_presentacion: new Date(evidencia.fecha_presentacion).toISOString() } : {}),
    }, {
      headers: { 'Idempotency-Key': intentFor(signature) },
    })
    if (response) { mutationIntents.current.delete(signature); setMensaje('Evidencia SUNAT registrada: constancia PLAME y, cuando corresponde, ticket/CIR T-Registro.'); await cargarBase() }
    setProcesando(false)
  }

  const vigente = historial.find((item) => item.planilla_id === planillaId && item.vigente)
  return <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground"><div className="mx-auto max-w-[1500px] space-y-4">
    <section className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-bold">Planilla electrónica Perú</h1><p className="mt-2 max-w-4xl text-sm text-muted-foreground">Prepara PLAME y las fuentes 04/05/11/17 de T‑Registro. PVS valida y genera el ZIP que se carga en SOL; el ERP conserva versión, huellas, ticket y CIR.</p></div><div className="flex items-end gap-2"><label><span className={labelClass}>Planilla</span><select value={planillaId} onChange={(event) => setPlanillaId(event.target.value)} className={inputClass}>{planillas.map((item) => <option key={item.id} value={item.id}>{item.periodo} · {item.estado}</option>)}</select></label><Button variant="outline" onClick={previsualizar}><RefreshCw className="mr-2 h-4 w-4"/>Validar</Button></div></div></section>
    <div className="flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-500"/><p><strong>El ZIP descargado del ERP no se carga directamente a SOL.</strong> Cargue los archivos RP_* en PVS, corrija errores y use únicamente el ZIP emitido por PVS.</p></div>
    {mensaje && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-700">{mensaje}</div>}
    {cargando ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div> : paquete && <>
      <section className="grid gap-3 md:grid-cols-5">{[['Trabajadores', paquete.resumen.trabajadores], ['Prestadores 4ta', paquete.resumen.prestadores_cuarta], ['Ingresos', `S/ ${Number(paquete.resumen.total_ingresos).toFixed(2)}`], ['Bloqueos', paquete.bloqueos.length], ['Estado', paquete.resumen.listo_para_pvs ? 'Sin bloqueos' : 'Requiere corrección']].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-4"><div className={labelClass}>{label}</div><div className="mt-2 text-lg font-bold">{value}</div></div>)}</section>
      {paquete.bloqueos.length > 0 && <Card className="border-red-400/30"><CardHeader><CardTitle>Bloqueos antes de PVS</CardTitle></CardHeader><CardContent className="space-y-2">{paquete.bloqueos.map((item: any, index: number) => <div key={`${item.codigo}-${index}`} className="rounded-xl border border-red-400/20 p-3 text-sm"><strong>{item.codigo}</strong> · {item.mensaje}</div>)}</CardContent></Card>}
      <Card><CardHeader><CardTitle>Ficha SUNAT por trabajador</CardTitle></CardHeader><CardContent className="space-y-4">{(paquete.trabajadores || []).map((trabajador: any) => <div key={trabajador.empleado_id} className="rounded-2xl border border-cyan-400/15 p-4"><div className="mb-3 flex items-center justify-between"><div><strong>{trabajador.nombre}</strong><div className="text-xs text-muted-foreground">{trabajador.tipo_documento} {trabajador.numero_documento} · jornada: {trabajador.jornada?.fuente}</div></div><Button size="sm" onClick={() => guardarFicha(trabajador.empleado_id)} disabled={procesando}><Save className="mr-2 h-4 w-4"/>Guardar ficha</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{camposFicha.map(([campo, etiqueta]) => <label key={campo}><span className={labelClass}>{etiqueta}</span><input value={fichas[trabajador.empleado_id]?.[campo] || ''} onChange={(event) => setFichas((actual) => ({ ...actual, [trabajador.empleado_id]: { ...actual[trabajador.empleado_id], [campo]: event.target.value } }))} className={inputClass}/></label>)}</div><div className="mt-4 grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label><span className={labelClass}>Horas ordinarias PLAME</span><input type="number" min="0" max="744" step="0.01" value={fichas[trabajador.empleado_id]?._horas_ordinarias ?? ''} onChange={(event) => setFichas((actual) => ({ ...actual, [trabajador.empleado_id]: { ...actual[trabajador.empleado_id], _horas_ordinarias: event.target.value } }))} className={inputClass}/></label><label><span className={labelClass}>Días no laborados</span><input type="number" min="0" max="31" value={fichas[trabajador.empleado_id]?._dias_no_laborados ?? 0} onChange={(event) => setFichas((actual) => ({ ...actual, [trabajador.empleado_id]: { ...actual[trabajador.empleado_id], _dias_no_laborados: event.target.value } }))} className={inputClass}/></label><Button variant="outline" onClick={() => guardarJornada(trabajador)} disabled={procesando}>Guardar jornada</Button></div></div>)}</CardContent></Card>
      <div className="flex justify-end"><Button onClick={guardarPaquete} disabled={procesando}><Save className="mr-2 h-4 w-4"/>Congelar nueva versión</Button></div>
    </>}
      <Card><CardHeader><CardTitle>Versiones y evidencia SUNAT</CardTitle></CardHeader><CardContent className="space-y-3">{historial.filter((item) => !planillaId || item.planilla_id === planillaId).map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-cyan-400/15 p-3 md:flex-row md:items-center md:justify-between"><div className="flex flex-wrap items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${item.estado === 'PRESENTADA' ? 'text-emerald-500' : 'text-muted-foreground'}`}/><strong>{item.periodo} · v{item.version}</strong><span>{item.estado}</span>{item.constancia_numero && <span>· Constancia PLAME {item.constancia_numero}</span>}{item.ticket_sunat && <span>· Ticket T-Registro {item.ticket_sunat}</span>}{item.tregistro_cir && <span>· CIR T-Registro {item.tregistro_cir}</span>}</div><Button variant="outline" size="sm" onClick={() => descargar(item)}><Download className="mr-2 h-4 w-4"/>Descargar</Button></div>)}
      {vigente && vigente.estado !== 'PRESENTADA' && <div className="grid gap-3 rounded-2xl border border-cyan-400/20 p-4 lg:grid-cols-[1fr_1fr_1fr_220px_auto] lg:items-end">{Number(vigente.resumen?.tregistro_novedades || 0) > 0 && <><label><span className={labelClass}>Ticket T-Registro</span><input value={evidencia.ticket_tregistro} onChange={(event) => setEvidencia({ ...evidencia, ticket_tregistro: event.target.value })} className={inputClass}/></label><label><span className={labelClass}>CIR T-Registro</span><input value={evidencia.cir_tregistro} onChange={(event) => setEvidencia({ ...evidencia, cir_tregistro: event.target.value })} className={inputClass}/></label></>}<label><span className={labelClass}>Constancia PLAME</span><input value={evidencia.constancia_plame} onChange={(event) => setEvidencia({ ...evidencia, constancia_plame: event.target.value })} className={inputClass}/></label><label><span className={labelClass}>Fecha</span><input type="datetime-local" value={evidencia.fecha_presentacion} onChange={(event) => setEvidencia({ ...evidencia, fecha_presentacion: event.target.value })} className={inputClass}/></label><Button onClick={registrarEvidencia} disabled={procesando || vigente.bloqueos?.length > 0}><FileCheck2 className="mr-2 h-4 w-4"/>Registrar evidencia</Button></div>}
    </CardContent></Card>
  </div></div>
}
