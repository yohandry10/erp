import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { XmlSigner } from '@erp-suite/crypto';
import {
  evaluateSunatReadinessPreflight,
  SunatCertificatePreflightInfo,
  SunatPreflightEnv,
  SunatPreflightReport,
} from '../src/modules/fiscal/sunat-readiness-preflight';

function loadEnvFiles(): void {
  const candidates = [
    path.join(getWorkspaceRoot(), '.env'),
    path.join(getWorkspaceRoot(), 'apps', 'erp-api', '.env'),
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  }
}

function getWorkspaceRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function toIsoDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return undefined;
}

function collectEnv(): SunatPreflightEnv {
  return {
    SUNAT_ENVIRONMENT: process.env.SUNAT_ENVIRONMENT,
    EMPRESA_RUC: process.env.EMPRESA_RUC,
    SUNAT_CERT_EXPECTED_RUC: process.env.SUNAT_CERT_EXPECTED_RUC,
    SUNAT_CERT_RUC_MISMATCH_CONFIRMED: process.env.SUNAT_CERT_RUC_MISMATCH_CONFIRMED,
    SUNAT_CERT_RUC_MISMATCH_REASON: process.env.SUNAT_CERT_RUC_MISMATCH_REASON,
    SUNAT_GRE_TRANSPORT: process.env.SUNAT_GRE_TRANSPORT,
    SUNAT_GRE_CLIENT_ID: process.env.SUNAT_GRE_CLIENT_ID,
    SUNAT_GRE_CLIENT_SECRET: process.env.SUNAT_GRE_CLIENT_SECRET,
    PFX_PATH: process.env.PFX_PATH,
    PFX_PASS: process.env.PFX_PASS,
  };
}

function inspectCertificate(env: SunatPreflightEnv): SunatCertificatePreflightInfo {
  if (!env.PFX_PATH?.trim() || !env.PFX_PASS?.trim()) {
    return {
      loaded: false,
      error: 'PFX_PATH/PFX_PASS no estan configurados en conjunto.',
    };
  }

  try {
    const signer = new XmlSigner({
      pfxPath: env.PFX_PATH,
      pfxPassword: env.PFX_PASS,
      expectedRuc: env.SUNAT_CERT_EXPECTED_RUC || env.EMPRESA_RUC,
      enforceRucInCertificate: false,
      allowDemoFallback: false,
    });
    const info = signer.getCertificateInfo();

    return {
      loaded: true,
      demoMode: Boolean(info.demoMode),
      subject: info.subject,
      issuer: info.issuer,
      serialNumber: info.serialNumber,
      validFrom: toIsoDate(info.validFrom),
      validTo: toIsoDate(info.validTo),
      expectedRuc: info.expectedRuc,
      rucMatches: info.rucMatches,
    };
  } catch (error) {
    return {
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeReport(report: SunatPreflightReport, outPath: string | undefined): void {
  if (!outPath) {
    return;
  }

  const resolved = path.isAbsolute(outPath) ? outPath : path.resolve(getWorkspaceRoot(), outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Reporte SUNAT preflight escrito en: ${resolved}`);
}

function printSummary(report: SunatPreflightReport): void {
  console.log('SUNAT readiness preflight');
  console.log(`- productionUsed: ${report.productionUsed}`);
  console.log(`- SUNAT_ENVIRONMENT: ${report.sunatEnvironment}`);
  console.log(`- expectedRuc: ${report.expectedRuc || '(no configurado)'}`);
  console.log(`- GRE transport: ${report.greTransport}`);
  console.log(`- canAttemptProductionSend: ${report.canAttemptProductionSend}`);

  for (const check of report.checks) {
    console.log(`[${check.severity}] ${check.id}: ${check.message}`);
  }
}

function main(): void {
  loadEnvFiles();

  const env = collectEnv();
  const certificate = inspectCertificate(env);
  const report = evaluateSunatReadinessPreflight(env, certificate);
  const outPath = getArgValue('--out') || process.env.SUNAT_PREFLIGHT_OUTPUT;

  printSummary(report);
  writeReport(report, outPath);

  if (report.checks.some((check) => check.severity === 'FAIL')) {
    process.exitCode = 1;
  }
}

main();
