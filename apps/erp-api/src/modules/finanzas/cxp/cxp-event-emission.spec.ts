import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { TesoreriaService } from '../tesoreria/tesoreria.service';
import { CxpService } from './cxp.service';

describe('CxpService - delegación exclusiva al writer de tesorería', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const cxpId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const cuentaBancariaId = '44444444-4444-4444-8444-444444444444';
  const sesionCajaId = '55555555-5555-4555-8555-555555555555';

  let service: CxpService;
  let tesoreria: { registrarPago: jest.Mock };
  let eventBus: { emitPagoProveedorRegistrado: jest.Mock; emitFacturaProveedorRegistrada: jest.Mock };
  let supabase: { getClient: jest.Mock };

  beforeEach(async () => {
    tesoreria = { registrarPago: jest.fn() };
    eventBus = {
      emitPagoProveedorRegistrado: jest.fn(),
      emitFacturaProveedorRegistrada: jest.fn(),
    };
    supabase = { getClient: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CxpService,
        { provide: SupabaseService, useValue: supabase },
        { provide: EventBusService, useValue: eventBus },
        {
          provide: RetencionesValidationService,
          useValue: {
            obtenerConfiguracionEmpresa: jest.fn(),
            validarCalculoAjustes: jest.fn(),
            validarMontoPendiente: jest.fn(),
          },
        },
        { provide: TesoreriaService, useValue: tesoreria },
      ],
    }).compile();

    service = module.get(CxpService);
  });

  it('delega una sola vez todos los datos del pago bancario y conserva la respuesta atómica', async () => {
    const writerResult = {
      success: true,
      data: {
        cxp: { id: cxpId, estado: 'PARCIAL', saldo: 500 },
        pago: { pago_id: '66666666-6666-4666-8666-666666666666' },
        movimiento_bancario: { id: '77777777-7777-4777-8777-777777777777' },
        valuacion: { diferencia_cambio: 25 },
      },
    };
    tesoreria.registrarPago.mockResolvedValue(writerResult);

    const result = await service.aplicarPago(
      tenantId,
      cxpId,
      {
        monto: 500,
        fecha_pago: '2026-08-09',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: cuentaBancariaId,
        referencia: 'OP-CXP-001',
        observaciones: 'Pago parcial',
        idempotency_key: 'cxp-intento-001',
      },
      userId,
    );

    expect(tesoreria.registrarPago).toHaveBeenCalledTimes(1);
    expect(tesoreria.registrarPago).toHaveBeenCalledWith(
      tenantId,
      {
        cxp_id: cxpId,
        monto: 500,
        fecha_pago: '2026-08-09',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: cuentaBancariaId,
        sesion_caja_id: undefined,
        referencia: 'OP-CXP-001',
        observaciones: 'Pago parcial',
        idempotency_key: 'cxp-intento-001',
      },
      userId,
    );
    expect(result).toBe(writerResult);
    expect(supabase.getClient).not.toHaveBeenCalled();
    expect(eventBus.emitPagoProveedorRegistrado).not.toHaveBeenCalled();
  });

  it('propaga sesión de caja e idempotencia para pagos en efectivo', async () => {
    tesoreria.registrarPago.mockResolvedValue({ success: true, data: {} });

    await service.aplicarPago(
      tenantId,
      cxpId,
      {
        monto: 100,
        fecha_pago: '2026-08-09',
        metodo_pago: 'EFECTIVO',
        sesion_caja_id: sesionCajaId,
        idempotency_key: 'cxp-efectivo-001',
      },
      userId,
    );

    expect(tesoreria.registrarPago).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        sesion_caja_id: sesionCajaId,
        idempotency_key: 'cxp-efectivo-001',
      }),
      userId,
    );
    expect(eventBus.emitPagoProveedorRegistrado).not.toHaveBeenCalled();
  });

  it('falla cerrado si el writer no está disponible', async () => {
    (service as any).tesoreriaService = undefined;

    await expect(
      service.aplicarPago(
        tenantId,
        cxpId,
        {
          monto: 100,
          fecha_pago: '2026-08-09',
          metodo_pago: 'EFECTIVO',
          idempotency_key: 'cxp-efectivo-002',
        },
        userId,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(supabase.getClient).not.toHaveBeenCalled();
    expect(eventBus.emitPagoProveedorRegistrado).not.toHaveBeenCalled();
  });

  it('propaga el rechazo del writer sin ejecutar un fallback ni emitir eventos JS', async () => {
    tesoreria.registrarPago.mockRejectedValue(new Error('outbox no disponible'));

    await expect(
      service.aplicarPago(
        tenantId,
        cxpId,
        {
          monto: 100,
          fecha_pago: '2026-08-09',
          metodo_pago: 'TRANSFERENCIA',
          cuenta_bancaria_id: cuentaBancariaId,
          referencia: 'OP-CXP-FAIL',
          idempotency_key: 'cxp-intento-fallido',
        },
        userId,
      ),
    ).rejects.toThrow('outbox no disponible');
    expect(tesoreria.registrarPago).toHaveBeenCalledTimes(1);
    expect(supabase.getClient).not.toHaveBeenCalled();
    expect(eventBus.emitPagoProveedorRegistrado).not.toHaveBeenCalled();
  });
});
