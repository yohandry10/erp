'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import CpeModal from '@/components/modals/CpeModal'
import CpeViewModal from '@/components/modals/CpeViewModal'
import GreModal from '@/components/modals/GreModal'

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
    cliente: ''
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

  const sendToSunat = async (documentId: string) => {
    const response = await api.post(`/api/cpe/comprobantes/${documentId}/enviar-sunat`)
    if (response && response.success) {
      loadDocuments() // Reload documents to update status
      alert('✅ Comprobante enviado a SUNAT exitosamente')
    } else {
      alert(`❌ Error enviando a SUNAT: ${response?.message || 'Error desconocido'}`)
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

      {/* Filters */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Lista de Comprobantes</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <select 
              value={filters.tipoComprobante}
              onChange={(e) => setFilters(prev => ({ ...prev, tipoComprobante: e.target.value }))}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            >
              <option value="">Todos los tipos</option>
              <option value="01">Facturas</option>
              <option value="03">Boletas</option>
              <option value="07">Notas de Crédito</option>
              <option value="08">Notas de Débito</option>
            </select>
            
            <select 
              value={filters.estado}
              onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value }))}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            >
              <option value="">Todos los estados</option>
              <option value="BORRADOR">Borrador</option>
              <option value="ENVIADO">Enviado</option>
              <option value="ACEPTADO">Aceptado</option>
              <option value="RECHAZADO">Rechazado</option>
            </select>

            <input
              type="date"
              value={filters.fechaDesde}
              onChange={(e) => setFilters(prev => ({ ...prev, fechaDesde: e.target.value }))}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            />

            <input
              type="date"
              value={filters.fechaHasta}
              onChange={(e) => setFilters(prev => ({ ...prev, fechaHasta: e.target.value }))}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            />

            <input
              type="text"
              placeholder="Buscar cliente..."
              value={filters.cliente}
              onChange={(e) => setFilters(prev => ({ ...prev, cliente: e.target.value }))}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            />

            <button
              onClick={loadData}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                cursor: 'pointer'
              }}
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        {/* Documents Table */}
        <div className="activity-card">
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Serie-Número</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Tipo</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Cliente</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Fecha</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Importe</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Estado</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(documents) && documents.map((doc) => {
                  const statusColor = getStatusColor(doc.estado)
                  return (
                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={doc.id}>
                      <td style={{ padding: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                        {doc.serie}-{doc.numero.toString().padStart(8, '0')}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: '#3b82f6',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          fontWeight: '500'
                        }}>
                          {getTipoComprobanteText(doc.tipoComprobante)}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: '600' }}>{doc.cliente}</div>
                          <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                            {doc.clienteRuc}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {new Date(doc.fechaEmision).toLocaleDateString('es-PE')}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                        {doc.moneda} {doc.total.toFixed(2)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{ 
                          background: statusColor.background,
                          color: statusColor.color, 
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '20px', 
                          fontSize: '0.8rem',
                          fontWeight: '500'
                        }}>
                          {getStatusText(doc.estado)}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button 
                            onClick={() => viewDocument(doc.id, doc.tipoComprobante)}
                            style={{ 
                              background: 'rgba(59, 130, 246, 0.1)', 
                              border: '1px solid rgba(59, 130, 246, 0.2)', 
                              padding: '0.5rem 1rem', 
                              borderRadius: '6px', 
                              color: '#3b82f6', 
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            👁️ Ver
                          </button>
                          
                          {/* Botón GRE - Solo para facturas y boletas ACEPTADAS */}
                          {(doc.tipoComprobante === '01' || doc.tipoComprobante === '03') && 
                           doc.estado === 'ACEPTADO' && (
                            <button 
                              onClick={() => openGreModal(doc)}
                              style={{ 
                                background: 'rgba(34, 197, 94, 0.1)', 
                                border: '1px solid rgba(34, 197, 94, 0.2)', 
                                padding: '0.5rem 1rem', 
                                borderRadius: '6px', 
                                color: '#22c55e', 
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                              title="Crear Guía de Remisión Electrónica"
                            >
                              🚚 GRE
                            </button>
                          )}
                          
                          {doc.estado === 'BORRADOR' && (
                            <button 
                              onClick={() => sendToSunat(doc.id)}
                              style={{ 
                                background: 'rgba(245, 158, 11, 0.1)', 
                                border: '1px solid rgba(245, 158, 11, 0.2)', 
                                padding: '0.5rem 1rem', 
                                borderRadius: '6px', 
                                color: '#f59e0b', 
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                            >
                              📤 Enviar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {Array.isArray(documents) && documents.length === 0 && !api.loading && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                <h3 style={{ marginBottom: '0.5rem' }}>No hay comprobantes</h3>
                <p style={{ marginBottom: '1.5rem' }}>Comienza creando tu primer comprobante electrónico</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  + Crear Primer CPE
                </button>
              </div>
            )}
          </div>
        </div>
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