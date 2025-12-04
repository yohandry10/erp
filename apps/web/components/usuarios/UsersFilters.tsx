'use client'

interface UsersFiltersProps {
  filtroRol: string
  filtroEstado: string
  roles: any[]
  onRolChange: (value: string) => void
  onEstadoChange: (value: string) => void
}

export default function UsersFilters({ 
  filtroRol, 
  filtroEstado, 
  roles, 
  onRolChange, 
  onEstadoChange 
}: UsersFiltersProps) {
  const selectStyle = { 
    padding: '0.5rem 1rem', 
    borderRadius: '8px', 
    border: '1px solid rgba(255,255,255,0.2)', 
    background: 'rgba(255,255,255,0.1)',
    color: 'white'
  }

  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <select 
        value={filtroRol}
        onChange={(e) => onRolChange(e.target.value)}
        style={selectStyle}
      >
        <option value="todos">Todos los roles</option>
        {roles.map((rol) => (
          <option key={rol.id} value={rol.nombre}>{rol.nombre}</option>
        ))}
      </select>
      
      <select 
        value={filtroEstado}
        onChange={(e) => onEstadoChange(e.target.value)}
        style={selectStyle}
      >
        <option value="todos">Todos los estados</option>
        <option value="ACTIVO">Activo</option>
        <option value="INACTIVO">Inactivo</option>
        <option value="SUSPENDIDO">Suspendido</option>
      </select>
    </div>
  )
}
