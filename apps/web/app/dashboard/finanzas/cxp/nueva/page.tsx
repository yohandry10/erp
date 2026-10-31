'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, FilePlus2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { readInvoiceReceipts, readInvoiceSuppliers, type InvoiceReceipt as Recepcion, type InvoiceSupplier as Proveedor } from '@/lib/finanzas/supplier-invoice-catalog'
import { readInvoiceRegistration } from '@/lib/finanzas/supplier-invoice-registration'
import { readSupplierInvoiceIntent, supplierInvoiceIntentKey, type SupplierInvoiceIntent } from '@/lib/finanzas/supplier-invoice-intent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DevolucionParaNc = {
  id: string; numero: string; subtotal: number; igv: number; total: number; moneda: string
  factura: { id: string; numero_documento: string; tipo_documento: string; fecha_emision: string; fiscal_metadata?: { serie?: string } }
}
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

const emptyInvoiceForm = () => ({
    proveedor_id: '',
    recepcion_id: '',
    devolucion_proveedor_id: '',
    origen_nota: 'DEVOLUCION',
    factura_proveedor_id: '',
    motivo_nota_credito: 'DESCUENTO',
    cuenta_ajuste_id: '',
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

export default function NuevaCuentaPorPagarPage() {
  const router = useRouter()
  const { get, post } = useApi({ throwOnError: true })
  const { post: postInvoice } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { get: getCatalog } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { session } = useAuth()
  const tenantId = session?.user?.tenant_id || ''
  const actorId = session?.user?.id || ''
  const activeScope = useRef('')
  activeScope.current = `${tenantId}:${actorId}`
  const supplierRead = useRef(0)
  const receiptRead = useRef(0)
  const registrationEpoch = useRef(0)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [proveedoresError, setProveedoresError] = useState('')
  const [loadingRecepciones, setLoadingRecepciones] = useState(true)
  const [recepcionesError, setRecepcionesError] = useState('')
  const [saving, setSaving] = useState(false)
  const [registroError, setRegistroError] = useState('')
  const [pendingIntent, setPendingIntent] = useState<SupplierInvoiceIntent | null>(null)
  const [intentRecoveryError, setIntentRecoveryError] = useState('')
  const [intentReady, setIntentReady] = useState('')
  const [form, setForm] = useState(emptyInvoiceForm)
  const [tasasDetraccion, setTasasDetraccion] = useState<TasaDetraccion[]>([])
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [devoluciones, setDevoluciones] = useState<DevolucionParaNc[]>([])
  const [devolucionesError, setDevolucionesError] = useState('')
  const [loadingDevoluciones, setLoadingDevoluciones] = useState(false)
  const [facturasProveedor, setFacturasProveedor] = useState<any[]>([])
  const [cuentasAjuste, setCuentasAjuste] = useState<any[]>([])
  const [ajusteError, setAjusteError] = useState('')

  const total = useMemo(
    () => Math.round((Number(form.subtotal || 0) + Number(form.igv || 0)) * 100) / 100,
    [form.subtotal, form.igv],
  )
  const esNotaCredito = form.tipo_documento === 'NOTA_CREDITO'
  const notaDevolucion = esNotaCredito && form.origen_nota === 'DEVOLUCION'

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
    if (!tenantId || !actorId) return
    const request = ++supplierRead.current
    const scope = `${tenantId}:${actorId}`
    const current = () => request === supplierRead.current && scope === activeScope.current
    setLoading(true)
    setProveedoresError('')
    try {
      const response = await getCatalog('/api/compras/proveedores?activo=true')
      const rows = readInvoiceSuppliers(response, { tenantId, actorId })
      if (current()) setProveedores(rows)
    } catch (error: any) {
      if (current()) { setProveedores([]); setProveedoresError(error?.message || 'No se pudieron cargar los proveedores') }
    } finally {
      if (current()) setLoading(false)
    }
  }, [getCatalog, tenantId, actorId])

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

  const cargarRecepciones = useCallback(async () => {
    if (!tenantId || !actorId) return
    const request = ++receiptRead.current
    const scope = `${tenantId}:${actorId}`
    const current = () => request === receiptRead.current && scope === activeScope.current
    setLoadingRecepciones(true)
    setRecepcionesError('')
    try {
      const response = await getCatalog('/api/compras/recepciones?estado=CERRADA')
      const rows = readInvoiceReceipts(response, { tenantId, actorId })
      if (current()) setRecepciones(rows)
    } catch (error: any) {
      if (current()) { setRecepciones([]); setRecepcionesError(error?.message || 'No se pudieron cargar las recepciones') }
    } finally {
      if (current()) setLoadingRecepciones(false)
    }
  }, [getCatalog, tenantId, actorId])

  useEffect(() => { void cargarProveedores(); return () => { supplierRead.current++ } }, [cargarProveedores])
  useEffect(() => { void cargarRecepciones(); return () => { receiptRead.current++ } }, [cargarRecepciones])
  useEffect(() => () => { registrationEpoch.current++ }, [tenantId, actorId])
  useEffect(() => {
    setPendingIntent(null); setIntentRecoveryError(''); setIntentReady(''); setRegistroError(''); setSaving(false)
    setForm(emptyInvoiceForm())
    if (!tenantId || !actorId) return
    const scope = { tenantId, actorId }
    try {
      const intent = readSupplierInvoiceIntent(localStorage.getItem(supplierInvoiceIntentKey(scope)), scope)
      setPendingIntent(intent)
      if (intent) {
        const p = intent.payload
        setForm({ ...emptyInvoiceForm(), proveedor_id: p.proveedor_id, recepcion_id: p.recepcion_id || '',
          tipo_documento: p.tipo_documento, serie: p.serie, numero_documento: p.numero_documento,
          fecha_emision: p.fecha_emision, fecha_vencimiento: p.fecha_vencimiento, condiciones_pago: p.condiciones_pago,
          subtotal: String(p.subtotal), igv: String(p.igv), moneda: p.moneda, tipo_cambio: String(p.tipo_cambio),
          destino_credito_fiscal: p.destino_credito_fiscal, codigo_detraccion: p.codigo_detraccion || '',
          detraccion: p.detraccion === undefined ? '' : String(p.detraccion),
          retencion: p.retencion === undefined ? '' : String(p.retencion),
          percepcion: p.percepcion === undefined ? '' : String(p.percepcion), observaciones: p.observaciones || '' })
      }
    } catch (error: any) { setIntentRecoveryError(error?.message || 'No se pudo recuperar el registro pendiente.') }
    setIntentReady(`${tenantId}:${actorId}`)
  }, [tenantId, actorId])
  useEffect(() => { void cargarTasasDetraccion() }, [cargarTasasDetraccion])
  const cargarDevoluciones = useCallback(async () => {
    if (!esNotaCredito || !form.proveedor_id) { setDevoluciones([]); return }
    setLoadingDevoluciones(true)
    setDevolucionesError('')
    try {
      const response = await get(`/api/finanzas/cxp/devoluciones-nota-credito?proveedor_id=${encodeURIComponent(form.proveedor_id)}`)
      if (!response?.success) throw new Error(response?.message || 'No se pudieron consultar las devoluciones')
      setDevoluciones(response.data || [])
    } catch (error: any) {
      setDevolucionesError(error?.message || 'No se pudieron consultar las devoluciones')
      setDevoluciones([])
    } finally { setLoadingDevoluciones(false) }
  }, [esNotaCredito, form.proveedor_id, get])
  useEffect(() => { void cargarDevoluciones() }, [cargarDevoluciones])
  const cargarComprobantesAjuste = useCallback(async () => {
    if (!esNotaCredito || form.origen_nota !== 'AJUSTE' || !form.proveedor_id) return
    setAjusteError('')
    try {
      const [invoices, accounts] = await Promise.all([
        get(`/api/finanzas/cxp?proveedor_id=${encodeURIComponent(form.proveedor_id)}`),
        get('/api/contabilidad/plan-cuentas'),
      ])
      if (!invoices?.success || !accounts?.success) throw new Error('No se pudieron consultar los comprobantes o el plan contable')
      setFacturasProveedor((invoices.data || []).filter((row: any) => ['FACTURA', 'BOLETA'].includes(row.tipo_documento) && row.estado !== 'ANULADA'))
      setCuentasAjuste((accounts.data || []).filter((row: any) => row.acepta_movimiento && !['42', '422', '40'].includes(row.codigo)))
    } catch (error: any) { setAjusteError(error?.message || 'No se pudieron cargar los datos del ajuste') }
  }, [esNotaCredito, form.origen_nota, form.proveedor_id, get])
  useEffect(() => { void cargarComprobantesAjuste() }, [cargarComprobantesAjuste])

  const update = (field: string, value: string) => setForm((current) => ({
    ...current,
    [field]: value,
    // La recepción vinculada debe ser del proveedor de la factura.
    ...(field === 'proveedor_id' || field === 'tipo_documento' || field === 'origen_nota'
      ? { recepcion_id: '', devolucion_proveedor_id: '', factura_proveedor_id: '' } : {}),
  }))
  const recepcionesDelProveedor = recepciones.filter((r) => r.orden?.proveedor?.id === form.proveedor_id)
  const recepcionElegida = recepciones.find((r) => r.id === form.recepcion_id)
  const catalogoBloqueado = loading || !!proveedoresError || !proveedores.some(p => p.id === form.proveedor_id) ||
    (!esNotaCredito && (loadingRecepciones || !!recepcionesError ||
      (!!form.recepcion_id && (!recepcionElegida || recepcionElegida.orden?.proveedor.id !== form.proveedor_id))))
  const elegirDevolucion = (id: string) => {
    const selected = devoluciones.find((row) => row.id === id)
    if (!selected) { update('devolucion_proveedor_id', ''); return }
    const number = selected.factura.numero_documento
    const separator = number.indexOf('-')
    setForm((current) => ({ ...current, devolucion_proveedor_id: id,
      subtotal: String(selected.subtotal), igv: String(selected.igv), moneda: selected.moneda,
      documento_referencia_tipo: selected.factura.tipo_documento,
      documento_referencia_serie: selected.factura.fiscal_metadata?.serie || (separator >= 0 ? number.slice(0, separator) : ''),
      documento_referencia_numero: separator >= 0 ? number.slice(separator + 1) : number,
      documento_referencia_fecha: String(selected.factura.fecha_emision).slice(0, 10),
      fecha_vencimiento: current.fecha_emision, condiciones_pago: 'CONTADO',
      codigo_detraccion: '', detraccion: '', retencion: '', percepcion: '',
    }))
  }

  const elegirFacturaAjuste = (id: string) => {
    const selected = facturasProveedor.find((row) => row.id === id)
    if (!selected) { update('factura_proveedor_id', ''); return }
    const number = selected.numero_documento
    const separator = number.indexOf('-')
    setForm((current) => ({ ...current, factura_proveedor_id: id, moneda: selected.moneda,
      documento_referencia_tipo: selected.tipo_documento,
      documento_referencia_serie: selected.fiscal_metadata?.serie || (separator >= 0 ? number.slice(0, separator) : ''),
      documento_referencia_numero: separator >= 0 ? number.slice(separator + 1) : number,
      documento_referencia_fecha: String(selected.fecha_emision).slice(0, 10),
      fecha_vencimiento: current.fecha_emision, condiciones_pago: 'CONTADO',
      ...(current.motivo_nota_credito === 'ANULACION' ? { subtotal: String(selected.subtotal), igv: String(selected.igv) } : {}),
      codigo_detraccion: '', detraccion: '', retencion: '', percepcion: '',
    }))
  }

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
    if (saving || intentRecoveryError || intentReady !== activeScope.current) return
    if (!pendingIntent && catalogoBloqueado) return toast.error('Consulta los catálogos y confirma el proveedor y la recepción antes de registrar.')
    if (total <= 0) return toast.error('El total debe ser mayor a cero')
    if (form.fecha_vencimiento < form.fecha_emision) return toast.error('El vencimiento no puede ser anterior a la emisión')
    if (form.moneda !== 'PEN' && Number(form.tipo_cambio) <= 0) return toast.error('Ingrese el tipo de cambio')
    if (notaDevolucion && !form.devolucion_proveedor_id) return toast.error('Seleccione la devolución emitida que sustenta la nota de crédito')
    if (esNotaCredito && !notaDevolucion && (!form.factura_proveedor_id || !form.cuenta_ajuste_id)) return toast.error('Seleccione el comprobante original y la contrapartida contable')

    setSaving(true)
    setRegistroError('')
    const submittedScope = activeScope.current
    const submittedEpoch = ++registrationEpoch.current
    const current = () => activeScope.current === submittedScope && registrationEpoch.current === submittedEpoch
    try {
      const payload = {
        proveedor_id: form.proveedor_id,
        ...(recepcionElegida && !esNotaCredito ? {
          recepcion_id: recepcionElegida.id,
          ...(recepcionElegida.orden_id ? { orden_id: recepcionElegida.orden_id } : {}),
        } : {}),
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
          ...(notaDevolucion ? { devolucion_proveedor_id: form.devolucion_proveedor_id }
            : { factura_proveedor_id: form.factura_proveedor_id, motivo_nota_credito: form.motivo_nota_credito, cuenta_ajuste_id: form.cuenta_ajuste_id }),
          documento_referencia_tipo: form.documento_referencia_tipo,
          documento_referencia_serie: form.documento_referencia_serie.trim(),
          documento_referencia_numero: form.documento_referencia_numero.trim(),
          documento_referencia_fecha: form.documento_referencia_fecha,
        } : {}),
      }
      const scope = { tenantId, actorId }
      let intent: SupplierInvoiceIntent | null = null
      let storageKey = ''
      if (!esNotaCredito) {
        storageKey = supplierInvoiceIntentKey(scope)
        const stored = readSupplierInvoiceIntent(localStorage.getItem(storageKey), scope)
        intent = pendingIntent || { ...scope, version: 1, createdAt: new Date().toISOString(), payload }
        const serialized = JSON.stringify(intent)
        readSupplierInvoiceIntent(serialized, scope)
        if (stored && JSON.stringify(stored) !== serialized) throw new Error('Hay otro registro pendiente. Sus datos se conservan.')
        // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
        // codeql[js/clear-text-storage-of-sensitive-data]
        localStorage.setItem(storageKey, serialized)
        if (localStorage.getItem(storageKey) !== serialized) throw new Error('No se pudo conservar el registro antes del envío.')
        setPendingIntent(intent)
      }
      const requestPayload = intent?.payload || payload
      const response = await (esNotaCredito ? post : postInvoice)('/api/finanzas/cxp', requestPayload)
      if (!current()) return
      const receipt = esNotaCredito
        ? response?.success === true && response?.data?.id ? response.data : null
        : readInvoiceRegistration(response, requestPayload, scope)
      if (!receipt) throw new Error(response?.message || 'No se pudo registrar la factura')
      if (intent) {
        if (localStorage.getItem(storageKey) !== JSON.stringify(intent)) throw new Error('El registro pendiente cambió. Se conserva para revisar su resultado.')
        localStorage.removeItem(storageKey)
        setPendingIntent(null)
      }
      toast.success(esNotaCredito ? notaDevolucion ? 'Nota recibida registrada para la devolución aplicada' : 'Nota registrada: deuda ajustada y crédito excedente disponible' : 'Factura del proveedor registrada con su asiento pendiente de procesamiento')
      router.push(`/dashboard/finanzas/cxp/${receipt.id}`)
    } catch (error: any) {
      if (!current()) return
      setRegistroError(error?.message || 'No se pudo registrar la factura del proveedor')
      toast.error(error?.message || 'No se pudo registrar la factura del proveedor')
    } finally {
      if (current()) setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Compras · Finanzas</p>
            <h1 className="mt-2 text-3xl font-black">Registrar documento del proveedor</h1>
            <p className="mt-1 text-sm text-muted-foreground">{esNotaCredito ? 'Registre la nota recibida para sustentar una devolución ya emitida.' : 'La CxP, el crédito fiscal y el evento contable nacen al guardar este documento.'}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/finanzas/cxp')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </div>

        <form onSubmit={submit}>
          <fieldset disabled={saving || !!pendingIntent || !!intentRecoveryError || intentReady !== activeScope.current}>
          <Card className="border-cyan-400/20 bg-card/70">
            <CardHeader><CardTitle className="flex items-center gap-2"><FilePlus2 className="h-5 w-5 text-primary" /> Documento fiscal de compra</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className={labelClass}>Proveedor
                <select required disabled={loading || !!proveedoresError} className={inputClass} value={form.proveedor_id} onChange={(e) => update('proveedor_id', e.target.value)}>
                  <option value="">Seleccione un proveedor</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}{p.ruc ? ` · ${p.ruc}` : ''}</option>)}
                </select>
              </label>
              {proveedoresError && <div role="alert" className="space-y-2 text-sm text-red-500 md:col-span-2"><p>{proveedoresError}</p><Button type="button" variant="outline" onClick={() => void cargarProveedores()}>Reintentar proveedores</Button></div>}
              <label className={labelClass}>Tipo de documento
                <select className={inputClass} value={form.tipo_documento} onChange={(e) => update('tipo_documento', e.target.value)}>
                  <option value="FACTURA">Factura</option><option value="NOTA_CREDITO">Nota de crédito</option><option value="NOTA_DEBITO">Nota de débito</option><option value="RECIBO_HONORARIOS">Recibo por honorarios</option>
                </select>
              </label>
              {!esNotaCredito && recepcionesError && <div role="alert" className="space-y-2 text-sm text-red-500 md:col-span-2"><p>{recepcionesError}</p><Button type="button" variant="outline" onClick={() => void cargarRecepciones()}>Reintentar recepciones</Button></div>}
              {!esNotaCredito && loadingRecepciones && <p role="status" className="text-sm md:col-span-2">Consultando recepciones…</p>}
              {!esNotaCredito && !loadingRecepciones && !recepcionesError && (recepcionesDelProveedor.length > 0 || !!form.recepcion_id) && (
                <label className={`${labelClass} md:col-span-2`}>Recepción de la mercadería facturada
                  <select className={inputClass} value={form.recepcion_id} onChange={(e) => update('recepcion_id', e.target.value)}>
                    <option value="">Sin recepción (servicio o compra no recibida en almacén)</option>
                    {recepcionesDelProveedor.map((r) => (
                      <option key={r.id} value={r.id}>{r.numero}{r.orden?.numero ? ` · ${r.orden.numero}` : ''}{r.fecha_recepcion ? ` · ${String(r.fecha_recepcion).slice(0, 10)}` : ''}</option>
                    ))}
                  </select>
                  {!!form.recepcion_id && !recepcionElegida && <span role="alert" className="block text-red-500">La recepción seleccionada ya no está disponible. Confirma el vínculo antes de registrar.</span>}
                  <span className="block text-xs font-normal text-muted-foreground">
                    Si la mercadería ya ingresó al almacén, vincúlela: el asiento cancela la mercadería por facturar en lugar de volver a cargar el inventario. Si la factura cubre varias recepciones de la misma orden, elija una de ellas.
                  </span>
                </label>
              )}
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

              {!esNotaCredito && <div className="grid gap-4 rounded-2xl border border-cyan-400/20 bg-card/40 p-4 md:col-span-2 md:grid-cols-2">
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
              </div>}

              {esNotaCredito && <div className="grid gap-4 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 md:col-span-2 md:grid-cols-2">
                <h2 className="font-bold text-amber-300 md:col-span-2">Comprobante modificado obligatorio</h2>
                <label className={`${labelClass} md:col-span-2`}>Origen de la nota
                  <select className={inputClass} value={form.origen_nota} onChange={(e) => update('origen_nota', e.target.value)}>
                    <option value="DEVOLUCION">Devolución ya emitida</option><option value="AJUSTE">Descuento o anulación del comprobante</option>
                  </select>
                </label>
                {notaDevolucion ? <><label className={`${labelClass} md:col-span-2`}>Devolución emitida
                  <select required disabled={loadingDevoluciones} className={inputClass} value={form.devolucion_proveedor_id} onChange={(e) => elegirDevolucion(e.target.value)}>
                    <option value="">{loadingDevoluciones ? 'Consultando devoluciones…' : 'Seleccione una devolución pendiente de nota'}</option>
                    {devoluciones.map((row) => <option key={row.id} value={row.id}>{row.numero} · {row.factura.numero_documento} · {row.moneda} {Number(row.total).toFixed(2)}</option>)}
                  </select>
                </label>
                <p className="text-xs text-muted-foreground md:col-span-2">La devolución ya ajustó el inventario, la deuda y la contabilidad. Esta nota se incluye como documento separado en el Registro de Compras.</p>
                {devolucionesError && <div role="alert" className="text-sm text-red-400 md:col-span-2">{devolucionesError} <button type="button" className="underline" onClick={() => void cargarDevoluciones()}>Reintentar</button></div>}
                {!loadingDevoluciones && !devolucionesError && form.proveedor_id && devoluciones.length === 0 && <p className="text-sm text-amber-300 md:col-span-2">Este proveedor no tiene devoluciones emitidas pendientes de una nota.</p>}</> : <>
                  <label className={labelClass}>Motivo<select className={inputClass} value={form.motivo_nota_credito} onChange={(e) => update('motivo_nota_credito', e.target.value)}><option value="DESCUENTO">Descuento o reducción del importe</option><option value="ANULACION">Anulación completa del importe restante</option></select></label>
                  <label className={labelClass}>Comprobante original<select required className={inputClass} value={form.factura_proveedor_id} onChange={(e) => elegirFacturaAjuste(e.target.value)}><option value="">Seleccione comprobante</option>{facturasProveedor.map((row) => <option key={row.id} value={row.id}>{row.numero_documento} · {row.moneda} {Number(row.total).toFixed(2)} · saldo {Number(row.saldo).toFixed(2)}</option>)}</select></label>
                  <label className={`${labelClass} md:col-span-2`}>Contrapartida contable del ajuste<select required className={inputClass} value={form.cuenta_ajuste_id} onChange={(e) => update('cuenta_ajuste_id', e.target.value)}><option value="">Seleccione cuenta de descuento o reversión de la compra</option>{cuentasAjuste.map((row) => <option key={row.id} value={row.id}>{row.codigo} · {row.nombre}</option>)}</select></label>
                  <p className="text-xs text-muted-foreground md:col-span-2">Reduce el importe de la compra y su deuda una sola vez. La parte ya pagada queda como crédito para aplicar a otra factura o registrar un reembolso. El inventario sólo cambia mediante una devolución física.</p>
                  {ajusteError && <div role="alert" className="text-sm text-red-400 md:col-span-2">{ajusteError} <button type="button" className="underline" onClick={() => void cargarComprobantesAjuste()}>Reintentar</button></div>}
                </>}
                <label className={labelClass}>Tipo<select className={inputClass} value={form.documento_referencia_tipo} onChange={(e) => update('documento_referencia_tipo', e.target.value)}><option value="FACTURA">Factura</option><option value="BOLETA">Boleta</option></select></label>
                <label className={labelClass}>Fecha<input required type="date" className={inputClass} value={form.documento_referencia_fecha} onChange={(e) => update('documento_referencia_fecha', e.target.value)} /></label>
                <label className={labelClass}>Serie<input required className={inputClass} value={form.documento_referencia_serie} onChange={(e) => update('documento_referencia_serie', e.target.value.toUpperCase())} /></label>
                <label className={labelClass}>Número<input required className={inputClass} value={form.documento_referencia_numero} onChange={(e) => update('documento_referencia_numero', e.target.value)} /></label>
              </div>}

              <label className={`${labelClass} md:col-span-2`}>Observaciones<textarea rows={3} className={inputClass} value={form.observaciones} onChange={(e) => update('observaciones', e.target.value)} /></label>
              <div className="flex justify-end gap-2 md:col-span-2">
                <Button type="button" variant="outline" onClick={() => router.push('/dashboard/finanzas/cxp')}>Cancelar</Button>
                {!pendingIntent && <Button type="submit" disabled={saving || !!intentRecoveryError || intentReady !== activeScope.current || catalogoBloqueado || (notaDevolucion && (loadingDevoluciones || !form.devolucion_proveedor_id)) || (esNotaCredito && !notaDevolucion && (!form.factura_proveedor_id || !form.cuenta_ajuste_id))} className="gap-2 bg-blue-600 text-white hover:bg-blue-500"><Save className="h-4 w-4" />{saving ? 'Guardando…' : esNotaCredito ? 'Registrar nota de crédito' : 'Registrar factura'}</Button>}
              </div>
            </CardContent>
          </Card>
          {registroError && <div role="alert" className="mt-4 text-sm text-red-500">{registroError}</div>}
          </fieldset>
          {pendingIntent && <div className="mt-4 space-y-3"><p role="status">Hay un documento pendiente de confirmación. Se conservan los datos para reintentar el mismo registro.</p><Button type="submit" disabled={saving || !!intentRecoveryError || intentReady !== activeScope.current}>{saving ? 'Guardando…' : 'Reintentar registro pendiente'}</Button></div>}
          {intentRecoveryError && <div role="alert" className="mt-4 text-sm text-red-500">{intentRecoveryError}</div>}
        </form>
      </div>
    </div>
  )
}
