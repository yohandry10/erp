'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { AlertCircle, CalendarRange, Loader2, Plus, RefreshCw, Save, X, XCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Diferido {
  id: string
  codigo?: string
  nombre: string
  tipo: 'GASTO' | 'INGRESO'
  monto_total: number
  monto_devengado: number
  monto_pendiente: number
  periodos: number
  fecha_inicio: string
  estado: 'VIGENTE' | 'DEVENGADO' | 'CANCELADO'
}

interface ResultadoDevengo {
  periodo: string
  diferidos_devengados: number
  total_devengado: number
  omitidos?: Array<{ diferido_id: string; nombre?: string; motivo: string }>
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

const hoy = new Date().toISOString().slice(0, 10)
const diferidoInicial = {
  codigo: '',
  nombre: '',
  descripcion: '',
  tipo: 'GASTO' as 'GASTO' | 'INGRESO',
  cuenta_diferido_id: '',
  cuenta_resultado_id: '',
  monto_total: '',
  periodos: '12',
  fecha_inicio: hoy,
  centro_costo_id: '',
}

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function DiferidosPage() {
  const { get, post, del } = useApi()

  const [diferidos, setDiferidos] = useState<Diferido[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [devengando, setDevengando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDevengo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [form, setForm] = useState(diferidoInicial)

  const ahora = new Date()
  const [anio, setAnio] = useState(ahora.getFullYear())
  const [mes, setMes] = useState(ahora.getMonth() + 1)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [response, cuentasResponse, centrosResponse] = await Promise.all([
        get('/api/contabilidad/diferidos'),
        get('/api/contabilidad/plan-cuentas'),
        get('/api/contabilidad/centros-costo'),
      ])
      if (response?.success) setDiferidos(response.data || [])
      if (cuentasResponse?.success) setCuentas(cuentasResponse.data || [])
      if (centrosResponse?.success) setCentrosCosto(centrosResponse.data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar los diferidos')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    cargar()
  }, [cargar])

  const crearDiferido = async (event: React.FormEvent) => {
    event.preventDefault()
    const monto = Number(form.monto_total)
    const periodos = Number(form.periodos)
    if (!form.nombre.trim() || !form.cuenta_diferido_id || !form.cuenta_resultado_id) {
      setError('Nombre, cuenta de balance y cuenta de resultados son obligatorios.')
      return
    }
    if (form.cuenta_diferido_id === form.cuenta_resultado_id) {
      setError('La cuenta de balance y la cuenta de resultados deben ser distintas.')
      return
    }
    if (!Number.isFinite(monto) || monto <= 0 || !Number.isInteger(periodos) || periodos < 1) {
      setError('Ingrese un importe positivo y una cantidad válida de períodos.')
      return
    }
    try {
      setGuardando(true)
      setError(null)
      setAviso(null)
      const response = await post('/api/contabilidad/diferidos', {
        codigo: form.codigo.trim() || undefined,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        tipo: form.tipo,
        cuenta_diferido_id: form.cuenta_diferido_id,
        cuenta_resultado_id: form.cuenta_resultado_id,
        monto_total: monto,
        periodos,
        fecha_inicio: form.fecha_inicio,
        centro_costo_id: form.centro_costo_id || undefined,
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar el diferido')
      setAviso(`Diferido "${response.data.nombre}" registrado y listo para devengar.`)
      setForm(diferidoInicial)
      setMostrarAlta(false)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar el diferido')
    } finally {
      setGuardando(false)
    }
  }

  const devengar = async () => {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`
    if (!confirm(`Se devengará la cuota de todos los diferidos vigentes del período ${periodo}. ¿Continuar?`)) {
      return
    }

    try {
      setDevengando(true)
      setError(null)
      setResultado(null)

      const response = await post('/api/contabilidad/diferidos/devengar', { anio, mes })
      if (!response?.success) throw new Error(response?.message || 'No se pudo devengar')

      setResultado(response.data)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar el devengo')
    } finally {
      setDevengando(false)
    }
  }

  const cancelar = async (diferido: Diferido) => {
    if (!confirm(`¿Cancelar "${diferido.nombre}"? Dejará de devengar; lo ya devengado permanece en los libros.`)) {
      return
    }
    try {
      setError(null)
      await del(`/api/contabilidad/diferidos/${diferido.id}`)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo cancelar el diferido')
    }
  }

  const money = (valor: number) =>
    new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      valor || 0
    )

  const formatFecha = (fecha: string) =>
    parseDateLocal(String(fecha).slice(0, 10))?.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) ?? fecha

  const totales = diferidos.reduce(
    (acc, d) => ({
      total: acc.total + Number(d.monto_total || 0),
      devengado: acc.devengado + Number(d.monto_devengado || 0),
      pendiente: acc.pendiente + Number(d.monto_pendiente || 0),
    }),
    { total: 0, devengado: 0, pendiente: 0 }
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <CalendarRange className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Ingresos y gastos diferidos
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Un seguro anual o un alquiler cobrado por adelantado se reparten mes a mes. El
                  devengo del período genera un solo asiento con una línea por diferido.
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
              {mostrarAlta ? 'Cerrar alta' : 'Registrar diferido'}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4">
            <div>
              <label htmlFor="diferidos-ano" className={labelClass}>Año</label>
              <input id="diferidos-ano"
                type="number"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="mt-2 w-28 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <div>
              <label htmlFor="diferidos-mes" className={labelClass}>Mes</label>
              <input id="diferidos-mes"
                type="number"
                min={1}
                max={12}
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="mt-2 w-24 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <Button
              type="button"
              onClick={devengar}
              disabled={devengando}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {devengando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarRange className="h-4 w-4" />
              )}
              Devengar período
            </Button>
            <p className="text-xs text-muted-foreground">
              El devengo es idempotente por período: repetirlo no duplica el asiento.
            </p>
          </div>
        </section>

        {mostrarAlta && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4"><CardTitle className="text-base">Nuevo ingreso o gasto diferido</CardTitle></CardHeader>
            <CardContent className="p-5">
              <form onSubmit={crearDiferido} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Código<input aria-label="Código del diferido" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Nombre<input aria-label="Nombre del diferido" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Tipo<select aria-label="Tipo de diferido" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as 'GASTO' | 'INGRESO' })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="GASTO">Gasto pagado por adelantado</option><option value="INGRESO">Ingreso cobrado por adelantado</option></select></label>
                <label className={labelClass}>Primer período<input aria-label="Primer período del diferido" type="date" required value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Importe total<input aria-label="Importe total del diferido" type="number" min="0.01" step="0.01" required value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Períodos mensuales<input aria-label="Períodos del diferido" type="number" min="1" step="1" required value={form.periodos} onChange={(e) => setForm({ ...form, periodos: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Cuenta de balance<select aria-label="Cuenta de balance del diferido" required value={form.cuenta_diferido_id} onChange={(e) => setForm({ ...form, cuenta_diferido_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Seleccione…</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} — {cuenta.nombre}</option>)}</select></label>
                <label className={labelClass}>Cuenta de resultados<select aria-label="Cuenta de resultados del diferido" required value={form.cuenta_resultado_id} onChange={(e) => setForm({ ...form, cuenta_resultado_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Seleccione…</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} — {cuenta.nombre}</option>)}</select></label>
                <label className={labelClass}>Centro de costo<select aria-label="Centro de costo del diferido" value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Sin centro</option>{centrosCosto.map((centro) => <option key={centro.id} value={centro.id}>{centro.codigo ? `${centro.codigo} — ` : ''}{centro.nombre}</option>)}</select></label>
                <label className={`${labelClass} md:col-span-2`}>Descripción<input aria-label="Descripción del diferido" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <div className="flex items-end"><Button type="submit" disabled={guardando} className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500">{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar diferido</Button></div>
              </form>
              <p className="mt-4 text-xs text-muted-foreground">Para gastos use normalmente una cuenta de balance 18 y una cuenta de resultados 6; para ingresos, una cuenta de pasivo 49 y una cuenta 7. El sistema exige que ambas sean distintas.</p>
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

        {resultado && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">
                Devengo del período {resultado.periodo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-foreground/90">
                {resultado.diferidos_devengados} diferido(s) por un total de{' '}
                <span className="font-bold">{money(resultado.total_devengado)}</span>.
              </p>
              {resultado.omitidos && resultado.omitidos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                    Omitidos ({resultado.omitidos.length})
                  </p>
                  {resultado.omitidos.map((omitido) => (
                    <div
                      key={omitido.diferido_id}
                      className="rounded-xl border border-cyan-400/15 bg-card/70 p-3 text-sm"
                    >
                      <span className="font-semibold text-primary/80">
                        {omitido.nombre || omitido.diferido_id}
                      </span>
                      <p className="mt-1 text-foreground/90">{omitido.motivo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ['Total diferido', totales.total],
            ['Devengado', totales.devengado],
            ['Pendiente de devengar', totales.pendiente],
          ].map(([label, valor]: any) => (
            <div key={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                {label}
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{money(valor)}</div>
            </div>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Diferidos registrados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando diferidos...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <th className="px-4 py-3">Diferido</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Inicio</th>
                      <th className="px-4 py-3 text-right">Períodos</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Devengado</th>
                      <th className="px-4 py-3 text-right">Pendiente</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {diferidos.length > 0 ? (
                      diferidos.map((diferido) => (
                        <tr
                          key={diferido.id}
                          className="border-b border-cyan-400/10 text-sm text-foreground/90"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{diferido.nombre}</div>
                            {diferido.codigo && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {diferido.codigo}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{diferido.tipo}</td>
                          <td className="px-4 py-3">{formatFecha(diferido.fecha_inicio)}</td>
                          <td className="px-4 py-3 text-right">{diferido.periodos}</td>
                          <td className="px-4 py-3 text-right">{money(diferido.monto_total)}</td>
                          <td className="px-4 py-3 text-right">{money(diferido.monto_devengado)}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary">
                            {money(diferido.monto_pendiente)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                              {diferido.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {diferido.estado === 'VIGENTE' && (
                              <Button
                                type="button"
                                onClick={() => cancelar(diferido)}
                                variant="outline"
                                className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Todavía no hay diferidos registrados.
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
