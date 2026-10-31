'use client'

import { requestConfirmation } from '@/lib/confirm-action'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { useCountryContext } from '@/hooks/use-country-context'
import { fiscalDateForCountry } from '@/lib/fiscal-date'
import { readRevaluationSimulation } from '@/lib/contabilidad/revaluation-read-contract'
import { RevaluationRegistrationIntent, currentRevaluationActor, loadRevaluationRegistration, newRevaluationRegistrationIntent, preserveRevaluationRegistration, retireRevaluationRegistration, revaluationRegistrationKey, revaluationRegistrationPayload, withRevaluationRegistrationLock } from '@/lib/contabilidad/revaluation-registration-operation'
import { useRouter } from 'next/navigation'
import { AlertCircle, Calculator, CheckCircle, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Posicion {
  tipo: 'CXC' | 'CXP'
  documento_id: string
  referencia?: string
  moneda: string
  saldo_moneda_origen: number
  tipo_cambio_origen: number
  tipo_cambio_cierre: number
  valor_contabilizado: number
  valor_a_cierre: number
  diferencia: number
}

interface Revaluacion {
  fecha: string
  moneda_local: string
  posiciones: Posicion[]
  total_ganancia: number
  total_perdida: number
  diferencia_neta: number
  excluidas?: Array<{ tipo: string; documento_id: string; motivo: string }>
  asiento_id?: string
  numero_asiento?: string | number
}

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function RevaluacionPage() {
  const {session}=useAuth()
  return <RevaluationWorkspace key={`${session?.user?.tenant_id||''}:${session?.user?.id||''}`} />
}
function RevaluationWorkspace(){
  const {session}=useAuth(),tenant=session?.user?.tenant_id||'',actor=session?.user?.id||''
  const scope={tenantId:tenant,actorId:actor}
  const country=useCountryContext(),readPermission=usePermission('contabilidad','simular','revaluacion'),writePermission=usePermission('contabilidad','ejecutar','revaluacion')
  const canRead=!readPermission.loading&&readPermission.hasPermission,canWrite=!writePermission.loading&&writePermission.hasPermission
  const countryReady=!country.loading&&!country.error&&!!country.moneda&&['PE','CO','AR'].includes(country.paisCodigo)
  const router = useRouter()
  const { get, post } = useApi({ throwOnError: true, showErrorToast: false,requireLive:true,retries:0 })
  const latestRead = useRef(0)
  const writing = useRef(false)
  const pendingRegistration = useRef<RevaluationRegistrationIntent | null>(null)
  const readEvidence=useRef<any>(null)
  const writeAllowed=useRef(false);writeAllowed.current=canWrite&&countryReady
  const [pending,setPending]=useState<RevaluationRegistrationIntent|null>(null)
  const [storageReady,setStorageReady]=useState(false)
  const [storageError,setStorageError]=useState<string|null>(null)

  const [fecha, setFecha] = useState('')
  const [resultado, setResultado] = useState<Revaluacion | null>(null)
  const [simulando, setSimulando] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;latestRead.current++}},[])
  const recover=useCallback(()=>{
    if(!tenant||!actor)return
    try{
      const saved=loadRevaluationRegistration({tenantId:tenant,actorId:actor})
      pendingRegistration.current=saved;setPending(saved);setStorageError(null);setStorageReady(true);readEvidence.current=null;latestRead.current++;setSimulando(false);setError(null)
      if(saved){const payload=revaluationRegistrationPayload(saved);setFecha(payload.fecha);setResultado(payload.simulacion)}else setResultado(null)
    }catch{setStorageReady(false);setStorageError('No se pudo recuperar el registro pendiente. Sus datos se conservan y otro registro permanece bloqueado.');setResultado(null)}
  },[tenant,actor])
  useEffect(()=>{
    recover()
    if(!tenant||!actor)return
    const marker=`${tenant}:${actor}`
    const changed=(event:StorageEvent)=>{if(event.key===null||event.key.startsWith('erp.accounting.fx-revaluation.')&&event.key.includes(marker))recover()}
    window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)
  },[recover,tenant,actor])
  useEffect(()=>{
    latestRead.current++;readEvidence.current=null;setError(null);setSimulando(false)
    const saved=pendingRegistration.current
    if(saved){const p=revaluationRegistrationPayload(saved);setFecha(p.fecha);setResultado(p.simulacion)}else{setResultado(null);if(countryReady)setFecha(old=>old||fiscalDateForCountry(country.paisCodigo))}
  },[countryReady,country.paisCodigo,country.moneda])

  const simular = useCallback(async () => {
    if (!canRead||!countryReady||!storageReady||storageError||pendingRegistration.current||!currentRevaluationActor({tenantId:tenant,actorId:actor})||writing.current || !fecha) return
    const read = ++latestRead.current
    try {
      setSimulando(true)
      setError(null)
      setResultado(null)
      readEvidence.current=null

      const response = await get(`/api/contabilidad/revaluacion/simular?fecha=${fecha}`)
      if (!alive.current||read !== latestRead.current) return
      setResultado(readRevaluationSimulation(response,tenant,fecha,country.moneda));readEvidence.current=response
    } catch (err: any) {
      if (alive.current&&read === latestRead.current) setError(err.message || 'No se pudo simular la revaluación')
    } finally {
      if (alive.current&&read === latestRead.current) setSimulando(false)
    }
  }, [fecha,get,tenant,actor,canRead,countryReady,country.moneda,storageReady,storageError])

  const ejecutar = async () => {
    if (!canWrite||!countryReady||!storageReady||storageError||writing.current||simulando||!currentRevaluationActor(scope)) return
    if(!pendingRegistration.current&&(!readEvidence.current||resultado?.fecha!==fecha||!resultado.posiciones.length))return
    if(!pendingRegistration.current&&!(await requestConfirmation(`Se generará el asiento de diferencia de cambio al ${fecha}. ¿Continuar?`)))return
    writing.current = true

    try {
      setEjecutando(true)
      setError(null)

      await withRevaluationRegistrationLock(scope,async()=>{
        if(!alive.current||!writeAllowed.current||!currentRevaluationActor(scope))return
        const existing=loadRevaluationRegistration(scope)
        if(existing&&!pendingRegistration.current){pendingRegistration.current=existing;setPending(existing);const p=revaluationRegistrationPayload(existing);setFecha(p.fecha);setResultado(p.simulacion);setError('Se recuperó un registro pendiente. Revise sus datos y reintente manualmente.');return}
        if(pendingRegistration.current&&(!existing||existing.idempotencyKey!==pendingRegistration.current.idempotencyKey))throw new Error('La intención pendiente cambió o ya fue conciliada. Revise el registro conservado antes de enviar.')
        const intent=existing??newRevaluationRegistrationIntent(readEvidence.current,scope,fecha,country.moneda)
        preserveRevaluationRegistration(intent);pendingRegistration.current=intent;setPending(intent)
        const payload=revaluationRegistrationPayload(intent);setFecha(payload.fecha);setResultado(payload.simulacion)
        const response=await post('/api/contabilidad/revaluacion',JSON.parse(intent.body))
        if(!alive.current||!writeAllowed.current||!currentRevaluationActor(scope))return
        if(localStorage.getItem(revaluationRegistrationKey(scope))!==JSON.stringify(intent))throw new Error('El registro conservado cambió. Se mantiene la intención original y su recibo pendiente de conciliación.')
        const receipt=retireRevaluationRegistration(intent,response)
        pendingRegistration.current=null;setPending(null);readEvidence.current=null
        router.push(`/dashboard/contabilidad/asientos/${receipt.asiento_id}`)
      })
    } catch (err: any) {
      if(alive.current&&currentRevaluationActor(scope)){
        setError(err.message||'No se pudo confirmar el registro de revaluación')
        try{const saved=loadRevaluationRegistration(scope);pendingRegistration.current=saved;setPending(saved);if(saved){const p=revaluationRegistrationPayload(saved);setFecha(p.fecha);setResultado(p.simulacion)}}catch{setStorageReady(false);setStorageError('No se pudo recuperar el registro pendiente. Sus datos se conservan y otro registro permanece bloqueado.')}
      }
    } finally {
      writing.current = false
      if(alive.current)setEjecutando(false)
    }
  }

  const money = (valor: number) =>
    new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
              <Calculator className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Diferencia de cambio
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Revalúa los saldos por cobrar y por pagar en moneda extranjera a una fecha de corte.
                Simule primero: nada se escribe hasta que registre el asiento.
                Revierta la revaluación vigente antes de otro corte o de liquidar los documentos revaluados.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="revaluacion-fecha-de-corte" className={labelClass}>Fecha de corte</label>
              <input id="revaluacion-fecha-de-corte"
                type="date"
                value={fecha}
                disabled={ejecutando||!!pending||!!storageError||!storageReady}
                onChange={(e) => {
                  if(writing.current||pendingRegistration.current||storageError)return
                  ++latestRead.current
                  readEvidence.current=null
                  setFecha(e.target.value)
                  setResultado(null)
                  setSimulando(false)
                  setError(null)
                }}
                className="mt-2 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <Button
              type="button"
              onClick={simular}
              disabled={!canRead||!countryReady||!storageReady||!!storageError||!!pending||simulando || ejecutando || !fecha}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
            >
              {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Simular
            </Button>
            <Button
              type="button"
              onClick={ejecutar}
              disabled={!canWrite||!countryReady||!storageReady||!!storageError||ejecutando||simulando||(!pending&&(!resultado||resultado.fecha!==fecha||resultado.posiciones.length===0))}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {ejecutando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {pending?'Reintentar registro pendiente':'Registrar asiento'}
            </Button>
          </div>
        </section>

        {pending&&(canRead||canWrite)&&(
          <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
            Registro pendiente de confirmación al {revaluationRegistrationPayload(pending).fecha}. La simulación conservada no sustituye una nueva lectura en vivo. Reintente manualmente los mismos datos para recuperar el recibo; no se enviarán al recargar o volver a esta pantalla.
          </div>
        )}
        {storageError&&<div role="alert" className="rounded-xl border border-amber-400/30 p-4 text-sm">{storageError}<Button type="button" variant="outline" className="ml-3" onClick={recover}>Revisar registro conservado</Button></div>}

        {(error||country.error) && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error||country.error}</p>
          </div>
        )}

        {resultado&&canRead&&!storageError && (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              {[
                ['Ganancia', resultado.total_ganancia, TrendingUp],
                ['Pérdida', resultado.total_perdida, TrendingDown],
                ['Efecto neto', resultado.diferencia_neta, Calculator],
              ].map(([label, valor, Icon]: any) => (
                <div key={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                    <Icon className="h-4 w-4" />
                    {label}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">
                    {resultado.moneda_local} {money(valor)}
                  </div>
                </div>
              ))}
            </section>

            <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className="text-base text-foreground">
                  {pending?'Simulación conservada del registro pendiente al':'Posiciones revaluadas al'} {resultado.fecha}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse">
                    <thead className="bg-cyan-400/10">
                      <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Referencia</th>
                        <th className="px-4 py-3 text-right">Saldo</th>
                        <th className="px-4 py-3 text-right">TC origen</th>
                        <th className="px-4 py-3 text-right">TC cierre</th>
                        <th className="px-4 py-3 text-right">Contabilizado</th>
                        <th className="px-4 py-3 text-right">A cierre</th>
                        <th className="px-4 py-3 text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.posiciones.length > 0 ? (
                        resultado.posiciones.map((posicion) => (
                          <tr
                            key={`${posicion.tipo}-${posicion.documento_id}`}
                            className="border-b border-cyan-400/10 text-sm text-foreground/90"
                          >
                            <td className="px-4 py-3 font-semibold text-primary/80">{posicion.tipo}</td>
                            <td className="px-4 py-3">{posicion.referencia || posicion.documento_id}</td>
                            <td className="px-4 py-3 text-right">
                              {posicion.moneda} {money(posicion.saldo_moneda_origen)}
                            </td>
                            <td className="px-4 py-3 text-right">{posicion.tipo_cambio_origen}</td>
                            <td className="px-4 py-3 text-right">{posicion.tipo_cambio_cierre}</td>
                            <td className="px-4 py-3 text-right">{money(posicion.valor_contabilizado)}</td>
                            <td className="px-4 py-3 text-right">{money(posicion.valor_a_cierre)}</td>
                            <td className="px-4 py-3 text-right font-bold text-primary">
                              {money(posicion.diferencia)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No hay diferencia de cambio que registrar a esta fecha.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {resultado.excluidas && resultado.excluidas.length > 0 && (
              <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
                <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                  <CardTitle className="text-base text-foreground">
                    Posiciones excluidas ({resultado.excluidas.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-5">
                  {resultado.excluidas.map((excluida) => (
                    <div
                      key={`${excluida.tipo}-${excluida.documento_id}`}
                      className="rounded-xl border border-cyan-400/15 bg-card/70 p-3 text-sm"
                    >
                      <span className="font-semibold text-primary/80">{excluida.tipo}</span>{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {excluida.documento_id}
                      </span>
                      <p className="mt-1 text-foreground/90">{excluida.motivo}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
