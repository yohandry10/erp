import { ConflictException } from '@nestjs/common';
import { writerFailure } from './ventas-errors';

describe('Precio comercial revisado', () => {
  it('pide una nueva revisión del total ante un cambio concurrente de regla', () => {
    const error = writerFailure({ code: '40001', message: 'COMMERCIAL_PRICE_STALE' }, 'No se pudo crear');
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.message).toBe('Los precios cambiaron desde la revisión. Revisa el total vigente y vuelve a confirmar.');
  });
});
