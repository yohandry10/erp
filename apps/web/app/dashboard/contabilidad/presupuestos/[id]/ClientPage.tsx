'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { readBudgetDetail } from '@/lib/accounting-budget-read'
import {readBudgetExecutionDetail,type BudgetExecutionView} from '@/lib/accounting-budget-execution-view'
import {useLocalizedMoney} from '@/hooks/use-localized-money'
import PresupuestoForm from '@/components/contabilidad/PresupuestoForm'

export default function EditarPresupuestoPage() {
 const {session}=useAuth()
 return <BudgetDetailWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />
}
function BudgetDetailWorkspace() {
 const {session,loading:authLoading}=useAuth(),tenantId=session?.user?.tenant_id || ''
 const readEpoch=useRef(0)
  const router = useRouter()
  const params = useParams()
  const {apiCall:get}=useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,throwOnError:true,showErrorToast:false})

  const presupuestoId = params.id as string | undefined

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [presupuesto, setPresupuesto] = useState<any>(null)
  const [execution,setExecution]=useState<BudgetExecutionView|null>(null)
  const {formatCurrency}=useLocalizedMoney()

  const loadPresupuesto=useCallback(async()=>{
    const run=++readEpoch.current;setLoading(true);setError(null);setPresupuesto(null);setExecution(null)
    if(!presupuestoId||authLoading||!tenantId)return
    try{const [result,view]=await Promise.all([get(`/contabilidad/presupuestos/${presupuestoId}`),get(`/contabilidad/presupuestos/${presupuestoId}/vista-ejecucion`)]);const row=readBudgetDetail(result,tenantId,presupuestoId),live=readBudgetExecutionDetail(view,tenantId,presupuestoId,row);if(run===readEpoch.current){setPresupuesto(row);setExecution(live)}}
    catch(cause){if(run===readEpoch.current)setError(cause instanceof Error?cause.message:'No se pudo consultar el presupuesto completo.')}
    finally{if(run===readEpoch.current)setLoading(false)}
  },[get,presupuestoId,tenantId,authLoading])
  useEffect(()=>{void loadPresupuesto();return()=>{readEpoch.current++}},[loadPresupuesto])

  const handleSuccess = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
  }

  const handleCancel = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center p-12 text-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando presupuesto...</p>
        </div>
      </div>
    )
  }

  if (error || !presupuesto || !execution) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
            className="secondary-btn py-2 px-4 inline-flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            Volver a Presupuestos
          </button>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#fef2f2] flex items-center justify-center">
            <AlertCircle size={32} className="text-destructive" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-[var(--primary-800)]">
            Error al cargar presupuesto
          </h3>
          <p role="alert" className="text-[var(--primary-600)] mb-6">
            {error || 'El presupuesto no existe o no tiene permisos para verlo'}
          </p><button onClick={()=>void loadPresupuesto()}>Reintentar</button>
          <button
            onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
            className="primary-btn"
          >
            Volver a la lista
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="mb-6">
        <button
          onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
          className="secondary-btn py-2 px-4 inline-flex items-center gap-2"
        >
          <ArrowLeft size={18} />
          Volver a Presupuestos
        </button>
      </div>

      <section data-testid="budget-current-execution" className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-2 text-lg font-semibold">Ejecución actual del período</h2>
        <p className="mb-4 text-sm text-muted-foreground">Gasto de asientos confirmados del centro y cuenta de este presupuesto.</p>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div><dt>Presupuestado</dt><dd>{formatCurrency(execution.monto_presupuestado)}</dd></div>
          <div><dt>Ejecutado</dt><dd>{formatCurrency(execution.monto_ejecutado)}</dd></div>
          <div><dt>Disponible</dt><dd>{formatCurrency(execution.monto_disponible)}</dd></div>
          <div><dt>Ejecución</dt><dd>{execution.porcentaje_ejecutado.toFixed(2)}% · {execution.porcentaje_ejecutado>100?'Sobregiro':execution.porcentaje_ejecutado>90?'Advertencia':'Normal'}</dd></div>
        </dl>
      </section>
      <PresupuestoForm
        presupuestoId={presupuestoId}
        initialData={presupuesto}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  )
}

