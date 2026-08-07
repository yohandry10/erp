import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { OseService, SunatResponse } from '../src/modules/ose/ose.service';

type TicketInput = {
  type: 'RA' | 'RC';
  label: string;
  ticket: string;
};

type TicketResult = TicketInput & {
  response?: Omit<SunatResponse, 'cdr'> & { cdrSha256?: string; cdrLength?: number };
  error?: string;
};

const BETA_RUC = process.env.SUNAT_BETA_RUC?.trim() || '20100066603';
const BETA_USER = process.env.SUNAT_BETA_USERNAME?.trim();
const BETA_PASSWORD = process.env.SUNAT_BETA_PASSWORD?.trim();
const BETA_CERTIFICATE_PASSWORD = process.env.SUNAT_BETA_CERTIFICATE_PASSWORD?.trim();
const BETA_CERTIFICATE_PATH = process.env.SUNAT_BETA_CERTIFICATE_PATH?.trim() || 'certs/demo.pfx';

if (!BETA_USER || !BETA_PASSWORD || !BETA_CERTIFICATE_PASSWORD) {
  throw new Error(
    'Defina SUNAT_BETA_USERNAME, SUNAT_BETA_PASSWORD y SUNAT_BETA_CERTIFICATE_PASSWORD en el entorno; no se usan credenciales por defecto.',
  );
}
const SOURCE_ARTIFACT =
  'artifacts/audit-evidence/sunat-beta-ra-rc-gre/2026-06-17T07-04-03-049Z-1489/manifest.json';

const DEFAULT_TICKETS: TicketInput[] = [
  { type: 'RA', label: 'RA-20260617-34513', ticket: '1781679870729' },
  { type: 'RC', label: 'RC-20260617-34514', ticket: '1781679882872' },
];

class StaticConfigService {
  private readonly values = new Map<string, string>([
    ['SUNAT_ENVIRONMENT', 'homologacion'],
    ['SUNAT_USERNAME', BETA_USER],
    ['SUNAT_PASSWORD', BETA_PASSWORD],
    ['EMPRESA_RUC', BETA_RUC],
    ['EMPRESA_RAZON_SOCIAL', 'EMPRESA DEMO SUNAT'],
    ['PFX_PATH', BETA_CERTIFICATE_PATH],
    ['PFX_PASS', BETA_CERTIFICATE_PASSWORD],
    ['CERTIFICATE_PATH', BETA_CERTIFICATE_PATH],
    ['CERTIFICATE_PASSWORD', BETA_CERTIFICATE_PASSWORD],
  ]);

  constructor(extraValues: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(extraValues)) {
      this.values.set(key, value);
    }
  }

  get<T = string>(key: string, defaultValue?: T): T | undefined {
    return (this.values.get(key) as T | undefined) ?? defaultValue;
  }
}

const circuitBreaker = {
  registerCircuit: () => undefined,
  execute: async <T>(_: string, action: () => Promise<T>) => action(),
  getStats: () => ({}),
  forceClose: () => undefined,
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function redactResponse(response: SunatResponse): TicketResult['response'] {
  const { cdr, ...rest } = response;
  return {
    ...rest,
    cdrSha256: cdr ? sha256(cdr) : undefined,
    cdrLength: cdr?.length,
  };
}

function parseTickets(args: string[]): TicketInput[] {
  const ticketArgs = args
    .map((arg, index) => ({ arg, index }))
    .filter(({ arg }) => arg === '--ticket' || arg.startsWith('--ticket='));

  if (ticketArgs.length === 0) {
    return DEFAULT_TICKETS;
  }

  const tickets: TicketInput[] = [];
  for (const { arg, index } of ticketArgs) {
    const raw = arg.includes('=') ? arg.split('=').slice(1).join('=') : args[index + 1];
    if (!raw) {
      throw new Error('Formato invalido: use --ticket RA:1781679870729 o --ticket=RC:1781679882872.');
    }

    const [type, ticket] = raw.split(':');
    if ((type !== 'RA' && type !== 'RC') || !/^\d+$/.test(ticket || '')) {
      throw new Error(`Ticket invalido "${raw}". Formato esperado: RA:<numero> o RC:<numero>.`);
    }

    tickets.push({ type, label: `${type}-${ticket}`, ticket });
  }

  return tickets;
}

async function main() {
  if (process.env.SUNAT_ENVIRONMENT === 'produccion') {
    throw new Error('Este runner read-only se niega a correr con SUNAT_ENVIRONMENT=produccion.');
  }

  const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomInt(1000, 9999)}`;
  const outDir = path.join(workspaceRoot, 'docs', 'audits', 'artifacts', 'sunat-beta-ticket-readonly', runId);
  fs.mkdirSync(outDir, { recursive: true });

  const config = new StaticConfigService({
    SUNAT_DEBUG_RAW_RESPONSES_DIR: path.join(outDir, 'raw-soap-responses'),
  }) as unknown as ConfigService;
  const oseService = new OseService(config, circuitBreaker as any);
  const tickets = parseTickets(process.argv.slice(2));
  const results: TicketResult[] = [];

  for (const ticketInput of tickets) {
    try {
      const response = await oseService.consultarTicket(ticketInput.ticket);
      results.push({ ...ticketInput, response: redactResponse(response) });
    } catch (error) {
      results.push({
        ...ticketInput,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const manifest = {
    runId,
    executedAt: new Date().toISOString(),
    operation: 'getStatus-readonly',
    environment: 'homologacion',
    endpoints: 'SUNAT beta defaults from OseService',
    ruc: BETA_RUC,
    username: BETA_USER,
    productionUsed: false,
    sentDocuments: false,
    sourceArtifact: SOURCE_ARTIFACT,
    artifactDirectory: outDir,
    tickets: results,
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
