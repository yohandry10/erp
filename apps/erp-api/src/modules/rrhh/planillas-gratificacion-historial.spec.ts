import { BadRequestException, ConflictException } from '@nestjs/common';
import { PlanillasService } from './planillas.service';

const norma={uit:5500,rmv:1130,asignacionFamiliar:113,afpAporte:0.1,afpPrimaSeguro:0.0137,afpComisionFlujoDefault:0.0155,onpAporte:0.13,essaludAporte:0.09,quintaDeduccionUit:7};
const conceptos=['001','002','006','007','104','105','201'].map(codigo=>({id:codigo,codigo}));
function servicio(){
  const rpc=jest.fn((_name:any,payload:any)=>Promise.resolve({data:{success:true,planillaId:payload.p_planilla_id,idempotent:false,totalEmpleados:payload.p_empleados.length,totalIngresos:2250,totalDescuentos:0,totalAportes:0, totalNeto:2250},error:null}));
  const service=new PlanillasService({getClient:()=>({rpc})} as any,{} as any);
  const norm=jest.spyOn(service as any,'obtenerNormativaPeruPeriodo').mockResolvedValue(norma);
  return {service,rpc,norm,resolve:(periodo:string,empleados:any[],declaraciones:any[]=[]) =>
    (service as any).obtenerBasesGratificacionOrdinaria(periodo,'tenant','actor',empleados,declaraciones)};
}

describe('Gratificación ordinaria usa sueldo histórico30jun/30nov',()=>{
  it.each([['2026-07','2026-06-30','2026-07-01'],['2026-12','2026-11-30','2026-12-01']])(
    '%s no convierte un aumento posterior en base histórica',async(periodo,finAnterior,inicioNuevo)=>{
      const empleado={id:'emp',fecha_ingreso:'2026-01-01',dias_trabajados:30,sueldo_base:3000,tiene_hijos:true,
        contratos:[{id:'new',estado:'vigente',fecha_inicio:inicioNuevo,sueldo_bruto:3000,regimen_pensionario:'ONP'},
          {id:'old',estado:'finalizado',fecha_inicio:'2026-01-01',fecha_fin:finAnterior,sueldo_bruto:2000}]};
      const {service,resolve,norm}=servicio();
      const bases=await resolve(periodo,[empleado]);
      expect(norm).toHaveBeenCalledWith(finAnterior.slice(0,7),'tenant');
      const fuente=bases.get('emp');
      expect(fuente).toMatchObject({monto:2113,contrato_id:'old',fuente:'CONTRATO_HISTORICO',declarado_por:'actor'});
      const conBase={...empleado,base_gratificacion_ordinaria:fuente};
      for(const result of [(service as any).calcularEmpleado(conBase,3000,conceptos,norma,periodo),
        (service as any).calcularEmpleadoPersonalizado(conBase,conceptos,norma,periodo)]){
        expect(result.conceptosDetalle.find((c:any)=>c.id==='006')?.monto).toBe(2113);
        expect(result.conceptosDetalle.find((c:any)=>c.id==='007')?.monto).toBe(190.17);
        expect(result.conceptosDetalle.find((c:any)=>c.id==='104')?.monto).toBe(404.69);
      }
    });
  it('falta de contrato histórico pide fuente y no adivina con sueldo actual',async()=>{
    const {resolve}=servicio();
    await expect(resolve('2026-07',[{id:'emp',fecha_ingreso:'2026-01-01',contratos:[
      {id:'new',fecha_inicio:'2026-07-01',estado:'vigente',sueldo_bruto:3000},
    ]}])).rejects.toBeInstanceOf(ConflictException);
  });
  it('admite base computable externa con variables e historial anterior al ERP, preserva actor y referencia',async()=>{
    const {service,resolve,rpc}=servicio();
    const bases=await resolve('2026-07',[{id:'emp',fecha_ingreso:'2026-01-01',contratos:[]}],
      [{empleado_id:'emp',periodo:'2026-06',monto:2250,referencia:'Boleta junio y promedio regular documentado'}]);
    const metadata={base_gratificacion_ordinaria:bases.get('emp')};
    expect(metadata.base_gratificacion_ordinaria).toMatchObject({monto:2250,fuente:'FUENTE_EXTERNA_DECLARADA',declarado_por:'actor'});
    const calculados=[{empleado_id:'emp',metadata,total_ingresos:2250,total_descuentos:0,total_aportes:0,neto_pagar:2250}];
    await(service as any).guardarCalculoPlanillaAtomico('planilla','tenant',calculados,'actor');
    expect(rpc).toHaveBeenCalledWith('guardar_calculo_planilla_gratificacion_tx_570',expect.objectContaining({p_empleados:calculados}));
  });
  it.each([{periodo:'2026-07'},{monto:0},{monto:1.001},{referencia:' '},{empleado_id:'otro'}])(
    'rechaza fuente incompleta/inconsistente%j',async cambio=>{
      const {resolve}=servicio();
      await expect(resolve('2026-07',[{id:'emp',fecha_ingreso:'2026-01-01'}],
        [{empleado_id:'emp',periodo:'2026-06',monto:1200,referencia:'Boleta junio',...cambio}])).rejects.toBeInstanceOf(BadRequestException);
    });
  it('meses ordinarios sin gratificación no leen una base anterior',async()=>{
    const {resolve,norm}=servicio();
    expect((await resolve('2026-10',[{id:'emp'}])).size).toBe(0);
    expect(norm).not.toHaveBeenCalled();
  });
});
