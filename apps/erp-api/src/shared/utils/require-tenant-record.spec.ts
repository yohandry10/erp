import { requireTenantRecord } from './require-tenant-record';

const tenant='tenant',id='record';
function harness(result:any, rejection?:Error) {
  const query:any={select:jest.fn(()=>query),eq:jest.fn(()=>query),maybeSingle:jest.fn(()=>rejection?Promise.reject(rejection):Promise.resolve(result))};
  const client={from:jest.fn(()=>query)};
  return {query,client,read:()=>requireTenantRecord(client,'empleados',tenant,id,'Empleado')};
}
describe('Registro padre de la empresa antes de interpretar colecciones vacías',()=>{
  it('exige el registro exacto y ambos filtros, sin escribir',async()=>{
    const h=harness({data:{id,tenant_id:tenant},error:null});await expect(h.read()).resolves.toBeUndefined();
    expect(h.client.from).toHaveBeenCalledWith('empleados');expect(h.query.eq.mock.calls).toEqual([['tenant_id',tenant],['id',id]]);
    expect(h.query.select).toHaveBeenCalledWith('id,tenant_id');
  });
  it('ausencia confirmada es404; no se confunde con fuente incompleta',async()=>{
    await expect(harness({data:null,error:null}).read()).rejects.toMatchObject({status:404});
  });
  it.each([undefined,null,{}, {data:undefined,error:null},{data:{id:'other',tenant_id:tenant},error:null},{data:{id,tenant_id:'other'},error:null}, {data:{id},error:null}, {data:{id,tenant_id:tenant},error:{code:'42501'}}])('fuente desconocida o ajena%s es503',async result=>{
    await expect(harness(result).read()).rejects.toMatchObject({status:503});
  });
  it('corte de transporte es503 sin filtrar detalles',async()=>{
    const error=await harness(null,new Error('PRIVATE_CONNECTION_PASSWORD')).read().catch(e=>e);
    expect(error.status).toBe(503);expect(error.message).not.toContain('PRIVATE');
  });
  it('UUID mal formado se clasifica400 antes de cualquier éxito vacío',async()=>{
    await expect(harness({data:null,error:{code:'22P02',message:'PRIVATE_DATABASE_DETAIL'}}).read()).rejects.toMatchObject({status:400,message:'El identificador no es válido'});
  });
  it.each([['',id],[tenant,'']])('sin ámbito %s/%s no consulta',async(t,r)=>{
    const h=harness(null);await expect(requireTenantRecord(h.client,'empleados',t,r,'Empleado')).rejects.toMatchObject({status:400});expect(h.client.from).not.toHaveBeenCalled();
  });
});
