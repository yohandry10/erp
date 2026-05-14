import { redactSensitiveData, redactSensitiveHeaders } from './redact-sensitive';

describe('redact-sensitive', () => {
  it('redacta cabeceras sensibles', () => {
    const headers = {
      Authorization: 'Bearer abcdef123456',
      'X-Api-Key': 'super-secret-key',
      Cookie: 'session=abc123',
      'content-type': 'application/json',
    };

    const sanitized = redactSensitiveHeaders(headers);

    expect(sanitized.Authorization).toBe('Bearer [REDACTED]');
    expect(sanitized['X-Api-Key']).toBe('[REDACTED]');
    expect(sanitized.Cookie).toBe('[REDACTED]');
    expect(sanitized['content-type']).toBe('application/json');
  });

  it('redacta campos sensibles en objetos anidados', () => {
    const payload = {
      requestId: 'abc',
      refresh_token: 'r1',
      nested: {
        user: {
          email: 'demo@erp.test',
          token: 'jwt-token',
        },
        meta: {
          csrf: 'xyz',
          metadata: 'ok',
        },
      },
    };

    const sanitized = redactSensitiveData(payload);

    expect(sanitized.refresh_token).toBe('[REDACTED]');
    expect((sanitized as any).nested.user.token).toBe('[REDACTED]');
    expect((sanitized as any).nested.meta.csrf).toBe('[REDACTED]');
    expect((sanitized as any).nested.user.email).toBe('demo@erp.test');
    expect((sanitized as any).nested.meta.metadata).toBe('ok');
  });

  it('mantiene campos no sensibles', () => {
    const payload = {
      tenant_id: 't1',
      role: 'admin',
      debug: false,
      attempts: 3,
    };

    const sanitized = redactSensitiveData(payload);

    expect((sanitized as any).tenant_id).toBe('t1');
    expect((sanitized as any).role).toBe('admin');
    expect((sanitized as any).debug).toBe(false);
    expect((sanitized as any).attempts).toBe(3);
  });
});
