'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import CpeModal from '@/components/modals/CpeModal'
import CpeViewModal from '@/components/modals/CpeViewModal'
import GreModal from '@/components/modals/GreModal'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { ComprobantesFilters } from '@/components/cpe/ComprobantesFilters'
import { ComprobantesTable } from '@/components/cpe/ComprobantesTable'
import { useCountryContext } from '@/hooks/use-country-context'

interface CpeDocument {
  id: string
  tipoComprobante: string
  serie: string
  numero: number
  fechaEmision: string
  cliente: string
  clienteRuc: string
  total: number
  moneda: string
  estado: 'BORRADOR' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO'
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

  const api = useApiCall<CpeDocument[]>()
  const statsApi = useApiCall<CpeStats>()

  useEffect(() => {
    loadData()
  }, [filters])

  const loadData = async () => {
    await Promise.all([
      loadDocuments(),
      loadStats()
    ])
  }

  const loadDocuments = async () => {
    const queryParams = new URLSearchParams()
    if (filters.tipoComprobante) queryParams.append('tipoComprobante', filters.tipoComprobante)
    if (filters.estado) queryParams.append('estado', filters.estado)
    if (filters.serie) queryParams.append('serie', filters.serie)
    if (filters.moneda) queryParams.append('moneda', filters.moneda)
    if (filters.fechaDesde) queryParams.append('fechaDesde', filters.fechaDesde)
    if (filters.fechaHasta) queryParams.append('fechaHasta', filters.fechaHasta)
    if (filters.cliente) queryParams.append('cliente', filters.cliente)

    console.log('📄 CPE: Cargando comprobantes...', { filters, queryParams: queryParams.toString() })
    const response = await api.get(`/api/cpe/comprobantes?${queryParams}`)
    console.log('📄 CPE: Respuesta completa de comprobantes:', response)
    
    if (response && response.success && response.data) {
      console.log('📄 CPE: Datos de comprobantes recibidos:', response.data.length)
      setDocuments(response.data)
    } else {
      console.warn('⚠️ CPE: No se recibieron datos de comprobantes o hay error:', response?.message)
      setDocuments([])
    }
  }

  const loadStats = async () => {
    console.log('📊 CPE: Cargando estadísticas...')
    const response = await statsApi.get('/api/cpe/stats')
    console.log('📊 CPE: Respuesta completa de estadísticas:', response)
    
    if (response && response.success && response.data) {
      console.log('📊 CPE: Estadísticas recibidas:', response.data)
      setStats(response.data)
    } else {
      console.warn('⚠️ CPE: No se recibieron estadísticas o hay error:', response?.message)
      setStats(null)
    }
  }

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

    const response = await api.post(`/api/cpe/comprobantes/${documentId}/enviar-sunat`)
    if (response && response.success) {
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

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'ACEPTADO':
        return { background: '#10b981', color: 'white' }
      case 'ENVIADO':
        return { background: '#f59e0b', color: 'white' }
      case 'RECHAZADO':
        return { background: '#ef4444', color: 'white' }
      case 'BORRADOR':
        return { background: '#6b7280', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getStatusText = (estado: string) => {
    switch (estado) {
      case 'ACEPTADO':
        return 'Aceptado'
      case 'ENVIADO':
        return 'Pendiente'
      case 'RECHAZADO':
        return 'Rechazado'
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

  if (api.loading && documents.length === 0) {
    return (
      <div className="dashboard-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              border: '4px solid #f3f4f6', 
              borderTop: '4px solid #3b82f6', 
              borderRadius: '50%', 
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem'
            }}></div>
            <p>Cargando comprobantes...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Comprobantes de Pago Electrónicos (CPE)</h1>
        <p className="dashboard-subtitle">Gestiona facturas, boletas y notas de crédito/débito</p>
        <button 
          className="refresh-btn"
          onClick={() => setIsModalOpen(true)}
        >
          + Nuevo CPE
        </button>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>CPE EMITIDOS HOY</h3>
            <span className="stat-icon">📄</span>
          </div>
          <div className="stat-value">{stats?.cpeEmitidosHoy || 0}</div>
          <div className="stat-subtitle">Comprobantes hoy</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>CPE DEL MES</h3>
            <span className="stat-icon">📈</span>
          </div>
          <div className="stat-value">{stats?.cpeDelMes || 0}</div>
          <div className="stat-subtitle">Total del mes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>MONTO FACTURADO</h3>
            <span className="stat-icon">💰</span>
          </div>
          <div className="stat-value">S/ {stats?.montoFacturado?.toLocaleString() || '0'}</div>
          <div className="stat-subtitle">Ingresos del mes</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>RECHAZADOS</h3>
            <span className="stat-icon">❌</span>
          </div>
          <div className="stat-value warning">{stats?.rechazados || 0}</div>
          <div className="stat-subtitle">Requieren corrección</div>
        </div>
      </div>

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

        <div className="activity-card">
          <ComprobantesTable
            documents={documents}
            onView={viewDocument}
            onSend={sendToFiscal}
            onGre={openGreModal}
            fiscalLabel={fiscalLabel}
            canSend={canSendToFiscal}
          />
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

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
