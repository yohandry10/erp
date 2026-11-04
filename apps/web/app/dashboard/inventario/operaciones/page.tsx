'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { useCountryContext } from '@/hooks/use-country-context'
import { useAuth } from '@/contexts/AuthContext'
import { sameInventoryOperationReceipt } from '@/lib/inventory-operation-identity'
import { inventoryOriginalResolutionEndpoint, inventoryOriginalResolutionRequest, readInventoryOriginalResolution, sameInventoryOriginalResolution } from '@/lib/inventory-operation-resolution'
import { readInventoryProducts, readInventoryWarehouses, readInventoryGuides, readInventoryIntent, inventoryOriginalReceiptEndpoint, readAdjustmentConfirmation, readTransferConfirmation, type InventoryProduct, type InventoryWarehouse, type InventoryIntent, type AdjustmentIntent, type TransferIntent } from '@/lib/inventory-operation-contract'

type AjusteForm = {
  producto_id: string
  almacen_id: string
  delta: string
  motivo: string
  lote: string
  fecha_expiracion: string
}

type TransferenciaForm = {
  producto_id: string
  almacen_origen_id: string
  almacen_destino_id: string
  cantidad: string
  motivo: string
  guia_remision_id: string
}

const EMPTY_AJUSTE: AjusteForm = {
  producto_id: '',
  almacen_id: '',
  delta: '',
  motivo: '',
  lote: '',
  fecha_expiracion: '',
}

const EMPTY_TRANSFERENCIA: TransferenciaForm = {
  producto_id: '',
  almacen_origen_id: '',
  almacen_destino_id: '',
  cantidad: '',
  motivo: '',
  guia_remision_id: '',
}

function SinPermiso() {
  return (
    <div className="rounded-2xl border bg-amber-500/10 p-6 text-amber-200">
      Necesitas el permiso <code>inventario.movimientos.create</code> para operar existencias.
    </div>
  )
}

export default function OperacionesInventarioPage() {
  const { get, post } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { session, loading: authLoading } = useAuth()
  const country = useCountryContext()
  const countryReady=!country.loading&&!country.error&&!country.requiresSetup&&!!country.paisCodigo&&!!country.moneda
  const { hasPermission: puedeVerGuias } = usePermission('gre', 'ver', 'guias')
  const isPeru = country.paisCodigo === 'PE'
  const scope = session?.user?.tenant_id && session.user.id ? `${session.user.tenant_id}.${session.user.id}` : ''
  const activeScope = useRef(scope)
  activeScope.current = scope
  const catalogGeneration = useRef(0)
  const guideGeneration = useRef(0)
  const operationGeneration = useRef(0)
  const submittingRef = useRef(false)
  const [catalog, setCatalog] = useState<{ scope: string; productos: InventoryProduct[]; almacenes: InventoryWarehouse[]; loading: boolean; error: string | null }>({ scope: '', productos: [], almacenes: [], loading: true, error: null })
  const [guides, setGuides] = useState<{ key: string; rows: ReturnType<typeof readInventoryGuides>; loading: boolean; error: string | null }>({ key: '', rows: [], loading: false, error: null })
  const [intentState, setIntentState] = useState<{ scope: string; intent: InventoryIntent | null; error: string | null }>({ scope: '', intent: null, error: null })
  const [modo, setModo] = useState<'ajuste' | 'transferencia'>('ajuste')
  const [ajuste, setAjuste] = useState<AjusteForm>(EMPTY_AJUSTE)
  const [transferencia, setTransferencia] = useState<TransferenciaForm>(EMPTY_TRANSFERENCIA)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const currentCatalog = catalog.scope === scope && !authLoading ? catalog : { productos: [], almacenes: [], loading: true, error: null }
  const { productos, almacenes, loading } = currentCatalog
  const catalogReady = Boolean(scope) && countryReady && !loading && !currentCatalog.error
  const intentReady = Boolean(scope) && intentState.scope === scope && !intentState.error
  const pending = intentState.scope === scope ? intentState.intent : null
  const fieldsDisabled = submitting || !catalogReady || !intentReady || Boolean(pending)
  const guideKey = `${scope}:${modo}:${isPeru}:${puedeVerGuias}`
  const currentGuides = guides.key === guideKey ? guides : { rows: [], loading: true, error: null }
  const guias = currentGuides.rows
  const guiasLoading = currentGuides.loading
  const guiasError = currentGuides.error

  useEffect(() => {
    operationGeneration.current += 1
    submittingRef.current = false
    setSubmitting(false)
    setError(null)
    setSuccess(null)
    setAjuste(EMPTY_AJUSTE)
    setTransferencia(EMPTY_TRANSFERENCIA)
    if (authLoading || !scope) return
    try {
      const storageKey = `erp.inventory-operation-intent.${scope}`
      const intent = readInventoryIntent(JSON.parse(localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey) || 'null'))
      if (intent) localStorage.setItem(storageKey, JSON.stringify(intent))
      sessionStorage.removeItem(storageKey)
      setIntentState({ scope, intent, error: null })
      if (intent?.mode === 'ajuste') {
        setModo('ajuste')
        setAjuste({ producto_id: intent.payload.producto_id, almacen_id: intent.payload.almacen_id, delta: String(intent.payload.delta), motivo: intent.payload.motivo, lote: intent.payload.lote ?? '', fecha_expiracion: intent.payload.fecha_expiracion ?? '' })
      } else if (intent?.mode === 'transferencia') {
        setModo('transferencia')
        setTransferencia({ ...intent.payload, cantidad: String(intent.payload.cantidad), guia_remision_id: intent.payload.guia_remision_id || '' })
      }
    } catch {
      setIntentState({ scope, intent: null, error: 'No se pudo recuperar el intento guardado. No se enviará otra operación.' })
    }
    return () => { operationGeneration.current += 1 }
  }, [scope, authLoading])

  const cargarCatalogos = useCallback(async () => {
    const generation = ++catalogGeneration.current
    setCatalog({ scope, productos: [], almacenes: [], loading: true, error: null })
    if (authLoading || !scope) return
    try {
      const [productsResponse, warehousesResponse] = await Promise.all([get('/inventario/productos'), get('/inventario/almacenes')])
      const tenantId=session?.user?.tenant_id||''
      const productos = readInventoryProducts(productsResponse,tenantId)
      const almacenes = readInventoryWarehouses(warehousesResponse,tenantId)
      if (generation === catalogGeneration.current && activeScope.current === scope) setCatalog({ scope, productos, almacenes, loading: false, error: null })
    } catch {
      if (generation === catalogGeneration.current && activeScope.current === scope) setCatalog({ scope, productos: [], almacenes: [], loading: false, error: 'No se pudieron consultar los catálogos completos de inventario. Reintenta para recuperar productos y almacenes actuales.' })
    }
  }, [get, scope, authLoading,session?.user?.tenant_id])
  useEffect(() => { void cargarCatalogos(); return () => { catalogGeneration.current += 1 } }, [cargarCatalogos])

  const cargarGuias = useCallback(async () => {
    const generation = ++guideGeneration.current
    setGuides({ key: guideKey, rows: [], loading: true, error: null })
    if (authLoading || !scope || modo !== 'transferencia' || !isPeru || !puedeVerGuias) return
    try {
      const rows = readInventoryGuides(await get('/gre/guias/catalogo-traslados'),session?.user?.tenant_id||'')
      if (generation === guideGeneration.current && activeScope.current === scope) setGuides({ key: guideKey, rows, loading: false, error: null })
    } catch {
      if (generation === guideGeneration.current && activeScope.current === scope) setGuides({ key: guideKey, rows: [], loading: false, error: 'No se pudieron consultar las guías completas. Reintenta para recuperar las guías actuales.' })
    }
  }, [get, scope, authLoading, guideKey, modo, isPeru, puedeVerGuias,session?.user?.tenant_id])
  useEffect(() => { void cargarGuias(); return () => { guideGeneration.current += 1 } }, [cargarGuias])

  const sendIntent = async (intent: InventoryIntent, readOnly = false) => {
    if (submittingRef.current || (!readOnly && !catalogReady) || !intentReady || (pending && pending.mode !== intent.mode) || (readOnly && (!pending || JSON.stringify(pending)!==JSON.stringify(intent)))) return
    const requestScope = scope
    const requestOwner={tenantId:session?.user?.tenant_id || '',actorId:session?.user?.id || ''}
    const generation = operationGeneration.current
    const storageKey = `erp.inventory-operation-intent.${requestScope}`
    const raw=JSON.stringify(intent)
    try {
      const previous=localStorage.getItem(storageKey)
      if((readOnly && previous!==raw) || (previous!==null && previous!==raw))throw new Error('El intento original cambió')
      localStorage.setItem(storageKey,raw)
      if(localStorage.getItem(storageKey)!==raw)throw new Error('No se conservó el intento original')
    }
    catch { setError('No se pudo conservar el intento. Reintenta antes de confirmar.'); return }
    submittingRef.current = true
    setSubmitting(true)
    setIntentState({ scope: requestScope, intent, error: null })
    setError(null)
    setSuccess(null)
    try {
      const response = readOnly ? await get(inventoryOriginalReceiptEndpoint(intent)) : await post(intent.mode === 'ajuste' ? '/inventario/movimientos' : '/inventario/transferencias', intent.payload)
      const result = intent.mode === 'ajuste' ? readAdjustmentConfirmation(response, intent.payload,requestOwner) : readTransferConfirmation(response, intent.payload,requestOwner)
      if(readOnly && result.idempotent!==true)throw new Error('La consulta no confirmó el recibo original recuperado')
      if (generation !== operationGeneration.current || activeScope.current !== requestScope) return
      if(localStorage.getItem(storageKey)!==raw)throw new Error('El intento cambió durante la confirmación')
      const archiveKey=`erp.inventory-operation-resolved.${requestScope}.${intent.payload.idempotency_key}`
      const archive=JSON.stringify({version:1,scope:requestScope,intent,receipt:result}),previous=localStorage.getItem(archiveKey)
      if(previous!==null){
        const saved=JSON.parse(previous)
        if(intent.mode==='ajuste')readAdjustmentConfirmation({success:true,data:saved.receipt},intent.payload,requestOwner)
        else readTransferConfirmation({success:true,data:saved.receipt},intent.payload,requestOwner)
        if(saved.version!==1 || saved.scope!==requestScope || JSON.stringify(saved.intent)!==raw || !sameInventoryOperationReceipt(saved.receipt,result))throw new Error('El archivo del recibo no coincide')
      }else localStorage.setItem(archiveKey,archive)
      if(localStorage.getItem(archiveKey)!==(previous??archive))throw new Error('No se conservó el recibo completo')
      if(generation!==operationGeneration.current || activeScope.current!==requestScope || localStorage.getItem(storageKey)!==raw)return
      localStorage.removeItem(storageKey)
      if(localStorage.getItem(storageKey)!==null)throw new Error('No se retiró el intento confirmado')
      setIntentState({ scope: requestScope, intent: null, error: null })
      if (intent.mode === 'ajuste') {
        const row = result as ReturnType<typeof readAdjustmentConfirmation>
        setSuccess(`Ajuste ${row.tipo} ${row.idempotent ? 'recuperado' : 'registrado'}. Nuevo stock total: ${row.stock_nuevo.toLocaleString('es-PE', { maximumFractionDigits: 6 })}.${row.costo_unitario === 0 && row.valor === 0 ? ' El stock tiene costo cero confirmado; no genera un asiento monetario.' : ''}`)
        setAjuste(actual => ({ ...actual, delta: '', motivo: '', lote: '', fecha_expiracion: '' }))
      } else {
        const row = result as ReturnType<typeof readTransferConfirmation>
        setSuccess(`Transferencia ${row.idempotent ? 'recuperada' : 'confirmada'} por ${row.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 6 })} unidad(es).`)
        setTransferencia(actual => ({ ...actual, cantidad: '', motivo: '' }))
      }
    } catch (cause: any) {
      if (generation !== operationGeneration.current || activeScope.current !== requestScope) return
      // El servidor sólo marca INVENTORY_NOT_APPLIED cuando la base rechazó la
      // transacción: no hubo commit, así que no hay recibo que recuperar y el
      // intento puede liberarse para corregir los datos.
      if (!readOnly && cause?.status === 400 && cause?.data?.error === 'INVENTORY_NOT_APPLIED') {
        let liberado = false
        try {
          if (localStorage.getItem(storageKey) === raw) localStorage.removeItem(storageKey)
          liberado = localStorage.getItem(storageKey) === null
        } catch { /* si no se puede retirar, el pendiente sigue visible y recuperable */ }
        if (liberado) {
          setIntentState({ scope: requestScope, intent: null, error: null })
          setError(`${cause.data.message || cause.message}. No se aplicó ningún cambio; corrige los datos y vuelve a enviar.`)
          return
        }
      }
      setError('No se pudo confirmar el resultado original completo. Sus datos se conservan para recuperar el recibo; no se enviará una operación con otra clave.')
    } finally {
      if (generation === operationGeneration.current && activeScope.current === requestScope) { submittingRef.current = false; setSubmitting(false) }
    }
  }

  const resolveIntent = async () => {
    if(submittingRef.current || !intentReady || !pending)return
    const intent=pending,requestScope=scope,requestOwner={tenantId:session?.user?.tenant_id || '',actorId:session?.user?.id || ''}
    const generation=operationGeneration.current,storageKey=`erp.inventory-operation-intent.${requestScope}`,raw=JSON.stringify(intent)
    try {
      if(!readInventoryIntent(intent) || localStorage.getItem(storageKey)!==raw)throw new Error('El pendiente original cambió')
    } catch { setError('No se pudo comprobar el pendiente original. Sus datos se conservan.');return }
    submittingRef.current=true
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const response=await post(inventoryOriginalResolutionEndpoint(intent),inventoryOriginalResolutionRequest(intent,requestOwner))
      const result=readInventoryOriginalResolution(response,intent,requestOwner)
      if(generation!==operationGeneration.current || activeScope.current!==requestScope)return
      if(localStorage.getItem(storageKey)!==raw)throw new Error('El pendiente cambió durante la resolución')
      const abandoned=result.resolution==='ABANDONED'
      const archiveKey=`erp.inventory-operation-${abandoned?'abandoned':'resolved'}.${requestScope}.${intent.payload.idempotency_key}`
      const archive=JSON.stringify(abandoned?{version:1,scope:requestScope,intent,resolution:result}:{version:1,scope:requestScope,intent,receipt:result.receipt})
      const previous=localStorage.getItem(archiveKey)
      if(previous!==null){
        const saved=JSON.parse(previous)
        if(saved.version!==1 || saved.scope!==requestScope || JSON.stringify(saved.intent)!==raw)throw new Error('El archivo no pertenece al pendiente original')
        if(abandoned){
          readInventoryOriginalResolution({success:true,data:saved.resolution},intent,requestOwner)
          if(!sameInventoryOriginalResolution(saved.resolution,result))throw new Error('El archivo de abandono no coincide')
        }else{
          if(intent.mode==='ajuste')readAdjustmentConfirmation({success:true,data:saved.receipt},intent.payload,requestOwner)
          else readTransferConfirmation({success:true,data:saved.receipt},intent.payload,requestOwner)
          if(!sameInventoryOperationReceipt(saved.receipt,result.receipt))throw new Error('El archivo del recibo no coincide')
        }
      }else localStorage.setItem(archiveKey,archive)
      if(localStorage.getItem(archiveKey)!==(previous??archive))throw new Error('No se conservó la resolución completa')
      if(generation!==operationGeneration.current || activeScope.current!==requestScope || localStorage.getItem(storageKey)!==raw)return
      localStorage.removeItem(storageKey)
      if(localStorage.getItem(storageKey)!==null)throw new Error('No se retiró el pendiente resuelto')
      setIntentState({scope:requestScope,intent:null,error:null})
      setSuccess(abandoned?'La operación pendiente se abandonó de forma segura. No se aplicará más tarde.':'La operación ya estaba confirmada. Se recuperó y conservó su recibo original.')
      if(!abandoned) {
        if(intent.mode==='ajuste')setAjuste(actual=>({...actual,delta:'',motivo:'',lote:'',fecha_expiracion:''}))
        else setTransferencia(actual=>({...actual,cantidad:'',motivo:''}))
      }
    } catch {
      if(generation===operationGeneration.current && activeScope.current===requestScope)setError('No se pudo completar y conservar la resolución original. El pendiente se mantiene; vuelve a consultar o resolver con su misma identidad.')
    } finally {
      if(generation===operationGeneration.current && activeScope.current===requestScope){submittingRef.current=false;setSubmitting(false)}
    }
  }

  const submitAjuste = async (event: FormEvent) => {
    event.preventDefault()
    if (pending?.mode === 'ajuste') { await sendIntent(pending); return }
    if (pending || !catalogReady || !intentReady) return
    const delta = Number(ajuste.delta)
    const payload: AdjustmentIntent = {
      producto_id: ajuste.producto_id,
      almacen_id: ajuste.almacen_id,
      delta,
      motivo: ajuste.motivo.trim(),
      // Obligatorio cuando el producto controla lote; la base lo exige.
      ...(ajuste.lote.trim() ? { lote: ajuste.lote.trim() } : {}),
      ...(ajuste.lote.trim() && ajuste.fecha_expiracion ? { fecha_expiracion: ajuste.fecha_expiracion } : {}),
      idempotency_key: `inventario-ajuste:${crypto.randomUUID()}`,
    }
    if (!productos.some(row => row.id === payload.producto_id) || !almacenes.some(row => row.id === payload.almacen_id) || !Number.isFinite(delta) || delta === 0 || Math.abs(delta * 1e6 - Math.round(delta * 1e6)) > 0.000001 || payload.motivo.length < 3) {
      setError('Selecciona producto y almacén actuales, una diferencia distinta de cero con hasta seis decimales y un motivo de al menos 3 caracteres.'); return
    }
    await sendIntent({ mode: 'ajuste', payload })
  }

  const submitTransferencia = async (event: FormEvent) => {
    event.preventDefault()
    if (pending?.mode === 'transferencia') { await sendIntent(pending); return }
    if (pending || !catalogReady || !intentReady || (isPeru && puedeVerGuias && (guiasLoading || guiasError))) return
    const cantidad = Number(transferencia.cantidad)
    const payload: TransferIntent = { producto_id: transferencia.producto_id, almacen_origen_id: transferencia.almacen_origen_id, almacen_destino_id: transferencia.almacen_destino_id, cantidad, motivo: transferencia.motivo.trim(), ...(transferencia.guia_remision_id ? { guia_remision_id: transferencia.guia_remision_id } : {}), idempotency_key: `inventario-transferencia:${crypto.randomUUID()}` }
    if (!productos.some(row => row.id === payload.producto_id) || !almacenes.some(row => row.id === payload.almacen_origen_id) || !almacenes.some(row => row.id === payload.almacen_destino_id) || payload.almacen_origen_id === payload.almacen_destino_id
      || !Number.isFinite(cantidad) || cantidad <= 0 || Math.abs(cantidad * 1e6 - Math.round(cantidad * 1e6)) > 0.000001 || payload.motivo.length < 3 || (payload.guia_remision_id && !guias.some(row => row.id === payload.guia_remision_id))) {
      setError('Completa el producto, dos almacenes actuales distintos, una cantidad positiva con hasta seis decimales, el motivo y una guía vigente cuando corresponda.'); return
    }
    await sendIntent({ mode: 'transferencia', payload })
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
                disabled={submitting}
                aria-selected={modo === opcion}
                onClick={() => {
                  setModo(opcion)
                  setError(null)
                  setSuccess(null)
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  modo === opcion ? 'bg-primary text-primary-foreground' : 'border bg-background text-foreground'
                }`}
              >
                {opcion === 'ajuste' ? 'Ajuste por conteo' : 'Transferencia entre almacenes'}
              </button>
            ))}
          </div>

          {loading||country.loading ? <p className="text-foreground/70">Cargando catálogos y configuración…</p> : null}
          {country.error&&<p role="alert">{country.error} {country.retry&&<button type="button" onClick={country.retry} className="underline">Reintentar configuración</button>}</p>}
          {catalogReady && productos.length === 0 ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-200">
              No hay productos físicos activos con control de stock.
            </p>
          ) : null}
          {currentCatalog.error && <div role="alert" className="mb-4 rounded-xl bg-destructive/10 p-4 text-destructive">{currentCatalog.error} <button type="button" onClick={() => void cargarCatalogos()} className="underline">Reintentar catálogos</button></div>}
          {intentState.scope === scope && intentState.error && <p role="alert">{intentState.error}</p>}
          {pending && <div className="mb-4 rounded-xl border border-amber-400/30 p-4">
            <p role="status" className="text-amber-600">Hay {pending.mode === 'ajuste' ? 'un ajuste' : 'una transferencia'} pendiente de confirmación. Consulta su recibo original para recuperar el resultado.</p>
            <button type="button" disabled={submitting || !intentReady} onClick={()=>void sendIntent(pending,true)} className="mt-3 rounded-xl border px-4 py-2 font-semibold disabled:opacity-50">Consultar resultado original</button>
            <button type="button" disabled={submitting || !intentReady} onClick={()=>void resolveIntent()} className="ml-3 mt-3 rounded-xl border px-4 py-2 font-semibold disabled:opacity-50">Abandonar pendiente de forma segura</button>
            <p className="mt-2 text-sm text-muted-foreground">La consulta conserva los datos guardados y está disponible aunque no se puedan cargar los catálogos actuales.</p>
            <p className="mt-2 text-sm text-muted-foreground">El abandono requiere conexión. Si la operación ya se confirmó, se recuperará su recibo; si no se confirmó, se impedirá que se aplique más tarde.</p>
          </div>}
          {error ? <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-4 text-destructive">{error}</p> : null}
          {success ? <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 p-4 text-emerald-300">{success}</p> : null}

          {modo === 'ajuste' ? (
            <form onSubmit={submitAjuste} className="grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Producto físico
                <select aria-label="Producto del ajuste" disabled={fieldsDisabled} required value={ajuste.producto_id} onChange={(e) => setAjuste({ ...ajuste, producto_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar producto</option>
                  {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Almacén
                <select aria-label="Almacén del ajuste" disabled={fieldsDisabled} required value={ajuste.almacen_id} onChange={(e) => setAjuste({ ...ajuste, almacen_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar almacén</option>
                  {almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Diferencia (+ sobrante / − faltante)
                <input aria-label="Diferencia del ajuste" disabled={fieldsDisabled} required type="number" step="0.000001" value={ajuste.delta} onChange={(e) => setAjuste({ ...ajuste, delta: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Motivo
                <input aria-label="Motivo del ajuste" disabled={fieldsDisabled} required minLength={3} maxLength={500} value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Lote (si el producto controla lote)
                <input aria-label="Lote del ajuste" disabled={fieldsDisabled} maxLength={80} value={ajuste.lote} onChange={(e) => setAjuste({ ...ajuste, lote: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Vencimiento del lote (solo para un lote nuevo)
                <input aria-label="Vencimiento del lote del ajuste" type="date" disabled={fieldsDisabled || !ajuste.lote.trim()} value={ajuste.fecha_expiracion} onChange={(e) => setAjuste({ ...ajuste, fecha_expiracion: e.target.value })} className={inputClass} />
              </label>
              <div className="md:col-span-2">
                <button disabled={submitting || !catalogReady || !intentReady || (!pending && productos.length === 0) || Boolean(pending && pending.mode !== 'ajuste')} className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">
                  {submitting ? 'Registrando…' : pending?.mode === 'ajuste' ? 'Reintentar ajuste' : 'Registrar ajuste y asiento'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitTransferencia} className="grid gap-5 md:grid-cols-2">
              <label className={`${labelClass} md:col-span-2`}>
                Producto físico
                <select aria-label="Producto de la transferencia" disabled={fieldsDisabled} required value={transferencia.producto_id} onChange={(e) => setTransferencia({ ...transferencia, producto_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar producto</option>
                  {productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Almacén de origen
                <select aria-label="Almacén de origen" disabled={fieldsDisabled} required value={transferencia.almacen_origen_id} onChange={(e) => setTransferencia({ ...transferencia, almacen_origen_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar origen</option>
                  {almacenes.map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Almacén de destino
                <select aria-label="Almacén de destino" disabled={fieldsDisabled} required value={transferencia.almacen_destino_id} onChange={(e) => setTransferencia({ ...transferencia, almacen_destino_id: e.target.value })} className={inputClass}>
                  <option value="">Seleccionar destino</option>
                  {almacenes.filter((almacen) => almacen.id !== transferencia.almacen_origen_id).map((almacen) => <option key={almacen.id} value={almacen.id}>{almacen.nombre}</option>)}
                </select>
              </label>
              <label className={labelClass}>
                Cantidad
                <input aria-label="Cantidad a transferir" disabled={fieldsDisabled} required type="number" min="0.000001" step="0.000001" value={transferencia.cantidad} onChange={(e) => setTransferencia({ ...transferencia, cantidad: e.target.value })} className={inputClass} />
              </label>
              <label className={labelClass}>
                Motivo
                <input aria-label="Motivo de la transferencia" disabled={fieldsDisabled} required minLength={3} maxLength={500} value={transferencia.motivo} onChange={(e) => setTransferencia({ ...transferencia, motivo: e.target.value })} className={inputClass} />
              </label>
              {isPeru && (
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    Guía de remisión del traslado
                    <select aria-label="Guía de remisión del traslado" disabled={fieldsDisabled || !puedeVerGuias || guiasLoading || Boolean(guiasError)} value={transferencia.guia_remision_id} onChange={(e) => setTransferencia({ ...transferencia, guia_remision_id: e.target.value })} className={inputClass}>
                      <option value="">Seleccionar guía cuando corresponda</option>
                      {guias.map((guia) => <option key={guia.id} value={guia.id}>{guia.numero} · {guia.estado}</option>)}
                    </select>
                  </label>
                  <p className="mt-2 text-sm text-muted-foreground">Asocia la guía del mismo origen y destino. Si tu empresa exige GRE, debes registrarla antes de trasladar mercancía entre establecimientos.</p>
                  <Link href="/dashboard/gre" className="text-sm font-semibold text-primary">Registrar o consultar guías</Link>
                  {!puedeVerGuias && <p className="mt-2 text-sm text-amber-600">Necesitas permiso para consultar las guías de remisión.</p>}
                  {guiasError && <div role="alert" className="mt-2 text-sm text-destructive">{guiasError} <button type="button" onClick={() => void cargarGuias()} className="underline">Reintentar consulta</button></div>}
                </div>
              )}
              <div className="md:col-span-2">
                <button disabled={submitting || !catalogReady || !intentReady || (!pending && (productos.length === 0 || almacenes.length < 2)) || Boolean(pending && pending.mode !== 'transferencia') || (isPeru && puedeVerGuias && !pending && (guiasLoading || Boolean(guiasError)))} className="rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">
                  {submitting ? 'Transfiriendo…' : pending?.mode === 'transferencia' ? 'Reintentar transferencia' : 'Confirmar transferencia'}
                </button>
              </div>
            </form>
          )}
        </section>
      </ProtectedComponent>
    </div>
  )
}
