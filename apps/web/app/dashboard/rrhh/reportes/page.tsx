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
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED !== 'false'

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
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Reportes RRHH</h1>
            <p className="mt-2 text-base text-muted-foreground">Cargando indicadores de personal, ingresos recientes y distribución por área.</p>
          </div>
        </div>
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
          <p>Cargando reportes de RRHH...</p>
        </div>
      </div>
    )
  }

  if (!rrhhEnabled) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Reportes RRHH</h1>
            <p className="mt-2 text-base text-muted-foreground">El módulo de RRHH está deshabilitado en este entorno.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Reportes RRHH</h1>
          <p className="mt-2 text-base text-muted-foreground">Indicadores operativos de personal, ingresos y distribución por área</p>
        </div>
        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={loadData}>
          Actualizar
        </button>
      </div>

      {error && (
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl text-[var(--red-700)]">
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Total empleados</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">👥</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-primary">{metrics.total}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Personal registrado</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Activos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">✅</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-emerald-400">{metrics.activos}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Personal habilitado</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Inactivos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">⏸️</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-destructive">{metrics.inactivos}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Personal no activo</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>Nuevos ingresos</h3>
            <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">📈</div>
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-violet-400">{metrics.ingresos30Dias}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Últimos 30 días</div>
        </div>
      </div>

      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <h2 className="m-0 text-lg font-bold text-foreground">Distribución por departamento</h2>
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          {metrics.porDepartamento.length === 0 ? (
            <div className="px-4 py-10 text-center text-muted-foreground">
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
