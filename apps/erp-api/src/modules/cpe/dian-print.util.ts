import { zonaHorariaDePais } from '../../shared/utils/fecha-peru.util';

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

const DIAN_TIME_ZONE = zonaHorariaDePais('CO');
const DIAN_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DIAN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const CIVIL_DATE_STORAGE_PATTERN =
  /^(\d{4}-\d{2}-\d{2})(?:[ T]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00(?::?00)?)?)?$/i;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;
const LOCAL_TIME_PATTERN =
  /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

interface DianLocalDateTime {
  day: string;
  value: string;
  offsetMinutes: number;
}

function localDateTimeParts(instant: Date): DianLocalDateTime | null {
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(
    DIAN_DATE_TIME_FORMATTER
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) return null;

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const instantAtWholeSecond = instant.getTime() - instant.getMilliseconds();
  const offsetMinutes = Math.round((localAsUtc - instantAtWholeSecond) / 60_000);
  const offsetSign = offsetMinutes < 0 ? '-' : '+';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${offsetSign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;
  const localDay = `${parts.year}-${parts.month}-${parts.day}`;

  return {
    day: localDay,
    value: `${localDay}T${parts.hour}:${parts.minute}:${parts.second}${offset}`,
    offsetMinutes,
  };
}

function localWallTimeInDianTimezone(match: RegExpMatchArray): DianLocalDateTime | null {
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00', fraction = ''] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, '0'));
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const normalized = new Date(wallTime);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute
    || normalized.getUTCSeconds() !== second
  ) return null;

  // Deducir el desfase desde Intl evita fijar "-05:00" en dos lugares. La
  // segunda pasada también mantiene el cálculo correcto si la zona cambiara.
  const firstOffset = localDateTimeParts(new Date(wallTime))?.offsetMinutes;
  if (firstOffset == null) return null;
  let instant = new Date(wallTime - firstOffset * 60_000);
  const resolvedOffset = localDateTimeParts(instant)?.offsetMinutes;
  if (resolvedOffset == null) return null;
  if (resolvedOffset !== firstOffset) {
    instant = new Date(wallTime - resolvedOffset * 60_000);
  }
  return localDateTimeParts(instant);
}

function instantInDianTimezone(value: string): DianLocalDateTime | null {
  const localDateTime = value.match(LOCAL_DATE_TIME_PATTERN);
  if (localDateTime) return localWallTimeInDianTimezone(localDateTime);
  return localDateTimeParts(new Date(value));
}

function resolveDianIssueTimestamp(rawIssueDate: string, issueTime: string): {
  generatedAt: string;
  issueDay: string;
} {
  const civilDate = rawIssueDate.match(CIVIL_DATE_STORAGE_PATTERN);
  if (civilDate) {
    const issueDay = civilDate[1];
    if (!issueTime) return { generatedAt: '', issueDay };
    const localTime = issueTime.match(LOCAL_TIME_PATTERN);
    const resolved = localTime
      ? localWallTimeInDianTimezone([
        localTime[0],
        ...issueDay.split('-'),
        localTime[1],
        localTime[2],
        localTime[3],
        localTime[4],
      ] as RegExpMatchArray)
      : instantInDianTimezone(`${issueDay}T${issueTime}`);
    return { generatedAt: resolved?.value || '', issueDay };
  }

  const resolved = instantInDianTimezone(rawIssueDate);
  return {
    generatedAt: resolved?.value || '',
    issueDay: resolved?.day || '',
  };
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
  const authorizationNumber = text(allowDemo
    ? fiscalSource.dian_resolucion_numero
    : authorization.number);
  const authorizationPrefix = text(allowDemo
    ? fiscalSource.dian_resolucion_prefijo
    : authorization.prefix).toUpperCase();
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
  if (!authorizationNumber || (authorizationPrefix && !/^[A-Z0-9]{1,4}$/.test(authorizationPrefix))
      || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)
      || !/^\d{4}-\d{2}-\d{2}$/.test(validTo) || rangeTo < rangeFrom) {
    if (!allowDemo) {
      throw new Error('Representación DIAN incompleta: falta autorización, rango o vigencia');
    }
  }
  if (!allowDemo && (series !== authorizationPrefix || number < rangeFrom || number > rangeTo)) {
    throw new Error('Representación DIAN inconsistente: prefijo o consecutivo fuera de la autorización');
  }

  const rawIssueDate = text(cpe.fecha_emision || cpe.created_at);
  const issueTime = text(cpe.hora_emision || metadata.hora_emision);
  const { generatedAt, issueDay } = resolveDianIssueTimestamp(rawIssueDate, issueTime);
  if (!generatedAt && !allowDemo) {
    throw new Error('Representación DIAN incompleta: falta fecha y hora de generación');
  }
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
    authorizationPrefix: allowDemo
      ? (authorizationPrefix || series || 'MUESTRA')
      : authorizationPrefix,
    rangeFrom,
    rangeTo,
    validFrom: validFrom || 'No aplica en muestra',
    validTo: validTo || 'No aplica en muestra',
    consecutive: `${series}${number}`,
    generatedAt: generatedAt || `${issueDay || rawIssueDate.slice(0, 10)}T00:00:00 (muestra)`,
    paymentForm: paymentForm || 'MUESTRA',
    paymentTerm: paymentTerm || 'No consignado en muestra',
    paymentMethod: paymentMethod || 'MUESTRA',
    taxQualities,
    softwareId: softwareId || 'MUESTRA-SOFTWARE',
  };
}
