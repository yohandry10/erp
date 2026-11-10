export function journalPrintContext(response: any, tenantId: string) {
  const data = response?.data
  if (response?.success !== true || response.requiresSetup !== false || !data || data.tenantId !== tenantId
    || typeof data.razonSocial !== 'string' || !data.razonSocial.trim()
    || !/^[A-Z]{3}$/.test(data.monedaDefecto || '') || typeof data.isDemo !== 'boolean'
    || response.offline || response.queued || response.pending) {
    throw new Error('No se pudo confirmar la empresa y moneda del asiento para el PDF. Reintenta la descarga.')
  }
  return { company: data.razonSocial.trim(), currency: data.monedaDefecto as string, demo: data.isDemo as boolean }
}
