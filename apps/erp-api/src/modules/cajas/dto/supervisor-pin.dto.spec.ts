import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RotarPinSupervisorDto } from './supervisor-pin.dto';

describe('RotarPinSupervisorDto', () => {
  const validar = (payload: unknown) => validate(
    plainToInstance(RotarPinSupervisorDto, payload),
    { whitelist: true, forbidNonWhitelisted: true },
  );

  it('acepta únicamente un secreto de seis dígitos', async () => {
    await expect(validar({ pin: '481590' })).resolves.toHaveLength(0);
    await expect(validar({ pin: '12345' })).resolves.not.toHaveLength(0);
    await expect(validar({ pin: 'abcdef' })).resolves.not.toHaveLength(0);
    await expect(validar({ pin: 481590 })).resolves.not.toHaveLength(0);
  });

  it('rechaza tenant, actor, hash o versión inyectados en el body', async () => {
    const errores = await validar({
      pin: '481590',
      tenant_id: 'otro-tenant',
      actor_id: 'otro-actor',
      hash_pin: 'recuperable',
      pin_version: 99,
    });

    expect(errores.map((error) => error.property)).toEqual(expect.arrayContaining([
      'tenant_id',
      'actor_id',
      'hash_pin',
      'pin_version',
    ]));
  });
});
