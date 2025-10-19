'use client'

import { useEffect, useState } from 'react'
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
  const { get } = useApi()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)

  // Fetch available tenants
  useEffect(() => {
    const fetchTenants = async () => {
      setLoading(true)
      try {
        const response = await get('/tenants')
        const tenantsData = response?.data || response || []
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
    }

    fetchTenants()
  }, [get])

  const handleTenantSwitch = async (tenantId: string) => {
    if (tenantId === tenant?.id) {
      return // Already on this tenant
    }

    setSwitching(true)
    try {
      await switchTenant(tenantId)
      // The page will reload after successful switch
    } catch (error) {
      console.error('Error switching tenant:', error)
      setSwitching(false)
    }
  }

  // Only show for super-admins
  if (!isSuperAdmin) {
    return null
  }

  return (
    <div style={{ 
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* Label */}
      <div style={{ 
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: '#64748b',
        marginBottom: '0.5rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        <Building2 style={{ width: '14px', height: '14px' }} />
        <span>Empresa Actual</span>
      </div>
      
      {/* Tenant Selector */}
      <Select
        value={tenant?.id || ''}
        onValueChange={handleTenantSwitch}
        disabled={loading || switching}
      >
        <SelectTrigger style={{
          width: '100%',
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '0.625rem 0.75rem',
          fontSize: '0.875rem',
          fontWeight: '500',
          color: '#1e293b',
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {switching ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
              <span>Cambiando...</span>
            </div>
          ) : (
            <SelectValue>
              <span style={{ 
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {tenant?.nombre || 'Seleccionar empresa'}
              </span>
            </SelectValue>
          )}
        </SelectTrigger>
        <SelectContent 
          position="popper"
          side="bottom"
          align="start"
          sideOffset={8}
          style={{
            width: 'var(--radix-select-trigger-width)',
            maxHeight: '300px',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            zIndex: 9999,
            overflow: 'auto'
          }}
        >
          {loading ? (
            <div style={{ 
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#64748b',
              fontSize: '0.875rem'
            }}>
              <RefreshCw style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
              <span>Cargando empresas...</span>
            </div>
          ) : tenants.length === 0 ? (
            <div style={{ 
              padding: '0.75rem 1rem',
              color: '#64748b',
              fontSize: '0.875rem',
              textAlign: 'center'
            }}>
              No hay empresas disponibles
            </div>
          ) : (
            tenants.map((t) => (
              <SelectItem 
                key={t.id} 
                value={t.id}
                style={{
                  padding: '0.625rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s'
                }}
              >
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  gap: '0.5rem'
                }}>
                  <span style={{ 
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {t.nombre}
                  </span>
                  {t.id === tenant?.id && (
                    <Check style={{ 
                      width: '16px',
                      height: '16px',
                      color: '#3b82f6',
                      flexShrink: 0
                    }} />
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
