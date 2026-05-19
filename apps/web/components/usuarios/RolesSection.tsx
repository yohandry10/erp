'use client'

interface RolesSectionProps {
  roles: any[]
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function RolesSection({ roles }: RolesSectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">Roles y Permisos</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((rol: any, index) => (
          <Card key={index} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="mb-2 text-base text-white group-data-[erp-theme=light]/dashboard:text-slate-950">{rol.nombre}</CardTitle>
                <p className="text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
                  {rol.descripcion}
                </p>
              </div>
              <div className="flex h-10 min-w-10 items-center justify-center rounded-full border border-blue-300/25 bg-blue-300/10 p-2 font-bold text-blue-100 group-data-[erp-theme=light]/dashboard:text-blue-700">
                {rol.usuariosCount || 0}
              </div>
            </CardHeader>
            
            <CardContent className="border-t border-cyan-400/10 pt-4 group-data-[erp-theme=light]/dashboard:border-slate-100">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-cyan-200/70 group-data-[erp-theme=light]/dashboard:text-slate-500">
                Permisos:
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {Array.isArray(rol.permisos) && rol.permisos.length > 0 ? (
                  rol.permisos.map((permiso: string, pIndex: number) => (
                    <Badge key={pIndex} className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">
                      {permiso}
                    </Badge>
                  ))
                ) : (
                  <Badge className="border-slate-300/25 bg-slate-300/10 text-slate-300 group-data-[erp-theme=light]/dashboard:bg-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-600">
                    Sin permisos definidos
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
