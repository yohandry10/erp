'use client'

import { useState, useCallback, useEffect } from 'react'
import UsuarioModal from '@/components/modals/UsuarioModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from "@/components/ui/use-toast"
import { useApi } from '@/hooks/use-api'
import { useTenant } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/use-permission'
import { UsersStats, UsersFilters, UsersTable, RolesSection } from '@/components/usuarios'
import { PageShell } from '@/components/erp/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldAlert, Users } from 'lucide-react'

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalUsuarios: 0,
    usuariosActivos: 0,
    usuariosInactivos: 0,
    totalRoles: 0
  })
  const [loading, setLoading] = useState(true)
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<any>(null)
  const { toast } = useToast()
  const { get, put, delete: del } = useApi()
  const { user: currentUser } = useTenant()
  const { hasPermission: canViewUsers, loading: permissionLoading } = usePermission('configuracion', 'ver', 'usuarios')
  const { hasPermission: canCreateUsers } = usePermission('configuracion', 'crear', 'usuarios')

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
    variant: 'default'
  })

  const fetchData = useCallback(async () => {
    if (permissionLoading || !canViewUsers) {
      if (!permissionLoading) setLoading(false)
      return
    }

    try {
      setLoading(true)

      const [usuariosData, rolesData, statsData] = await Promise.all([
        get(`/usuarios-sistema?rol=${filtroRol}&estado=${filtroEstado}`),
        get('/usuarios-sistema/roles'),
        get('/usuarios-sistema/stats')
      ])

      if (usuariosData?.success) {
        setUsuarios(usuariosData.data || [])
      }

      if (rolesData?.success) {
        setRoles(rolesData.data || [])
      }

      if (statsData?.success) {
        setStats(statsData.data)
      }

    } catch (error) {
      console.error('❌ Error cargando datos:', error)
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: "Error cargando datos de usuarios",
      })
    } finally {
      setLoading(false)
    }
  }, [canViewUsers, filtroEstado, filtroRol, get, permissionLoading, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleNuevoUsuario = () => {
    setUsuarioEditando(null)
    setModalOpen(true)
  }

  const handleEditarUsuario = (usuario: any) => {
    setUsuarioEditando(usuario)
    setModalOpen(true)
  }

  const handleCambiarEstado = async (usuario: any, nuevoEstado: string) => {
    try {
      const data = await put(`/usuarios-sistema/${usuario.id}/estado`, {
        estado: nuevoEstado
      })

      if (data?.success) {
        toast({
          title: "✅ Éxito",
          description: data.message,
        })
        fetchData()
      } else {
        throw new Error(data?.error || 'Error al cambiar estado')
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: error.message || "Error cambiando estado del usuario",
      })
    }
  }

  if (loading || permissionLoading) {
    return (
      <PageShell title="Gestión de Usuarios" description="Cargando usuarios, roles, permisos y métricas de acceso.">
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-cyan-400/20 bg-slate-950/60 text-slate-100 shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300 group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:border-t-blue-600" />
            <span className="text-sm font-semibold">Cargando usuarios...</span>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!canViewUsers) {
    return (
      <PageShell title="Acceso denegado" description="No tienes permisos para gestionar usuarios.">
        <Card className="border-cyan-400/20 bg-slate-950/65 text-center text-slate-100 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950">
          <CardContent className="p-12">
            <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-cyan-300 group-data-[erp-theme=light]/dashboard:text-blue-600" />
            <p className="text-sm text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">El rol actual no puede administrar usuarios.</p>
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Gestión de Usuarios"
      description="Administra usuarios, roles operativos y permisos del sistema con trazabilidad por tenant."
      actions={canCreateUsers ? <Button className="gap-2" onClick={handleNuevoUsuario}><Users className="h-4 w-4" /> Nuevo usuario</Button> : null}
    >

      {/* Stats */}
      <UsersStats stats={stats} />

      {/* Users Section */}
      <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-slate-950">Usuarios del Sistema</CardTitle>
          <UsersFilters
            filtroRol={filtroRol}
            filtroEstado={filtroEstado}
            roles={roles}
            onRolChange={setFiltroRol}
            onEstadoChange={setFiltroEstado}
          />
        </CardHeader>

        <CardContent>
          <UsersTable
            usuarios={usuarios}
            currentUserId={currentUser?.id}
            onEdit={handleEditarUsuario}
            onChangeStatus={handleCambiarEstado}
            onCreateFirst={handleNuevoUsuario}
          />
        </CardContent>
      </Card>

      {/* Roles Section */}
      <RolesSection roles={roles} />

      {/* Modal */}
      <UsuarioModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchData}
        usuario={usuarioEditando}
        roles={roles}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />
    </PageShell>
  )
}
