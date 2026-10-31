import { fetchApi } from '@/lib/api-fetch'
import { customAuth } from '@/lib/auth-service'
import { isOfflineCachedResponse } from '@/lib/offline-store'
import { parseCpeCsv } from '@/lib/cpe-read-contract'
export async function liveCpeFile(endpoint: string, type: 'pdf' | 'csv', expectedTotal = 0) {
  const actor = (await customAuth.getRequestSession()).session?.user
  const response = await fetchApi(endpoint)
  if (!response.ok || isOfflineCachedResponse(response)) throw new Error('No se pudo descargar la información actual de CPE. Reintente.')
  const blob = await response.blob(); const mime = response.headers.get('content-type')?.toLowerCase() || ''
  if (type === 'pdf') {
    if (!mime.startsWith('application/pdf') || !(await blob.slice(0, 5).text()).startsWith('%PDF-') || !(await blob.slice(-2048).text()).includes('%%EOF')) throw new Error('El servidor no devolvió un PDF completo de CPE.')
  } else {
    if (!mime.startsWith('text/csv')) throw new Error('El servidor no devolvió un CSV de CPE.')
    parseCpeCsv((await blob.text()).replace(/^\uFEFF/, ''), expectedTotal)
  }
  const current = (await customAuth.getRequestSession()).session?.user
  if (!actor || current?.id !== actor.id || current.tenant_id !== actor.tenant_id) throw new Error('La sesión cambió durante la descarga. Consulte nuevamente los comprobantes.')
  return blob
}
export function saveCpeFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a')
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
}
