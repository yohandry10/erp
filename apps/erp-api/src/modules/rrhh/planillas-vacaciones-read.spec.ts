import { ServiceUnavailableException } from '@nestjs/common';
import { PlanillasService } from './planillas.service';

function harness(result: any) {
  if(Array.isArray(result?.data))result={...result,count:result.data.length,data:result.data.map((r:any,i:number)=>r?{id:`request-${i}`,tenant_id:'tenant-1',tipo:'vacaciones',estado:'aprobada',...r}:r)};
  const query: any = {
    select: jest.fn(() => query), in: jest.fn(() => query), eq: jest.fn(() => query),
    order:jest.fn(()=>query),range:jest.fn(()=>query),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  const from = jest.fn(() => query);
  const service = new PlanillasService({ getClient: () => ({ from }) } as any, {} as any);
  return { query, from, read: () => (service as any).obtenerDiasVacacionesDelPeriodo(['employee-1'], '2026-02', 'tenant-1') };
}

describe('Planilla: vacaciones aprobadas del período', () => {
  it('no liquida vacaciones cero cuando falla la lectura', async () => {
    await expect(harness({ data: null, error: { message: 'permission denied for table solicitudes' } }).read())
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('distingue una lista vacía comprobada de un fallo de lectura', async () => {
    await expect(harness({ data: [], error: null }).read()).resolves.toEqual(new Map());
  });

  it('suma sólo días del mes y consulta empleados aprobados de la empresa', async () => {
    const h = harness({ data: [
      { id_empleado: 'employee-1', fecha_inicio: '2026-01-30', fecha_fin: '2026-02-03' },
      { id_empleado: 'employee-1', fecha_inicio: '2026-02-10', fecha_fin: '2026-02-11' },
    ], error: null });
    await expect(h.read()).resolves.toEqual(new Map([['employee-1', 5]]));
    expect(h.from).toHaveBeenCalledWith('solicitudes');
    expect(h.query.in).toHaveBeenCalledWith('id_empleado', ['employee-1']);
    expect(h.query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(h.query.eq).toHaveBeenCalledWith('estado', 'aprobada');
    expect(h.query.eq).toHaveBeenCalledWith('tipo', 'vacaciones');
  });

  it('cuenta una vez solicitudes duplicadas, contenidas y superpuestas al cruzar el mes', async () => {
    const h = harness({ data: [
      { id_empleado: 'employee-1', fecha_inicio: '2026-01-30', fecha_fin: '2026-02-03' },
      { id_empleado: 'employee-1', fecha_inicio: '2026-01-30', fecha_fin: '2026-02-03' },
      { id_empleado: 'employee-1', fecha_inicio: '2026-02-02', fecha_fin: '2026-02-02' },
      { id_empleado: 'employee-1', fecha_inicio: '2026-02-03', fecha_fin: '2026-02-04' },
      { id_empleado: 'employee-1', fecha_inicio: '2026-02-10', fecha_fin: '2026-02-11' },
    ], error: null });
    await expect(h.read()).resolves.toEqual(new Map([['employee-1', 6]]));
  });

  it.each([null, undefined, {}])('rechaza una fuente incompleta (%s) antes de persistir', async data => {
    await expect(harness({ data, error: null }).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([
    { id_empleado: 'employee-1', fecha_inicio: '2026-02-30', fecha_fin: '2026-03-01' },
    { id_empleado: 'employee-1', fecha_inicio: '2026-02-12', fecha_fin: '2026-02-11' },
    { id_empleado: 'employee-other', fecha_inicio: '2026-02-01', fecha_fin: '2026-02-02' },
    null,
  ])('rechaza fechas o empleado no verificables (%s)', async row => {
    await expect(harness({ data: [row], error: null }).read()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
