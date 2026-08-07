import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TesoreriaService } from './tesoreria.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { TiposCambioService } from '../../contabilidad/services/tipos-cambio.service';

/**
 * Diferencia de cambio realizada al pagar.
 *
 * Un pago en moneda extranjera cancela una deuda contabilizada a una cotización
 * y desembolsa efectivo a otra. Hasta ahora esa brecha no se registraba, y peor:
 * el asiento tomaba el importe en dólares y lo asentaba como si fueran soles.
 */
describe('TesoreriaService — valuación del pago', () => {
  let service: TesoreriaService;
  let tiposCambio: {
    obtenerMonedaLocal: jest.Mock;
    exigirVigente: jest.Mock;
  };

  const TENANT = 'tenant-1';

  beforeEach(async () => {
    tiposCambio = {
      obtenerMonedaLocal: jest.fn().mockResolvedValue('PEN'),
      exigirVigente: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TesoreriaService,
        { provide: SupabaseService, useValue: { getClient: jest.fn() } },
        { provide: EventBusService, useValue: {} },
        { provide: TiposCambioService, useValue: tiposCambio }
      ]
    }).compile();

    service = module.get<TesoreriaService>(TesoreriaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('un pago en moneda local no consulta cotizaciones ni genera diferencia', async () => {
    const valuacion = await service.valuarPago({
      tenantId: TENANT,
      moneda: 'PEN',
      monto: 1000,
      fechaPago: '2026-09-15',
      tipoCambioOrigen: null
    });

    expect(valuacion).toEqual({
      montoContabilizado: 1000,
      montoLiquidacion: 1000,
      diferenciaCambio: 0,
      tipoCambio: 1
    });
    expect(tiposCambio.exigirVigente).not.toHaveBeenCalled();
  });

  it('pagar una deuda en USD con el dólar al alza es pérdida', async () => {
    // 1000 USD contabilizados a 3.700 y pagados a 3.800: se desembolsan 100
    // soles más de los que decía el libro.
    tiposCambio.exigirVigente.mockResolvedValue({ compra: 3.79, venta: 3.8 });

    const valuacion = await service.valuarPago({
      tenantId: TENANT,
      moneda: 'USD',
      monto: 1000,
      fechaPago: '2026-09-15',
      tipoCambioOrigen: 3.7
    });

    expect(valuacion).toEqual({
      montoContabilizado: 3700,
      montoLiquidacion: 3800,
      diferenciaCambio: -100,
      tipoCambio: 3.8
    });
  });

  it('pagar una deuda en USD con el dólar a la baja es ganancia', async () => {
    tiposCambio.exigirVigente.mockResolvedValue({ compra: 3.55, venta: 3.6 });

    const valuacion = await service.valuarPago({
      tenantId: TENANT,
      moneda: 'USD',
      monto: 1000,
      fechaPago: '2026-09-15',
      tipoCambioOrigen: 3.7
    });

    expect(valuacion.diferenciaCambio).toBe(100);
    expect(valuacion.montoLiquidacion).toBe(3600);
  });

  it('un pasivo se liquida al tipo de cambio venta, no al de compra', async () => {
    tiposCambio.exigirVigente.mockResolvedValue({ compra: 3.7, venta: 3.9 });

    const valuacion = await service.valuarPago({
      tenantId: TENANT,
      moneda: 'USD',
      monto: 100,
      fechaPago: '2026-09-15',
      tipoCambioOrigen: 3.7
    });

    expect(valuacion.tipoCambio).toBe(3.9);
  });

  it('falla si no hay cotización, en lugar de inventar uno', async () => {
    tiposCambio.exigirVigente.mockRejectedValue(
      new NotFoundException('No hay tipo de cambio USD/PEN vigente al 2026-09-15.')
    );

    await expect(
      service.valuarPago({
        tenantId: TENANT,
        moneda: 'USD',
        monto: 1000,
        fechaPago: '2026-09-15',
        tipoCambioOrigen: 3.7
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un documento sin cotización de origen se valúa bien pero no reconoce diferencia', async () => {
    // Caso de las CxP anteriores a que se registrara tipo_cambio_origen: no se
    // puede calcular la brecha, pero el asiento debe estar en soles igualmente.
    tiposCambio.exigirVigente.mockResolvedValue({ compra: 3.79, venta: 3.8 });

    const valuacion = await service.valuarPago({
      tenantId: TENANT,
      moneda: 'USD',
      monto: 1000,
      fechaPago: '2026-09-15',
      tipoCambioOrigen: null
    });

    expect(valuacion.montoContabilizado).toBe(3800);
    expect(valuacion.montoLiquidacion).toBe(3800);
    expect(valuacion.diferenciaCambio).toBe(0);
  });
});
