'use client'

interface UserRowProps {
  usuario: any
  currentUserId?: string
  onEdit: (usuario: any) => void
  onChangeStatus: (usuario: any, estado: string) => void
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
    case 'CAJERO':
      return { background: '#ec4899', color: 'white' }
    case 'SUPERVISOR':
      return { background: '#6366f1', color: 'white' }
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

export default function UserRow({ usuario, currentUserId, onEdit, onChangeStatus }: UserRowProps) {
  const statusStyle = getStatusColor(usuario.estado)
  const roleName = usuario.roles_usuario?.[0]?.roles?.nombre || 'Sin rol'
  const roleStyle = getRoleColor(roleName)
  const isCurrentUser = usuario.id === currentUserId

  const buttonBaseStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem'
  }

  return (
    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
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
            {usuario.nombre?.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
          </div>
          <div>
            <div style={{ fontWeight: '600' }}>{usuario.nombre}</div>
            <div style={{ fontSize: '0.8rem', opacity: '0.7' }}>
              {roleName}
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
          {isCurrentUser ? (
            <span style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280',
              fontStyle: 'italic'
            }}>
              (Tu cuenta)
            </span>
          ) : (
            <>
              <button 
                onClick={() => onEdit(usuario)}
                style={{ 
                  ...buttonBaseStyle,
                  background: 'rgba(59, 130, 246, 0.1)', 
                  border: '1px solid rgba(59, 130, 246, 0.2)', 
                  color: '#3b82f6'
                }}
              >
                Editar
              </button>
              {usuario.estado === 'ACTIVO' ? (
                <button 
                  onClick={() => onChangeStatus(usuario, 'INACTIVO')}
                  style={{ 
                    ...buttonBaseStyle,
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    color: '#ef4444'
                  }}
                >
                  Desactivar
                </button>
              ) : (
                <button 
                  onClick={() => onChangeStatus(usuario, 'ACTIVO')}
                  style={{ 
                    ...buttonBaseStyle,
                    background: 'rgba(16, 185, 129, 0.1)', 
                    border: '1px solid rgba(16, 185, 129, 0.2)', 
                    color: '#10b981'
                  }}
                >
                  Activar
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
