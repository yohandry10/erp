export type SunatPreflightSeverity = 'PASS' | 'WARN' | 'FAIL';

export interface SunatPreflightEnv {
  SUNAT_ENVIRONMENT?: string;
  EMPRESA_RUC?: string;
  SUNAT_CERT_EXPECTED_RUC?: string;
  SUNAT_CERT_RUC_MISMATCH_CONFIRMED?: string | boolean;
  SUNAT_CERT_RUC_MISMATCH_REASON?: string;
  SUNAT_GRE_TRANSPORT?: string;
  SUNAT_GRE_CLIENT_ID?: string;
  SUNAT_GRE_CLIENT_SECRET?: string;
  PFX_PATH?: string;
  PFX_PASS?: string;
  SUNAT_USERNAME?: string;
  SUNAT_PASSWORD?: string;
  OSE_USUARIO?: string;
  OSE_USERNAME?: string;
  OSE_PASSWORD?: string;
}

export interface SunatCertificatePreflightInfo {
  loaded: boolean;
  demoMode?: boolean;
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  expectedRuc?: string;
  rucMatches?: boolean;
  error?: string;
}

export interface SunatPreflightCheck {
  id: string;
  severity: SunatPreflightSeverity;
  message: string;
}

export interface SunatPreflightReport {
  generatedAt: string;
  productionUsed: false;
  sunatEnvironment: 'homologacion' | 'produccion' | 'sandbox';
  expectedRuc?: string;
  greTransport: 'soap' | 'rest';
  canAttemptProductionSend: boolean;
  checks: SunatPreflightCheck[];
  certificate: SunatCertificatePreflightInfo;
}

function isTruthy(value: string | boolean | undefined): boolean {
  return value === true || value === 'true' || value === '1' || value === 'yes';
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function normalizeSunatEnvironment(value: string | undefined): SunatPreflightReport['sunatEnvironment'] {
  return value === 'produccion' || value === 'sandbox' ? value : 'homologacion';
}

function normalizeGreTransport(value: string | undefined): SunatPreflightReport['greTransport'] {
  return value?.toLowerCase() === 'rest' ? 'rest' : 'soap';
}

function addCheck(
  checks: SunatPreflightCheck[],
  id: string,
  severity: SunatPreflightSeverity,
  message: string,
): void {
  checks.push({ id, severity, message });
}

export function evaluateSunatReadinessPreflight(
  env: SunatPreflightEnv,
  certificate: SunatCertificatePreflightInfo,
  generatedAt = new Date().toISOString(),
): SunatPreflightReport {
  const checks: SunatPreflightCheck[] = [];
  const sunatEnvironment = normalizeSunatEnvironment(env.SUNAT_ENVIRONMENT);
  const greTransport = normalizeGreTransport(env.SUNAT_GRE_TRANSPORT);
  const expectedRuc = env.SUNAT_CERT_EXPECTED_RUC?.trim() || env.EMPRESA_RUC?.trim();
  const mismatchConfirmed = isTruthy(env.SUNAT_CERT_RUC_MISMATCH_CONFIRMED);
  const mismatchReason = env.SUNAT_CERT_RUC_MISMATCH_REASON?.trim();

  if (env.SUNAT_ENVIRONMENT && !['homologacion', 'produccion', 'sandbox'].includes(env.SUNAT_ENVIRONMENT)) {
    addCheck(checks, 'sunat.environment_invalid', 'FAIL', 'SUNAT_ENVIRONMENT no es un ambiente reconocido.');
  }
  if (env.SUNAT_GRE_TRANSPORT && !['soap', 'rest'].includes(env.SUNAT_GRE_TRANSPORT.toLowerCase())) {
    addCheck(checks, 'gre.transport_invalid', 'FAIL', 'SUNAT_GRE_TRANSPORT debe ser soap o rest.');
  }

  if (sunatEnvironment === 'produccion') {
    addCheck(checks, 'sunat.environment', 'PASS', 'SUNAT_ENVIRONMENT esta en produccion; se aplican compuertas estrictas.');
  } else {
    addCheck(
      checks,
      'sunat.environment',
      'WARN',
      `SUNAT_ENVIRONMENT=${sunatEnvironment}; esta verificacion no habilita envio productivo.`,
    );
  }

  if (expectedRuc && /^\d{11}$/.test(expectedRuc)) {
    addCheck(checks, 'sunat.expected_ruc', 'PASS', `RUC esperado configurado: ${expectedRuc}.`);
  } else if (sunatEnvironment === 'produccion') {
    addCheck(
      checks,
      'sunat.expected_ruc',
      'FAIL',
      'Produccion SUNAT requiere SUNAT_CERT_EXPECTED_RUC o EMPRESA_RUC con 11 digitos.',
    );
  } else {
    addCheck(
      checks,
      'sunat.expected_ruc',
      'WARN',
      'No hay RUC esperado configurado; las pruebas beta pueden correr, pero produccion no debe habilitarse asi.',
    );
  }

  if (nonEmpty(env.PFX_PATH) && nonEmpty(env.PFX_PASS)) {
    addCheck(checks, 'certificate.config', 'PASS', 'PFX_PATH y PFX_PASS estan configurados.');
  } else if (sunatEnvironment === 'produccion') {
    addCheck(checks, 'certificate.config', 'FAIL', 'Produccion SUNAT requiere PFX_PATH y PFX_PASS o certificado por tenant validado antes de emitir.');
  } else {
    addCheck(checks, 'certificate.config', 'WARN', 'PFX global no esta completamente configurado; solo valido si se usa certificado por tenant o pruebas demo.');
  }

  const username = [env.SUNAT_USERNAME, env.OSE_USUARIO, env.OSE_USERNAME].find(nonEmpty)?.trim();
  const password = [env.SUNAT_PASSWORD, env.OSE_PASSWORD].find(nonEmpty);
  const hasCredentials = Boolean(username && password);
  addCheck(
    checks,
    'sunat.credentials',
    hasCredentials ? 'PASS' : sunatEnvironment === 'produccion' ? 'FAIL' : 'WARN',
    hasCredentials
      ? 'Usuario y clave SUNAT/OSE configurados; su autorización externa aún debe verificarse.'
      : 'Faltan usuario y clave SUNAT/OSE para transmitir.',
  );
  if (sunatEnvironment === 'produccion' && /MODDATOS$/i.test(username || '')) {
    addCheck(checks, 'sunat.beta_credentials', 'FAIL', 'El usuario de pruebas MODDATOS no permite operar en producción.');
  }

  if (!certificate.loaded) {
    const severity: SunatPreflightSeverity = sunatEnvironment === 'produccion' ? 'FAIL' : 'WARN';
    addCheck(
      checks,
      'certificate.load',
      severity,
      certificate.error ? `No se pudo cargar el certificado: ${certificate.error}` : 'No se cargo certificado local.',
    );
  } else if (certificate.demoMode) {
    const severity: SunatPreflightSeverity = sunatEnvironment === 'produccion' ? 'FAIL' : 'WARN';
    addCheck(checks, 'certificate.load', severity, 'El certificado cargado esta en modo demo; no sirve para produccion SUNAT.');
  } else {
    addCheck(checks, 'certificate.load', 'PASS', 'El PFX local carga con certificado real no-demo.');
  }

  if (certificate.loaded) {
    const now = Date.parse(generatedAt);
    const validFrom = Date.parse(certificate.validFrom || '');
    const validTo = Date.parse(certificate.validTo || '');
    const valid = Number.isFinite(now) && Number.isFinite(validFrom) && Number.isFinite(validTo)
      && validFrom <= now && now < validTo;
    addCheck(
      checks,
      'certificate.validity',
      valid ? 'PASS' : sunatEnvironment === 'produccion' ? 'FAIL' : 'WARN',
      valid
        ? 'El certificado está dentro de su período de vigencia.'
        : 'El certificado está vencido, aún no es vigente o no se pudo verificar su vigencia.',
    );
  }

  if (sunatEnvironment === 'produccion') {
    if (certificate.loaded && certificate.rucMatches === true) {
      addCheck(checks, 'certificate.ruc_match', 'PASS', 'El certificado contiene el RUC esperado.');
    } else if (certificate.loaded && certificate.rucMatches === false && mismatchConfirmed && mismatchReason) {
      addCheck(
        checks,
        'certificate.ruc_match',
        'WARN',
        'El certificado no contiene el RUC esperado; solo se permite por confirmacion escrita configurada.',
      );
    } else {
      addCheck(
        checks,
        'certificate.ruc_match',
        'FAIL',
        'El certificado fiscal no contiene el RUC esperado o no se pudo verificar. No emitir en produccion.',
      );
    }
  } else if (certificate.loaded && expectedRuc && certificate.rucMatches === false) {
    addCheck(
      checks,
      'certificate.ruc_match',
      'WARN',
      'El certificado local no contiene el RUC esperado; las pruebas no productivas pueden seguir, pero produccion debe permanecer bloqueada.',
    );
  }

  if (mismatchConfirmed && !mismatchReason) {
    addCheck(
      checks,
      'certificate.mismatch_confirmation',
      'FAIL',
      'SUNAT_CERT_RUC_MISMATCH_CONFIRMED requiere SUNAT_CERT_RUC_MISMATCH_REASON con referencia escrita.',
    );
  } else if (mismatchConfirmed) {
    addCheck(
      checks,
      'certificate.mismatch_confirmation',
      'WARN',
      'Existe confirmacion explicita de mismatch de RUC; conservar soporte escrito fuera del repositorio.',
    );
  }

  if (greTransport === 'rest') {
    if (nonEmpty(env.SUNAT_GRE_CLIENT_ID) && nonEmpty(env.SUNAT_GRE_CLIENT_SECRET)) {
      addCheck(checks, 'gre.rest_credentials', 'PASS', 'GRE REST tiene client_id/client_secret configurados.');
    } else {
      addCheck(
        checks,
        'gre.rest_credentials',
        'FAIL',
        'SUNAT_GRE_TRANSPORT=rest requiere SUNAT_GRE_CLIENT_ID y SUNAT_GRE_CLIENT_SECRET.',
      );
    }
  } else {
    addCheck(
      checks,
      'gre.transport',
      'WARN',
      'GRE usa SOAP; la evidencia beta actual deja SOAP no concluyente para GRE 2.0. Usar REST si el contribuyente emitira guias.',
    );
  }

  addCheck(
    checks,
    'ra_rc.ticket_cdr',
    'WARN',
    'Este preflight no consulta tickets ni valida CDR de RA/RC; la aceptación debe acreditarse con la respuesta oficial del lote.',
  );
  addCheck(checks, 'sunat.external_validation', 'WARN',
    'Diagnóstico local de configuración global: no verifica habilitación del RUC, configuración de cada tenant ni aceptación SUNAT/OSE. No acredita el go-live.');

  const hasFail = checks.some((check) => check.severity === 'FAIL');
  const canAttemptProductionSend = sunatEnvironment === 'produccion' && !hasFail;

  return {
    generatedAt,
    productionUsed: false,
    sunatEnvironment,
    expectedRuc,
    greTransport,
    canAttemptProductionSend,
    checks,
    certificate,
  };
}
