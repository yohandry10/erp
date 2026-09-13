/** El selector y los filtros locales necesitan el catálogo completo. */
export async function loadTenantCatalog<T extends { id?: string }>(
  get: (endpoint: string) => Promise<any>,
): Promise<T[]> {
  const tenants = new Map<string, T>()
  let page = 1
  let expectedTotal: number | undefined
  for (;;) {
    const response = await get(`/tenants?page=${page}&limit=50`)
    if (!response || response.success === false) {
      throw new Error(response?.message || 'No se pudo cargar el catálogo de empresas')
    }
    const payload = response.data ?? response
    const rows: T[] | undefined = Array.isArray(payload) ? payload : payload.items ?? payload.tenants
    if (!Array.isArray(rows)) throw new Error('El catálogo de empresas tiene un formato inválido')
    for (const row of rows) {
      if (!row.id || tenants.has(row.id)) {
        throw new Error('El catálogo de empresas cambió durante la consulta. Actualízalo nuevamente')
      }
      tenants.set(row.id, row)
    }
    const pagination = response.pagination ?? payload.pagination
    if (!pagination) return [...tenants.values()]
    const total = Number(pagination.total)
    const totalPages = Number(pagination.totalPages)
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(totalPages) || totalPages < 0) {
      throw new Error('La paginación de empresas tiene un formato inválido')
    }
    if (expectedTotal !== undefined && expectedTotal !== total) {
      throw new Error('El catálogo de empresas cambió durante la consulta. Actualízalo nuevamente')
    }
    expectedTotal = total
    if (page >= totalPages) {
      if (tenants.size !== total) throw new Error('El catálogo de empresas está incompleto. Actualízalo nuevamente')
      return [...tenants.values()]
    }
    if (!rows.length) throw new Error('No se pudo completar el catálogo de empresas')
    page++
  }
}
