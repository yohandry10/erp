import { AccountingBooksService } from './accounting-books.service';
import { ServiceUnavailableException } from '@nestjs/common';

describe('Consignaciones: fuentes completas y aisladas', () => {
  const rows=(n:number)=>Array.from({length:n},(_,i)=>({id:`record-${i}`,tenant_id:'tenant-1',activo:true}));
  function setup(pages:any[],tenant='tenant-1') {
    let offset=0;const chain:any={};
    for(const method of ['select','eq','order','gte','lte'])chain[method]=jest.fn(()=>chain);
    chain.range=jest.fn((start:number)=>{offset=start;return chain;});
    chain.then=(resolve:any)=>Promise.resolve(pages[offset/1000] ?? {data:[],count:0,error:null}).then(resolve);
    const from=jest.fn(()=>chain);
    const service=new AccountingBooksService({getClient:()=>({from})} as any,{getTenantId:()=>tenant} as any);
    return {service,chain,from};
  }
  it.each(['register','products'])('completa1001 filas de %s con conteo estable y orden determinista',async(kind)=>{
    const all=rows(1001);const {service,chain,from}=setup([{data:all.slice(0,1000),count:1001},{data:all.slice(1000),count:1001}]);
    const got=kind==='register'?await service.getRegistroConsignaciones({estado:'vendida',fechaDesde:'2026-01-01',fechaHasta:'2026-12-31'}):await service.getProductosConsignacion();
    expect(got).toEqual(all);expect(chain.range.mock.calls).toEqual([[0,999],[1000,1999]]);
    expect(chain.select).toHaveBeenCalledWith(expect.any(String),{count:'exact'});
    expect(chain.order).toHaveBeenCalledWith('id',{ascending:true});expect(chain.eq).toHaveBeenCalledWith('tenant_id','tenant-1');
    if(kind==='register') {expect(from).toHaveBeenCalledWith('registro_consignaciones');expect(chain.eq).toHaveBeenCalledWith('estado','VENDIDA');expect(chain.gte).toHaveBeenCalledWith('fecha_registro','2026-01-01');}
    else {expect(from).toHaveBeenCalledWith('productos');expect(chain.eq).toHaveBeenCalledWith('activo',true);}
  });
  it.each(['register','products'])('acepta vacío confirmado de %s',async(kind)=>{
    const {service}=setup([{data:[],count:0}]);expect(await(kind==='register'?service.getRegistroConsignaciones():service.getProductosConsignacion())).toEqual([]);
  });
  const invalids:any[]=[
    ['error',{data:[],count:0,error:{message:'unavailable'}}],['null',{data:null,count:0}],['object',{data:{},count:0}],
    ['missingCount',{data:[]}],['stringCount',{data:[],count:'0'}],['negativeCount',{data:[],count:-1}],['fractionCount',{data:[],count:.1}],
    ['falseEmpty',{data:[],count:1}],['shortPage',{data:rows(1),count:2}],['excessRows',{data:rows(2),count:1}],
    ['foreign',{data:[{id:'record',tenant_id:'other',activo:true}],count:1}],['duplicate',{data:[rows(1)[0],rows(1)[0]],count:2}],['missingID',{data:[{tenant_id:'tenant-1',activo:true}],count:1}],
  ];
  it.each(invalids)('rechaza %s sin confirmar vacío o subtotal',async(_,value)=>{
    const {service}=setup([value]);await expect(service.getRegistroConsignaciones()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza producto inactivo en catálogo activo',async()=>{
    const {service}=setup([{data:[{...rows(1)[0],activo:false}],count:1}]);await expect(service.getProductosConsignacion()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza cambio de conteo entre páginas',async()=>{
    const {service}=setup([{data:rows(1000),count:1001},{data:[{id:'last',tenant_id:'tenant-1'}],count:1002}]);await expect(service.getRegistroConsignaciones()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza ID repetido entre páginas',async()=>{
    const {service}=setup([{data:rows(1000),count:1001},{data:[rows(1)[0]],count:1001}]);await expect(service.getRegistroConsignaciones()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza falta de tenant antes de consultar',async()=>{
    const {service,from}=setup([],null);await expect(service.getRegistroConsignaciones()).rejects.toThrow('Tenant requerido');expect(from).not.toHaveBeenCalled();
  });
});
