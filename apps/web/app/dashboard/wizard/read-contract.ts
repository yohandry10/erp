function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La respuesta de configuración está incompleta. Reintenta la consulta.')
  }
  return value as Record<string, unknown>
}

function data(value: unknown) {
  const response = object(value)
  if (response.success !== true || !('data' in response)) {
    throw new Error('No se pudo confirmar la configuración en el servidor. Reintenta la consulta.')
  }
  return response.data
}

export function readWizardStatus(value: unknown) {
  const status = object(data(value))
  const ruc = object(status.ruc)
  if (typeof status.isComplete !== 'boolean' || typeof ruc.isConfigured !== 'boolean' ||
      !Array.isArray(ruc.missingFields) || ruc.missingFields.some(field => typeof field !== 'string')) {
    throw new Error('El estado de configuración está incompleto. Reintenta la consulta.')
  }
  return { coreReady: status.isComplete && ruc.isConfigured && ruc.missingFields.length === 0 }
}

export interface ReadWizardProgress {
  pasoActual: number
  pasosCompletados: number[]
  completado: boolean
  configuracionTemporal?: Record<string, unknown>
}

export function readWizardProgress(value: unknown, allowNull = true): ReadWizardProgress | null {
  const content = data(value)
  if (content === null && allowNull) return null
  const progress = object(content)
  if (!Number.isInteger(progress.pasoActual) || Number(progress.pasoActual) < 1 || Number(progress.pasoActual) > 8 ||
      !Array.isArray(progress.pasosCompletados) || progress.pasosCompletados.some(step =>
        !Number.isInteger(step) || step < 1 || step > 8) ||
      new Set(progress.pasosCompletados).size !== progress.pasosCompletados.length ||
      typeof progress.completado !== 'boolean' ||
      (progress.configuracionTemporal !== undefined && progress.configuracionTemporal !== null &&
        (typeof progress.configuracionTemporal !== 'object' || Array.isArray(progress.configuracionTemporal)))) {
    throw new Error('El progreso guardado está incompleto. Reintenta la consulta.')
  }
  return progress as unknown as ReadWizardProgress
}

export function confirmWizardStep(value: unknown, step: number) {
  const progress = readWizardProgress(value, false)
  if (!progress || progress.pasoActual !== step || !progress.pasosCompletados.includes(step)) {
    throw new Error('El servidor no confirmó el guardado de este paso. Reintenta el guardado.')
  }
}

export function confirmWizardCompletion(value: unknown) {
  const result = object(data(value))
  if (typeof result.completedAt !== 'string' || !Number.isFinite(Date.parse(result.completedAt))) {
    throw new Error('El servidor no confirmó el cierre del asistente. Reintenta el guardado.')
  }
}

export function readWizardCompany<T>(value: unknown): T {
  const company = object(data(value))
  const textFields = ['ruc', 'razonSocial', 'direccion', 'pais', 'tipo_empresa', 'serieFactura', 'serieBoleta']
  if (textFields.some(field => typeof company[field] !== 'string') ||
      typeof company.isDemo !== 'boolean' || typeof company.certificateConfigured !== 'boolean' ||
      typeof company.igvPorcentaje !== 'number' || !Number.isFinite(company.igvPorcentaje) ||
      company.igvPorcentaje < 0 || company.igvPorcentaje > 100 ||
      !('serieNotaCredito' in company) ||
      (company.serieNotaCredito !== null && typeof company.serieNotaCredito !== 'string')) {
    throw new Error('La configuración de empresa está incompleta. Reintenta la consulta.')
  }
  return company as unknown as T
}
