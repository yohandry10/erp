export interface DianPrintedFiscalInfo {
  authorizationNumber: string;
  authorizationPrefix: string;
  rangeFrom: number;
  rangeTo: number;
  validFrom: string;
  validTo: string;
  consecutive: string;
  generatedAt: string;
  paymentForm: string;
  paymentTerm: string;
  paymentMethod: string;
  taxQualities: string[];
  softwareId: string;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function finiteInteger(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Representación DIAN incompleta: ${field} inválido`);
  }
  return result;
}

export function resolveDianPrintedFiscalInfo(
  cpe: Record<string, any>,
  config: Record<string, any>,
  allowDemo = false,
): DianPrintedFiscalInfo {
  const metadata = cpe.metadata && typeof cpe.metadata === 'object' ? cpe.metadata : {};
  const evidence = cpe.fiscal_authority_evidence
    && typeof cpe.fiscal_authority_evidence === 'object'
    ? cpe.fiscal_authority_evidence
    : {};
  const authorization = evidence.authorization && typeof evidence.authorization === 'object'
    ? evidence.authorization
    : {};
  if (!allowDemo && (
    cpe.simulated_origin !== false
    || text(evidence.status).toUpperCase() !== 'ACCEPTED'
    || text(evidence.authority).toUpperCase() !== 'DIAN'
    || text(evidence.country_code).toUpperCase() !== 'CO'
  )) {
    throw new Error('Representación DIAN sin aceptación fiscal terminal 525');
  }
  const fiscalSource = allowDemo ? config : authorization;
  const authorizationNumber = text(authorization.number || fiscalSource.dian_resolucion_numero);
  const authorizationPrefix = text(authorization.prefix || fiscalSource.dian_resolucion_prefijo).toUpperCase();
  const validFrom = text(authorization.valid_from || fiscalSource.dian_resolucion_fecha_inicio).slice(0, 10);
  const validTo = text(authorization.valid_to || fiscalSource.dian_resolucion_fecha_fin).slice(0, 10);
  const series = text(cpe.serie).toUpperCase();
  const number = finiteInteger(cpe.numero, 'consecutivo');
  const rawRangeFrom = authorization.range_from ?? fiscalSource.dian_resolucion_desde;
  const rawRangeTo = authorization.range_to ?? fiscalSource.dian_resolucion_hasta;
  const rangeFrom = rawRangeFrom == null && allowDemo
    ? 0
    : finiteInteger(rawRangeFrom, 'rango inicial');
  const rangeTo = rawRangeTo == null && allowDemo
    ? 0
    : finiteInteger(rawRangeTo, 'rango final');
  if (!authorizationNumber || !authorizationPrefix || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)
      || !/^\d{4}-\d{2}-\d{2}$/.test(validTo) || rangeTo < rangeFrom) {
    if (!allowDemo) {
      throw new Error('Representación DIAN incompleta: falta autorización, prefijo, rango o vigencia');
    }
  }
  if (!allowDemo && (!series.startsWith(authorizationPrefix) || number < rangeFrom || number > rangeTo)) {
    throw new Error('Representación DIAN inconsistente: prefijo o consecutivo fuera de la autorización');
  }

  const rawIssueDate = text(cpe.fecha_emision || cpe.created_at);
  const issueTime = text(cpe.hora_emision || metadata.hora_emision);
  const generatedAt = /T\d{2}:\d{2}/.test(rawIssueDate)
    ? rawIssueDate
    : issueTime
      ? `${rawIssueDate.slice(0, 10)}T${issueTime}`
      : '';
  if (!generatedAt && !allowDemo) {
    throw new Error('Representación DIAN incompleta: falta fecha y hora de generación');
  }
  const issueDay = rawIssueDate.slice(0, 10);
  if (!allowDemo && (issueDay < validFrom || issueDay > validTo)) {
    throw new Error('Representación DIAN inconsistente: fecha fuera de la vigencia de la autorización');
  }

  const paymentForm = text(cpe.forma_pago || cpe.condicion_pago || metadata.forma_pago).toUpperCase();
  const paymentMethod = text(cpe.medio_pago || cpe.metodo_pago || metadata.medio_pago).toUpperCase();
  const paymentTermDays = cpe.plazo_pago_dias ?? metadata.plazo_pago_dias;
  const paymentTerm = paymentForm === 'CREDITO'
    ? (paymentTermDays == null ? '' : `${finiteInteger(paymentTermDays, 'plazo de pago')} días`)
    : 'Inmediato';
  if (!allowDemo && (!paymentForm || !paymentMethod || (paymentForm === 'CREDITO' && !paymentTerm))) {
    throw new Error('Representación DIAN incompleta: falta forma, plazo o medio de pago');
  }

  const issuerTaxProfile = evidence.issuer_tax_profile && typeof evidence.issuer_tax_profile === 'object'
    ? evidence.issuer_tax_profile
    : {};
  const taxQualities = [
    text(issuerTaxProfile.contributor_type || (allowDemo ? config.dian_tipo_contribuyente : '')),
    text(issuerTaxProfile.fiscal_regime || (allowDemo ? config.dian_regimen_fiscal : '')),
    metadata.gran_contribuyente === true ? 'Gran contribuyente' : '',
    metadata.autorretenedor === true ? 'Autorretenedor' : '',
    metadata.regimen_simple === true ? 'Régimen SIMPLE' : '',
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const softwareId = text(authorization.software_id || (allowDemo ? config.dian_software_id : ''));
  if (!softwareId && !allowDemo) {
    throw new Error('Representación DIAN incompleta: falta identificación del software DIAN');
  }

  return {
    authorizationNumber: authorizationNumber || 'MUESTRA-SIN-AUTORIZACIÓN',
    authorizationPrefix: authorizationPrefix || series || 'MUESTRA',
    rangeFrom,
    rangeTo,
    validFrom: validFrom || 'No aplica en muestra',
    validTo: validTo || 'No aplica en muestra',
    consecutive: `${series}-${String(number).padStart(8, '0')}`,
    generatedAt: generatedAt || `${rawIssueDate.slice(0, 10)}T00:00:00 (muestra)`,
    paymentForm: paymentForm || 'MUESTRA',
    paymentTerm: paymentTerm || 'No consignado en muestra',
    paymentMethod: paymentMethod || 'MUESTRA',
    taxQualities,
    softwareId: softwareId || 'MUESTRA-SOFTWARE',
  };
}
