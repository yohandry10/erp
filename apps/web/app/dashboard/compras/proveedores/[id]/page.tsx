'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Trash2, Building2, Mail, Phone, MapPin, User, CreditCard, Calendar } from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface Proveedor {
  id: string
  ruc: string
  razon_social: string
  nombre_comercial: string
  direccion: string | null
  telefono: string | null
  email: string
  contacto: string | null
  condiciones_pago: string
  limite_credito: number
  dias_credito: number
  estado: string
  activo: boolean
  created_at: string
  updated_at: string
}

export default function ProveedorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { get, del } = useApi()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadProveedor()
  }, [params.id])

  const loadProveedor = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get(`/compras/proveedores/${params.id}`)
      
      if (response.success && response.data) {
        setProveedor(response.data)
      } else {
        setError('No se pudo cargar el proveedor')
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar el proveedor')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('¿Está seguro de desactivar este proveedor?')) {
      return
    }

    try {
      const response = await del(`/compras/proveedores/${params.id}`)
      
      if (response.success) {
        alert('Proveedor desactivado exitosamente')
        router.push('/dashboard/compras/proveedores')
      } else {
        alert(`Error: ${response.error || 'No se pudo desactivar el proveedor'}`)
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Error al desactivar el proveedor'}`)
    }
  }

  const getCondicionesPagoLabel = (condiciones: string) => {
    const labels: Record<string, string> = {
      'CONTADO': 'Contado',
      'CREDITO_15': 'Crédito 15 días',
      'CREDITO_30': 'Crédito 30 días',
      'CREDITO_45': 'Crédito 45 días',
      'CREDITO_60': 'Crédito 60 días',
      'CREDITO_90': 'Crédito 90 días'
    }
    return labels[condiciones] || condiciones
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Cargando...</p>
      </div>
    )
  }

  if (error || !proveedor) {
    return (
      <div style={{ padding: '2rem' }}>
        <div className="activity-card" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p style={{ color: '#991b1b' }}>{error || 'Proveedor no encontrado'}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/compras/proveedores')}
          className="refresh-btn"
          style={{ marginTop: '1rem' }}
        >
          <ArrowLeft size={16} />
          Volver a Proveedores
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => router.push('/dashboard/compras/proveedores')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            color: '#374151',
            fontSize: '0.875rem',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          <ArrowLeft size={16} />
          Volver a Proveedores
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              {proveedor.razon_social}
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              RUC: {proveedor.ruc}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => router.push(`/dashboard/compras/proveedores/${params.id}/editar`)}
              className="refresh-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Edit size={16} />
              Editar
            </button>
            <button
              onClick={handleDelete}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={16} />
              Desactivar
            </button>
          </div>
        </div>
      </div>

      {/* Estado Badge */}
      <div style={{ marginBottom: '2rem' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: '500',
            background: proveedor.activo ? '#dcfce7' : '#fee2e2',
            color: proveedor.activo ? '#166534' : '#991b1b'
          }}
        >
          {proveedor.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Información Básica */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Building2 size={20} />
          Información Básica
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>RUC</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500', fontFamily: 'monospace' }}>{proveedor.ruc}</p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Razón Social</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.razon_social}</p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Nombre Comercial</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.nombre_comercial || '-'}</p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              <Mail size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Email
            </p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.email}</p>
          </div>
        </div>
      </div>

      {/* Información de Contacto */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <User size={20} />
          Información de Contacto
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Contacto</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.contacto || '-'}</p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              <Phone size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Teléfono
            </p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.telefono || '-'}</p>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              <MapPin size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Dirección
            </p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.direccion || '-'}</p>
          </div>
        </div>
      </div>

      {/* Condiciones Comerciales */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CreditCard size={20} />
          Condiciones Comerciales
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Condiciones de Pago</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              {getCondicionesPagoLabel(proveedor.condiciones_pago)}
            </p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Límite de Crédito</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              PEN {proveedor.limite_credito.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Días de Crédito</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.dias_credito} días</p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="activity-card">
        <h3 style={{ 
          fontSize: '1.125rem', 
          fontWeight: '600', 
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Calendar size={20} />
          Información del Sistema
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Fecha de Creación</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              {new Date(proveedor.created_at).toLocaleString('es-PE')}
            </p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Última Actualización</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>
              {new Date(proveedor.updated_at).toLocaleString('es-PE')}
            </p>
          </div>

          <div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Estado</p>
            <p style={{ fontSize: '0.875rem', fontWeight: '500' }}>{proveedor.estado}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
