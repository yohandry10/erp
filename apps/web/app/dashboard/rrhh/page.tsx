'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  BadgeDollarSign,
  Briefcase,
  CalendarClock,
  FileCheck2,
  FileText,
  UserPlus,
  Users,
} from 'lucide-react'
import EmpleadoModal from '@/components/modals/EmpleadoModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useApi } from '@/hooks/use-api'
import { PageShell } from '@/components/erp/page-shell'
import { MetricCard } from '@/components/erp/metric-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { parseDateLocal } from '@/lib/date-utils'

const rrhhModules = [
  { href: '/dashboard/rrhh/planillas', title: 'Planillas', description: 'Cálculo de sueldos y beneficios', icon: BadgeDollarSign },
  { href: '/dashboard/rrhh/liquidaciones', title: 'Liquidaciones y CTS', description: 'Cese, pago, reversa y depósitos semestrales', icon: FileCheck2 },
  { href: '/dashboard/rrhh/planilla-electronica', title: 'PLAME / T-Registro', description: 'Fuentes PVS, ticket y CIR de SUNAT', icon: FileCheck2 },
  { href: '/dashboard/rrhh/asistencia', title: 'Asistencia', description: 'Control de horarios y marcaciones', icon: CalendarClock },
  { href: '/dashboard/rrhh/contratos', title: 'Contratos', description: 'Gestión de contratos laborales', icon: FileText },
  { href: '/dashboard/rrhh/candidatos', title: 'Candidatos', description: 'Reclutamiento y selección', icon: Users },
  { href: '/dashboard/rrhh/pagos', title: 'Pagos', description: 'Control de pagos mensuales', icon: BadgeDollarSign },
  { href: '/dashboard/rrhh/reportes', title: 'Reportes', description: 'Indicadores y trazabilidad RRHH', icon: Briefcase },
]

const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A'
  return parseDateLocal(dateString).toLocaleDateString('es-PE')
}

export default function RrhhPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [empleadoEditando, setEmpleadoEditando] = useState<any | null>(null)
  const { get, post, put, delete: del } = useApi()
  const queryClient = useQueryClient()
  const mutationIntents = useRef(new Map<string, string>())
  const intentFor = (signature: string) => {
    const existing = mutationIntents.current.get(signature)
    if (existing) return existing
    const key = `rrhh-employee:${crypto.randomUUID()}`
    mutationIntents.current.set(signature, key)
    return key
  }

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default',
  })

  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED !== 'false'

  const toList = (d: any): any[] =>
    d?.success && Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : []

  // React Query cachea por 60s (config global): al volver a RRHH se muestran los
  // datos cacheados al instante y se revalidan en segundo plano, en vez de
  // recargar de cero con spinner de pantalla completa cada vez.
  const { data, isLoading } = useQuery({
    queryKey: ['rrhh-dashboard'],
    enabled: rrhhEnabled,
    queryFn: async () => {
      const [empleadosData, departamentosData] = await Promise.all([
        get('/rrhh/empleados'),
        get('/rrhh/departamentos'),
      ])
      return { empleados: toList(empleadosData), departamentos: toList(departamentosData) }
    },
  })

  const empleados = useMemo(() => data?.empleados ?? [], [data?.empleados])
  const departamentos = useMemo(() => data?.departamentos ?? [], [data?.departamentos])
  const loading = rrhhEnabled && isLoading

  const loadData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['rrhh-dashboard'] })
  }, [queryClient])

  const stats = useMemo(() => {
    const activos = empleados.filter((emp: any) => emp?.estado === 'activo').length
    const nuevos = empleados.filter((emp: any) => {
      if (!emp?.fecha_ingreso) return false
      const fechaIngreso = parseDateLocal(emp.fecha_ingreso)
      const haceUnMes = new Date()
      haceUnMes.setMonth(haceUnMes.getMonth() - 1)
      return fechaIngreso > haceUnMes
    }).length

    return {
      total: empleados.length,
      activos,
      departamentos: departamentos.length,
      nuevos,
    }
  }, [departamentos.length, empleados])

  const openCreateEmpleado = () => {
    setEmpleadoEditando(null)
    setIsModalOpen(true)
  }

  const handleSubmitEmpleado = async (empleadoData: any) => {
    const signature = `${empleadoEditando?.id ? `update:${empleadoEditando.id}` : 'create'}:${JSON.stringify(empleadoData)}`
    try {
      const response = empleadoEditando?.id
        ? await put(`/rrhh/empleados/${empleadoEditando.id}`, empleadoData, {
            headers: { 'Idempotency-Key': intentFor(signature) },
          })
        : await post('/rrhh/empleados', empleadoData, {
            headers: { 'Idempotency-Key': intentFor(signature) },
          })

      if (response) {
        mutationIntents.current.delete(signature)
        setIsModalOpen(false)
        setEmpleadoEditando(null)
        loadData()
      } else {
        throw new Error(empleadoEditando ? 'Error al actualizar empleado' : 'Error al crear empleado')
      }
    } catch (error) {
      console.error('Error:', error)
      // El `throw` de arriba llegaba aqui y moria en la consola: al fallar el alta o
      // la edicion, el modal se quedaba abierto sin decir por que.
      alert(error instanceof Error ? error.message : 'No se pudo guardar el empleado.')
    }
  }

  if (loading) {
    return (
      <PageShell title="Recursos Humanos" description="Cargando empleados, departamentos, contratos y planillas operativas.">
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-cyan-400/20 bg-card/60 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground/85">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300 group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:border-t-blue-600" />
            <p className="text-sm font-semibold">Cargando datos de RRHH...</p>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!rrhhEnabled) {
    return (
      <PageShell title="Recursos Humanos" description="El módulo de RRHH está deshabilitado en este entorno.">
        <Card className="border-cyan-400/20 bg-card/65 text-foreground group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
          <CardContent className="p-8 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
            Activa la bandera de RRHH para usar empleados, asistencia, contratos y planillas.
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Recursos Humanos"
      description="Operación diaria de empleados, contratos, asistencia, pagos y planillas."
      actions={<Button className="gap-2" onClick={openCreateEmpleado}><UserPlus className="h-4 w-4" /> Agregar empleado</Button>}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total empleados" value={stats.total} description="Personal registrado" icon={Users} tone="info" />
        <MetricCard title="Activos" value={stats.activos} description="Personal en actividad" icon={UserPlus} tone="success" />
        <MetricCard title="Departamentos" value={stats.departamentos} description="Áreas organizacionales" icon={Briefcase} tone="default" />
        <MetricCard title="Nuevos ingresos" value={stats.nuevos} description="Últimos 30 días" icon={CalendarClock} tone="warning" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rrhhModules.map((module) => {
          const Icon = module.icon
          return (
            <Link key={module.href} href={module.href} className="block">
              <Card className="h-full border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 transition hover:-translate-y-0.5 hover:border-cyan-300/40 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground group-data-[erp-theme=light]/dashboard:shadow-slate-200/70">
                <CardContent className="flex items-center gap-4 p-5">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">{module.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">{module.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
        <CardHeader>
          <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-foreground">Lista de Empleados</CardTitle>
          <p className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            Última actualización: {new Date().toLocaleString('es-PE')}
          </p>
        </CardHeader>
        <CardContent>
          {!Array.isArray(empleados) || empleados.length === 0 ? (
            <div className="rounded-2xl border border-cyan-400/15 bg-card/50 p-8 text-center group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30">
              <h3 className="text-lg font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">No hay empleados registrados</h3>
              <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Comienza agregando el primer empleado al sistema.</p>
              <Button className="mt-4" onClick={() => setIsModalOpen(true)}>Agregar primer empleado</Button>
            </div>
          ) : (
            <div className="overflow-auto rounded-2xl border border-cyan-400/15 group-data-[erp-theme=light]/dashboard:border-border">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-primary/80 group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Documento</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Puesto</th>
                    <th className="px-4 py-3 text-left">Departamento</th>
                    <th className="px-4 py-3 text-left">Ingreso</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-400/10 group-data-[erp-theme=light]/dashboard:divide-slate-100">
                  {empleados.map((empleado: any) => (
                    <tr key={empleado.id} className="transition hover:bg-white/[0.03] group-data-[erp-theme=light]/dashboard:hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                        {empleado.nombres} {empleado.apellidos}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{empleado.tipo_documento}: {empleado.numero_documento}</td>
                      <td className="px-4 py-3 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{empleado.email || 'Sin email'}</td>
                      <td className="px-4 py-3 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{empleado.puesto || 'Sin asignar'}</td>
                      <td className="px-4 py-3 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{empleado.departamentos?.nombre || 'Sin departamento'}</td>
                      <td className="px-4 py-3 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{formatDate(empleado.fecha_ingreso)}</td>
                      <td className="px-4 py-3">
                        <Badge className={empleado.estado === 'activo' ? 'border-cyan-300/30 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700' : 'border-border/25 bg-slate-300/10 text-foreground/90 group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground/85'}>
                          {empleado.estado}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => { setEmpleadoEditando(empleado); setIsModalOpen(true) }}>
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Inactivar empleado',
                                message: `¿Está seguro de inactivar a ${empleado.nombres} ${empleado.apellidos}?\n\nEl historial se conserva para planillas, pagos y contabilidad.`,
                                variant: 'warning',
                                onConfirm: async () => {
                                  const signature = `deactivate:${empleado.id}`
                                  try {
                                    const response = await del(`/rrhh/empleados/${empleado.id}`, {
                                      headers: { 'Idempotency-Key': intentFor(signature) },
                                    })
                                    if (response) {
                                      mutationIntents.current.delete(signature)
                                      loadData()
                                      alert('Empleado inactivado exitosamente')
                                    } else {
                                      throw new Error('Error al inactivar empleado')
                                    }
                                  } catch (error) {
                                    console.error('Error:', error)
                                    alert('Error al inactivar empleado')
                                  }
                                },
                              })
                            }}
                          >
                            Inactivar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmpleadoModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEmpleadoEditando(null)
        }}
        onSubmit={handleSubmitEmpleado}
        departamentos={departamentos}
        initialData={empleadoEditando}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={async () => {
          await confirmDialog.onConfirm()
          setConfirmDialog({ ...confirmDialog, isOpen: false })
        }}
      />
    </PageShell>
  )
}
