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
      <div className="px-0 py-10 text-center">
        <p className="mb-4 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
          No hay usuarios registrados en el sistema
        </p>
        <button className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          onClick={onCreateFirst}
        >
          Crear primer usuario
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-2xl border border-cyan-400/15 group-data-[erp-theme=light]/dashboard:border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-primary/80 group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:text-muted-foreground">
          <tr>
            <th className="text-left p-4 font-semibold">Usuario</th>
            <th className="text-left p-4 font-semibold">Email</th>
            <th className="text-center p-4 font-semibold">Rol</th>
            <th className="text-left p-4 font-semibold">Último Acceso</th>
            <th className="text-left p-4 font-semibold">Creado</th>
            <th className="text-center p-4 font-semibold">Estado</th>
            <th className="text-center p-4 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cyan-400/10 group-data-[erp-theme=light]/dashboard:divide-slate-100">
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
