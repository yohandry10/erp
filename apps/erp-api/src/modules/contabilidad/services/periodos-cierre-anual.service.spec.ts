import { Test, TestingModule } from '@nestjs/testing';
import { PeriodosService, EstadoPeriodo } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Cierre anual del ejercicio.
 *
 * Estas pruebas fijan dos correcciones que estuvieron encubiertas la una por la
 * otra:
 *
 *  1. `asientos_contables.source_event_id` es uuid con índice único por tenant,
 *     pero el cierre le pasaba el texto `cierre-anual:2026`. Postgres lo
 *     rechazaba, de modo que el asiento de cierre nunca se generaba.
 *  2. Un `catch` en `cerrarPeriodo` se tragaba ese fallo y cerraba el período
 *     igual, dejando un ejercicio cerrado sin asiento de cierre de resultados.
 *
 * Cada una escondía a la otra: sin (2) el fallo (1) habría sido evidente el
 * primer diciembre. Por eso ambas se prueban juntas.
 */
describe('PeriodosService — cierre anual', () => {
  let service: PeriodosService;

  const TENANT = 'e6f1a3d2-1111-4222-8333-444455556666';
  const USER = 'user-1';
  const ANIO = 2026;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let rpc: jest.Mock;

  const construirQuery = (tabla: string) => {
    const filtros: string[] = [];
    const resultado = () => {
      const valor = tablas[tabla];
      return typeof valor === 'function' ? valor(filtros) : valor ?? { data: null, error: null };
    };
    const query: any = {
      select: jest.fn(() => query),
      insert: jest.fn((payload: any) => {
        inserciones.push({ tabla, payload });
        return query;
      }),
      update: jest.fn(() => query),
      delete: jest.fn(() => query),
      eq: jest.fn((columna: string) => {
        filtros.push(columna);
        return query;
      }),
      is: jest.fn(() => query),
      in: jest.fn(() => query),
      gte: jest.fn(() => query),
      lte: jest.fn(() => query),
      order: jest.fn(() => query),
      single: jest.fn(async () => resultado()),
      maybeSingle: jest.fn(async () => resultado()),
      then: (onFulfilled: any) => Promise.resolve(resultado()).then(onFulfilled)
    };
    return query;
  };

  /** Escenario feliz: diciembre abierto, todo cuadrado, resultado positivo. */
  const escenarioDiciembreCerrable = () => {
    tablas['periodos_contables'] = {
      data: {
        id: 'periodo-dic',
        tenant_id: TENANT,
        anio: ANIO,
        mes: 12,
        estado: EstadoPeriodo.ABIERTO
      },
      error: null
    };

    // asientos_contables sirve a tres consultas distintas: cuadre del período,
    // conteo de borradores y búsqueda del asiento de cierre por source_event_id.
    tablas['asientos_contables'] = (filtros: string[]) => {
      if (filtros.includes('source_event_id')) return { data: null, error: null };
      if (filtros.includes('estado')) return { count: 0, error: null };
      return { data: [], error: null };
    };

    tablas['outbox_events'] = { count: 0, error: null };
    tablas['plan_cuentas'] = {
      data: [
        { id: 'cuenta-59', codigo: '59' },
        { id: 'cuenta-89', codigo: '89' }
      ],
      error: null
    };
    tablas['detalle_asientos'] = { data: null, error: null };

    rpc.mockResolvedValue({ data: 15000, error: null });
  };

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    rpc = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => ({
              from: jest.fn((tabla: string) => construirQuery(tabla)),
              rpc
            }))
          }
        },
        {
          provide: 'EstadosFinancierosService',
          useValue: { refrescarEstadosFinancieros: jest.fn() }
        }
      ]
    }).compile();

    service = module.get<PeriodosService>(PeriodosService);
  });

  afterEach(() => jest.clearAllMocks());

  it('genera el asiento de cierre con un source_event_id uuid, no con texto libre', async () => {
    escenarioDiciembreCerrable();

    // El insert del asiento debe devolver una fila para que continúe el detalle.
    tablas['asientos_contables'] = (filtros: string[]) => {
      if (filtros.includes('source_event_id')) return { data: null, error: null };
      if (filtros.includes('estado')) return { count: 0, error: null };
      if (filtros.length === 0) return { data: { id: 'asiento-cierre' }, error: null };
      return { data: [], error: null };
    };

    await service.cerrarPeriodo(TENANT, ANIO, 12, USER);

    const escritura = rpc.mock.calls.find(
      ([funcion]) => funcion === 'crear_asiento_con_detalles_tx'
    );
    expect(escritura).toBeDefined();
    expect(escritura![1].p_asiento.source_event_id).toMatch(UUID_RE);
    expect(escritura![1].p_asiento.origen).toBe('CIERRE_ANUAL');
  });

  it('la clave del cierre es estable entre ejecuciones y distinta por año y tenant', async () => {
    const capturarClave = async (tenantId: string, anio: number) => {
      inserciones = [];
      rpc.mockClear();
      escenarioDiciembreCerrable();
      tablas['periodos_contables'] = {
        data: { id: 'p', tenant_id: tenantId, anio, mes: 12, estado: EstadoPeriodo.ABIERTO },
        error: null
      };
      tablas['asientos_contables'] = (filtros: string[]) => {
        if (filtros.includes('source_event_id')) return { data: null, error: null };
        if (filtros.includes('estado')) return { count: 0, error: null };
        if (filtros.length === 0) return { data: { id: 'asiento-cierre' }, error: null };
        return { data: [], error: null };
      };
      await service.cerrarPeriodo(tenantId, anio, 12, USER);
      return rpc.mock.calls.find(
        ([funcion]) => funcion === 'crear_asiento_con_detalles_tx'
      )![1].p_asiento.source_event_id;
    };

    const primera = await capturarClave(TENANT, ANIO);
    const repetida = await capturarClave(TENANT, ANIO);
    const otroAnio = await capturarClave(TENANT, ANIO + 1);
    const otroTenant = await capturarClave('aaaabbbb-1111-4222-8333-444455556666', ANIO);

    expect(repetida).toBe(primera);
    expect(otroAnio).not.toBe(primera);
    expect(otroTenant).not.toBe(primera);
  });

  it('si falla la generación del asiento de cierre, el período NO queda cerrado', async () => {
    escenarioDiciembreCerrable();
    rpc.mockResolvedValue({ data: null, error: { message: 'RPC caída' } });

    await expect(service.cerrarPeriodo(TENANT, ANIO, 12, USER)).rejects.toThrow(
      /Error calculando resultado del ejercicio/
    );

    // El update que cierra el período nunca debe haberse alcanzado.
    expect(inserciones.find(i => i.tabla === 'asientos_contables')).toBeUndefined();
  });

  it('un mes que no es diciembre no genera asiento de cierre', async () => {
    escenarioDiciembreCerrable();
    tablas['periodos_contables'] = {
      data: { id: 'periodo-jun', tenant_id: TENANT, anio: ANIO, mes: 6, estado: EstadoPeriodo.ABIERTO },
      error: null
    };

    await service.cerrarPeriodo(TENANT, ANIO, 6, USER);

    expect(rpc).not.toHaveBeenCalled();
    expect(inserciones.find(i => i.tabla === 'asientos_contables')).toBeUndefined();
  });

  it('no cierra diciembre si faltan las cuentas PCGE 59/89', async () => {
    escenarioDiciembreCerrable();
    tablas['plan_cuentas'] = { data: [{ id: 'cuenta-59', codigo: '59' }], error: null };

    await expect(service.cerrarPeriodo(TENANT, ANIO, 12, USER)).rejects.toThrow(
      /faltan las cuentas PCGE 59 y\/o 89/
    );

    expect(
      rpc.mock.calls.some(([funcion]) => funcion === 'crear_asiento_con_detalles_tx')
    ).toBe(false);
  });
});
