'use client'
import { usePeriodTransitionOperations } from '@/hooks/use-period-transition-operation'
export default function PeriodTransitionRecovery({onConfirmed}:{onConfirmed:()=>void}) {
  const operation=usePeriodTransitionOperations()
  if(!operation.ready || (!operation.canClose && !operation.canReopen))return null
  if(operation.recoveryError)return <div role="alert" className="mb-6 rounded-xl border border-border p-4 text-destructive">{operation.recoveryError}</div>
  if(!operation.pending.length)return null
  return <section data-testid="period-transition-pending" className="mb-6 rounded-xl border border-border bg-card p-6">
    <h2 className="font-semibold">Transiciones de períodos pendientes de confirmar</h2>
    <p>Se conservan sus datos. Verifica primero el resultado con conexión.</p>
    {operation.error && <p role="alert" className="my-3 text-destructive">{operation.error}</p>}
    {operation.pending.filter(row=>row.intent.action==='CLOSE'?operation.canClose:operation.canReopen).map(row=><div key={row.key} className="mt-4 flex flex-wrap items-center gap-4">
      <span>{row.intent.action==='CLOSE'?'Cierre':'Reapertura'} de {row.intent.snapshot.codigo}</span>
      <button className="rounded-lg border border-border px-4 py-2" disabled={!!operation.busyKey || operation.activeKeys.includes(row.key)} onClick={()=>{void operation.retry(row).then(confirmed=>{if(confirmed)onConfirmed()}).catch(()=>{})}}>
        {operation.busyKey===row.key?'Verificando...':row.intent.action==='CLOSE'?'Verificar cierre pendiente':'Verificar reapertura pendiente'}
      </button>
    </div>)}
  </section>
}
