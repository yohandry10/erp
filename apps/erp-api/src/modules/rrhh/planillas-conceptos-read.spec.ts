import { PlanillasService } from './planillas.service';

describe('Consulta de conceptos sin escrituras implícitas', () => {
  const codes = ['001','002','003','004','005','006','007','008','101','102','103','104','105','106','107','201'];
  function setup(data: any[], error: any = null) {
    const insert = jest.fn();
    const query: any = { insert, then: (resolve: any) => Promise.resolve({ data, error }).then(resolve) };
    for (const method of ['select','eq','order']) query[method] = jest.fn(() => query);
    const client = { from: jest.fn(() => query) };
    const service = new PlanillasService({ getClient: () => client } as any, {} as any);
    return { service, insert, client };
  }
  it('devuelve los conceptos configurados sin renombrarlos', async () => {
    const data = codes.map(codigo => ({ codigo, nombre: 'Nombre de la empresa' }));
    const { service, insert } = setup(data);
    expect((await service.getConceptos('tenant')).data).toEqual(data);
    expect(insert).not.toHaveBeenCalled();
  });
  it('informa los conceptos faltantes sin intentar insertarlos durante un GET', async () => {
    const { service, insert } = setup(codes.filter(c => c !== '006').map(codigo => ({ codigo })));
    await expect(service.getConceptos('tenant')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('006') });
    expect(insert).not.toHaveBeenCalled();
  });
  it('comunica indisponibilidad sin exponer SQL', async () => {
    const { service } = setup([], { code: '42501', message: 'internal SQL detail' });
    await expect(service.getConceptos('tenant')).rejects.toMatchObject({ status: 503,
      message: 'No se pudieron consultar los conceptos de planilla' });
  });
  it('no consulta sin empresa', async () => {
    const { service, client } = setup([]);
    await expect(service.getConceptos()).rejects.toMatchObject({ status: 400 });
    expect(client.from).not.toHaveBeenCalled();
  });
});
