import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { RrhhService } from './rrhh.service';
function harness(data: any, error: any = null) {
  const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), gte: jest.fn(() => q), lte: jest.fn(() => q),
    then: (resolve: any) => Promise.resolve({ data, error }).then(resolve) };
  const from = jest.fn(() => q);
  const service = new RrhhService({ getClient: () => ({ from }) } as any);
  const read = (start = new Date(2025,9,1), end = new Date(2026,9,9)) => (service as any).calcularVacacionesUsadas('employee',start,end,'tenant');
  return { q, from, read };
}
describe('Vacaciones gozadas al cese: fechas únicas y fuente completa', () => {
  it('une solapes al cruzar aniversario y cuenta sólo fechas anteriores o iguales al cese', async () => {
    const h = harness([
      { fecha_inicio:'2026-09-29',fecha_fin:'2026-10-03' },
      { fecha_inicio:'2026-09-30',fecha_fin:'2026-10-02' },
      { fecha_inicio:'2026-10-06',fecha_fin:'2026-10-12' },
    ]);
    await expect(h.read()).resolves.toBe(9);
    expect(h.from).toHaveBeenCalledWith('solicitudes');
    for (const args of [['id_empleado','employee'],['tipo','vacaciones'],['estado','aprobada'],['tenant_id','tenant']]) expect(h.q.eq).toHaveBeenCalledWith(...args);
    expect(h.q.lte).toHaveBeenCalledWith('fecha_inicio','2026-10-09');
    expect(h.q.gte).toHaveBeenCalledWith('fecha_fin','2025-10-01');
  });
  it('recorta solicitudes antes del ingreso y después del cese sin duplicar un día', async () => {
    await expect(harness([
      { fecha_inicio:'2025-09-28',fecha_fin:'2025-10-02' },
      { fecha_inicio:'2025-10-01',fecha_fin:'2025-10-02' },
      { fecha_inicio:'2026-10-09',fecha_fin:'2026-10-20' },
    ]).read()).resolves.toBe(3);
  });
  it('distingue ausencia confirmada de vacaciones', async () => { await expect(harness([]).read()).resolves.toBe(0); });
  it('no liquida días cero por error de lectura', async () => { await expect(harness([], { code:'08006' }).read()).rejects.toBeInstanceOf(ServiceUnavailableException); });
  it.each([null,undefined,{}])('rechaza fuente incompleta %s', async data => { await expect(harness(data).read()).rejects.toBeInstanceOf(ServiceUnavailableException); });
  it.each([null,{}, { fecha_inicio:'2026-02-30',fecha_fin:'2026-03-02' }, { fecha_inicio:'2026-10-10',fecha_fin:'2026-10-01' }])('rechaza fechas no verificables %s', async row => { await expect(harness([row]).read()).rejects.toBeInstanceOf(ServiceUnavailableException); });
  it('bloquea cese anterior al ingreso antes de leer la fuente', async () => {
    const h = harness([]);await expect(h.read(new Date(2026,9,9),new Date(2026,9,1))).rejects.toBeInstanceOf(BadRequestException);expect(h.from).not.toHaveBeenCalled();
  });
});
