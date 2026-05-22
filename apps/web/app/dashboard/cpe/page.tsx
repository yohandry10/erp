'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import CpeModal from '@/components/modals/CpeModal'
import CpeViewModal from '@/components/modals/CpeViewModal'
import GreModal from '@/components/modals/GreModal'
import { ComprobantesFilters } from '@/components/cpe/ComprobantesFilters'
import { ComprobantesTable } from '@/components/cpe/ComprobantesTable'
import { useCountryContext } from '@/hooks/use-country-context'
import { apiSucceeded, unwrapApiArray, unwrapApiObject } from '@/lib/api-contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Plus, ShieldCheck } from 'lucide-react'

interface CpeDocument {
  id: string
  tipoDocumento?: string
  tipoComprobante: string
  serie: string
  numero: number
  fechaEmision: string
  cliente: string
  clienteRuc: string
  total: number
  moneda: string
  estado: 'BORRADOR' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO'
  estadoSunat?: string
  observaciones?: string
  fechaCreacion: string
}

interface CpeStats {
  cpeEmitidosHoy: number
  cpeDelMes: number
  montoFacturado: number
  rechazados: number
}

export default function CPEPage() {
  const country = useCountryContext()
  const fiscalLabel = country.servicioFiscal || 'SUNAT'
  const paisCodigo = (country.paisCodigo || 'PE').toUpperCase()
  const canSendToFiscal = paisCodigo === 'PE'

  const [documents, setDocuments] = useState<CpeDocument[]>([])
  const [stats, setStats] = useState<CpeStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isGreModalOpen, setIsGreModalOpen] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('')
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('')
  const [selectedCpeForGre, setSelectedCpeForGre] = useState<CpeDocument | null>(null)

  const [filters, setFilters] = useState({
    tipoComprobante: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: '',
    cliente: '',
    serie: '',
    moneda: ''
  })

  const { get, post } = useApiCall<CpeDocument[]>()
  const { get: getStats } = useApiCall<CpeStats>()

  const loadDocuments = useCallback(async () => {
    const queryParams = new URLSearchParams()
    if (filters.tipoComprobante) queryParams.append('tipoComprobante', filters.tipoComprobante)
    if (filters.estado) queryParams.append('estado', filters.estado)
    if (filters.serie) queryParams.append('serie', filters.serie)
    if (filters.moneda) queryParams.append('moneda', filters.moneda)
    if (filters.fechaDesde) queryParams.append('fechaDesde', filters.fechaDesde)
    if (filters.fechaHasta) queryParams.append('fechaHasta', filters.fechaHasta)
    if (filters.cliente) queryParams.append('cliente', filters.cliente)

    console.log('📄 CPE: Cargando comprobantes...', { filters, queryParams: queryParams.toString() })
    const response = await get(`/api/cpe/comprobantes?${queryParams}`)
    console.log('📄 CPE: Respuesta completa de comprobantes:', response)

    const documents = unwrapApiArray<CpeDocument>(response)
    if (apiSucceeded(response)) {
      console.log('📄 CPE: Datos de comprobantes recibidos:', documents.length)
      setDocuments(documents)
    } else {
      console.warn('⚠️ CPE: No se recibieron datos de comprobantes o hay error:', response?.message)
      setDocuments([])
    }
  }, [get, filters])

  const loadStats = useCallback(async () => {
    console.log('📊 CPE: Cargando estadísticas...')
    const response = await getStats('/api/cpe/stats')
    console.log('📊 CPE: Respuesta completa de estadísticas:', response)

    if (apiSucceeded(response)) {
      const stats = unwrapApiObject<CpeStats>(response, {
        cpeEmitidosHoy: 0,
        cpeDelMes: 0,
        montoFacturado: 0,
        rechazados: 0,
      })
      console.log('📊 CPE: Estadísticas recibidas:', stats)
      setStats(stats)
    } else {
      console.warn('⚠️ CPE: No se recibieron estadísticas o hay error:', response?.message)
      setStats(null)
    }
  }, [getStats])

  const loadData = useCallback(async () => {
    await Promise.all([
      loadDocuments(),
      loadStats()
    ])
  }, [loadDocuments, loadStats])

  useEffect(() => {
    loadData()
  }, [loadData])

  const viewDocument = (documentId: string, documentType: string) => {
    console.log(`📄 Abriendo vista del documento: ${documentId} tipo: ${documentType}`);
    setSelectedDocumentId(documentId);
    setSelectedDocumentType(documentType);
    setIsViewModalOpen(true);
  }

  const sendToFiscal = async (documentId: string) => {
    if (!canSendToFiscal) {
      alert(`⚠️ Envío a ${fiscalLabel} no disponible para este país.`)
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
        return 'Boleta'
      case '07':
        return 'Nota Crédito'
      case '08':
        return 'Nota Débito'
      default:
        return tipo
    }
  }

  const handleCpeCreated = () => {
    loadData() // Reload all data when a new CPE is created
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-cyan-100">
                ERP CPE Center
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Comprobantes de Pago Electronicos</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">Facturas, boletas y notas conectadas a {fiscalLabel}.</p>
            </div>
            <Button type="button" onClick={() => setIsModalOpen(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <Plus className="h-4 w-4" />
              Nuevo CPE
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['CPE emitidos hoy', stats?.cpeEmitidosHoy || 0, 'Comprobantes hoy'],
            ['CPE del mes', stats?.cpeDelMes || 0, 'Total del mes'],
            ['Monto facturado', `S/ ${stats?.montoFacturado?.toLocaleString() || '0'}`, 'Ingresos del mes'],
            ['Rechazados', stats?.rechazados || 0, 'Requieren correccion'],
          ].map(([label, value, description]) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">{label}</div>
                  <div className="mt-3 text-3xl font-black text-white">{value}</div>
                  <div className="mt-1 text-xs text-cyan-100/55">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-100">
                  <FileText className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardContent className="p-4">
            <ComprobantesFilters
              filters={{ ...filters }}
              onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
              onExport={(f) => {
                const params = new URLSearchParams()
                if (f.tipoComprobante) params.append('tipoComprobante', f.tipoComprobante)
                if (f.estado) params.append('estado', f.estado)
                if (f.serie) params.append('serie', f.serie)
                if (f.moneda) params.append('moneda', f.moneda)
                if (f.fechaDesde) params.append('fechaDesde', f.fechaDesde)
                if (f.fechaHasta) params.append('fechaHasta', f.fechaHasta)
                if (f.cliente) params.append('cliente', f.cliente)
                window.open(`/api/cpe/comprobantes/export?${params.toString()}`, '_blank')
              }}
            />
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardContent className="p-4">
            <ComprobantesTable
              documents={documents}
              onView={viewDocument}
              onSend={sendToFiscal}
              onGre={openGreModal}
              fiscalLabel={fiscalLabel}
              canSend={canSendToFiscal}
            />
          </CardContent>
        </Card>
      </div>

      {/* CPE Modal */}
      <CpeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleCpeCreated}
      />

      {/* CPE View Modal */}
      <CpeViewModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        documentId={selectedDocumentId}
        documentType={selectedDocumentType}
      />

      {/* GRE Modal */}
      <GreModal
        isOpen={isGreModalOpen}
        onClose={() => setIsGreModalOpen(false)}
        onSuccess={handleGreCreated}
        cpeData={selectedCpeForGre}
      />

    </div>
  )
}
