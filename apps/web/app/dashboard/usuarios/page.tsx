'use client'

import { useState, useEffect } from 'react'
import UsuarioModal from '@/components/modals/UsuarioModal'
import { useToast } from "@/components/ui/use-toast"

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([])
  const [roles, setRoles] = useState([])
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
  const [usuarioEditando, setUsuarioEditando] = useState(null)
  const { toast } = useToast()

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Cargar datos en paralelo
      const [usuariosRes, rolesRes, statsRes] = await Promise.all([
        fetch(`http://localhost:3001/api/usuarios-sistema?rol=${filtroRol}&estado=${filtroEstado}`),
        fetch('http://localhost:3001/api/usuarios-sistema/roles'),
        fetch('http://localhost:3001/api/usuarios-sistema/stats')
      ])

      const [usuariosData, rolesData, statsData] = await Promise.all([
        usuariosRes.json(),
        rolesRes.json(),
        statsRes.json()
      ])

      if (usuariosData.success) {
        setUsuarios(usuariosData.data || [])
      }

      if (rolesData.success) {
        setRoles(rolesData.data || [])
      }

      if (statsData.success) {
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
  }

  useEffect(() => {
    fetchData()
  }, [filtroRol, filtroEstado])

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
      const response = await fetch(`http://localhost:3001/api/usuarios-sistema/${usuario.id}/estado`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "✅ Éxito",
          description: data.message,
        })
        fetchData() // Recargar datos
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: error.message || "Error cambiando estado del usuario",
      })
    }
  }

  const handleEliminarUsuario = async (usuario: any) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar al usuario "${usuario.nombre}"?`)) {
      return
    }

    try {
      const response = await fetch(`http://localhost:3001/api/usuarios-sistema/${usuario.id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "✅ Éxito",
          description: "Usuario eliminado exitosamente",
        })
        fetchData() // Recargar datos
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: error.message || "Error eliminando usuario",
      })
    }
  }

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'ACTIVO':
        return { background: '#10b981', color: 'white' }
      case 'INACTIVO':
        return { background: '#ef4444', color: 'white' }
      case 'SUSPENDIDO':
        return { background: '#f59e0b', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getRoleColor = (rol: string) => {
    switch (rol) {
      case 'ADMIN':
        return { background: '#8b5cf6', color: 'white' }
      case 'CONTADOR':
        return { background: '#3b82f6', color: 'white' }
      case 'VENDEDOR':
        return { background: '#10b981', color: 'white' }
      case 'ALMACENERO':
        return { background: '#f59e0b', color: 'white' }
      default:
        return { background: '#6b7280', color: 'white' }
    }
  }

  const getTimeAgo = (dateString: string) => {
    if (!dateString) return 'Nunca'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `hace ${diffMins} min`
    if (diffHours < 24) return `hace ${diffHours}h`
    return `hace ${diffDays}d`
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-lg">Cargando usuarios...</span>
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
        <button className="refresh-btn" onClick={handleNuevoUsuario}>
          + Nuevo Usuario
        </button>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>USUARIOS TOTALES</h3>
            <span className="stat-icon">👥</span>
          </div>
          <div className="stat-value">{stats.totalUsuarios}</div>
          <div className="stat-subtitle">Usuarios registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>USUARIOS ACTIVOS</h3>
            <span className="stat-icon">✅</span>
          </div>
          <div className="stat-value">{stats.usuariosActivos}</div>
          <div className="stat-subtitle">Activos en el sistema</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ROLES DEFINIDOS</h3>
            <span className="stat-icon">🔑</span>
          </div>
          <div className="stat-value">{stats.totalRoles}</div>
          <div className="stat-subtitle">Roles configurados</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>INACTIVOS</h3>
            <span className="stat-icon">⚠️</span>
          </div>
          <div className="stat-value warning">{stats.usuariosInactivos}</div>
          <div className="stat-subtitle">Usuarios inactivos</div>
        </div>
      </div>

      {/* Users Section */}
      <div className="activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="activity-title">Usuarios del Sistema</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <select 
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            >
              <option value="todos">Todos los roles</option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.nombre}>{rol.nombre}</option>
              ))}
            </select>
            
            <select 
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                background: 'rgba(255,255,255,0.1)',
                color: 'white'
              }}
            >
              <option value="todos">Todos los estados</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
              <option value="SUSPENDIDO">Suspendido</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="activity-card">
          {usuarios.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No hay usuarios registrados en el sistema</p>
              <button 
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                onClick={handleNuevoUsuario}
              >
                Crear primer usuario
              </button>
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Usuario</th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Email</th>
                    <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Rol</th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Último Acceso</th>
                    <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600' }}>Creado</th>
                    <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Estado</th>
                    <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario: any) => {
                    const statusStyle = getStatusColor(usuario.estado)
                    const roleName = usuario.roles_usuario?.[0]?.roles?.nombre || 'Sin rol'
                    const roleStyle = getRoleColor(roleName)
                    
                    return (
                      <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }} key={usuario.id}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ 
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: '600',
                              fontSize: '1.1rem'
                            }}>
                              {usuario.nombre.split(' ').map((n: string) => n[0]).join('')}
                            </div>
                            <div>
                              <div style={{ fontWeight: '600' }}>{usuario.nombre}</div>
                              <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                                {usuario.cargo || 'Sin cargo'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>{usuario.email}</td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{ 
                            background: roleStyle.background, 
                            color: roleStyle.color, 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '20px', 
                            fontSize: '0.8rem',
                            fontWeight: '500'
                          }}>
                            {roleName}
                          </span>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div>{getTimeAgo(usuario.fecha_ultimo_acceso)}</div>
                          <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
                            {usuario.fecha_ultimo_acceso ? 
                              new Date(usuario.fecha_ultimo_acceso).toLocaleDateString('es-PE') :
                              'Nunca'
                            }
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {new Date(usuario.created_at).toLocaleDateString('es-PE')}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{ 
                            background: statusStyle.background, 
                            color: statusStyle.color, 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '20px', 
                            fontSize: '0.8rem',
                            fontWeight: '500'
                          }}>
                            {usuario.estado}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button 
                              onClick={() => handleEditarUsuario(usuario)}
                              style={{ 
                                background: 'rgba(59, 130, 246, 0.1)', 
                                border: '1px solid rgba(59, 130, 246, 0.2)', 
                                padding: '0.5rem 1rem', 
                                borderRadius: '6px', 
                                color: '#3b82f6', 
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                              }}
                            >
                              Editar
                            </button>
                            {usuario.estado === 'ACTIVO' ? (
                              <button 
                                onClick={() => handleCambiarEstado(usuario, 'INACTIVO')}
                                style={{ 
                                  background: 'rgba(239, 68, 68, 0.1)', 
                                  border: '1px solid rgba(239, 68, 68, 0.2)', 
                                  padding: '0.5rem 1rem', 
                                  borderRadius: '6px', 
                                  color: '#ef4444', 
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                Desactivar
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleCambiarEstado(usuario, 'ACTIVO')}
                                style={{ 
                                  background: 'rgba(16, 185, 129, 0.1)', 
                                  border: '1px solid rgba(16, 185, 129, 0.2)', 
                                  padding: '0.5rem 1rem', 
                                  borderRadius: '6px', 
                                  color: '#10b981', 
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                Activar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Roles Section */}
      <div className="activity-section">
        <h2 className="activity-title">Roles y Permisos</h2>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {roles.map((rol: any, index) => (
            <div key={index} className="activity-card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ 
                      ...getRoleColor(rol.nombre), 
                      padding: '0.25rem 0.75rem', 
                      borderRadius: '20px', 
                      fontSize: '0.8rem',
                      fontWeight: '500'
                    }}>
                      {rol.nombre}
                    </span>
                  </h3>
                  <p style={{ fontSize: '0.9rem', opacity: '0.8', marginBottom: '0.5rem' }}>
                    {rol.descripcion}
                  </p>
                </div>
                <div style={{ 
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#3b82f6',
                  padding: '0.5rem',
                  borderRadius: '50%',
                  minWidth: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600'
                }}>
                  {rol.usuariosCount || 0}
                </div>
              </div>
              
              <div style={{ 
                borderTop: '1px solid rgba(0,0,0,0.1)', 
                paddingTop: '1rem'
              }}>
                <p style={{ fontSize: '0.8rem', opacity: '0.7', marginBottom: '0.5rem' }}>
                  Permisos:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  {(() => {
                    try {
                      const permisos = Array.isArray(rol.permisos) 
                        ? rol.permisos 
                        : JSON.parse(rol.permisos || '[]');
                      
                      return permisos.length > 0 ? permisos.map((permiso: string, pIndex: number) => (
                        <span key={pIndex} style={{ 
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          {permiso}
                        </span>
                      )) : (
                        <span style={{ 
                          background: 'rgba(107, 114, 128, 0.1)',
                          color: '#6b7280',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem'
                        }}>
                          Sin permisos definidos
                        </span>
                      );
                    } catch (error) {
                      return (
                        <span style={{ 
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem'
                        }}>
                          Error en permisos
                        </span>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <UsuarioModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchData}
        usuario={usuarioEditando}
        roles={roles}
      />
    </div>
  )
} 