'use client'

import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import CrearTenantModal from '@/components/superadmin/CrearTenantModal'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  CheckCircle, 
  XCircle,
  Building2,
  Mail,
  Users,
  Globe
} from 'lucide-react'

interface Tenant {
  id: string
  nombre: string
  ruc?: string
  email: string
  pais: string
  moneda: string
  estado: 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO' | 'PRUEBA'
  user_count?: number
  active_user_count?: number
  created_at?: string
}

export function TenantList() {
  const { get, post } = useApi({ showSuccessToast: true })
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)

  // Debug log
  console.log('🟢 TenantList - showCreateDialog:', showCreateDialog)

  // Fetch tenants
  const fetchTenants = async () => {
    setLoading(true)
    try {
      const response = await get('/tenants')
      const tenantsData = response?.data || response || []
      setTenants(tenantsData)
      setFilteredTenants(tenantsData)
    } catch (error) {
      console.error('Error fetching tenants:', error)
      setTenants([])
      setFilteredTenants([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
  }, [])

  // Filter tenants based on search and status
  useEffect(() => {
    let filtered = tenants

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (tenant) =>
          tenant.nombre.toLowerCase().includes(query) ||
          tenant.email.toLowerCase().includes(query) ||
          tenant.ruc?.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((tenant) => tenant.estado === statusFilter)
    }

    setFilteredTenants(filtered)
  }, [searchQuery, statusFilter, tenants])

  // Handle tenant activation
  const handleActivate = async (tenantId: string) => {
    try {
      await post(`/tenants/${tenantId}/activate`)
      await fetchTenants()
    } catch (error) {
      console.error('Error activating tenant:', error)
    }
  }

  // Handle tenant deactivation
  const handleDeactivate = async (tenantId: string) => {
    try {
      await post(`/tenants/${tenantId}/deactivate`)
      await fetchTenants()
    } catch (error) {
      console.error('Error deactivating tenant:', error)
    }
  }

  // Handle view tenant
  const handleView = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setShowViewDialog(true)
  }

  // Handle edit tenant
  const handleEdit = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    setShowEditDialog(true)
  }

  // Handle successful form submission
  const handleFormSuccess = () => {
    setShowCreateDialog(false)
    setShowEditDialog(false)
    setSelectedTenant(null)
    fetchTenants()
  }

  // Get badge variant based on status
  const getStatusBadge = (estado: string) => {
    const badges = {
      'ACTIVO': { bg: '#dcfce7', color: '#166534', text: 'Activo' },
      'INACTIVO': { bg: '#f1f5f9', color: '#64748b', text: 'Inactivo' },
      'SUSPENDIDO': { bg: '#fee2e2', color: '#991b1b', text: 'Suspendido' },
      'PRUEBA': { bg: '#dbeafe', color: '#1e40af', text: 'Prueba' }
    }
    
    const badge = badges[estado as keyof typeof badges] || { bg: '#f1f5f9', color: '#64748b', text: estado }
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: badge.bg,
        color: badge.color
      }}>
        {badge.text}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Filters and Actions */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search style={{ 
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '16px',
            height: '16px',
            color: '#94a3b8'
          }} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o RUC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem 0.75rem 0.625rem 2.5rem',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '0.875rem',
              background: '#f8fafc',
              transition: 'all 0.2s'
            }}
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger style={{
            minWidth: '180px',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '0.625rem 0.75rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#1e293b',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}>
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent 
            position="popper"
            side="bottom"
            align="start"
            sideOffset={8}
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              zIndex: 9999
            }}
          >
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="ACTIVO">Activo</SelectItem>
            <SelectItem value="INACTIVO">Inactivo</SelectItem>
            <SelectItem value="SUSPENDIDO">Suspendido</SelectItem>
            <SelectItem value="PRUEBA">Prueba</SelectItem>
          </SelectContent>
        </Select>

        {/* Create Button */}
        <button
          onClick={() => {
            console.log('Botón Crear Tenant clickeado')
            setShowCreateDialog(true)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1.25rem',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
          }}
        >
          <Plus style={{ width: '16px', height: '16px' }} />
          Crear Tenant
        </button>
      </div>

      {/* Tenant Table */}
      <div style={{ 
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tenant</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contacto</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ubicación</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usuarios</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado</th>
                <th style={{ padding: '1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
                    {searchQuery || statusFilter !== 'ALL'
                      ? 'No se encontraron tenants con los filtros aplicados'
                      : 'No hay tenants aún. Crea tu primer tenant para comenzar.'}
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Building2 style={{ width: '16px', height: '16px', color: '#94a3b8' }} />
                        <div>
                          <div style={{ fontWeight: '500', fontSize: '0.875rem', color: '#1e293b' }}>{tenant.nombre}</div>
                          {tenant.ruc && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.125rem' }}>
                              RUC: {tenant.ruc}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                        <Mail style={{ width: '14px', height: '14px' }} />
                        {tenant.email}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                        <Globe style={{ width: '14px', height: '14px' }} />
                        {tenant.pais} • {tenant.moneda}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                        <Users style={{ width: '14px', height: '14px' }} />
                        {tenant.active_user_count || 0} / {tenant.user_count || 0}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>{getStatusBadge(tenant.estado)}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleView(tenant)}
                          style={{
                            padding: '0.5rem',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#64748b',
                            transition: 'all 0.15s'
                          }}
                          title="Ver detalles"
                        >
                          <Eye style={{ width: '16px', height: '16px' }} />
                        </button>
                        <button
                          onClick={() => handleEdit(tenant)}
                          style={{
                            padding: '0.5rem',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#64748b',
                            transition: 'all 0.15s'
                          }}
                          title="Editar"
                        >
                          <Edit style={{ width: '16px', height: '16px' }} />
                        </button>
                        {tenant.estado === 'ACTIVO' ? (
                          <button
                            onClick={() => handleDeactivate(tenant.id)}
                            style={{
                              padding: '0.5rem',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#ef4444',
                              transition: 'all 0.15s'
                            }}
                            title="Desactivar"
                          >
                            <XCircle style={{ width: '16px', height: '16px' }} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivate(tenant.id)}
                            style={{
                              padding: '0.5rem',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#10b981',
                              transition: 'all 0.15s'
                            }}
                            title="Activar"
                          >
                            <CheckCircle style={{ width: '16px', height: '16px' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Tenant Modal */}
      <CrearTenantModal
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={handleFormSuccess}
      />

      {/* Edit Tenant Dialog - TODO: Implementar edición */}
      {showEditDialog && selectedTenant && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            width: '90%',
            maxWidth: '600px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1f2937', marginBottom: '1rem' }}>Edición de Tenant</h2>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>La funcionalidad de edición estará disponible próximamente</p>
              <button
                onClick={() => {
                  setShowEditDialog(false)
                  setSelectedTenant(null)
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Tenant Dialog */}
      {showViewDialog && selectedTenant && (
        <>
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 50,
              animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={() => setShowViewDialog(false)}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 51,
              width: '90%',
              maxWidth: '42rem',
              maxHeight: '90vh',
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              overflow: 'hidden',
              animation: 'slideIn 0.2s ease-out'
            }}
          >
            <div style={{ 
              padding: '1.5rem',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <h2 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600',
                color: '#1e293b',
                marginBottom: '0.25rem'
              }}>
                Detalles del Tenant
              </h2>
              <p style={{ 
                fontSize: '0.875rem',
                color: '#64748b'
              }}>
                Información detallada del tenant
              </p>
            </div>
            <div style={{ 
              padding: '1.5rem',
              maxHeight: 'calc(90vh - 12rem)',
              overflowY: 'auto'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Nombre</label>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e293b' }}>{selectedTenant.nombre}</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>RUC</label>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e293b' }}>{selectedTenant.ruc || 'N/A'}</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Email</label>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e293b' }}>{selectedTenant.email}</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>País</label>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e293b' }}>{selectedTenant.pais}</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Moneda</label>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e293b' }}>{selectedTenant.moneda}</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Estado</label>
                  <div style={{ marginTop: '0.25rem' }}>{getStatusBadge(selectedTenant.estado)}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Total Usuarios</label>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e293b' }}>{selectedTenant.user_count || 0}</p>
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#64748b' }}>Usuarios Activos</label>
                  <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e293b' }}>{selectedTenant.active_user_count || 0}</p>
                </div>
              </div>
            </div>
            <div style={{ 
              padding: '1.5rem',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem'
            }}>
              <button
                onClick={() => setShowViewDialog(false)}
                style={{
                  padding: '0.625rem 1.25rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  color: '#475569',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  setShowViewDialog(false)
                  handleEdit(selectedTenant)
                }}
                style={{
                  padding: '0.625rem 1.25rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)'
                }}
              >
                Editar Tenant
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
