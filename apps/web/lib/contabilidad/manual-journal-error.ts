export function manualJournalError(error: any): string {
  if (error?.data?.code === 'MANUAL_ACCOUNTING_PERIOD_NOT_OPEN' || error?.message === 'MANUAL_ACCOUNTING_PERIOD_NOT_OPEN') {
    return 'El período contable de la fecha del asiento no está abierto. Revisa su estado en Contabilidad > Períodos antes de volver a guardar; los datos del asiento se conservan.';
  }
  return error?.message || 'No se pudo guardar el asiento contable. Revisa los datos e inténtalo nuevamente.';
}
