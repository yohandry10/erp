'use client'

import { useState, useCallback, useEffect } from 'react'
import UsuarioModal from '@/components/modals/UsuarioModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from "@/components/ui/use-toast"
import { useApi } from '@/hooks/use-api'
import { useTenant } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/use-permission'
import { UsersStats, UsersFilters, UsersTable, RolesSection } from '@/components/usuarios'

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
      <div className="dashboard-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
            <span style={{ marginLeft: '0.75rem', fontSize: '1.125rem', color: 'var(--primary-700)' }}>
              Cargando usuarios...
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (!canViewUsers) {
    return (
      <div className="dashboard-container">
        <div className="activity-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h1 className="dashboard-title">Acceso denegado</h1>
          <p className="dashboard-subtitle">No tienes permisos para gestionar usuarios.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Gestión de Usuarios</h1>
        <p className="dashboard-subtitle">Administra usuarios, roles y permisos del sistema</p>
        {canCreateUsers && (
          <button className="refresh-btn" onClick={handleNuevoUsuario}>
            + Nuevo Usuario
          </button>
        )}
      </div>

      {/* Stats */}
      <UsersStats stats={stats} />

      {/* Users Section */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Usuarios del Sistema</h2>
          <UsersFilters
            filtroRol={filtroRol}
            filtroEstado={filtroEstado}
            roles={roles}
            onRolChange={setFiltroRol}
            onEstadoChange={setFiltroEstado}
          />
        </div>

        <div className="activity-card">
          <UsersTable
            usuarios={usuarios}
            currentUserId={currentUser?.id}
            onEdit={handleEditarUsuario}
            onChangeStatus={handleCambiarEstado}
            onCreateFirst={handleNuevoUsuario}
          />
        </div>
      </div>

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
    </div>
  )
}
