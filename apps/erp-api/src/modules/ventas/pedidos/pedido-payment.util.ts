import { BadRequestException } from '@nestjs/common';

export const DIAN_PAYMENT_INTENT_KEY = 'dian_payment_intent';
export const DIAN_PAYMENT_SNAPSHOT_KEY = 'dian_payment_snapshot';

export interface PedidoPaymentInput {
  condicion_pago?: string;
  medio_pago?: string;
  plazo_pago_dias?: number;
  fecha_vencimiento?: string;
}

export function tieneEntradaPagoPedido(input: PedidoPaymentInput): boolean {
  return ['condicion_pago', 'medio_pago', 'plazo_pago_dias', 'fecha_vencimiento']
    .some((key) => (input as Record<string, unknown>)[key] !== undefined);
}

function normalizeCondition(value: unknown): 'CONTADO' | 'CREDITO' | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'CONTADO') return 'CONTADO';
  if (normalized === 'CREDITO' || normalized === 'CRÉDITO') return 'CREDITO';
  throw new BadRequestException({
    message: 'La condición de pago del pedido debe ser CONTADO o CREDITO',
    code: 'PEDIDO_DIAN_PAYMENT_INVALID',
  });
}

function normalizeMeans(value: unknown): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const normalized = String(value).trim().toUpperCase();
  if (/^\d{1,3}$/.test(normalized) || normalized === 'ZZZ') return normalized;
  throw new BadRequestException({
    message: 'El medio de pago del pedido debe ser un código de 1 a 3 dígitos o ZZZ',
    code: 'PEDIDO_DIAN_PAYMENT_INVALID',
  });
}

function normalizeTerm(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const normalized = Number(value);
  if (Number.isSafeInteger(normalized) && normalized >= 0) return normalized;
  throw new BadRequestException({
    message: 'El plazo de pago del pedido debe ser un entero no negativo',
    code: 'PEDIDO_DIAN_PAYMENT_INVALID',
  });
}

function normalizeCalendarDate(value: unknown): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const normalized = String(value).trim();
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(normalized)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new BadRequestException({
      message: 'La fecha de vencimiento del pedido debe ser una fecha calendario YYYY-MM-DD',
      code: 'PEDIDO_DIAN_PAYMENT_INVALID',
    });
  }
  return normalized;
}

export function construirIntencionPagoPedido(
  input: PedidoPaymentInput,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const existingCondition = normalizeCondition(existing?.condicion_pago);
  const suppliedCondition = normalizeCondition(input.condicion_pago);
  const condition = suppliedCondition ?? existingCondition;
  const means = normalizeMeans(input.medio_pago) ?? normalizeMeans(existing?.medio_pago);
  let term = normalizeTerm(input.plazo_pago_dias) ?? normalizeTerm(existing?.plazo_pago_dias);
  let dueDate = normalizeCalendarDate(input.fecha_vencimiento)
    ?? normalizeCalendarDate(existing?.fecha_vencimiento);

  if (!condition) {
    throw new BadRequestException({
      message: 'Medio, plazo o vencimiento requieren declarar la condición de pago del pedido',
      code: 'PEDIDO_DIAN_PAYMENT_INCOMPLETE',
    });
  }

  if (suppliedCondition === 'CONTADO' && existingCondition !== 'CONTADO') {
    term = normalizeTerm(input.plazo_pago_dias) ?? 0;
    dueDate = normalizeCalendarDate(input.fecha_vencimiento);
  }
  if (condition === 'CONTADO' && term !== undefined && term !== 0) {
    throw new BadRequestException({
      message: 'Un pedido al contado no puede declarar un plazo positivo',
      code: 'PEDIDO_DIAN_PAYMENT_INCONSISTENT',
    });
  }
  if (condition === 'CREDITO' && term === undefined && dueDate === undefined) {
    throw new BadRequestException({
      message: 'Un pedido a crédito requiere plazo o fecha de vencimiento',
      code: 'PEDIDO_DIAN_PAYMENT_INCOMPLETE',
    });
  }

  return {
    condicion_pago: condition,
    ...(means ? { medio_pago: means } : {}),
    ...(term !== undefined ? { plazo_pago_dias: term } : {}),
    ...(dueDate ? { fecha_vencimiento: dueDate } : {}),
  };
}
