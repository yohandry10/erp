import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import {PlanillasService} from './planillas.service';

const service = new PlanillasService({getClient:jest.fn()} as any,{} as any);
const norma2025={uit:5350,rmv:1130,asignacionFamiliar:113,afpAporte:.1,afpPrimaSeguro:.0137,
  afpRemuneracionMaxAsegurable:12178.56,afpComisionFlujoDefault:.0155,onpAporte:.13,essaludAporte:.09,quintaDeduccionUit:7};
const conceptos=['001','002','006','007','008','101','102','103','104','105','201'].map(codigo=>({id:'c-'+codigo,codigo}));
const employee={nombres:'Afiliado',fecha_ingreso:'2025-10-01',contratos:[{estado:'vigente',fecha_inicio:'2025-10-01',sueldo_bruto:15000,
  regimen_pensionario:'AFP',metadata:{afp_codigo:'INTEGRA',tipo_comision_afp:'FLUJO',tasa_comision_afp:.0155,tasa_seguro_afp:.0137}}]};
const amount=(r:any,code:string)=>r.conceptosDetalle.find((x:any)=>x.id==='c-'+code)?.monto;
describe('Máximo asegurable AFP por período: sólo prima de seguro',()=>{
  it.each(['ordinary','personalized'])('sueldo15000 limita prima a166.85; aporte1500 y comisión232.50 conservan sueldo completo (%s)',kind=>{
    const result=kind==='ordinary'
      ? (service as any).calcularEmpleado(employee,15000,conceptos,norma2025,'2025-10')
      : (service as any).calcularEmpleadoPersonalizado({...employee,sueldo_base:15000,dias_trabajados:30},conceptos,norma2025,'2025-10');
    expect(amount(result,'101')).toBe(1500);expect(amount(result,'102')).toBe(232.5);expect(amount(result,'103')).toBe(166.85);
    expect(amount(result,'201')).toBe(1350);
    // Ingreso1octubre: diciembre proyecta sólo3meses, grat7500+675.
    // Renta53175−7UIT(37450)=15725; impuesto8%=1258; divisor4.
    expect(amount(result,'105')).toBe(314.5);
    expect(result.netoPagar).toBe(12786.15);
  });
  it('la prima con1800 usa24.66; no aplica el máximo al ingreso ni al EsSalud patronal',()=>{
    const result=(service as any).calcularEmpleado({...employee,fecha_ingreso:'2025-01-01'},1800,conceptos,norma2025,'2025-12');
    expect(amount(result,'101')).toBe(180);expect(amount(result,'102')).toBe(27.9);expect(amount(result,'103')).toBe(24.66);
    expect(amount(result,'201')).toBe(162);
  });
  it('AFPsin máximo mensual comprobado bloquea el cálculo y permite configurar; no hereda otro año',()=>{
    expect(()=> (service as any).calcularEmpleado(employee,15000,conceptos,{...norma2025,afpRemuneracionMaxAsegurable:null},'2026-10'))
      .toThrow(/máxima asegurable AFP de 2026-10/);
  });
  it('ONP no requiere máximoAFP; prima0/base0 no dependen del tope',()=>{
    const norma={...norma2025,afpRemuneracionMaxAsegurable:null};
    const result=(service as any).calcularEmpleado({...employee,contratos:[{estado:'vigente',regimen_pensionario:'ONP'}]},1800,conceptos,norma,'2026-10');
    expect(amount(result,'104')).toBe(234);
    expect((service as any).calcularPrimaSeguroAfp(15000,0,norma,'2026-10')).toBe(0);
    expect((service as any).calcularPrimaSeguroAfp(0,.0137,norma,'2026-10')).toBe(0);
    expect(()=> (service as any).calcularPrimaSeguroAfp(1000,-.01,norma,'2026-10')).toThrow(BadRequestException);
  });
  it('la proyección de quinta respeta bonificación EPS6.75% y meses completos desde ingreso',()=>{
    const result=(service as any).calcularEmpleado({...employee,rrhh_peru_fichas_laborales:[{activo:true,regimen_salud_codigo:'01',eps_servicios_propios_codigo:'3'}]},15000,conceptos,norma2025,'2025-10');
    expect(amount(result,'105')).toBe(311.13);
  });
  it('una lectura fiscal fallida es503, nunca un historial inventado en cero',async()=>{
    const q:any={};for(const m of ['select','eq','gte','lt'])q[m]=()=>q;
    q.then=(resolve:any)=>resolve({data:null,error:{code:'PGRST000'}});
    const s=new PlanillasService({getClient:()=>({from:()=>q})} as any,{} as any);
    await expect((s as any).obtenerHistorialQuintaEjercicio('own',['employee'],'2025-10')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('octubre acumula rentas previas, pero descuenta sólo retenciones enero-agosto segúnart40',async()=>{
    const results=[{data:[{id:'a',periodo:'2025-08',estado:'pagada'},{id:'s',periodo:'2025-09',estado:'pagada'}],error:null},
      {data:[{id:'da',empleado_id:'e',planilla_id:'a',total_ingresos:1000},{id:'ds',empleado_id:'e',planilla_id:'s',total_ingresos:2000}],error:null},
      {data:{id:'ir'},error:null},
      {data:[{empleado_planilla_id:'da',concepto_id:'ir',monto:50},{empleado_planilla_id:'ds',concepto_id:'ir',monto:75}],error:null}];
    const client={from:()=>{const result=results.shift();const q:any={};for(const m of ['select','eq','gte','lt'])q[m]=()=>q;
      q.maybeSingle=async()=>result;q.then=(resolve:any)=>resolve(result);return q;}};
    const s=new PlanillasService({getClient:()=>client} as any,{} as any);
    const history=await (s as any).obtenerHistorialQuintaEjercicio('own',['e'],'2025-10');
    expect(history.get('e')).toEqual({percibido:3000,retenido:50});
  });
});
