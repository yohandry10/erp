'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Calendar, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import PresupuestoVsRealChart from '@/components/contabilidad/PresupuestoVsRealChart'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { readPeriodCatalog } from '@/lib/accounting-period-read'

interface Periodo {
  id: string
  anio: number
  mes: number
  estado: string
}

export default function ComparacionPresupuestoPage() {
 const {session}=useAuth()
 return <BudgetComparisonWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />
}
function BudgetComparisonWorkspace() {
 const {session,loading:authLoading}=useAuth(),tenantId=session?.user?.tenant_id || ''
 const readEpoch=useRef(0)
  const router = useRouter()
  const [error,setError]=useState<string|null>(null)
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<string>('')
  const [centroIdFilter, setCentroIdFilter] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const { apiCall } = useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,throwOnError:true,showErrorToast:false})

  const fetchPeriodos=useCallback(async()=>{
    const run=++readEpoch.current;setLoading(true);setPeriodos([]);setSelectedPeriodoId('');setError(null)
    if(authLoading||!tenantId)return
    try{const result=await apiCall('/contabilidad/periodos');const rows=readPeriodCatalog(result,tenantId)
      const params=new URLSearchParams(window.location.search),requested=params.get('periodoId'),center=params.get('centroId')
      if(requested&&!rows.some(row=>row.id===requested))throw new Error('El período solicitado no está disponible en esta empresa.')
      if(run!==readEpoch.current)return
      setPeriodos(rows);setSelectedPeriodoId(requested||rows[0]?.id||'');setCentroIdFilter(center||undefined)
    }catch(cause){if(run===readEpoch.current)setError(cause instanceof Error?cause.message:'No se pudieron consultar los períodos completos.')}
    finally{if(run===readEpoch.current)setLoading(false)}
  },[apiCall,tenantId,authLoading])
  useEffect(()=>{void fetchPeriodos();return()=>{readEpoch.current++}},[fetchPeriodos])

  const formatPeriodo = (anio: number, mes: number) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `${meses[mes - 1]} ${anio}`
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-4">
          <button
            aria-label="Volver a presupuestos"
            onClick={() => router.back()} className="p-2 rounded-lg border bg-card cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Comparación Presupuesto vs Real</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Análisis comparativo de presupuestos por centro de costo
            </p>
          </div>
        </div>

        {/* Selector de Período */}
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-muted-foreground" />
          <select aria-label="Periodo"
            value={selectedPeriodoId}
            onChange={(e) => setSelectedPeriodoId(e.target.value)}
            disabled={loading || periodos.length === 0} className="py-3 px-4 rounded-lg border bg-card text-[0.875rem] font-semibold text-foreground/85 cursor-pointer min-w-[200px]"
          >
            {periodos.length === 0 && (
              <option value="">No hay períodos disponibles</option>
            )}
            {periodos.map((periodo) => (
              <option key={periodo.id} value={periodo.id}>
                {formatPeriodo(periodo.anio, periodo.mes)} ({periodo.estado})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center p-12 bg-card rounded-xl shadow">
          <div className="w-6 h-6 rounded-full" />
          <span className="ml-3 text-muted-foreground">
            Cargando períodos...
          </span>
        </div>
      ) : error ? (<div className="p-6"><p role="alert">{error}</p><button onClick={()=>void fetchPeriodos()}>Reintentar</button></div>) : periodos.length === 0 ? (
        <div className="p-12 bg-card rounded-xl shadow text-center">
          <p className="m-0 text-base text-muted-foreground">
            No hay períodos contables disponibles
          </p>
          <p className="mt-2 mr-0 mb-0 ml-0 text-[0.875rem] text-muted-foreground">
            Cree un período contable para comenzar a usar presupuestos
          </p>
        </div>
      ) : selectedPeriodoId ? (
        <PresupuestoVsRealChart key={selectedPeriodoId} periodoId={selectedPeriodoId} centroId={centroIdFilter} />
      ) : null}
    </div>
  )
}
