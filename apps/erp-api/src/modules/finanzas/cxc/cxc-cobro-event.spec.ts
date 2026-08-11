import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { CxcService } from './cxc.service';

describe('CxcService - writer transaccional de cobros', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const cuentaId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const cuentaBancariaId = '44444444-4444-4444-8444-444444444444';
  const sesionCajaId = '55555555-5555-4555-8555-555555555555';

  let service: CxcService;
  let eventBus: { emitPagoFactura: jest.Mock; emitCobroRegistrado: jest.Mock };
  let client: { rpc?: jest.Mock; from: jest.Mock };

  const dtoBase = {
    monto: 250,
    fecha_pago: '2026-08-09',
    metodo_pago: 'TRANSFERENCIA',
    cuenta_bancaria_id: cuentaBancariaId,
    referencia: 'OP-CXC-001',
    idempotency_key: 'cxc-intento-001',
  };

  beforeEach(async () => {
    client = {
      rpc: jest.fn(),
      from: jest.fn(),
    };
    eventBus = {
      emitPagoFactura: jest.fn(),
      emitCobroRegistrado: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CxcService,
        { provide: SupabaseService, useValue: { getClient: () => client } },
        { provide: EventBusService, useValue: eventBus },
        {
          provide: AuditService,
          useValue: { registrarCambio: jest.fn(), logIntegration: jest.fn() },
        },
        {
          provide: RetencionesValidationService,
          useValue: {
            validarCalculoAjustes: jest.fn(),
            validarMontoPendiente: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CxcService);
  });

  it('delega el cobro completo a registrar_cxc_pago_tx y devuelve sus evidencias', async () => {
    client.rpc!.mockResolvedValue({
      data: {
        idempotent: false,
        cuenta: { id: cuentaId, estado: 'PARCIAL', monto_pendiente: 750 },
        pago: { id: '66666666-6666-4666-8666-666666666666' },
        movimiento_bancario: { id: '77777777-7777-4777-8777-777777777777' },
        movimiento_caja: null,
        valuacion: {
          tipo_cambio_origen: 3.7,
          tipo_cambio_liquidacion: 3.8,
          monto_contabilizado: 925,
          monto_liquidacion: 950,
          diferencia_cambio: 25,
        },
      },
      error: null,
    });

    const result = await service.registrarPago(tenantId, cuentaId, dtoBase, userId);

    expect(client.rpc).toHaveBeenCalledWith('registrar_cxc_pago_tx', {
      p_tenant_id: tenantId,
      p_cuenta_id: cuentaId,
      p_pago: expect.objectContaining({
        monto: 250,
        fecha_pago: '2026-08-09',
        metodo_pago: 'TRANSFERENCIA',
        cuenta_bancaria_id: cuentaBancariaId,
        referencia: 'OP-CXC-001',
        idempotency_key: 'cxc-intento-001',
      }),
      p_user_id: userId,
    });
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: cuentaId,
        pago: expect.objectContaining({ id: expect.any(String) }),
        movimiento_bancario: expect.objectContaining({ id: expect.any(String) }),
        movimiento_caja: null,
        valuacion: expect.objectContaining({ diferencia_cambio: 25 }),
        idempotent_replay: false,
      }),
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(eventBus.emitPagoFactura).not.toHaveBeenCalled();
    expect(eventBus.emitCobroRegistrado).not.toHaveBeenCalled();
  });

  it('propaga la sesión para efectivo sin ejecutar escrituras JS', async () => {
    client.rpc!.mockResolvedValue({
      data: {
        idempotent: true,
        cuenta: { id: cuentaId },
        pago: { id: '66666666-6666-4666-8666-666666666666' },
        movimiento_caja: { id: '88888888-8888-4888-8888-888888888888' },
      },
      error: null,
    });

    const result = await service.registrarPago(
      tenantId,
      cuentaId,
      {
        ...dtoBase,
        metodo_pago: 'EFECTIVO',
        cuenta_bancaria_id: undefined,
        referencia: undefined,
        sesion_caja_id: sesionCajaId,
      },
      userId,
    );

    expect(client.rpc).toHaveBeenCalledWith(
      'registrar_cxc_pago_tx',
      expect.objectContaining({
        p_pago: expect.objectContaining({ sesion_caja_id: sesionCajaId }),
      }),
    );
    expect(result.data.idempotent_replay).toBe(true);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('falla cerrado si el cliente no expone el writer RPC', async () => {
    client.rpc = undefined;

    await expect(service.registrarPago(tenantId, cuentaId, dtoBase, userId)).rejects.toThrow(
      'writer transaccional registrar_cxc_pago_tx no esta disponible',
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it('exige actor UUID e idempotency key antes de invocar el writer', async () => {
    await expect(service.registrarPago(tenantId, cuentaId, dtoBase, 'actor-invalido')).rejects.toThrow(
      'actor autenticado es obligatorio',
    );
    await expect(
      service.registrarPago(tenantId, cuentaId, { ...dtoBase, idempotency_key: '' }, userId),
    ).rejects.toThrow('llave de idempotencia es obligatoria');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('mapea cuenta inexistente a 404 y los rechazos semánticos a 400', async () => {
    client.rpc!.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'Cuenta por cobrar no encontrada' },
    });
    await expect(service.registrarPago(tenantId, cuentaId, dtoBase, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    client.rpc!.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message: 'Llave de idempotencia reutilizada con parámetros diferentes',
      },
    });
    await expect(service.registrarPago(tenantId, cuentaId, dtoBase, userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rechaza monto y fecha inválidos antes de tocar persistencia', async () => {
    await expect(
      service.registrarPago(tenantId, cuentaId, { ...dtoBase, monto: 10.005 }, userId),
    ).rejects.toThrow('máximo 2 decimales');
    await expect(
      service.registrarPago(tenantId, cuentaId, { ...dtoBase, fecha_pago: '2026-02-31' }, userId),
    ).rejects.toThrow('fecha de pago es inválida');
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });
});
