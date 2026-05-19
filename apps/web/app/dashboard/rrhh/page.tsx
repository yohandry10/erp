'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BadgeDollarSign,
  Briefcase,
  CalendarClock,
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

const rrhhModules = [
  { href: '/dashboard/rrhh/planillas', title: 'Planillas', description: 'Cálculo de sueldos y beneficios', icon: BadgeDollarSign },
  { href: '/dashboard/rrhh/asistencia', title: 'Asistencia', description: 'Control de horarios y marcaciones', icon: CalendarClock },
  { href: '/dashboard/rrhh/contratos', title: 'Contratos', description: 'Gestión de contratos laborales', icon: FileText },
  { href: '/dashboard/rrhh/candidatos', title: 'Candidatos', description: 'Reclutamiento y selección', icon: Users },
  { href: '/dashboard/rrhh/pagos', title: 'Pagos', description: 'Control de pagos mensuales', icon: BadgeDollarSign },
  { href: '/dashboard/rrhh/reportes', title: 'Reportes', description: 'Indicadores y trazabilidad RRHH', icon: Briefcase },
]

const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('es-PE')
}

export default function RrhhPage() {
  const [empleados, setEmpleados] = useState<any[]>([])
  const [departamentos, setDepartamentos] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [empleadoEditando, setEmpleadoEditando] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const { get, post, put, delete: del } = useApi()

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

  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true'

  const loadData = useCallback(async () => {
    if (!rrhhEnabled) {
      setLoading(false)
      setEmpleados([])
      setDepartamentos([])
      return
    }

    try {
      setLoading(true)
      const empleadosData = await get('/rrhh/empleados')
      setEmpleados(
        empleadosData?.success && Array.isArray(empleadosData.data)
          ? empleadosData.data
          : Array.isArray(empleadosData)
            ? empleadosData
            : [],
      )

      const departamentosData = await get('/rrhh/departamentos')
      setDepartamentos(
        departamentosData?.success && Array.isArray(departamentosData.data)
          ? departamentosData.data
          : Array.isArray(departamentosData)
            ? departamentosData
            : [],
      )
    } catch (error) {
      console.error('Error cargando datos:', error)
      setEmpleados([])
      setDepartamentos([])
    } finally {
      setLoading(false)
    }
  }, [get, rrhhEnabled])

  useEffect(() => {
    loadData()
  }, [loadData])

  const stats = useMemo(() => {
    const activos = empleados.filter((emp: any) => emp?.estado === 'activo').length
    const nuevos = empleados.filter((emp: any) => {
      if (!emp?.fecha_ingreso) return false
      const fechaIngreso = new Date(emp.fecha_ingreso)
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
    try {
      const response = empleadoEditando?.id
        ? await put(`/rrhh/empleados/${empleadoEditando.id}`, empleadoData)
        : await post('/rrhh/empleados', empleadoData)

      if (response) {
        setIsModalOpen(false)
        setEmpleadoEditando(null)
        loadData()
      } else {
        throw new Error(empleadoEditando ? 'Error al actualizar empleado' : 'Error al crear empleado')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  if (loading) {
    return (
      <PageShell title="Recursos Humanos" description="Cargando empleados, departamentos, contratos y planillas operativas.">
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-cyan-400/20 bg-slate-950/60 text-slate-100 shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700">
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
        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950">
          <CardContent className="p-8 text-sm text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
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
              <Card className="h-full border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20 transition hover:-translate-y-0.5 hover:border-cyan-300/40 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950 group-data-[erp-theme=light]/dashboard:shadow-slate-200/70">
                <CardContent className="flex items-center gap-4 p-5">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">{module.title}</h3>
                    <p className="mt-1 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">{module.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950">
        <CardHeader>
          <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-slate-950">Lista de Empleados</CardTitle>
          <p className="text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
            Última actualización: {new Date().toLocaleString('es-PE')}
          </p>
        </CardHeader>
        <CardContent>
          {!Array.isArray(empleados) || empleados.length === 0 ? (
            <div className="rounded-2xl border border-cyan-400/15 bg-slate-900/50 p-8 text-center group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-slate-50">
              <h3 className="text-lg font-bold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">No hay empleados registrados</h3>
              <p className="mt-1 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">Comienza agregando el primer empleado al sistema.</p>
              <Button className="mt-4" onClick={() => setIsModalOpen(true)}>Agregar primer empleado</Button>
            </div>
          ) : (
            <div className="overflow-auto rounded-2xl border border-cyan-400/15 group-data-[erp-theme=light]/dashboard:border-slate-200">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-cyan-200/70 group-data-[erp-theme=light]/dashboard:bg-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-500">
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
                    <tr key={empleado.id} className="transition hover:bg-white/[0.03] group-data-[erp-theme=light]/dashboard:hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
                        {empleado.nombres} {empleado.apellidos}
                      </td>
                      <td className="px-4 py-3 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">{empleado.tipo_documento}: {empleado.numero_documento}</td>
                      <td className="px-4 py-3 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">{empleado.email || 'Sin email'}</td>
                      <td className="px-4 py-3 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">{empleado.puesto || 'Sin asignar'}</td>
                      <td className="px-4 py-3 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">{empleado.departamentos?.nombre || 'Sin departamento'}</td>
                      <td className="px-4 py-3 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">{formatDate(empleado.fecha_ingreso)}</td>
                      <td className="px-4 py-3">
                        <Badge className={empleado.estado === 'activo' ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700' : 'border-slate-300/25 bg-slate-300/10 text-slate-200 group-data-[erp-theme=light]/dashboard:bg-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-700'}>
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
                                  try {
                                    const response = await del(`/rrhh/empleados/${empleado.id}`)
                                    if (response) {
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
