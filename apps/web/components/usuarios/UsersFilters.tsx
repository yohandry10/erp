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
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select 
        value={filtroRol}
        onChange={(e) => onRolChange(e.target.value)} className="h-10 rounded-md border border-cyan-400/20 bg-slate-900/70 px-3 text-sm text-slate-100 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950"
      >
        <option value="todos">Todos los roles</option>
        {roles.map((rol) => (
          <option key={rol.id} value={rol.nombre}>{rol.nombre}</option>
        ))}
      </select>
      
      <select 
        value={filtroEstado}
        onChange={(e) => onEstadoChange(e.target.value)} className="h-10 rounded-md border border-cyan-400/20 bg-slate-900/70 px-3 text-sm text-slate-100 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950"
      >
        <option value="todos">Todos los estados</option>
        <option value="ACTIVO">Activo</option>
        <option value="INACTIVO">Inactivo</option>
        <option value="SUSPENDIDO">Suspendido</option>
      </select>
    </div>
  )
}
