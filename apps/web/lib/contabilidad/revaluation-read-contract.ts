import { consolidationLive } from './consolidation-read-contract'
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0
const amount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v-Math.round(v*100)/100)<1e-9
const rate=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e10
function valuationCents(value:number,factor:number){
  const [mantissa,exponent='0']=String(factor).toLowerCase().split('e'),scale=(mantissa.split('.')[1]||'').length-Number(exponent)
  let product=BigInt(Math.round(value*100))*BigInt(mantissa.replace('.',''))
  if(scale<=0)return product*BigInt(10)**BigInt(-scale)
  const denominator=BigInt(10)**BigInt(scale)
  return product/denominator+(product%denominator*BigInt(2)>=denominator?BigInt(1):BigInt(0))
}
export function readRevaluationSimulation(v:any,tenant:string,date:string,currency:string){
  const d=v?.data,f=v?.fuentes
  if(!uuid(tenant)||!consolidationLive(v)||v.success!==true||v.complete!==true||v.tenant_id!==tenant||!consolidationLive(d)||!consolidationLive(f)||f.completas!==true||d.fecha!==date||d.moneda_local!==currency||!Array.isArray(d.posiciones)||!count(v.posiciones_total)||v.posiciones_total!==d.posiciones.length||!count(v.excluidas_total)||!count(f.cxc_total)||!count(f.cxp_total)||!count(f.evaluadas_total)||!count(f.sin_diferencia_total)||f.evaluadas_total!==v.posiciones_total+v.excluidas_total+f.sin_diferencia_total||f.evaluadas_total>f.cxc_total+f.cxp_total)throw new Error('No se pudo confirmar la simulación completa y actual para esta empresa y fecha.')
  const excluded=d.excluidas===undefined&&v.excluidas_total===0?[]:d.excluidas
  if(!Array.isArray(excluded)||excluded.length!==v.excluidas_total||d.asiento_id!==undefined||d.numero_asiento!==undefined)throw new Error('Las exclusiones o el alcance de la simulación no están confirmados.')
  const ids=new Set<string>();let gain=0,loss=0
  for(const p of d.posiciones){
    const key=`${p?.tipo}:${p?.documento_id}`
    if(!consolidationLive(p)||!['CXC','CXP'].includes(p.tipo)||!uuid(p.documento_id)||ids.has(key)||typeof p.moneda!=='string'||!/^[A-Z]{3}$/.test(p.moneda)||p.moneda===currency||!amount(p.saldo_moneda_origen)||p.saldo_moneda_origen<=0||!rate(p.tipo_cambio_origen)||!rate(p.tipo_cambio_cierre)||!amount(p.valor_contabilizado)||p.valor_contabilizado<0||!amount(p.valor_a_cierre)||p.valor_a_cierre<0||!amount(p.diferencia)||p.diferencia===0)throw new Error('La posición financiera contiene importes o monedas desconocidos.')
    ids.add(key)
    if(valuationCents(p.saldo_moneda_origen,p.tipo_cambio_origen)!==BigInt(Math.round(p.valor_contabilizado*100))||valuationCents(p.saldo_moneda_origen,p.tipo_cambio_cierre)!==BigInt(Math.round(p.valor_a_cierre*100)))throw new Error('La valoración no coincide con el saldo y los tipos de cambio confirmados.')
    if(Math.round(p.diferencia*100)!==(Math.round(p.valor_a_cierre*100)-Math.round(p.valor_contabilizado*100))*(p.tipo==='CXC'?1:-1))throw new Error('La diferencia no coincide con la valoración de la posición.')
    if(p.diferencia>0)gain+=Math.round(p.diferencia*100);else loss-=Math.round(p.diferencia*100)
  }
  for(const p of excluded){const key=`${p?.tipo}:${p?.documento_id}`;if(!consolidationLive(p)||!['CXC','CXP'].includes(p.tipo)||!uuid(p.documento_id)||ids.has(key)||typeof p.motivo!=='string'||!p.motivo.trim())throw new Error('Una exclusión está incompleta o repetida.');ids.add(key)}
  if(![gain,loss].every(Number.isSafeInteger)||![d.total_ganancia,d.total_perdida,d.diferencia_neta].every(amount)||Math.round(d.total_ganancia*100)!==gain||Math.round(d.total_perdida*100)!==loss||Math.round(d.diferencia_neta*100)!==gain-loss)throw new Error('Los totales no coinciden con las posiciones revaluadas.')
  // Preserve the original economic snapshot sent to the registration RPC.
  // Completeness metadata remains outside data in the read envelope.
  return d
}
