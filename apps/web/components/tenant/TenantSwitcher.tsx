'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTenant } from '@/contexts/TenantContext'
import { useApi } from '@/hooks/use-api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, RefreshCw, Check } from 'lucide-react'

interface Tenant {
  id: string
  nombre: string
  estado: string
}

export function TenantSwitcher() {
  const { tenant, user, isSuperAdmin, switchTenant } = useTenant()
  const { get } = useApi({ showErrorToast: false })
  const getRef = useRef(get)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)

  useEffect(() => {
    getRef.current = get
  }, [get])

  // Fetch available tenants
  const fetchTenants = useCallback(async () => {
      if (!isSuperAdmin) return
      setLoading(true)
      try {
        const response = await getRef.current('/tenants')
        const rawTenants = response?.data ?? response
        const tenantsData = Array.isArray(rawTenants)
          ? rawTenants
          : Array.isArray(rawTenants?.items)
            ? rawTenants.items
            : Array.isArray(rawTenants?.tenants)
              ? rawTenants.tenants
              : []
        // Filter to only show active tenants
        const activeTenants = tenantsData.filter(
          (t: Tenant) => t.estado === 'ACTIVO' || t.estado === 'PRUEBA'
        )
        setTenants(activeTenants)
      } catch (error) {
        console.error('Error fetching tenants:', error)
        setTenants([])
      } finally {
        setLoading(false)
      }
  }, [isSuperAdmin])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  const handleTenantSwitch = async (tenantId: string) => {
    if (tenantId === tenant?.id) {
      return // Already on this tenant
    }

    setSwitching(true)
    setSwitchError(null)
    try {
      await switchTenant(tenantId)
      window.location.reload()
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'Error al cambiar de empresa')
      setSwitching(false)
    }
  }

  // Only show for super-admins
  if (!isSuperAdmin) {
    return null
  }

  return (
    <div className="bg-white border rounded-3 p-4 shadow">
      {/* Label */}
      <div className="flex items-center gap-2 text-3 font-semibold text-slate-500 mb-2">
        <Building2 className="w-3.5 h-3.5" />
        <span>Empresa Actual</span>
      </div>
      
      {switchError && (
        <div className="text-red-600 text-xs mb-2 px-1">{switchError}</div>
      )}

      {/* Tenant Selector */}
      <Select
        value={tenant?.id || ''}
        onValueChange={handleTenantSwitch}
        disabled={loading || switching}
      >
        <SelectTrigger className="w-[100%] bg-slate-50 border rounded-2 py-2.5 px-3 text-[0.875rem] font-medium text-slate-800 cursor-pointer transition flex items-center justify-between">
          {switching ? (
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cambiando...</span>
            </div>
          ) : (
            <SelectValue>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {tenant?.nombre || 'Seleccionar empresa'}
              </span>
            </SelectValue>
          )}
        </SelectTrigger>
        <SelectContent 
          position="popper"
          side="bottom"
          align="start"
          sideOffset={8} className="max-h-[300px] bg-white border rounded-2 shadow z-[9999] overflow-auto"
        >
          {loading ? (
            <div className="py-3 px-4 flex items-center gap-2 text-slate-500 text-[0.875rem]">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cargando empresas...</span>
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-3 px-4 text-slate-500 text-[0.875rem] text-center">
              No hay empresas disponibles
            </div>
          ) : (
            tenants.map((t) => (
              <SelectItem 
                key={t.id} 
                value={t.id} className="py-2.5 px-4 cursor-pointer text-[0.875rem] flex items-center justify-between transition"
              >
                <div className="flex items-center justify-between w-[100%] gap-2">
                  <span className="flex-[1] overflow-hidden text-ellipsis whitespace-nowrap">
                    {t.nombre}
                  </span>
                  {t.id === tenant?.id && (
                    <Check className="w-4 h-4 text-blue-500 shrink-0" />
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
