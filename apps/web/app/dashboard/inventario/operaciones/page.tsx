'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { useApi } from '@/hooks/use-api'

type Producto = {
  id: string
  codigo?: string | null
  nombre: string
  es_servicio?: boolean
  controla_stock?: boolean
}

type Almacen = {
  id: string
  codigo?: string | null
  nombre: string
}

type AjusteForm = {
  producto_id: string
  almacen_id: string
  delta: string
  motivo: string
}

type TransferenciaForm = {
  producto_id: string
  almacen_origen_id: string
  almacen_destino_id: string
  cantidad: string
  motivo: string
}

const EMPTY_AJUSTE: AjusteForm = {
  producto_id: '',
  almacen_id: '',
  delta: '',
  motivo: '',
}

const EMPTY_TRANSFERENCIA: TransferenciaForm = {
  producto_id: '',
  almacen_origen_id: '',
  almacen_destino_id: '',
  cantidad: '',
  motivo: '',
}

function SinPermiso() {
  return (
    <div className="rounded-2xl border bg-amber-500/10 p-6 text-amber-200">
      Necesitas el permiso <code>inventario.movimientos.create</code> para operar existencias.
    </div>
  )
}

export default function OperacionesInventarioPage() {
  const { get, post } = useApi()
  const [modo, setModo] = useState<'ajuste' | 'transferencia'>('ajuste')
  const [productos, setProductos] = useState<Producto[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [ajuste, setAjuste] = useState<AjusteForm>(EMPTY_AJUSTE)
  const [transferencia, setTransferencia] = useState<TransferenciaForm>(EMPTY_TRANSFERENCIA)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null)

  const cargarCatalogos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [productosResponse, almacenesResponse] = await Promise.all([
        get('/inventario/productos'),
        get('/inventario/almacenes'),
      ])
      const fisicos = (Array.isArray(productosResponse?.data) ? productosResponse.data : [])
        .filter((producto: Producto) => !producto.es_servicio && producto.controla_stock !== false)
      setProductos(fisicos)
      setAlmacenes(Array.isArray(almacenesResponse?.data) ? almacenesResponse.data : [])
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar productos y almacenes.')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    void cargarCatalogos()
  }, [cargarCatalogos])

  const keyFor = (prefix: string, payload: object) => {
    const fingerprint = JSON.stringify(payload)
    if (attemptRef.current?.fingerprint === fingerprint) return attemptRef.current.key
    const key = `${prefix}:${crypto.randomUUID()}`
    attemptRef.current = { fingerprint, key }
    return key
  }

  const submitAjuste = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    const delta = Number(ajuste.delta)
    if (!ajuste.producto_id || !ajuste.almacen_id || !Number.isFinite(delta) || delta === 0) {
      setError('Selecciona producto y almacén, e ingresa una diferencia distinta de cero.')
      return
    }
    const payload = {
      producto_id: ajuste.producto_id,
      almacen_id: ajuste.almacen_id,
      delta,
      motivo: ajuste.motivo.trim(),
    }
    if (payload.motivo.length < 3) {
      setError('Explica el motivo del ajuste con al menos 3 caracteres.')
      return
    }
    try {
      setSubmitting(true)
      const response = await post('/inventario/movimientos', {
        ...payload,
        idempotency_key: keyFor('inventario-ajuste', payload),
      })
      const resultado = response?.data ?? response
      setSuccess(
        `Ajuste ${resultado?.tipo ?? ''} registrado. Nuevo stock total: ${Number(
          resultado?.stock_nuevo ?? 0,
        ).toLocaleString('es-PE', { maximumFractionDigits: 6 })}.`,
      )
      attemptRef.current = null
      setAjuste((actual) => ({ ...actual, delta: '', motivo: '' }))
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar el ajuste.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitTransferencia = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    const cantidad = Number(transferencia.cantidad)
    if (
      !transferencia.producto_id ||
      !transferencia.almacen_origen_id ||
      !transferencia.almacen_destino_id ||
      transferencia.almacen_origen_id === transferencia.almacen_destino_id ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0
    ) {
      setError('Completa el producto, dos almacenes distintos y una cantidad positiva.')
      return
    }
    const payload = {
      producto_id: transferencia.producto_id,
      almacen_origen_id: transferencia.almacen_origen_id,
      almacen_destino_id: transferencia.almacen_destino_id,
      cantidad,
      motivo: transferencia.motivo.trim(),
    }
    if (payload.motivo.length < 3) {
      setError('Explica el motivo de la transferencia con al menos 3 caracteres.')
      return
    }
    try {
      setSubmitting(true)
      const response = await post('/inventario/transferencias', {
        ...payload,
        idempotency_key: keyFor('inventario-transferencia', payload),
      })
      const resultado = response?.data ?? response
      setSuccess(
        `Transferencia confirmada por ${Number(resultado?.cantidad ?? cantidad).toLocaleString(
          'es-PE',
          { maximumFractionDigits: 6 },
        )} unidad(es).`,
      )
      attemptRef.current = null
      setTransferencia((actual) => ({ ...actual, cantidad: '', motivo: '' }))
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar la transferencia.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground'
  const labelClass = 'text-sm font-semibold text-foreground/85'

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Operaciones de inventario</h1>
            <p className="mt-2 max-w-3xl text-foreground/75">
              Registra diferencias de conteo con su asiento o traslada existencias entre almacenes sin alterar el valor total.
            </p>
          </div>
          <Link href="/dashboard/inventario/kardex" className="font-semibold text-primary hover:text-primary/80">
            Ver kardex →
          </Link>
        </div>
      </header>

      <ProtectedComponent modulo="inventario" recurso="movimientos" accion="create" fallback={<SinPermiso />}>
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Tipo de operación">
            {(['ajuste', 'transferencia'] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                role="tab"
                aria-selected={modo === opcion}
                onClick={() => {
                  setModo(opcion)
                  setError(null)
                  setSuccess(null)
                  attemptRef.current = null
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  modo === opcion ? 'bg-primary text-primary-foreground' : 'border bg-background text-foreground'
                }`}
              >
                {opcion === 'ajuste' ? 'Ajuste por conteo' : 'Transferencia entre almacenes'}
              </button>
            ))}
          </div>

          {loading ? <p className="text-foreground/70">Cargando catálogos…</p> : null}
          {!loading && productos.length === 0 ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-200">
              No hay productos físicos activos con control de stock.
            </p>
          ) : null}
          {error ? <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-4 text-destructive">{error}</p> : null}
          {success ? <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 p-4 text-emerald-300">{success}</p> : null}

          {modo === 'ajuste' ? (
            <form onSubmit={submitAjuste} className="grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Producto físico
                <select aria-label="Producto del ajuste" required value={ajuste.producto_id} onChange={(e) => setAjuste({ ...ajuste, producto_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar producto</option>
                  {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Almacén
                <select aria-label="Almacén del ajuste" required value={ajuste.almacen_id} onChange={(e) => setAjuste({ ...ajuste, almacen_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar almacén</option>
                  {almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Diferencia (+ sobrante / − faltante)
                <input aria-label="Diferencia del ajuste" required type="number" step="0.000001" value={ajuste.delta} onChange={(e) => setAjuste({ ...ajuste, delta: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Motivo
                <input aria-label="Motivo del ajuste" required minLength={3} maxLength={500} value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} className={inputClass} />
              </label>
              <div className="md:col-span-2">
                <button disabled={submitting || loading || productos.length === 0} className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">
                  {submitting ? 'Registrando…' : 'Registrar ajuste y asiento'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitTransferencia} className="grid gap-5 md:grid-cols-2">
              <label className={`${labelClass} md:col-span-2`}>
                Producto físico
                <select aria-label="Producto de la transferencia" required value={transferencia.producto_id} onChange={(e) => setTransferencia({ ...transferencia, producto_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar producto</option>
                  {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Almacén de origen
                <select aria-label="Almacén de origen" required value={transferencia.almacen_origen_id} onChange={(e) => setTransferencia({ ...transferencia, almacen_origen_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar origen</option>
                  {almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Almacén de destino
                <select aria-label="Almacén de destino" required value={transferencia.almacen_destino_id} onChange={(e) => setTransferencia({ ...transferencia, almacen_destino_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar destino</option>
                  {almacenes.filter((almacen) => almacen.id !== transferencia.almacen_origen_id).map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Cantidad
                <input aria-label="Cantidad a transferir" required type="number" min="0.000001" step="0.000001" value={transferencia.cantidad} onChange={(e) => setTransferencia({ ...transferencia, cantidad: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Motivo
                <input aria-label="Motivo de la transferencia" required minLength={3} maxLength={500} value={transferencia.motivo} onChange={(e) => setTransferencia({ ...transferencia, motivo: e.target.value })} className={inputClass} />
              </label>
              <div className="md:col-span-2">
                <button disabled={submitting || loading || productos.length === 0 || almacenes.length < 2} className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">
                  {submitting ? 'Transfiriendo…' : 'Confirmar transferencia'}
                </button>
              </div>
            </form>
          )}
        </section>
      </ProtectedComponent>
    </div>
  )
}
