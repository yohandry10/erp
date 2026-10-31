'use client'
import {useMemo,useRef,useState,useEffect} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import Link from 'next/link'
import {useApi} from '@/hooks/use-api'
import {useCountryContext} from '@/hooks/use-country-context'
import {usePermission} from '@/hooks/use-permission'
import {useToast} from '@/components/ui/use-toast'
import {PageShell} from '@/components/erp/page-shell'
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {unwrapApiArray} from '@/lib/api-contract'
const fields=[['apellido_paterno','Apellido paterno'],['apellido_materno','Apellido materno'],['situacion_educativa_codigo','Situación educativa (Tabla 9)'],['ocupacion_codigo','Ocupación (Tabla 30)'],['tipo_contrato_codigo','Contrato (Tabla 12)'],['categoria_ocupacional_codigo','Categoría ocupacional (Tabla 24)'],['tipo_trabajador_codigo','Tipo de trabajador (Tabla 8)'],['regimen_salud_codigo','Régimen de salud (Tabla 32)'],['eps_servicios_propios_codigo','EPS / servicios propios (Tabla 14)'],['regimen_pensionario_codigo','Régimen pensionario (Tabla 11)'],['establecimiento_codigo','Establecimiento (4 dígitos)']] as const
type FichaSunat = Partial<Record<(typeof fields)[number][0], string>>
interface EmpleadoFichaSunat {
  id: string
  nombres: string
  apellidos: string
  numero_documento: string
  rrhh_peru_fichas_laborales?: FichaSunat | FichaSunat[] | null
}
export default function FichasSunatPage(){
  const country=useCountryContext(),{get,put}=useApi({throwOnError:true}),{toast}=useToast(),cache=useQueryClient()
  const {hasPermission:canWrite}=usePermission('rrhh','write','planilla_electronica')
  const [employeeId,setEmployeeId]=useState(''),[form,setForm]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false)
  const intents=useRef(new Map<string,string>())
  const {data,error,isLoading,refetch}=useQuery({queryKey:['rrhh-sunat-fichas',country.paisCodigo],enabled:!country.loading&&country.paisCodigo==='PE',queryFn:async()=>unwrapApiArray<EmpleadoFichaSunat>(await get('/rrhh/empleados'))})
  const employees=useMemo(()=>data||[],[data])
  useEffect(()=>{
    const employee=employees.find(item=>item.id===employeeId)
    const joined=employee?.rrhh_peru_fichas_laborales
    const ficha=Array.isArray(joined)?joined[0]:joined
    setForm(Object.fromEntries(fields.map(([field])=>[field,String(ficha?.[field]??'')])))
  },[employeeId,employees])
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true)
    const payload=Object.fromEntries(fields.map(([field])=>[field,form[field]?.trim()]).filter(([,value])=>value!==undefined&&value!==''))
    const signature=JSON.stringify([employeeId,payload]);let intent=intents.current.get(signature)
    if(!intent){intent=`rrhh-sunat-profile:${crypto.randomUUID()}`;intents.current.set(signature,intent)}
    try{await put(`/rrhh/peru/planilla-electronica/empleados/${employeeId}/ficha`,payload,{headers:{'Idempotency-Key':intent}});intents.current.delete(signature);await cache.invalidateQueries({queryKey:['rrhh-sunat-fichas']});toast({title:'Ficha SUNAT guardada',description:'Los datos se utilizarán en los próximos cálculos y fuentes T-Registro.'})}
    catch{}finally{setBusy(false)}
  }
  return <PageShell title="Ficha SUNAT del trabajador" description="Configura los datos registrales y el régimen de salud antes de calcular la primera planilla." actions={<Button variant="outline" onClick={()=>refetch()} disabled={busy||isLoading}>Actualizar</Button>}>
    <Link href="/dashboard/rrhh" className="text-primary underline">Volver a Recursos humanos</Link>
    {country.paisCodigo!=='PE'?<p>Esta ficha corresponde a trabajadores de Perú.</p>:error?<p role="alert">No se pudieron leer los empleados y sus fichas. Usa Actualizar para reintentar.</p>:<Card><CardHeader><CardTitle>Datos para PLAME / T-Registro</CardTitle></CardHeader><CardContent>
      <form onSubmit={save} className="space-y-4"><div><Label htmlFor="sunat-profile-employee">Empleado</Label><select id="sunat-profile-employee" className="w-full rounded-md border bg-background px-3 py-2" value={employeeId} onChange={event=>setEmployeeId(event.target.value)} required><option value="">Selecciona un empleado</option>{employees.map((item:any)=><option key={item.id} value={item.id}>{item.nombres} {item.apellidos} · {item.numero_documento}</option>)}</select></div>
        {employeeId&&<><p className="text-sm text-muted-foreground">El régimen de salud 00 corresponde a EsSalud y 01 a EsSalud con EPS. Para EPS completa también la entidad de la Tabla 14 y declara el pago de cobertura al calcular la planilla.</p><div className="grid gap-4 md:grid-cols-3">{fields.map(([field,label])=><div key={field}><Label htmlFor={`sunat-profile-${field}`}>{label}</Label><Input id={`sunat-profile-${field}`} value={form[field]||''} onChange={event=>setForm(current=>({...current,[field]:event.target.value}))}/></div>)}</div><Button type="submit" disabled={busy||!canWrite}>{busy?'Guardando…':'Guardar ficha SUNAT'}</Button>{!canWrite&&<p>No tienes permiso para modificar la ficha SUNAT.</p>}</>}
      </form>
    </CardContent></Card>}
  </PageShell>
}
