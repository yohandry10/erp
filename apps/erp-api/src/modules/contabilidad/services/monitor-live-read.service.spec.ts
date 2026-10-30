import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { OutboxEventsService } from './outbox-events.service';
import { AsientosService } from './asientos.service';
import { ContabilidadEventosController } from '../controllers/contabilidad-eventos.controller';
import { ContabilidadAsientosController } from '../controllers/contabilidad-asientos.controller';
const tenant='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
const stats={pending:0,processed:10,processed_today:0,failed:0,dead_letter:0,avg_processing_time_ms:null};
function outbox(data:any,error:any=null) {
  const rpc=jest.fn().mockResolvedValue({data,error});const client={rpc};return {rpc,service:new OutboxEventsService({getClient:()=>client} as any)};
}
function journals(data:any,error:any=null) {
  const rpc=jest.fn().mockResolvedValue({data,error}),from=jest.fn();return {rpc,from,service:new AsientosService({getClient:()=>({rpc,from})} as any,{} as any)};
}
describe('Monitoreo lectura completa de fuentes',()=>{
  it.each([null,{},[],{...stats,failed:undefined},{...stats,failed:''},{...stats,pending:-1},{...stats,processed:.5},{...stats,dead_letter:Infinity},{...stats,processed:Number.MAX_SAFE_INTEGER+1},{...stats,avg_processing_time_ms:undefined},{...stats,avg_processing_time_ms:-1},{...stats,avg_processing_time_ms:'NaN'}])('rechaza estadísticas incoherentes %s',async value=>{
    await expect(outbox(value).service.obtenerEstadisticasEventos(tenant,actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('acepta cero confirmado y enteros/decimales válidos del RPC sin inventarlos',async()=>{
    expect(await outbox(stats).service.obtenerEstadisticasEventos(tenant,actor)).toEqual(stats);
    expect(await outbox({...stats,processed:'10',avg_processing_time_ms:'1.25'}).service.obtenerEstadisticasEventos(tenant,actor)).toEqual({...stats,avg_processing_time_ms:1.25});
  });
  it.each([null,{},[{id:'a',status:'dead_letter'}],[{id:'a',status:'failed',tenant_id:actor}],[{id:'a',status:'failed'},{id:'a',status:'failed'}],[{id:null,status:'failed'}]])('rechaza ventana desconocida/ajena/duplicada %s',async value=>{
    await expect(outbox(value).service.leerEventosFallidos(tenant,actor,10)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('no devuelve más filas que el límite solicitado',async()=>{
    await expect(outbox(Array.from({length:11},(_,i)=>({id:String(i),status:'failed'}))).service.leerEventosFallidos(tenant,actor,10)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('vacío confirmado mantiene RPC con empresa/actor y nunca hace claims',async()=>{
    const {service,rpc}=outbox([]);expect(await service.leerEventosDeadLetter(tenant,actor,10)).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('list_tenant_outbox_events_492',{p_tenant_id:tenant,p_actor_id:actor,p_statuses:['dead_letter'],p_limit:10});
  });
  it.each([null,{},[{tipo:'Manual',cantidad:-1}],[{tipo:'Manual',cantidad:'1'}],[{tipo:'Manual',cantidad:1.5}],[{tipo:'',cantidad:1}],[{tipo:'Manual',cantidad:1},{tipo:'Manual',cantidad:1}]])('distribución de asientos no inventa vacío ante %s',async value=>{
    const {service,from}=journals(value);await expect(service.obtenerEstadisticasAsientosPorTipo(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);expect(from).not.toHaveBeenCalled();
  });
  it('error RPC de asientos falla sin ejecutar fallback parcial de varias consultas',async()=>{
    const {service,from}=journals(null,{code:'08006'});await expect(service.obtenerEstadisticasAsientosPorTipo(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);expect(from).not.toHaveBeenCalled();
  });
  it('acepta distribución completa y vacío confirmado',async()=>{
    expect(await journals([]).service.obtenerEstadisticasAsientosPorTipo(tenant)).toEqual([]);
    expect(await journals([{tipo:'Manual',cantidad:155}]).service.obtenerEstadisticasAsientosPorTipo(tenant)).toEqual([{tipo:'Manual',cantidad:155}]);
  });
  it('rechaza total de asientos fuera de entero seguro',async()=>{
    await expect(journals([{tipo:'A',cantidad:Number.MAX_SAFE_INTEGER},{tipo:'B',cantidad:1}]).service.obtenerEstadisticasAsientosPorTipo(tenant)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('controladores identifican empresa, alcance y ventana sin presentarla como toda la cola',async()=>{
    const s={obtenerEstadisticasEventos:jest.fn().mockResolvedValue(stats),leerEventosFallidos:jest.fn().mockResolvedValue([]),leerEventosDeadLetter:jest.fn().mockResolvedValue([])};
    const c=new ContabilidadEventosController(s as any,{} as any);
    expect(await c.getEstadisticasEventos(tenant,actor)).toMatchObject({complete:true,tenant_id:tenant,scope:'ACCOUNTING_OWNED_EVENTS'});
    expect(await c.getEventosFallidos(tenant,actor,'10' as any)).toMatchObject({complete:true,tenant_id:tenant,window_count:0,window_limit:10});
    expect(s.leerEventosFallidos).toHaveBeenCalledWith(tenant,actor,10);
    expect(await c.getEventosDeadLetter(tenant,actor,undefined)).toMatchObject({window_limit:100});
    const jc=new ContabilidadAsientosController({obtenerEstadisticasAsientosPorTipo:jest.fn().mockResolvedValue([])} as any);
    expect(await jc.obtenerEstadisticasAsientosPorTipo(tenant)).toMatchObject({complete:true,total:0,tenant_id:tenant});
  });
  it.each([0,-1,1.5,1001,'invalid'])('rechaza límite %s antes de consultar RPC',async limit=>{
    const s={leerEventosFallidos:jest.fn()};const c=new ContabilidadEventosController(s as any,{} as any);
    await expect(c.getEventosFallidos(tenant,actor,limit as any)).rejects.toBeInstanceOf(BadRequestException);expect(s.leerEventosFallidos).not.toHaveBeenCalled();
  });
});
