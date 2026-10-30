'use client'
import {emptyRemuneracionPrevia, RemuneracionPreviaForm, RemuneracionPreviaValue, remuneracionPreviaPayload} from './GratificacionPreviaForm'

export type BasesGratificacionValue = Record<string, RemuneracionPreviaValue>
type Empleado = {id:string;nombres:string;apellidos:string}
export const periodoBaseGratificacion = (periodo:string) => /^\d{4}-(07|12)$/.test(periodo) ? `${periodo.slice(0,4)}-${periodo.endsWith('-07')?'06':'11'}` : ''
export function basesGratificacionPayload(values:BasesGratificacionValue,periodo:string,employeeId:string){
  const basePeriod=periodoBaseGratificacion(periodo)
  return basePeriod ? remuneracionPreviaPayload(values[employeeId]||emptyRemuneracionPrevia(),basePeriod) : undefined
}
export function BasesGratificacionForm({periodo,empleados,value,onChange}:{periodo:string;empleados:Empleado[];value:BasesGratificacionValue;onChange:(value:BasesGratificacionValue)=>void}){
  const basePeriod=periodoBaseGratificacion(periodo)
  if(!basePeriod)return null
  return <details className="rounded-xl border p-3 text-sm"><summary className="cursor-pointer font-semibold">Base de gratificación de {basePeriod} · historia anterior al ERP</summary><p className="my-2 text-muted-foreground">Se utiliza la remuneración computable al cierre de junio o noviembre, aunque el sueldo cambie después. El contrato histórico se lee automáticamente; declara el importe y su sustento sólo si la historia anterior al ERP lo requiere.</p><div className="space-y-3">{empleados.map(employee=><section key={employee.id}><h4 className="mb-1 font-medium">{employee.nombres} {employee.apellidos}</h4><RemuneracionPreviaForm id={`payroll-gratification-${employee.id}`} periodo={basePeriod} value={value[employee.id]||emptyRemuneracionPrevia()} onChange={source=>onChange({...value,[employee.id]:source})}/></section>)}</div></details>
}
