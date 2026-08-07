import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConciliacionPartidasService } from './conciliacion-partidas.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EstadoConciliacion } from '@erp-suite/dtos';

/**
 * Conciliación de partidas abiertas (Fase 5).
 *
 * El grueso de las pruebas está en `repartir`: es donde un error no se nota.
 * Un reparto mal calculado no descuadra ningún asiento —conciliar no toca los
 * asientos— pero deja facturas que parecen pendientes cuando ya se cobraron, o
 * al revés.
 */
describe('ConciliacionPartidasService', () => {
  let service: ConciliacionPartidasService;

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let actualizaciones: Array<{ tabla: string; payload: any }>;
  let rpcs: Array<{ funcion: string; parametros: any }>;
  let resultadosRpc: Record<string, any>;

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

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    actualizaciones = [];
    rpcs = [];
    resultadosRpc = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConciliacionPartidasService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => ({
              from: jest.fn((tabla: string) => construirQuery(tabla)),
              rpc: jest.fn(async (funcion: string, parametros: any) => {
                rpcs.push({ funcion, parametros });
                return (
                  resultadosRpc[funcion] ?? {
                    data: { id: 'conc-1', fecha: '2026-09-30' },
                    error: null
                  }
                );
              })
            }))
          }
        }
      ]
    }).compile();

    service = module.get<ConciliacionPartidasService>(ConciliacionPartidasService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('repartir', () => {
    const repartir = ConciliacionPartidasService.repartir;

    it('una factura contra su cobro exacto es conciliación TOTAL', () => {
      const reparto = repartir([
        { detalle_id: 'factura', pendiente: 1000 },
        { detalle_id: 'cobro', pendiente: -1000 }
      ]);

      expect(reparto.estado).toBe(EstadoConciliacion.TOTAL);
      expect(reparto.montoConciliado).toBe(1000);
      expect(reparto.saldoNoConciliado).toBe(0);
      expect(reparto.aplicaciones).toEqual([
        { detalle_id: 'factura', monto_aplicado: 1000 },
        { detalle_id: 'cobro', monto_aplicado: 1000 }
      ]);
    });

    it('un cobro a cuenta deja la factura parcialmente abierta', () => {
      const reparto = repartir([
        { detalle_id: 'factura', pendiente: 1000 },
        { detalle_id: 'cobro', pendiente: -300 }
      ]);

      expect(reparto.estado).toBe(EstadoConciliacion.PARCIAL);
      expect(reparto.montoConciliado).toBe(300);
      expect(reparto.saldoNoConciliado).toBe(700);
      expect(reparto.aplicaciones).toEqual([
        { detalle_id: 'factura', monto_aplicado: 300 },
        { detalle_id: 'cobro', monto_aplicado: 300 }
      ]);
    });

    it('un cobro cancela varias facturas, consumiéndolas en orden', () => {
      const reparto = repartir([
        { detalle_id: 'f1', pendiente: 400 },
        { detalle_id: 'f2', pendiente: 400 },
        { detalle_id: 'f3', pendiente: 400 },
        { detalle_id: 'cobro', pendiente: -900 }
      ]);

      expect(reparto.montoConciliado).toBe(900);
      expect(reparto.aplicaciones).toEqual([
        { detalle_id: 'f1', monto_aplicado: 400 },
        { detalle_id: 'f2', monto_aplicado: 400 },
        { detalle_id: 'f3', monto_aplicado: 100 },
        { detalle_id: 'cobro', monto_aplicado: 900 }
      ]);
      expect(reparto.saldoNoConciliado).toBe(300);
    });

    it('no deja residuos con importes de céntimos', () => {
      // Con aritmética decimal, 33,33 × 3 contra 99,99 deja un flotante que
      // haría parecer la partida abierta por una milésima.
      const reparto = repartir([
        { detalle_id: 'f1', pendiente: 33.33 },
        { detalle_id: 'f2', pendiente: 33.33 },
        { detalle_id: 'f3', pendiente: 33.33 },
        { detalle_id: 'cobro', pendiente: -99.99 }
      ]);

      expect(reparto.estado).toBe(EstadoConciliacion.TOTAL);
      expect(reparto.montoConciliado).toBe(99.99);
      expect(reparto.saldoNoConciliado).toBe(0);
      const totalDeudor = reparto.aplicaciones
        .filter(a => a.detalle_id !== 'cobro')
        .reduce((s, a) => s + a.monto_aplicado, 0);
      expect(Math.round(totalDeudor * 100)).toBe(9999);
    });

    it('rechaza un grupo con un solo lado', () => {
      expect(() =>
        repartir([
          { detalle_id: 'f1', pendiente: 100 },
          { detalle_id: 'f2', pendiente: 200 }
        ])
      ).toThrow(/los dos lados/);
    });

    it('el saldo no conciliado lleva el signo del lado que sobra', () => {
      const sobraAcreedor = repartir([
        { detalle_id: 'factura', pendiente: 300 },
        { detalle_id: 'cobro', pendiente: -1000 }
      ]);

      expect(sobraAcreedor.montoConciliado).toBe(300);
      expect(sobraAcreedor.saldoNoConciliado).toBe(-700);
    });
  });

  describe('conciliar', () => {
    const conPartidas = (filas: any[], conciliable = true) => {
      tablas['detalle_asientos'] = { data: filas, error: null };
      tablas['plan_cuentas'] = {
        data: { id: 'cuenta-12', codigo: '12', nombre: 'Clientes', conciliable },
        error: null
      };
      resultadosRpc['conciliar_partidas_tx'] = {
        data: { id: 'conc-1', fecha: '2026-09-30' },
        error: null
      };
    };

    const partidaFactura = {
      id: 'd-factura',
      cuenta_id: 'cuenta-12',
      debe: 1000,
      haber: 0,
      monto_conciliado: 0,
      asientos_contables: { fecha: '2026-09-01', estado: 'CONFIRMADO' }
    };

    const partidaCobro = {
      id: 'd-cobro',
      cuenta_id: 'cuenta-12',
      debe: 0,
      haber: 1000,
      monto_conciliado: 0,
      asientos_contables: { fecha: '2026-09-15', estado: 'CONFIRMADO' }
    };

    it('registra la conciliación y actualiza el importe casado de cada partida', async () => {
      conPartidas([partidaFactura, partidaCobro]);

      const resultado = await service.conciliar(TENANT, USER, {
        detalle_ids: ['d-factura', 'd-cobro']
      });

      expect(resultado.estado).toBe(EstadoConciliacion.TOTAL);
      expect(resultado.monto_conciliado).toBe(1000);

      expect(rpcs).toContainEqual({
        funcion: 'conciliar_partidas_tx',
        parametros: expect.objectContaining({
          p_tenant_id: TENANT,
          p_cuenta_id: 'cuenta-12',
          p_monto_conciliado: 1000,
          p_aplicaciones: [
            { detalle_id: 'd-factura', monto_aplicado: 1000 },
            { detalle_id: 'd-cobro', monto_aplicado: 1000 }
          ]
        })
      });
    });

    it('rechaza partidas de cuentas distintas', async () => {
      conPartidas([partidaFactura, { ...partidaCobro, cuenta_id: 'cuenta-42' }]);

      await expect(
        service.conciliar(TENANT, USER, { detalle_ids: ['d-factura', 'd-cobro'] })
      ).rejects.toThrow(/misma cuenta contable/);

      expect(inserciones).toHaveLength(0);
    });

    it('rechaza conciliar sobre una cuenta que no es de terceros', async () => {
      conPartidas([partidaFactura, partidaCobro], false);

      await expect(
        service.conciliar(TENANT, USER, { detalle_ids: ['d-factura', 'd-cobro'] })
      ).rejects.toThrow(/no está marcada como conciliable/);
    });

    it('rechaza partidas de asientos en borrador', async () => {
      conPartidas([
        partidaFactura,
        { ...partidaCobro, asientos_contables: { fecha: '2026-09-15', estado: 'BORRADOR' } }
      ]);

      await expect(
        service.conciliar(TENANT, USER, { detalle_ids: ['d-factura', 'd-cobro'] })
      ).rejects.toThrow(/asientos confirmados/);
    });

    it('rechaza partidas ya conciliadas por completo', async () => {
      conPartidas([{ ...partidaFactura, monto_conciliado: 1000 }, partidaCobro]);

      await expect(
        service.conciliar(TENANT, USER, { detalle_ids: ['d-factura', 'd-cobro'] })
      ).rejects.toThrow(/ya están conciliadas/);
    });

    it('rechaza una selección con la misma partida repetida', async () => {
      conPartidas([partidaFactura, partidaCobro]);

      await expect(
        service.conciliar(TENANT, USER, { detalle_ids: ['d-factura', 'd-factura'] })
      ).rejects.toThrow(/partidas repetidas/);
    });

    it('falla si alguna partida no existe en el tenant', async () => {
      conPartidas([partidaFactura]);

      await expect(
        service.conciliar(TENANT, USER, { detalle_ids: ['d-factura', 'd-cobro'] })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('respeta lo ya conciliado al calcular el pendiente', async () => {
      // La factura de 1.000 ya tenía 400 aplicados: sólo quedan 600 por casar.
      conPartidas([
        { ...partidaFactura, monto_conciliado: 400 },
        { ...partidaCobro, debe: 0, haber: 600 }
      ]);

      const resultado = await service.conciliar(TENANT, USER, {
        detalle_ids: ['d-factura', 'd-cobro']
      });

      expect(resultado.monto_conciliado).toBe(600);
      expect(resultado.estado).toBe(EstadoConciliacion.TOTAL);

      expect(rpcs[0]).toEqual({
        funcion: 'conciliar_partidas_tx',
        parametros: expect.objectContaining({
          p_aplicaciones: [
            { detalle_id: 'd-factura', monto_aplicado: 600 },
            { detalle_id: 'd-cobro', monto_aplicado: 600 }
          ]
        })
      });
    });

    it('propaga el fallo de la RPC atómica sin intentar escrituras locales de compensación', async () => {
      conPartidas([partidaFactura, partidaCobro]);
      resultadosRpc['conciliar_partidas_tx'] = {
        data: null,
        error: { message: 'CONCILIACION_EXCEDE_SALDO:d-factura' }
      };

      await expect(
        service.conciliar(TENANT, USER, { detalle_ids: ['d-factura', 'd-cobro'] })
      ).rejects.toThrow(/Error creando la conciliación/);

      expect(inserciones).toHaveLength(0);
      expect(actualizaciones).toHaveLength(0);
    });
  });

  describe('desconciliar', () => {
    it('delega saldos y borrado a una única RPC transaccional', async () => {
      resultadosRpc['desconciliar_partidas_tx'] = {
        data: { id: 'conc-1', estado: 'DESCONCILIADA' },
        error: null
      };

      await service.desconciliar(TENANT, 'conc-1');

      expect(rpcs).toEqual([
        {
          funcion: 'desconciliar_partidas_tx',
          parametros: { p_tenant_id: TENANT, p_conciliacion_id: 'conc-1' }
        }
      ]);
      expect(actualizaciones).toHaveLength(0);
    });

    it('traduce la ausencia informada por PostgreSQL a NotFoundException', async () => {
      resultadosRpc['desconciliar_partidas_tx'] = {
        data: null,
        error: { message: 'CONCILIACION_NO_ENCONTRADA' }
      };

      await expect(service.desconciliar(TENANT, 'inexistente')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('obtenerPartidasAbiertas', () => {
    it('excluye borradores, anulados y partidas ya cerradas', async () => {
      tablas['plan_cuentas'] = {
        data: { id: 'cuenta-12', codigo: '12', nombre: 'Clientes', conciliable: true },
        error: null
      };
      tablas['detalle_asientos'] = {
        data: [
          {
            id: 'abierta',
            asiento_id: 'a1',
            debe: 1000,
            haber: 0,
            monto_conciliado: 0,
            asientos_contables: { fecha: '2026-09-01', estado: 'CONFIRMADO', numero_asiento: 1 }
          },
          {
            id: 'cerrada',
            asiento_id: 'a2',
            debe: 500,
            haber: 0,
            monto_conciliado: 500,
            asientos_contables: { fecha: '2026-09-02', estado: 'CONFIRMADO', numero_asiento: 2 }
          },
          {
            id: 'borrador',
            asiento_id: 'a3',
            debe: 700,
            haber: 0,
            monto_conciliado: 0,
            asientos_contables: { fecha: '2026-09-03', estado: 'BORRADOR', numero_asiento: 3 }
          }
        ],
        error: null
      };

      const resumen = await service.obtenerPartidasAbiertas(TENANT, { cuenta_id: 'cuenta-12' });

      expect(resumen.partidas.map(p => p.detalle_id)).toEqual(['abierta']);
      expect(resumen.total_deudor).toBe(1000);
      expect(resumen.saldo_abierto).toBe(1000);
    });

    it('rechaza una cuenta no conciliable', async () => {
      tablas['plan_cuentas'] = {
        data: { id: 'cuenta-63', codigo: '63', nombre: 'Servicios', conciliable: false },
        error: null
      };

      await expect(
        service.obtenerPartidasAbiertas(TENANT, { cuenta_id: 'cuenta-63' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
