'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import DocumentoModal from '@/components/modals/DocumentoModal'

interface Documento {
  id: string
  tipo_documento: string
  serie: string
  numero: string
  fecha_emision: string
  receptor_numero_doc: string
  receptor_razon_social: string
  total: number
  moneda: string
  estado: 'BORRADOR' | 'EMITIDO' | 'ENVIADO_SUNAT' | 'ACEPTADO' | 'RECHAZADO' | 'ANULADO'
  estado_sunat?: string
  observaciones?: string
}

interface DocumentoStats {
  totalDocumentos: number
  facturas: number
  boletas: number
  notasCredito: number
  contratos: number
  pendientesEnvio: number
}

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [stats, setStats] = useState<DocumentoStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDocumento, setSelectedDocumento] = useState<Documento | null>(null)
  const [filters, setFilters] = useState({
    tipo_documento: '',
    estado: '',
    fecha_desde: '',
    fecha_hasta: '',
    receptor_numero_doc: '',
    serie: ''
  })

  const api = useApiCall<Documento[]>()
  const statsApi = useApiCall<DocumentoStats>()

  useEffect(() => {
    loadData()
  }, [filters])

  const loadData = async () => {
    await Promise.all([
      loadDocumentos(),
      loadStats()
    ])
  }

  const loadDocumentos = async () => {
    try {
      const queryParams = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value)
      })

      const response = await api.get(`/api/documentos/lista?${queryParams}`)
      if (response && response.success && response.data) {
        console.log('📊 Documentos recibidos:', response.data)
        setDocumentos(response.data)
      } else {
        console.log('❌ No hay documentos o respuesta incorrecta:', response)
        setDocumentos([])
      }
    } catch (error) {
      console.error('💥 Error al cargar documentos:', error)
      setDocumentos([])
    }
  }

  const loadStats = async () => {
    try {
      const response = await statsApi.get('/api/documentos/stats')
      if (response && response.success && response.data) {
        console.log('📊 Stats documentos recibidas:', response.data)
        setStats(response.data)
      } else {
        console.log('❌ No hay estadísticas documentos o respuesta incorrecta:', response)
        setStats({
          totalDocumentos: 0,
          facturas: 0,
          boletas: 0,
          notasCredito: 0,
          contratos: 0,
          pendientesEnvio: 0
        })
      }
    } catch (error) {
      console.error('💥 Error al cargar estadísticas:', error)
      setStats({
        totalDocumentos: 0,
        facturas: 0,
        boletas: 0,
        notasCredito: 0,
        contratos: 0,
        pendientesEnvio: 0
      })
    }
  }

  const enviarSUNAT = async (documentoId: string) => {
    const response = await api.post(`/api/documentos/${documentoId}/enviar-sunat`)
    if (response && response.success) {
      loadDocumentos() // Reload documents to update status
      showSuccessToast('Documento enviado a SUNAT correctamente')
    } else {
      showErrorToast(response?.message || 'Error al enviar documento a SUNAT')
    }
  }

  const generarXML = async (documentoId: string) => {
    const response = await api.post(`/api/documentos/${documentoId}/generar-xml`)
    if (response && response.success) {
      loadDocumentos() // Reload documents
      showSuccessToast('XML generado correctamente')
    } else {
      showErrorToast(response?.message || 'Error al generar XML')
    }
  }

  const descargarPDF = async (documentoId: string, filename: string) => {
    const response = await api.get(`/api/documentos/${documentoId}/descargar-pdf`)
    if (response && response.success && response.data) {
      // Create and download the file
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      showSuccessToast('PDF descargado correctamente')
    }
  }

  const descargarXML = async (documentoId: string, filename: string) => {
    const response = await api.get(`/api/documentos/${documentoId}/descargar-xml`)
    if (response && response.success && response.data) {
      // Create and download the file
      const blob = new Blob([response.data], { type: 'application/xml' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      showSuccessToast('XML descargado correctamente')
    }
  }

  const anularDocumento = async (documentoId: string, motivo: string) => {
    const response = await api.post(`/api/documentos/${documentoId}/anular`, { motivo })
    if (response && response.success) {
      loadDocumentos()
      showSuccessToast('Documento anulado correctamente')
    } else {
      showErrorToast(response?.message || 'Error al anular documento')
    }
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'BORRADOR':
        return { background: '#6b7280', color: 'white' }
      case 'EMITIDO':
        return { background: '#3b82f6', color: 'white' }
      case 'ENVIADO_SUNAT':
        return { background: '#10b981', color: 'white' }
      case 'ACEPTADO':
        return { background: '#059669', color: 'white' }
      case 'RECHAZADO':
        return { background: '#ef4444', color: 'white' }
      case 'ANULADO':
        return { background: '#dc2626', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getEstadoText = (estado: string) => {
    const estados = {
      'BORRADOR': 'Borrador',
      'EMITIDO': 'Emitido',
      'ENVIADO_SUNAT': 'Enviado SUNAT',
      'ACEPTADO': 'Aceptado',
      'RECHAZADO': 'Rechazado',
      'ANULADO': 'Anulado'
    }
    return estados[estado] || estado
  }

  const getTipoDocumentoDisplay = (tipo: string) => {
    const tipos = {
      'FACTURA': 'Factura',
      'BOLETA': 'Boleta',
      'NOTA_CREDITO': 'Nota de Crédito',
      'NOTA_DEBITO': 'Nota de Débito',
      'CONTRATO': 'Contrato',
      'GUIA_REMISION': 'Guía de Remisión'
    }
    return tipos[tipo] || tipo
  }

  const handleDocumentoCreated = () => {
    loadData() // Reload all data when a new document is created
    setIsModalOpen(false)
    setSelectedDocumento(null)
  }

  const showSuccessToast = (message: string) => {
    if (typeof window !== 'undefined') {
      const toast = document.createElement('div')
      toast.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #10b981;
          color: white;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9999;
          font-weight: 600;
          animation: slideIn 0.3s ease-out;
        ">
          ✅ ${message}
        </div>
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        </style>
      `
      document.body.appendChild(toast)
      setTimeout(() => {
        document.body.removeChild(toast)
      }, 3000)
    }
  }

  const showErrorToast = (message: string) => {
    if (typeof window !== 'undefined') {
      const toast = document.createElement('div')
      toast.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #ef4444;
          color: white;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 9999;
          font-weight: 600;
          animation: slideIn 0.3s ease-out;
        ">
          ❌ ${message}
        </div>
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        </style>
      `
      document.body.appendChild(toast)
      setTimeout(() => {
        document.body.removeChild(toast)
      }, 3000)
    }
  }

  if (api.loading && documentos.length === 0) {
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
            <p>Cargando documentos...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Gestión Documental y Facturación Electrónica</h1>
        <p className="dashboard-subtitle">Gestiona facturas, boletas, notas y contratos con validación SUNAT</p>
        <button 
          className="refresh-btn"
          onClick={() => setIsModalOpen(true)}
        >
          + Crear Documento
        </button>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL DOCUMENTOS</h3>
            <span className="stat-icon">📄</span>
          </div>
          <div className="stat-value">{stats?.totalDocumentos || 0}</div>
          <div className="stat-subtitle">Documentos registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>FACTURAS</h3>
            <span className="stat-icon">🧾</span>
          </div>
          <div className="stat-value">{stats?.facturas || 0}</div>
          <div className="stat-subtitle">Facturas emitidas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>BOLETAS</h3>
            <span className="stat-icon">🎫</span>
          </div>
          <div className="stat-value">{stats?.boletas || 0}</div>
          <div className="stat-subtitle">Boletas emitidas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>NOTAS CRÉDITO</h3>
            <span className="stat-icon">📝</span>
          </div>
          <div className="stat-value">{stats?.notasCredito || 0}</div>
          <div className="stat-subtitle">Notas emitidas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>CONTRATOS</h3>
            <span className="stat-icon">📋</span>
          </div>
          <div className="stat-value">{stats?.contratos || 0}</div>
          <div className="stat-subtitle">Contratos registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>PENDIENTES ENVÍO</h3>
            <span className="stat-icon">⏳</span>
          </div>
          <div className="stat-value">{stats?.pendientesEnvio || 0}</div>
          <div className="stat-subtitle">Por enviar a SUNAT</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ 
        background: 'white', 
        padding: '1.5rem', 
        borderRadius: '12px', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>Filtros de búsqueda</h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem' 
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Tipo de Documento</label>
            <select
              value={filters.tipo_documento}
              onChange={(e) => setFilters(prev => ({ ...prev, tipo_documento: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px'
              }}
            >
              <option value="">Todos los tipos</option>
              <option value="FACTURA">Facturas</option>
              <option value="BOLETA">Boletas</option>
              <option value="NOTA_CREDITO">Notas de Crédito</option>
              <option value="NOTA_DEBITO">Notas de Débito</option>
              <option value="CONTRATO">Contratos</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Estado</label>
            <select
              value={filters.estado}
              onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px'
              }}
            >
              <option value="">Todos los estados</option>
              <option value="BORRADOR">Borrador</option>
              <option value="EMITIDO">Emitido</option>
              <option value="ENVIADO_SUNAT">Enviado SUNAT</option>
              <option value="ACEPTADO">Aceptado</option>
              <option value="RECHAZADO">Rechazado</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>RUC/DNI Cliente</label>
            <input
              type="text"
              value={filters.receptor_numero_doc}
              onChange={(e) => setFilters(prev => ({ ...prev, receptor_numero_doc: e.target.value }))}
              placeholder="Buscar por documento..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Serie</label>
            <input
              type="text"
              value={filters.serie}
              onChange={(e) => setFilters(prev => ({ ...prev, serie: e.target.value }))}
              placeholder="Ej: F001, B001..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Fecha Desde</label>
            <input
              type="date"
              value={filters.fecha_desde}
              onChange={(e) => setFilters(prev => ({ ...prev, fecha_desde: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Fecha Hasta</label>
            <input
              type="date"
              value={filters.fecha_hasta}
              onChange={(e) => setFilters(prev => ({ ...prev, fecha_hasta: e.target.value }))}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px'
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setFilters({
              tipo_documento: '',
              estado: '',
              fecha_desde: '',
              fecha_hasta: '',
              receptor_numero_doc: '',
              serie: ''
            })}
            style={{
              padding: '0.5rem 1rem',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* Documents List */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          padding: '1.5rem', 
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, color: '#1f2937' }}>Lista de Documentos</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                padding: '0.5rem 1rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              + Nuevo Documento
            </button>
            <button
              onClick={loadData}
              style={{
                padding: '0.5rem 1rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              🔄 Actualizar
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>TIPO</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>NÚMERO</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>FECHA</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>CLIENTE</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>TOTAL</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>ESTADO</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((documento) => (
                <tr key={documento.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div>
                      <div style={{ fontWeight: '500' }}>{getTipoDocumentoDisplay(documento.tipo_documento)}</div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div style={{ fontWeight: '500', color: '#1f2937' }}>
                      {documento.serie}-{documento.numero}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    {new Date(documento.fecha_emision).toLocaleDateString('es-PE')}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div>
                      <div style={{ fontWeight: '500' }}>{documento.receptor_razon_social}</div>
                      <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>{documento.receptor_numero_doc}</div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div style={{ fontWeight: '600', color: '#1f2937' }}>
                      {documento.moneda} {documento.total.toFixed(2)}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <span style={{
                      ...getEstadoColor(documento.estado),
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      {getEstadoText(documento.estado)}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {documento.estado === 'BORRADOR' && (
                        <>
                          <button 
                            onClick={() => generarXML(documento.id)}
                            style={{ 
                              background: 'rgba(59, 130, 246, 0.1)', 
                              border: '1px solid rgba(59, 130, 246, 0.2)', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '6px', 
                              color: '#3b82f6', 
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Generar XML
                          </button>
                          <button 
                            onClick={() => {
                              setSelectedDocumento(documento)
                              setIsModalOpen(true)
                            }}
                            style={{ 
                              background: 'rgba(107, 114, 128, 0.1)', 
                              border: '1px solid rgba(107, 114, 128, 0.2)', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '6px', 
                              color: '#6b7280', 
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            Editar
                          </button>
                        </>
                      )}
                      {documento.estado === 'EMITIDO' && (
                        <button 
                          onClick={() => enviarSUNAT(documento.id)}
                          style={{ 
                            background: 'rgba(16, 185, 129, 0.1)', 
                            border: '1px solid rgba(16, 185, 129, 0.2)', 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '6px', 
                            color: '#10b981', 
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Enviar SUNAT
                        </button>
                      )}
                      {['ENVIADO_SUNAT', 'ACEPTADO'].includes(documento.estado) && (
                        <>
                          <button 
                            onClick={() => descargarPDF(documento.id, `${documento.serie}-${documento.numero}.pdf`)}
                            style={{ 
                              background: 'rgba(239, 68, 68, 0.1)', 
                              border: '1px solid rgba(239, 68, 68, 0.2)', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '6px', 
                              color: '#ef4444', 
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            PDF
                          </button>
                          <button 
                            onClick={() => descargarXML(documento.id, `${documento.serie}-${documento.numero}.xml`)}
                            style={{ 
                              background: 'rgba(59, 130, 246, 0.1)', 
                              border: '1px solid rgba(59, 130, 246, 0.2)', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '6px', 
                              color: '#3b82f6', 
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            XML
                          </button>
                        </>
                      )}
                      {!['ANULADO'].includes(documento.estado) && (
                        <button 
                          onClick={() => {
                            const motivo = prompt('Ingrese el motivo de anulación:')
                            if (motivo) {
                              anularDocumento(documento.id, motivo)
                            }
                          }}
                          style={{ 
                            background: 'rgba(220, 38, 38, 0.1)', 
                            border: '1px solid rgba(220, 38, 38, 0.2)', 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '6px', 
                            color: '#dc2626', 
                            cursor: 'pointer',
                            fontSize: '0.75rem'
                          }}
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {documentos.length === 0 && !api.loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
              <h3 style={{ marginBottom: '0.5rem' }}>No hay documentos registrados</h3>
              <p style={{ marginBottom: '1.5rem' }}>Comienza creando tu primer documento</p>
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
                + Crear Primer Documento
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document Modal */}
      <DocumentoModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedDocumento(null)
        }}
        onSuccess={handleDocumentoCreated}
        documento={selectedDocumento}
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