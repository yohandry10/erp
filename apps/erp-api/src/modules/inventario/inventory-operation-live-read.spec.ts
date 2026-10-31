import { ServiceUnavailableException } from '@nestjs/common';
import { readCompleteCatalog } from '../../shared/utils/complete-catalog-read';
import { AlmacenesService } from './almacenes/almacenes.service';
import { InventarioController } from './inventario.controller';
import { GreService } from '../gre/gre.service';
const tenant='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const id=(n:number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const row=(n=1)=>({id:id(n),tenant_id:tenant,nombre:'Catálogo',activo:true,es_servicio:false,controla_stock:true,es_principal:false,numero:`T-${n}`,motivo:'TRASLADO_ENTRE_ESTABLECIMIENTOS',estado:'FIRMADO'});
const page=(data:any[],count=data.length)=>({data,count,error:null});
function setup(pages:any[]){const calls:any[]=[];const rpc=jest.fn(()=>{throw new Error('Catalog read cannot write')});const client={rpc,from:jest.fn((table:string)=>{
  const c:any={table,filters:[],orders:[]};calls.push(c);const result=pages.shift();const q:any={select:(s:any,o:any)=>{c.selection=s;c.options=o;return q},eq:(k:any,v:any)=>{c.filters.push(['eq',k,v]);return q},in:(k:any,v:any)=>{c.filters.push(['in',k,v]);return q},order:(k:any,v:any)=>{c.orders.push([k,v]);return q},range:(a:any,b:any)=>{c.range=[a,b];return q},then:(resolve:any,reject:any)=>result instanceof Error?Promise.reject(result).then(resolve,reject):Promise.resolve(result).then(resolve,reject)};return q;
})};return {client,calls,rpc};}
function source(kind:string,pages:any[]){const h=setup(pages),supabase={getClient:()=>h.client} as any;
  const controller=new InventarioController(supabase,new AlmacenesService(supabase),{} as any,{} as any,{} as any);
  const gre=new GreService(supabase,{on:jest.fn(),emit:jest.fn(),eventEmitter:{eventNames:()=>[]}} as any,{} as any,{} as any);
  return {...h,read:()=>kind==='products'?controller.getProductos(tenant,{}):kind==='warehouses'?controller.getAlmacenes(tenant):gre.catalogoTraslados(tenant)};
}
describe('Catálogos completos para operaciones de inventario',()=>{
  it.each(['products','warehouses','guides'])('%s incluye fila1001 con conteos/identidades y pertenencia, sin writer',async kind=>{
    const rows=Array.from({length:1001},(_,i)=>row(i+1)),{read,calls,rpc}=source(kind,[page(rows.slice(0,1000),1001),page(rows.slice(1000),1001)]),v:any=await read();
    expect(kind==='guides'?v:v.data).toHaveLength(1001);if(kind!=='guides'){expect(v.complete).toBe(true);expect(v.tenant_id).toBe(tenant);expect(v.total).toBe(1001)}
    expect(calls.map(c=>c.range)).toEqual([[0,999],[1000,1999]]);for(const c of calls){expect(c.options.count).toBe('exact');expect(c.filters).toContainEqual(['eq','tenant_id',tenant]);expect(c.orders.some(o=>o[0]==='id')).toBe(true)}expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['products','warehouses','guides'])('%s sólo confirma vacío con conteo0',async kind=>{
    const v:any=await source(kind,[page([])]).read();expect(kind==='guides'?v:v.data).toEqual([]);if(kind!=='guides')expect(v.complete).toBe(true);
  });
  it.each(['products','warehouses','guides'])('%s rechaza fuente desconocida/truncada/duplicada/ajena; no éxito vacío',async kind=>{
    for(const p of [null,{data:null,count:0,error:null},{data:[],count:null,error:null},page([row()],2),page([row(),row()]),page([{...row(),tenant_id:foreign}]),{data:null,count:null,error:{message:'private_database_detail'}},new Error('private_transport_detail')]){
      const result=source(kind,[p]).read();
      await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(result).rejects.not.toThrow(/private_/);
    }
  });
  it.each(['products','warehouses','guides'])('%s segunda página fallida/conteo cambiado nunca confirma parcial',async kind=>{
    const rows=Array.from({length:1000},(_,i)=>row(i+1));for(const last of [null,page([row(1001)],1002)]){
      await expect(source(kind,[page(rows,1001),last]).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });
  it.each(['products','warehouses'])('%s estado/nombre desconocido no habilita operaciones',async kind=>{
    for(const value of [{...row(),nombre:''},{...row(),activo:null},{...row(),activo:false}]){await expect(source(kind,[page([value])]).read()).rejects.toBeInstanceOf(ServiceUnavailableException)}
  });
  it('productos con clasificación servicio/control-stock desconocida fallan cerrado',async()=>{
    for(const value of [{...row(),es_servicio:null},{...row(),controla_stock:null}])await expect(source('products',[page([value])]).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('guías ajenas al motivo o sin estado vigente se rechazan, sin envío fiscal',async()=>{
    for(const value of [{...row(),motivo:'VENTA'},{...row(),estado:'BORRADOR'},{...row(),numero:''}])await expect(source('guides',[page([value])]).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('almacenes inactivos sólo entran al catálogo explícito includeInactive',async()=>{
    const h=setup([page([{...row(),activo:false}])]);const service=new AlmacenesService({getClient:()=>h.client} as any);expect(await service.listar(tenant,true)).toHaveLength(1);expect(h.calls[0].filters).not.toContainEqual(['eq','activo',true]);
  });
  it('helper transforma fallo de transporte a503 sin detalle interno',async()=>{
    await expect(readCompleteCatalog(setup([new Error('private_secret')]).client,'productos','*',q=>q,r=>true)).rejects.toThrow('No se pudo completar el catálogo actual.');
  });
});
