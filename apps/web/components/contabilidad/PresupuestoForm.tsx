'use client'

import { requestConfirmation } from '@/lib/confirm-action'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { useBudgetCreateOperation } from '@/hooks/use-budget-create-operation'
import { readBudgetCreatePayload } from '@/lib/accounting-budget-create-operation'
import { readBudgetUpdatePayload } from '@/lib/accounting-budget-update-operation'
import { useBudgetUpdateOperation } from '@/hooks/use-budget-update-operation'
import { readBudgetCatalog } from '@/lib/accounting-budget-read'
import { readPeriodCatalog } from '@/lib/accounting-period-read'
import { DollarSign, Save, X, AlertCircle } from 'lucide-react'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { useCountryContext } from '@/hooks/use-country-context'

interface CentroCosto {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
}

interface Cuenta {
  id: string
  codigo: string
  nombre: string
  tipo_cuenta: string
}

interface Periodo {
  id: string
  anio: number
  mes: number
  estado: string
}

interface PresupuestoFormData {
  centro_costo_id: string
  cuenta_id: string
  periodo_contable_id: string
  monto_presupuestado: number
  notas?: string
  estado?: string
}

interface PresupuestoFormProps {
  presupuestoId?: string
  initialData?: any
  onSuccess?: () => void
  onCancel?: () => void
}

export default function PresupuestoForm(props: PresupuestoFormProps) {
  const {session}=useAuth()
  return <BudgetFormWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} {...props} />
}
function BudgetFormWorkspace({
  presupuestoId,
  initialData,
  onSuccess,
  onCancel
}: PresupuestoFormProps) {
  const { symbol } = useLocalizedMoney()
  const country = useCountryContext()
  const router = useRouter()
  const {apiCall:get}=useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,throwOnError:true,showErrorToast:false})
  const {session,loading:authLoading}=useAuth(),tenantId=session?.user?.tenant_id || ''
  const actorId=session?.user?.id||'',scopeReady=!authLoading&&!!tenantId&&!!actorId&&!presupuestoId
  const createPermission=usePermission('contabilidad','crear','presupuestos'),canCreate=scopeReady&&!createPermission.loading&&createPermission.hasPermission
  const creation=useBudgetCreateOperation({tenantId,actorId},canCreate,scopeReady)
  const editPermission=usePermission('contabilidad','actualizar','presupuestos'),editReady=!authLoading&&!!tenantId&&!!actorId&&!!presupuestoId,canEdit=editReady&&!editPermission.loading&&editPermission.hasPermission
  const edition=useBudgetUpdateOperation({tenantId,actorId},canEdit,editReady)

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState(false)
  const catalogRequest = useRef(0)

  // Form data
  const [formData, setFormData] = useState<PresupuestoFormData>({
    centro_costo_id: '',
    cuenta_id: '',
    periodo_contable_id: '',
    monto_presupuestado: 0,
    notas: '',
    estado: 'ACTIVO'
  })

  useEffect(()=>{
    if(!presupuestoId&&creation.pending){const payload=readBudgetCreatePayload(JSON.parse(creation.pending.body));setFormData(payload)}
  },[presupuestoId,creation.pending])

  useEffect(()=>{if(presupuestoId&&edition.pending){const payload=readBudgetUpdatePayload(JSON.parse(edition.pending.body),{tenantId,actorId},presupuestoId);setFormData({...payload.expected_snapshot,...payload})}},[presupuestoId,edition.pending,tenantId,actorId])

  // Catalog data
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])

  // Load initial data if editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        centro_costo_id: initialData.centro_costo_id || '',
        cuenta_id: initialData.cuenta_id || '',
        periodo_contable_id: initialData.periodo_contable_id || '',
        monto_presupuestado: initialData.monto_presupuestado || 0,
        notas: initialData.notas || '',
        estado: initialData.estado || 'ACTIVO'
      })
    }
  }, [initialData])

  const loadCatalogData = useCallback(async () => {
    const requestId = ++catalogRequest.current
    try {
      setLoadingData(true)
      setError(null)
      setCatalogError(false);setCentrosCosto([]);setCuentas([]);setPeriodos([])
      if(authLoading||!tenantId)return

      const [centrosRes, cuentasRes, periodosRes] = await Promise.all([
        get('/api/contabilidad/centros-costo'),
        get('/api/contabilidad/plan-cuentas'),
        get('/api/contabilidad/periodos')
      ])
      if (requestId !== catalogRequest.current) return
      const centers=readBudgetCatalog(centrosRes,tenantId,'centers'),accounts=readBudgetCatalog(cuentasRes,tenantId,'accounts'),periodRows=readPeriodCatalog(periodosRes,tenantId)
      setCentrosCosto(centers)
      setCuentas(accounts.filter(c=>c.tipo_cuenta==='GASTO'||c.codigo.startsWith('6')||c.codigo.startsWith('9')) as Cuenta[])
      setPeriodos(periodRows.filter(p=>p.estado==='ABIERTO'))
    } catch (err: any) {
      if (requestId !== catalogRequest.current) return
      console.error('Error loading catalog data:', err)
      setCatalogError(true)
      setError('No se pudieron cargar todos los catálogos del presupuesto')
    } finally {
      if (requestId === catalogRequest.current) setLoadingData(false)
    }
  }, [get,tenantId,authLoading])

  // Load catalog data
  useEffect(() => {
    loadCatalogData()
    return () => { catalogRequest.current++ }
  }, [loadCatalogData])

  const confirmationEpoch = useRef({ revision: 0, signature: '' })
  const confirmationSignature = JSON.stringify([tenantId, actorId, presupuestoId, canEdit, editReady, formData, edition.pending, edition.ready, edition.recoveryError, edition.busy])
  if (confirmationEpoch.current.signature !== confirmationSignature) confirmationEpoch.current = { revision: confirmationEpoch.current.revision + 1, signature: confirmationSignature }
  useEffect(() => () => { confirmationEpoch.current.revision++ }, [])

  const completeCreation=()=>{if(onSuccess)onSuccess();else router.push('/dashboard/contabilidad/presupuestos/lista')}
  const retryEdition=async()=>{setError(null);const receipt=await edition.perform();if(receipt)completeCreation()}
  const resolveEdition=async()=>{
    if (!canEdit || !edition.ready || !edition.pending || edition.busy || edition.recoveryError) return
    const confirmationRun = confirmationEpoch.current.revision
    const confirmationCurrent = () => confirmationRun === confirmationEpoch.current.revision
    if(!(await requestConfirmation('Se comprobará si esta edición ya fue aplicada. Si no se aplicó, se bloqueará su clave para impedir cualquier envío tardío. Se conservará el recibo de la resolución.', confirmationCurrent)))return
    if (!confirmationCurrent()) return
    setError(null)
    const result=await edition.resolve()
    if(result)completeCreation()
  }
  const retryCreation=async()=>{setError(null);const receipt=await creation.perform();if(receipt)completeCreation()}
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (catalogError || loadingData || (!presupuestoId && (!canCreate || !creation.ready || creation.recoveryError || creation.pending || creation.busy)) || (presupuestoId && (!canEdit || !edition.ready || edition.recoveryError || edition.pending || edition.busy))) return

    // Validation
    if (!formData.centro_costo_id) {
      setError('Debe seleccionar un centro de costo')
      return
    }
    if (!formData.cuenta_id) {
      setError('Debe seleccionar una cuenta contable')
      return
    }
    if (!formData.periodo_contable_id) {
      setError('Debe seleccionar un período contable')
      return
    }
    if (formData.monto_presupuestado <= 0) {
      setError('El monto presupuestado debe ser mayor a cero')
      return
    }

    try {
      setLoading(true)
      setError(null)

      if (presupuestoId) {
        const payload=readBudgetUpdatePayload({monto_presupuestado:formData.monto_presupuestado,notas:(formData.notas||'').trim(),estado:formData.estado||'ACTIVO',expected_snapshot:initialData},{tenantId,actorId},presupuestoId)
        const center=centrosCosto.find(r=>r.id===payload.expected_snapshot.centro_costo_id),account=cuentas.find(r=>r.id===payload.expected_snapshot.cuenta_id),period=periodos.find(r=>r.id===payload.expected_snapshot.periodo_contable_id)
        if(!center||!account||!period||period.estado!=='ABIERTO')throw new Error('Consulta los catálogos completos y el período abierto antes de editar.')
        const receipt=await edition.perform(payload,{center:{id:center.id,code:center.codigo,name:center.nombre},account:{id:account.id,code:account.codigo,name:account.nombre},period:{id:period.id,anio:period.anio,mes:period.mes,estado:'ABIERTO'}})
        if(receipt)completeCreation()
        return
      } else {
        const payload=readBudgetCreatePayload({...formData,notas:(formData.notas||'').trim(),estado:'ACTIVO'})
        const center=centrosCosto.find(r=>r.id===payload.centro_costo_id),account=cuentas.find(r=>r.id===payload.cuenta_id),period=periodos.find(r=>r.id===payload.periodo_contable_id)
        if(!center||!account||!period||period.estado!=='ABIERTO')throw new Error('Selecciona centro, cuenta y período abierto del catálogo actual.')
        const receipt=await creation.perform(payload,{center:{id:center.id,code:center.codigo,name:center.nombre},account:{id:account.id,code:account.codigo,name:account.nombre},period:{id:period.id,anio:period.anio,mes:period.mes,estado:'ABIERTO'}})
        if(receipt)completeCreation()
        return
      }


    } catch (err: any) {
      console.error('Error saving presupuesto:', err)
      setError(err.message || 'Error al guardar el presupuesto')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      router.push('/dashboard/contabilidad/presupuestos/lista')
    }
  }

  if(scopeReady&&!createPermission.loading&&!canCreate)return <div role="alert">No tienes permiso para crear presupuestos.</div>

  if(editReady&&!editPermission.loading&&!canEdit)return <div role="alert">No tienes permiso para editar presupuestos.</div>

  if (loadingData) {
    return (
      <div className="flex min-h-48 items-center justify-center p-12 text-center">
        <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
        <p>Cargando formulario...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl p-8">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white">
            <DollarSign size={24} />
          </div>
          <div>
            <h2 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground mb-1">
              {presupuestoId ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {presupuestoId
                ? 'Actualice el monto presupuestado y las notas'
                : 'Complete los datos para crear un nuevo presupuesto'}
            </p>
          </div>
        </div>
      </div>

      {(error || creation.error || creation.recoveryError || edition.error || edition.recoveryError) && (
        <div role="alert" className="p-4 mb-6 rounded-lg bg-[#fef2f2] border flex items-center gap-3">
          <AlertCircle size={20} className="text-destructive shrink-0" />
          <p className="m-0 text-destructive text-[0.875rem]">{error || creation.error || creation.recoveryError || edition.error || edition.recoveryError}</p>
          {catalogError && <button type="button" className="secondary-btn px-3 py-2" onClick={loadCatalogData}>Reintentar catálogos</button>}
        </div>
      )}

      {!presupuestoId && creation.pending && <section data-testid="budget-create-pending" className="mb-6 rounded-xl border border-primary/30 p-4">
        <h3 className="font-semibold">Alta de presupuesto pendiente de confirmar</h3>
        <p>{creation.pending.context.center.code} — {creation.pending.context.center.name}</p>
        <p>{creation.pending.context.account.code} — {creation.pending.context.account.name}</p>
        <p>Período {creation.pending.context.period.anio}-{String(creation.pending.context.period.mes).padStart(2,'0')} · Importe {JSON.parse(creation.pending.body).monto_presupuestado.toFixed(2)}</p>
        <p className="mt-2 text-sm">Los datos y la clave se conservan. Reintenta con conexión para confirmar el resultado.</p>
        <button type="button" disabled={!canCreate||!creation.ready||creation.busy||!!creation.recoveryError} onClick={()=>void retryCreation()} className="secondary-btn mt-3 px-4 py-2">Reintentar alta pendiente</button>
      </section>}

      {presupuestoId && edition.pending && <section data-testid="budget-update-pending" className="mb-6 rounded-xl border border-primary/30 p-4">
        <h3 className="font-semibold">Edición de presupuesto pendiente de confirmar</h3>
        <p>{edition.pending.context.center.code} — {edition.pending.context.center.name}</p>
        <p>{edition.pending.context.account.code} — {edition.pending.context.account.name}</p>
        <p>Período {edition.pending.context.period.anio}-{String(edition.pending.context.period.mes).padStart(2,'0')} · Importe anterior {JSON.parse(edition.pending.body).expected_snapshot.monto_presupuestado.toFixed(2)} · Importe solicitado {JSON.parse(edition.pending.body).monto_presupuestado.toFixed(2)}</p>
        <p className="mt-2 text-sm">La fotografía y los cambios se conservan. Reintenta con conexión para confirmar el resultado.</p>
        <button type="button" disabled={!canEdit||!edition.ready||edition.busy||!!edition.recoveryError} onClick={()=>void retryEdition()} className="secondary-btn mt-3 px-4 py-2">Reintentar edición pendiente</button>
        <p className="mt-3 text-sm">También puedes comprobar el resultado y abandonar la edición si aún no se aplicó. Una edición ya confirmada se conserva como aplicada.</p>
        <button type="button" disabled={!canEdit||!edition.ready||edition.busy||!!edition.recoveryError} onClick={()=>void resolveEdition()} className="secondary-btn mt-3 px-4 py-2">Resolver edición pendiente</button>
      </section>}

      <div className="grid gap-6">
        {/* Centro de Costo */}
        <div>
          <label htmlFor="presupuesto-form-centro-costo-id" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Centro de Costo <span className="text-destructive">*</span>
          </label>
          <select id="presupuesto-form-centro-costo-id"
            value={formData.centro_costo_id}
            onChange={(e) => setFormData({ ...formData, centro_costo_id: e.target.value })}
            disabled={!!presupuestoId || !!creation.pending || centrosCosto.length === 0}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
          >
            <option value="">Seleccione un centro de costo</option>
            {centrosCosto.map((centro) => (
              <option key={centro.id} value={centro.id}>
                {centro.codigo} - {centro.nombre}
              </option>
            ))}
          </select>
          {/* Sin centros de costo el formulario es un callejon sin salida: el campo
              es obligatorio y no hay nada que elegir. Antes no lo decia. */}
          {centrosCosto.length === 0 && !presupuestoId && (
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm">
              <p className="text-amber-300">
                Todavía no hay centros de costo, y un presupuesto se hace siempre contra uno.
              </p>
              <button
                type="button"
                onClick={() => router.push('/dashboard/contabilidad/centros-costo/nuevo')}
                className="mt-2 inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Crear un centro de costo
              </button>
            </div>
          )}
          {presupuestoId && (
            <p className="mt-2 text-xs text-[var(--primary-500)]">
              No se puede cambiar el centro de costo al editar
            </p>
          )}
        </div>

        {/* Cuenta Contable */}
        <div>
          <label htmlFor="presupuesto-form-cuenta-id" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Cuenta Contable <span className="text-destructive">*</span>
          </label>
          <select id="presupuesto-form-cuenta-id"
            value={formData.cuenta_id}
            onChange={(e) => setFormData({ ...formData, cuenta_id: e.target.value })}
            disabled={!!presupuestoId || !!creation.pending}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
          >
            <option value="">Seleccione una cuenta</option>
            {cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.codigo} - {cuenta.nombre}
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p className="mt-2 text-xs text-[var(--primary-500)]">
              No se puede cambiar la cuenta al editar
            </p>
          )}
        </div>

        {/* Período Contable */}
        <div>
          <label htmlFor="presupuesto-form-periodo-contable-id" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Período Contable <span className="text-destructive">*</span>
          </label>
          <select id="presupuesto-form-periodo-contable-id"
            value={formData.periodo_contable_id}
            onChange={(e) => setFormData({ ...formData, periodo_contable_id: e.target.value })}
            disabled={!!presupuestoId || !!creation.pending}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
          >
            <option value="">Seleccione un período</option>
            {periodos.map((periodo) => (
              <option key={periodo.id} value={periodo.id}>
                {periodo.anio}-{String(periodo.mes).padStart(2, '0')} ({periodo.estado})
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p className="mt-2 text-xs text-[var(--primary-500)]">
              No se puede cambiar el período al editar
            </p>
          )}
        </div>

        {/* Monto Presupuestado */}
        <div>
          <label htmlFor="presupuesto-form-monto-presupuestado" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Monto Presupuestado ({country.moneda || symbol}) <span className="text-destructive">*</span>
          </label>
          <input id="presupuesto-form-monto-presupuestado"
            type="number"
            step="0.01"
            min="0"
            disabled={presupuestoId ? (!!edition.pending || edition.busy) : (!!creation.pending || creation.busy)}
            value={formData.monto_presupuestado}
            onChange={(e) => setFormData({ ...formData, monto_presupuestado: parseFloat(e.target.value) || 0 })}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
            placeholder="0.00"
          />
        </div>

        {/* Notas */}
        <div>
          <label htmlFor="presupuesto-form-notas" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Notas (Opcional)
          </label>
          <textarea id="presupuesto-form-notas"
            disabled={presupuestoId ? (!!edition.pending || edition.busy) : (!!creation.pending || creation.busy)}
            value={formData.notas}
            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
            rows={3} className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
            placeholder="Comentarios adicionales sobre el presupuesto..."
          />
        </div>

        {/* Estado (only when editing) */}
        {presupuestoId && (
          <div>
            <label htmlFor="presupuesto-form-estado" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
              Estado
            </label>
            <select disabled={!!edition.pending || edition.busy} id="presupuesto-form-estado"
              value={formData.estado}
              onChange={(e) => setFormData({ ...formData, estado: e.target.value })} className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
            >
              <option value="ACTIVO">ACTIVO</option>
              <option value="BLOQUEADO">BLOQUEADO</option>
              <option value="CERRADO">CERRADO</option>
            </select>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mt-8 pt-8 border-t">
        <button
          type="submit"
          disabled={loading || loadingData || catalogError || (!presupuestoId && (!creation.ready || !canCreate || !!creation.recoveryError || !!creation.pending || creation.busy)) || (!!presupuestoId && (!edition.ready || !canEdit || !!edition.recoveryError || !!edition.pending || edition.busy))}
          className="primary-btn flex-[1] py-3 px-6 flex items-center justify-center gap-2"
        >
          <Save size={18} />
          {loading ? 'Guardando...' : presupuestoId ? 'Actualizar Presupuesto' : 'Crear Presupuesto'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="secondary-btn flex-[1] py-3 px-6 flex items-center justify-center gap-2"
        >
          <X size={18} />
          Cancelar
        </button>
      </div>
    </form>
  )
}
