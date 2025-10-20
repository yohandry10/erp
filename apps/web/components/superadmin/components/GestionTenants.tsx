'use client'

import { useMemo } from 'react'
import {
  Building2,
  Search,
  Plus,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  CircleOff,
} from 'lucide-react'

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
}: Props) {
  const empty = !loading && tenants.length === 0

  const rows = useMemo(() => tenants, [tenants])

  return (
    <section
      style={{
        background: 'linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%)',
        borderRadius: 16,
        boxShadow:
          '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.05)',
        padding: '1.5rem',
        margin: '1.5rem 0',
      }}
    >
      {/* Título */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            padding: '0.5rem',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Building2 style={{ width: 18, height: 18, color: 'white' }} />
        </div>
        <h3
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            color: '#1e293b',
            margin: 0,
          }}
        >
          Gestión de Tenants
        </h3>
      </div>

      {/* Filtros y acciones */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        {/* Buscador */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'white',
            border: '2px solid #e2e8f0',
            borderRadius: 10,
            padding: '0.5rem 0.75rem',
          }}
        >
          <Search style={{ width: 16, height: 16, color: '#64748b' }} />
          <input
            placeholder="Buscar por nombre, email o RUC..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              marginLeft: '0.5rem',
              fontSize: '0.9rem',
              background: 'transparent',
              color: '#1f2937',
            }}
          />
        </div>

        {/* Filtro de estado */}
        <select
          value={statusFilter}
          onChange={(e) =>
            onStatusChange(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')
          }
          style={{
            padding: '0.6rem 0.9rem',
            border: '2px solid #e2e8f0',
            borderRadius: 10,
            fontSize: '0.9rem',
            background: 'white',
            cursor: 'pointer',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <option value="ALL">Todos los estados</option>
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">Inactivos</option>
        </select>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onRefresh}
            type="button"
            style={{
              padding: '0.6rem 0.9rem',
              border: '2px solid #e2e8f0',
              borderRadius: 10,
              background: 'white',
              color: '#475569',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1'
              e.currentTarget.style.backgroundColor = '#f8fafc'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0'
              e.currentTarget.style.backgroundColor = 'white'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw style={{ width: 16, height: 16 }} />
              Refrescar
            </div>
          </button>

          <button
            onClick={onCreateClick}
            type="button"
            style={{
              padding: '0.6rem 1rem',
              border: 'none',
              borderRadius: 10,
              background:
                'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow =
                '0 6px 16px rgba(59,130,246,0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow =
                '0 4px 12px rgba(59,130,246,0.4)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus style={{ width: 18, height: 18 }} />
              Crear Tenant
            </div>
          </button>
        </div>
      </div>

      {/* Tabla / Lista */}
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
      >
        {/* Header tabla */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1.5fr 1.5fr 0.8fr 0.6fr',
            gap: '0.75rem',
            padding: '0.9rem 1rem',
            background: '#f8fafc',
            borderBottom: '1px solid #e5e7eb',
            fontWeight: 700,
            color: '#475569',
            fontSize: '0.85rem',
          }}
        >
          <div>Tenant</div>
          <div>Contacto</div>
          <div>Ubicación</div>
          <div>Estado</div>
          <div style={{ textAlign: 'right' }}>Acciones</div>
        </div>

        {/* Body */}
        <div style={{ position: 'relative' }}>
          {/* Loading */}
          {loading && (
            <div
              style={{
                padding: '1.25rem',
                textAlign: 'center',
                color: '#64748b',
                fontWeight: 600,
              }}
            >
              Cargando...
            </div>
          )}

          {/* Error */}
          {!loading && !!error && (
            <div
              style={{
                padding: '1.25rem',
                textAlign: 'center',
                color: '#dc2626',
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          )}

          {/* Vacío */}
          {empty && !error && (
            <div
              style={{
                padding: '1.25rem',
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              No hay registros que coincidan con la búsqueda/estado.
            </div>
          )}

          {/* Filas */}
          {!loading &&
            !error &&
            rows.map((t, idx) => {
              const activo = t.estado ? t.estado === 'ACTIVO' : (t.is_active ?? true)
              return (
                <div
                  key={(t.id ?? t.ruc) + idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 1.5fr 0.8fr 0.6fr',
                    gap: '0.75rem',
                    padding: '1rem',
                    borderBottom: '1px solid #f1f5f9',
                    alignItems: 'center',
                  }}
                >
                  {/* Tenant */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      <Building2 style={{ width: 18, height: 18, color: '#2563eb' }} />
                    </div>
                    <div style={{ lineHeight: 1.25 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {t.razon_social}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        RUC: {t.ruc}
                      </div>
                    </div>
                  </div>

                  {/* Contacto */}
                  <div style={{ lineHeight: 1.35 }}>
                    {t.email && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: '#334155',
                        }}
                      >
                        <Mail style={{ width: 14, height: 14, color: '#64748b' }} />
                        <span style={{ fontSize: '0.85rem' }}>{t.email}</span>
                      </div>
                    )}
                    {t.telefono && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: '#334155',
                        }}
                      >
                        <Phone style={{ width: 14, height: 14, color: '#64748b' }} />
                        <span style={{ fontSize: '0.85rem' }}>{t.telefono}</span>
                      </div>
                    )}
                  </div>

                  {/* Ubicación */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#334155',
                    }}
                  >
                    <MapPin style={{ width: 14, height: 14, color: '#64748b' }} />
                    <span style={{ fontSize: '0.85rem' }}>{t.direccion || '—'}</span>
                  </div>

                  {/* Estado */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      color: activo ? '#065f46' : '#991b1b',
                      background: activo ? '#d1fae5' : '#fee2e2',
                      border: `1px solid ${activo ? '#a7f3d0' : '#fecaca'}`,
                      borderRadius: 999,
                      padding: '0.25rem 0.6rem',
                      justifySelf: 'start',
                    }}
                  >
                    {activo ? (
                      <CheckCircle2 style={{ width: 16, height: 16 }} />
                    ) : (
                      <CircleOff style={{ width: 16, height: 16 }} />
                    )}
                    {activo ? 'Activo' : 'Inactivo'}
                  </div>

                  {/* Acciones */}
                  <div style={{ justifySelf: 'end', display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onViewTenant?.(t)}
                      title="Ver detalles"
                      style={{
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        borderRadius: 8,
                        padding: 6,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#eff6ff'
                        e.currentTarget.style.borderColor = '#3b82f6'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white'
                        e.currentTarget.style.borderColor = '#e5e7eb'
                      }}
                    >
                      👁️
                    </button>
                    <button
                      onClick={() => onEditTenant?.(t)}
                      title="Editar"
                      style={{
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        borderRadius: 8,
                        padding: 6,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#fef3c7'
                        e.currentTarget.style.borderColor = '#f59e0b'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white'
                        e.currentTarget.style.borderColor = '#e5e7eb'
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => onDeleteTenant?.(t)}
                      title="Eliminar"
                      style={{
                        border: '1px solid #e5e7eb',
                        background: 'white',
                        borderRadius: 8,
                        padding: 6,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#fee2e2'
                        e.currentTarget.style.borderColor = '#ef4444'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white'
                        e.currentTarget.style.borderColor = '#e5e7eb'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </section>
  )
}
