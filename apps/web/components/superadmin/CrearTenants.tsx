'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useApiCall } from '@/hooks/use-api'
import GestionTenants from './components/GestionTenants'

export interface Tenant {
  id?: string
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  email?: string
  telefono?: string
  estado?: 'ACTIVO' | 'INACTIVO'
  is_active?: boolean
  created_at?: string
}

export default function CrearTenants() {
  const api = useApiCall()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const fetchTenants = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/tenants')
      if (res?.success) {
        setTenants(res.data || [])
      } else {
        setError(res?.message || 'No se pudo cargar los tenants')
      }
    } catch (err: any) {
      setError(err?.message || 'Error al cargar los tenants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [])

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tenants.filter(t => {
      const matchesText =
        !q ||
        [t.razon_social, t.nombre_comercial, t.ruc, t.email, t.telefono, t.direccion]
          .filter(Boolean)
          .some(v => (v as string).toLowerCase().includes(q))

      const active = t.estado ? t.estado === 'ACTIVO' : (t.is_active ?? true)
      const matchesStatus =
        statusFilter === 'ALL' ? true : statusFilter === 'ACTIVE' ? active : !active

      return matchesText && matchesStatus
    })
  }, [tenants, search, statusFilter])

  const handleViewTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setViewModalOpen(true)
  }

  const handleEditTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setIsModalOpen(true)
  }

  const handleDeleteTenant = async (tenant: Tenant) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la empresa "${tenant.razon_social}"?\n\nEsta acción no se puede deshacer.`)) {
      return
    }

    try {
      const res = await api.delete(`/tenants/${tenant.id}`)
      if (res?.success) {
        alert('✅ Empresa eliminada exitosamente')
        fetchTenants()
      } else {
        alert('❌ ' + (res?.message || 'Error al eliminar la empresa'))
      }
    } catch (err: any) {
      alert('❌ ' + (err?.message || 'Error al eliminar la empresa'))
    }
  }

  // Modales con SSR desactivado (usa window/document para el toast)
  const CrearTenantModal = useMemo(
    () =>
      dynamic(() => import('./components/CrearTenantModal'), {
        ssr: false,
      }),
    []
  )

  const ViewTenantModal = useMemo(
    () =>
      dynamic<{ tenant: Tenant; onClose: () => void }>(
        () => import('./components/ViewTenantModal').then(mod => mod.default),
        { ssr: false }
      ),
    []
  )

  return (
    <>
      <GestionTenants
        tenants={filteredTenants}
        loading={loading}
        error={error}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        onCreateClick={() => { setSelectedTenant(null); setIsModalOpen(true) }}
        onRefresh={fetchTenants}
        onViewTenant={handleViewTenant}
        onEditTenant={handleEditTenant}
        onDeleteTenant={handleDeleteTenant}
      />

      {isModalOpen && (
        <CrearTenantModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setSelectedTenant(null) }}
          onSuccess={fetchTenants}
          tenant={selectedTenant}
        />
      )}

      {viewModalOpen && selectedTenant && (
        <ViewTenantModal
          tenant={selectedTenant}
          onClose={() => { setViewModalOpen(false); setSelectedTenant(null) }}
        />
      )}
    </>
  )
}
