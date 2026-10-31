import { ServiceUnavailableException } from '@nestjs/common';
import { PlanillasService } from './planillas.service';

function harness(data: any, error: any = null) {
  const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), order: jest.fn(() => q), range: jest.fn(() => q), maybeSingle: jest.fn(async () => ({data:{id:'payroll',tenant_id:'tenant'},error:null})),
    then: (resolve: any) => Promise.resolve({ data, error, count: Array.isArray(data) ? data.length : null }).then(resolve) };
  const child: any = { select: () => child, eq: (_key: any, value: any) => { if (_key === 'empleado_planilla_id') child.parent = value; return child; }, order: () => child, range: () => child,
    then: (resolve: any) => { const parent = Array.isArray(data) ? data.find(row => row.id === child.parent) : null;
      const children = (parent?.empleado_planilla_conceptos || []).map((row: any, index: number) => ({ ...row, id: `concept-${index}`, tenant_id: parent.tenant_id, empleado_planilla_id: parent.id }));
      return Promise.resolve({ data: children, count: children.length, error }).then(resolve); } };
  const service = new PlanillasService({ getClient: () => ({ from: (table: string) => table === 'empleado_planilla_conceptos' ? child : q }) } as any, {} as any);
  return { service, q };
}
describe('Lecturas de planillas verificables', () => {
  it.each([null, undefined, {}])('no presenta fuente incompleta %s como listado vacío', async data => {
    await expect(harness(data).service.getPlanillas('tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('rechaza errores de fuente aunque exista una lista parcial', async () => {
    await expect(harness([], { code: '08006' }).service.getPlanillas('tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(harness([], { code: '08006' }).service.getDetallePlanilla('payroll', 'tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('distingue listas vacías confirmadas y conserva filtros de empresa/planilla', async () => {
    const { service, q } = harness([]);
    await expect(service.getPlanillas('tenant')).resolves.toEqual({ success: true, data: [], tenant_id: 'tenant', total: 0, fuentes_planillas: { complete: true, total: 0, page_size: 1000 } });
    await expect(service.getDetallePlanilla('payroll', 'tenant')).resolves.toEqual([]);
    expect(q.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
    expect(q.eq).toHaveBeenCalledWith('id_planilla', 'payroll');
  });
  it.each([null, {}, [{ empleados: null, empleado_planilla_conceptos: [] }],
    [{ empleados: {}, empleado_planilla_conceptos: null }],
    [{ empleados: {}, empleado_planilla_conceptos: [{ conceptos_planilla: null }] }]])('rechaza detalle incompleto %s', async data => {
    await expect(harness(data).service.getDetallePlanilla('payroll', 'tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('conserva importes y tipo de los conceptos persistidos', async () => {
    const data = [{ id: 'detail', tenant_id: 'tenant', id_planilla: 'payroll', empleados: { nombres: 'Trabajador' }, neto_pagar: 2871,
      empleado_planilla_conceptos: [{ monto: 330, conceptos_planilla: { codigo: '008', metadata: { tipo: 'ingreso' } } }] }];
    await expect(harness(data).service.getDetallePlanilla('payroll', 'tenant')).resolves.toMatchObject([
      { neto_pagar: 2871, empleado_planilla_conceptos: [{ monto: 330, conceptos_planilla: { tipo: 'ingreso' } }] },
    ]);
  });
});
