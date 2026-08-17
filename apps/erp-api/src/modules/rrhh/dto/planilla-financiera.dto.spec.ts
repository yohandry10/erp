import { validate } from 'class-validator';
import {
  ActualizarPlanillaBorradorDto,
  CrearPlanillaFinancieraDto,
  PagarPlanillaTesoreriaDto,
} from './planilla-financiera.dto';

const validateDto = async <T extends object>(Type: new () => T, value: Partial<T>) => {
  const instance = Object.assign(new Type(), value);
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
};

describe('DTO de ciclo financiero de planillas', () => {
  it('exige período e idempotencia en el alta', async () => {
    await expect(validateDto(CrearPlanillaFinancieraDto, {
      periodo: '2026-08',
      idempotency_key: '11111111-1111-4111-8111-111111111111',
    })).resolves.toHaveLength(0);
    await expect(validateDto(CrearPlanillaFinancieraDto, {
      periodo: '08/2026',
      idempotency_key: 'reintento-libre',
    })).resolves.not.toHaveLength(0);
  });

  it('no expone estados ni totales en una actualización de borrador', async () => {
    const errors = await validateDto(ActualizarPlanillaBorradorDto, {
      periodo: '2026-09',
      idempotency_key: '22222222-2222-4222-8222-222222222222',
      estado: 'pagada',
    } as any);
    expect(errors.some((error) => error.property === 'estado')).toBe(true);
  });

  it('valida el contrato tesorero del pago antes de la RPC', async () => {
    await expect(validateDto(PagarPlanillaTesoreriaDto, {
      metodo_pago: 'transferencia',
      idempotency_key: '33333333-3333-4333-8333-333333333333',
      cuenta_bancaria_id: '44444444-4444-4444-8444-444444444444',
      referencia: 'OP-2026-1',
      fecha_pago: '2026-08-13',
    })).resolves.toHaveLength(0);
    await expect(validateDto(PagarPlanillaTesoreriaDto, {
      metodo_pago: 'cheque' as any,
      idempotency_key: 'sin-uuid',
    })).resolves.not.toHaveLength(0);
  });
});
