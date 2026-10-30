'use client'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {useQuery} from '@tanstack/react-query'
import {useEffect} from 'react'
import {useAuth} from '@/contexts/AuthContext'
import {readLivePayroll,readPayrollList} from '@/lib/rrhh/payroll-read-contract'
export type EpsCoberturaValue={enabled:boolean;monto_pagado:string;fecha_pago:string;referencia:string;pago_oportuno:string;credito_arrastre_declarado:string;referencia_arrastre:string;planilla_arrastre_id:string;periodo_anterior:boolean;periodo_cobertura:string;aporte_essalud_origen:string;trabajadores_cubiertos_origen:string}
export const emptyEpsCobertura=():EpsCoberturaValue=>({enabled:false,monto_pagado:'',fecha_pago:'',referencia:'',pago_oportuno:'',credito_arrastre_declarado:'',referencia_arrastre:'',planilla_arrastre_id:'',periodo_anterior:false,periodo_cobertura:'',aporte_essalud_origen:'',trabajadores_cubiertos_origen:''})
export function epsCoberturaPayload(value:EpsCoberturaValue,periodo:string){
  if(!value.enabled)return undefined
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)||!value.monto_pagado.trim()||!Number.isFinite(Number(value.monto_pagado))||Number(value.monto_pagado)<0||!value.fecha_pago||!value.referencia.trim()||!['true','false'].includes(value.pago_oportuno))throw new Error('Completa el pago de cobertura EPS, su fecha, referencia y condición de plazo.')
  if(value.credito_arrastre_declarado!==''&&(!Number.isFinite(Number(value.credito_arrastre_declarado))||Number(value.credito_arrastre_declarado)<0))throw new Error('El crédito EPS de arrastre debe ser igual o mayor a cero.')
  if(Number(value.credito_arrastre_declarado)>0&&!value.referencia_arrastre.trim())throw new Error('Indica la referencia que sustenta el crédito EPS previo disponible.')
  if(value.periodo_anterior&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.periodo_cobertura)||value.periodo_cobertura>=periodo||value.pago_oportuno!=='false'||value.aporte_essalud_origen.trim()===''||!Number.isFinite(Number(value.aporte_essalud_origen))||Number(value.aporte_essalud_origen)<0||!Number.isInteger(Number(value.trabajadores_cubiertos_origen))||Number(value.trabajadores_cubiertos_origen)<1))throw new Error('Para cobertura anterior declara el período anterior, el aporte EsSalud de origen, sus trabajadores y el pago fuera del plazo.')
  return {periodo_cobertura:value.periodo_anterior?value.periodo_cobertura:periodo,monto_pagado:Number(value.monto_pagado),fecha_pago:value.fecha_pago,referencia:value.referencia.trim(),pago_oportuno:value.pago_oportuno==='true',...(value.credito_arrastre_declarado===''?{}:{credito_arrastre_declarado:Number(value.credito_arrastre_declarado),referencia_arrastre:value.referencia_arrastre.trim()}),...(value.planilla_arrastre_id?{planilla_arrastre_id:value.planilla_arrastre_id}:{}),...(value.periodo_anterior?{aporte_essalud_origen:Number(value.aporte_essalud_origen),trabajadores_cubiertos_origen:Number(value.trabajadores_cubiertos_origen)}:{})}
}
export function EpsCoberturaForm({periodo,value,onChange,onReadReadyChange}:{periodo:string;value:EpsCoberturaValue;onChange:(value:EpsCoberturaValue)=>void;onReadReadyChange?:(ready:boolean)=>void}){
  const {user,loading:authLoading}=useAuth()
  const {data:planillas,error:sourceError,isLoading,isFetching,refetch}=useQuery({queryKey:['rrhh-eps-origen',user?.tenant_id,user?.id,periodo],enabled:value.enabled&&!authLoading&&!!user,retry:false,queryFn:async()=>readLivePayroll('/rrhh/planillas',readPayrollList)})
  const sourceReady=!!planillas&&!sourceError&&!isLoading&&!isFetching&&!authLoading
  const sources=(planillas||[]).filter(item=>item.periodo<periodo&&Number(item.eps_arrastre_disponible)>0)
  const unavailableSelection=sourceReady&&!!value.planilla_arrastre_id&&!sources.some(item=>item.id===value.planilla_arrastre_id)
  useEffect(()=>{onReadReadyChange?.(!value.enabled||(sourceReady&&!unavailableSelection))},[value.enabled,sourceReady,unavailableSelection,onReadReadyChange])
  const change=(field:keyof EpsCoberturaValue,text:string)=>onChange({...value,[field]:text})
  return <fieldset className="space-y-3 rounded-xl border p-3 text-sm">
    <legend className="px-1 font-semibold">Cobertura EPS · {periodo}</legend>
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.enabled} onChange={event=>{onReadReadyChange?.(!event.target.checked);onChange({...value,enabled:event.target.checked})}}/>Declarar pago de cobertura EPS para esta planilla</label>
    <p className="text-xs text-muted-foreground">Para trabajadores afiliados a EPS en su ficha SUNAT. El cálculo aplica los límites legales al crédito; conserva el sustento del pago y del arrastre. Esta declaración no registra un nuevo pago a la EPS.</p>
    {value.enabled&&<div className="grid gap-3 md:grid-cols-3">
      <div><Label htmlFor="eps-coverage-amount">Cobertura EPS efectivamente pagada (S/)</Label><Input id="eps-coverage-amount" type="number" min="0" step="0.01" value={value.monto_pagado} onChange={event=>change('monto_pagado',event.target.value)}/></div>
      <div><Label htmlFor="eps-coverage-date">Fecha del pago EPS</Label><Input id="eps-coverage-date" type="date" value={value.fecha_pago} onChange={event=>change('fecha_pago',event.target.value)}/></div>
      <div><Label htmlFor="eps-coverage-timely">Pago de cobertura dentro del plazo legal</Label><select id="eps-coverage-timely" className="w-full rounded-md border bg-background px-3 py-2" value={value.pago_oportuno} onChange={event=>change('pago_oportuno',event.target.value)}><option value="">Selecciona la condición del pago</option><option value="true">Sí, pago oportuno</option><option value="false">No, pago fuera del plazo</option></select></div>
      <div className="md:col-span-2"><Label htmlFor="eps-coverage-reference">Referencia del pago de cobertura</Label><Input id="eps-coverage-reference" maxLength={500} value={value.referencia} onChange={event=>change('referencia',event.target.value)}/></div>
      <div><Label htmlFor="eps-coverage-carry">Crédito EPS previo disponible (S/, opcional)</Label><Input id="eps-coverage-carry" type="number" min="0" step="0.01" value={value.credito_arrastre_declarado} onChange={event=>change('credito_arrastre_declarado',event.target.value)}/></div>
      <div className="md:col-span-3">
        {sourceError ? <p role="alert">No se pudieron leer los saldos EPS del ERP. <button type="button" className="underline" disabled={isFetching} onClick={()=>void refetch()}>Reintentar lectura EPS</button></p> : !sourceReady ? <p role="status">Consultando saldos EPS actuales…</p> : <>
          <Label htmlFor="eps-coverage-origin">Origen del saldo previo</Label><select id="eps-coverage-origin" className="w-full rounded-md border bg-background px-3 py-2" value={value.planilla_arrastre_id} onChange={event=>{const source=sources.find(item=>item.id===event.target.value);onChange({...value,planilla_arrastre_id:event.target.value,credito_arrastre_declarado:source?String(source.eps_arrastre_disponible):'',referencia_arrastre:source?`Saldo EPS de la planilla ${source.periodo}`:''})}}><option value="">Fuente externa declarada / sin saldo previo</option>{sources.map(item=><option key={item.id} value={item.id}>Planilla {item.periodo} · S/ {Number(item.eps_arrastre_disponible).toFixed(2)}</option>)}</select>
          {unavailableSelection&&<p role="alert">El saldo seleccionado ya no está disponible. Elige otro origen o revisa el sustento externo.</p>}
          <button type="button" className="underline" onClick={()=>void refetch()}>Actualizar saldos EPS</button>
        </>}
      </div>
      {Number(value.credito_arrastre_declarado)>0&&<div className="md:col-span-3"><Label htmlFor="eps-coverage-carry-reference">Sustento del saldo EPS previo disponible</Label><Input id="eps-coverage-carry-reference" maxLength={500} value={value.referencia_arrastre} onChange={event=>change('referencia_arrastre',event.target.value)}/></div>}
      <label className="md:col-span-3 flex items-center gap-2"><input type="checkbox" checked={value.periodo_anterior} onChange={event=>onChange({...value,periodo_anterior:event.target.checked,...(event.target.checked?{pago_oportuno:'false'}:{})})}/>El pago fuera del plazo corresponde a una cobertura de un mes anterior</label>
      {value.periodo_anterior&&<><div><Label htmlFor="eps-coverage-origin-period">Período de la cobertura anterior</Label><Input id="eps-coverage-origin-period" type="month" value={value.periodo_cobertura} onChange={event=>change('periodo_cobertura',event.target.value)}/></div><div><Label htmlFor="eps-coverage-origin-essalud">Aporte bruto EsSalud del período de origen (S/)</Label><Input id="eps-coverage-origin-essalud" type="number" min="0" step="0.01" value={value.aporte_essalud_origen} onChange={event=>change('aporte_essalud_origen',event.target.value)}/></div><div><Label htmlFor="eps-coverage-origin-workers">Trabajadores cubiertos en el período de origen</Label><Input id="eps-coverage-origin-workers" type="number" min="1" step="1" value={value.trabajadores_cubiertos_origen} onChange={event=>change('trabajadores_cubiertos_origen',event.target.value)}/></div><p className="md:col-span-3 text-xs text-muted-foreground">El crédito de cobertura tardía se aplica al mes del pago. La UIT y los límites se resuelven con el período de origen.</p></>}
    </div>}
  </fieldset>
}
