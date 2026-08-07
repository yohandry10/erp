'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { parseDateLocal } from '@/lib/date-utils'
import { AlertCircle, CalendarClock, FileStack, Loader2, Plus, PlayCircle, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Plantilla {
  id: string
  nombre: string
  descripcion?: string
  concepto: string
  referencia?: string
  periodicidad: 'NINGUNA' | 'MENSUAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
  dia_ejecucion?: number
  proxima_ejecucion?: string
  ultima_ejecucion?: string
  crear_en_estado: 'BORRADOR' | 'CONFIRMADO'
  activa: boolean
}

interface Cuenta {
  id: string
  codigo: string
  nombre: string
}

interface CentroCosto {
  id: string
  codigo?: string
  nombre: string
}

interface DetalleForm {
  cuenta_id: string
  debe: string
  haber: string
  concepto: string
  centro_costo_id: string
}

const hoy = new Date().toISOString().slice(0, 10)
const plantillaInicial = {
  nombre: '',
  descripcion: '',
  concepto: '',
  referencia: '',
  periodicidad: 'MENSUAL' as Plantilla['periodicidad'],
  dia_ejecucion: '1',
  fecha_inicio: hoy,
  fecha_fin: '',
  crear_en_estado: 'BORRADOR' as Plantilla['crear_en_estado'],
}

const detalleInicial = (): DetalleForm => ({
  cuenta_id: '',
  debe: '',
  haber: '',
  concepto: '',
  centro_costo_id: '',
})

const PERIODICIDAD_LABEL: Record<Plantilla['periodicidad'], string> = {
  NINGUNA: 'Manual',
  MENSUAL: 'Mensual',
  BIMESTRAL: 'Bimestral',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
}

export default function PlantillasAsientosPage() {
  const router = useRouter()
  const { get, post, del } = useApi()

  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [generando, setGenerando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [form, setForm] = useState(plantillaInicial)
  const [detalles, setDetalles] = useState<DetalleForm[]>([detalleInicial(), detalleInicial()])

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [response, cuentasResponse, centrosResponse] = await Promise.all([
        get('/api/contabilidad/plantillas-asientos'),
        get('/api/contabilidad/plan-cuentas'),
        get('/api/contabilidad/centros-costo'),
      ])
      if (response?.success) setPlantillas(response.data || [])
      if (cuentasResponse?.success) setCuentas(cuentasResponse.data || [])
      if (centrosResponse?.success) setCentrosCosto(centrosResponse.data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar las plantillas')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    cargar()
  }, [cargar])

  const actualizarDetalle = (indice: number, campo: keyof DetalleForm, valor: string) => {
    setDetalles((actuales) => actuales.map((detalle, i) => i === indice ? { ...detalle, [campo]: valor } : detalle))
  }

  const crearPlantilla = async (event: React.FormEvent) => {
    event.preventDefault()
    const lineas = detalles.map((detalle) => ({
      cuenta_id: detalle.cuenta_id,
      debe: Number(detalle.debe || 0),
      haber: Number(detalle.haber || 0),
      concepto: detalle.concepto.trim() || form.concepto.trim(),
      centro_costo_id: detalle.centro_costo_id || undefined,
    }))
    const totalDebe = Math.round(lineas.reduce((sum, detalle) => sum + detalle.debe, 0) * 100)
    const totalHaber = Math.round(lineas.reduce((sum, detalle) => sum + detalle.haber, 0) * 100)
    if (!form.nombre.trim() || !form.concepto.trim()) {
      setError('Nombre y concepto son obligatorios.')
      return
    }
    if (lineas.length < 2 || lineas.some((detalle) => !detalle.cuenta_id || (!detalle.debe && !detalle.haber) || (detalle.debe > 0 && detalle.haber > 0))) {
      setError('Cada línea necesita una cuenta y un importe sólo en debe o sólo en haber.')
      return
    }
    if (totalDebe <= 0 || totalDebe !== totalHaber) {
      setError(`La plantilla no cuadra: debe ${(totalDebe / 100).toFixed(2)} y haber ${(totalHaber / 100).toFixed(2)}.`)
      return
    }
    const dia = Number(form.dia_ejecucion)
    if (form.periodicidad !== 'NINGUNA' && (!Number.isInteger(dia) || dia < -1 || dia === 0 || dia > 31)) {
      setError('El día debe estar entre 1 y 31, o ser -1 para el último día del mes.')
      return
    }
    try {
      setGuardando(true)
      setError(null)
      setAviso(null)
      const response = await post('/api/contabilidad/plantillas-asientos', {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        concepto: form.concepto.trim(),
        referencia: form.referencia.trim() || undefined,
        periodicidad: form.periodicidad,
        dia_ejecucion: form.periodicidad === 'NINGUNA' ? undefined : dia,
        fecha_inicio: form.periodicidad === 'NINGUNA' ? undefined : form.fecha_inicio,
        fecha_fin: form.fecha_fin || undefined,
        crear_en_estado: form.crear_en_estado,
        activa: true,
        detalles: lineas,
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar la plantilla')
      setAviso(`Plantilla "${response.data.nombre}" registrada. Generará asientos en ${response.data.crear_en_estado}.`)
      setForm(plantillaInicial)
      setDetalles([detalleInicial(), detalleInicial()])
      setMostrarAlta(false)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar la plantilla')
    } finally {
      setGuardando(false)
    }
  }

  const generar = async (plantilla: Plantilla) => {
    const destino =
      plantilla.crear_en_estado === 'BORRADOR'
        ? 'Se creará un asiento en borrador que podrá revisar antes de confirmarlo.'
        : 'Se creará un asiento confirmado, que entra directamente en los libros.'

    if (!confirm(`Generar un asiento desde "${plantilla.nombre}".\n\n${destino}\n\n¿Continuar?`)) {
      return
    }

    try {
      setGenerando(plantilla.id)
      setError(null)

      const response = await post(`/api/contabilidad/plantillas-asientos/${plantilla.id}/generar`, {})
      if (!response?.success) throw new Error(response?.message || 'No se pudo generar')

      router.push(`/dashboard/contabilidad/asientos/${response.data.id}`)
    } catch (err: any) {
      setError(err.message || 'No se pudo generar el asiento')
      setGenerando(null)
    }
  }

  const eliminar = async (plantilla: Plantilla) => {
    if (!confirm(`¿Eliminar la plantilla "${plantilla.nombre}"? Los asientos ya generados se conservan.`)) {
      return
    }
    try {
      setError(null)
      await del(`/api/contabilidad/plantillas-asientos/${plantilla.id}`)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo eliminar la plantilla')
    }
  }

  const formatFecha = (fecha?: string) =>
    fecha
      ? parseDateLocal(String(fecha).slice(0, 10))?.toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }) ?? fecha
      : '—'

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <FileStack className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Plantillas de asiento
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Defina una vez la provisión mensual, el devengo de un alquiler o el prorrateo de un
                  seguro. Las plantillas con periodicidad se generan solas en cada período.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={cargar}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
            <Button type="button" onClick={() => setMostrarAlta((actual) => !actual)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              {mostrarAlta ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {mostrarAlta ? 'Cerrar alta' : 'Nueva plantilla'}
            </Button>
          </div>
        </section>

        {mostrarAlta && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4"><CardTitle className="text-base">Definir plantilla recurrente</CardTitle></CardHeader>
            <CardContent className="space-y-5 p-5">
              <form id="plantilla-form" onSubmit={crearPlantilla} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Nombre<input aria-label="Nombre de la plantilla" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Concepto del asiento<input aria-label="Concepto de la plantilla" required value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Referencia<input aria-label="Referencia de la plantilla" value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Periodicidad<select aria-label="Periodicidad de la plantilla" value={form.periodicidad} onChange={(e) => setForm({ ...form, periodicidad: e.target.value as Plantilla['periodicidad'] })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal">{Object.entries(PERIODICIDAD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Día de ejecución<input aria-label="Día de ejecución" type="number" min="-1" max="31" disabled={form.periodicidad === 'NINGUNA'} required={form.periodicidad !== 'NINGUNA'} value={form.dia_ejecucion} onChange={(e) => setForm({ ...form, dia_ejecucion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal disabled:opacity-50" /></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Primera ejecución<input aria-label="Primera ejecución" type="date" disabled={form.periodicidad === 'NINGUNA'} required={form.periodicidad !== 'NINGUNA'} value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal disabled:opacity-50" /></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Fecha final<input aria-label="Fecha final de la plantilla" type="date" disabled={form.periodicidad === 'NINGUNA'} value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal disabled:opacity-50" /></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Estado generado<select aria-label="Estado generado por la plantilla" value={form.crear_en_estado} onChange={(e) => setForm({ ...form, crear_en_estado: e.target.value as Plantilla['crear_en_estado'] })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="BORRADOR">BORRADOR — revisar antes de libros</option><option value="CONFIRMADO">CONFIRMADO — entra a libros</option></select></label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80 md:col-span-2 xl:col-span-4">Descripción<input aria-label="Descripción de la plantilla" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              </form>

              <div className="overflow-x-auto rounded-xl border border-cyan-400/15">
                <table className="w-full min-w-[980px]"><thead className="bg-cyan-400/10"><tr><th className="px-3 py-2 text-left">Cuenta</th><th className="px-3 py-2 text-right">Debe</th><th className="px-3 py-2 text-right">Haber</th><th className="px-3 py-2 text-left">Concepto de línea</th><th className="px-3 py-2 text-left">Centro</th><th /></tr></thead><tbody>{detalles.map((detalle, indice) => <tr key={indice} className="border-t border-cyan-400/10"><td className="p-2"><select aria-label={`Cuenta de línea ${indice + 1}`} required value={detalle.cuenta_id} onChange={(e) => actualizarDetalle(indice, 'cuenta_id', e.target.value)} className="w-full rounded-lg border border-cyan-400/20 bg-card px-2 py-2 text-sm"><option value="">Seleccione…</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} — {cuenta.nombre}</option>)}</select></td><td className="p-2"><input aria-label={`Debe línea ${indice + 1}`} type="number" min="0" step="0.01" value={detalle.debe} onChange={(e) => actualizarDetalle(indice, 'debe', e.target.value)} className="w-28 rounded-lg border border-cyan-400/20 bg-card px-2 py-2 text-right text-sm" /></td><td className="p-2"><input aria-label={`Haber línea ${indice + 1}`} type="number" min="0" step="0.01" value={detalle.haber} onChange={(e) => actualizarDetalle(indice, 'haber', e.target.value)} className="w-28 rounded-lg border border-cyan-400/20 bg-card px-2 py-2 text-right text-sm" /></td><td className="p-2"><input aria-label={`Concepto línea ${indice + 1}`} value={detalle.concepto} onChange={(e) => actualizarDetalle(indice, 'concepto', e.target.value)} placeholder="Usa el concepto general" className="w-full rounded-lg border border-cyan-400/20 bg-card px-2 py-2 text-sm" /></td><td className="p-2"><select aria-label={`Centro línea ${indice + 1}`} value={detalle.centro_costo_id} onChange={(e) => actualizarDetalle(indice, 'centro_costo_id', e.target.value)} className="w-full rounded-lg border border-cyan-400/20 bg-card px-2 py-2 text-sm"><option value="">Sin centro</option>{centrosCosto.map((centro) => <option key={centro.id} value={centro.id}>{centro.codigo ? `${centro.codigo} — ` : ''}{centro.nombre}</option>)}</select></td><td className="p-2">{detalles.length > 2 && <Button type="button" variant="outline" aria-label={`Eliminar línea ${indice + 1}`} onClick={() => setDetalles((actuales) => actuales.filter((_, i) => i !== indice))}><Trash2 className="h-4 w-4" /></Button>}</td></tr>)}</tbody></table>
              </div>
              <div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="outline" onClick={() => setDetalles((actuales) => [...actuales, detalleInicial()])} className="gap-2"><Plus className="h-4 w-4" />Agregar línea</Button><Button type="submit" form="plantilla-form" disabled={guardando} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar plantilla</Button></div>
              <p className="text-xs text-muted-foreground">Por seguridad, el estado predeterminado es BORRADOR. Debe y haber deben cuadrar al céntimo.</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        {aviso && <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-300">{aviso}</div>}

        <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Plantillas registradas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando plantillas...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <th className="px-4 py-3">Plantilla</th>
                      <th className="px-4 py-3">Periodicidad</th>
                      <th className="px-4 py-3">Próxima</th>
                      <th className="px-4 py-3">Última</th>
                      <th className="px-4 py-3">Genera en</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {plantillas.length > 0 ? (
                      plantillas.map((plantilla) => (
                        <tr
                          key={plantilla.id}
                          className="border-b border-cyan-400/10 text-sm text-foreground/90"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{plantilla.nombre}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {plantilla.descripcion || plantilla.concepto}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {PERIODICIDAD_LABEL[plantilla.periodicidad]}
                            </span>
                          </td>
                          <td className="px-4 py-3">{formatFecha(plantilla.proxima_ejecucion)}</td>
                          <td className="px-4 py-3">{formatFecha(plantilla.ultima_ejecucion)}</td>
                          <td className="px-4 py-3">{plantilla.crear_en_estado}</td>
                          <td className="px-4 py-3">{plantilla.activa ? 'Activa' : 'Inactiva'}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                onClick={() => generar(plantilla)}
                                disabled={!plantilla.activa || generando !== null}
                                className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
                              >
                                {generando === plantilla.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-4 w-4" />
                                )}
                                Generar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => eliminar(plantilla)}
                                variant="outline"
                                className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Todavía no hay plantillas. Cree una para dejar de teclear la misma
                          provisión cada mes.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
