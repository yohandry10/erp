import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesRoot = join(repoRoot, 'scripts/ci/fixtures/dian-fev-1.9');
const manifestPath = join(fixturesRoot, 'manifest.json');
const outputDir = mkdtempSync(join(tmpdir(), 'erp-dian-fev-1-9-'));

const documents = [
  { name: 'invoice.xml', schema: 'UBL-Invoice-2.1.xsd', schematron: true },
  { name: 'credit-note.xml', schema: 'UBL-CreditNote-2.1.xsd', schematron: true },
  { name: 'debit-note.xml', schema: 'UBL-DebitNote-2.1.xsd', schematron: true },
  ...['030', '031', '032', '033', '034'].map((code) => ({
    name: `application-response-${code}.xml`,
    schema: 'UBL-ApplicationResponse-2.1.xsd',
    schematron: true,
  })),
  { name: 'attached-document.xml', schema: 'UBL-AttachedDocument-2.1.xsd', schematron: false },
];

// Evidencia normativa fijada para no convertir defectos del XSL distribuido
// por DIAN en excepciones opacas. El ZIP oficial coincide con archiveSha256 en
// manifest.json y su XSL coincide bit a bit con el fixture gobernado por CI.
const officialEvidence = Object.freeze({
  archive: {
    url: 'https://www.dian.gov.co/impuestos/factura-electronica/Documents/Caja-de-herramientas-FE_V19_v2026.zip',
    sha256: '94b332571c3088c7f44c2dda49f57ff7978d6b3b14c50dd4d8a8a0f0491216fc',
  },
  anexo: {
    url: 'https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf',
    sha256: '1b4022ac112232cd525a455432b2bdfc977d2edcf14c1c7aa26f8ba93fe47ded',
  },
  creditNoteOperations: {
    path: 'Anexo Tecnico/Tablas Referenciadas/13.1.5.2. Documento CreditNote _ Nota Crédito.xlsx',
    sha256: '2949c604857cb832163e09c36bff5df7c778053271b2ad51393d178294f12cc4',
    cell: 'Hoja1!B4=20',
  },
  debitNoteOperations: {
    path: 'Anexo Tecnico/Tablas Referenciadas/13.1.5.3. Documento DebitNote _ Nota Débito.xlsx',
    sha256: '83028076597e9fe8693a5bc2477b2ae475410afa5b54993a7041abb7c9a268c3',
    cell: 'Hoja1!B4=30',
  },
  tacitAcceptanceExample: {
    path: 'Ejemplificaciones/XMLs de ejemplo/Eventos RADIAN/034 - Aceptacion_Tacita_FEV.xml',
    sha256: 'e1bcee93a9ecc6da66b28d5c528f2643663a62c4bd3492e8c450d28c8bdbfe7f',
  },
});

const normativeProfiles = new Map([
  ['invoice.xml', {
    customizationId: '10',
    profileId: 'DIAN 2.1: Factura Electrónica de Venta',
    evidence: 'Anexo FEV 1.9, pág. 28, FAD03',
  }],
  ['credit-note.xml', {
    customizationId: '20',
    profileId: 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta',
    evidence: 'Anexo FEV 1.9, págs. 115-116, CAD02/CAD03; tabla oficial Hoja1!B4=20',
  }],
  ['debit-note.xml', {
    customizationId: '30',
    profileId: 'DIAN 2.1: Nota Débito de Factura Electrónica de Venta',
    evidence: 'Anexo FEV 1.9, pág. 187, DAD02/DAD03; tabla oficial Hoja1!B4=30',
  }],
  ...['030', '031', '032', '033', '034'].map((code) => [
    `application-response-${code}.xml`,
    {
      customizationId: '1',
      profileId: 'DIAN 2.1: ApplicationResponse de Factura Electrónica de Venta',
      responseCode: code,
      evidence: code === '034'
        ? 'Anexo FEV 1.9, págs. 282 y 301, AAD02/AAD03/AAH03; ejemplo oficial 034'
        : 'Anexo FEV 1.9, pág. 282, AAD02/AAD03 y regla AAH03 del evento',
    },
  ]),
]);

function documentedFatal(fatal, evidence) {
  return Object.freeze({ fatal, evidence });
}

function knownApplicationResponseXslDrift(code) {
  const profile = 'DIAN 2.1: ApplicationResponse de Factura Electrónica de Venta';
  return [
    documentedFatal(
      `Fatal: [AAD03]- (R) ProfileID : '${profile}' no contiene el literal “DIAN 2.1”`,
      'XSL 2026 exige el perfil corto; Anexo FEV 1.9 pág. 282 AAD03 exige el literal descriptivo de 62 caracteres.',
    ),
    documentedFatal(
      "Fatal: - CustomizationID '1' no indica un valor válido para el tipo de operación",
      'XSL 2026 aplica globalmente 01-12; Anexo FEV 1.9 pág. 282 AAD02 exige el literal 1.',
    ),
    ...(code === '034' ? [documentedFatal(
      "Fatal:[AAH03]- cbc:ResponseCode '034' no indica valor autorizado",
      `Anexo FEV 1.9 pág. 301 AAH03 exige 034; ${officialEvidence.tacitAcceptanceExample.path} (${officialEvidence.tacitAcceptanceExample.sha256}).`,
    )] : []),
  ];
}
const knownCompiledXslDrift = new Map([
  ['invoice.xml', [documentedFatal(
    "Fatal: [FAD03]- (R) ProfileID : 'DIAN 2.1: Factura Electrónica de Venta' no contiene el literal “DIAN 2.1”",
    'XSL 2026 exige DIAN 2.1; Anexo FEV 1.9 pág. 28 FAD03 exige el perfil descriptivo.',
  )]],
  ['credit-note.xml', [
    documentedFatal(
      "Fatal: [CAD03]- (R) ProfileID : 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta' no contiene el literal “DIAN 2.1”",
      'XSL 2026 exige DIAN 2.1; Anexo FEV 1.9 pág. 116 CAD03 exige el perfil descriptivo.',
    ),
    documentedFatal(
      "Fatal: [CAD02]- CustomizationID '20' no indica un valor válido para el tipo de operación",
      `${officialEvidence.creditNoteOperations.path} ${officialEvidence.creditNoteOperations.cell} (${officialEvidence.creditNoteOperations.sha256}).`,
    ),
  ]],
  ['debit-note.xml', [
    documentedFatal(
      "Fatal: [DAD03]- (R) ProfileID : 'DIAN 2.1: Nota Débito de Factura Electrónica de Venta' no contiene el literal “DIAN 2.1”",
      'XSL 2026 exige DIAN 2.1; Anexo FEV 1.9 pág. 187 DAD03 exige el perfil descriptivo.',
    ),
    documentedFatal(
      "Fatal: [DAD02]- CustomizationID '30' no indica un valor válido para el tipo de operación",
      `${officialEvidence.debitNoteOperations.path} ${officialEvidence.debitNoteOperations.cell} (${officialEvidence.debitNoteOperations.sha256}).`,
    ),
  ]],
  ...['030', '031', '032', '033', '034'].map((code) => [
    `application-response-${code}.xml`,
    knownApplicationResponseXslDrift(code),
  ]),
]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}

function verifyOfficialFixtureChecksums() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.source?.archiveSha256 !== officialEvidence.archive.sha256) {
    throw new Error('DIAN_OFFICIAL_ARCHIVE_EVIDENCE_MISMATCH');
  }
  const expected = new Map(Object.entries(manifest.files));
  for (const [name, checksum] of expected) {
    const path = join(fixturesRoot, ...name.split('/'));
    const actual = sha256(path);
    if (actual !== checksum) {
      throw new Error(`DIAN_OFFICIAL_FIXTURE_CHECKSUM_MISMATCH ${name}: ${actual}`);
    }
  }
  const governed = walk(fixturesRoot)
    .map((path) => relative(fixturesRoot, path).replaceAll('\\', '/'))
    .filter((name) => name.startsWith('XSD/')
      || name.startsWith('XSL/')
      || name.startsWith('WSDL/'));
  const untracked = governed.filter((name) => !expected.has(name));
  if (untracked.length) {
    throw new Error(`DIAN_OFFICIAL_FIXTURE_NOT_MANIFESTED: ${untracked.join(', ')}`);
  }
  console.log(`Official DIAN fixture checksums OK: ${expected.size} files`);
  console.log(
    `Normative DIAN evidence pinned: Anexo FEV 1.9 ${officialEvidence.anexo.sha256} `
    + `(${officialEvidence.anexo.url})`,
  );
}

function verifyOfficialGetStatusEventWsdl() {
  const wsdl = readFileSync(
    join(fixturesRoot, 'WSDL/WcfDianCustomerServices.single.wsdl'),
    'utf8',
  );
  const action = 'http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatusEvent';
  const assertions = [
    [
      'WS-Security RequireThumbprintReference',
      /<sp:RequireThumbprintReference\/>/u,
    ],
    [
      'WS-Security MustSupportRefThumbprint',
      /<sp:MustSupportRefThumbprint\/>/u,
    ],
    [
      'request trackId:string',
      /<xs:element name="GetStatusEvent"><xs:complexType><xs:sequence><xs:element minOccurs="0" name="trackId" nillable="true" type="xs:string"\/>/u,
    ],
    [
      'response DianResponse',
      /<xs:element name="GetStatusEventResponse"><xs:complexType><xs:sequence><xs:element minOccurs="0" name="GetStatusEventResult" nillable="true" type="[^"]+:DianResponse"/u,
    ],
    [
      'WS-Addressing action',
      new RegExp(`<wsdl:operation name="GetStatusEvent"><wsdl:input wsaw:Action="${action}"`, 'u'),
    ],
    [
      'SOAP 1.2 action',
      new RegExp(`<wsdl:operation name="GetStatusEvent"><soap12:operation soapAction="${action}" style="document"`, 'u'),
    ],
  ];
  const missing = assertions.filter(([, pattern]) => !pattern.test(wsdl)).map(([label]) => label);
  if (missing.length) {
    throw new Error(`DIAN_WSDL_GET_STATUS_EVENT_CONTRACT_MISMATCH: ${missing.join(', ')}`);
  }
  console.log(
    'Official DIAN WSDL OK: thumbprint policy + '
    + 'GetStatusEvent(trackId:string) -> DianResponse + WS-A/SOAP action',
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runPnpm(args) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args]);
  }
  return run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    shell: process.platform === 'win32',
  });
}

function requireSuccess(label, result) {
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  const output = `${result.stdout}${result.stderr}`.trim();
  if (output) console.log(output);
}

function validateXsd(document) {
  const schema = join(fixturesRoot, 'XSD/maindoc', document.schema);
  const xml = join(outputDir, document.name);
  const result = run('java', [join(repoRoot, 'scripts/ci/ValidateDianXml.java'), schema, xml]);
  requireSuccess(`XSD ${document.name}`, result);
}

function runSchematron(name, xmlPath) {
  const report = join(outputDir, `${name}.schematron.xml`);
  const xsl = join(fixturesRoot, 'XSL/DIAN-UBL21-model-compiled.xsl');
  const result = runPnpm(['exec', 'xslt3', `-xsl:${xsl}`, `-s:${xmlPath}`, `-o:${report}`]);
  if (result.status !== 0) {
    throw new Error(`Schematron engine failed for ${name}\n${result.stdout}\n${result.stderr}`);
  }
  const messages = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const fatals = messages.filter((line) => /^Fatal:/u.test(line));
  for (const fatal of fatals) console.log(`DIAN_SCHEMATRON_FATAL ${name}: ${fatal}`);
  return fatals;
}

function assertOnlyKnownFatals(name, fatals) {
  const documented = knownCompiledXslDrift.get(name) || [];
  const expected = documented.map(({ fatal }) => fatal).sort();
  const observed = [...fatals].sort();
  if (expected.length !== observed.length
      || expected.some((fatal, index) => fatal !== observed[index])) {
    throw new Error([
      `DIAN_SCHEMATRON_FATAL_SET_MISMATCH ${name}`,
      `expected=${JSON.stringify(expected)}`,
      `observed=${JSON.stringify(observed)}`,
    ].join('\n'));
  }
  return documented;
}

function rootField(xml, localName) {
  return new RegExp(
    `<cbc:${localName}(?:\\s[^>]*)?>([^<]+)<\\/cbc:${localName}>`,
    'u',
  ).exec(xml)?.[1];
}

function assertNormativeBusinessProfile(name, xmlPath = join(outputDir, name)) {
  const expected = normativeProfiles.get(name);
  if (!expected) throw new Error(`DIAN_NORMATIVE_PROFILE_UNDEFINED ${name}`);
  const xml = readFileSync(xmlPath, 'utf8');
  const observed = {
    customizationId: rootField(xml, 'CustomizationID'),
    profileId: rootField(xml, 'ProfileID'),
    ...(expected.responseCode ? { responseCode: rootField(xml, 'ResponseCode') } : {}),
  };
  for (const [field, value] of Object.entries(observed)) {
    if (value !== expected[field]) {
      throw new Error(
        `DIAN_NORMATIVE_FIELD_MISMATCH ${name} ${field}: ${value ?? '(missing)'}; `
        + `expected=${expected[field]}; evidence=${expected.evidence}`,
      );
    }
  }
}

function replaceExactly(xml, before, after, label) {
  const first = xml.indexOf(before);
  if (first < 0 || xml.indexOf(before, first + before.length) >= 0) {
    throw new Error(`DIAN_NEGATIVE_CONTROL_SOURCE_AMBIGUOUS ${label}`);
  }
  return `${xml.slice(0, first)}${after}${xml.slice(first + before.length)}`;
}

function expectFailure(label, expectedCode, callback) {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedCode)) return;
    throw error;
  }
  throw new Error(`DIAN_NEGATIVE_CONTROL_DID_NOT_FAIL ${label}`);
}

function exerciseNegativeControls() {
  const invoicePath = join(outputDir, 'invoice.xml');
  const invoice = readFileSync(invoicePath, 'utf8');
  const badProfilePath = join(outputDir, 'negative-profile.xml');
  writeFileSync(
    badProfilePath,
    replaceExactly(
      invoice,
      '<cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID>',
      '<cbc:ProfileID>DIAN 2.0</cbc:ProfileID>',
      'invoice ProfileID',
    ),
    'utf8',
  );
  const profileFatals = runSchematron('negative-profile.xml', badProfilePath);
  if (!profileFatals.some((fatal) => fatal.startsWith('Fatal: [FAD03]'))) {
    throw new Error('DIAN_SCHEMATRON_NEGATIVE_CONTROL_DID_NOT_FAIL');
  }
  expectFailure('exact ProfileID drift', 'DIAN_SCHEMATRON_FATAL_SET_MISMATCH', () => {
    assertOnlyKnownFatals('invoice.xml', profileFatals);
  });
  expectFailure('normative ProfileID', 'DIAN_NORMATIVE_FIELD_MISMATCH', () => {
    assertNormativeBusinessProfile('invoice.xml', badProfilePath);
  });

  const creditNote = readFileSync(join(outputDir, 'credit-note.xml'), 'utf8');
  const badCreditOperationPath = join(outputDir, 'negative-credit-operation.xml');
  writeFileSync(
    badCreditOperationPath,
    replaceExactly(
      creditNote,
      '<cbc:CustomizationID>20</cbc:CustomizationID>',
      '<cbc:CustomizationID>21</cbc:CustomizationID>',
      'CreditNote CustomizationID',
    ),
    'utf8',
  );
  const creditFatals = runSchematron(
    'negative-credit-operation.xml',
    badCreditOperationPath,
  );
  expectFailure('exact CAD02 drift', 'DIAN_SCHEMATRON_FATAL_SET_MISMATCH', () => {
    assertOnlyKnownFatals('credit-note.xml', creditFatals);
  });
  expectFailure('normative CAD02', 'DIAN_NORMATIVE_FIELD_MISMATCH', () => {
    assertNormativeBusinessProfile('credit-note.xml', badCreditOperationPath);
  });

  const tacitAcceptance = readFileSync(join(outputDir, 'application-response-034.xml'), 'utf8');
  const badEventCodePath = join(outputDir, 'negative-event-034.xml');
  writeFileSync(
    badEventCodePath,
    replaceExactly(
      tacitAcceptance,
      '<cbc:ResponseCode>034</cbc:ResponseCode>',
      '<cbc:ResponseCode>999</cbc:ResponseCode>',
      'ApplicationResponse 034 ResponseCode',
    ),
    'utf8',
  );
  const eventFatals = runSchematron('negative-event-034.xml', badEventCodePath);
  expectFailure('exact AAH03 drift', 'DIAN_SCHEMATRON_FATAL_SET_MISMATCH', () => {
    assertOnlyKnownFatals('application-response-034.xml', eventFatals);
  });
  expectFailure('normative AAH03', 'DIAN_NORMATIVE_FIELD_MISMATCH', () => {
    assertNormativeBusinessProfile('application-response-034.xml', badEventCodePath);
  });

  const wrongCustomizationPath = join(outputDir, 'negative-application-customization.xml');
  writeFileSync(
    wrongCustomizationPath,
    replaceExactly(
      tacitAcceptance,
      '<cbc:CustomizationID>1</cbc:CustomizationID>',
      '<cbc:CustomizationID>01</cbc:CustomizationID>',
      'ApplicationResponse CustomizationID',
    ),
    'utf8',
  );
  expectFailure('normative AAD02', 'DIAN_NORMATIVE_FIELD_MISMATCH', () => {
    assertNormativeBusinessProfile('application-response-034.xml', wrongCustomizationPath);
  });

  const badXsdPath = join(outputDir, 'negative-xsd.xml');
  writeFileSync(
    badXsdPath,
    invoice.replace(/<cbc:ID>[^<]+<\/cbc:ID>/u, ''),
    'utf8',
  );
  const schema = join(fixturesRoot, 'XSD/maindoc/UBL-Invoice-2.1.xsd');
  const result = run('java', [join(repoRoot, 'scripts/ci/ValidateDianXml.java'), schema, badXsdPath]);
  if (result.status === 0) throw new Error('DIAN_XSD_NEGATIVE_CONTROL_DID_NOT_FAIL');
  console.log(
    'Negative controls OK: exact drift set, normative profiles/operations/event and XSD fail closed',
  );
}

try {
  verifyOfficialFixtureChecksums();
  verifyOfficialGetStatusEventWsdl();
  requireSuccess('DIAN fixture generation', runPnpm([
    '--filter', '@erp-suite/erp-api', 'exec', 'ts-node', '--transpile-only',
    'scripts/generate-dian-official-contract-fixtures.ts', outputDir,
  ]));

  for (const document of documents) {
    validateXsd(document);
    if (document.name !== 'attached-document.xml') {
      assertNormativeBusinessProfile(document.name);
    }
    if (document.schematron) {
      const fatals = runSchematron(document.name, join(outputDir, document.name));
      const documented = assertOnlyKnownFatals(document.name, fatals);
      if (documented.length) {
        console.log(
          `Schematron completed: ${document.name}; `
          + `${documented.length} documented upstream XSL drift(s)`,
        );
        for (const drift of documented) console.log(`  evidence: ${drift.evidence}`);
      } else {
        console.log(`Schematron clean: ${document.name}`);
      }
    } else {
      console.log('Schematron N/A: attached-document.xml (root namespace not covered by official XSL)');
    }
  }
  exerciseNegativeControls();
  console.log([
    'DIAN FEV 1.9 contract OK: 9 documents;',
    'official XSD + normative business profiles + exact documented XSL drift set',
  ].join(' '));
} finally {
  if (process.env.DIAN_CONTRACT_KEEP_OUTPUT === '1') {
    console.log(`DIAN contract output preserved: ${outputDir}`);
  } else {
    rmSync(outputDir, { recursive: true, force: true });
  }
}
