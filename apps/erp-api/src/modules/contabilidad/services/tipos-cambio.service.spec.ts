import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TiposCambioService } from './tipos-cambio.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('TiposCambioService', () => {
  let service: TiposCambioService;

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let actualizaciones: Array<{ tabla: string; payload: any }>;

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
      update: jest.fn((payload: any) => {
        actualizaciones.push({ tabla, payload });
        return query;
      }),
      delete: jest.fn(() => query),
      eq: jest.fn((columna: string) => {
        filtros.push(columna);
        return query;
      }),
      lte: jest.fn(() => query),
      gte: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      range: jest.fn(() => query),
      single: jest.fn(async () => resultado()),
      maybeSingle: jest.fn(async () => resultado()),
      then: (onFulfilled: any) => Promise.resolve(resultado()).then(onFulfilled)
    };
    return query;
  };

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    actualizaciones = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiposCambioService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => ({ from: jest.fn((tabla: string) => construirQuery(tabla)) }))
          }
        }
      ]
    }).compile();

    service = module.get<TiposCambioService>(TiposCambioService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('obtenerMonedaLocal', () => {
    it('deriva la moneda del país del tenant', async () => {
      tablas['empresa_config'] = { data: { pais: 'AR' }, error: null };
      await expect(service.obtenerMonedaLocal(TENANT)).resolves.toBe('ARS');
    });

    it('cae en PEN cuando el tenant no tiene país configurado', async () => {
      tablas['empresa_config'] = { data: null, error: null };
      await expect(service.obtenerMonedaLocal(TENANT)).resolves.toBe('PEN');
    });
  });

  describe('obtenerVigente', () => {
    it('marca la cotización cuando proviene de una fecha anterior', async () => {
      // SUNAT no publica sábados ni domingos: la regla contable es usar la
      // última cotización publicada, pero quien valúa debe saberlo.
      tablas['tipos_cambio'] = {
        data: [{ fecha: '2026-08-28', compra: 3.7, venta: 3.75 }],
        error: null
      };

      const resultado = await service.obtenerVigente(TENANT, 'usd', 'pen', '2026-08-30');

      expect(resultado!.vigente_desde_fecha_anterior).toBe(true);
    });

    it('no marca nada cuando la cotización es de la fecha pedida', async () => {
      tablas['tipos_cambio'] = {
        data: [{ fecha: '2026-08-30', compra: 3.7, venta: 3.75 }],
        error: null
      };

      const resultado = await service.obtenerVigente(TENANT, 'USD', 'PEN', '2026-08-30');

      expect(resultado!.vigente_desde_fecha_anterior).toBe(false);
    });

    it('devuelve null si no hay ninguna cotización anterior', async () => {
      tablas['tipos_cambio'] = { data: [], error: null };
      await expect(service.obtenerVigente(TENANT, 'USD', 'PEN', '2026-08-30')).resolves.toBeNull();
    });
  });

  describe('exigirVigente', () => {
    it('falla con un mensaje accionable en lugar de valuar sin cotización', async () => {
      tablas['tipos_cambio'] = { data: [], error: null };

      await expect(service.exigirVigente(TENANT, 'USD', 'PEN', '2026-08-30')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('registrar', () => {
    it('replica la cotización cuando solo se informa un lado', async () => {
      tablas['tipos_cambio'] = (filtros: string[]) =>
        filtros.includes('moneda_origen')
          ? { data: null, error: null }
          : { data: { id: 'tc-1' }, error: null };

      await service.registrar(TENANT, USER, {
        moneda_origen: 'usd',
        moneda_destino: 'pen',
        fecha: '2026-08-30',
        venta: 3.75
      });

      expect(inserciones[0].payload).toMatchObject({
        moneda_origen: 'USD',
        moneda_destino: 'PEN',
        compra: 3.75,
        venta: 3.75,
        fuente: 'MANUAL'
      });
    });

    it('reemplaza la cotización existente del mismo par y fecha', async () => {
      tablas['tipos_cambio'] = (filtros: string[]) =>
        filtros.includes('moneda_origen')
          ? { data: { id: 'tc-existente' }, error: null }
          : { data: { id: 'tc-existente' }, error: null };

      await service.registrar(TENANT, USER, {
        moneda_origen: 'USD',
        moneda_destino: 'PEN',
        fecha: '2026-08-30',
        compra: 3.7,
        venta: 3.75
      });

      expect(inserciones).toHaveLength(0);
      expect(actualizaciones[0].payload).toMatchObject({ compra: 3.7, venta: 3.75 });
    });

    it('rechaza un par con la misma moneda de origen y destino', async () => {
      await expect(
        service.registrar(TENANT, USER, {
          moneda_origen: 'PEN',
          moneda_destino: 'PEN',
          fecha: '2026-08-30',
          compra: 1
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza el registro sin ninguna cotización', async () => {
      await expect(
        service.registrar(TENANT, USER, {
          moneda_origen: 'USD',
          moneda_destino: 'PEN',
          fecha: '2026-08-30'
        })
      ).rejects.toThrow(/al menos una cotización/);
    });
  });
});
