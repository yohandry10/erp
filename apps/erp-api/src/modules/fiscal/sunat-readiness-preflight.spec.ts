import { evaluateSunatReadinessPreflight } from './sunat-readiness-preflight';
import type { SunatPreflightEnv, SunatCertificatePreflightInfo } from './sunat-readiness-preflight';

describe('evaluateSunatReadinessPreflight', () => {
  it('bloquea produccion cuando el certificado no contiene el RUC esperado', () => {
    const report = evaluateSunatReadinessPreflight(
      {
        SUNAT_ENVIRONMENT: 'produccion',
        EMPRESA_RUC: '20616053575',
        PFX_PATH: '/secure/cert.pfx',
        PFX_PASS: 'securepass',
      },
      {
        loaded: true,
        demoMode: false,
        expectedRuc: '20616053575',
        rucMatches: false,
      },
      '2026-06-17T00:00:00.000Z',
    );

    expect(report.canAttemptProductionSend).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'certificate.ruc_match',
        severity: 'FAIL',
      }),
    );
  });

  it('permite intentar envío con credenciales y certificado propio vigente, sin acreditar aceptación externa', () => {
    const report = evaluateSunatReadinessPreflight(
      {
        SUNAT_ENVIRONMENT: 'produccion',
        EMPRESA_RUC: '20616053575',
        PFX_PATH: '/secure/cert.pfx',
        PFX_PASS: 'securepass',
        SUNAT_USERNAME: '20616053575USUARIO',
        SUNAT_PASSWORD: 'test-local-only',
      },
      {
        loaded: true,
        demoMode: false,
        expectedRuc: '20616053575',
        rucMatches: true,
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2027-01-01T00:00:00.000Z',
      },
      '2026-06-17T00:00:00.000Z',
    );

    expect(report.canAttemptProductionSend).toBe(true);
    expect(report.checks.some((check) => check.severity === 'FAIL')).toBe(false);
  });

  it('exige credenciales API cuando GRE usa transporte REST', () => {
    const report = evaluateSunatReadinessPreflight(
      {
        SUNAT_ENVIRONMENT: 'homologacion',
        EMPRESA_RUC: '20616053575',
        PFX_PATH: '/secure/cert.pfx',
        PFX_PASS: 'securepass',
        SUNAT_GRE_TRANSPORT: 'rest',
      },
      {
        loaded: true,
        demoMode: false,
        expectedRuc: '20616053575',
        rucMatches: true,
      },
      '2026-06-17T00:00:00.000Z',
    );

    expect(report.canAttemptProductionSend).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'gre.rest_credentials',
        severity: 'FAIL',
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'ra_rc.ticket_cdr',
        severity: 'WARN',
      }),
    );
  });

  const productionEnv: SunatPreflightEnv = {
    SUNAT_ENVIRONMENT: 'produccion', EMPRESA_RUC: '20616053575',
    PFX_PATH: '/local/test.pfx', PFX_PASS: 'test-only',
    SUNAT_USERNAME: '20616053575USUARIO', SUNAT_PASSWORD: 'local-only',
  };
  const validCertificate: SunatCertificatePreflightInfo = {
    loaded: true, demoMode: false, rucMatches: true, expectedRuc: '20616053575',
    validFrom: '2026-01-01T00:00:00.000Z', validTo: '2027-01-01T00:00:00.000Z',
  };
  const generatedAt = '2026-09-05T12:00:00.000Z';

  it.each([
    { SUNAT_USERNAME: undefined },
    { SUNAT_PASSWORD: '  ' },
    { SUNAT_USERNAME: '20616053575MODDATOS' },
    { SUNAT_ENVIRONMENT: 'production' },
    { SUNAT_GRE_TRANSPORT: 'resst' },
  ])('bloquea configuración incompleta, beta o inválida: %j', (patch) => {
    const report = evaluateSunatReadinessPreflight({ ...productionEnv, ...patch }, validCertificate, generatedAt);
    expect(report.canAttemptProductionSend).toBe(false);
    expect(report.checks.some(check => check.severity === 'FAIL')).toBe(true);
  });

  it.each([
    { validTo: generatedAt },
    { validTo: '2026-01-02T00:00:00.000Z' },
    { validFrom: '2026-09-06T00:00:00.000Z' },
    { validFrom: undefined },
    { validTo: 'fecha inválida' },
  ])('bloquea certificado sin vigencia comprobable: %j', (patch) => {
    const report = evaluateSunatReadinessPreflight(productionEnv, { ...validCertificate, ...patch }, generatedAt);
    expect(report.canAttemptProductionSend).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'certificate.validity', severity: 'FAIL' }));
  });

  it('acepta aliases del runtime sin exponer secretos ni certificar RA/RC', () => {
    const report = evaluateSunatReadinessPreflight({
      ...productionEnv, SUNAT_USERNAME: undefined, SUNAT_PASSWORD: undefined,
      OSE_USERNAME: 'local-user', OSE_PASSWORD: 'private-local-password',
    }, validCertificate, generatedAt);
    expect(report.canAttemptProductionSend).toBe(true);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'ra_rc.ticket_cdr', severity: 'WARN' }));
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'sunat.external_validation', severity: 'WARN' }));
    expect(JSON.stringify(report)).not.toContain('private-local-password');
    expect(JSON.stringify(report)).not.toContain('local-user');
  });
});
