'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calculator, CheckCircle2, FileCheck2, Loader2, RefreshCw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Warning {
  codigo: string
  mensaje: string
  bloquea_presentacion?: boolean
}

interface CalculoMensual {
  periodo: string
  regimen: 'NRUS' | 'RER' | 'MYPE' | 'GENERAL'
  formulario: string
  ventas_gravadas: number
  ventas_exoneradas: number
  ventas_inafectas: number
  exportaciones: number
  igv_ventas: number
  compras_gravadas: number
  igv_compras: number
  saldo_favor_anterior: number
  retenciones_igv: number
  percepciones_igv: number
  otros_creditos_igv: number
  igv_resultante: number
  saldo_favor_siguiente: number
  ingresos_netos_mes: number
  ingresos_netos_acumulados: number
  coeficiente_renta: number | null
  pago_cuenta_renta: number
  nrus_categoria: number | null
  nrus_cuota: number | null
  warnings: Warning[]
  source_snapshot: {
    corte: string
    cantidad_ventas: number
    cantidad_compras: number
    advertencia: string
  }
  declaracion_vigente?: Declaracion | null
}

interface Declaracion extends Omit<CalculoMensual, 'formulario' | 'source_snapshot' | 'declaracion_vigente'> {
  id: string
  version: number
  vigente: boolean
  estado: 'BORRADOR' | 'PRESENTADA' | 'RECTIFICADA' | 'ANULADA'
  constancia_numero?: string | null
  fecha_presentacion?: string | null
  source_snapshot: CalculoMensual['source_snapshot']
}

const hoy = new Date()
const periodoInicial = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
const inputClass = 'mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function ImpuestosMensualesPage() {
  const { get, post } = useApi({ showErrorToast: true })
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [calculo, setCalculo] = useState<CalculoMensual | null>(null)
  const [historial, setHistorial] = useState<Declaracion[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [constancia, setConstancia] = useState('')
  const [fechaPresentacion, setFechaPresentacion] = useState('')
  const [ajustes, setAjustes] = useState({
    saldo_favor_anterior: '0',
    retenciones_igv: '0',
    percepciones_igv: '0',
    otros_creditos_igv: '0',
    coeficiente_renta: '',
    notas: '',
  })

  const money = (value: number | null | undefined) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value || 0))

  const payload = useMemo(() => ({
    periodo,
    saldo_favor_anterior: Number(ajustes.saldo_favor_anterior || 0),
    retenciones_igv: Number(ajustes.retenciones_igv || 0),
    percepciones_igv: Number(ajustes.percepciones_igv || 0),
    otros_creditos_igv: Number(ajustes.otros_creditos_igv || 0),
    ...(ajustes.coeficiente_renta === '' ? {} : { coeficiente_renta: Number(ajustes.coeficiente_renta) }),
    ...(ajustes.notas.trim() ? { notas: ajustes.notas.trim() } : {}),
  }), [ajustes, periodo])

  const adoptarDeclaracion = (declaracion?: Declaracion | null) => {
    if (!declaracion) return
    setAjustes({
      saldo_favor_anterior: String(declaracion.saldo_favor_anterior || 0),
      retenciones_igv: String(declaracion.retenciones_igv || 0),
      percepciones_igv: String(declaracion.percepciones_igv || 0),
      otros_creditos_igv: String(declaracion.otros_creditos_igv || 0),
      coeficiente_renta: declaracion.coeficiente_renta === null ? '' : String(declaracion.coeficiente_renta),
      notas: '',
    })
    setConstancia(declaracion.constancia_numero || '')
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [calculoResponse, historialResponse] = await Promise.all([
        get(`/api/contabilidad/impuestos/mensual?periodo=${periodo}`),
        get('/api/contabilidad/impuestos/declaraciones?limite=36'),
      ])
      if (!calculoResponse?.success) throw new Error(calculoResponse?.message || 'No se pudo calcular el período')
      setCalculo(calculoResponse.data)
      if (historialResponse?.success) setHistorial(historialResponse.data || [])
      adoptarDeclaracion(calculoResponse.data?.declaracion_vigente)
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el espacio tributario')
    } finally {
      setCargando(false)
    }
  }, [get, periodo])

  useEffect(() => { cargar() }, [cargar])

  const previsualizar = async () => {
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const response = await post('/api/contabilidad/impuestos/mensual/calcular', payload)
      if (!response?.success) throw new Error(response?.message || 'No se pudo recalcular')
      setCalculo(response.data)
      setMensaje('Cálculo actualizado. Todavía no se guardó ni presentó.')
    } catch (err: any) {
      setError(err?.message || 'No se pudo recalcular')
    } finally {
      setProcesando(false)
    }
  }

  const guardar = async () => {
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const response = await post('/api/contabilidad/impuestos/mensual', payload)
      if (!response?.success) throw new Error(response?.message || 'No se pudo guardar')
      setMensaje('Borrador versionado. Revísalo contra SIRE y preséntalo en SUNAT antes de registrar la constancia.')
      await cargar()
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar el borrador')
    } finally {
      setProcesando(false)
    }
  }

  const registrarConstancia = async () => {
    const vigente = calculo?.declaracion_vigente
    if (!vigente?.id) {
      setError('Primero guarda un borrador vigente.')
      return
    }
    if (!constancia.trim()) {
      setError('Ingresa el número de constancia obtenido en SUNAT.')
      return
    }
    setProcesando(true)
    setError(null)
    setMensaje(null)
    try {
      const response = await post(`/api/contabilidad/impuestos/declaraciones/${vigente.id}/constancia`, {
        constancia: constancia.trim(),
        ...(fechaPresentacion ? { fecha_presentacion: new Date(fechaPresentacion).toISOString() } : {}),
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar la constancia')
      setMensaje('Constancia externa registrada. El ERP conserva la versión y su evidencia.')
      await cargar()
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar la constancia')
    } finally {
      setProcesando(false)
    }
  }

  const vigente = calculo?.declaracion_vigente
  const bloqueada = calculo?.warnings?.some((warning) => warning.bloquea_presentacion)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <Calculator className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">IGV y Renta mensual — Perú</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Borrador asistido desde CPE y cuentas por pagar. Contrasta los importes con RVIE/RCE,
                  presenta el formulario en SUNAT y registra aquí la constancia obtenida.
                </p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className={labelClass}>Período</label>
                <input type="month" value={periodo} onChange={(event) => setPeriodo(event.target.value)} className={inputClass} />
              </div>
              <Button type="button" variant="outline" onClick={cargar} disabled={cargando} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
              </Button>
            </div>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p><strong>No es un envío automático.</strong> “Borrador” significa que SUNAT todavía no lo recibió. Sólo una constancia real cambia el estado a presentada.</p>
        </div>

        {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-600">{error}</div>}
        {mensaje && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700">{mensaje}</div>}

        {cargando || !calculo ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[
                ['Régimen', calculo.regimen],
                ['Formulario', calculo.formulario],
                ['IGV resultante', money(calculo.igv_resultante)],
                ['Pago a cuenta renta', money(calculo.pago_cuenta_renta)],
                ['Estado', vigente ? `${vigente.estado} · v${vigente.version}` : 'Sin guardar'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-4">
                  <div className={labelClass}>{label}</div><div className="mt-2 text-lg font-bold">{value}</div>
                </div>
              ))}
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border-cyan-400/20 bg-card/70">
                <CardHeader><CardTitle>Fuentes del período</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Ventas gravadas', calculo.ventas_gravadas],
                    ['Ventas exoneradas', calculo.ventas_exoneradas],
                    ['Ventas inafectas', calculo.ventas_inafectas],
                    ['Exportaciones', calculo.exportaciones],
                    ['IGV ventas', calculo.igv_ventas],
                    ['Compras gravadas', calculo.compras_gravadas],
                    ['IGV compras', calculo.igv_compras],
                    ['Ingresos acumulados', calculo.ingresos_netos_acumulados],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-xl border border-cyan-400/15 p-3">
                      <div className={labelClass}>{label}</div><div className="mt-1 font-bold">{money(value as number)}</div>
                    </div>
                  ))}
                  <p className="sm:col-span-2 text-xs text-muted-foreground">
                    Corte {new Date(calculo.source_snapshot.corte).toLocaleString('es-PE')} · {calculo.source_snapshot.cantidad_ventas} ventas · {calculo.source_snapshot.cantidad_compras} compras.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-cyan-400/20 bg-card/70">
                <CardHeader><CardTitle>Créditos y parámetros revisables</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['saldo_favor_anterior', 'Saldo a favor anterior'],
                    ['retenciones_igv', 'Retenciones IGV'],
                    ['percepciones_igv', 'Percepciones IGV'],
                    ['otros_creditos_igv', 'Otros créditos IGV'],
                  ].map(([field, label]) => (
                    <label key={field}><span className={labelClass}>{label}</span>
                      <input type="number" min="0" step="0.01" value={(ajustes as any)[field]} onChange={(event) => setAjustes((current) => ({ ...current, [field]: event.target.value }))} className={inputClass} />
                    </label>
                  ))}
                  {(calculo.regimen === 'GENERAL' || calculo.regimen === 'MYPE') && (
                    <label><span className={labelClass}>Coeficiente renta (decimal)</span>
                      <input type="number" min="0" max="1" step="0.000001" placeholder="Ej. 0.0185" value={ajustes.coeficiente_renta} onChange={(event) => setAjustes((current) => ({ ...current, coeficiente_renta: event.target.value }))} className={inputClass} />
                    </label>
                  )}
                  <label className="sm:col-span-2"><span className={labelClass}>Notas de revisión</span>
                    <textarea value={ajustes.notas} onChange={(event) => setAjustes((current) => ({ ...current, notas: event.target.value }))} className={`${inputClass} min-h-20`} />
                  </label>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button type="button" variant="outline" onClick={previsualizar} disabled={procesando}>Recalcular</Button>
                    <Button type="button" onClick={guardar} disabled={procesando}>Guardar nueva versión</Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {calculo.regimen === 'NRUS' && (
              <Card className="border-cyan-400/20 bg-card/70"><CardContent className="p-5">
                <div className={labelClass}>Resultado NRUS</div>
                <p className="mt-2 text-lg font-bold">{calculo.nrus_categoria ? `Categoría ${calculo.nrus_categoria} · cuota ${money(calculo.nrus_cuota)}` : 'Sin categoría válida'}</p>
              </CardContent></Card>
            )}

            {calculo.warnings.length > 0 && (
              <Card className="border-amber-400/30 bg-amber-400/5"><CardHeader><CardTitle>Revisión obligatoria</CardTitle></CardHeader>
                <CardContent className="space-y-2">{calculo.warnings.map((warning) => (
                  <div key={warning.codigo} className="flex gap-3 rounded-xl border border-amber-400/20 p-3 text-sm">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /><p>{warning.mensaje}{warning.bloquea_presentacion && <strong> Bloquea registrar la constancia.</strong>}</p>
                  </div>
                ))}</CardContent>
              </Card>
            )}

            <Card className="border-cyan-400/20 bg-card/70">
              <CardHeader><CardTitle>Constancia SUNAT externa</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
                <label><span className={labelClass}>Número de constancia</span><input value={constancia} onChange={(event) => setConstancia(event.target.value)} className={inputClass} disabled={vigente?.estado === 'PRESENTADA'} /></label>
                <label><span className={labelClass}>Fecha y hora</span><input type="datetime-local" value={fechaPresentacion} onChange={(event) => setFechaPresentacion(event.target.value)} className={inputClass} disabled={vigente?.estado === 'PRESENTADA'} /></label>
                <Button type="button" onClick={registrarConstancia} disabled={procesando || bloqueada || !vigente || vigente.estado === 'PRESENTADA'} className="gap-2"><FileCheck2 className="h-4 w-4" />Registrar constancia</Button>
              </CardContent>
            </Card>

            <Card className="border-cyan-400/20 bg-card/70">
              <CardHeader><CardTitle>Historial de versiones</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {historial.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay borradores guardados.</p> : historial.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-cyan-400/15 p-3 text-sm md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${item.estado === 'PRESENTADA' ? 'text-emerald-500' : 'text-muted-foreground'}`} /><strong>{item.periodo} · v{item.version}</strong><span>{item.regimen}</span></div>
                    <div className="text-muted-foreground">{item.estado}{item.constancia_numero ? ` · constancia ${item.constancia_numero}` : ''}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
