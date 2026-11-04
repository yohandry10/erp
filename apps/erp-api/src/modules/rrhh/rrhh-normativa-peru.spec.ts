import {BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {NormativaPeruPeriodoDto} from './dto/normativa-peru.dto';
import {RrhhService} from './rrhh.service';

const valid = {periodo:'2025-12',uit:5350,rmv:1130,asignacion_familiar:113,afp_aporte:.1,
  afp_prima_seguro:.0137,afp_comision_flujo_default:.0155,onp_aporte:.13,essalud_aporte:.09,
  quinta_deduccion_uit:7,bancarizacion_pen_min:2000,bancarizacion_usd_min:500,igv_tasa:.18,referencia:'Norma oficial 2025'};
describe('Normativa mensual propia Perú',()=>{
  it('valida el período histórico completo sin exigir información de un emisor',async()=>{
    expect(await validate(plainToInstance(NormativaPeruPeriodoDto,valid),{whitelist:true,forbidNonWhitelisted:true})).toEqual([]);
  });
  it.each([{periodo:'2025-13'},{periodo:'2025-00'},{uit:0},{afp_aporte:10},{afp_prima_seguro:.0137123},
    {rmv:1130.001},{afp_remuneracion_max_asegurable:0},{afp_remuneracion_max_asegurable:12178.561},{igv_tasa:NaN},{referencia:'a'},{tenant_id:'otra empresa'},{actor_id:'actor inventado'}])('rechaza regla o alcance inválidos %j',async patch=>{
    expect((await validate(plainToInstance(NormativaPeruPeriodoDto,{...valid,...patch}),{whitelist:true,forbidNonWhitelisted:true})).length).toBeGreaterThan(0);
  });
  it('consulta el mes exacto y sólo versiones propias; una lectura fallida es 503',async()=>{
    const queries:any[]=[];
    const client={from:jest.fn((table:string)=>{
      const index=queries.length;
      const q:any={};for(const method of ['select','eq','is','in','order'])q[method]=jest.fn(()=>q);
      q.maybeSingle=jest.fn(async()=>({data:{id:'global',activo:true,periodo:'2025-12'},error:null}));
      q.then=(resolve:any)=>resolve(index===0?{data:[{id:'own-active',activo:true},{id:'own-old',activo:false}],error:null}:{data:[{id:'paid',estado:'pagada'}],error:null});
      queries.push({table,q});return q;
    })};
    const service=new RrhhService({getClient:()=>client} as any);
    const result=await service.getNormativaPeruPeriodo('tenant-own','2025-12');
    expect(result.data).toMatchObject({origen:'EMPRESA',bloqueada:true,normativa:{id:'own-active'},versiones:[{id:'own-active',activo:true},{id:'own-old',activo:false}]});
    expect(queries[0].q.eq).toHaveBeenCalledWith('tenant_id','tenant-own');
    expect(queries[0].q.eq).toHaveBeenCalledWith('periodo','2025-12');
    expect(queries[1].q.is).toHaveBeenCalledWith('tenant_id',null);
    expect(queries[2].q.in).toHaveBeenCalledWith('estado',['calculada','aprobada','pagada']);
    client.from.mockImplementation(()=>{const q:any={};for(const m of ['select','eq','is','in','order'])q[m]=()=>q;
      q.maybeSingle=async()=>({error:{code:'PGRST000'},data:null});q.then=(resolve:any)=>resolve({error:{code:'PGRST000'},data:null});return q;});
    await expect(service.getNormativaPeruPeriodo('tenant-own','2025-12')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getNormativaPeruPeriodo('tenant-own','2025-13')).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    [null,false,['remuneración máxima asegurable AFP de 2026-11']],
    [0,false,['remuneración máxima asegurable AFP de 2026-11']],
    [12178.56,true,[]],
  ])('la preparación exige el tope AFP que la planilla necesita (tope %p)',async(tope,ready,missing)=>{
    const client={from:jest.fn((table:string)=>{
      const q:any={};for(const m of ['select','eq','is','in','order','limit'])q[m]=jest.fn(()=>q);
      q.maybeSingle=jest.fn(async()=>table==='empresa_config'
        ?{data:{pais:'PE'},error:null}
        :{data:{periodo:'2026-11',uit:5350,afp_remuneracion_max_asegurable:tope},error:null});
      return q;
    })};
    const service=new RrhhService({getClient:()=>client} as any);
    const result:any=await service.getConfiguracionLaboral(`tenant-afp-${String(tope)}`);
    expect(result.data.readiness).toEqual({ready,periodo:'2026-11',missing});
    expect(result.data.ready).toBe(ready);
  });
  it('usa actor/empresa autenticados y la misma intención explícita; rechaza conflictos clasificados',async()=>{
    const rpc=jest.fn().mockResolvedValue({data:{success:true,data:{id:'version-1'}},error:null});
    const service=new RrhhService({getClient:()=>({rpc})} as any);
    await service.guardarNormativaPeruPeriodo('tenant-auth','actor-auth',valid,'normative-version-202512');
    expect(rpc).toHaveBeenCalledWith('guardar_normativa_peru_periodo_tx_570',{
      p_tenant_id:'tenant-auth',p_actor_id:'actor-auth',p_payload:valid,p_idempotency_key:'normative-version-202512'});
    await expect(service.guardarNormativaPeruPeriodo('tenant-auth','actor-auth',valid)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.guardarNormativaPeruPeriodo('tenant-auth','',valid,'normative-version-202512')).rejects.toBeInstanceOf(ForbiddenException);
    rpc.mockResolvedValue({data:null,error:{code:'23514',message:'Normativa bloqueada por planilla calculada'}});
    await expect(service.guardarNormativaPeruPeriodo('tenant-auth','actor-auth',valid,'normative-version-202512')).rejects.toBeInstanceOf(ConflictException);
    rpc.mockResolvedValue({data:null,error:{code:'42501',message:'Sólo ADMIN de esta empresa'}});
    await expect(service.guardarNormativaPeruPeriodo('tenant-auth','actor-auth',valid,'normative-version-202512')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
