import { BadRequestException, ConflictException } from '@nestjs/common';
import { RetencionesService } from './retenciones.service';
import {
  OrigenAjusteFiscal,
  TipoAjusteFiscal,
} from './dto/retenciones-input.dto';

describe('RetencionesService 465', () => {
  const rpc = jest.fn();
  const getClient = jest.fn(() => ({ rpc }));
  let service: RetencionesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RetencionesService({ getClient } as any);
  });

  it('calcula con Decimal y distingue el efecto de una percepción', () => {
    expect(service.calcularAjuste({
      tipo: TipoAjusteFiscal.RETENCION,
      base_calculo: 2000.15,
      tasa: 8,
    })).toMatchObject({ monto: 160.01, saldo_resultante: 1840.14, efecto_saldo: 'REDUCE' });

    expect(service.calcularAjuste({
      tipo: TipoAjusteFiscal.PERCEPCION,
      base_calculo: 100,
      tasa: 2,
    })).toMatchObject({ monto: 2, saldo_resultante: 102, efecto_saldo: 'AUMENTA' });
  });

  it('envía tenant, actor y key explícitos al writer atómico', async () => {
    rpc.mockResolvedValue({ data: { id: 'ajuste-1', idempotent: false }, error: null });
    await service.registrarAjuste('tenant-1', 'actor-1', {
      origen: OrigenAjusteFiscal.PROVEEDOR,
      tipo: TipoAjusteFiscal.DETRACCION,
      cuenta_id: '11111111-1111-4111-8111-111111111111',
      monto: 30,
      base_calculo: 1000,
      tasa: 3,
      moneda: 'pen',
      fecha: '2026-08-10',
      referencia: ' OP-1 ',
      idempotency_key: 'ajuste-fiscal-1',
    });

    expect(rpc).toHaveBeenCalledWith('registrar_ajuste_fiscal_financiero_tx', {
      p_tenant_id: 'tenant-1',
      p_cuenta_id: '11111111-1111-4111-8111-111111111111',
      p_actor_id: 'actor-1',
      p_idempotency_key: 'ajuste-fiscal-1',
      p_payload: expect.objectContaining({ moneda: 'PEN', referencia: 'OP-1', monto: 30 }),
    });
  });

  it('no permite inventar un anticipo durante su aplicación', async () => {
    await expect(service.registrarAjuste('tenant-1', 'actor-1', {
      origen: OrigenAjusteFiscal.CLIENTE,
      tipo: TipoAjusteFiscal.ANTICIPO,
      cuenta_id: '11111111-1111-4111-8111-111111111111',
      monto: 20,
      moneda: 'PEN',
      fecha: '2026-08-10',
      idempotency_key: 'anticipo-aplicacion-1',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('expone conflicto cuando una key se reutiliza con otra huella', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'FISCAL_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_ADJUSTMENT' },
    });
    await expect(service.registrarAjuste('tenant-1', 'actor-1', {
      origen: OrigenAjusteFiscal.PROVEEDOR,
      tipo: TipoAjusteFiscal.RETENCION,
      cuenta_id: '11111111-1111-4111-8111-111111111111',
      monto: 10,
      moneda: 'PEN',
      fecha: '2026-08-10',
      idempotency_key: 'ajuste-fiscal-duplicado',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('revierte un ajuste CxC con tenant, actor, motivo y key explícitos', async () => {
    rpc.mockResolvedValue({
      data: { operacion_id: 'ajuste-1', estado_operacion: 'ANULADO', idempotent: false },
      error: null,
    });

    await service.revertirAjusteCxc(
      'tenant-1',
      '11111111-1111-4111-8111-111111111111',
      'actor-1',
      { motivo: ' Anulación aceptada por SUNAT ', idempotency_key: 'reversa-ajuste-1' },
    );

    expect(rpc).toHaveBeenCalledWith('revertir_ajuste_fiscal_cxc_tx', {
      p_tenant_id: 'tenant-1',
      p_operacion_id: '11111111-1111-4111-8111-111111111111',
      p_payload: { motivo: 'Anulación aceptada por SUNAT' },
      p_actor_id: 'actor-1',
      p_idempotency_key: 'reversa-ajuste-1',
    });
  });

  it('exige un único tercero correspondiente al origen del anticipo', async () => {
    await expect(service.registrarAnticipo('tenant-1', 'actor-1', {
      origen: OrigenAjusteFiscal.CLIENTE,
      proveedor_id: '22222222-2222-4222-8222-222222222222',
      cuenta_bancaria_id: '33333333-3333-4333-8333-333333333333',
      monto: 50,
      moneda: 'PEN',
      fecha: '2026-08-10',
      idempotency_key: 'anticipo-invalido-1',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });
});
