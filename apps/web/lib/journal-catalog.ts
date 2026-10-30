import { fetchApi } from './api-fetch'
import { isOfflineCachedResponse, isOfflineQueuedResponse } from './offline-store'

/** Este listado acredita una lectura completa actual, nunca una página cacheada. */
export async function readJournalPage(endpoint: string): Promise<any> {
  const response = await fetchApi(endpoint, { method: 'GET' })
  if (!response.ok || isOfflineCachedResponse(response) || isOfflineQueuedResponse(response)) {
    throw new Error('No se pudo consultar el listado completo actual de asientos contables. Reintente')
  }
  return response.json()
}

/** Los filtros locales requieren todas las páginas del listado, publicadas juntas. */
export async function loadJournalCatalog<T extends { id: string; tenant_id: string }>(
  get: (endpoint: string) => Promise<any>,
  tenantId: string,
  isCurrent: () => boolean,
): Promise<T[] | null> {
  const journals = new Map<string, T>()
  let expectedTotal: number | undefined
  for (let page = 1; ; page++) {
    if (!isCurrent()) return null
    const response = await get(`/api/contabilidad/asientos?page=${page}&limit=50`)
    if (!isCurrent()) return null
    if (response?.success !== true || !Array.isArray(response.data)) {
      throw new Error(response?.message || 'No se pudieron cargar los asientos contables')
    }
    const { total, totalPages, limit, page: actualPage } = response
    if (!Number.isSafeInteger(total) || total < 0 || limit !== 50 || actualPage !== page
      || totalPages !== Math.ceil(total / limit)) {
      throw new Error('La paginación de asientos contables tiene un formato inválido')
    }
    if (expectedTotal !== undefined && expectedTotal !== total) {
      throw new Error('Los asientos contables cambiaron durante la consulta. Reintente')
    }
    expectedTotal = total
    if (response.data.length !== Math.min(limit, Math.max(0, total - (page - 1) * limit))) {
      throw new Error('El listado de asientos contables está incompleto. Reintente')
    }
    for (const journal of response.data as T[]) {
      if (!journal.id || journal.tenant_id !== tenantId || journals.has(journal.id)) {
        throw new Error('El listado de asientos contables cambió o no pertenece a la empresa actual. Reintente')
      }
      journals.set(journal.id, journal)
    }
    if (page >= totalPages) {
      if (journals.size !== total) throw new Error('El listado de asientos contables está incompleto. Reintente')
      return [...journals.values()]
    }
  }
}
