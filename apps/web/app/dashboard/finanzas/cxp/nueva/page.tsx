'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FilePlus2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Proveedor = { id: string; razon_social: string; ruc?: string }
type TasaDetraccion = {
  codigo: string
  descripcion: string
  anexo: string
  tasa: number
  importe_minimo: number | null
}

const hoyLocal = () => {
  const fecha = new Date()
  const offset = fecha.getTimezoneOffset() * 60_000
  return new Date(fecha.getTime() - offset).toISOString().slice(0, 10)
}

const inputClass = 'w-full rounded-xl border border-cyan-400/20 bg-card/80 px-3 py-3 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'
const labelClass = 'space-y-2 text-sm font-semibold text-foreground'

export default function NuevaCuentaPorPagarPage() {
  const router = useRouter()
  const { get, post } = useApi({ throwOnError: true })
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    proveedor_id: '',
    tipo_documento: 'FACTURA',
    serie: 'F001',
    numero_documento: '',
    fecha_emision: hoyLocal(),
    fecha_vencimiento: hoyLocal(),
    condiciones_pago: 'CONTADO',
    moneda: 'PEN',
    tipo_cambio: '',
    subtotal: '',
    igv: '',
    documento_referencia_tipo: 'FACTURA',
    documento_referencia_serie: '',
    documento_referencia_numero: '',
    documento_referencia_fecha: '',
    observaciones: '',
    destino_credito_fiscal: 'GRAVADAS',
    codigo_detraccion: '',
    detraccion: '',
    retencion: '',
    percepcion: '',
  })
  const [tasasDetraccion, setTasasDetraccion] = useState<TasaDetraccion[]>([])

  const total = useMemo(
    () => Math.round((Number(form.subtotal || 0) + Number(form.igv || 0)) * 100) / 100,
    [form.subtotal, form.igv],
  )
  const esNotaCredito = form.tipo_documento === 'NOTA_CREDITO'

  const tasaElegida = useMemo(
    () => tasasDetraccion.find((t) => t.codigo === form.codigo_detraccion) ?? null,
    [tasasDetraccion, form.codigo_detraccion],
  )

  /**
   * Lo que saldría de aplicar la tasa del catálogo. Por debajo del importe
   * mínimo la operación no lleva detracción, y ahí lo que corresponde es cero.
   */
  const detraccionSugerida = useMemo(() => {
    if (!tasaElegida || total <= 0) return null
    const minimo = Number(tasaElegida.importe_minimo ?? 0)
    if (minimo > 0 && total < minimo) return 0
    return Math.round(total * Number(tasaElegida.tasa) * 100) / 100
  }, [tasaElegida, total])

  // Se avisa, no se impone: hay operaciones con reglas especiales y el contador
  // tiene que poder apartarse del catálogo a sabiendas.
  const detraccionDiscrepa =
    detraccionSugerida !== null &&
    form.detraccion !== '' &&
    Math.abs(Number(form.detraccion) - detraccionSugerida) > 0.01

  const cargarProveedores = useCallback(async () => {
    try {
      const response = await get('/api/compras/proveedores?activo=true')
      if (!response?.success) throw new Error(response?.message || 'No se pudieron cargar proveedores')
      setProveedores(response.data || [])
    } catch (error: any) {
      toast.error(error?.message || 'No se pudieron cargar los proveedores')
    } finally {
      setLoading(false)
    }
  }, [get])

  const cargarTasasDetraccion = useCallback(async () => {
    try {
      const response = await get('/api/finanzas/cxp/detracciones/tasas')
      setTasasDetraccion(response?.data || [])
    } catch {
      // Que el catálogo no cargue no puede impedir registrar la factura: el
      // código se puede teclear igual y el contraste lo hace la base.
      setTasasDetraccion([])
    }
  }, [get])

  useEffect(() => { void cargarProveedores() }, [cargarProveedores])
  useEffect(() => { void cargarTasasDetraccion() }, [cargarTasasDetraccion])

  const update = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }))

  /**
   * Al elegir el código se rellena el importe con lo que sale de la tasa, y al
   * quitarlo se vacía: dejar un importe de detracción sin código sería declarar
   * un depósito que no se puede identificar.
   */
  const elegirCodigoDetraccion = (codigo: string) => {
    const tasa = tasasDetraccion.find((t) => t.codigo === codigo)
    let sugerido = ''
    if (tasa && total > 0) {
      const minimo = Number(tasa.importe_minimo ?? 0)
      sugerido = minimo > 0 && total < minimo
        ? '0'
        : String(Math.round(total * Number(tasa.tasa) * 100) / 100)
    }
    setForm((current) => ({ ...current, codigo_detraccion: codigo, detraccion: codigo ? sugerido : '' }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (total <= 0) return toast.error('El total debe ser mayor a cero')
    if (form.fecha_vencimiento < form.fecha_emision) return toast.error('El vencimiento no puede ser anterior a la emisión')
    if (form.moneda !== 'PEN' && Number(form.tipo_cambio) <= 0) return toast.error('Ingrese el tipo de cambio')

    setSaving(true)
    try {
      const response = await post('/api/finanzas/cxp', {
        proveedor_id: form.proveedor_id,
        tipo_documento: form.tipo_documento,
        serie: form.serie.trim(),
        numero_documento: form.numero_documento.trim(),
        fecha_emision: form.fecha_emision,
        fecha_vencimiento: form.fecha_vencimiento,
        condiciones_pago: form.condiciones_pago,
        subtotal: Number(form.subtotal),
        igv: Number(form.igv),
        total,
        moneda: form.moneda,
        tipo_cambio: form.moneda === 'PEN' ? 1 : Number(form.tipo_cambio),
        observaciones: form.observaciones.trim() || undefined,
        destino_credito_fiscal: form.destino_credito_fiscal,
        ...(form.codigo_detraccion ? { codigo_detraccion: form.codigo_detraccion } : {}),
        ...(Number(form.detraccion) > 0 ? { detraccion: Number(form.detraccion) } : {}),
        ...(Number(form.retencion) > 0 ? { retencion: Number(form.retencion) } : {}),
        ...(Number(form.percepcion) > 0 ? { percepcion: Number(form.percepcion) } : {}),
        ...(esNotaCredito ? {
          documento_referencia_tipo: form.documento_referencia_tipo,
          documento_referencia_serie: form.documento_referencia_serie.trim(),
          documento_referencia_numero: form.documento_referencia_numero.trim(),
          documento_referencia_fecha: form.documento_referencia_fecha,
        } : {}),
      })
      if (!response?.success || !response?.data?.id) throw new Error(response?.message || 'No se pudo registrar la factura')
      toast.success('Factura del proveedor registrada con su asiento pendiente de procesamiento')
      router.push(`/dashboard/finanzas/cxp/${response.data.id}`)
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo registrar la factura del proveedor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Compras · Finanzas</p>
            <h1 className="mt-2 text-3xl font-black">Registrar factura del proveedor</h1>
            <p className="mt-1 text-sm text-muted-foreground">La CxP, el crédito fiscal y el evento contable nacen al guardar este documento.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/finanzas/cxp')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </div>

        <form onSubmit={submit}>
          <Card className="border-cyan-400/20 bg-card/70">
            <CardHeader><CardTitle className="flex items-center gap-2"><FilePlus2 className="h-5 w-5 text-primary" /> Documento fiscal de compra</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>Proveedor
                <select required disabled={loading} className={inputClass} value={form.proveedor_id} onChange={(e) => update('proveedor_id', e.target.value)}>
                  <option value="">Seleccione un proveedor</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}{p.ruc ? ` · ${p.ruc}` : ''}</option>)}
                </select>
              </label>
              <label className={labelClass}>Tipo de documento
                <select className={inputClass} value={form.tipo_documento} onChange={(e) => update('tipo_documento', e.target.value)}>
                  <option value="FACTURA">Factura</option><option value="NOTA_CREDITO">Nota de crédito</option><option value="NOTA_DEBITO">Nota de débito</option><option value="RECIBO_HONORARIOS">Recibo por honorarios</option>
                </select>
              </label>
              <label className={labelClass}>Serie
                <input required className={inputClass} value={form.serie} onChange={(e) => update('serie', e.target.value.toUpperCase())} placeholder="F001" />
              </label>
              <label className={labelClass}>Número completo
                <input required className={inputClass} value={form.numero_documento} onChange={(e) => update('numero_documento', e.target.value.toUpperCase())} placeholder="F001-00000123" />
              </label>
              <label className={labelClass}>Fecha de emisión
                <input required type="date" className={inputClass} value={form.fecha_emision} onChange={(e) => update('fecha_emision', e.target.value)} />
              </label>
              <label className={labelClass}>Fecha de vencimiento
                <input required type="date" min={form.fecha_emision} className={inputClass} value={form.fecha_vencimiento} onChange={(e) => update('fecha_vencimiento', e.target.value)} />
              </label>
              <label className={labelClass}>Condición de pago
                <select className={inputClass} value={form.condiciones_pago} onChange={(e) => update('condiciones_pago', e.target.value)}>
                  {['CONTADO', 'CREDITO_7', 'CREDITO_15', 'CREDITO_30', 'CREDITO_45', 'CREDITO_60', 'CREDITO_90'].map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>Moneda
                  <select className={inputClass} value={form.moneda} onChange={(e) => update('moneda', e.target.value)}><option value="PEN">PEN</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
                </label>
                <label className={labelClass}>Tipo de cambio
                  <input type="number" min="0.001" step="0.001" disabled={form.moneda === 'PEN'} required={form.moneda !== 'PEN'} className={inputClass} value={form.moneda === 'PEN' ? '1' : form.tipo_cambio} onChange={(e) => update('tipo_cambio', e.target.value)} />
                </label>
              </div>
              <label className={labelClass}>Subtotal
                <input required type="number" min="0" step="0.01" className={inputClass} value={form.subtotal} onChange={(e) => update('subtotal', e.target.value)} />
              </label>
              <label className={labelClass}>IGV
                <input required type="number" min="0" step="0.01" className={inputClass} value={form.igv} onChange={(e) => update('igv', e.target.value)} />
              </label>
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 md:col-span-2"><span className="text-xs font-bold uppercase tracking-wider text-primary">Total</span><div className="mt-1 text-2xl font-black">{form.moneda} {total.toFixed(2)}</div></div>

              <div className="grid gap-4 rounded-2xl border border-cyan-400/20 bg-card/40 p-4 md:col-span-2 md:grid-cols-2">
                <div className="md:col-span-2">
                  <h2 className="font-bold text-primary">Tratamiento tributario</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Decide cuánto crédito fiscal da esta compra y qué se deposita o retiene.
                    Lo que se ponga aquí es lo que sale después en la determinación mensual.
                  </p>
                </div>

                <label className={`${labelClass} md:col-span-2`}>Destino del crédito fiscal
                  <select className={inputClass} value={form.destino_credito_fiscal} onChange={(e) => update('destino_credito_fiscal', e.target.value)}>
                    <option value="GRAVADAS">Operaciones gravadas · crédito íntegro</option>
                    <option value="NO_GRAVADAS">Operaciones no gravadas · sin crédito</option>
                    <option value="COMUN">Uso común · crédito por prorrata</option>
                  </select>
                  <span className="block text-xs font-normal text-muted-foreground">
                    Depende de para qué se usó lo comprado, así que sólo lo sabe quien la registra.
                    «Uso común» aplica el coeficiente de los últimos doce meses (artículo 23 de la Ley del IGV).
                  </span>
                </label>

                <label className={labelClass}>Detracción · código del SPOT
                  <select className={inputClass} value={form.codigo_detraccion} onChange={(e) => elegirCodigoDetraccion(e.target.value)}>
                    <option value="">Sin detracción</option>
                    {tasasDetraccion.map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.codigo} · {t.descripcion} ({(Number(t.tasa) * 100).toFixed(1)}%)
                      </option>
                    ))}
                  </select>
                  {tasaElegida && <span className="block text-xs font-normal text-muted-foreground">
                    Anexo {tasaElegida.anexo}, tasa {(Number(tasaElegida.tasa) * 100).toFixed(1)}%
                    {Number(tasaElegida.importe_minimo ?? 0) > 0
                      ? ` · sólo desde S/ ${Number(tasaElegida.importe_minimo).toFixed(2)}`
                      : ' · sin importe mínimo'}
                  </span>}
                </label>

                <label className={labelClass}>Detracción · importe a depositar
                  <input type="number" min="0" step="0.01" disabled={!form.codigo_detraccion} className={inputClass} value={form.detraccion} onChange={(e) => update('detraccion', e.target.value)} />
                  {detraccionDiscrepa && <span className="block text-xs font-normal text-amber-300">
                    Del código {form.codigo_detraccion} salen S/ {detraccionSugerida?.toFixed(2)}. Se guarda lo que usted ponga,
                    pero quedará anotada la diferencia.
                  </span>}
                </label>

                <label className={labelClass}>Retención de IGV
                  <input type="number" min="0" step="0.01" className={inputClass} value={form.retencion} onChange={(e) => update('retencion', e.target.value)} />
                  <span className="block text-xs font-normal text-muted-foreground">Sólo si su empresa es agente de retención.</span>
                </label>

                <label className={labelClass}>Percepción
                  <input type="number" min="0" step="0.01" className={inputClass} value={form.percepcion} onChange={(e) => update('percepcion', e.target.value)} />
                  <span className="block text-xs font-normal text-muted-foreground">La que le haya cobrado el proveedor.</span>
                </label>
              </div>

              {esNotaCredito && <div className="grid gap-4 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 md:col-span-2 md:grid-cols-2">
                <h2 className="font-bold text-amber-300 md:col-span-2">Comprobante modificado obligatorio</h2>
                <label className={labelClass}>Tipo<select className={inputClass} value={form.documento_referencia_tipo} onChange={(e) => update('documento_referencia_tipo', e.target.value)}><option value="FACTURA">Factura</option><option value="BOLETA">Boleta</option></select></label>
                <label className={labelClass}>Fecha<input required type="date" className={inputClass} value={form.documento_referencia_fecha} onChange={(e) => update('documento_referencia_fecha', e.target.value)} /></label>
                <label className={labelClass}>Serie<input required className={inputClass} value={form.documento_referencia_serie} onChange={(e) => update('documento_referencia_serie', e.target.value.toUpperCase())} /></label>
                <label className={labelClass}>Número<input required className={inputClass} value={form.documento_referencia_numero} onChange={(e) => update('documento_referencia_numero', e.target.value)} /></label>
              </div>}

              <label className={`${labelClass} md:col-span-2`}>Observaciones<textarea rows={3} className={inputClass} value={form.observaciones} onChange={(e) => update('observaciones', e.target.value)} /></label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <Button type="button" variant="outline" onClick={() => router.push('/dashboard/finanzas/cxp')}>Cancelar</Button>
                <Button type="submit" disabled={saving || loading || proveedores.length === 0} className="gap-2 bg-blue-600 text-white hover:bg-blue-500"><Save className="h-4 w-4" />{saving ? 'Guardando…' : 'Registrar factura'}</Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
