import { PresupuestosService } from './presupuestos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('Presupuestos: fuente completa de ejecución y alertas', () => {
  let service: PresupuestosService;
  let client: any;
  beforeEach(() => {
    client = { from:jest.fn(),select:jest.fn(),eq:jest.fn(),gte:jest.fn(),lt:jest.fn(),range:jest.fn(),order:jest.fn(),limit:jest.fn(),maybeSingle:jest.fn() };
    for(const key of ['from','select','eq','gte','lt','order','limit'])client[key].mockReturnValue(client);
    const countryQuery:any={select:()=>countryQuery,eq:()=>countryQuery,maybeSingle:async()=>({data:{pais:'PE'},error:null})};
    const scopedClient={...client,from:(table:string)=>table==='empresa_config'?countryQuery:client.from(table)};
    service=new PresupuestosService({getClient:()=>scopedClient} as unknown as SupabaseService);
  });
  const run=()=>service.calcularMontoEjecutado('tenant-1','center-1','account-1','period-1');
  it('una fuente de período fallida no acredita ejecución cero',async()=>{
    client.maybeSingle.mockResolvedValue({data:null,error:{message:'private SQL failure'}});
    await expect(run()).rejects.toMatchObject({status:503});expect(client.from).toHaveBeenCalledTimes(1);
  });
  it('un período inexistente se informa como 404 antes de leer movimientos',async()=>{
    client.maybeSingle.mockResolvedValue({data:null,error:null});await expect(run()).rejects.toMatchObject({status:404});
  });
  it('un calendario incompleto bloquea la consulta de ejecución',async()=>{
    client.maybeSingle.mockResolvedValue({data:{anio:2026,mes:13},error:null});await expect(run()).rejects.toMatchObject({status:503});
  });
  it('movimientos indisponibles no se transforman en cero',async()=>{
    client.maybeSingle.mockResolvedValue({data:{anio:2026,mes:10},error:null});client.range.mockResolvedValue({data:null,error:{message:'private SQL failure'}});
    await expect(run()).rejects.toMatchObject({status:503});
  });
  it('sólo una lista realmente vacía permite afirmar ejecución cero',async()=>{
    client.maybeSingle.mockResolvedValue({data:{anio:2026,mes:10},error:null});client.range.mockResolvedValue({data:[],error:null,count:0});
    await expect(run()).resolves.toBe(0);
    expect(client.eq).toHaveBeenCalledWith('asientos_contables.estado','CONFIRMADO');expect(client.eq).toHaveBeenCalledWith('tenant_id','tenant-1');
  });
  it('datos nulos o importes incompletos no pasan por normalizadores a cero',async()=>{
    client.maybeSingle.mockResolvedValue({data:{anio:2026,mes:10},error:null});
    for(const data of [null,{},[{debe:undefined,haber:0}],[{debe:'invalid',haber:0}],[{debe:null,haber:0}],[{debe:0.001,haber:0}]]){
      client.range.mockResolvedValue({data:Array.isArray(data)?data.map((row,i)=>row&&typeof row==='object'?{...row,id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')}:row):data,error:null,count:Array.isArray(data)?data.length:0});await expect(run()).rejects.toMatchObject({status:503});
    }
  });
  it('suma importes decimales verificados en centavos sin acumular error binario',async()=>{
    client.maybeSingle.mockResolvedValue({data:{anio:2026,mes:10},error:null});client.range.mockResolvedValue({data:[{id:'00000000-0000-4000-8000-000000000001',debe:0.1,haber:0},{id:'00000000-0000-4000-8000-000000000002',debe:'0.20',haber:'0.00'}],error:null,count:2});
    await expect(run()).resolves.toBe(0.3);
  });
  it('fallo del período de alertas no acredita que todos los presupuestos están normales',async()=>{
    client.maybeSingle.mockResolvedValue({data:null,error:{message:'private SQL failure'}});
    await expect(service.obtenerAlertasSobregiro('tenant-1')).rejects.toMatchObject({status:503});
  });
  it('ausencia confirmada de período abierto conserva un resumen vacío legítimo',async()=>{
    client.maybeSingle.mockResolvedValue({data:null,error:null});await expect(service.obtenerAlertasSobregiro('tenant-1')).resolves.toEqual([]);
  });
});
