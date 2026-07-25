import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CpeService } from '../src/modules/cpe/cpe.service';
import { ComunicacionBajaService } from '../src/modules/cpe/comunicacion-baja.service';
import { GreService } from '../src/modules/gre/gre.service';
import { OseService, SunatResponse } from '../src/modules/ose/ose.service';

type SmokeStep = {
  step: string;
  fileName?: string;
  ticket?: string;
  signedXmlSha256?: string;
  signedXmlHashCpe?: string;
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
const TENANT_ID = 'sunat-beta-smoke';

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
    ['REQUIRE_REAL_FISCAL_CERTIFICATE', 'true'],
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

function buildSupabaseStub() {
  const terminal = {
    maybeSingle: async () => ({ data: { ruc: BETA_RUC, razon_social: 'EMPRESA DEMO SUNAT' }, error: null }),
    single: async () => ({ data: null, error: { message: 'No tenant certificate in smoke' } }),
  };

  const chain: any = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    update: () => chain,
    insert: () => chain,
    in: () => chain,
    maybeSingle: terminal.maybeSingle,
    single: terminal.single,
  };

  return {
    getClient: () => chain,
    update: async () => ({ data: null, error: null }),
  };
}

function sha256(value: string): string {
  return require('crypto').createHash('sha256').update(value).digest('hex').toUpperCase();
}

function redactResponse(response: SunatResponse): SmokeStep['response'] {
  const { cdr, ...rest } = response;
  return {
    ...rest,
    cdrSha256: cdr ? sha256(cdr) : undefined,
    cdrLength: cdr?.length,
  };
}

function yyyymmdd(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeCpeDto(tipoDocumento: '01' | '03', serie: string, numero: number) {
  const totalGravadas = 10;
  const totalIgv = 1.8;
  const totalVenta = 11.8;

  return {
    tipo_documento: tipoDocumento,
    serie,
    numero,
    fecha_emision: `${todayIso()}T10:00:00Z`,
    fecha_vencimiento: `${todayIso()}T10:00:00Z`,
    moneda: 'PEN',
    codigo_establecimiento: '0000',
    ruc_emisor: BETA_RUC,
    razon_social_emisor: 'EMPRESA DEMO SUNAT',
    direccion_emisor: 'AV DEMO 123',
    tipo_documento_receptor: tipoDocumento === '01' ? '6' : '1',
    documento_receptor: tipoDocumento === '01' ? '20600600600' : '00000000',
    razon_social_receptor: tipoDocumento === '01' ? 'CLIENTE DEMO SAC' : 'CLIENTE BOLETA',
    direccion_receptor: 'AV CLIENTE 456',
    total_gravadas: totalGravadas,
    total_igv: totalIgv,
    total_venta: totalVenta,
    condicion_pago: 'CONTADO',
    items: [
      {
        codigo: 'SMOKE-001',
        descripcion: 'Servicio de prueba SUNAT beta',
        cantidad: 1,
        unidad: 'NIU',
        precio_unitario: totalGravadas,
        valor_venta: totalGravadas,
        igv: totalIgv,
        precio_venta: totalVenta,
        tipo_afectacion_igv: '10',
      },
    ],
  } as any;
}

async function waitForTicket(service: OseService, ticket: string, attempts = 4): Promise<SunatResponse[]> {
  const responses: SunatResponse[] = [];
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    responses.push(await service.consultarTicket(ticket));
    if (responses[responses.length - 1].success || !['98', '99', '0127'].includes(responses[responses.length - 1].codigoRespuesta)) {
      break;
    }
  }
  return responses;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (process.env.SUNAT_ENVIRONMENT === 'produccion') {
    throw new Error('Este smoke se niega a correr con SUNAT_ENVIRONMENT=produccion.');
  }

  const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
  const demoPfx = path.join(workspaceRoot, 'certs', 'demo.pfx');
  if (!fs.existsSync(demoPfx)) {
    throw new Error(`No existe certificado demo requerido para SUNAT beta: ${demoPfx}`);
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomInt(1000, 9999)}`;
  const outDir = path.join(workspaceRoot, 'docs', 'audits', 'artifacts', 'sunat-beta-ra-rc-gre', runId);
  fs.mkdirSync(outDir, { recursive: true });

  const config = new StaticConfigService({
    SUNAT_DEBUG_RAW_RESPONSES_DIR: path.join(outDir, 'raw-soap-responses'),
  }) as unknown as ConfigService;
  const oseService = new OseService(config, circuitBreaker as any);
  const supabase = buildSupabaseStub();
  const cpeService = new CpeService(
    supabase as any,
    config,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  ) as any;
  const bajaService = new ComunicacionBajaService(supabase as any, oseService, config) as any;
  const greEventBus = {
    on: () => undefined,
    emit: () => undefined,
    eventEmitter: { eventNames: () => [] },
  };
  const greService = new GreService(supabase as any, greEventBus as any, {} as any, oseService, {} as any) as any;

  const steps: SmokeStep[] = [];
  const stamp = randomInt(10000000, 99999999);

  let externalSendCount = 0;
  async function runStep(step: string, fileName: string, xml: string, send: () => Promise<SunatResponse>) {
    if (externalSendCount > 0) {
      await sleep(6000);
    }
    externalSendCount += 1;

    fs.writeFileSync(path.join(outDir, `${fileName}.unsigned.xml`), xml, 'utf8');
    const prepared = (oseService as any).prepareXmlForSend(xml) as { xmlSigned: string; hash: string };
    fs.writeFileSync(path.join(outDir, `${fileName}.signed.xml`), prepared.xmlSigned, 'utf8');
    const response = await send();
    steps.push({
      step,
      fileName,
      ticket: response.ticket,
      signedXmlSha256: sha256(prepared.xmlSigned),
      signedXmlHashCpe: prepared.hash,
      response: redactResponse(response),
    });
    return response;
  }

  const invoiceNumber = stamp;
  const invoiceDto = makeCpeDto('01', 'F001', invoiceNumber);
  const invoiceXml = cpeService.generateXmlContent(invoiceDto);
  await runStep('base-factura-para-ra', `${BETA_RUC}-01-F001-${invoiceNumber}`, invoiceXml, () =>
    oseService.enviarCpe(invoiceXml, `${BETA_RUC}-01-F001-${invoiceNumber}`),
  );

  const raId = `RA-${yyyymmdd()}-${String(stamp).slice(-5)}`;
  const raXml = await bajaService.generarXmlComunicacionBaja(
    { numero_comunicacion: raId, fecha_comunicacion: todayIso(), fecha_generacion: todayIso() },
    [{ tipo_documento: '01', serie: 'F001', numero: invoiceNumber }],
    'ANULACION DE OPERACION DE PRUEBA BETA',
    TENANT_ID,
  );
  const raFile = `${BETA_RUC}-${raId}`;
  const raResponse = await runStep('ra-sendSummary', raFile, raXml, () => oseService.enviarResumen(raXml, raFile));
  if (raResponse.ticket) {
    const ticketResponses = await waitForTicket(oseService, raResponse.ticket);
    ticketResponses.forEach((response, index) => {
      steps.push({
        step: `ra-getStatus-${index + 1}`,
        ticket: raResponse.ticket,
        response: redactResponse(response),
      });
    });
  }

  const boletaNumber = stamp + 1;
  const boletaDto = makeCpeDto('03', 'B001', boletaNumber);
  const boletaXml = cpeService.generateXmlContent(boletaDto);
  await runStep('base-boleta-para-rc', `${BETA_RUC}-03-B001-${boletaNumber}`, boletaXml, () =>
    oseService.enviarCpe(boletaXml, `${BETA_RUC}-03-B001-${boletaNumber}`),
  );

  const rcId = `RC-${yyyymmdd()}-${String(stamp + 1).slice(-5)}`;
  const rcXml = await bajaService.generarXmlResumenDiario(
    { numero_resumen: rcId, fecha_referencia: todayIso(), fecha_generacion: todayIso() },
    [{
      tipo_documento: '03',
      serie: 'B001',
      numero: boletaNumber,
      tipo_documento_receptor: '1',
      documento_receptor: '00000000',
      moneda: 'PEN',
      total_gravadas: 10,
      total_igv: 1.8,
      total_venta: 11.8,
      tipo_operacion_resumen: '1',
    }],
    TENANT_ID,
  );
  const rcFile = `${BETA_RUC}-${rcId}`;
  const rcResponse = await runStep('rc-sendSummary', rcFile, rcXml, () => oseService.enviarResumen(rcXml, rcFile));
  if (rcResponse.ticket) {
    const ticketResponses = await waitForTicket(oseService, rcResponse.ticket);
    ticketResponses.forEach((response, index) => {
      steps.push({
        step: `rc-getStatus-${index + 1}`,
        ticket: rcResponse.ticket,
        response: redactResponse(response),
      });
    });
  }

  const greNumber = `T001-${stamp + 2}`;
  const greXml = greService.generateGreXmlUbl({
    emisor: {
      ruc: BETA_RUC,
      razonSocial: 'EMPRESA DEMO SUNAT',
      nombreComercial: 'EMPRESA DEMO',
      direccion: 'AV ORIGEN 123',
      ubigeo: '150101',
      departamento: 'LIMA',
      provincia: 'LIMA',
      distrito: 'LIMA',
    },
    receptor: {
      docTipo: '6',
      docNumero: '20600600600',
      razonSocial: 'CLIENTE DEMO SAC',
      direccion: 'AV DESTINO 456',
    },
    gre: {
      numero: greNumber,
      motivo: 'VENTA',
      modalidad: 'TRANSPORTE_PUBLICO',
      peso_total: 12.5,
      fecha_traslado: new Date(Date.now() + 86400000).toISOString(),
      transportista: 'TRANSPORTES DEMO SAC',
      transportista_documento: '20555555555',
      datos_adicionales: { destinoUbigeo: '150102' },
    },
    detalles: [{ id: 1, descripcion: 'Producto prueba GRE beta', cantidad: 1, unidad: 'NIU' }],
  });
  await runStep('gre-sendBill', `${BETA_RUC}-09-${greNumber}`, greXml, () =>
    oseService.enviarGre(greXml, `${BETA_RUC}-09-${greNumber}`),
  );

  const manifest = {
    runId,
    executedAt: new Date().toISOString(),
    environment: 'homologacion',
    endpoints: 'SUNAT beta defaults from OseService',
    ruc: BETA_RUC,
    username: BETA_USER,
    productionUsed: false,
    artifactDirectory: outDir,
    steps,
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
