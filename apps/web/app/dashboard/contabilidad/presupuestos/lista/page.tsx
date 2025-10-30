'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  DollarSign,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Calendar
} from 'lucide-react'
import PresupuestoEjecucionIndicator from '@/components/contabilidad/PresupuestoEjecucionIndicator'

interface Presupuesto {
  id: string
  tenant_id: string
  centro_costo_id: string
  cuenta_id: string
  periodo_contable_id: string
  monto_presupuestado: number
  monto_ejecutado: number
  monto_comprometido: number
  monto_disponible: number
  porcentaje_ejecutado: number
  estado: 'ACTIVO' | 'BLOQUEADO' | 'CERRADO'
  notas?: string
  created_at: string
  updated_at: string
  centro_costo?: { codigo: string; nombre: string }
  cuenta?: { codigo: string; nombre: string }
  periodo?: { anio: number; mes: number }
}

interface CentroCosto {
  id: string
  codigo: string
  nombre: string
}

interface Cuenta {
  id: string
  codigo: string
  nombre: string
}

interface Periodo {
  id: string
  anio: number
  mes: number
}

export default function PresupuestosListaPage() {
  const router = useRouter()
  const { get, del } = useApi()
  
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [centroCostoFilter, setCentroCostoFilter] = useState<string>('TODOS')
  const [periodoFilter, setPeriodoFilter] = useState<string>('TODOS')
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS')
  const [alertaFilter, setAlertaFilter] = useState<string>('TODOS')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Cargar presupuestos, centros de costo y períodos en paralelo
      const [presupuestosRes, centrosRes, periodosRes] = await Promise.all([
        get('/api/contabilidad/presupuestos'),
        get('/api/contabilidad/centros-costo'),
        get('/api/contabilidad/periodos')
      ])
      
      if (presupuestosRes?.success && presupuestosRes.data) {
        setPresupuestos(presupuestosRes.data)
      }
      
      if (centrosRes?.success && centrosRes.data) {
        setCentrosCosto(centrosRes.data)
      }
      
      if (periodosRes?.success && periodosRes.data) {
        setPeriodos(periodosRes.data)
      }
    } catch (err: any) {
      console.error('Error loading data:', err)
      setError(err.message || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este presupuesto?')) return
    
    try {
      const response = await del(`/api/contabilidad/presupuestos/${id}`)
      
      if (response?.success) {
        setPresupuestos(prev => prev.filter(p => p.id !== id))
      }
    } catch (err: any) {
      console.error('Error deleting presupuesto:', err)
      alert(err.message || 'Error al eliminar el presupuesto')
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatPeriodo = (periodo?: { anio: number; mes: number }) => {
    if (!periodo) return '-'
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    return `${meses[periodo.mes - 1]} ${periodo.anio}`
  }

  const getEstadoBadge = (estado: string) => {
    const configs = {
      ACTIVO: { color: '#10b981', icon: CheckCircle, label: 'Activo' },
      BLOQUEADO: { color: '#f59e0b', icon: AlertTriangle, label: 'Bloqueado' },
      CERRADO: { color: '#ef4444', icon: XCircle, label: 'Cerrado' }
    }
    
    const config = configs[estado as keyof typeof configs] || configs.ACTIVO
    const Icon = config.icon
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: config.color,
        color: 'white'
      }}>
        <Icon size={12} />
        {config.label}
      </span>
    )
  }

  const getAlertaBadge = (porcentaje: number) => {
    if (porcentaje >= 100) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.375rem 0.75rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '600',
          background: '#ef4444',
          color: 'white'
        }}>
          <AlertCircle size={12} />
          Sobregiro
        </span>
      )
    }
    
    if (porcentaje >= 90) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.375rem 0.75rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '600',
          background: '#f59e0b',
          color: 'white'
        }}>
          <AlertTriangle size={12} />
          Advertencia
        </span>
      )
    }
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: '#10b981',
        color: 'white'
      }}>
        <CheckCircle size={12} />
        Normal
      </span>
    )
  }

  // Filtrar presupuestos
  const filteredPresupuestos = presupuestos.filter(presupuesto => {
    // Filtro de búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesSearch = 
        presupuesto.centro_costo?.nombre.toLowerCase().includes(search) ||
        presupuesto.centro_costo?.codigo.toLowerCase().includes(search) ||
        presupuesto.cuenta?.nombre.toLowerCase().includes(search) ||
        presupuesto.cuenta?.codigo.toLowerCase().includes(search) ||
        (presupuesto.notas && presupuesto.notas.toLowerCase().includes(search))
      
      if (!matchesSearch) return false
    }

    // Filtro de centro de costo
    if (centroCostoFilter !== 'TODOS' && presupuesto.centro_costo_id !== centroCostoFilter) {
      return false
    }

    // Filtro de período
    if (periodoFilter !== 'TODOS' && presupuesto.periodo_contable_id !== periodoFilter) {
      return false
    }

    // Filtro de estado
    if (estadoFilter !== 'TODOS' && presupuesto.estado !== estadoFilter) {
      return false
    }

    // Filtro de alerta
    if (alertaFilter !== 'TODOS') {
      const porcentaje = presupuesto.porcentaje_ejecutado
      if (alertaFilter === 'SOBREGIRO' && porcentaje < 100) return false
      if (alertaFilter === 'ADVERTENCIA' && (porcentaje < 90 || porcentaje >= 100)) return false
      if (alertaFilter === 'NORMAL' && porcentaje >= 90) return false
    }

    return true
  })

  // Estadísticas
  const stats = {
    total: presupuestos.length,
    activos: presupuestos.filter(p => p.estado === 'ACTIVO').length,
    sobregiros: presupuestos.filter(p => p.porcentaje_ejecutado >= 100).length,
    advertencias: presupuestos.filter(p => p.porcentaje_ejecutado >= 90 && p.porcentaje_ejecutado < 100).length,
    totalPresupuestado: presupuestos.reduce((sum, p) => sum + p.monto_presupuestado, 0),
    totalEjecutado: presupuestos.reduce((sum, p) => sum + p.monto_ejecutado, 0)
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando presupuestos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--primary-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-600)'
            }}>
              <DollarSign size={24} />
            </div>
            <h1 className="dashboard-title">Gestión de Presupuestos</h1>
          </div>
          <p className="dashboard-subtitle">
            Administre presupuestos por centro de costo y cuenta contable
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadData}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            onClick={() => router.push('/dashboard/contabilidad/presupuestos/nuevo')}
            className="primary-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <Plus size={16} />
            Nuevo Presupuesto
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Presupuestos
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary-800)' }}>
            {stats.total}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Activos
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
            {stats.activos}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Sobregiros
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>
            {stats.sobregiros}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Advertencias
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
            {stats.advertencias}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Presupuestado
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)' }}>
            {formatCurrency(stats.totalPresupuestado)}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Ejecutado
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#3b82f6' }}>
            {formatCurrency(stats.totalEjecutado)}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--primary-100)'
        }}>
          <Filter size={20} style={{ color: 'var(--primary-600)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Filtros
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Buscar
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ 
                position: 'absolute', 
                left: '0.75rem', 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: 'var(--primary-400)'
              }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Centro, cuenta o notas..."
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  border: '1px solid var(--primary-300)',
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Centro de Costo
            </label>
            <select
              value={centroCostoFilter}
              onChange={(e) => setCentroCostoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="TODOS">Todos</option>
              {centrosCosto.map(centro => (
                <option key={centro.id} value={centro.id}>
                  {centro.codigo} - {centro.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Período
            </label>
            <select
              value={periodoFilter}
              onChange={(e) => setPeriodoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="TODOS">Todos</option>
              {periodos.map(periodo => (
                <option key={periodo.id} value={periodo.id}>
                  {formatPeriodo(periodo)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="BLOQUEADO">Bloqueado</option>
              <option value="CERRADO">Cerrado</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Alerta
            </label>
            <select
              value={alertaFilter}
              onChange={(e) => setAlertaFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="TODOS">Todos</option>
              <option value="NORMAL">Normal</option>
              <option value="ADVERTENCIA">Advertencia (≥90%)</option>
              <option value="SOBREGIRO">Sobregiro (≥100%)</option>
            </select>
          </div>
        </div>

        {(searchTerm || centroCostoFilter !== 'TODOS' || periodoFilter !== 'TODOS' || estadoFilter !== 'TODOS' || alertaFilter !== 'TODOS') && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setSearchTerm('')
                setCentroCostoFilter('TODOS')
                setPeriodoFilter('TODOS')
                setEstadoFilter('TODOS')
                setAlertaFilter('TODOS')
              }}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--primary-100)',
                color: 'var(--primary-700)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Lista de Presupuestos */}
      <div className="activity-card">
        {error && (
          <div style={{ 
            padding: '1rem', 
            background: 'var(--red-50)', 
            borderRadius: '8px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <AlertCircle size={20} style={{ color: 'var(--red-600)' }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--red-700)', margin: 0 }}>
              {error}
            </p>
          </div>
        )}

        {filteredPresupuestos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--primary-400)' }}>
            <DollarSign size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--primary-600)' }}>
              No hay presupuestos
            </h3>
            <p style={{ marginBottom: '1.5rem' }}>
              {presupuestos.length === 0 
                ? 'Aún no se han creado presupuestos'
                : 'No se encontraron presupuestos con los filtros aplicados'
              }
            </p>
            {presupuestos.length === 0 && (
              <button
                onClick={() => router.push('/dashboard/contabilidad/presupuestos/nuevo')}
                className="primary-btn"
              >
                <Plus size={16} />
                Crear Primer Presupuesto
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--primary-200)' }}>
                  <th style={{ 
                    textAlign: 'left', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Centro de Costo
                  </th>
                  <th style={{ 
                    textAlign: 'left', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Cuenta
                  </th>

                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Período
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Presupuestado
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Ejecutado
                  </th>
                  <th style={{ 
                    textAlign: 'right', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Disponible
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    % Ejecución
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Alerta
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Estado
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>

                {filteredPresupuestos.map((presupuesto) => (
                  <tr 
                    key={presupuesto.id}
                    style={{ 
                      borderBottom: '1px solid var(--primary-100)',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => router.push(`/dashboard/contabilidad/presupuestos/${presupuesto.id}`)}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-50)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                        {presupuesto.centro_costo?.nombre || '-'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                        {presupuesto.centro_costo?.codigo || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                        {presupuesto.cuenta?.nombre || '-'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                        {presupuesto.cuenta?.codigo || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.375rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: 'var(--primary-100)',
                        color: 'var(--primary-700)'
                      }}>
                        <Calendar size={12} />
                        {formatPeriodo(presupuesto.periodo)}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: 'var(--primary-800)' }}>
                      {formatCurrency(presupuesto.monto_presupuestado)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#3b82f6' }}>
                      {formatCurrency(presupuesto.monto_ejecutado)}
                    </td>
                    <td style={{ 
                      padding: '1rem', 
                      textAlign: 'right', 
                      fontWeight: '600', 
                      color: presupuesto.monto_disponible < 0 ? '#ef4444' : '#10b981'
                    }}>
                      {formatCurrency(presupuesto.monto_disponible)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <PresupuestoEjecucionIndicator
                        porcentajeEjecutado={presupuesto.porcentaje_ejecutado}
                        size="md"
                        showLabel={false}
                        showPercentage={true}
                        showProgressBar={true}
                      />
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <PresupuestoEjecucionIndicator
                        porcentajeEjecutado={presupuesto.porcentaje_ejecutado}
                        size="md"
                        showLabel={true}
                        showPercentage={false}
                        showProgressBar={false}
                      />
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {getEstadoBadge(presupuesto.estado)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/dashboard/contabilidad/presupuestos/${presupuesto.id}`)
                          }}
                          style={{
                            padding: '0.5rem',
                            background: 'var(--primary-100)',
                            color: 'var(--primary-700)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title="Editar"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(presupuesto.id)
                          }}
                          style={{
                            padding: '0.5rem',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredPresupuestos.length > 0 && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '1rem',
            borderTop: '1px solid var(--primary-200)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>
              Mostrando {filteredPresupuestos.length} de {presupuestos.length} presupuestos
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
