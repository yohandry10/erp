'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'
import CotizacionModal from '@/components/modals/CotizacionModal'
import CotizacionViewModal from '@/components/modals/CotizacionViewModal'

interface Cotizacion {
  id: string
  numero: string
  cliente_id: string
  fecha_cotizacion: string
  fecha_vencimiento: string
  vendedor: string
  moneda: string
  subtotal: number
  igv: number
  total: number
  estado: string
  probabilidad: number
  items: any
  observaciones?: string
  clientes?: {
    nombres?: string
    apellidos?: string
    razon_social?: string
    numero_documento: string
  } | {
    nombres?: string
    apellidos?: string
    razon_social?: string
    numero_documento: string
  }[]
}

interface ClienteTop {
  id: string
  nombre: string
  ruc: string
  cotizaciones: number
  totalCotizado: number
  conversion: number
  ultimaCotizacion: string
}

interface Stats {
  cotizacionesDelMes: number
  valorCotizado: number
  tasaConversion: number
  porVencer: number
}

export default function CotizacionesPage() {
  const { get } = useApi()
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [clientesTop, setClientesTop] = useState<ClienteTop[]>([])
  const [stats, setStats] = useState<Stats>({
    cotizacionesDelMes: 0,
    valorCotizado: 0,
    tasaConversion: 0,
    porVencer: 0
  })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    estado: '',
    vendedor: '',
    fecha_desde: '',
    fecha_hasta: ''
  })
  const [showCotizacionModal, setShowCotizacionModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedCotizacion, setSelectedCotizacion] = useState<Cotizacion | null>(null)

  // Cargar datos iniciales
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Cargar datos en paralelo
      const [statsResponse, cotizacionesResponse, clientesResponse] = await Promise.all([
        loadStats(),
        loadCotizaciones(),
        loadClientesTop()
      ])
      
      console.log('📊 Datos cargados exitosamente')
    } catch (error) {
      console.error('❌ Error cargando datos:', error)
      toast({
        title: "Error",
        description: "Error al cargar los datos de cotizaciones",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await get('/api/cotizaciones/stats')
      if (response && response.success) {
        setStats(response.data)
        console.log('📊 Estadísticas cargadas:', response.data)
      } else {
        console.log('⚠️ Respuesta stats:', response)
      }
      return response
    } catch (error) {
      console.error('❌ Error cargando estadísticas:', error)
      return null
    }
  }

  const loadCotizaciones = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.estado) params.append('estado', filters.estado)
      if (filters.vendedor) params.append('vendedor', filters.vendedor)
      if (filters.fecha_desde) params.append('fecha_desde', filters.fecha_desde)
      if (filters.fecha_hasta) params.append('fecha_hasta', filters.fecha_hasta)

      const response = await get(`/api/cotizaciones/lista?${params.toString()}`)
      if (response && response.success && Array.isArray(response.data)) {
        setCotizaciones(response.data)
        console.log(`📄 ${response.data.length} cotizaciones cargadas`)
      } else {
        console.log('❌ No hay cotizaciones o respuesta incorrecta:', response)
        setCotizaciones([])
      }
      return response
    } catch (error) {
      console.error('❌ Error cargando cotizaciones:', error)
      setCotizaciones([])
      return null
    }
  }

  const loadClientesTop = async () => {
    try {
      const response = await get('/api/cotizaciones/clientes-top')
      if (response.success && Array.isArray(response.data)) {
        setClientesTop(response.data)
        console.log(`👥 ${response.data.length} clientes principales cargados`)
      } else {
        console.log('❌ No hay clientes o respuesta incorrecta:', response.data)
        setClientesTop([])
      }
      return response
    } catch (error) {
      console.error('❌ Error cargando clientes principales:', error)
      setClientesTop([])
      return null
    }
  }

  // Aplicar filtros
  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  const applyFilters = () => {
    loadCotizaciones()
  }

  const clearFilters = () => {
    setFilters({
      estado: '',
      vendedor: '',
      fecha_desde: '',
      fecha_hasta: ''
    })
    setTimeout(loadCotizaciones, 100)
  }

  const handleCrearCotizacion = () => {
    setShowCotizacionModal(true)
  }

  const handleCotizacionCreated = () => {
    loadData() // Recargar datos después de crear cotización
  }

  const handleVerCotizacion = (cotizacion: Cotizacion) => {
    setSelectedCotizacion(cotizacion)
    setShowViewModal(true)
  }

  const getStatusColor = (estado: string) => {
    // Normalizar el estado para manejo consistente
    const estadoNormalizado = estado?.toUpperCase().trim() || 'BORRADOR';
    
    switch (estadoNormalizado) {
      case 'BORRADOR':
      case 'PENDIENTE': // Legacy - convertir a BORRADOR
        return { background: '#6b7280', color: 'white' }
      case 'ENVIADA':
        return { background: '#3b82f6', color: 'white' }
      case 'VENCIDA':
        return { background: '#dc2626', color: 'white' }
      case 'CONVERTIDA':
        return { background: '#059669', color: 'white' }
      default:
        // Para cualquier estado raro, usar BORRADOR
        console.warn(`⚠️ Estado desconocido en cotización: "${estado}". Usando BORRADOR por defecto.`);
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getProbabilityColor = (prob: number) => {
    if (prob >= 80) return '#10b981'
    if (prob >= 60) return '#f59e0b'
    if (prob >= 40) return '#f59e0b'
    return '#ef4444'
  }

  const getConversionColor = (conv: number) => {
    if (conv >= 80) return '#10b981'
    if (conv >= 60) return '#f59e0b'
    return '#ef4444'
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE')
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Gestión de Cotizaciones</h1>
          <p className="dashboard-subtitle">Cargando datos...</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <div>🔄 Cargando...</div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Gestión de Cotizaciones</h1>
        <p className="dashboard-subtitle">Administra tus cotizaciones y seguimiento comercial</p>
        <button 
          className="refresh-btn" 
          onClick={loadData}
          style={{
            background: 'rgba(34, 197, 94, 0.2)',
            color: '#22c55e',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            fontWeight: '600'
          }}
        >
          🔄 Actualizar
        </button>
        <button 
          className="refresh-btn"
          onClick={handleCrearCotizacion}
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: 'white',
            border: 'none',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
          }}
        >
          ✨ Nueva Cotización
        </button>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>COTIZACIONES DEL MES</h3>
            <span className="stat-icon">📋</span>
          </div>
          <div className="stat-value">{stats.cotizacionesDelMes}</div>
          <div className="stat-subtitle">Total generadas</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VALOR COTIZADO</h3>
            <span className="stat-icon">💰</span>
          </div>
          <div className="stat-value">{formatCurrency(stats.valorCotizado)}</div>
          <div className="stat-subtitle">Monto total</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>TASA CONVERSIÓN</h3>
            <span className="stat-icon">📈</span>
          </div>
          <div className="stat-value">{stats.tasaConversion}%</div>
          <div className="stat-subtitle">Cotizaciones aceptadas</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>POR VENCER</h3>
            <span className="stat-icon">⏰</span>
          </div>
          <div className="stat-value warning">{stats.porVencer}</div>
          <div className="stat-subtitle">Próximos 3 días</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="activity-section">
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 className="activity-title" style={{ marginBottom: '1rem' }}>Filtros de Búsqueda</h2>
          
          {/* Filtros en grid responsive */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <select 
              value={filters.estado}
              onChange={(e) => handleFilterChange('estado', e.target.value)}
              style={{ 
                padding: '0.75rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid #d1d5db', 
                background: 'white',
                color: '#374151',
                fontSize: '0.875rem',
                minWidth: '150px'
              }}
            >
              <option value="">Todos los estados</option>
              <option value="BORRADOR">📝 Borrador - En preparación</option>
              <option value="ENVIADA">📤 Enviada al cliente</option>
              <option value="VENCIDA">⏰ Vencida</option>
              <option value="CONVERTIDA">🎯 Convertida en venta</option>
            </select>
            
            <input
              type="text"
              placeholder="Buscar por vendedor"
              value={filters.vendedor}
              onChange={(e) => handleFilterChange('vendedor', e.target.value)}
              style={{ 
                padding: '0.75rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid #d1d5db', 
                background: 'white',
                color: '#374151',
                fontSize: '0.875rem',
                minWidth: '150px'
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ color: '#374151', fontSize: '0.75rem', fontWeight: '500' }}>Fecha desde</label>
              <input
                type="date"
                value={filters.fecha_desde}
                onChange={(e) => handleFilterChange('fecha_desde', e.target.value)}
                style={{ 
                  padding: '0.75rem 1rem', 
                  borderRadius: '8px', 
                  border: '1px solid #d1d5db', 
                  background: 'white',
                  color: '#374151',
                  fontSize: '0.875rem',
                  minWidth: '150px'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ color: '#374151', fontSize: '0.75rem', fontWeight: '500' }}>Fecha hasta</label>
              <input
                type="date"
                value={filters.fecha_hasta}
                onChange={(e) => handleFilterChange('fecha_hasta', e.target.value)}
                style={{ 
                  padding: '0.75rem 1rem', 
                  borderRadius: '8px', 
                  border: '1px solid #d1d5db', 
                  background: 'white',
                  color: '#374151',
                  fontSize: '0.875rem',
                  minWidth: '150px'
                }}
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button 
              onClick={applyFilters} 
              className="refresh-btn"
              style={{
                background: 'rgba(168, 85, 247, 0.2)',
                color: '#a855f7',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                fontWeight: '600',
                padding: '0.75rem 1.5rem'
              }}
            >
              🔍 Aplicar Filtros
            </button>
            <button 
              onClick={clearFilters} 
              className="refresh-btn"
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontWeight: '600',
                padding: '0.75rem 1.5rem'
              }}
            >
              🗑️ Limpiar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Quotations Section */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Cotizaciones Recientes</h2>
          <button 
            className="refresh-btn"
            onClick={loadData}
            style={{
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              fontWeight: '600'
            }}
          >
            📥 Actualizar
          </button>
        </div>

        {/* Quotations Table */}
        <div className="activity-card">
          {cotizaciones.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '3rem', 
              color: '#e2e8f0',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '12px',
              border: '2px dashed rgba(255,255,255,0.2)'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem', color: '#f1f5f9' }}>
                No hay cotizaciones registradas
              </div>
              <div style={{ color: '#94a3b8', marginBottom: '2rem' }}>
                Comienza creando tu primera cotización para gestionar tus ventas
              </div>
                             <button 
                 className="refresh-btn"
                 onClick={handleCrearCotizacion}
                 style={{ 
                   marginTop: '1rem',
                   background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                   color: 'white',
                   border: 'none',
                   padding: '12px 24px',
                   borderRadius: '8px',
                   fontSize: '1rem',
                   fontWeight: '600',
                   cursor: 'pointer',
                   boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                   transition: 'all 0.2s ease'
                 }}
                 onMouseOver={(e) => {
                   e.target.style.transform = 'translateY(-2px)'
                   e.target.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)'
                 }}
                 onMouseOut={(e) => {
                   e.target.style.transform = 'translateY(0)'
                   e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)'
                 }}
               >
                 ✨ Crear Primera Cotización
               </button>
            </div>
          ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>N° COTIZACIÓN</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>CLIENTE</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>FECHA</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>VENCIMIENTO</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>TOTAL</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>PROB.</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>ESTADO</th>
                    <th style={{ padding: '1rem', textAlign: 'left', color: '#1f2937', fontWeight: '700', fontSize: '0.875rem' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                  {cotizaciones.map((cotizacion) => (
                    <tr key={cotizacion.id} style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      backgroundColor: 'rgba(255,255,255,0.05)'
                    }}>
                      <td style={{ padding: '1rem', color: '#1f2937', fontWeight: '600', backgroundColor: 'white' }}>
                        {cotizacion.numero}
                      </td>
                      <td style={{ padding: '1rem', backgroundColor: 'white' }}>
                        <div>
                           <div style={{ color: '#1f2937', fontWeight: '500' }}>
                             Cliente ID: {cotizacion.cliente_id || 'Sin asignar'}
                           </div>
                           <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                             (Información de cliente en desarrollo)
                           </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem', color: '#1f2937', backgroundColor: 'white' }}>
                        {formatDate(cotizacion.fecha_cotizacion)}
                      </td>
                      <td style={{ padding: '1rem', color: '#1f2937', backgroundColor: 'white' }}>
                        {formatDate(cotizacion.fecha_vencimiento)}
                      </td>
                      <td style={{ padding: '1rem', color: '#059669', fontWeight: '600', backgroundColor: 'white' }}>
                        {formatCurrency(cotizacion.total)}
                      </td>
                      <td style={{ padding: '1rem', backgroundColor: 'white' }}>
                        <div style={{ 
                          width: '60px', 
                          height: '20px', 
                          borderRadius: '10px', 
                          background: getProbabilityColor(cotizacion.probabilidad),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                          {cotizacion.probabilidad}%
                        </div>
                      </td>
                      <td style={{ padding: '1rem', backgroundColor: 'white' }}>
                        <span style={{ 
                          ...getStatusColor(cotizacion.estado),
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                          {cotizacion.estado?.toUpperCase() === 'EN PROCESO' || cotizacion.estado?.toUpperCase() === 'PROCESO' || cotizacion.estado?.toUpperCase() === 'PENDIENTE'
                            ? 'BORRADOR' 
                            : (cotizacion.estado?.toUpperCase() || 'BORRADOR')}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', backgroundColor: 'white' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            onClick={() => handleVerCotizacion(cotizacion)}
                            style={{ 
                              background: '#3b82f6', 
                              color: 'white', 
                              border: 'none', 
                              padding: '0.5rem 0.75rem', 
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: '500',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.target.style.background = '#2563eb'}
                            onMouseOut={(e) => e.target.style.background = '#3b82f6'}
                          >
                            👁️ Ver
                          </button>
                          <button 
                            onClick={() => {
                              // Generar y descargar PDF de la cotización
                              alert(`📄 DESCARGANDO PDF: ${cotizacion.numero}

🔧 Funcionalidad en desarrollo:
• Generación automática de PDF profesional
• Diseño corporativo con logo de empresa
• Desglose detallado de items y totales
• Términos y condiciones incluidos

✨ Se abrirá automáticamente el PDF generado...`);
                              
                              // Aquí iría la lógica para generar y descargar el PDF
                              console.log('📄 Generando PDF para cotización:', cotizacion.numero);
                            }}
                                                        style={{ 
                            background: '#dc2626', 
                            color: 'white', 
                            border: 'none', 
                            padding: '0.5rem 0.75rem', 
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => e.target.style.background = '#b91c1c'}
                          onMouseOut={(e) => e.target.style.background = '#dc2626'}
                        >
                          📄 PDF
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Top Clients Section */}
      {clientesTop.length > 0 && (
      <div className="activity-section">
        <h2 className="activity-title">Clientes Principales</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            {clientesTop.slice(0, 3).map((cliente) => (
              <div key={cliente.id} className="activity-card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                    <h3 style={{ color: '#f8fafc', fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>
                      {cliente.nombre}
                    </h3>
                    <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
                      RUC: {cliente.ruc}
                    </div>
                </div>
                <div style={{ 
                    width: '60px', 
                    height: '60px', 
                  borderRadius: '50%',
                    background: `conic-gradient(${getConversionColor(cliente.conversion)} ${cliente.conversion}%, rgba(255,255,255,0.1) 0)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                    color: 'white',
                    fontWeight: '600',
                    fontSize: '0.875rem'
                }}>
                    {cliente.conversion}%
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                  <div>
                    <div style={{ color: '#64748b' }}>Cotizaciones</div>
                    <div style={{ color: '#f8fafc', fontWeight: '600' }}>{cliente.cotizaciones}</div>
              </div>
                <div>
                    <div style={{ color: '#64748b' }}>Total cotizado</div>
                    <div style={{ color: '#22c55e', fontWeight: '600' }}>{formatCurrency(cliente.totalCotizado)}</div>
                  </div>
                </div>
                
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.875rem' }}>
                  <div style={{ color: '#64748b' }}>Última cotización</div>
                  <div style={{ color: '#f8fafc' }}>{formatDate(cliente.ultimaCotizacion)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

    </div>
    
    {/* Modal de Cotización - Fuera del contenedor */}
    <CotizacionModal 
      isOpen={showCotizacionModal}
      onClose={() => setShowCotizacionModal(false)}
      onSuccess={handleCotizacionCreated}
    />

    <CotizacionViewModal 
      isOpen={showViewModal}
      onClose={() => {
        setShowViewModal(false)
        setSelectedCotizacion(null)
      }}
      cotizacion={selectedCotizacion}
    />
    </>
  )
}
 