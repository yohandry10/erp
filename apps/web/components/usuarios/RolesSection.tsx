'use client'

interface RolesSectionProps {
  roles: any[]
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

export default function RolesSection({ roles }: RolesSectionProps) {
  return (
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
                {Array.isArray(rol.permisos) && rol.permisos.length > 0 ? (
                  rol.permisos.map((permiso: string, pIndex: number) => (
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
                  ))
                ) : (
                  <span style={{ 
                    background: 'rgba(107, 114, 128, 0.1)',
                    color: '#6b7280',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem'
                  }}>
                    Sin permisos definidos
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
