import { fetchApi } from '@/lib/api-fetch'
import { customAuth } from '@/lib/auth-service'
import { isOfflineCachedResponse } from '@/lib/offline-store'
import { parseGreCsv } from '@/lib/gre-read-contract'
export async function liveGreFile(endpoint: string, type: 'pdf' | 'csv') {
  const actor = (await customAuth.getRequestSession()).session?.user
  const response = await fetchApi(endpoint)
  if (!response.ok || isOfflineCachedResponse(response)) throw new Error('No se pudo descargar la información actual de GRE. Reintente.')
  const blob = await response.blob(); const mime = response.headers.get('content-type')?.toLowerCase() || ''
  if (type === 'pdf') {
    if (!mime.startsWith('application/pdf') || !(await blob.slice(0, 5).text()).startsWith('%PDF-') || !(await blob.slice(-2048).text()).includes('%%EOF')) throw new Error('El servidor no devolvió un PDF completo de GRE.')
  } else {
    if (!mime.startsWith('text/csv')) throw new Error('El servidor no devolvió un CSV de GRE.')
    parseGreCsv((await blob.text()).replace(/^\uFEFF/, ''))
  }
  const current = (await customAuth.getRequestSession()).session?.user
  if (!actor || current?.id !== actor.id || current.tenant_id !== actor.tenant_id) throw new Error('La sesión cambió durante la descarga. Consulte nuevamente las guías.')
  return blob
}
export function saveGreFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a')
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
}
