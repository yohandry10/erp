import * as path from 'node:path';

describe('generate-demo-pfx', () => {
  it('retrodata el inicio 24 horas para tolerar desfase de reloj', () => {
    const generator = require(
      path.resolve(__dirname, '../../../scripts/generate-demo-pfx.cjs'),
    ) as {
      createDemoCertificateValidity: (now: Date) => {
        notBefore: Date;
        notAfter: Date;
      };
      DEMO_CERTIFICATE_CLOCK_SKEW_MS: number;
    };
    const now = new Date('2026-08-25T19:30:00.000Z');

    const validity = generator.createDemoCertificateValidity(now);

    expect(generator.DEMO_CERTIFICATE_CLOCK_SKEW_MS).toBe(24 * 60 * 60 * 1000);
    expect(validity.notBefore.toISOString()).toBe('2026-08-24T19:30:00.000Z');
    expect(validity.notAfter.toISOString()).toBe('2036-08-25T19:30:00.000Z');
  });
});
