'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Calendar,
  Building2,
  FileText,
  RefreshCw,
  ArrowLeft,
  CheckCircle2
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { readScopedBudgetAlerts, type BudgetAlertScope } from '@/lib/accounting-budget-alert-scope'
import { readPeriodCatalog, type PeriodSnapshot } from '@/lib/accounting-period-read'
import { useCountryContext } from '@/hooks/use-country-context'

interface Alerta {
  presupuesto_id: string
  nivel_alerta: 'SOBREGIRO' | 'ADVERTENCIA'
  severidad: 'CRITICO' | 'ALTO'
  porcentaje_ejecutado: number
  monto_presupuestado: number
  monto_ejecutado: number
  monto_comprometido: number
  monto_disponible: number
  excedente: number
  centro_costo: {
    id: string
    codigo: string
    nombre: string
  }
  cuenta: {
    id: string
    codigo: string
    nombre: string
  }
  periodo: {
    id: string
    anio: number
    mes: number
    descripcion: string
  }
  mensaje: string
  fecha_deteccion: string
}

interface ResumenAlertas {
  consulta: BudgetAlertScope
  total_alertas: number
  sobregiros: {
    cantidad: number
    total_excedente: number
    alertas: Alerta[]
  }
  advertencias: {
    cantidad: number
    total_en_riesgo: number
    alertas: Alerta[]
  }
  fecha_generacion: string
}

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export default function AlertasSobregirosPage() {
 const {session}=useAuth()
 return <BudgetAlertsWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />
}
function BudgetAlertsWorkspace() {
 const {session,loading:authLoading}=useAuth(),tenantId=session?.user?.tenant_id || ''
 const readEpoch=useRef(0)
  const router = useRouter()
  const country = useCountryContext()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resumen, setResumen] = useState<ResumenAlertas | null>(null)
  const [selectedPeriodId,setSelectedPeriodId]=useState('')
  const [periodos,setPeriodos]=useState<PeriodSnapshot[]>([])
  const [filtroNivel, setFiltroNivel] = useState<'TODOS' | 'SOBREGIRO' | 'ADVERTENCIA'>('TODOS')
  const [error, setError] = useState<string | null>(null)
  const { apiCall } = useApi<unknown>({requireLive:true,retries:0,timeoutMs:30000,throwOnError:true,showErrorToast:false})

  const fetchAlertas=useCallback(async()=>{
    const run=++readEpoch.current;setLoading(true);setResumen(null);setError(null)
    if(authLoading||!tenantId)return
    try{
      const [result,catalog]=await Promise.all([
        apiCall('/contabilidad/presupuestos/alertas/resumen',{params:selectedPeriodId?{periodo_id:selectedPeriodId}:undefined}),
        apiCall('/contabilidad/periodos')
      ])
      const periods=readPeriodCatalog(catalog,tenantId),report=readScopedBudgetAlerts(result,tenantId,selectedPeriodId||undefined)
      if(selectedPeriodId&&!periods.some(p=>p.id===selectedPeriodId))throw new Error('El período seleccionado ya no está disponible en esta empresa.')
      const actual=report.consulta.periodo
      if(actual&&!periods.some(p=>p.id===actual.id&&p.anio===actual.anio&&p.mes===actual.mes&&p.estado===actual.estado))throw new Error('El período de las alertas cambió. Reintenta su consulta actual.')
      if(!selectedPeriodId){
        const latest=periods.find(p=>p.estado==='ABIERTO')
        if((latest?.id||null)!==(actual?.id||null))throw new Error('El último período abierto cambió entre consultas. Reintenta sus alertas actuales.')
      }
      if(run===readEpoch.current){setPeriodos(periods);setResumen(report)}
    }
    catch(cause){if(run===readEpoch.current)setError(cause instanceof Error?cause.message:'No se pudieron consultar las alertas completas.')}
    finally{if(run===readEpoch.current){setLoading(false);setRefreshing(false)}}
  },[apiCall,tenantId,authLoading,selectedPeriodId])
  useEffect(()=>{void fetchAlertas();return()=>{readEpoch.current++}},[fetchAlertas])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAlertas()
  }

  const getAlertasFiltradas = (): Alerta[] => {
    if (!resumen) return []

    if (filtroNivel === 'SOBREGIRO') {
      return resumen.sobregiros?.alertas ?? []
    } else if (filtroNivel === 'ADVERTENCIA') {
      return resumen.advertencias?.alertas ?? []
    } else {
      return [...(resumen.sobregiros?.alertas ?? []), ...(resumen.advertencias?.alertas ?? [])]
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda || 'PEN'
    }).format(toNumber(amount))
  }

  const getAlertColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#ef4444' : '#f59e0b'
  }

  const getAlertBgColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#fef2f2' : '#fffbeb'
  }

  const getAlertBorderColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#fecaca' : '#fde68a'
  }

  const alertasFiltradas = getAlertasFiltradas()

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8 mb-8">
        <div className="flex items-center gap-4">
          <button
            aria-label="Volver a presupuestos"
            onClick={() => router.push('/dashboard/contabilidad/presupuestos')} className="p-2 bg-card border rounded-lg cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={20} className="text-muted-foreground" />
          </button>
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Alertas de Sobregiro Presupuestal</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Monitoreo de presupuestos con advertencias y sobregiros
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing} className="py-3 px-6 text-white border-0 rounded-lg text-[0.875rem] font-semibold flex items-center gap-2"
        >
          <RefreshCw
            size={16}
          />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <label htmlFor="budget-alert-period" className="mb-2 block font-semibold">Período consultado</label>
        <select id="budget-alert-period" className="w-full rounded-lg border border-border bg-card p-3" value={selectedPeriodId} disabled={loading||authLoading||!!error} onChange={e=>{readEpoch.current++;setResumen(null);setError(null);setSelectedPeriodId(e.target.value)}}>
          <option value="">Último período abierto</option>
          {periodos.map(p=><option key={p.id} value={p.id}>{p.anio}-{String(p.mes).padStart(2,'0')} · {p.estado}</option>)}
        </select>
        {resumen&&<div data-testid="budget-alert-scope" className="mt-3 text-sm">
          <p>{resumen.consulta.periodo?`Período ${resumen.consulta.periodo.anio}-${String(resumen.consulta.periodo.mes).padStart(2,'0')} · ${resumen.consulta.periodo.estado}`:'Sin períodos abiertos disponibles'}</p>
          <p>Presupuestos activos evaluados: {resumen.consulta.presupuestos_evaluados}. Esta consulta no incluye otros períodos ni presupuestos bloqueados o cerrados.</p>
        </div>}
      </div>
      {loading&&<p role="status">Consultando el período y sus alertas...</p>}
      {error&&<section className="mb-6 rounded-xl border border-destructive p-4"><p role="alert">{error}</p><button onClick={handleRefresh}>Reintentar</button></section>}

      {/* Resumen Cards */}
      {resumen && (
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-6 mb-8">
          {/* Total Alertas */}
          <div className="p-6 bg-card rounded-xl shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-muted rounded-[0.625rem] flex items-center justify-center">
                <AlertCircle size={24} className="text-blue-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-muted-foreground m-0">
                  Total Alertas
                </p>
                <p className="text-[2rem] font-bold text-foreground m-0">
                  {resumen.total_alertas}
                </p>
              </div>
            </div>
          </div>

          {/* Sobregiros */}
          <div className="p-6 bg-card rounded-xl shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#fef2f2] rounded-[0.625rem] flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-muted-foreground m-0">
                  Sobregiros (&gt;100%)
                </p>
                <p className="text-[2rem] font-bold text-red-500 m-0">
                  {resumen.sobregiros.cantidad}
                </p>
              </div>
            </div>
            <p className="text-[0.875rem] text-destructive m-0">
              Excedente: {formatCurrency(resumen.sobregiros.total_excedente)}
            </p>
          </div>

          {/* Advertencias */}
          <div className="p-6 bg-card rounded-xl shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#fffbeb] rounded-[0.625rem] flex items-center justify-center">
                <AlertCircle size={24} className="text-amber-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-muted-foreground m-0">
                  Advertencias (&gt;90%)
                </p>
                <p className="text-[2rem] font-bold text-amber-500 m-0">
                  {resumen.advertencias.cantidad}
                </p>
              </div>
            </div>
            <p className="text-[0.875rem] text-[#92400e] m-0">
              En riesgo: {formatCurrency(resumen.advertencias.total_en_riesgo)}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {resumen&&<div className="flex gap-4 mb-6 flex-wrap">
        {(['TODOS', 'SOBREGIRO', 'ADVERTENCIA'] as const).map((nivel) => (
          <button
            key={nivel}
            onClick={() => setFiltroNivel(nivel)} className="py-3 px-6 rounded-lg cursor-pointer text-[0.875rem] font-semibold transition"
          >
            {nivel === 'TODOS' ? 'Todas' : nivel === 'SOBREGIRO' ? 'Sobregiros' : 'Advertencias'}
          </button>
        ))}
      </div>}

      {/* Lista de Alertas */}
      {resumen && (alertasFiltradas.length === 0 ? (
        <div className="p-12 bg-card rounded-xl text-center">
          <CheckCircle2 size={64} className="text-[#10b981]" />
          <h3 className="text-foreground mb-2">
            {!resumen.consulta.periodo?'No hay períodos abiertos disponibles':resumen.consulta.presupuestos_evaluados===0?'No hay presupuestos activos en este período':filtroNivel==='SOBREGIRO'?'No hay sobregiros en este período':filtroNivel==='ADVERTENCIA'?'No hay advertencias en este período':'Sin advertencias ni sobregiros en este período'}
          </h3>
          <p className="text-muted-foreground m-0">
            {!resumen.consulta.periodo?'Selecciona un período disponible para consultar sus presupuestos.':resumen.consulta.presupuestos_evaluados===0?'La ausencia de presupuestos activos no indica normalidad de otros períodos.':filtroNivel==='TODOS'?'No se detectaron alertas entre los presupuestos activos evaluados.':`El filtro no muestra otras categorías. Advertencias: ${resumen.advertencias.cantidad}; sobregiros: ${resumen.sobregiros.cantidad}.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {alertasFiltradas.map((alerta) => (
            <div
              key={alerta.presupuesto_id} className="p-6 rounded-xl transition"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4 flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  {alerta.nivel_alerta === 'SOBREGIRO' ? (
                    <AlertTriangle size={32} />
                  ) : (
                    <AlertCircle size={32} />
                  )}
                  <div>
                    <div className="inline-block py-1 px-3 text-white rounded-[6px] text-xs font-bold mb-2">
                      {alerta.nivel_alerta}
                    </div>
                    <h3 className="text-[1.125rem] font-semibold text-foreground m-0">
                      {alerta.centro_costo?.nombre ?? 'Centro de costo'}
                    </h3>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[2rem] font-bold m-0 leading-[1]">
                    {toNumber(alerta.porcentaje_ejecutado).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground m-0">
                    Ejecutado
                  </p>
                </div>
              </div>

              {/* Mensaje */}
              <p className="text-[0.875rem] text-foreground/85 mt-0 mr-0 mb-4 ml-0 leading-6">
                {alerta.mensaje}
              </p>

              {/* Detalles */}
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground m-0">
                      Cuenta
                    </p>
                    <p className="text-[0.875rem] font-semibold text-foreground m-0">
                      {alerta.cuenta?.codigo ?? 'N/A'} - {alerta.cuenta?.nombre ?? 'Cuenta'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground m-0">
                      Período
                    </p>
                    <p className="text-[0.875rem] font-semibold text-foreground m-0">
                      {alerta.periodo?.descripcion ?? 'Periodo no disponible'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Montos */}
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4 p-4 bg-card rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                    Presupuestado
                  </p>
                  <p className="text-base font-semibold text-foreground m-0">
                    {formatCurrency(alerta.monto_presupuestado)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                    Ejecutado
                  </p>
                  <p className="text-base font-semibold m-0">
                    {formatCurrency(alerta.monto_ejecutado)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                    Disponible
                  </p>
                  <p className="text-base font-semibold m-0">
                    {formatCurrency(alerta.monto_disponible)}
                  </p>
                </div>
                {alerta.nivel_alerta === 'SOBREGIRO' && (
                  <div>
                    <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                      Excedente
                    </p>
                    <p className="text-base font-semibold text-red-500 m-0">
                      {formatCurrency(alerta.excedente)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Info Footer */}
      {resumen && (
        <div className="mt-8 p-4 bg-muted border rounded-lg text-xs text-muted-foreground text-center">
          Última actualización: {new Date(resumen.fecha_generacion).toLocaleString('es-PE')}
        </div>
      )}
    </div>
  )
}
