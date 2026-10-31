import { BadRequestException } from '@nestjs/common';
import { UuidParamPipe } from './uuid-param.pipe';

describe('UuidParamPipe', () => {
  const pipe = new UuidParamPipe();
  const metadata = { type: 'param' as const, data: 'id' };

  it.each([
    '6520d990-6878-48cc-8ec4-7ebba1bdb169',
    '6520D990-6878-48CC-8EC4-7EBBA1BDB169',
    '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  ])('conserva un UUID válido sin cambiar su identidad: %s', async id => {
    await expect(pipe.transform(id, metadata)).resolves.toBe(id);
  });

  it.each(['no-es-uuid', '', '123', "'; DELETE FROM productos; --"])(
    'rechaza un identificador inválido con 400 y texto en español: %s',
    async id => {
      const error = await pipe.transform(id, metadata).catch(caught => caught);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual(expect.objectContaining({
        message: 'El identificador no es válido',
      }));
    },
  );
});
