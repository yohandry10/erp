'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  const [filtroRol, setFiltroRol] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<any>(null)
  const { toast } = useToast()
  const { get, put, delete: del } = useApi()
  const { user: currentUser } = useTenant()
  const { hasPermission: canViewUsers, loading: permissionLoading } = usePermission('configuracion', 'ver', 'usuarios')
  const { hasPermission: canCreateUsers } = usePermission('configuracion', 'crear', 'usuarios')
  const { hasPermission: canManageRoles } = usePermission('users', 'manage', '')
  const queryClient = useQueryClient()

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

  const DEFAULT_STATS = { totalUsuarios: 0, usuariosActivos: 0, usuariosInactivos: 0, totalRoles: 0 }

  // React Query cachea por 60s (config global): la primera visita bloquea con
  // spinner, pero al volver al módulo se muestran los datos cacheados al instante
  // y se revalidan en segundo plano en lugar de recargar de cero cada vez.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['usuarios-sistema', filtroRol, filtroEstado],
    enabled: !permissionLoading && canViewUsers,
    queryFn: async () => {
      const [usuariosData, rolesData, statsData] = await Promise.all([
        get(`/usuarios-sistema?rol=${filtroRol}&estado=${filtroEstado}`),
        get('/usuarios-sistema/roles'),
        get('/usuarios-sistema/stats'),
      ])
      return {
        usuarios: usuariosData?.success ? (usuariosData.data || []) : [],
        roles: rolesData?.success ? (rolesData.data || []) : [],
        stats: statsData?.success ? statsData.data : DEFAULT_STATS,
      }
    },
  })

  const usuarios = data?.usuarios ?? []
  const roles = data?.roles ?? []
  const stats = data?.stats ?? DEFAULT_STATS
  const loading = permissionLoading || (canViewUsers && isLoading)

  const fetchData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['usuarios-sistema'] })
  }, [queryClient])

  useEffect(() => {
    if (isError) {
      console.error('❌ Error cargando datos:', error)
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: "Error cargando datos de usuarios",
      })
    }
  }, [isError, error, toast])

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
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-cyan-400/20 bg-card/60 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground/85">
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
        <Card className="border-cyan-400/20 bg-card/65 text-center text-foreground group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
          <CardContent className="p-12">
            <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" />
            <p className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">El rol actual no puede administrar usuarios.</p>
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
      <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-foreground">Usuarios del Sistema</CardTitle>
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
      <RolesSection roles={roles} canManage={canManageRoles} onRoleCreated={fetchData} />

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
