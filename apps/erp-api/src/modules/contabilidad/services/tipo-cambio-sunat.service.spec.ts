import axios from 'axios';
import { TipoCambioSunatService } from './tipo-cambio-sunat.service';

jest.mock('axios');

/**
 * El caso que motiva el contraste es real. Consultando dos proveedores para el
 * 20 de agosto de 2026:
 *
 *     apis.net.pe    compra 3.355   venta 3.361
 *     e-api.net.pe   compra 3.647   venta 3.651
 *
 * El 19 cerró en 3.356 y el 21 en 3.355. El segundo servía un dato corrupto, y
 * un tipo de cambio equivocado no rompe nada visible: los asientos cuadran
 * igual y el error se arrastra a la diferencia de cambio, al IGV de las compras
 * en dólares y al balance.
 */
describe('TipoCambioSunatService', () => {
  const axiosGet = axios.get as jest.Mock;

  const construirSupabase = (opciones: {
    existente?: any;
    ultimo?: any;
    onInsert?: jest.Mock;
  }) => {
    const insert = opciones.onInsert ?? jest.fn(async () => ({ error: null }));

    const cadena = (): any => {
      const chain: any = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        lt: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        insert,
      };
      // `maybeSingle` sirve dos consultas distintas: la de la fecha exacta y la
      // del último conocido. Se distinguen por si se uso `lt`.
      chain.maybeSingle = jest.fn(async () =>
        chain.lt.mock.calls.length > 0
          ? { data: opciones.ultimo ?? null, error: null }
          : { data: opciones.existente ?? null, error: null },
      );
      return chain;
    };

    return {
      getClient: jest.fn(() => ({ from: jest.fn(() => cadena()) })),
      _insert: insert,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TIPO_CAMBIO_DESVIACION_MAXIMA;
  });

  it('guarda una cotización coherente con la del día anterior', async () => {
    axiosGet.mockResolvedValue({
      data: { origen: 'SUNAT', compra: 3.355, venta: 3.361, moneda: 'USD', fecha: '2026-08-20' },
    });
    const supabase = construirSupabase({ ultimo: { fecha: '2026-08-19', compra: 3.356, venta: 3.362 } });

    const service = new TipoCambioSunatService(supabase as any);
    const resultado = await service.importarFecha('tenant-1', '2026-08-20');

    expect(resultado.guardado).toBe(true);
    expect(supabase._insert).toHaveBeenCalledWith(
      expect.objectContaining({ compra: 3.355, venta: 3.361, fuente: 'apis.net.pe' }),
    );
  });

  it('rechaza el dato corrupto que se dio de verdad, y no lo guarda', async () => {
    axiosGet.mockResolvedValue({
      data: { compra: 3.647, venta: 3.651, fecha: '2026-08-20' },
    });
    const supabase = construirSupabase({ ultimo: { fecha: '2026-08-19', compra: 3.356, venta: 3.362 } });

    const service = new TipoCambioSunatService(supabase as any);
    const resultado = await service.importarFecha('tenant-1', '2026-08-20');

    expect(resultado.guardado).toBe(false);
    expect(resultado.motivo).toContain('se aparta');
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it('sin cotización previa acepta la primera, porque si no el sistema se queda sin ninguna', async () => {
    axiosGet.mockResolvedValue({ data: { compra: 3.355, venta: 3.361 } });
    const supabase = construirSupabase({ ultimo: null });

    const service = new TipoCambioSunatService(supabase as any);
    const resultado = await service.importarFecha('tenant-1', '2026-08-20');

    expect(resultado.guardado).toBe(true);
  });

  it('no pisa una cotización que ya existe: puede haberla puesto el contador', async () => {
    axiosGet.mockResolvedValue({ data: { compra: 3.355, venta: 3.361 } });
    const supabase = construirSupabase({ existente: { id: 'tc-1', fuente: 'manual' } });

    const service = new TipoCambioSunatService(supabase as any);
    const resultado = await service.importarFecha('tenant-1', '2026-08-20');

    expect(resultado.guardado).toBe(false);
    expect(resultado.motivo).toContain('ya existe');
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it('la fuente caída no rompe nada: se informa y se sigue', async () => {
    // Sin token la fuente responde 429 a la segunda consulta seguida.
    axiosGet.mockRejectedValue({ response: { status: 429 }, message: 'Too Many Requests' });
    const supabase = construirSupabase({});

    const service = new TipoCambioSunatService(supabase as any);
    const resultado = await service.importarFecha('tenant-1', '2026-08-20');

    expect(resultado.guardado).toBe(false);
    expect(resultado.motivo).toContain('no devolvió');
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta con importes no utilizables', async () => {
    axiosGet.mockResolvedValue({ data: { compra: 0, venta: null } });
    const supabase = construirSupabase({});

    const service = new TipoCambioSunatService(supabase as any);
    const resultado = await service.importarFecha('tenant-1', '2026-08-20');

    expect(resultado.guardado).toBe(false);
    expect(supabase._insert).not.toHaveBeenCalled();
  });

  it('la tolerancia del contraste es configurable', async () => {
    process.env.TIPO_CAMBIO_DESVIACION_MAXIMA = '0.5';
    axiosGet.mockResolvedValue({ data: { compra: 3.647, venta: 3.651 } });
    const supabase = construirSupabase({ ultimo: { fecha: '2026-08-19', compra: 3.356, venta: 3.362 } });

    const service = new TipoCambioSunatService(supabase as any);
    const resultado = await service.importarFecha('tenant-1', '2026-08-20');

    // Con la tolerancia al 50 % el mismo valor pasa: la regla no está grabada a fuego.
    expect(resultado.guardado).toBe(true);
  });
});
