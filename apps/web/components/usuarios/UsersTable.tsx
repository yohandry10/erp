'use client'

import UserRow from './UserRow'

interface UsersTableProps {
  usuarios: any[]
  currentUserId?: string
  onEdit: (usuario: any) => void
  onChangeStatus: (usuario: any, estado: string) => void
  onCreateFirst: () => void
}

export default function UsersTable({ 
  usuarios, 
  currentUserId, 
  onEdit, 
  onChangeStatus,
  onCreateFirst 
}: UsersTableProps) {
  if (usuarios.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <p style={{ color: 'var(--primary-500)', marginBottom: '1rem' }}>
          No hay usuarios registrados en el sistema
        </p>
        <button 
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--blue-600)',
            color: 'white',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--blue-700)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--blue-600)'}
          onClick={onCreateFirst}
        >
          Crear primer usuario
        </button>
      </div>
    )
  }

  return (
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
          {usuarios.map((usuario: any) => (
            <UserRow
              key={usuario.id}
              usuario={usuario}
              currentUserId={currentUserId}
              onEdit={onEdit}
              onChangeStatus={onChangeStatus}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
