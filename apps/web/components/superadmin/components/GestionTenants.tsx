'use client'

import { useMemo } from 'react'
import {
  Building2,
  CheckCircle2,
  CircleOff,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Tenant {
  id?: string
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  email?: string
  telefono?: string
  estado?: 'ACTIVO' | 'INACTIVO'
  is_active?: boolean
  is_demo?: boolean
  demo_expires_at?: string
}

interface Props {
  tenants: Tenant[]
  loading: boolean
  error: string
  search: string
  onSearchChange: (v: string) => void
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE'
  onStatusChange: (v: 'ALL' | 'ACTIVE' | 'INACTIVE') => void
  onCreateClick: () => void
  onRefresh: () => void
  onViewTenant?: (tenant: Tenant) => void
  onEditTenant?: (tenant: Tenant) => void
  onDeleteTenant?: (tenant: Tenant) => void
  onDemoTenant?: (tenant: Tenant) => void
}

const shell =
  'rounded-[1.15rem] border border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950 group-data-[erp-theme=light]/dashboard:shadow-slate-200/70'

const field =
  'h-11 border-cyan-400/20 bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400/40 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950'

function isTenantActive(tenant: Tenant) {
  return tenant.estado ? tenant.estado === 'ACTIVO' : (tenant.is_active ?? true)
}

export default function GestionTenants({
  tenants,
  loading,
  error,
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onCreateClick,
  onRefresh,
  onViewTenant,
  onEditTenant,
  onDeleteTenant,
  onDemoTenant,
}: Props) {
  const empty = !loading && tenants.length === 0
  const rows = useMemo(() => tenants, [tenants])

  return (
    <Card className={`${shell} mt-6 overflow-hidden`}>
      <CardHeader className="border-b border-cyan-400/15 bg-slate-950/45 px-6 py-5 group-data-[erp-theme=light]/dashboard:bg-slate-50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200 group-data-[erp-theme=light]/dashboard:text-cyan-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
                Gestion de tenants
              </CardTitle>
              <p className="mt-1 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-600">
                Empresas, estados y demos operativas del entorno multi-tenant.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onRefresh}
              className="border-cyan-400/20 bg-slate-900/80 text-slate-100 hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
            <Button type="button" onClick={onCreateClick} className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-cyan-950/30">
              <Plus className="mr-2 h-4 w-4" />
              Crear tenant
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-6">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/70 group-data-[erp-theme=light]/dashboard:text-slate-400" />
            <Input
              placeholder="Buscar por nombre, email, RUC, telefono o direccion"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`${field} pl-10`}
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
            className={`${field} rounded-md px-3 text-sm outline-none`}
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
          </select>
        </div>

        {loading && (
          <div className="rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-5 text-sm font-semibold text-slate-300 group-data-[erp-theme=light]/dashboard:bg-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-600">
            Cargando tenants...
          </div>
        )}

        {!loading && !!error && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm font-semibold text-amber-100 group-data-[erp-theme=light]/dashboard:text-amber-800">
            {error}
          </div>
        )}

        {empty && !error && (
          <div className="rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-8 text-center group-data-[erp-theme=light]/dashboard:bg-slate-50">
            <Building2 className="mx-auto h-9 w-9 text-cyan-200/70 group-data-[erp-theme=light]/dashboard:text-slate-400" />
            <p className="mt-3 text-sm font-semibold text-slate-200 group-data-[erp-theme=light]/dashboard:text-slate-700">
              No hay tenants que coincidan con los filtros.
            </p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-cyan-400/15">
            <div className="grid grid-cols-[minmax(260px,2fr)_minmax(220px,1.4fr)_minmax(180px,1.2fr)_140px_180px] gap-4 bg-slate-900/80 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-100/70 group-data-[erp-theme=light]/dashboard:bg-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-500">
              <div>Tenant</div>
              <div>Contacto</div>
              <div>Ubicacion</div>
              <div>Estado</div>
              <div className="text-right">Acciones</div>
            </div>

            <div className="divide-y divide-cyan-400/10">
              {rows.map((tenant, idx) => {
                const active = isTenantActive(tenant)
                return (
                  <div
                    key={(tenant.id ?? tenant.ruc) + idx}
                    className="grid grid-cols-[minmax(260px,2fr)_minmax(220px,1.4fr)_minmax(180px,1.2fr)_140px_180px] gap-4 px-4 py-4 transition hover:bg-cyan-400/5 group-data-[erp-theme=light]/dashboard:hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200 group-data-[erp-theme=light]/dashboard:text-cyan-700">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">
                          {tenant.razon_social}
                        </p>
                        <p className="mt-1 text-xs text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
                          RUC {tenant.ruc}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
                      {tenant.email && (
                        <p className="flex min-w-0 items-center gap-2">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-cyan-200/70 group-data-[erp-theme=light]/dashboard:text-slate-400" />
                          <span className="truncate">{tenant.email}</span>
                        </p>
                      )}
                      {tenant.telefono && (
                        <p className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-cyan-200/70 group-data-[erp-theme=light]/dashboard:text-slate-400" />
                          <span>{tenant.telefono}</span>
                        </p>
                      )}
                    </div>

                    <p className="flex min-w-0 items-center gap-2 text-xs text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-200/70 group-data-[erp-theme=light]/dashboard:text-slate-400" />
                      <span className="truncate">{tenant.direccion || 'Sin direccion registrada'}</span>
                    </p>

                    <div className="flex flex-col items-start gap-2">
                      <Badge className={active ? 'border-cyan-300/25 bg-cyan-400/15 text-cyan-100 group-data-[erp-theme=light]/dashboard:text-cyan-800' : 'border-slate-500/30 bg-slate-500/15 text-slate-200 group-data-[erp-theme=light]/dashboard:text-slate-700'}>
                        {active ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <CircleOff className="mr-1 h-3 w-3" />}
                        {active ? 'Activo' : 'Inactivo'}
                      </Badge>
                      {tenant.is_demo && (
                        <Badge className="border-blue-300/25 bg-blue-400/15 text-blue-100 group-data-[erp-theme=light]/dashboard:text-blue-800">
                          Demo
                        </Badge>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" size="icon" variant="outline" title="Activar demo" onClick={() => onDemoTenant?.(tenant)} className="border-cyan-400/20 bg-slate-900/70 text-cyan-100 hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700">
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="outline" title="Ver detalles" onClick={() => onViewTenant?.(tenant)} className="border-cyan-400/20 bg-slate-900/70 text-cyan-100 hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="outline" title="Editar" onClick={() => onEditTenant?.(tenant)} className="border-cyan-400/20 bg-slate-900/70 text-cyan-100 hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="outline" title="Eliminar" onClick={() => onDeleteTenant?.(tenant)} className="border-cyan-400/20 bg-slate-900/70 text-cyan-100 hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
