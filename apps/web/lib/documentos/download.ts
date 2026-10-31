import { fetchApi } from '@/lib/api-fetch'
import { isOfflineCachedResponse } from '@/lib/offline-store'
import { customAuth } from '@/lib/auth-service'

async function liveResponse(endpoint: string) {
  const response = await fetchApi(endpoint)
  if (!response.ok || isOfflineCachedResponse(response)) {
    throw new Error('No se pudo descargar el documento actual. Reintente.')
  }
  return response
}

export async function downloadOperationalDocument(id: string, type: 'pdf' | 'xml', filename: string) {
  const actor = (await customAuth.getRequestSession()).session?.user
  const response = await liveResponse(`/api/documentos/${id}/descargar-${type}`)
  const envelope = await response.json()
  if (envelope?.success !== true) throw new Error('La descarga no fue confirmada.')
  let blob: Blob
  if (type === 'pdf') {
    const data = envelope.data
    const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    if (typeof data?.cpe_id !== 'string' || !new RegExp(`^${uuid}$`, 'i').test(data.cpe_id)
      || data.pdf_endpoint !== `/api/cpe/comprobantes/${data.cpe_id}/pdf`) {
      throw new Error('La representación PDF está incompleta.')
    }
    const pdf = await liveResponse(data.pdf_endpoint)
    blob = await pdf.blob()
    if (!pdf.headers.get('content-type')?.toLowerCase().includes('application/pdf')
      || !(await blob.slice(0, 5).text()).startsWith('%PDF-')) {
      throw new Error('El servidor no devolvió un PDF válido.')
    }
  } else {
    const xml = envelope.data
    if (typeof xml !== 'string' || !xml.trim().startsWith('<')) throw new Error('El XML está incompleto.')
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (document.getElementsByTagName('parsererror').length) throw new Error('El XML recibido no es válido.')
    blob = new Blob([xml], { type: 'application/xml' })
  }
  const currentActor = (await customAuth.getRequestSession()).session?.user
  if (!actor || currentActor?.id !== actor.id || currentActor.tenant_id !== actor.tenant_id) {
    throw new Error('La sesión cambió durante la descarga. Consulte nuevamente el documento.')
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
