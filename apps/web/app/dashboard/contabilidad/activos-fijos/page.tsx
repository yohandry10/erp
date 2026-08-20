'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import {
  AlertCircle,
  Archive,
  Building2,
  CalendarClock,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  TrendingDown,
  X,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ActivoFijo {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  fecha_adquisicion: string
  valor_adquisicion: number
  valor_residual: number
  vida_util_meses: number
  depreciacion_acumulada: number
  valor_neto: number
  situacion: 'ACTIVO' | 'DEPRECIADO' | 'BAJA' | 'VENDIDO'
  fecha_baja?: string
}

interface ResultadoDepreciacion {
  periodo: string
  activos_depreciados: number
  total_depreciado: number
  omitidos?: Array<{ activo_id: string; codigo?: string; motivo: string }>
}

interface CentroCosto {
  id: string
  codigo?: string
  nombre: string
}

interface CuotaDepreciacion {
  periodo: string
  cuota: number
  acumulada: number
  valor_neto: number
}

const hoy = new Date().toISOString().slice(0, 10)

const activoInicial = {
  codigo: '',
  nombre: '',
  descripcion: '',
  fecha_adquisicion: hoy,
  valor_adquisicion: '',
  valor_residual: '0',
  vida_util_meses: '60',
  fecha_inicio_depreciacion: hoy,
  centro_costo_id: '',
}

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function ActivosFijosPage() {
  const { get, post, put } = useApi()

  const [activos, setActivos] = useState<ActivoFijo[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [depreciando, setDepreciando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDepreciacion | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [form, setForm] = useState(activoInicial)
  const [editando, setEditando] = useState<ActivoFijo | null>(null)
  const [edicion, setEdicion] = useState({ nombre: '', descripcion: '', vida_util_meses: '', valor_residual: '' })
  const [retirando, setRetirando] = useState<ActivoFijo | null>(null)
  const [baja, setBaja] = useState({ fecha: hoy, tipo: 'BAJA', valor_venta: '', motivo: '' })
  const [cronograma, setCronograma] = useState<{ activo: ActivoFijo; cuotas: CuotaDepreciacion[] } | null>(null)

  const ahora = new Date()
  const [anio, setAnio] = useState(ahora.getFullYear())
  const [mes, setMes] = useState(ahora.getMonth() + 1)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [response, centrosResponse] = await Promise.all([
        get('/api/contabilidad/activos-fijos'),
        get('/api/contabilidad/centros-costo'),
      ])
      if (response?.success) setActivos(response.data || [])
      if (centrosResponse?.success) setCentrosCosto(centrosResponse.data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar los activos fijos')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    cargar()
  }, [cargar])

  const crearActivo = async (event: React.FormEvent) => {
    event.preventDefault()
    const valor = Number(form.valor_adquisicion)
    const residual = Number(form.valor_residual || 0)
    const vida = Number(form.vida_util_meses)
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setError('Código y nombre son obligatorios.')
      return
    }
    if (!Number.isFinite(valor) || valor <= 0 || !Number.isInteger(vida) || vida < 1) {
      setError('Ingrese un valor de adquisición positivo y una vida útil válida.')
      return
    }
    if (!Number.isFinite(residual) || residual < 0 || residual > valor) {
      setError('El valor residual debe estar entre cero y el valor de adquisición.')
      return
    }

    try {
      setGuardando(true)
      setError(null)
      setAviso(null)
      const response = await post('/api/contabilidad/activos-fijos', {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        fecha_adquisicion: form.fecha_adquisicion,
        valor_adquisicion: valor,
        valor_residual: residual,
        vida_util_meses: vida,
        fecha_inicio_depreciacion: form.fecha_inicio_depreciacion || form.fecha_adquisicion,
        centro_costo_id: form.centro_costo_id || undefined,
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar el activo')
      setForm(activoInicial)
      setMostrarAlta(false)
      setAviso(`Activo ${response.data.codigo} registrado. Ya puede consultar su cronograma y depreciarlo.`)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar el activo')
    } finally {
      setGuardando(false)
    }
  }

  const abrirEdicion = (activo: ActivoFijo) => {
    setEditando(activo)
    setEdicion({
      nombre: activo.nombre,
      descripcion: activo.descripcion || '',
      vida_util_meses: String(activo.vida_util_meses),
      valor_residual: String(activo.valor_residual),
    })
    setRetirando(null)
    setCronograma(null)
  }

  const guardarEdicion = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editando) return
    const vida = Number(edicion.vida_util_meses)
    const residual = Number(edicion.valor_residual)
    if (!edicion.nombre.trim() || !Number.isInteger(vida) || vida < 1 || residual < 0 || residual > editando.valor_adquisicion) {
      setError('Revise el nombre, la vida útil y el valor residual.')
      return
    }
    try {
      setGuardando(true)
      setError(null)
      const response = await put(`/api/contabilidad/activos-fijos/${editando.id}`, {
        nombre: edicion.nombre.trim(),
        descripcion: edicion.descripcion.trim() || undefined,
        vida_util_meses: vida,
        valor_residual: residual,
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo actualizar el activo')
      setAviso(`Activo ${response.data.codigo} actualizado hacia adelante.`)
      setEditando(null)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo actualizar el activo')
    } finally {
      setGuardando(false)
    }
  }

  const verCronograma = async (activo: ActivoFijo) => {
    try {
      setError(null)
      const response = await get(`/api/contabilidad/activos-fijos/${activo.id}/cronograma`)
      if (!response?.success) throw new Error(response?.message || 'No se pudo calcular el cronograma')
      setCronograma({ activo, cuotas: response.data || [] })
      setEditando(null)
      setRetirando(null)
    } catch (err: any) {
      setError(err.message || 'No se pudo calcular el cronograma')
    }
  }

  const retirarActivo = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!retirando) return
    const valorVenta = baja.tipo === 'VENTA' ? Number(baja.valor_venta) : undefined
    if (baja.tipo === 'VENTA' && (!Number.isFinite(valorVenta) || Number(valorVenta) < 0)) {
      setError('Ingrese el importe de venta del activo.')
      return
    }
    try {
      setGuardando(true)
      setError(null)
      const response = await post(`/api/contabilidad/activos-fijos/${retirando.id}/baja`, {
        fecha: baja.fecha,
        tipo: baja.tipo,
        valor_venta: valorVenta,
        motivo: baja.motivo.trim() || undefined,
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo retirar el activo')
      setAviso(`Activo ${response.data.codigo} retirado como ${response.data.situacion}.`)
      setRetirando(null)
      setBaja({ fecha: hoy, tipo: 'BAJA', valor_venta: '', motivo: '' })
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo retirar el activo')
    } finally {
      setGuardando(false)
    }
  }

  const depreciar = async () => {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`
    if (!confirm(`Se registrará la depreciación del período ${periodo}. ¿Continuar?`)) return

    try {
      setDepreciando(true)
      setError(null)
      setResultado(null)

      const response = await post('/api/contabilidad/activos-fijos/depreciar', { anio, mes })
      if (!response?.success) throw new Error(response?.message || 'No se pudo depreciar')

      setResultado(response.data)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar la depreciación')
    } finally {
      setDepreciando(false)
    }
  }

  const money = (valor: number) =>
    new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      valor || 0
    )

  const formatFecha = (fecha?: string) =>
    fecha
      ? parseDateLocal(String(fecha).slice(0, 10))?.toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }) ?? fecha
      : '—'

  const totales = activos.reduce(
    (acc, activo) => ({
      adquisicion: acc.adquisicion + Number(activo.valor_adquisicion || 0),
      acumulada: acc.acumulada + Number(activo.depreciacion_acumulada || 0),
      neto: acc.neto + Number(activo.valor_neto || 0),
    }),
    { adquisicion: 0, acumulada: 0, neto: 0 }
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <Building2 className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Activos fijos</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Registro de bienes con su vida útil y depreciación acumulada. La depreciación del
                  período genera el asiento por la cadena contable de eventos.
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
            <Button
              type="button"
              onClick={() => setMostrarAlta((actual) => !actual)}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
            >
              {mostrarAlta ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {mostrarAlta ? 'Cerrar alta' : 'Registrar activo'}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4">
            <div>
              <label htmlFor="activos-fijos-ano" className={labelClass}>Año</label>
              <input id="activos-fijos-ano"
                type="number"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="mt-2 w-28 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <div>
              <label htmlFor="activos-fijos-mes" className={labelClass}>Mes</label>
              <input id="activos-fijos-mes"
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
              onClick={depreciar}
              disabled={depreciando}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {depreciando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4" />
              )}
              Depreciar período
            </Button>
            <p className="text-xs text-muted-foreground">
              Un activo deprecia una sola vez por período; repetir la operación no duplica la cuota.
            </p>
          </div>
        </section>

        {mostrarAlta && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">Alta de activo fijo</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={crearActivo} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Código<input aria-label="Código del activo" required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Nombre<input aria-label="Nombre del activo" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Fecha de adquisición<input aria-label="Fecha de adquisición" type="date" required value={form.fecha_adquisicion} onChange={(e) => setForm({ ...form, fecha_adquisicion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Inicio de depreciación<input aria-label="Inicio de depreciación" type="date" required value={form.fecha_inicio_depreciacion} onChange={(e) => setForm({ ...form, fecha_inicio_depreciacion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Valor de adquisición<input aria-label="Valor de adquisición" type="number" min="0.01" step="0.01" required value={form.valor_adquisicion} onChange={(e) => setForm({ ...form, valor_adquisicion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Valor residual<input aria-label="Valor residual" type="number" min="0" step="0.01" required value={form.valor_residual} onChange={(e) => setForm({ ...form, valor_residual: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Vida útil (meses)<input aria-label="Vida útil en meses" type="number" min="1" step="1" required value={form.vida_util_meses} onChange={(e) => setForm({ ...form, vida_util_meses: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Centro de costo<select aria-label="Centro de costo del activo" value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Sin centro</option>{centrosCosto.map((centro) => <option key={centro.id} value={centro.id}>{centro.codigo ? `${centro.codigo} — ` : ''}{centro.nombre}</option>)}</select></label>
                <label className={`${labelClass} md:col-span-2 xl:col-span-3`}>Descripción<input aria-label="Descripción del activo" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <div className="flex items-end"><Button type="submit" disabled={guardando} className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500">{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar activo</Button></div>
              </form>
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

        {editando && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4"><CardTitle className="text-base">Editar {editando.codigo}</CardTitle></CardHeader>
            <CardContent className="p-5"><form onSubmit={guardarEdicion} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className={labelClass}>Nombre<input aria-label="Nombre editado" required value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Descripción<input aria-label="Descripción editada" value={edicion.descripcion} onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Vida útil (meses)<input aria-label="Vida útil editada" type="number" min="1" required value={edicion.vida_util_meses} onChange={(e) => setEdicion({ ...edicion, vida_util_meses: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Valor residual<input aria-label="Valor residual editado" type="number" min="0" step="0.01" required value={edicion.valor_residual} onChange={(e) => setEdicion({ ...edicion, valor_residual: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <div className="flex items-end gap-2"><Button type="submit" disabled={guardando} className="gap-2 bg-blue-600 text-white"><Save className="h-4 w-4" />Guardar</Button><Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button></div>
            </form></CardContent>
          </Card>
        )}

        {retirando && (
          <Card className="border-amber-400/25 bg-card/70 text-foreground">
            <CardHeader className="border-b border-amber-400/15 px-5 py-4"><CardTitle className="text-base">Retirar {retirando.codigo}</CardTitle></CardHeader>
            <CardContent className="p-5"><form onSubmit={retirarActivo} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className={labelClass}>Fecha<input aria-label="Fecha de baja" type="date" required value={baja.fecha} onChange={(e) => setBaja({ ...baja, fecha: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Operación<select aria-label="Tipo de retiro" value={baja.tipo} onChange={(e) => setBaja({ ...baja, tipo: e.target.value, valor_venta: '' })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="BAJA">Baja sin contraprestación</option><option value="VENTA">Venta</option></select></label>
              <label className={labelClass}>Valor de venta<input aria-label="Valor de venta" type="number" min="0" step="0.01" disabled={baja.tipo !== 'VENTA'} required={baja.tipo === 'VENTA'} value={baja.valor_venta} onChange={(e) => setBaja({ ...baja, valor_venta: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal disabled:opacity-50" /></label>
              <label className={labelClass}>Motivo<input aria-label="Motivo de retiro" value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <div className="flex items-end gap-2"><Button type="submit" disabled={guardando} className="gap-2 bg-amber-600 text-white hover:bg-amber-500"><Archive className="h-4 w-4" />Confirmar</Button><Button type="button" variant="outline" onClick={() => setRetirando(null)}>Cancelar</Button></div>
            </form></CardContent>
          </Card>
        )}

        {cronograma && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground">
            <CardHeader className="flex-row items-center justify-between border-b border-cyan-400/10 px-5 py-4"><CardTitle className="text-base">Cronograma — {cronograma.activo.codigo}</CardTitle><Button type="button" variant="outline" onClick={() => setCronograma(null)}>Cerrar</Button></CardHeader>
            <CardContent className="max-h-80 overflow-auto p-0"><table className="w-full min-w-[600px]"><thead className="sticky top-0 bg-card"><tr><th className="px-4 py-3 text-left">Período</th><th className="px-4 py-3 text-right">Cuota</th><th className="px-4 py-3 text-right">Acumulada</th><th className="px-4 py-3 text-right">Valor neto</th></tr></thead><tbody>{cronograma.cuotas.map((cuota) => <tr key={cuota.periodo} className="border-t border-cyan-400/10"><td className="px-4 py-3">{cuota.periodo}</td><td className="px-4 py-3 text-right">{money(cuota.cuota)}</td><td className="px-4 py-3 text-right">{money(cuota.acumulada)}</td><td className="px-4 py-3 text-right">{money(cuota.valor_neto)}</td></tr>)}</tbody></table></CardContent>
          </Card>
        )}

        {resultado && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <TrendingDown className="h-5 w-5 text-primary" />
                Depreciación del período {resultado.periodo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-foreground/90">
                {resultado.activos_depreciados} activo(s) depreciado(s) por un total de{' '}
                <span className="font-bold">{money(resultado.total_depreciado)}</span>.
              </p>
              {resultado.omitidos && resultado.omitidos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                    Omitidos ({resultado.omitidos.length})
                  </p>
                  {resultado.omitidos.map((omitido) => (
                    <div
                      key={omitido.activo_id}
                      className="rounded-xl border border-cyan-400/15 bg-card/70 p-3 text-sm"
                    >
                      <span className="font-semibold text-primary/80">
                        {omitido.codigo || omitido.activo_id}
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
            ['Valor de adquisición', totales.adquisicion],
            ['Depreciación acumulada', totales.acumulada],
            ['Valor neto en libros', totales.neto],
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
            <CardTitle className="text-base text-foreground">Registro de activos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando activos...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Activo</th>
                      <th className="px-4 py-3">Adquisición</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-right">Vida útil</th>
                      <th className="px-4 py-3 text-right">Acumulada</th>
                      <th className="px-4 py-3 text-right">Neto</th>
                      <th className="px-4 py-3">Situación</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activos.length > 0 ? (
                      activos.map((activo) => (
                        <tr
                          key={activo.id}
                          className="border-b border-cyan-400/10 text-sm text-foreground/90"
                        >
                          <td className="px-4 py-3 font-semibold text-primary/80">{activo.codigo}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{activo.nombre}</div>
                            {activo.descripcion && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {activo.descripcion}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{formatFecha(activo.fecha_adquisicion)}</td>
                          <td className="px-4 py-3 text-right">{money(activo.valor_adquisicion)}</td>
                          <td className="px-4 py-3 text-right">{activo.vida_util_meses} meses</td>
                          <td className="px-4 py-3 text-right">
                            {money(activo.depreciacion_acumulada)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-primary">
                            {money(activo.valor_neto)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                              {activo.situacion}
                            </span>
                          </td>
                          <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button type="button" variant="outline" aria-label={`Ver cronograma ${activo.codigo}`} onClick={() => verCronograma(activo)}><Eye className="h-4 w-4" /></Button>{activo.situacion === 'ACTIVO' && <><Button type="button" variant="outline" aria-label={`Editar ${activo.codigo}`} onClick={() => abrirEdicion(activo)}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="outline" aria-label={`Retirar ${activo.codigo}`} onClick={() => { setRetirando(activo); setEditando(null); setCronograma(null) }}><Archive className="h-4 w-4" /></Button></>}</div></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Todavía no hay activos registrados.
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
