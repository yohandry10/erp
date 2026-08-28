import axios from 'axios';
import { PadronRucService } from './padron-ruc.service';

jest.mock('axios');

/**
 * Lo que se fija aquí es que la consulta del padrón **nunca estorbe**. El dato
 * es un aviso —«este proveedor está NO HABIDO»—, no un permiso: si la fuente se
 * cae o el RUC no aparece, registrar el proveedor tiene que seguir siendo
 * posible.
 *
 * Y la distinción entre «no existe» y «no se pudo averiguar», que es la que
 * evita concluir algo falso sobre un contribuyente.
 */
describe('PadronRucService', () => {
  const axiosGet = axios.get as jest.Mock;

  const construirSupabase = (opciones: { enCache?: any; onUpsert?: jest.Mock } = {}) => {
    const upsert = opciones.onUpsert ?? jest.fn(async () => ({ error: null }));
    const cadena = (): any => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        upsert,
        maybeSingle: jest.fn(async () => ({ data: opciones.enCache ?? null, error: null })),
      };
      return chain;
    };
    return { getClient: jest.fn(() => ({ from: jest.fn(() => cadena()) })), _upsert: upsert };
  };

  beforeEach(() => jest.clearAllMocks());

  it('consulta la fuente y guarda lo que trae', async () => {
    axiosGet.mockResolvedValue({
      data: {
        nombre: 'SUPERMERCADOS PERUANOS S.A.',
        estado: 'ACTIVO',
        condicion: 'HABIDO',
        direccion: 'CAL. MORELLI 181',
        ubigeo: '150130',
      },
    });
    const supabase = construirSupabase();

    const dato = await new PadronRucService(supabase as any).consultar('20100070970');

    expect(dato).toMatchObject({
      ruc: '20100070970',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
      desdeCache: false,
    });
    expect(supabase._upsert).toHaveBeenCalled();
  });

  it('detecta un proveedor NO HABIDO, que es para lo que existe', async () => {
    axiosGet.mockResolvedValue({
      data: { nombre: 'EMPRESA DUDOSA S.A.C.', estado: 'ACTIVO', condicion: 'NO HABIDO' },
    });

    const dato = await new PadronRucService(construirSupabase() as any).consultar('20100070970');

    expect(dato?.condicion).toBe('NO HABIDO');
  });

  it('no vuelve a preguntar si la caché está fresca', async () => {
    const supabase = construirSupabase({
      enCache: {
        ruc: '20100070970',
        razon_social: 'YA CONSULTADA',
        estado: 'ACTIVO',
        condicion: 'HABIDO',
        fuente: 'apis.net.pe',
        consultado_en: new Date().toISOString(),
      },
    });

    const dato = await new PadronRucService(supabase as any).consultar('20100070970');

    expect(dato?.desdeCache).toBe(true);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('si la caché envejeció vuelve a preguntar', async () => {
    const haceDosMeses = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    axiosGet.mockResolvedValue({
      data: { nombre: 'REFRESCADA', estado: 'BAJA PROVISIONAL', condicion: 'NO HABIDO' },
    });
    const supabase = construirSupabase({
      enCache: {
        ruc: '20100070970',
        razon_social: 'VIEJA',
        estado: 'ACTIVO',
        condicion: 'HABIDO',
        fuente: 'apis.net.pe',
        consultado_en: haceDosMeses,
      },
    });

    const dato = await new PadronRucService(supabase as any).consultar('20100070970');

    expect(axiosGet).toHaveBeenCalled();
    expect(dato?.estado).toBe('BAJA PROVISIONAL');
  });

  it('si la fuente se cae devuelve lo viejo antes que nada', async () => {
    const haceDosMeses = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    axiosGet.mockRejectedValue({ response: { status: 503 }, message: 'caida' });
    const supabase = construirSupabase({
      enCache: {
        ruc: '20100070970',
        razon_social: 'DATO ANTIGUO',
        estado: 'ACTIVO',
        condicion: 'HABIDO',
        fuente: 'apis.net.pe',
        consultado_en: haceDosMeses,
      },
    });

    const dato = await new PadronRucService(supabase as any).consultar('20100070970');

    // Un dato de hace dos meses vale más que ninguno para avisar de una baja.
    expect(dato?.razonSocial).toBe('DATO ANTIGUO');
    expect(dato?.desdeCache).toBe(true);
  });

  it('«no se pudo averiguar» no es «no existe»', async () => {
    axiosGet.mockRejectedValue({ message: 'timeout' });

    const dato = await new PadronRucService(construirSupabase() as any).consultar('20100070970');

    // Sin caché y sin fuente: null. Quien lo reciba no debe concluir nada del
    // contribuyente, sólo que no se pudo comprobar.
    expect(dato).toBeNull();
  });

  it('un RUC que no tiene once dígitos ni se consulta', async () => {
    const dato = await new PadronRucService(construirSupabase() as any).consultar('123');

    expect(dato).toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });
});
