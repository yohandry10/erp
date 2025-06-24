'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'
import SireReportModal from '@/components/modals/SireReportModal'

interface SireReport {
  id: string
  tipoReporte: string
  periodo: string
  fechaGeneracion: string
  estado: 'GENERANDO' | 'GENERADO' | 'ENVIADO' | 'ERROR'
  registros: number
  archivo?: string
  observaciones?: string
  tipo_display?: string
  filename?: string
  created_at?: string
  total_registros?: number
}

interface SireStats {
  reportesDelMes: number
  registrosTotales: number
  enviadosASunat: number
  pendientes: number
}

export default function SIREPage() {
  const [reports, setReports] = useState<SireReport[]>([])
  const [stats, setStats] = useState<SireStats | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filters, setFilters] = useState({
    periodo: '',
    tipoReporte: ''
  })

  const api = useApiCall<SireReport[]>()
  const statsApi = useApiCall<SireStats>()

  useEffect(() => {
    loadData()
  }, [filters])

  // Auto-reload when there are reports in GENERANDO state
  useEffect(() => {
    const hasGeneratingReports = reports.some(report => report.estado === 'GENERANDO')
    
    if (hasGeneratingReports) {
      const interval = setInterval(() => {
        console.log('🔄 Auto-recargando por reportes en estado GENERANDO...')
        loadData()
      }, 2000) // Check every 2 seconds
      
      return () => clearInterval(interval)
    }
  }, [reports])

  const loadData = async () => {
    await Promise.all([
      loadReports(),
      loadStats()
    ])
  }

  const loadReports = async () => {
    const queryParams = new URLSearchParams()
    if (filters.periodo) queryParams.append('periodo', filters.periodo)
    if (filters.tipoReporte) queryParams.append('tipoReporte', filters.tipoReporte)

    const response = await api.get(`/api/sire/reportes?${queryParams}`)
    if (response && response.success && response.data) {
      console.log('📊 SIRE Reports recibidos:', response.data)
      setReports(response.data)
    } else {
      console.log('❌ No hay reportes SIRE o respuesta incorrecta:', response)
      setReports([])
    }
  }

  const loadStats = async () => {
    const response = await statsApi.get('/api/sire/stats')
    if (response && response.success && response.data) {
      console.log('📊 SIRE Stats recibidas:', response.data)
      setStats(response.data)
    } else {
      console.log('❌ No hay estadísticas SIRE o respuesta incorrecta:', response)
      setStats({
        reportesDelMes: 0,
        registrosTotales: 0,
        enviadosASunat: 0,
        pendientes: 0
      })
    }
  }

  const downloadReport = async (reportId: string, filename: string) => {
    const response = await api.get(`/api/sire/reportes/${reportId}/download`)
    if (response && response.success && response.data) {
      // Create and download the file
      const blob = new Blob([response.data], { type: 'text/plain' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }
  }

  const sendToSunat = async (reportId: string) => {
    const response = await api.post(`/api/sire/reportes/${reportId}/enviar-sunat`)
    if (response && response.success) {
      loadReports() // Reload reports to update status
    }
  }

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'GENERADO':
        return { background: '#10b981', color: 'white' }
      case 'ENVIADO':
        return { background: '#3b82f6', color: 'white' }
      case 'GENERANDO':
        return { background: '#f59e0b', color: 'white' }
      case 'ERROR':
        return { background: '#ef4444', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getStatusText = (estado: string) => {
    switch (estado) {
      case 'GENERADO':
        return 'Generado'
      case 'ENVIADO':
        return 'Enviado'
      case 'GENERANDO':
        return 'Generando'
      case 'ERROR':
        return 'Error'
      default:
        return estado
    }
  }

  const handleReportGenerated = () => {
    loadData() // Reload all data when a new report is generated
  }

  if (api.loading && reports.length === 0) {
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
            <p>Cargando reportes SIRE...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">SIRE - Sistema de Registros Electrónicos</h1>
        <p className="dashboard-subtitle">Genera tus reportes para SUNAT</p>
        <button 
          className="refresh-btn"
          onClick={() => setIsModalOpen(true)}
        >
          + Generar Reporte
        </button>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>REPORTES DEL MES</h3>
            <span className="stat-icon">📊</span>
          </div>
          <div className="stat-value">{stats?.reportesDelMes || 0}</div>
          <div className="stat-subtitle">Reportes generados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>REGISTROS TOTALES</h3>
            <span className="stat-icon">📋</span>
          </div>
          <div className="stat-value">{stats?.registrosTotales?.toLocaleString() || '0'}</div>
          <div className="stat-subtitle">Transacciones procesadas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ENVIADOS A SUNAT</h3>
            <span className="stat-icon">✅</span>
          </div>
          <div className="stat-value">{stats?.enviadosASunat || 0}</div>
          <div className="stat-subtitle">Reportes enviados</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>PENDIENTES</h3>
            <span className="stat-icon">⏳</span>
          </div>
          <div className="stat-value warning">{stats?.pendientes || 0}</div>
          <div className="stat-subtitle">Por enviar</div>
        </div>
      </div>

      {/* Period Selection */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Reportes SIRE</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input
              type="month"
              value={filters.periodo}
              onChange={(e) => setFilters(prev => ({ ...prev, periodo: e.target.value }))}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            />
            
            <select 
              value={filters.tipoReporte}
              onChange={(e) => setFilters(prev => ({ ...prev, tipoReporte: e.target.value }))}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            >
              <option value="">Todos los tipos</option>
              <option value="REGISTRO_VENTAS">Registro de Ventas</option>
              <option value="REGISTRO_COMPRAS">Registro de Compras</option>
              <option value="LIBROS_ELECTRONICOS">Libros Electrónicos</option>
              <option value="RETENCIONES">Retenciones</option>
            </select>

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

        {/* Reports Table */}
        <div className="activity-card">
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Periodo</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Tipo de Reporte</th>
                  <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Fecha Generación</th>
                  <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600' }}>Registros</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Estado</th>
                  <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => {
                  const statusColor = getStatusColor(report.estado)
                  return (
                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={report.id}>
                      <td style={{ padding: '1rem', fontWeight: '600' }}>
                        {report.periodo}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: '600' }}>{report.tipo_display || report.tipo || 'N/A'}</div>
                          {report.filename && (
                            <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                              {report.filename}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {report.created_at ? new Date(report.created_at).toLocaleDateString('es-PE') : 'N/A'}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600' }}>
                        {(report.total_registros || 0).toLocaleString()}
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
                          {getStatusText(report.estado)}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          {report.estado === 'GENERADO' && (
                            <>
                              <button 
                                onClick={() => downloadReport(report.id, report.filename || 'reporte.txt')}
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
                                Descargar
                              </button>
                              <button 
                                onClick={() => sendToSunat(report.id)}
                                style={{ 
                                  background: 'rgba(16, 185, 129, 0.1)', 
                                  border: '1px solid rgba(16, 185, 129, 0.2)', 
                                  padding: '0.5rem 1rem', 
                                  borderRadius: '6px', 
                                  color: '#10b981', 
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                Enviar SUNAT
                              </button>
                            </>
                          )}
                          {report.estado === 'ENVIADO' && (
                            <button 
                              onClick={() => downloadReport(report.id, report.filename || 'reporte.txt')}
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
                              Descargar
                            </button>
                          )}
                          {report.estado === 'GENERANDO' && (
                            <span style={{ 
                              padding: '0.5rem 1rem', 
                              fontSize: '0.8rem',
                              color: '#f59e0b'
                            }}>
                              Procesando...
                            </span>
                          )}
                          {report.estado === 'ERROR' && (
                            <button 
                              onClick={() => setIsModalOpen(true)}
                              style={{ 
                                background: 'rgba(239, 68, 68, 0.1)', 
                                border: '1px solid rgba(239, 68, 68, 0.2)', 
                                padding: '0.5rem 1rem', 
                                borderRadius: '6px', 
                                color: '#ef4444', 
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                            >
                              Reintentar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {reports.length === 0 && !api.loading && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                <h3 style={{ marginBottom: '0.5rem' }}>No hay reportes SIRE</h3>
                <p style={{ marginBottom: '1.5rem' }}>Comienza generando tu primer reporte para SUNAT</p>
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
                  + Generar Primer Reporte
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SIRE Report Modal */}
      <SireReportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleReportGenerated}
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