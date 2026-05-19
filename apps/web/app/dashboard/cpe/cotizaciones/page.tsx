'use client'

import { useState, useCallback, useEffect } from 'react'
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

  // Rastrear cambios en el estado del modal
  useEffect(() => {
    console.log('🔄 Estado del modal cambió a:', showCotizacionModal)
  }, [showCotizacionModal])

  const loadStats = useCallback(async () => {
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
  }, [get])

  const loadCotizaciones = useCallback(async () => {
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
  }, [filters, get])

  const loadClientesTop = useCallback(async () => {
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
  }, [get])

  const loadData = useCallback(async () => {
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
  }, [loadClientesTop, loadCotizaciones, loadStats])

  // Cargar datos iniciales
  useEffect(() => {
    loadData()
  }, [loadData])

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
    console.log('🔥 [CREAR COTIZACION] Botón clickeado - abriendo modal')
    console.log('🔥 [CREAR COTIZACION] Estado actual:', { showCotizacionModal })
    setShowCotizacionModal(true)
    console.log('🔥 [CREAR COTIZACION] Estado actualizado a true')
  }

  const handleCotizacionCreated = () => {
    loadData() // Recargar datos después de crear cotización
  }

  const handleVerCotizacion = (cotizacion: Cotizacion) => {
    setSelectedCotizacion(cotizacion)
    setShowViewModal(true)
  }

  const handleActionsComplete = () => {
    loadData() // Recargar datos después de cualquier acción
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
      case 'APROBADA':
        return { background: '#10b981', color: 'white' }
      case 'VENCIDA':
        return { background: '#dc2626', color: 'white' }
      case 'CONVERTIDA':
        return { background: '#059669', color: 'white' }
      case 'RECHAZADA':
        return { background: '#ef4444', color: 'white' }
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
        <div className="flex justify-center items-center h-[200px]">
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
          className="refresh-btn bg-[rgba(34,_197,_94,_0.2)] text-[#22c55e] border font-semibold"
          onClick={loadData}
        >
          🔄 Actualizar
        </button>
        <button
          className="refresh-btn text-white border-0 font-semibold shadow"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('🎯 [BTN CLICK] Click detectado en botón Nueva Cotización')
            handleCrearCotizacion()
          }}
        >
          ✨ Nueva Cotización
        </button>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
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
        <div className="mb-6">
          <h2 className="activity-title mb-4">Filtros de Búsqueda</h2>

          {/* Filtros en grid responsive */}
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-4">
            <select
              value={filters.estado}
              onChange={(e) => handleFilterChange('estado', e.target.value)} className="py-3 px-4 rounded-2 border bg-white text-gray-700 text-[0.875rem] min-w-[150px]"
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
              onChange={(e) => handleFilterChange('vendedor', e.target.value)} className="py-3 px-4 rounded-2 border bg-white text-gray-700 text-[0.875rem] min-w-[150px]"
            />

            <div className="flex flex-col gap-1">
              <label className="text-gray-700 text-3 font-medium">Fecha desde</label>
              <input
                type="date"
                value={filters.fecha_desde}
                onChange={(e) => handleFilterChange('fecha_desde', e.target.value)} className="py-3 px-4 rounded-2 border bg-white text-gray-700 text-[0.875rem] min-w-[150px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-gray-700 text-3 font-medium">Fecha hasta</label>
              <input
                type="date"
                value={filters.fecha_hasta}
                onChange={(e) => handleFilterChange('fecha_hasta', e.target.value)} className="py-3 px-4 rounded-2 border bg-white text-gray-700 text-[0.875rem] min-w-[150px]"
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={applyFilters}
              className="refresh-btn bg-[rgba(168,_85,_247,_0.2)] text-[#a855f7] border font-semibold py-3 px-6"
            >
              🔍 Aplicar Filtros
            </button>
            <button
              onClick={clearFilters}
              className="refresh-btn bg-[rgba(239,_68,_68,_0.2)] text-red-500 border font-semibold py-3 px-6"
            >
              🗑️ Limpiar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Quotations Section */}
      <div className="activity-section">
        <div className="flex justify-between items-center mb-6">
          <h2 className="activity-title">Cotizaciones Recientes</h2>
          <button
            className="refresh-btn bg-[rgba(34,_197,_94,_0.2)] text-[#22c55e] border font-semibold"
            onClick={loadData}
          >
            📥 Actualizar
          </button>
        </div>

        {/* Quotations Table */}
        <div className="activity-card">
          {cotizaciones.length === 0 ? (
            <div className="text-center p-12 text-slate-200 bg-[rgba(0,0,0,0.3)] rounded-3">
              <div className="text-12 mb-4">📄</div>
              <div className="text-6 font-semibold mb-2 text-slate-100">
                No hay cotizaciones registradas
              </div>
              <div className="text-slate-400 mb-8">
                Comienza creando tu primera cotización para gestionar tus ventas
              </div>
                             <button
                 className="refresh-btn mt-4 text-white border-0 py-3 px-6 rounded-2 text-4 font-semibold cursor-pointer shadow transition"
                 onClick={handleCrearCotizacion}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.4)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)'
                  }}
                >
                 ✨ Crear Primera Cotización
               </button>
            </div>
          ) : (
          <div className="overflow-auto">
            <table className="w-[100%]">
              <thead>
                  <tr className="bg-slate-50">
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">N° COTIZACIÓN</th>
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">CLIENTE</th>
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">FECHA</th>
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">VENCIMIENTO</th>
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">TOTAL</th>
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">PROB.</th>
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">ESTADO</th>
                    <th className="p-4 text-left text-gray-800 font-bold text-[0.875rem]">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                  {cotizaciones.map((cotizacion) => (
                    <tr key={cotizacion.id} className="border-b bg-[rgba(255,255,255,0.05)]">
                      <td className="p-4 text-gray-800 font-semibold bg-white">
                        {cotizacion.numero}
                      </td>
                      <td className="p-4 bg-white">
                        <div>
                           <div className="text-gray-800 font-medium">
                             Cliente ID: {cotizacion.cliente_id || 'Sin asignar'}
                           </div>
                           <div className="text-gray-500 text-[0.875rem]">
                             (Información de cliente en desarrollo)
                           </div>
                        </div>
                      </td>
                      <td className="p-4 text-gray-800 bg-white">
                        {formatDate(cotizacion.fecha_cotizacion)}
                      </td>
                      <td className="p-4 text-gray-800 bg-white">
                        {formatDate(cotizacion.fecha_vencimiento)}
                      </td>
                      <td className="p-4 text-emerald-600 font-semibold bg-white">
                        {formatCurrency(cotizacion.total)}
                      </td>
                      <td className="p-4 bg-white">
                        <div className="w-[60px] h-5 rounded-2.5 flex items-center justify-center text-white text-3 font-semibold">
                          {cotizacion.probabilidad}%
                        </div>
                      </td>
                      <td className="p-4 bg-white">
                        <span className="py-1 px-3 rounded-3 text-3 font-semibold">
                          {cotizacion.estado?.toUpperCase() === 'EN PROCESO' || cotizacion.estado?.toUpperCase() === 'PROCESO' || cotizacion.estado?.toUpperCase() === 'PENDIENTE'
                            ? 'BORRADOR'
                            : (cotizacion.estado?.toUpperCase() || 'BORRADOR')}
                        </span>
                      </td>
                      <td className="p-4 bg-white">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleVerCotizacion(cotizacion)} className="bg-blue-500 text-white border-0 py-2 px-3 rounded-[6px] text-3 cursor-pointer font-medium transition"
                            onMouseOver={(e) => (e.currentTarget.style.background = '#2563eb')}
                            onMouseOut={(e) => (e.currentTarget.style.background = '#3b82f6')}
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
                            }} className="bg-red-600 text-white border-0 py-2 px-3 rounded-[6px] text-3 cursor-pointer font-medium transition"
                          onMouseOver={(e) => (e.currentTarget.style.background = '#b91c1c')}
                          onMouseOut={(e) => (e.currentTarget.style.background = '#dc2626')}
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
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(300px,_1fr))] gap-4 mt-4">
            {clientesTop.slice(0, 3).map((cliente) => (
              <div key={cliente.id} className="activity-card p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-slate-50 text-[1.125rem] font-semibold mb-1">
                      {cliente.nombre}
                    </h3>
                    <div className="text-slate-500 text-[0.875rem]">
                      RUC: {cliente.ruc}
                    </div>
                </div>
                <div className="w-[60px] h-[60px] rounded-full flex items-center justify-center text-white font-semibold text-[0.875rem]">
                    {cliente.conversion}%
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_1fr] gap-4 text-[0.875rem]">
                  <div>
                    <div className="text-slate-500">Cotizaciones</div>
                    <div className="text-slate-50 font-semibold">{cliente.cotizaciones}</div>
              </div>
                <div>
                    <div className="text-slate-500">Total cotizado</div>
                    <div className="text-[#22c55e] font-semibold">{formatCurrency(cliente.totalCotizado)}</div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t text-[0.875rem]">
                  <div className="text-slate-500">Última cotización</div>
                  <div className="text-slate-50">{formatDate(cliente.ultimaCotizacion)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

    </div>

    {/* Modal de Cotización - Fuera del contenedor */}
    {console.log('🚀 Rendering CotizacionModal with isOpen:', showCotizacionModal)}
    <CotizacionModal
      isOpen={showCotizacionModal}
      onClose={() => {
        console.log('🚪 [MODAL CLOSE] Cerrando modal de cotización')
        setShowCotizacionModal(false)
      }}
      onSuccess={handleCotizacionCreated}
    />

    <CotizacionViewModal
      isOpen={showViewModal}
      onClose={() => {
        setShowViewModal(false)
        setSelectedCotizacion(null)
      }}
      cotizacion={selectedCotizacion}
      onActionsComplete={handleActionsComplete}
    />
    </>
  )
}

