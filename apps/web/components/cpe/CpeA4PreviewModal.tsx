'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2, X } from 'lucide-react'
import { fetchApi } from '@/lib/api-fetch'
import { useDemoStatus } from '@/hooks/useDemoStatus'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CpePreviewMetadata {
  tipo_documento?: string
  tipoDocumento?: string
  serie?: string
  numero?: string | number
}

interface CpeA4PreviewModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string
  documentType?: string
  serie?: string
  numero?: string | number
}

const documentName = (type?: string) => {
  const normalized = String(type || '').toUpperCase()
  if (normalized.includes('03') || normalized.includes('BOLETA')) return 'Boleta de venta'
  if (normalized.includes('07') || normalized.includes('CRÉDITO') || normalized.includes('CREDITO')) return 'Nota de crédito'
  if (normalized.includes('08') || normalized.includes('DÉBITO') || normalized.includes('DEBITO')) return 'Nota de débito'
  return 'Factura'
}

export default function CpeA4PreviewModal({
  isOpen,
  onClose,
  documentId,
  documentType,
  serie,
  numero,
}: CpeA4PreviewModalProps) {
  const { isDemoTenant } = useDemoStatus()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<CpePreviewMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resolvedType = documentType || metadata?.tipo_documento || metadata?.tipoDocumento
  const resolvedSerie = serie || metadata?.serie
  const resolvedNumero = numero || metadata?.numero
  const label = useMemo(() => documentName(resolvedType), [resolvedType])
  const numberLabel = resolvedSerie
    ? `${resolvedSerie}-${String(resolvedNumero ?? '').padStart(8, '0')}`
    : documentId

  useEffect(() => {
    if (!isOpen || !documentId) return

    const controller = new AbortController()
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)
    setPdfUrl(null)
    setMetadata(null)

    const encodedId = encodeURIComponent(documentId)
    const loadMetadata = fetchApi(`/api/cpe/comprobantes/${encodedId}`, {
      method: 'GET',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return null
      const payload = await response.json().catch(() => null)
      return (payload?.data ?? payload) as CpePreviewMetadata | null
    }).catch(() => null)

    const loadPdf = fetchApi(`/api/cpe/comprobantes/${encodedId}/pdf`, {
      method: 'GET',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(detail || `El servidor respondió ${response.status}`)
      }
      const blob = await response.blob()
      if (!blob.size || !String(blob.type || 'application/pdf').includes('pdf')) {
        throw new Error('La representación A4 recibida no es un PDF válido')
      }
      return blob
    })

    void Promise.all([loadPdf, loadMetadata])
      .then(([blob, cpeMetadata]) => {
        objectUrl = window.URL.createObjectURL(blob)
        setMetadata(cpeMetadata)
        setPdfUrl(objectUrl)
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return
        console.error('No se pudo cargar la vista previa A4 del CPE:', loadError)
        setError('No se pudo preparar la vista previa A4. Intenta nuevamente.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => {
      controller.abort()
      if (objectUrl) window.URL.revokeObjectURL(objectUrl)
    }
  }, [documentId, isOpen])

  const downloadPdf = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = `${label.toLowerCase().replace(/\s+/g, '-')}-${numberLabel}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const openPdf = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cpe-a4-preview-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-cyan-400/20 bg-background text-foreground shadow-2xl shadow-cyan-950/40">
        <header className="flex flex-col gap-3 border-b border-cyan-400/10 bg-card/95 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-primary">
                Vista previa A4
              </Badge>
              <Badge variant="outline">210 × 297 mm</Badge>
              {isDemoTenant && (
                <Badge className="border-amber-400/30 bg-amber-400/15 text-amber-700 dark:text-amber-200">
                  Muestra demo · sin validez SUNAT
                </Badge>
              )}
            </div>
            <h2 id="cpe-a4-preview-title" className="mt-2 text-xl font-bold text-foreground">
              {label} {numberLabel}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta es la representación que verá el cliente al abrir o descargar el comprobante.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={downloadPdf} disabled={!pdfUrl}>
              <Download className="mr-2 h-4 w-4" />
              Descargar A4
            </Button>
            <Button type="button" onClick={openPdf} disabled={!pdfUrl}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir / imprimir
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Cerrar vista previa A4">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="max-h-[calc(100vh-11rem)] overflow-auto bg-slate-200 p-3 sm:p-6 dark:bg-slate-950">
          {loading ? (
            <div className="flex min-h-[28rem] flex-col items-center justify-center gap-3 text-slate-700 dark:text-slate-200">
              <Loader2 className="h-9 w-9 animate-spin" />
              <p>Cargando representación A4…</p>
            </div>
          ) : error ? (
            <Alert className="mx-auto max-w-2xl border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-200">
              <FileText className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : pdfUrl ? (
            <div
              className="mx-auto aspect-[210/297] w-full max-w-[794px] overflow-hidden bg-white shadow-2xl"
              data-testid="cpe-a4-sheet"
              aria-label="Hoja A4 de 210 por 297 milímetros"
            >
              <iframe
                title={`Vista previa A4 de ${label} ${numberLabel}`}
                src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                className="h-full w-full border-0 bg-white"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
