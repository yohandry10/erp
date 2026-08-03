/**
 * Utilidades de cálculos de fechas GLOBALES para todo el proyecto
 */

// ============================================
// PARSEO SEGURO DE FECHAS
// ============================================

/** `2026-08-02` */
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `2026-08-02T00:00:00+00:00`. Varias columnas guardan una fecha de calendario
 * en un `timestamptz`: al escribir "2026-08-02" Postgres lo convierte a
 * medianoche UTC, que en Lima es el día anterior. Nadie emite un comprobante a
 * las 00:00:00.000 exactas en UTC, así que ese instante es siempre una fecha
 * disfrazada, no una hora real.
 */
const MEDIANOCHE_UTC =
  /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?(?:Z|\+00:?00)$/;

/**
 * Parsea una fecha respetando la zona local.
 * Un string date-only (YYYY-MM-DD) pasado a `new Date()` se interpreta como UTC
 * y en Lima (UTC-5) retrocede un día al mostrarse; aquí se fuerza a hora local.
 */
export function parseDateLocal(value: string | Date): Date {
  if (value instanceof Date) return value;
  const fecha = SOLO_FECHA.exec(value) ?? MEDIANOCHE_UTC.exec(value);
  if (fecha) {
    return new Date(Number(fecha[1]), Number(fecha[2]) - 1, Number(fecha[3]));
  }
  return new Date(value);
}

// ============================================
// CÁLCULOS DE FECHAS
// ============================================

/**
 * Calcula los días hasta una fecha de vencimiento
 * @param vencimiento - Fecha de vencimiento
 * @returns Número de días (negativo si ya venció)
 */
export function getDaysUntilDue(vencimiento: string | Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Un date-only (YYYY-MM-DD) leido como UTC retrocede un dia en Lima, asi
  // que una cuenta que vencia hoy se contaba como vencida ayer.
  const dueDate = parseDateLocal(vencimiento);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Determina si una fecha está vencida
 * @param vencimiento - Fecha de vencimiento
 * @returns true si está vencida
 */
export function isOverdue(vencimiento: string | Date): boolean {
  return getDaysUntilDue(vencimiento) < 0;
}

/**
 * Determina si una fecha vence pronto (dentro de N días)
 * @param vencimiento - Fecha de vencimiento
 * @param days - Número de días para considerar "pronto" (default: 7)
 * @returns true si vence pronto
 */
export function isDueSoon(
  vencimiento: string | Date,
  days: number = 7,
): boolean {
  const daysUntil = getDaysUntilDue(vencimiento);
  return daysUntil >= 0 && daysUntil <= days;
}

/**
 * Obtiene el texto descriptivo de vencimiento
 * @param vencimiento - Fecha de vencimiento
 * @returns Texto descriptivo (ej: "Vence en 5 días", "Vencido hace 3 días")
 */
export function getVencimientoText(vencimiento: string | Date): string {
  const days = getDaysUntilDue(vencimiento);

  if (days < 0) {
    return `Vencido hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
  } else if (days === 0) {
    return "Vence hoy";
  } else {
    return `Vence en ${days} ${days === 1 ? "día" : "días"}`;
  }
}

/**
 * Valida que una fecha sea válida
 * @param date - Fecha a validar
 * @returns true si es válida
 */
export function isValidDate(date: string | Date | undefined | null): boolean {
  if (!date) return false;

  const d = typeof date === "string" ? new Date(date) : date;

  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Valida que una fecha no sea futura
 * @param date - Fecha a validar
 * @returns true si no es futura
 */
export function isNotFutureDate(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  return d <= today;
}
