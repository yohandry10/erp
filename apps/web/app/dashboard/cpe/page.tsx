'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useApiCall } from '@/hooks/use-api'
import CpeModal from '@/components/modals/CpeModal'
import CpeA4PreviewModal from '@/components/cpe/CpeA4PreviewModal'
import GreModal from '@/components/modals/GreModal'
import { ComprobantesFilters } from '@/components/cpe/ComprobantesFilters'
import { ComprobantesTable } from '@/components/cpe/ComprobantesTable'
import { AnulacionFinancieraModal } from '@/components/cpe/AnulacionFinancieraModal'
import { ReferencedNoteModal } from '@/components/cpe/ReferencedNoteModal'
import { DianEventsPanel } from '@/components/cpe/DianEventsPanel'
import { VincularCobroCpeModal } from '@/components/cpe/VincularCobroCpeModal'
import { usePermission } from '@/hooks/use-permission'
import { useCountryContext } from '@/hooks/use-country-context'
import { apiSucceeded, unwrapApiObject } from '@/lib/api-contract'
import { fetchApi } from '@/lib/api-fetch'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'
import { cpeList, cpeStats, type CpeDocument } from '@/lib/cpe-read-contract'
import { useCpeRead } from '@/hooks/use-cpe-read'
import { liveCpeFile, saveCpeFile } from '@/lib/cpe-download'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Plus, ShieldCheck } from 'lucide-react'

interface FiscalConfigurationStatus {
  isDemo?: boolean
  fiscal?: {
    isReady?: boolean
    missingItems?: string[]
  }
}

export default function CPEPage() {
  const country = useCountryContext()
  const fiscalLabel = country.servicioFiscal || 'SUNAT'
  const paisCodigo = (country.paisCodigo || 'PE').toUpperCase()
  const isArgentina = paisCodigo === 'AR'
  const isColombia = paisCodigo === 'CO'
  const documentCenterLabel = isArgentina
    ? 'Comprobantes electrónicos ARCA'
    : isColombia
      ? 'Documentos fiscales Colombia'
      : 'CPE'
  const money = new Intl.NumberFormat(country.locale || 'es-PE', {
    style: 'currency',
    currency: country.moneda || 'PEN',
  })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isGreModalOpen, setIsGreModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('')
  const [selectedDocumentSeries, setSelectedDocumentSeries] = useState<string>('')
  const [selectedDocumentNumber, setSelectedDocumentNumber] = useState<string | number>('')
  const [selectedCpeForGre, setSelectedCpeForGre] = useState<CpeDocument | null>(null)
  const [selectedCpeForCancellation, setSelectedCpeForCancellation] = useState<CpeDocument | null>(null)
  const [selectedCpeForLink, setSelectedCpeForLink] = useState<CpeDocument | null>(null)
  const { hasPermission: canManageReceivables, loading: receivablePermissionLoading } = usePermission('finanzas', 'write', 'cxc.cobros')
  const { hasPermission: canSendCpe, loading: sendPermissionLoading } = usePermission('cpe', 'enviar', 'comprobantes')
  const [fiscalConfiguration, setFiscalConfiguration] = useState<FiscalConfigurationStatus | null>(null)
  const [fiscalConfigurationLoading, setFiscalConfigurationLoading] = useState(false)
  const [fiscalConfigurationError, setFiscalConfigurationError] = useState<string | null>(null)
  const directPreviewHandled = useRef<string | null>(null)

  const colombiaFiscalReady = isColombia
    && fiscalConfiguration?.isDemo !== true
    && fiscalConfiguration?.fiscal?.isReady === true
  const canSendToFiscal = paisCodigo === 'PE' || paisCodigo === 'AR' || colombiaFiscalReady
  const colombiaFiscalMissingItems = fiscalConfiguration?.fiscal?.missingItems
    ?.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) ?? []
  const colombiaReadinessMessage = fiscalConfigurationLoading
    ? 'Verificando la habilitación fiscal DIAN…'
    : fiscalConfigurationError
      ? 'No se pudo verificar la habilitación DIAN. Por seguridad, el envío permanece bloqueado.'
      : fiscalConfiguration?.isDemo === true
        ? 'Modo demo: puedes explorar el centro documental, pero no se fabrican aceptaciones DIAN ni se transmite a la autoridad fiscal.'
        : colombiaFiscalReady
          ? 'DIAN habilitada: los comprobantes firmados pueden transmitirse con las credenciales y la numeración validadas.'
          : colombiaFiscalMissingItems.length > 0
            ? `Envío DIAN bloqueado hasta completar: ${colombiaFiscalMissingItems.join(', ')}.`
            : 'Envío DIAN bloqueado hasta validar certificado, software, numeración y constancia HABILITADO del TestSet.'

  const [filters, setFilters] = useState({
    tipoComprobante: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: '',
    cliente: '',
    serie: '',
    moneda: ''
  })
  const [page, setPage] = useState(1)
  const pageSize = 50
  const { post } = useApiCall<CpeDocument[]>()
  const queryParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  Object.entries(filters).forEach(([key, value]) => { if (value) queryParams.set(key, value) })
  const listEndpoint = `/api/cpe/comprobantes?${queryParams}`
  const validateList = useCallback((response: any) => cpeList(response, page, pageSize), [page])
  const list = useCpeRead(listEndpoint, validateList)
  const totals = useCpeRead('/api/cpe/stats', cpeStats)
  const documents = list.data?.documents ?? []
  const totalDocuments = list.data?.total ?? 0
  const documentsLoading = list.loading
  const documentsError = list.error
  const stats = totals.data
  const statsError = totals.error
  const loadDocuments = list.reload
  const loadStats = totals.reload
  const downloadScope = `${list.actor}:${listEndpoint}`
  const activeDownloadScope = useRef(downloadScope)
  activeDownloadScope.current = downloadScope
  const [downloadState, setDownloadState] = useState<{ scope: string; pending: boolean; error: string | null; endpoint: string; filename: string; type: 'pdf' | 'csv' } | null>(null)
  const download = downloadState?.scope === downloadScope ? downloadState : null
  const previousActor = useRef(list.actor)

  useEffect(() => {
    if (previousActor.current !== ':' && previousActor.current !== list.actor) {
      setSelectedCpeForCancellation(null); setSelectedCpeForLink(null); setIsViewModalOpen(false); setIsGreModalOpen(false)
    }
    previousActor.current = list.actor
  }, [list.actor])

  const loadFiscalConfiguration = useCallback(async () => {
    if (!isColombia) {
      setFiscalConfiguration(null)
      setFiscalConfigurationError(null)
      setFiscalConfigurationLoading(false)
      return
    }

    setFiscalConfigurationLoading(true)
    setFiscalConfigurationError(null)
    try {
      const response = await fetchApi('/api/configuration/status', { method: 'GET' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || `HTTP ${response.status}`)
      }
      setFiscalConfiguration(unwrapApiObject<FiscalConfigurationStatus>(payload, {}))
    } catch (error) {
      setFiscalConfiguration(null)
      setFiscalConfigurationError(
        error instanceof Error ? error.message : 'No se pudo leer el estado fiscal DIAN',
      )
    } finally {
      setFiscalConfigurationLoading(false)
    }
  }, [isColombia])

  const loadData = useCallback(async () => {
    await Promise.all([
      loadDocuments(),
      loadStats()
    ])
  }, [loadDocuments, loadStats])

  useEffect(() => {
    void loadFiscalConfiguration()
  }, [loadFiscalConfiguration])

  useEffect(() => {
    const requestedCpeId = new URLSearchParams(window.location.search).get('cpe_id')?.trim()
    if (!requestedCpeId || directPreviewHandled.current === requestedCpeId) return

    directPreviewHandled.current = requestedCpeId
    setSelectedDocumentId(requestedCpeId)
    setSelectedDocumentType('')
    setSelectedDocumentSeries('')
    setSelectedDocumentNumber('')
    setIsViewModalOpen(true)

    const cleanUrl = `${window.location.pathname}${window.location.hash}`
    window.history.replaceState(window.history.state, '', cleanUrl)
  }, [])

  const viewDocument = (documentId: string, documentType: string) => {
    console.log(`📄 Abriendo vista del documento: ${documentId} tipo: ${documentType}`);
    const selected = documents.find((document) => document.id === documentId)
    setSelectedDocumentId(documentId);
    setSelectedDocumentType(documentType);
    setSelectedDocumentSeries(selected?.serie || '')
    setSelectedDocumentNumber(selected?.numero || '')
    setIsViewModalOpen(true);
  }

  const sendToFiscal = async (documentId: string) => {
    if (!canSendToFiscal) {
      alert(isColombia ? `⚠️ ${colombiaReadinessMessage}` : `⚠️ Envío a ${fiscalLabel} no disponible para este país.`)
      return
    }

    const response = await post(`/api/cpe/comprobantes/${documentId}/enviar-sunat`)
    if (apiSucceeded(response)) {
      loadDocuments() // Reload documents to update status
      alert(`✅ Comprobante enviado a ${fiscalLabel} exitosamente`)
    } else {
      alert(`❌ Error enviando a ${fiscalLabel}: ${response?.message || 'Error desconocido'}`)
    }
  }

  const openDownloadedBlob = async (endpoint: string, filename: string, type: 'pdf' | 'csv') => {
    if (!list.data || download?.pending) return
    const scope = downloadScope
    setDownloadState({ scope, pending: true, error: null, endpoint, filename, type })
    try {
      const blob = await liveCpeFile(endpoint, type, totalDocuments)
      if (activeDownloadScope.current !== scope) return
      saveCpeFile(blob, filename)
      setDownloadState(null)
    } catch (error) {
      if (activeDownloadScope.current === scope) setDownloadState({ scope, pending: false, error: error instanceof Error ? error.message : 'No se pudo descargar el archivo. Reintente.', endpoint, filename, type })
    }
  }

  useEffect(() => () => { activeDownloadScope.current = '' }, [])

  const downloadPdf = async (documentId: string) => {
    await openDownloadedBlob(`/api/cpe/comprobantes/${encodeURIComponent(documentId)}/pdf`, `cpe-${documentId}.pdf`, 'pdf')
  }

  const openGreModal = (cpe: CpeDocument) => {
    console.log('🚚 Abriendo modal GRE con datos de CPE:', cpe)
    setSelectedCpeForGre(cpe)
    setIsGreModalOpen(true)
  }

  const handleGreCreated = () => {
    console.log('✅ GRE creada exitosamente')
    setIsGreModalOpen(false)
    setSelectedCpeForGre(null)
  }

  const getStatusText = (estado: string) => {
    switch (estado) {
      case 'ACEPTADO':
        return 'Aceptado'
      case 'FIRMADO':
        return 'Firmado'
      case 'ENVIADO':
        return 'Pendiente'
      case 'ERROR':
        return 'Error técnico reintentable'
      case 'RECHAZADO':
        return 'Rechazado'
      case 'ANULADO':
        return 'Anulado'
      case 'BORRADOR':
        return 'Borrador'
      default:
        return estado
    }
  }

  const getTipoComprobanteText = (tipo: string) => {
    switch (tipo) {
      case '01':
        return 'Factura'
      case '03':
        return isArgentina ? 'Factura B' : isColombia ? 'Factura electrónica' : 'Boleta'
      case '07':
        return 'Nota Crédito'
      case '08':
        return 'Nota Débito'
      case '91':
        return 'Nota Crédito DIAN'
      case '92':
        return 'Nota Débito DIAN'
      default:
        return tipo
    }
  }

  const handleCpeCreated = () => {
    loadData() // Reload all data when a new CPE is created
  }

  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-card/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                ERP {documentCenterLabel}
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">
                {isArgentina
                  ? 'Comprobantes electrónicos'
                  : isColombia
                    ? colombiaFiscalReady ? 'Facturación electrónica DIAN' : 'Preparación de facturas electrónicas'
                    : 'Comprobantes de Pago Electrónicos'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {isArgentina
                  ? 'Facturas A/B/C y notas conectadas a ARCA.'
                  : isColombia
                    ? colombiaReadinessMessage
                    : `Facturas, boletas y notas conectadas a ${fiscalLabel}.`}
              </p>
              <p className="mt-1 max-w-3xl text-sm font-medium text-primary/90">
                Usa “Vista A4” para ver un resumen y abrir el PDF completo que recibirá tu cliente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(paisCodigo === 'PE' || isColombia || isArgentina) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNoteModalOpen(true)}
                  className="gap-2"
                  data-testid="open-referenced-note"
                >
                  <FileText className="h-4 w-4" />
                  {isColombia
                    ? 'Nueva NC / ND DIAN'
                    : isArgentina
                      ? 'Nueva NC / ND ARCA'
                      : 'Nueva NC / ND'}
                </Button>
              )}
              <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                {isArgentina
                  ? 'Nuevo comprobante'
                  : isColombia
                    ? colombiaFiscalReady ? 'Nueva factura DIAN' : 'Nueva factura sin transmisión'
                    : 'Nuevo CPE'}
              </Button>
            </div>
          </div>
        </section>

        {isColombia && (
          <section
            className={`flex items-start gap-3 rounded-2xl border p-4 ${
              colombiaFiscalReady
                ? 'border-emerald-400/30 bg-emerald-500/10'
                : 'border-amber-400/30 bg-amber-500/10'
            }`}
            data-testid="colombia-fiscal-readiness"
            data-ready={colombiaFiscalReady ? 'true' : 'false'}
          >
            <ShieldCheck className={`mt-0.5 h-5 w-5 shrink-0 ${colombiaFiscalReady ? 'text-emerald-500' : 'text-amber-500'}`} />
            <div>
              <p className="font-bold text-foreground">
                {colombiaFiscalReady ? 'Transmisión DIAN habilitada' : 'Transmisión DIAN bloqueada'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{colombiaReadinessMessage}</p>
            </div>
          </section>
        )}

        {isColombia && (
          <DianEventsPanel
            fiscalReady={colombiaFiscalReady}
            isDemo={fiscalConfiguration?.isDemo === true}
            issuedInvoices={documents}
          />
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [isArgentina ? 'Comprobantes hoy' : 'CPE emitidos hoy', stats?.cpeEmitidosHoy ?? '—', 'Comprobantes hoy'],
            [isArgentina ? 'Comprobantes del mes' : 'CPE del mes', stats?.cpeDelMes ?? '—', 'Total del mes'],
            ['Monto facturado', stats ? money.format(stats.montoFacturado) : '—', 'Ingresos del mes'],
            ['Rechazados', stats?.rechazados ?? '—', 'Requieren correccion'],
          ].map(([label, value, description]) => (
            <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">{label}</div>
                  <div className="mt-3 text-3xl font-black text-foreground">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        {statsError && <div role="alert" data-testid="cpe-stats-error" className="flex items-center gap-3"><span>{statsError}</span><Button type="button" onClick={() => void loadStats()}>Reintentar indicadores</Button></div>}
        {download?.error && <div role="alert" data-testid="cpe-download-error" className="flex items-center gap-3"><span>{download.error}</span><Button type="button" onClick={() => void openDownloadedBlob(download.endpoint, download.filename, download.type)}>Reintentar descarga</Button></div>}
        {download?.pending && <p role="status">Descargando archivo…</p>}

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardContent className="p-4">
            <ComprobantesFilters
              filters={{ ...filters }}
              disabledExport={!list.data || Boolean(download?.pending)}
              onChange={(next) => { setPage(1); setFilters((prev) => ({ ...prev, ...next })) }}
              onExport={(f) => {
                const params = new URLSearchParams()
                if (f.tipoComprobante) params.append('tipoComprobante', f.tipoComprobante)
                if (f.estado) params.append('estado', f.estado)
                if (f.serie) params.append('serie', f.serie)
                if (f.moneda) params.append('moneda', f.moneda)
                if (f.fechaDesde) params.append('fechaDesde', f.fechaDesde)
                if (f.fechaHasta) params.append('fechaHasta', f.fechaHasta)
                if (f.cliente) params.append('cliente', f.cliente)
                void openDownloadedBlob(`/api/cpe/comprobantes/export?${params.toString()}`, 'cpe-export.csv', 'csv')
              }}
            />
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardContent className="p-4">
            {documentsError && <div role="alert" data-testid="cpe-list-error" className="mb-3 flex items-center gap-3"><span>{documentsError}</span><Button type="button" onClick={() => { void loadDocuments() }}>Reintentar comprobantes</Button></div>}
            {list.data && <ComprobantesTable
              documents={documents}
              onView={viewDocument}
              onPdf={downloadPdf}
              onSend={sendToFiscal}
              onSent={loadDocuments}
              onSigned={loadDocuments}
              onCancel={paisCodigo === 'PE' ? setSelectedCpeForCancellation : undefined}
              onGre={paisCodigo === 'PE' ? openGreModal : undefined}
              fiscalLabel={fiscalLabel}
              canSend={canSendToFiscal && (paisCodigo !== 'PE' || !sendPermissionLoading && canSendCpe)}
              countryCode={paisCodigo}
              onLinkReceivable={setSelectedCpeForLink}
              canManageReceivables={!receivablePermissionLoading && canManageReceivables}
            />}
            <nav aria-label="Paginación de comprobantes" className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span>{documentsLoading ? 'Cargando comprobantes…' : list.data ? `${totalDocuments} comprobantes · Página ${page} de ${Math.max(1, Math.ceil(totalDocuments / pageSize))}` : 'Listado no disponible'}</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={documentsLoading || page <= 1} onClick={() => setPage(current => current - 1)}>Anterior</Button>
                <Button type="button" variant="outline" disabled={!list.data || page * pageSize >= totalDocuments} onClick={() => setPage(current => current + 1)}>Siguiente</Button>
              </div>
            </nav>
          </CardContent>
        </Card>
      </div>

      {/* CPE Modal */}
      {selectedCpeForLink && <VincularCobroCpeModal cpeId={selectedCpeForLink.id} receptor={selectedCpeForLink.clienteRuc} documento={`${selectedCpeForLink.serie}-${selectedCpeForLink.numero}`} onClose={() => { setSelectedCpeForLink(null); void loadData() }} />}
      <CpeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleCpeCreated}
      />

      <ReferencedNoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        onSuccess={handleCpeCreated}
        countryCode={isColombia ? 'CO' : isArgentina ? 'AR' : 'PE'}
      />

      {/* CPE View Modal */}
      <CpeA4PreviewModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        documentId={selectedDocumentId}
        documentType={selectedDocumentType}
        serie={selectedDocumentSeries}
        numero={selectedDocumentNumber}
      />

      {/* GRE Modal */}
      {!isArgentina && (
        <GreModal
          isOpen={isGreModalOpen}
          onClose={() => setIsGreModalOpen(false)}
          onSuccess={handleGreCreated}
          cpeData={selectedCpeForGre}
        />
      )}

      {selectedCpeForCancellation && (
        <AnulacionFinancieraModal
          cpeId={selectedCpeForCancellation.id}
          label={formatFiscalDocumentNumber(
            paisCodigo,
            selectedCpeForCancellation.serie,
            selectedCpeForCancellation.numero,
          )}
          onClose={() => setSelectedCpeForCancellation(null)}
          onCompleted={loadData}
        />
      )}

    </div>
  )
}
