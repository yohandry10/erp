'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '@/hooks/use-api'

type Empleado = {
  id: string
  estado?: string
  fecha_ingreso?: string
  departamento_id?: string
  departamentos?: { id?: string; nombre?: string }
}

type Departamento = {
  id: string
  nombre: string
}

export default function ReportesRrhhPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { get } = useApi<any>({ showErrorToast: false })
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true'

  const loadData = useCallback(async () => {
    if (!rrhhEnabled) {
      setEmpleados([])
      setDepartamentos([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [empleadosResponse, departamentosResponse] = await Promise.all([
        get('/rrhh/empleados'),
        get('/rrhh/departamentos'),
      ])

      const empleadosData = empleadosResponse?.data ?? empleadosResponse ?? []
      const departamentosData = departamentosResponse?.data ?? departamentosResponse ?? []
      setEmpleados(Array.isArray(empleadosData) ? empleadosData : [])
      setDepartamentos(Array.isArray(departamentosData) ? departamentosData : [])
    } catch {
      setError('No fue posible cargar los reportes de RRHH.')
      setEmpleados([])
      setDepartamentos([])
    } finally {
      setLoading(false)
    }
  }, [get, rrhhEnabled])

  useEffect(() => {
    loadData()
  }, [loadData])

  const metrics = useMemo(() => {
    const activos = empleados.filter((empleado) => String(empleado.estado || '').toLowerCase() === 'activo').length
    const hace30Dias = new Date()
    hace30Dias.setDate(hace30Dias.getDate() - 30)
    const ingresos30Dias = empleados.filter((empleado) => {
      if (!empleado.fecha_ingreso) return false
      return new Date(empleado.fecha_ingreso) >= hace30Dias
    }).length

    const porDepartamento = departamentos.map((departamento) => ({
      id: departamento.id,
      nombre: departamento.nombre,
      total: empleados.filter((empleado) =>
        empleado.departamento_id === departamento.id || empleado.departamentos?.id === departamento.id,
      ).length,
    }))

    return {
      total: empleados.length,
      activos,
      inactivos: Math.max(empleados.length - activos, 0),
      ingresos30Dias,
      porDepartamento,
    }
  }, [departamentos, empleados])

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner" />
          <p>Cargando reportes de RRHH...</p>
        </div>
      </div>
    )
  }

  if (!rrhhEnabled) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Reportes RRHH</h1>
            <p className="dashboard-subtitle">El módulo de RRHH está deshabilitado en este entorno.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Reportes RRHH</h1>
          <p className="dashboard-subtitle">Indicadores operativos de personal, ingresos y distribución por área</p>
        </div>
        <button className="refresh-btn" onClick={loadData}>
          Actualizar
        </button>
      </div>

      {error && (
        <div className="activity-card" style={{ borderColor: 'var(--red-200)', color: 'var(--red-700)' }}>
          {error}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h3>Total empleados</h3>
            <div className="stat-icon">👥</div>
          </div>
          <div className="stat-value text-blue-600">{metrics.total}</div>
          <div className="stat-subtitle">Personal registrado</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Activos</h3>
            <div className="stat-icon">✅</div>
          </div>
          <div className="stat-value text-green-600">{metrics.activos}</div>
          <div className="stat-subtitle">Personal habilitado</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Inactivos</h3>
            <div className="stat-icon">⏸️</div>
          </div>
          <div className="stat-value text-red-600">{metrics.inactivos}</div>
          <div className="stat-subtitle">Personal no activo</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>Nuevos ingresos</h3>
            <div className="stat-icon">📈</div>
          </div>
          <div className="stat-value text-purple-600">{metrics.ingresos30Dias}</div>
          <div className="stat-subtitle">Últimos 30 días</div>
        </div>
      </div>

      <div className="activity-section">
        <h2 className="activity-title">Distribución por departamento</h2>
        <div className="activity-card">
          {metrics.porDepartamento.length === 0 ? (
            <div className="activity-empty">
              <h3>No hay departamentos registrados</h3>
              <p>Cuando existan áreas organizacionales se mostrará la distribución del personal.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Departamento</th>
                  <th>Empleados</th>
                  <th>Participación</th>
                </tr>
              </thead>
              <tbody>
                {metrics.porDepartamento.map((departamento) => {
                  const porcentaje = metrics.total > 0 ? (departamento.total / metrics.total) * 100 : 0
                  return (
                    <tr key={departamento.id}>
                      <td>{departamento.nombre}</td>
                      <td>{departamento.total}</td>
                      <td>{porcentaje.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
