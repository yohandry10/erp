'use client'

import { requestConfirmation } from '@/lib/confirm-action'
import { useState, useCallback, useEffect, useRef } from 'react'
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
import { usePermission } from '@/hooks/use-permission'
import { useCountryContext } from '@/hooks/use-country-context'
import { fiscalDateForCountry } from '@/lib/fiscal-date'
import { useTenant } from '@/contexts/TenantContext'
import { useAssetLifecycleOperation } from '@/hooks/use-asset-lifecycle-operation'
import { assetLifecyclePayload } from '@/lib/contabilidad/asset-lifecycle-operation'
import { readAssetRegister, readAssetCostCenters, readAssetSchedule } from '@/lib/contabilidad/assets-read-contract'
import { AssetCreateIntent, assetCreatePayload, assetCreateKey, currentAssetCreateActor, loadAssetCreate, newAssetCreateIntent, preserveAssetCreate, retireAssetCreate, withAssetCreateLock } from '@/lib/contabilidad/asset-create-operation'
import { DepreciationBatchIntent, depreciationBatchPayload, currentDepreciationBatchActor, loadDepreciationBatch, newDepreciationBatchIntent, preserveDepreciationBatch, retireDepreciationBatch, withDepreciationBatchLock } from '@/lib/contabilidad/asset-depreciation-batch-operation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ActivoFijo {
  id: string
  tenant_id: string
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
  registrada?: boolean
  periodo: string
  cuota: number
  acumulada: number
  valor_neto: number
}

const activoInicial = (fecha: string) => ({
  codigo: '',
  nombre: '',
  descripcion: '',
  fecha_adquisicion: fecha,
  valor_adquisicion: '',
  valor_residual: '0',
  vida_util_meses: '60',
  fecha_inicio_depreciacion: fecha,
  centro_costo_id: '',
})

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function ActivosFijosPage() {
  const { tenant, user } = useTenant()
  return <ActivosFijosWorkspace key={`${tenant?.id || ''}:${user?.id || ''}`} />
}

function ActivosFijosWorkspace() {
  const { tenant, user } = useTenant()
  const country=useCountryContext()
  const calendarReady=!country.loading&&!country.error&&!country.requiresSetup&&['PE','CO','AR'].includes(country.paisCodigo)&&!!country.moneda
  const hoy=calendarReady?fiscalDateForCountry(country.paisCodigo):''
  const editedDates=useRef({acquisition:false,start:false,retire:false,year:false,month:false})
  const { hasPermission: canCreate, loading: checkingCreate } = usePermission('contabilidad', 'crear', 'activos')
  const { hasPermission: canUpdate, loading: checkingUpdate } = usePermission('contabilidad', 'actualizar', 'activos')
  const { hasPermission: canDepreciate, loading: checkingDepreciate } = usePermission('contabilidad', 'depreciar', 'activos')
  const { hasPermission: canRetire, loading: checkingRetire } = usePermission('contabilidad', 'baja', 'activos')
  const readScope = `${tenant?.id || ''}:${user?.id || ''}`
  const currentReadScope = useRef(readScope)
  currentReadScope.current = readScope
  const createScope={tenantId:tenant?.id||'',actorId:user?.id||''}
  const createIntent=useRef<AssetCreateIntent|null>(null)
  const createWriting=useRef(false)
  const alive=useRef(true)
  const createAllowed=useRef(false)
  createAllowed.current=canCreate&&!checkingCreate&&calendarReady
  const [pendingCreate,setPendingCreate]=useState<AssetCreateIntent|null>(null)
  const [createStorageReady,setCreateStorageReady]=useState(false)
  const [createStorageError,setCreateStorageError]=useState<string|null>(null)
  const { get, post, put } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false })
  const life=useAssetLifecycleOperation({tenantId:tenant?.id||'',actorId:user?.id||'',country,calendarReady,updateAllowed:canUpdate&&!checkingUpdate,retireAllowed:canRetire&&!checkingRetire,put,post})
  const latestRead = useRef(0)
  const latestScheduleRead = useRef(0)
  const [loadingSchedule, setLoadingSchedule] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [activos, setActivos] = useState<ActivoFijo[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [depreciando, setDepreciando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDepreciacion | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [form, setForm] = useState(()=>activoInicial(''))
  const [editando, setEditando] = useState<ActivoFijo | null>(null)
  const [edicion, setEdicion] = useState({ nombre: '', descripcion: '', vida_util_meses: '', valor_residual: '' })
  const [retirando, setRetirando] = useState<ActivoFijo | null>(null)
  const [baja, setBaja] = useState({ fecha: '', tipo: 'BAJA', valor_venta: '', motivo: '' })
  const [cronograma, setCronograma] = useState<{ activo: ActivoFijo; cuotas: CuotaDepreciacion[] } | null>(null)

  const batchIntent=useRef<DepreciationBatchIntent|null>(null)
  const batchWriting=useRef(false)
  const batchAllowed=useRef(false)
  batchAllowed.current=canDepreciate&&!checkingDepreciate&&calendarReady
  const [pendingBatch,setPendingBatch]=useState<DepreciationBatchIntent|null>(null)
  const [batchStorageReady,setBatchStorageReady]=useState(false)
  const [batchStorageError,setBatchStorageError]=useState<string|null>(null)
  const [anio, setAnio] = useState<number|''>('')
  const [mes, setMes] = useState<number|''>('')
  const batchConfirmation = useRef({ revision: 0, signature: '' })
  const batchConfirmationSignature = JSON.stringify([readScope, anio, mes, country.paisCodigo, country.moneda, canDepreciate, checkingDepreciate, batchStorageReady, batchStorageError, pendingBatch, loading, loadError])
  if (batchConfirmation.current.signature !== batchConfirmationSignature) batchConfirmation.current = { revision: batchConfirmation.current.revision + 1, signature: batchConfirmationSignature }

  const restoreLifecycleForm=()=>{
    if(!life.pending)return
    const request=assetLifecyclePayload(life.pending),a={...request.expected,valor_neto:request.expected.valor_adquisicion-request.expected.depreciacion_acumulada} as ActivoFijo
    latestScheduleRead.current+=1;setCronograma(null);setLoadingSchedule(null)
    if(life.pending.action==='UPDATE'){
      setEditando(a);setRetirando(null);setEdicion({nombre:request.original.nombre,descripcion:request.original.descripcion??'',vida_util_meses:String(request.original.vida_util_meses),valor_residual:String(request.original.valor_residual)})
    }else{
      setRetirando(a);setEditando(null);editedDates.current.retire=true;setBaja({fecha:request.original.fecha,tipo:request.original.tipo,valor_venta:request.original.valor_venta===undefined?'':String(request.original.valor_venta),motivo:request.original.motivo??''})
    }
  }
  const hadLifecycle=useRef(false)
  useEffect(()=>{
    if(life.pending){hadLifecycle.current=true;restoreLifecycleForm()}
    else if(hadLifecycle.current){hadLifecycle.current=false;setEditando(null);setRetirando(null)}
  },[life.pending])
  const restoreBatch=(saved:DepreciationBatchIntent|null)=>{
    batchIntent.current=saved;setPendingBatch(saved)
    if(saved){const p=depreciationBatchPayload(saved);editedDates.current.year=true;editedDates.current.month=true;setAnio(p.anio);setMes(p.mes)}
  }
  useEffect(()=>{
    const recover=()=>{
      if(!canDepreciate||checkingDepreciate||!currentDepreciationBatchActor(createScope))return
      try{restoreBatch(loadDepreciationBatch(createScope));setBatchStorageReady(true);setBatchStorageError(null)}catch{setBatchStorageReady(false);setBatchStorageError('No se pudo recuperar el lote pendiente. Sus datos se conservan y otro lote permanece bloqueado.')}
    }
    recover()
    const marker=`${createScope.tenantId}:${createScope.actorId}`
    const changed=(event:StorageEvent)=>{if(!batchWriting.current&&(event.key===null||event.key.startsWith('erp.accounting.asset-depreciation-batch.')&&event.key.includes(marker)))recover()}
    window.addEventListener('storage',changed)
    return()=>window.removeEventListener('storage',changed)
  },[readScope,canDepreciate,checkingDepreciate])
  const restoreCreate=(saved:AssetCreateIntent|null)=>{
    createIntent.current=saved;setPendingCreate(saved)
    if(saved){
      const p=assetCreatePayload(saved)
      editedDates.current.acquisition=true;editedDates.current.start=true
      setForm({codigo:p.codigo,nombre:p.nombre,descripcion:p.descripcion||'',fecha_adquisicion:p.fecha_adquisicion,valor_adquisicion:String(p.valor_adquisicion),valor_residual:String(p.valor_residual),vida_util_meses:String(p.vida_util_meses),fecha_inicio_depreciacion:p.fecha_inicio_depreciacion,centro_costo_id:p.centro_costo_id||''})
      setMostrarAlta(true)
    }
  }
  useEffect(()=>{
    alive.current=true
    const recover=()=>{
      if(!canCreate||checkingCreate||!currentAssetCreateActor(createScope))return
      try{restoreCreate(loadAssetCreate(createScope));setCreateStorageError(null);setCreateStorageReady(true)}catch{setCreateStorageReady(false);setCreateStorageError('No se pudo recuperar el alta pendiente. Sus datos se conservan y otra alta permanece bloqueada.')}
    }
    recover()
    const marker=`${createScope.tenantId}:${createScope.actorId}`
    const changed=(event:StorageEvent)=>{if(!createWriting.current&&(event.key===null||event.key.startsWith('erp.accounting.asset-create.')&&event.key.includes(marker)))recover()}
    window.addEventListener('storage',changed)
    return()=>{alive.current=false;window.removeEventListener('storage',changed)}
  },[readScope,canCreate,checkingCreate])
  useEffect(()=>{
    if(!calendarReady||!hoy)return
    if(!createIntent.current)setForm(old=>({...old,fecha_adquisicion:editedDates.current.acquisition?old.fecha_adquisicion:hoy,fecha_inicio_depreciacion:editedDates.current.start?old.fecha_inicio_depreciacion:hoy}))
    setBaja(old=>({...old,fecha:editedDates.current.retire?old.fecha:hoy}))
    if(!editedDates.current.year)setAnio(Number(hoy.substring(0,4)))
    if(!editedDates.current.month)setMes(Number(hoy.substring(5,7)))
  },[calendarReady,hoy])

  const cargar = useCallback(async () => {
    const read = ++latestRead.current
    const scope = readScope
    latestScheduleRead.current += 1
    setCronograma(null)
    setLoadingSchedule(null)
    try {
      setLoading(true)
      setLoadError(null)
      const [response, centrosResponse] = await Promise.all([
        get('/api/contabilidad/activos-fijos'),
        get('/api/contabilidad/centros-costo'),
      ])
      if (read !== latestRead.current || scope !== currentReadScope.current) return
      const nextAssets = readAssetRegister(response, tenant?.id)
      const nextCenters = readAssetCostCenters(centrosResponse, tenant?.id)
      setActivos(nextAssets)
      setCentrosCosto(nextCenters)
    } catch (err: any) {
      if (read === latestRead.current && scope === currentReadScope.current) setLoadError('No se pudo cargar el registro de activos y centros de costo. Reintente la consulta.')
    } finally {
      if (read === latestRead.current && scope === currentReadScope.current) setLoading(false)
    }
  }, [get, tenant?.id, readScope])

  useEffect(() => {
    cargar()
    return () => { latestRead.current += 1; latestScheduleRead.current += 1 }
  }, [cargar])

  const crearActivo = async (event: React.FormEvent) => {
    event.preventDefault()
    if (checkingCreate || !canCreate || !calendarReady || !createStorageReady || createStorageError || createWriting.current || !currentAssetCreateActor(createScope) || loading || loadError) return
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

    createWriting.current=true
    try {
      setGuardando(true)
      setError(null)
      setAviso(null)
      const payload = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        fecha_adquisicion: form.fecha_adquisicion,
        valor_adquisicion: valor,
        valor_residual: residual,
        vida_util_meses: vida,
        fecha_inicio_depreciacion: form.fecha_inicio_depreciacion || form.fecha_adquisicion,
        centro_costo_id: form.centro_costo_id || undefined,
      }
      await withAssetCreateLock(createScope,async()=>{
        if(!alive.current||!createAllowed.current||!currentAssetCreateActor(createScope))return
        const existing=loadAssetCreate(createScope)
        if(existing&&!createIntent.current){restoreCreate(existing);setError('Se recuperó un alta pendiente. Revise sus datos y reintente manualmente.');return}
        if(createIntent.current&&(!existing||existing.idempotencyKey!==createIntent.current.idempotencyKey))throw new Error('El alta conservada cambió o ya fue conciliada. Revise sus datos antes de enviar.')
        const intent=existing??newAssetCreateIntent(JSON.parse(JSON.stringify(payload)),createScope,{paisCodigo:country.paisCodigo,moneda:country.moneda},centrosCosto.map(c=>c.id))
        if(intent.source.paisCodigo!==country.paisCodigo||intent.source.moneda!==country.moneda)throw new Error('El país o la moneda confirmados cambiaron. El alta original se conserva sin enviarla.')
        preserveAssetCreate(intent);restoreCreate(intent)
        if(!alive.current||!createAllowed.current||!currentAssetCreateActor(createScope))return
        const response=await post('/api/contabilidad/activos-fijos',JSON.parse(intent.body),{headers:{'idempotency-key':intent.idempotencyKey}})
        if(!alive.current||!createAllowed.current||!currentAssetCreateActor(createScope))return
        if(localStorage.getItem(assetCreateKey(createScope))!==JSON.stringify(intent))throw new Error('El alta conservada cambió. Se mantiene la solicitud original y su recibo pendiente de conciliación.')
        const receipt=retireAssetCreate(intent,response)
        createIntent.current=null;setPendingCreate(null)
        editedDates.current.acquisition=false;editedDates.current.start=false
        setForm(activoInicial(hoy));setMostrarAlta(false)
        setAviso(`Activo ${receipt.codigo} registrado. Ya puede consultar su cronograma y depreciarlo.`)
        await cargar()
      })
    } catch (err: any) {
      if(alive.current&&currentAssetCreateActor(createScope)){
        setError(err.message || 'No se pudo confirmar el alta del activo')
        try{restoreCreate(loadAssetCreate(createScope))}catch{setCreateStorageReady(false);setCreateStorageError('No se pudo recuperar el alta pendiente. Sus datos se conservan y otra alta permanece bloqueada.')}
      }
    } finally {
      createWriting.current=false
      if(alive.current)setGuardando(false)
    }
  }

  const abrirEdicion = (activo: ActivoFijo) => {
    if (checkingUpdate || !canUpdate || !life.storageReady || life.storageError || life.pending || life.busy) return
    latestScheduleRead.current += 1
    setLoadingSchedule(null)
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

  const finishLifecycle=async(receipt:any)=>{
    if(!receipt)return
    const d=receipt.data
    setAviso(receipt.operation.type==='ACCOUNTING_ASSET_UPDATE'?`Activo ${d.codigo} actualizado hacia adelante.`:`Activo ${d.codigo} retirado como ${d.situacion}. Asiento ${receipt.journal.numero_asiento} confirmado.`)
    setEditando(null);setRetirando(null);editedDates.current.retire=false
    setBaja({fecha:hoy,tipo:'BAJA',valor_venta:'',motivo:''});await cargar()
  }
  const guardarEdicion = async (event:React.FormEvent)=>{
    event.preventDefault()
    if(checkingUpdate||!canUpdate||!editando||!calendarReady)return
    const vida=Number(edicion.vida_util_meses),residual=Number(edicion.valor_residual)
    if(!life.pending&&(!edicion.nombre.trim()||!Number.isInteger(vida)||vida<1||!Number.isFinite(residual)||residual<0||residual>editando.valor_adquisicion)){setError('Revise el nombre, la vida útil y el valor residual.');return}
    setError(null)
    await finishLifecycle(await life.execute('UPDATE',editando,{nombre:edicion.nombre.trim(),descripcion:edicion.descripcion.trim()||undefined,vida_util_meses:vida,valor_residual:residual}))
  }

  const verCronograma = async (activo: ActivoFijo) => {
    const read = ++latestScheduleRead.current
    const scope = readScope
    setCronograma(null)
    setLoadingSchedule(activo.id)
    try {
      setError(null)
      const response = await get(`/api/contabilidad/activos-fijos/${activo.id}/cronograma`)
      if (read !== latestScheduleRead.current || scope !== currentReadScope.current) return
      const cuotas = readAssetSchedule(response, tenant?.id, activo)
      setCronograma({ activo, cuotas })
      setEditando(null)
      setRetirando(null)
    } catch (err: any) {
      if (read === latestScheduleRead.current && scope === currentReadScope.current) setError(err.message || 'No se pudo calcular el cronograma')
    } finally {
      if (read === latestScheduleRead.current && scope === currentReadScope.current) setLoadingSchedule(null)
    }
  }

  const retirarActivo=async(event:React.FormEvent)=>{
    event.preventDefault()
    if(checkingRetire||!canRetire||!calendarReady||!retirando)return
    const valorVenta=baja.tipo==='VENTA'?Number(baja.valor_venta):undefined
    if(!life.pending&&baja.tipo==='VENTA'&&(!Number.isFinite(valorVenta)||Number(valorVenta)<=0)){setError('Ingrese un importe de venta positivo.');return}
    setError(null)
    await finishLifecycle(await life.execute('RETIRE',retirando,{fecha:baja.fecha,tipo:baja.tipo,valor_venta:valorVenta,motivo:baja.motivo.trim()||undefined}))
  }

  const depreciar = async () => {
    if(batchWriting.current||!batchAllowed.current||!batchStorageReady||batchStorageError||!currentDepreciationBatchActor(createScope))return
    const original=batchIntent.current
    if(!original&&(loading||loadError||typeof anio!=='number'||typeof mes!=='number'||!Number.isInteger(anio)||anio<1900||anio>9999||!Number.isInteger(mes)||mes<1||mes>12))return
    if(original&&(original.source.paisCodigo!==country.paisCodigo||original.source.moneda!==country.moneda)){setError('El país o moneda no coincide con el lote original. Se conserva sin enviar.');return}
    const confirmationRun = batchConfirmation.current.revision
    const confirmationCurrent = () => confirmationRun === batchConfirmation.current.revision && alive.current && batchAllowed.current && !batchWriting.current && batchIntent.current === original && currentReadScope.current === readScope
    if(!original&&!(await requestConfirmation(`Se registrará la depreciación del período ${anio}-${String(mes).padStart(2,'0')}. ¿Continuar?`, confirmationCurrent)))return
    if (!confirmationCurrent()) return
    batchWriting.current=true;setDepreciando(true);setError(null);setResultado(null)
    try{
      await withDepreciationBatchLock(createScope,async()=>{
        if(!alive.current||!batchAllowed.current||!currentDepreciationBatchActor(createScope))return
        const saved=loadDepreciationBatch(createScope)
        if(saved&&(!original||JSON.stringify(saved)!==JSON.stringify(original))){restoreBatch(saved);throw new Error('Hay un lote original pendiente. Revíselo y reintente manualmente.')}
        const intent=original||newDepreciationBatchIntent({anio,mes},createScope,country)
        restoreBatch(intent);preserveDepreciationBatch(intent)
        const response=await post('/api/contabilidad/activos-fijos/depreciar',depreciationBatchPayload(intent),{headers:{'Idempotency-Key':intent.idempotencyKey}})
        if(!alive.current||!batchAllowed.current||!currentDepreciationBatchActor(createScope))return
        const receipt=retireDepreciationBatch(intent,response)
        restoreBatch(null);setResultado(receipt);await cargar()
      })
    }catch(err:any){if(alive.current&&currentDepreciationBatchActor(createScope))setError(err.message||'No se pudo confirmar el lote de depreciación')}
    finally{batchWriting.current=false;if(alive.current)setDepreciando(false)}
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

  const totales = activos.filter(activo => activo.situacion === 'ACTIVO' || activo.situacion === 'DEPRECIADO').reduce(
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
              disabled={loading}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
            {canCreate && !checkingCreate && (
            <Button
              type="button"
              onClick={() => { latestScheduleRead.current += 1; setLoadingSchedule(null); setCronograma(null); setMostrarAlta((actual) => !actual) }}
              disabled={loading || !!loadError || !calendarReady || !createStorageReady || !!createStorageError}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
            >
              {mostrarAlta ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {mostrarAlta ? 'Cerrar alta' : 'Registrar activo'}
            </Button>
            )}
          </div>

          {canDepreciate && !checkingDepreciate && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4">
            {batchStorageError && <p role="alert">{batchStorageError}</p>}
            {pendingBatch && <p>Hay un lote pendiente de confirmación del período {depreciationBatchPayload(pendingBatch).anio}-{String(depreciationBatchPayload(pendingBatch).mes).padStart(2,'0')}. Se conserva su solicitud original; el reintento es manual.</p>}
            <div>
              <label htmlFor="activos-fijos-ano" className={labelClass}>Año</label>
              <input id="activos-fijos-ano"
                type="number"
                value={anio}
                disabled={!calendarReady || !!pendingBatch || !batchStorageReady || !!batchStorageError}
                onChange={(e) => {editedDates.current.year=true;setAnio(e.target.value===''?'':Number(e.target.value))}}
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
                disabled={!calendarReady || !!pendingBatch || !batchStorageReady || !!batchStorageError}
                onChange={(e) => {editedDates.current.month=true;setMes(e.target.value===''?'':Number(e.target.value))}}
                className="mt-2 w-24 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <Button
              type="button"
              onClick={depreciar}
              disabled={depreciando || !batchStorageReady || !!batchStorageError || !calendarReady || (!pendingBatch && (loading || !!loadError || !anio || !mes))}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {depreciando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4" />
              )}
              {pendingBatch ? 'Reintentar lote original' : 'Depreciar período'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Un activo deprecia una sola vez por período; repetir la operación no duplica la cuota.
            </p>
          </div>
          )}
        </section>

        {loadError && <div role="alert" className="rounded-xl border border-cyan-400/20 bg-card p-4"><p>{loadError}</p><Button type="button" variant="outline" onClick={cargar} disabled={loading} className="mt-3">Reintentar</Button></div>}
        {canCreate&&!checkingCreate&&createStorageError&&<div role="alert" className="rounded-xl border border-cyan-400/20 bg-card p-4">{createStorageError}</div>}
        {canCreate&&!checkingCreate&&pendingCreate&&<div role="status" className="rounded-xl border border-cyan-400/20 bg-card p-4">Hay un alta pendiente de confirmación. Sus datos se conservan; reintente manualmente la misma solicitud.</div>}

        {canCreate && !checkingCreate && mostrarAlta && !loading && !loadError && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">Alta de activo fijo</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={crearActivo} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <fieldset disabled={!!pendingCreate||guardando||!createStorageReady||!!createStorageError} className="contents">
                <label className={labelClass}>Código<input aria-label="Código del activo" required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Nombre<input aria-label="Nombre del activo" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Fecha de adquisición<input aria-label="Fecha de adquisición" type="date" required value={form.fecha_adquisicion} disabled={!calendarReady} onChange={(e) => {editedDates.current.acquisition=true;setForm({ ...form, fecha_adquisicion: e.target.value })}} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Inicio de depreciación<input aria-label="Inicio de depreciación" type="date" required value={form.fecha_inicio_depreciacion} disabled={!calendarReady} onChange={(e) => {editedDates.current.start=true;setForm({ ...form, fecha_inicio_depreciacion: e.target.value })}} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Valor de adquisición<input aria-label="Valor de adquisición" type="number" min="0.01" step="0.01" required value={form.valor_adquisicion} onChange={(e) => setForm({ ...form, valor_adquisicion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Valor residual<input aria-label="Valor residual" type="number" min="0" step="0.01" required value={form.valor_residual} onChange={(e) => setForm({ ...form, valor_residual: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Vida útil (meses)<input aria-label="Vida útil en meses" type="number" min="1" step="1" required value={form.vida_util_meses} onChange={(e) => setForm({ ...form, vida_util_meses: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Centro de costo<select aria-label="Centro de costo del activo" value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Sin centro</option>{centrosCosto.map((centro) => <option key={centro.id} value={centro.id}>{centro.codigo ? `${centro.codigo} — ` : ''}{centro.nombre}</option>)}</select></label>
                <label className={`${labelClass} md:col-span-2 xl:col-span-3`}>Descripción<input aria-label="Descripción del activo" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                </fieldset>
                <div className="flex items-end"><Button type="submit" disabled={guardando||!createStorageReady||!!createStorageError||!calendarReady} className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500">{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{pendingCreate?'Reintentar alta':'Guardar activo'}</Button></div>
              </form>
            </CardContent>
          </Card>
        )}

        {life.storageError&&<div role="alert" className="rounded-xl border p-4">{life.storageError}</div>}
        {life.error&&<div role="alert" className="rounded-xl border p-4">{life.error}</div>}
        {life.pending&&<div role="status" className="rounded-xl border border-cyan-400/20 bg-card p-4">
          <p>Hay una {life.pending.action==='UPDATE'?'edición':'baja o venta'} pendiente de confirmación del activo {assetLifecyclePayload(life.pending).expected.codigo}. Se conserva su solicitud original; el reintento es manual.</p>
          <Button type="button" variant="outline" onClick={restoreLifecycleForm}>Revisar operación original</Button>
          <Button type="button" onClick={async()=>finishLifecycle(await life.retry())} disabled={life.busy||!calendarReady||!life.storageReady||!!life.storageError}>Reintentar operación original</Button>
        </div>}

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        {aviso && <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-300">{aviso}</div>}

        {canUpdate && !checkingUpdate && editando && (!!life.pending || !loading && !loadError) && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4"><CardTitle className="text-base">Editar {editando.codigo}</CardTitle></CardHeader>
            <CardContent className="p-5"><form onSubmit={guardarEdicion} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className={labelClass}>Nombre<input aria-label="Nombre editado" disabled={!!life.pending||life.busy||!life.storageReady||!!life.storageError} required value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Descripción<input aria-label="Descripción editada" disabled={!!life.pending||life.busy||!life.storageReady||!!life.storageError} value={edicion.descripcion} onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Vida útil (meses)<input aria-label="Vida útil editada" disabled={!!life.pending||life.busy||!life.storageReady||!!life.storageError} type="number" min="1" required value={edicion.vida_util_meses} onChange={(e) => setEdicion({ ...edicion, vida_util_meses: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Valor residual<input aria-label="Valor residual editado" disabled={!!life.pending||life.busy||!life.storageReady||!!life.storageError} type="number" min="0" step="0.01" required value={edicion.valor_residual} onChange={(e) => setEdicion({ ...edicion, valor_residual: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4"><Button type="submit" disabled={life.busy||!calendarReady||!life.storageReady||!!life.storageError} className="gap-2 bg-blue-600 text-white"><Save className="h-4 w-4" />{life.pending?'Reintentar edición original':'Guardar'}</Button><Button type="button" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button></div>
            </form></CardContent>
          </Card>
        )}

        {canRetire && !checkingRetire && retirando && (!!life.pending || !loading && !loadError) && (
          <Card className="border-amber-400/25 bg-card/70 text-foreground">
            <CardHeader className="border-b border-amber-400/15 px-5 py-4"><CardTitle className="text-base">Retirar {retirando.codigo}</CardTitle></CardHeader>
            <CardContent className="p-5"><form onSubmit={retirarActivo} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className={labelClass}>Fecha<input aria-label="Fecha de baja" type="date" required value={baja.fecha} disabled={!calendarReady||!!life.pending||life.busy} onChange={(e) => {editedDates.current.retire=true;setBaja({ ...baja, fecha: e.target.value })}} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <label className={labelClass}>Operación<select aria-label="Tipo de retiro" disabled={!!life.pending||life.busy||!life.storageReady||!!life.storageError} value={baja.tipo} onChange={(e) => setBaja({ ...baja, tipo: e.target.value, valor_venta: '' })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="BAJA">Baja sin contraprestación</option><option value="VENTA">Venta</option></select></label>
              <label className={labelClass}>Valor de venta<input aria-label="Valor de venta" type="number" min="0" step="0.01" disabled={baja.tipo !== 'VENTA'||!!life.pending||life.busy} required={baja.tipo === 'VENTA'} value={baja.valor_venta} onChange={(e) => setBaja({ ...baja, valor_venta: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal disabled:opacity-50" /></label>
              <label className={labelClass}>Motivo<input aria-label="Motivo de retiro" disabled={!!life.pending||life.busy||!life.storageReady||!!life.storageError} value={baja.motivo} onChange={(e) => setBaja({ ...baja, motivo: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
              <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4"><Button type="submit" disabled={life.busy||!calendarReady||!life.storageReady||!!life.storageError} className="gap-2 bg-amber-600 text-white hover:bg-amber-500"><Archive className="h-4 w-4" />{life.pending?'Reintentar retiro original':'Confirmar'}</Button><Button type="button" variant="outline" onClick={() => setRetirando(null)}>Cancelar</Button></div>
            </form></CardContent>
          </Card>
        )}

        {cronograma && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground">
            <CardHeader className="flex-row items-center justify-between border-b border-cyan-400/10 px-5 py-4"><CardTitle className="text-base">Cronograma — {cronograma.activo.codigo}</CardTitle><Button type="button" variant="outline" onClick={() => setCronograma(null)}>Cerrar</Button></CardHeader>
            <CardContent className="max-h-80 overflow-auto p-0"><table className="w-full min-w-[600px]"><thead className="sticky top-0 bg-card"><tr><th className="px-4 py-3 text-left">Período</th><th className="px-4 py-3 text-left">Estado de cuota</th><th className="px-4 py-3 text-right">Cuota</th><th className="px-4 py-3 text-right">Acumulada</th><th className="px-4 py-3 text-right">Valor neto</th></tr></thead><tbody>{cronograma.cuotas.map((cuota) => <tr key={cuota.periodo} className="border-t border-cyan-400/10"><td className="px-4 py-3">{cuota.periodo}</td><td className="px-4 py-3">{cuota.registrada ? 'Registrada' : 'Proyectada'}</td><td className="px-4 py-3 text-right">{money(cuota.cuota)}</td><td className="px-4 py-3 text-right">{money(cuota.acumulada)}</td><td className="px-4 py-3 text-right">{money(cuota.valor_neto)}</td></tr>)}</tbody></table></CardContent>
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
                      <p className="mt-1 text-foreground/90">{omitido.motivo==='ALREADY_REGISTERED'?'El activo ya tiene registrada su depreciación de este período.':omitido.motivo==='OUTSIDE_USEFUL_LIFE_OR_RESIDUAL'?'El período está fuera de su vida útil o el activo ya alcanzó su valor residual.':omitido.motivo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && <section aria-label="Saldos de activos vigentes" className="grid gap-3 md:grid-cols-3">
          <p className="text-sm text-muted-foreground md:col-span-3">Valores del registro para bienes activos o ya depreciados. Las bajas y ventas se conservan en el historial.</p>
          {[
            ['Valor de adquisición', totales.adquisicion],
            ['Depreciación acumulada', totales.acumulada],
            ['Valor neto en libros', totales.neto],
          ].map(([label, valor]: any) => (
            <div key={label} role="group" aria-label={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                {label}
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{money(valor)}</div>
            </div>
          ))}
        </section>}

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
            ) : loadError ? null : (
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
                          <td className="px-4 py-3"><div className="flex justify-end gap-2"><Button type="button" variant="outline" aria-label={`Ver cronograma ${activo.codigo}`} disabled={loadingSchedule === activo.id || loading || !!loadError} onClick={() => verCronograma(activo)}>{loadingSchedule === activo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</Button>{canUpdate && !checkingUpdate && activo.situacion === 'ACTIVO' && <Button type="button" variant="outline" aria-label={`Editar ${activo.codigo}`} disabled={!life.storageReady||!!life.storageError||!!life.pending||life.busy||!calendarReady} onClick={() => abrirEdicion(activo)}><Pencil className="h-4 w-4" /></Button>}{canRetire && !checkingRetire && (activo.situacion === 'ACTIVO' || activo.situacion === 'DEPRECIADO') && <Button type="button" variant="outline" aria-label={`Retirar ${activo.codigo}`} disabled={!life.storageReady||!!life.storageError||!!life.pending||life.busy||!calendarReady} onClick={() => { if(!life.storageReady||life.storageError||life.pending||life.busy||!canRetire||checkingRetire||!calendarReady)return; latestScheduleRead.current += 1; setLoadingSchedule(null); setRetirando(activo); setEditando(null); setCronograma(null) }}><Archive className="h-4 w-4" /></Button>}</div></td>
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
