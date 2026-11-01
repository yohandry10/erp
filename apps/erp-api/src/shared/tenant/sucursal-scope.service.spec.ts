import { ServiceUnavailableException } from '@nestjs/common';
import { SucursalScopeService } from './sucursal-scope.service';

const servicio = (eq2: jest.Mock) => {
  const consulta = { select: () => consulta, eq: jest.fn() } as any;
  consulta.eq.mockReturnValueOnce(consulta).mockImplementationOnce(eq2);
  const supabase = { getClient: () => ({ from: () => consulta }) } as any;
  return new SucursalScopeService(supabase);
};

describe('SucursalScopeService', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('sin asignaciones el alcance es total', async () => {
    const s = servicio(jest.fn().mockResolvedValue({ data: [], error: null }));
    await expect(s.resolver('t', 'u')).resolves.toBeNull();
  });

  it('con asignaciones restringe a esas sucursales', async () => {
    const s = servicio(jest.fn().mockResolvedValue({ data: [{ sucursal_id: 's1' }], error: null }));
    await expect(s.resolver('t', 'u')).resolves.toEqual(['s1']);
  });

  it('un error de lectura no ensancha el alcance', async () => {
    const s = servicio(jest.fn().mockResolvedValue({ data: null, error: { message: 'caída' } }));
    await expect(s.resolver('t', 'u')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('una excepción de red tampoco', async () => {
    const s = servicio(jest.fn().mockRejectedValue(new Error('sin red')));
    await expect(s.resolver('t', 'u')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('una petición de sistema sin usuario no consulta y conserva el alcance total', async () => {
    const s = servicio(jest.fn());
    await expect(s.resolver(null, null)).resolves.toBeNull();
  });
});
