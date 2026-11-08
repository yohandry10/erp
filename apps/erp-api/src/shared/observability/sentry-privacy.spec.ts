import { ErrorEvent } from '@sentry/node';
import { isSentryDsn, privateSentryError } from './sentry-privacy';

describe('Sentry error privacy boundary', () => {
  it('keeps source location while removing credentials, PII, request and source context', () => {
    const incoming = {
      event_id: 'a'.repeat(32), message: 'private business text',
      release: 'b'.repeat(40), environment: 'erp-local-verification',
      user: { id: 'private-user', email: 'private@example.test' },
      request: { url: 'https://example.test/?token=private', headers: { authorization: 'private' }, data: 'private body' },
      breadcrumbs: [{ message: 'private breadcrumb' }], extra: { password: 'private' },
      contexts: { trace: { data: { customer: 'private' } } }, tags: { tenant: 'private' },
      exception: { values: [{ type: 'TypeError', value: 'private exception', mechanism: { type: 'generic', handled: false, data: { private: true } },
        stacktrace: { frames: [{ filename: 'C:\\Users\\private\\app\\src\\broken.ts?token=private', function: 'fail', lineno: 12, colno: 3,
          pre_context: ['private source'], context_line: 'private source', vars: { secret: 'private' } }] } }] },
    } as unknown as ErrorEvent;
    const result = privateSentryError(incoming)!;
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'Unexpected application error', mechanism: { handled: false } });
    expect(result.exception.values[0].stacktrace.frames[0]).toEqual({ filename: 'src/broken.ts', function: 'fail', lineno: 12, colno: 3, in_app: false });
    expect(result.release).toBe('b'.repeat(40));
    expect(result.environment).toBe('erp-local-verification');
    expect(incoming.user.email).toBe('private@example.test');
  });

  it('drops arbitrary messages and invalid metadata rather than forwarding it', () => {
    expect(privateSentryError({ type: undefined, message: 'private' })).toBeNull();
    expect(privateSentryError({ type: undefined, exception: { values: [] } })).toBeNull();
    const result = privateSentryError({ type: undefined, release: 'private@example.test', environment: 'private@example.test', exception: { values: [{ type: 'private@example.test', value: 'private' }] } });
    expect(result).toMatchObject({ exception: { values: [{ type: 'Error' }] } });
    expect(result.release).toBeUndefined(); expect(result.environment).toBeUndefined();
  });

  it('bounds exception chains and frames', () => {
    const result = privateSentryError({ type: undefined, exception: { values: Array.from({ length: 10 }, () => ({ type: 'Error', stacktrace: { frames: Array.from({ length: 100 }, () => ({ filename: '/src/fail.ts' })) } })) } });
    expect(result.exception.values).toHaveLength(3);
    expect(result.exception.values.every(value => value.stacktrace.frames.length === 40)).toBe(true);
  });

  it.each(['http://example.test/1', 'https://private@example.test/1', 'https://o1.ingest.us.sentry.io/1', 'https://example.test/?dsn=private'])('rejects unexpected DSN destination %s', dsn => expect(isSentryDsn(dsn)).toBe(false));
  it('accepts only the configured HTTPS ingestion shape', () => expect(isSentryDsn(`https://${'a'.repeat(32)}@o1.ingest.us.sentry.io/1`)).toBe(true));
});
