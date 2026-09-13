import { PlanillasService } from './planillas.service';

describe('Normativa peruana efectiva antes del cálculo', () => {
  const normativa = { uit: 5500, rmv: 1130, asignacion_familiar: 113,
    afp_aporte: 0.1, afp_prima_seguro: 0.0137, afp_comision_flujo_default: 0.0155,
    onp_aporte: 0.13, essalud_aporte: 0.09, quinta_deduccion_uit: 7 };
  function setup(responses: any[]) {
    const read = jest.fn();
    responses.forEach(response => read.mockResolvedValueOnce(response));
    const query: any = { maybeSingle: read };
    for (const method of ['select', 'eq', 'is', 'limit']) query[method] = jest.fn(() => query);
    const service = new PlanillasService({ getClient: () => ({ from: () => query }) } as any, {} as any);
    return { resolve: (period = '2026-09') => (service as any).obtenerNormativaPeruPeriodo(period, 'tenant'), read };
  }
  it('usa la fila vigente de la empresa sin sustituir sus valores', async () => {
    const { resolve, read } = setup([{ data: { ...normativa, rmv: 1200 }, error: null }]);
    expect(await resolve()).toMatchObject({ rmv: 1200, essaludAporte: 0.09 });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('permite normativa global configurada cuando no existe una propia', async () => {
    const { resolve } = setup([{ data: null, error: null }, { data: normativa, error: null }]);
    expect(await resolve()).toMatchObject({ uit: 5500, rmv: 1130 });
  });
  it('bloquea un período sin normativa en lugar de inventar tasas', async () => {
    const { resolve } = setup([{ data: null, error: null }, { data: null, error: null }]);
    await expect(resolve()).rejects.toMatchObject({ status: 400 });
  });
  it('no reemplaza un fallo de consulta por tasas globales', async () => {
    const { resolve, read } = setup([{ data: null, error: { code: '42501', message: 'internal SQL detail' } }]);
    await expect(resolve()).rejects.toMatchObject({ status: 503 });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each([null, -1, 'no-numero'])('rechaza una tasa inválida %s', async essalud_aporte => {
    const { resolve } = setup([{ data: { ...normativa, essalud_aporte }, error: null }]);
    await expect(resolve()).rejects.toMatchObject({ status: 400 });
  });
  it('rechaza un período mal formado antes de consultar', async () => {
    const { resolve, read } = setup([]);
    await expect(resolve('2026-13')).rejects.toMatchObject({ status: 400 });
    expect(read).not.toHaveBeenCalled();
  });
});
