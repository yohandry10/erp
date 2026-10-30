import {RrhhService} from './rrhh.service';
import {PlanillasService} from './planillas.service';

const tenant='tenant',id='parent';
function setup(parent:any={id,tenant_id:tenant},child:any[]=[],fault:any=null) {
 const calls:any[]=[];
 const client={from:(table:string)=>{
  const call:any={table,filters:[],orders:[]};calls.push(call);
  const q:any={select:(selection:any,options:any)=>{Object.assign(call,{selection,options});return q},eq:(key:any,value:any)=>{call.filters.push([key,value]);return q},order:(key:any,value:any)=>{call.orders.push([key,value]);return q},
   maybeSingle:async()=>({data:parent,error:fault}),range:(a:any,b:any)=>{call.range=[a,b];return Promise.resolve({data:child,count:child.length,error:fault})}};
  return q;
 }};
 return {calls,rrhh:new RrhhService({getClient:()=>client} as any),payroll:new PlanillasService({getClient:()=>client} as any,{} as any)};
}
const readers=[['getBeneficiosEmpleado','empleado_beneficios'],['getCapacitacionesEmpleado','empleado_capacitaciones'],['getExpediente','expediente_documentos']] as const;
describe.each(readers)('%s sólo interpreta hijos de empleado propio conocido',(method,table)=>{
 it('empleado ausente o ajeno es404 antes de consultar hijos',async()=>{
  const h=setup(null);await expect(h.rrhh[method](id,tenant)).rejects.toMatchObject({status:404});expect(h.calls.map(c=>c.table)).toEqual(['empleados']);
 });
 it('empleado conocido sin hijos sí permite lista vacía',async()=>{
  const h=setup();await expect(h.rrhh[method](id,tenant)).resolves.toEqual({success:true,data:[]});
  expect(h.calls[1].table).toBe(table);expect(h.calls[1].options).toEqual({count:'exact'});expect(h.calls[1].filters).toContainEqual(['tenant_id',tenant]);expect(h.calls[1].filters).toContainEqual(['id_empleado',id]);
 });
 it('un fallo de permisos no publica lista vacía ni texto interno',async()=>{
  const h=setup(null,[],{code:'42501',message:'PRIVATE_DATABASE_DETAIL'}),error=await h.rrhh[method](id,tenant).catch(e=>e);
  expect(error.status).toBe(503);expect(error.message).not.toContain('PRIVATE');
 });
 it('rechaza cualquier hijo que pertenezca a otro empleado o empresa',async()=>{
  const h=setup(undefined,[{id:'child',tenant_id:'foreign',id_empleado:id}]);await expect(h.rrhh[method](id,tenant)).rejects.toMatchObject({status:503});
 });
});
describe('Relaciones explícitas y datos del catálogo de la misma empresa',()=>{
 it.each([['getBeneficiosEmpleado','beneficios','id_beneficio','empleado_beneficios_id_beneficio_fkey'],['getCapacitacionesEmpleado','capacitaciones','id_capacitacion','empleado_capacitaciones_id_capacitacion_fkey']] as const)('%s resuelve la FK canónica y conserva el registro',async(method,relation,fk,constraint)=>{
  const row:any={id:'child',tenant_id:tenant,id_empleado:id,[fk]:'catalog',[relation]:{id:'catalog',tenant_id:tenant,nombre:'Original'}};
  const h=setup(undefined,[row]);await expect(h.rrhh[method](id,tenant)).resolves.toEqual({success:true,data:[row]});expect(h.calls[1].selection).toContain('!'+constraint);
  row[relation].tenant_id='foreign';await expect(setup(undefined,[row]).rrhh[method](id,tenant)).rejects.toMatchObject({status:503});
 });
 it.each(['getBeneficios','getCapacitaciones'] as const)('%s no convierte una caída en ausencia confirmada',async method=>{
  await expect(setup(null,[],{code:'08006'}).rrhh[method](tenant)).rejects.toMatchObject({status:503});
 });
});
describe('Detalle de planilla requiere su padre exacto',()=>{
 it('planilla ausente o ajena es404 y no consulta empleados',async()=>{const h=setup(null);await expect(h.payroll.getDetallePlanilla(id,tenant)).rejects.toMatchObject({status:404});expect(h.calls.map(c=>c.table)).toEqual(['planillas']);});
 it('planilla propia conocida sin empleados sí devuelve vacío',async()=>{const h=setup();await expect(h.payroll.getDetallePlanilla(id,tenant)).resolves.toEqual([]);expect(h.calls.map(c=>c.table)).toEqual(['planillas','empleado_planilla']);});
});
