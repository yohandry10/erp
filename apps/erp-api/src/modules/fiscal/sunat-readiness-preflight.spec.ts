import { evaluateSunatReadinessPreflight } from './sunat-readiness-preflight';

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

  it('permite compuerta productiva solo cuando el certificado real contiene el RUC esperado', () => {
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
        rucMatches: true,
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
        severity: 'PASS',
      }),
    );
  });
});
