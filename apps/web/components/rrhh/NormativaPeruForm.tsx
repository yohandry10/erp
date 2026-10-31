'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {Loader2, Save} from 'lucide-react'
import {useApi} from '@/hooks/use-api'
import {usePermission} from '@/hooks/use-permission'
import {useTenant} from '@/contexts/TenantContext'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {useToast} from '@/components/ui/use-toast'

const fields = [
  {key:'uit', label:'UIT (S/)', rate:false},
  {key:'rmv', label:'Remuneración mínima vital (S/)', rate:false},
  {key:'asignacion_familiar', label:'Asignación familiar (S/)', rate:false},
  {key:'afp_aporte', label:'AFP · aporte (%)', rate:true},
  {key:'afp_prima_seguro', label:'AFP · seguro (%)', rate:true},
  {key:'afp_remuneracion_max_asegurable', label:'AFP · máximo mensual asegurable para seguro (S/)', rate:false, optional:true},
  {key:'afp_comision_flujo_default', label:'AFP · comisión de flujo predeterminada (%)', rate:true},
  {key:'onp_aporte', label:'ONP · aporte (%)', rate:true},
  {key:'essalud_aporte', label:'EsSalud · aporte patronal (%)', rate:true},
  {key:'quinta_deduccion_uit', label:'Quinta categoría · deducción (UIT)', rate:false},
  {key:'bancarizacion_pen_min', label:'Bancarización · mínimo en soles (S/)', rate:false},
  {key:'bancarizacion_usd_min', label:'Bancarización · mínimo en dólares (US$)', rate:false},
  {key:'igv_tasa', label:'IGV de referencia (%)', rate:true},
] as const
type FieldKey = typeof fields[number]['key']
type Normativa = {id?:string;periodo:string;activo?:boolean;created_at?:string;fuente?:{version?:number;referencia?:string}} & Record<FieldKey,number>
type Loaded = {periodo:string;normativa:Normativa|null;origen:'EMPRESA'|'GLOBAL'|'SIN_CONFIGURAR';bloqueada:boolean;versiones:Normativa[]}
const empty = () => Object.fromEntries(fields.map(field=>[field.key,''])) as Record<FieldKey,string>
const fromNormativa = (row:Normativa) => Object.fromEntries(fields.map(field=>[field.key,
  row[field.key] == null ? '' : String(field.rate ? Number((Number(row[field.key])*100).toFixed(4)) : row[field.key]),
])) as Record<FieldKey,string>
const endpoint = '/rrhh/configuracion-laboral/peru/normativa'

export function NormativaPeruForm({vigente}:{vigente:Normativa|null}) {
  const {get,put}=useApi({throwOnError:true})
  const {toast}=useToast()
  const {user,isSuperAdmin}=useTenant()
  const permission=usePermission('configuracion','write','__global__')
  const admin=isSuperAdmin||user?.roles?.some(role=>['ADMIN','ADMINISTRADOR','SUPER_ADMIN'].includes(role.toUpperCase()))
  const canWrite=Boolean(admin&&permission.hasPermission)
  const [periodo,setPeriodo]=useState(vigente?.periodo||'')
  const [loaded,setLoaded]=useState<Loaded|null>(null)
  const [values,setValues]=useState(empty)
  const [reference,setReference]=useState('')
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const intents=useRef(new Map<string,string>())
  const generation=useRef(0)

  const load=useCallback(async(month:string)=>{
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return
    const request=++generation.current
    setLoading(true);setLoaded(null)
    try {
      const response=await get(`${endpoint}?periodo=${encodeURIComponent(month)}`)
      if(request!==generation.current)return
      const data=(response?.data??response) as Loaded
      setLoaded(data);setValues(data.normativa?fromNormativa(data.normativa):empty())
      setReference(data.normativa?.fuente?.referencia||'')
    } catch(error){
      if(request===generation.current)toast({title:'No se pudo consultar el período',description:error instanceof Error?error.message:'Vuelva a intentar',variant:'destructive'})
    } finally {if(request===generation.current)setLoading(false)}
  },[get,toast])

  useEffect(()=>{if(vigente?.periodo)void load(vigente.periodo)},[load,vigente?.periodo])
  const save=async()=>{
    if(!canWrite||!loaded||loaded.periodo!==periodo||loaded.bloqueada)return
    if(reference.trim().length<3){toast({title:'Indique la referencia normativa o el sustento',variant:'destructive'});return}
    const payload:Record<string,string|number>={periodo,referencia:reference.trim()}
    for(const field of fields){
      if ('optional' in field && field.optional && !values[field.key].trim()) continue
      const n=Number(values[field.key]);const lower=field.key==='asignacion_familiar'||field.rate?0:0.01
      const max=field.rate?100:field.key==='quinta_deduccion_uit'?100:999999999999.99
      const decimals=field.rate?4:2
      if(!values[field.key].trim()||!Number.isFinite(n)||n<lower||n>max||Math.abs(n*10**decimals-Math.round(n*10**decimals))>0.0001){
        toast({title:`Revise ${field.label}`,description:`Importe obligatorio, máximo ${max}; hasta ${decimals} decimales.`,variant:'destructive'});return
      }
      payload[field.key]=field.rate?Number((n/100).toFixed(6)):n
    }
    if(Number(payload.asignacion_familiar)!==Math.round(Number(payload.rmv)*10)/100){
      toast({title:'La asignación familiar debe ser el 10 % de la RMV',variant:'destructive'});return
    }
    const signature=JSON.stringify(payload)
    let key=intents.current.get(signature)
    if(!key){key=`normativa-pe:${crypto.randomUUID()}`;intents.current.set(signature,key)}
    setSaving(true)
    try {
      await put(endpoint,payload,{headers:{'Idempotency-Key':key}})
      intents.current.delete(signature)
      toast({title:'Versión normativa guardada',description:`Los próximos cálculos de ${periodo} usarán esta versión.`})
      await load(periodo)
    } catch(error){toast({title:'No se pudo guardar la normativa',description:error instanceof Error?error.message:'Vuelva a intentar',variant:'destructive'})}
    finally{setSaving(false)}
  }

  return <section className="rounded-2xl border border-border bg-card p-6 shadow-md" aria-labelledby="peru-norm-title">
    <h2 id="peru-norm-title" className="text-lg font-bold">Configurar normativa por período</h2>
    <p className="mt-1 text-sm text-muted-foreground">El administrador puede registrar una versión para su empresa con sustento antes de calcular la planilla. Cuando existe una planilla calculada, aprobada o pagada, el período queda bloqueado y conserva la normativa usada.</p>
    <p className="mt-2 text-sm text-muted-foreground">Para trabajadores AFP, registre el máximo asegurable de seguro publicado para ese mes. Se aplica sólo a la prima de seguro. Puede dejarlo vacío si no calculará primas AFP; la planilla avisará si falta.</p>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <div><Label htmlFor="peru-norm-period">Período normativo</Label><Input id="peru-norm-period" type="month" value={periodo} disabled={saving} onChange={event=>{setPeriodo(event.target.value);generation.current++;setLoaded(null);setLoading(false)}}/></div>
      <Button variant="outline" disabled={loading||saving||!periodo} onClick={()=>void load(periodo)}>{loading&&<Loader2 className="mr-2 size-4 animate-spin"/>}Consultar período</Button>
    </div>
    {loaded&&<>
      <p className="mb-4 text-sm" role="status">{loaded.origen==='EMPRESA'?'Versión de la empresa':loaded.origen==='GLOBAL'?'Normativa general disponible':'Período sin configurar'}{loaded.bloqueada?' · Bloqueado por planilla calculada, aprobada o pagada':''}</p>
      {!loaded.normativa&&vigente&&canWrite&&<Button className="mb-4" variant="outline" onClick={()=>{setValues(fromNormativa(vigente));setReference('')}}>Copiar valores de {vigente.periodo} para revisarlos</Button>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.map(field=><div className="space-y-1" key={field.key}><Label htmlFor={`peru-norm-${field.key}`}>{field.label}</Label><Input id={`peru-norm-${field.key}`} type="number" step={field.rate?'0.0001':'0.01'} min="0" value={values[field.key]} disabled={!canWrite||saving||loaded.bloqueada} onChange={event=>setValues(current=>({...current,[field.key]:event.target.value}))}/></div>)}</div>
      <div className="my-4 space-y-1"><Label htmlFor="peru-norm-reference">Referencia normativa o sustento</Label><Input id="peru-norm-reference" maxLength={1000} value={reference} disabled={!canWrite||saving||loaded.bloqueada} onChange={event=>setReference(event.target.value)} placeholder="Norma, enlace oficial o referencia del documento verificado"/></div>
      {canWrite?<Button onClick={()=>void save()} disabled={saving||loaded.bloqueada}>{saving?<Loader2 className="mr-2 size-4 animate-spin"/>:<Save className="mr-2 size-4"/>}Guardar versión normativa</Button>:<p className="text-sm text-muted-foreground">Se requiere un administrador con permiso de configuración para guardar valores.</p>}
      {loaded.versiones.length>0&&<details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Historial de versiones ({loaded.versiones.length})</summary><ul className="mt-2 space-y-2">{loaded.versiones.map(row=><li key={row.id} className="rounded-lg border p-3">Versión {row.fuente?.version??'—'} · {row.activo?'activa':'anterior'} · {row.created_at?new Date(row.created_at).toLocaleString('es-PE'):'—'}<p className="text-muted-foreground">{row.fuente?.referencia||'Sin referencia'}</p></li>)}</ul></details>}
    </>}
  </section>
}
