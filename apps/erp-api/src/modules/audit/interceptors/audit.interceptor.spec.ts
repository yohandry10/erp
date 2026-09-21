import { of, throwError, lastValueFrom } from 'rxjs';
import { ForbiddenException } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  const change = jest.fn();
  const interceptor = new AuditInterceptor({ registrarCambio: change } as any,
    { get: () => ({ entity: 'recepciones', action: 'UPDATE', includeResult: true }) } as any);
  const context = (user: object) => ({ getHandler: () => () => {}, switchToHttp: () => ({ getRequest: () => ({
    user, headers: { 'x-tenant-id': 'untrusted' }, params: {}, method: 'POST', url: '/recepciones?token=sensitive',
  }) }) }) as any;
  beforeEach(() => { change.mockReset().mockResolvedValue(undefined); });

  it('espera la persistencia antes de terminar la respuesta y conserva el id anidado', async () => {
    let finish!: () => void;
    change.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const result = { data: { id: 'receipt' } };
    let responded = false;
    const pending = lastValueFrom(interceptor.intercept(context({ id: 'actor', tenant_id: 'tenant' }), { handle: () => of(result) }))
      .then(value => { responded = true; return value; });
    await Promise.resolve();
    expect(responded).toBe(false);
    expect(change).toHaveBeenCalledWith('recepciones', 'UPDATE', 'actor', { new: result }, 'tenant', 'receipt',
      expect.objectContaining({ url: '/recepciones' }));
    finish();
    expect(await pending).toBe(result);
  });

  it('conserva el rechazo original aunque falle la auditoría complementaria', async () => {
    const failure = new ForbiddenException('Sin permiso');
    change.mockRejectedValue(new Error('DB unavailable'));
    await expect(lastValueFrom(interceptor.intercept(context({ id: 'actor', tenant_id: 'tenant' }),
      { handle: () => throwError(() => failure) }))).rejects.toBe(failure);
    expect(change.mock.calls[0][6].status).toBe('FAILED');
  });

  it('no atribuye acciones al tenant enviado en una cabecera', async () => {
    await lastValueFrom(interceptor.intercept(context({ id: 'actor' }), { handle: () => of({ ok: true }) }));
    expect(change).not.toHaveBeenCalled();
  });
});
