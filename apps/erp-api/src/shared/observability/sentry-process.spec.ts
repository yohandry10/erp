import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('Sentry process behavior', () => {
  it('keeps an unhandled rejection fatal without sending a network request', () => {
    const script = `
      const monitoring = require('./src/shared/observability/sentry');
      const Sentry = require('@sentry/node');
      monitoring.configureErrorMonitoring('https://'+'a'.repeat(32)+'@o1.ingest.us.sentry.io/1','local-test');
      Sentry.getClient().getTransport().send = async () => ({statusCode:200});
      setTimeout(() => { Promise.reject(new Error('SyntheticUnhandledRejection')); }, 10);
      setTimeout(() => process.exit(42), 6000);
    `;
    const result = spawnSync(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), '-e', script], {
      cwd: path.resolve(__dirname, '../../..'), timeout: 15000, windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SyntheticUnhandledRejection');
  }, 20000);
});
