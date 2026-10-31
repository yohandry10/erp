'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface RolesSectionProps {
  roles: any[]
  canManage?: boolean
  onRoleCreated?: () => void
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCountryContext } from '@/hooks/use-country-context'
import { useApi } from '@/hooks/use-api'
import { useToast } from '@/components/ui/use-toast'
import { Plus, ShieldCheck } from 'lucide-react'
import { unwrapApiData } from '@/lib/api-contract'

const RESTRICTED_DEMO_PERMISSIONS = /^(security\.audit\.|tenants\.manage$|system\.debug$|documentos\.audit\.read$)/i
const PERMISSIONS_PREVIEW_LIMIT = 6

export default function RolesSection({ roles, canManage = false, onRoleCreated }: RolesSectionProps) {
  const country = useCountryContext()
  const { get, post } = useApi({ throwOnError: true })
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [permissions, setPermissions] = useState<any[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permissionsError, setPermissionsError] = useState<string | null>(null)
  const [permissionsReady, setPermissionsReady] = useState(false)
  const permissionsRequest = useRef(0)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(() => new Set())

  const permissionCode = (permission: any) => String(
    permission.codigo || [permission.modulo, permission.recurso, permission.accion].filter(Boolean).join('.')
  ).toLowerCase()

  const assignablePermissions = useMemo(() => permissions.filter((permission) => {
    const code = permissionCode(permission)
    return Boolean(permission?.id) && !RESTRICTED_DEMO_PERMISSIONS.test(code)
      && (country.paisCodigo === 'PE' || !/^(gre|sire)\b/i.test(code))
  }), [permissions, country.paisCodigo])

  const loadPermissions = useCallback(async () => {
    const request = ++permissionsRequest.current
    setPermissionsLoading(true)
    setPermissionsReady(false)
    setPermissionsError(null)
    try {
      const response = await get('/permissions')
      const data = unwrapApiData<unknown>(response)
      if (!Array.isArray(data)) throw new Error('Catálogo de permisos incompleto')
      if (request !== permissionsRequest.current) return
      setPermissions(data)
      setPermissionsReady(true)
    } catch {
      if (request !== permissionsRequest.current) return
      setPermissionsError('No se pudieron cargar los permisos disponibles.')
    } finally {
      if (request === permissionsRequest.current) setPermissionsLoading(false)
    }
  }, [get])

  useEffect(() => {
    if (!open) return
    setIdempotencyKey(crypto.randomUUID())
    setNombre('')
    setDescripcion('')
    setSelected([])
    setPermissions([])
    void loadPermissions()
    const requestState = permissionsRequest
    return () => { ++requestState.current }
  }, [open, loadPermissions])

  const createRole = async () => {
    if (!nombre.trim() || !permissionsReady || permissionsLoading || permissionsError) return
    setLoading(true)
    try {
      const response = await post('/roles', {
        idempotency_key: idempotencyKey,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        permission_ids: selected,
      })
      const created = unwrapApiData<{ id?: string }>(response)
      if (!created?.id) throw new Error('No se pudo confirmar el rol creado. Reintenta conservando los datos.')
      toast({ title: 'Rol creado', description: `${nombre.trim()} ya está disponible para asignarlo a usuarios.` })
      setOpen(false)
      onRoleCreated?.()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo crear el rol', description: error?.message || 'Revisa los datos e inténtalo nuevamente.' })
    } finally {
      setLoading(false)
    }
  }
  const visiblePermissions = (permissions: unknown): string[] => {
    if (!Array.isArray(permissions)) return []
    const normalized = permissions.map(String)
    if (country.paisCodigo === 'PE') return normalized
    return normalized.filter((permission) => !/^(gre|sire)\b/i.test(permission.trim()))
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">Roles y Permisos</h2>
          <p className="text-sm text-muted-foreground">Crea perfiles operativos propios sin acceso a la administración global.</p>
        </div>
        {canManage && <Button type="button" className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo rol</Button>}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((rol: any, index) => {
          const permisos = visiblePermissions(rol.permisos)
          const roleKey = String(rol.id || `${rol.nombre}-${index}`)
          const expanded = expandedRoles.has(roleKey)
          const displayedPermissions = expanded ? permisos : permisos.slice(0, PERMISSIONS_PREVIEW_LIMIT)
          const remainingPermissions = permisos.length - displayedPermissions.length
          return <Card key={roleKey} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
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
              <div id={`role-permissions-${index}`} className="mb-4 flex flex-wrap gap-2">
                {permisos.length > 0 ? (
                  displayedPermissions.map((permiso: string, permissionIndex: number) => (
                    <Badge key={`${permiso}-${permissionIndex}`} className="border-cyan-300/25 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">
                      {permiso}
                    </Badge>
                  ))
                ) : (
                  <Badge className="border-border/25 bg-slate-300/10 text-muted-foreground group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground/80">
                    Sin permisos definidos
                  </Badge>
                )}
              </div>
              {permisos.length > PERMISSIONS_PREVIEW_LIMIT && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={expanded}
                  aria-controls={`role-permissions-${index}`}
                  onClick={() => setExpandedRoles((current) => {
                    const next = new Set(current)
                    if (next.has(roleKey)) next.delete(roleKey)
                    else next.add(roleKey)
                    return next
                  })}
                >
                  {expanded ? 'Mostrar menos' : `Ver ${remainingPermissions} permisos más`}
                </Button>
              )}
            </CardContent>
          </Card>
        })}
      </div>

      <Dialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Crear rol personalizado</DialogTitle>
            <DialogDescription>Define un rol para esta empresa. Los permisos globales y de auditoría sensible no se pueden delegar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="role-name">Nombre</Label><Input id="role-name" value={nombre} maxLength={100} onChange={(event) => setNombre(event.target.value)} placeholder="Ej. Vendedor de prueba" /></div>
            <div className="space-y-2"><Label htmlFor="role-description">Descripción</Label><Input id="role-description" value={descripcion} maxLength={250} onChange={(event) => setDescripcion(event.target.value)} placeholder="Alcance operativo del rol" /></div>
            <div className="space-y-2">
              <Label>Permisos operativos</Label>
              {permissionsError && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm"><p>{permissionsError}</p><Button type="button" variant="outline" onClick={loadPermissions} disabled={permissionsLoading || loading}>Reintentar permisos</Button></div>}
              <div className="grid max-h-72 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
                {assignablePermissions.map((permission) => {
                  const code = permissionCode(permission)
                  const checked = selected.includes(permission.id)
                  return <label key={permission.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted/60">
                    <Checkbox disabled={!permissionsReady || loading} checked={checked} onCheckedChange={(value) => setSelected((current) => value ? [...current, permission.id] : current.filter((id) => id !== permission.id))} />
                    <span><span className="block text-sm font-medium">{permission.descripcion || code}</span><span className="block text-xs text-muted-foreground">{code}</span></span>
                  </label>
                })}
                {permissionsLoading && <p className="text-sm text-muted-foreground">Cargando permisos disponibles…</p>}
                {permissionsReady && !assignablePermissions.length && <p className="text-sm text-muted-foreground">No hay permisos operativos disponibles para este rol.</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
            <Button type="button" onClick={createRole} disabled={loading || !nombre.trim() || !permissionsReady || permissionsLoading || !!permissionsError}>{loading ? 'Creando…' : 'Crear rol'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
