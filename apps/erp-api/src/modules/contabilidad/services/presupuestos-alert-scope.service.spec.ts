import {PresupuestosService} from './presupuestos.service';
import {SupabaseService} from '../../../shared/supabase/supabase.service';
import {BadRequestException,NotFoundException,ServiceUnavailableException} from '@nestjs/common';

describe('Alertas de presupuesto: alcance del período y cero con fuente completa',()=>{
 const tenant='55555555-5555-4555-8555-555555555555',period='33333333-3333-4333-8333-333333333333';
 const periodRow=()=>({id:period,tenant_id:tenant,anio:2026,mes:11,estado:'ABIERTO'});
 const budget=()=>({id:'11111111-1111-4111-8111-111111111111',tenant_id:tenant,periodo_contable_id:period,centro_costo_id:'22222222-2222-4222-8222-222222222222',cuenta_id:'44444444-4444-4444-8444-444444444444',monto_presupuestado:11,monto_comprometido:0,estado:'ACTIVO',centros_costo:{id:'22222222-2222-4222-8222-222222222222',codigo:'CC',nombre:'Centro'},plan_cuentas:{id:'44444444-4444-4444-8444-444444444444',codigo:'6391',nombre:'Gastos'},periodos_contables:{id:period,anio:2026,mes:11,estado:'ABIERTO'}});
 let service:PresupuestosService,pq:any,bq:any,from:jest.Mock;
 beforeEach(()=>{
  pq={select:jest.fn(),eq:jest.fn(),order:jest.fn(),limit:jest.fn(),maybeSingle:jest.fn().mockResolvedValue({data:periodRow(),error:null})};
  for(const k of ['select','eq','order','limit'])pq[k].mockReturnValue(pq);
  bq={select:jest.fn(),eq:jest.fn(),order:jest.fn().mockResolvedValue({data:[budget()],error:null})};for(const k of ['select','eq'])bq[k].mockReturnValue(bq);
  from=jest.fn(table=>table==='periodos_contables'?pq:bq);service=new PresupuestosService({getClient:()=>({from})} as unknown as SupabaseService);jest.spyOn(service,'calcularMontoEjecutado').mockResolvedValue(10.45);
 });
 it('eco explícito de empresa/período y cantidad activa acompaña advertencia95%',async()=>{
  const r=await service.obtenerResumenAlertas(tenant,period);expect(r.consulta).toEqual({tenant_id:tenant,seleccion:'EXPLICITO',periodo:{id:period,anio:2026,mes:11,estado:'ABIERTO'},presupuestos_evaluados:1});expect(r.total_alertas).toBe(1);expect(r.advertencias.cantidad).toBe(1);expect(r.sobregiros.cantidad).toBe(0);expect(pq.eq).toHaveBeenCalledWith('tenant_id',tenant);expect(pq.eq).toHaveBeenCalledWith('id',period);expect(bq.eq).toHaveBeenCalledWith('periodo_contable_id',period);
 });
 it('selección predeterminada registra el último período abierto consultado',async()=>{
  const r=await service.obtenerResumenAlertas(tenant);expect(r.consulta.seleccion).toBe('ULTIMO_ABIERTO');expect(pq.eq).toHaveBeenCalledWith('estado','ABIERTO');expect(pq.order).toHaveBeenCalledWith('anio',{ascending:false});expect(pq.order).toHaveBeenCalledWith('mes',{ascending:false});expect(pq.limit).toHaveBeenCalledWith(1);
 });
 it('sin período abierto informa ausencia y no consulta presupuestos',async()=>{
  pq.maybeSingle.mockResolvedValue({data:null,error:null});const r=await service.obtenerResumenAlertas(tenant);expect(r.consulta.periodo).toBeNull();expect(r.consulta.presupuestos_evaluados).toBe(0);expect(r.total_alertas).toBe(0);expect(from).toHaveBeenCalledTimes(1);
 });
 it('lista vacía confirmada distingue cero presupuestos de cero alertas',async()=>{
  bq.order.mockResolvedValue({data:[],error:null});const r=await service.obtenerResumenAlertas(tenant,period);expect(r.consulta.periodo.id).toBe(period);expect(r.consulta.presupuestos_evaluados).toBe(0);expect(r.total_alertas).toBe(0);expect(service.calcularMontoEjecutado).not.toHaveBeenCalled();
 });
 it('presupuesto normal sigue contabilizado aunque no genere alerta',async()=>{
  jest.mocked(service.calcularMontoEjecutado).mockResolvedValue(0);const r=await service.obtenerResumenAlertas(tenant,period);expect(r.consulta.presupuestos_evaluados).toBe(1);expect(r.total_alertas).toBe(0);
 });
 it('período solicitado inexistente/ajeno devuelve404 antes del listado',async()=>{
  pq.maybeSingle.mockResolvedValue({data:null,error:null});await expect(service.obtenerResumenAlertas(tenant,period)).rejects.toThrow(NotFoundException);expect(from).toHaveBeenCalledTimes(1);
 });
 it('identificador inválido se rechaza antes de consultar',async()=>{
  await expect(service.obtenerResumenAlertas(tenant,'invalid')).rejects.toThrow(BadRequestException);expect(from).not.toHaveBeenCalled();
 });
 it.each([['tenant',(x:any)=>x.tenant_id='foreign'],['id',(x:any)=>x.id='44444444-4444-4444-8444-444444444444'],['month',(x:any)=>x.mes=13],['year',(x:any)=>x.anio=null],['state',(x:any)=>x.estado='unknown']])('período fuente incompleto/ajeno: %s',async(_n,mutate)=>{
  const x=periodRow();mutate(x);pq.maybeSingle.mockResolvedValue({data:x,error:null});await expect(service.obtenerResumenAlertas(tenant,period)).rejects.toThrow(ServiceUnavailableException);
 });
 it('predeterminado no acepta un período cerrado como último abierto',async()=>{
  pq.maybeSingle.mockResolvedValue({data:{...periodRow(),estado:'CERRADO'},error:null});await expect(service.obtenerResumenAlertas(tenant)).rejects.toThrow(ServiceUnavailableException);
 });
 it.each([['tenant',(x:any)=>x.tenant_id='foreign'],['period',(x:any)=>x.periodo_contable_id='foreign'],['amount',(x:any)=>x.monto_presupuestado=null],['commitment',(x:any)=>x.monto_comprometido=null],['relation',(x:any)=>x.centros_costo.id='foreign']])('presupuesto fuente inválido no confirma vacío: %s',async(_n,mutate)=>{
  const x=budget();mutate(x);bq.order.mockResolvedValue({data:[x],error:null});await expect(service.obtenerResumenAlertas(tenant,period)).rejects.toThrow(ServiceUnavailableException);
 });
 it('presupuestos duplicados no inflan el alcance',async()=>{
  bq.order.mockResolvedValue({data:[budget(),budget()],error:null});await expect(service.obtenerResumenAlertas(tenant,period)).rejects.toThrow(ServiceUnavailableException);
 });
 it('fallos de período y listado no se convierten en cero ni exponen SQL privado',async()=>{
  pq.maybeSingle.mockResolvedValue({data:null,error:{message:'PRIVATE_SQL'}});await expect(service.obtenerResumenAlertas(tenant,period)).rejects.toThrow('No se pudo consultar');pq.maybeSingle.mockResolvedValue({data:periodRow(),error:null});bq.order.mockResolvedValue({data:null,error:{message:'PRIVATE_SQL'}});await expect(service.obtenerResumenAlertas(tenant,period)).rejects.toThrow('No se pudieron consultar');
 });
});
