import { AsientosGeneratorService } from './asientos-generator.service';
import { ContabilidadEventsListener } from '../listeners/contabilidad-events.listener';
import { ACCOUNTING_EVENT_TYPES } from '../../../shared/outbox/accounting-event-types';

describe('ownership contable de Caja 474', () => {
  const tenantId = '47400000-0000-4000-8000-000000000001';
  const cashId = '47400000-0000-4000-8000-000000000031';
  const counterId = '47400000-0000-4000-8000-000000000034';
  let planCuentas: { obtenerCuentasPorCodigos: jest.Mock };
  let generator: AsientosGeneratorService;
  let generarAsiento: jest.SpyInstance;
  let marcarFallido: jest.SpyInstance;

  const payload = (overrides: Record<string, unknown> = {}) => ({
    tenant_id: tenantId,
    event_id: '47400000-0000-4000-8000-000000000091',
    tipo_evento: 'caja.retiro.registrado',
    tipo: 'GASTO',
    monto: 240,
    montoOrigen: 200,
    tipoCambio: 1.2,
    fecha: '2026-08-10',
    referencia: 'CAJA-474-QA',
    descripcion: 'Operación Caja 474',
    cuentaCajaId: cashId,
    cuentaCajaCodigo: '10111',
    cuentaContrapartidaId: counterId,
    cuentaContrapartidaCodigo: '65999',
    accountingHandledByOutbox: true,
    ...overrides,
  });

  beforeEach(() => {
    planCuentas = {
      obtenerCuentasPorCodigos: jest.fn().mockResolvedValue(new Map([
        ['10111', { id: cashId }],
        ['65999', { id: counterId }],
        ['75999', { id: counterId }],
      ])),
    };
    generator = new AsientosGeneratorService(
      {} as any,
      {} as any,
      planCuentas as any,
    );
    generarAsiento = jest.spyOn(generator, 'generarAsiento').mockResolvedValue({
      id: '47400000-0000-4000-8000-000000000099',
    } as any);
    marcarFallido = jest.spyOn(generator as any, 'marcarEventoComoFallido')
      .mockResolvedValue(undefined);
  });

  it('registra retiro Dr contrapartida / Cr caja con importe local y source_event_id estable', async () => {
    await generator.generarAsientoOperacionCaja474(payload());

    expect(generarAsiento).toHaveBeenCalledWith(
      tenantId,
      new Date('2026-08-10'),
      'Operación Caja 474',
      [
        { cuenta_id: counterId, debe: 240, haber: 0, concepto: 'Operación Caja 474' },
        { cuenta_id: cashId, debe: 0, haber: 240, concepto: 'Operación Caja 474' },
      ],
      'CAJA-474-QA',
      '47400000-0000-4000-8000-000000000091',
    );
  });

  it('registra ingreso manual Dr caja / Cr ingreso sin inferir una cuenta mutable', async () => {
    await generator.generarAsientoOperacionCaja474(payload({
      tipo_evento: 'caja.movimiento_manual.registrado',
      tipo: 'INGRESO',
      cuentaContrapartidaCodigo: '75999',
    }));

    expect(generarAsiento).toHaveBeenCalledWith(
      tenantId,
      expect.any(Date),
      'Operación Caja 474',
      [
        { cuenta_id: cashId, debe: 240, haber: 0, concepto: 'Operación Caja 474' },
        { cuenta_id: counterId, debe: 0, haber: 240, concepto: 'Operación Caja 474' },
      ],
      'CAJA-474-QA',
      '47400000-0000-4000-8000-000000000091',
    );
  });

  it('omite un cambio de turno cuadrado y no crea un asiento de importe cero', async () => {
    const result = await generator.generarAsientoOperacionCaja474(payload({
      tipo_evento: 'caja.cambio_turno.completado',
      diferencia: 0,
      monto: 0,
      montoOrigen: 0,
      cuentaContrapartidaId: '',
      cuentaContrapartidaCodigo: '',
    }));

    expect(result).toBeNull();
    expect(planCuentas.obtenerCuentasPorCodigos).not.toHaveBeenCalled();
    expect(generarAsiento).not.toHaveBeenCalled();
  });

  it.each([
    ['ownership durable ausente', { accountingHandledByOutbox: false }],
    ['valuación local alterada', { monto: 239 }],
    ['cuenta congelada ajena al tenant', { cuentaContrapartidaId: '47400000-0000-4000-8000-000000000099' }],
  ])('rechaza %s y marca el evento para retry', async (_label, overrides) => {
    await expect(generator.generarAsientoOperacionCaja474(payload(overrides)))
      .rejects.toThrow();
    expect(generarAsiento).not.toHaveBeenCalled();
    expect(marcarFallido).toHaveBeenCalledWith(
      '47400000-0000-4000-8000-000000000091',
      expect.stringContaining('Caja 474'),
    );
  });

  it('el listener conserva tenant, event_id y tipo antes de verificar el asiento', async () => {
    const accounting = {
      generarAsientoOperacionCaja474: jest.fn().mockResolvedValue({ id: 'asiento-474' }),
    };
    const listener = new ContabilidadEventsListener(
      accounting as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const verificar = jest.fn().mockResolvedValue({ id: 'asiento-474' });
    (listener as any).verificarAsientoCreado = verificar;

    await (listener as any).handleOperacionCaja474({
      event_type: 'caja.retiro.registrado',
      event_id: '47400000-0000-4000-8000-000000000091',
      aggregate_id: '47400000-0000-4000-8000-000000000081',
      created_at: '2026-08-10T12:00:00.000Z',
      event_data: {
        tenantId,
        monto: 240,
        montoOrigen: 200,
        tipoCambio: 1.2,
        accountingHandledByOutbox: true,
      },
    });

    expect(accounting.generarAsientoOperacionCaja474).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        event_id: '47400000-0000-4000-8000-000000000091',
        tipo_evento: 'caja.retiro.registrado',
        referencia: 'CAJA-474-47400000-0000-4000-8000-000000000081',
      }),
    );
    expect(verificar).toHaveBeenCalledWith(
      tenantId,
      '47400000-0000-4000-8000-000000000091',
      'CAJA-474-47400000-0000-4000-8000-000000000081',
    );
  });

  it('mantiene los tres eventos en el allowlist del worker contable', () => {
    expect(ACCOUNTING_EVENT_TYPES).toEqual(expect.arrayContaining([
      'caja.movimiento_manual.registrado',
      'caja.retiro.registrado',
      'caja.cambio_turno.completado',
    ]));
  });
});
