'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Save, Users } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'

const EMPTY = {
  tipo_empleador: 'GENERAL',
  jurisdiccion_laboral: 'NACIONAL',
  actividad_codigo: '',
  convenio_colectivo_codigo: '',
  convenio_colectivo_descripcion: '',
  categoria_default: '',
  art_cuit: '',
  art_razon_social: '',
  art_tasa: '',
  obra_social_codigo_default: '',
  sindicato_codigo_default: '',
  sindicato_aporte_default: '0',
  contribucion_patronal: '0.18',
  seguro_vida_monto: '0',
  periodo_prueba_max_meses: '6',
  sistema_indemnizacion: 'LCT_245',
  libro_sueldos_digital_habilitado: true,
  simplificacion_registral_habilitada: true,
  formulario_931_habilitado: true,
  siradig_habilitado: true,
  configuracion_confirmada: false,
}

const CO_EMPTY = {
  tipo_aportante: 'EMPLEADOR',
  actividad_economica_ciiu: '',
  operador_pila: '',
  pila_integracion_modo: 'ARCHIVO_OPERADOR',
  pila_operador_codigo: '',
  pila_api_url: '',
  pila_api_usuario: '',
  pila_api_token: '',
  eps_default: '',
  fondo_pension_default: '',
  arl_default: '',
  arl_clase_riesgo: '1',
  arl_tasa: '0.00522',
  caja_compensacion_default: '',
  sena_habilitado: true,
  icbf_habilitado: true,
  exonerado_salud_sena_icbf: false,
  nomina_electronica_habilitada: true,
  nomina_software_id: '',
  nomina_software_pin: '',
  nomina_test_set_id: '',
  pila_habilitada: true,
  salario_minimo: '1750905',
  auxilio_transporte: '249095',
  configuracion_confirmada: false,
}

export default function RrhhCountryConfiguration() {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const { get, put, post } = useApi({ throwOnError: true })
  const { toast } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [coForm, setCoForm] = useState(CO_EMPTY)
  const [readiness, setReadiness] = useState<any>(null)
  const [peruNormativa, setPeruNormativa] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingPila, setTestingPila] = useState(false)
  const mutationIntents = useRef(new Map<string, string>())
  const intentFor = (signature: string) => {
    const existing = mutationIntents.current.get(signature)
    if (existing) return existing
    const key = `rrhh-country:${crypto.randomUUID()}`
    mutationIntents.current.set(signature, key)
    return key
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get('/rrhh/configuracion-laboral')
      const payload = response?.data ?? response
      setReadiness(payload?.readiness ?? null)
      setPeruNormativa(payload?.pais === 'PE' ? payload?.normativa ?? null : null)
      if (payload?.configuracion) {
        if (payload?.pais === 'CO') {
          setCoForm({
            ...CO_EMPTY,
            ...payload.configuracion,
            arl_clase_riesgo: String(payload.configuracion.arl_clase_riesgo ?? 1),
            arl_tasa: String(payload.configuracion.arl_tasa ?? 0.00522),
            salario_minimo: String(payload.configuracion.salario_minimo ?? 1750905),
            auxilio_transporte: String(payload.configuracion.auxilio_transporte ?? 249095),
          })
        } else {
          setForm({
            ...EMPTY,
            ...payload.configuracion,
            art_tasa: String(payload.configuracion.art_tasa ?? ''),
            sindicato_aporte_default: String(payload.configuracion.sindicato_aporte_default ?? 0),
            // Sin valor guardado se deja vacío, como `art_tasa` justo encima.
            // Prerrellenar 18 % era arbitrario: es la tasa del IGV peruano, no una
            // contribución patronal, y en Argentina ronda el 24 %. Un número puesto
            // por el programa en un campo que el usuario confirma sin mirar es peor
            // que un campo vacío que le obliga a buscarlo.
            contribucion_patronal: String(payload.configuracion.contribucion_patronal ?? ''),
            seguro_vida_monto: String(payload.configuracion.seguro_vida_monto ?? 0),
            periodo_prueba_max_meses: String(payload.configuracion.periodo_prueba_max_meses ?? 6),
          })
        }
      }
    } catch (error) {
      toast({
        title: 'No se pudo cargar RRHH',
        description: error instanceof Error ? error.message : 'Error de configuración',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [get, toast])

  useEffect(() => {
    if (!country.loading) load()
  }, [country.loading, load])

  const set = (name: keyof typeof EMPTY, value: string | boolean) =>
    setForm((current) => ({ ...current, [name]: value }))
  const setCo = (name: keyof typeof CO_EMPTY, value: string | boolean) =>
    setCoForm((current) => ({ ...current, [name]: value }))

  const save = async () => {
    setSaving(true)
    const payload = {
      ...form,
      art_tasa: Number(form.art_tasa),
      sindicato_aporte_default: Number(form.sindicato_aporte_default),
      contribucion_patronal: Number(form.contribucion_patronal),
      seguro_vida_monto: Number(form.seguro_vida_monto),
      periodo_prueba_max_meses: Number(form.periodo_prueba_max_meses),
    }
    const signature = `ar:${JSON.stringify(payload)}`
    try {
      await put('/rrhh/configuracion-laboral/argentina', payload, {
        headers: { 'Idempotency-Key': intentFor(signature) },
      })
      mutationIntents.current.delete(signature)
      toast({
        title: 'RRHH Argentina actualizado',
        description: 'CCT, ART, registración y parámetros patronales quedaron guardados.',
      })
      await load()
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Revise los campos obligatorios',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const saveColombia = async () => {
    setSaving(true)
    const payload = {
      ...coForm,
      arl_clase_riesgo: Number(coForm.arl_clase_riesgo),
      arl_tasa: Number(coForm.arl_tasa),
      salario_minimo: Number(coForm.salario_minimo),
      auxilio_transporte: Number(coForm.auxilio_transporte),
    }
    const signature = `co:${JSON.stringify(payload)}`
    try {
      await put('/rrhh/configuracion-laboral/colombia', payload, {
        headers: { 'Idempotency-Key': intentFor(signature) },
      })
      mutationIntents.current.delete(signature)
      toast({
        title: 'RRHH Colombia actualizado',
        description: 'PILA, seguridad social, parafiscales y nómina electrónica quedaron guardados.',
      })
      await load()
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Revise los campos obligatorios',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const testPila = async () => {
    setTestingPila(true)
    const signature = 'pila:test'
    try {
      const result = await post('/rrhh/configuracion-laboral/colombia/pila/test', {}, {
        headers: { 'Idempotency-Key': intentFor(signature) },
      })
      mutationIntents.current.delete(signature)
      toast({
        title: result?.success ? 'Conexión PILA preparada' : 'PILA requiere atención',
        description: result?.message || (result?.missing?.length ? `Faltan: ${result.missing.join(', ')}` : 'Revise la configuración del operador.'),
        variant: result?.success ? 'default' : 'destructive',
      })
      await load()
    } catch (error) {
      toast({
        title: 'No se pudo probar PILA',
        description: error instanceof Error ? error.message : 'Error de conectividad',
        variant: 'destructive',
      })
    } finally {
      setTestingPila(false)
    }
  }

  if (loading || country.loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin" />
      </div>
    )
  }

  if (!isArgentina && !isColombia) {
    const readyPeru = readiness?.ready === true && peruNormativa
    const percentage = (value: unknown) => `${(Number(value || 0) * 100).toFixed(2).replace(/\.00$/, '')} %`
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
        <Link href="/dashboard/configuracion" className="text-sm font-semibold text-primary">← Configuración</Link>
        <header className="rounded-2xl border border-border bg-card p-6 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold"><Users /> RRHH Perú</h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Parámetros versionados por período para planillas, AFP/ONP, EsSalud, quinta categoría,
                asignación familiar, gratificaciones, vacaciones y depósitos CTS.
              </p>
            </div>
            <div className={readyPeru ? 'rounded-full bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-500' : 'rounded-full bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-500'}>
              {readyPeru ? <CheckCircle2 className="mr-1 inline size-4" /> : <AlertTriangle className="mr-1 inline size-4" />}
              {readyPeru ? `Lista para operar · ${peruNormativa.periodo}` : 'Falta normativa vigente'}
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-md">
          <h2 className="text-lg font-bold">Normativa aplicada — {peruNormativa?.periodo || 'sin período'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El motor conserva la tabla histórica y selecciona la regla vigente para el mes de la planilla.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Rule label="Moneda y documento" value="PEN · DNI / CE / Pasaporte" />
            <Rule label="UIT" value={`S/ ${Number(peruNormativa?.uit || 0).toLocaleString('es-PE')}`} />
            <Rule label="RMV" value={`S/ ${Number(peruNormativa?.rmv || 0).toLocaleString('es-PE')}`} />
            <Rule label="Asignación familiar" value={`S/ ${Number(peruNormativa?.asignacion_familiar || 0).toLocaleString('es-PE')} · 10 % RMV`} />
            <Rule label="AFP — aporte obligatorio" value={percentage(peruNormativa?.afp_aporte)} />
            <Rule label="AFP — prima de seguro" value={percentage(peruNormativa?.afp_prima_seguro)} />
            <Rule label="AFP — comisión flujo predeterminada" value={percentage(peruNormativa?.afp_comision_flujo_default)} />
            <Rule label="ONP" value={percentage(peruNormativa?.onp_aporte)} />
            <Rule label="EsSalud empleador" value={percentage(peruNormativa?.essalud_aporte)} />
            <Rule label="Quinta categoría" value={`${Number(peruNormativa?.quinta_deduccion_uit || 7)} UIT de deducción + escala progresiva`} />
            <Rule label="Jornada máxima" value="8 horas diarias · 48 horas semanales" />
            <Rule label="Horas extra" value="25 % primeras 2 h · 35 % siguientes" />
            <Rule label="Beneficios" value="CTS · gratificaciones + 9 % · vacaciones · liquidación" />
            <Rule label="Bancarización" value={`Desde S/ ${Number(peruNormativa?.bancarizacion_pen_min || 0).toLocaleString('es-PE')}`} />
            <Rule label="IGV de referencia" value={percentage(peruNormativa?.igv_tasa)} />
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-md">
          <h2 className="text-lg font-bold">Datos particulares por trabajador</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            En cada contrato se selecciona AFP u ONP. Para AFP se registra la administradora y el esquema
            de comisión; el motor aplica aporte, seguro y comisión vigentes sin mezclar reglas de otros países.
          </p>
        </section>
      </div>
    )
  }

  const ready = readiness?.ready === true

  if (isColombia) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
        <Link href="/dashboard/configuracion" className="text-sm font-semibold text-primary">← Configuración</Link>
        <header className="rounded-2xl border border-border bg-card p-6 shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold"><Users /> RRHH Colombia</h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Parámetros del empleador para PILA, EPS, pensión, ARL, caja de compensación,
                SENA, ICBF, prestaciones sociales y nómina electrónica DIAN.
              </p>
            </div>
            <div className={ready ? 'rounded-full bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-500' : 'rounded-full bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-500'}>
              {ready ? <CheckCircle2 className="mr-1 inline size-4" /> : <AlertTriangle className="mr-1 inline size-4" />}
              {ready ? 'Lista para operar' : 'Requiere completar'}
            </div>
          </div>
        </header>

        <section className="grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-md md:grid-cols-2">
          <Field label="Actividad económica CIIU" value={coForm.actividad_economica_ciiu} onChange={(v) => setCo('actividad_economica_ciiu', v)} />
          <Field label="Operador PILA *" value={coForm.operador_pila} onChange={(v) => setCo('operador_pila', v)} />
          <Field label="Código del operador" value={coForm.pila_operador_codigo} onChange={(v) => setCo('pila_operador_codigo', v)} placeholder="SOI, SIMPLE, APORTES_EN_LINEA…" />
          <div className="space-y-2">
            <Label htmlFor="rrhh-co-pila-modo">Modo de integración PILA</Label>
            <select
              id="rrhh-co-pila-modo"
              value={coForm.pila_integracion_modo}
              onChange={(event) => setCo('pila_integracion_modo', event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="ARCHIVO_OPERADOR">Archivo / portal del operador</option>
              <option value="API_PROVEEDOR">API privada suministrada por el operador</option>
            </select>
          </div>
          {coForm.pila_integracion_modo === 'API_PROVEEDOR' && (
            <>
              <Field label="URL HTTPS de prueba del operador *" value={coForm.pila_api_url} onChange={(v) => setCo('pila_api_url', v)} placeholder="https://api.operador.co/health" />
              <Field label="Usuario API PILA" value={coForm.pila_api_usuario} onChange={(v) => setCo('pila_api_usuario', v)} />
              <Field label="Token API PILA *" value={coForm.pila_api_token} onChange={(v) => setCo('pila_api_token', v)} type="password" placeholder="Se guarda cifrado" />
            </>
          )}
          <Field label="EPS predeterminada *" value={coForm.eps_default} onChange={(v) => setCo('eps_default', v)} />
          <Field label="Fondo de pensión *" value={coForm.fondo_pension_default} onChange={(v) => setCo('fondo_pension_default', v)} />
          <Field label="ARL *" value={coForm.arl_default} onChange={(v) => setCo('arl_default', v)} />
          <Field label="Clase de riesgo ARL" value={coForm.arl_clase_riesgo} onChange={(v) => setCo('arl_clase_riesgo', v)} type="number" />
          <Field label="Tasa ARL *" value={coForm.arl_tasa} onChange={(v) => setCo('arl_tasa', v)} type="number" />
          <Field label="Caja de compensación *" value={coForm.caja_compensacion_default} onChange={(v) => setCo('caja_compensacion_default', v)} />
          <Field label="SMMLV 2026 (COP)" value={coForm.salario_minimo} onChange={(v) => setCo('salario_minimo', v)} type="number" />
          <Field label="Auxilio de transporte 2026 (COP)" value={coForm.auxilio_transporte} onChange={(v) => setCo('auxilio_transporte', v)} type="number" />
          <Field label="Software ID nómina DIAN *" value={coForm.nomina_software_id} onChange={(v) => setCo('nomina_software_id', v)} />
          <Field label="PIN nómina DIAN *" value={coForm.nomina_software_pin} onChange={(v) => setCo('nomina_software_pin', v)} type="password" placeholder="Se guarda cifrado" />
          <Field label="Test Set ID nómina DIAN *" value={coForm.nomina_test_set_id} onChange={(v) => setCo('nomina_test_set_id', v)} />
        </section>

        <section className="grid gap-3 rounded-2xl border border-border bg-card p-6 shadow-md md:grid-cols-2">
          <Toggle label="PILA habilitada" checked={coForm.pila_habilitada} onChange={(v) => setCo('pila_habilitada', v)} />
          <Toggle label="Nómina electrónica DIAN" checked={coForm.nomina_electronica_habilitada} onChange={(v) => setCo('nomina_electronica_habilitada', v)} />
          <Toggle label="Aporte SENA" checked={coForm.sena_habilitado} onChange={(v) => setCo('sena_habilitado', v)} />
          <Toggle label="Aporte ICBF" checked={coForm.icbf_habilitado} onChange={(v) => setCo('icbf_habilitado', v)} />
          <Toggle label="Exoneración salud/SENA/ICBF confirmada" checked={coForm.exonerado_salud_sena_icbf} onChange={(v) => setCo('exonerado_salud_sena_icbf', v)} />
          <Toggle label="Confirmo que los datos fueron verificados" checked={coForm.configuracion_confirmada} onChange={(v) => setCo('configuracion_confirmada', v)} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-md">
          <h2 className="text-lg font-bold">Normativa aplicada — agosto de 2026</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El motor selecciona estos parámetros por período y conserva la normativa histórica de meses anteriores.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Rule label="Jornada máxima" value="42 horas semanales / divisor 210" />
            <Rule label="Jornada nocturna" value="19:00 a 06:00 / recargo 35 %" />
            <Rule label="Dominical y festivo" value="Recargo 90 % desde 01/07/2026" />
            <Rule label="Seguridad social trabajador" value="Salud 4 % + pensión 4 %" />
            <Rule label="Seguridad social empleador" value="Salud 8,5 % + pensión 12 %" />
            <Rule label="Parafiscales" value="CCF 4 % · SENA 2 % · ICBF 3 %" />
            <Rule label="Prestaciones" value="Prima, cesantías, intereses y vacaciones" />
            <Rule label="IBC" value="Mínimo proporcional · tope 25 SMMLV" />
            <Rule label="UVT 2026" value="$52.374 COP" />
            <Rule label="Fondo de Solidaridad" value="Progresivo desde 4 SMMLV" />
            <Rule label="ARL" value="Según clase de riesgo I a V" />
            <Rule label="Reportes" value="PILA + nómina electrónica DIAN" />
          </dl>
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={testPila} disabled={testingPila || saving}>
            {testingPila ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
            Probar integración PILA
          </Button>
          <Button onClick={saveColombia} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            Guardar configuración laboral
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <Link href="/dashboard/configuracion" className="text-sm font-semibold text-primary">← Configuración</Link>
      <header className="rounded-2xl border border-border bg-card p-6 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><Users /> RRHH Argentina</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Parámetros del empleador para SIPA, INSSJP, obra social, ART, CCT, Libro de Sueldos Digital,
              Simplificación Registral, SiRADIG y Formulario 931.
            </p>
          </div>
          <div className={ready ? 'rounded-full bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-500' : 'rounded-full bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-500'}>
            {ready ? <CheckCircle2 className="mr-1 inline size-4" /> : <AlertTriangle className="mr-1 inline size-4" />}
            {ready ? 'Lista para operar' : 'Requiere completar'}
          </div>
        </div>
      </header>

      <section className="grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-md md:grid-cols-2">
        <Field label="Actividad ARCA" value={form.actividad_codigo} onChange={(v) => set('actividad_codigo', v)} />
        <Field label="Jurisdicción laboral" value={form.jurisdiccion_laboral} onChange={(v) => set('jurisdiccion_laboral', v)} />
        <Field label="Convenio colectivo (CCT) *" value={form.convenio_colectivo_codigo} onChange={(v) => set('convenio_colectivo_codigo', v)} placeholder="Ej. 130/75" />
        <Field label="Descripción del CCT" value={form.convenio_colectivo_descripcion} onChange={(v) => set('convenio_colectivo_descripcion', v)} />
        <Field label="Categoría predeterminada *" value={form.categoria_default} onChange={(v) => set('categoria_default', v)} />
        <Field label="Código de obra social" value={form.obra_social_codigo_default} onChange={(v) => set('obra_social_codigo_default', v)} />
        <Field label="CUIT de ART *" value={form.art_cuit} onChange={(v) => set('art_cuit', v)} />
        <Field label="Razón social ART *" value={form.art_razon_social} onChange={(v) => set('art_razon_social', v)} />
        <Field label="Alícuota ART *" value={form.art_tasa} onChange={(v) => set('art_tasa', v)} type="number" placeholder="0.03" />
        <Field label="Contribución patronal" value={form.contribucion_patronal} onChange={(v) => set('contribucion_patronal', v)} type="number" />
        <Field label="Sindicato" value={form.sindicato_codigo_default} onChange={(v) => set('sindicato_codigo_default', v)} />
        <Field label="Aporte sindical" value={form.sindicato_aporte_default} onChange={(v) => set('sindicato_aporte_default', v)} type="number" />
        <Field label="Seguro colectivo de vida" value={form.seguro_vida_monto} onChange={(v) => set('seguro_vida_monto', v)} type="number" />
        <Field label="Período de prueba máximo (meses)" value={form.periodo_prueba_max_meses} onChange={(v) => set('periodo_prueba_max_meses', v)} type="number" />
      </section>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-6 shadow-md md:grid-cols-2">
        <Toggle label="Libro de Sueldos Digital" checked={form.libro_sueldos_digital_habilitado} onChange={(v) => set('libro_sueldos_digital_habilitado', v)} />
        <Toggle label="Simplificación Registral" checked={form.simplificacion_registral_habilitada} onChange={(v) => set('simplificacion_registral_habilitada', v)} />
        <Toggle label="Formulario 931" checked={form.formulario_931_habilitado} onChange={(v) => set('formulario_931_habilitado', v)} />
        <Toggle label="SiRADIG / Ganancias" checked={form.siradig_habilitado} onChange={(v) => set('siradig_habilitado', v)} />
        <Toggle label="Confirmo que los datos fueron verificados" checked={form.configuracion_confirmada} onChange={(v) => set('configuracion_confirmada', v)} />
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Guardar configuración laboral
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  const id = `rrhh-ar-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-semibold">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4" />
      {label}
    </label>
  )
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="font-semibold">{label}</dt>
      <dd className="mt-1 text-muted-foreground">{value}</dd>
    </div>
  )
}
