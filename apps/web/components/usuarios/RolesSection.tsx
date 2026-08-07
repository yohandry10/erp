'use client'

interface RolesSectionProps {
  roles: any[]
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useCountryContext } from '@/hooks/use-country-context'

export default function RolesSection({ roles }: RolesSectionProps) {
  const country = useCountryContext()
  const visiblePermissions = (permissions: unknown): string[] => {
    if (!Array.isArray(permissions)) return []
    const normalized = permissions.map(String)
    if (country.paisCodigo === 'PE') return normalized
    return normalized.filter((permission) => !/^(gre|sire)\b/i.test(permission.trim()))
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">Roles y Permisos</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((rol: any, index) => {
          const permisos = visiblePermissions(rol.permisos)
          return <Card key={index} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="mb-2 text-base text-white group-data-[erp-theme=light]/dashboard:text-foreground">{rol.nombre}</CardTitle>
                <p className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
                  {rol.descripcion}
                </p>
              </div>
              <div className="flex h-10 min-w-10 items-center justify-center rounded-full border border-blue-300/25 bg-blue-300/10 p-2 font-bold text-blue-700 dark:text-blue-200 group-data-[erp-theme=light]/dashboard:text-blue-700">
                {rol.usuariosCount || 0}
              </div>
            </CardHeader>

            <CardContent className="border-t border-cyan-400/10 pt-4 group-data-[erp-theme=light]/dashboard:border-border">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-primary/80 group-data-[erp-theme=light]/dashboard:text-muted-foreground">
                Permisos:
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {permisos.length > 0 ? (
                  permisos.map((permiso: string, pIndex: number) => (
                    <Badge key={pIndex} className="border-cyan-300/25 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">
                      {permiso}
                    </Badge>
                  ))
                ) : (
                  <Badge className="border-border/25 bg-slate-300/10 text-muted-foreground group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground/80">
                    Sin permisos definidos
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        })}
      </div>
    </section>
  )
}
