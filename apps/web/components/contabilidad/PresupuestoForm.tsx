'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { DollarSign, Save, X, AlertCircle } from 'lucide-react'

interface CentroCosto {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
}

interface Cuenta {
  id: string
  codigo: string
  nombre: string
  tipo_cuenta: string
}

interface Periodo {
  id: string
  anio: number
  mes: number
  estado: string
}

interface PresupuestoFormData {
  centro_costo_id: string
  cuenta_id: string
  periodo_contable_id: string
  monto_presupuestado: number
  notas?: string
  estado?: string
}

interface PresupuestoFormProps {
  presupuestoId?: string
  initialData?: any
  onSuccess?: () => void
  onCancel?: () => void
}

export default function PresupuestoForm({ 
  presupuestoId, 
  initialData, 
  onSuccess, 
  onCancel 
}: PresupuestoFormProps) {
  const router = useRouter()
  const { get, post, put } = useApi()

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form data
  const [formData, setFormData] = useState<PresupuestoFormData>({
    centro_costo_id: '',
    cuenta_id: '',
    periodo_contable_id: '',
    monto_presupuestado: 0,
    notas: '',
    estado: 'ACTIVO'
  })

  // Catalog data
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [periodos, setPeriodos] = useState<Periodo[]>([])

  // Load initial data if editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        centro_costo_id: initialData.centro_costo_id || '',
        cuenta_id: initialData.cuenta_id || '',
        periodo_contable_id: initialData.periodo_contable_id || '',
        monto_presupuestado: initialData.monto_presupuestado || 0,
        notas: initialData.notas || '',
        estado: initialData.estado || 'ACTIVO'
      })
    }
  }, [initialData])

  const loadCatalogData = useCallback(async () => {
    try {
      setLoadingData(true)
      setError(null)

      const [centrosRes, cuentasRes, periodosRes] = await Promise.all([
        get('/api/contabilidad/centros-costo'),
        get('/api/contabilidad/plan-cuentas'),
        get('/api/contabilidad/periodos')
      ])

      if (centrosRes?.success && centrosRes.data) {
        setCentrosCosto(centrosRes.data)
      }

      if (cuentasRes?.success && cuentasRes.data) {
        // Filter only expense accounts (tipo_cuenta = 'GASTO')
        const cuentasGasto = cuentasRes.data.filter((c: Cuenta) => 
          c.tipo_cuenta === 'GASTO' || c.codigo.startsWith('6') || c.codigo.startsWith('9')
        )
        setCuentas(cuentasGasto)
      }

      if (periodosRes?.success && periodosRes.data) {
        // Filter only open periods
        const periodosAbiertos = periodosRes.data.filter((p: Periodo) => 
          p.estado === 'ABIERTO'
        )
        setPeriodos(periodosAbiertos)
      }
    } catch (err: any) {
      console.error('Error loading catalog data:', err)
      setError('Error cargando datos del catálogo')
    } finally {
      setLoadingData(false)
    }
  }, [get])

  // Load catalog data
  useEffect(() => {
    loadCatalogData()
  }, [loadCatalogData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    if (!formData.centro_costo_id) {
      setError('Debe seleccionar un centro de costo')
      return
    }
    if (!formData.cuenta_id) {
      setError('Debe seleccionar una cuenta contable')
      return
    }
    if (!formData.periodo_contable_id) {
      setError('Debe seleccionar un período contable')
      return
    }
    if (formData.monto_presupuestado <= 0) {
      setError('El monto presupuestado debe ser mayor a cero')
      return
    }

    try {
      setLoading(true)
      setError(null)

      let response
      if (presupuestoId) {
        // Update existing presupuesto
        response = await put(`/api/contabilidad/presupuestos/${presupuestoId}`, {
          monto_presupuestado: formData.monto_presupuestado,
          notas: formData.notas,
          estado: formData.estado
        })
      } else {
        // Create new presupuesto
        response = await post('/api/contabilidad/presupuestos', formData)
      }

      if (response?.success) {
        if (onSuccess) {
          onSuccess()
        } else {
          router.push('/dashboard/contabilidad/presupuestos/lista')
        }
      } else {
        setError(response?.message || 'Error al guardar el presupuesto')
      }
    } catch (err: any) {
      console.error('Error saving presupuesto:', err)
      setError(err.message || 'Error al guardar el presupuesto')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      router.push('/dashboard/contabilidad/presupuestos/lista')
    }
  }

  if (loadingData) {
    return (
      <div className="loading" style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="loading-spinner"></div>
        <p>Cargando formulario...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="activity-card" style={{ padding: '2rem' }}>
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            <DollarSign size={24} />
          </div>
          <div>
            <h2 className="dashboard-title" style={{ marginBottom: '0.25rem' }}>
              {presupuestoId ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </h2>
            <p className="dashboard-subtitle">
              {presupuestoId 
                ? 'Actualice el monto presupuestado y las notas' 
                : 'Complete los datos para crear un nuevo presupuesto'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          borderRadius: '8px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
          <p style={{ margin: 0, color: '#991b1b', fontSize: '0.875rem' }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* Centro de Costo */}
        <div>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: 'var(--primary-700)'
          }}>
            Centro de Costo <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            value={formData.centro_costo_id}
            onChange={(e) => setFormData({ ...formData, centro_costo_id: e.target.value })}
            disabled={!!presupuestoId}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid var(--primary-200)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              background: presupuestoId ? '#f9fafb' : 'white',
              cursor: presupuestoId ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">Seleccione un centro de costo</option>
            {centrosCosto.map((centro) => (
              <option key={centro.id} value={centro.id}>
                {centro.codigo} - {centro.nombre}
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--primary-500)' }}>
              No se puede cambiar el centro de costo al editar
            </p>
          )}
        </div>

        {/* Cuenta Contable */}
        <div>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: 'var(--primary-700)'
          }}>
            Cuenta Contable <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            value={formData.cuenta_id}
            onChange={(e) => setFormData({ ...formData, cuenta_id: e.target.value })}
            disabled={!!presupuestoId}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid var(--primary-200)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              background: presupuestoId ? '#f9fafb' : 'white',
              cursor: presupuestoId ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">Seleccione una cuenta</option>
            {cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.codigo} - {cuenta.nombre}
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--primary-500)' }}>
              No se puede cambiar la cuenta al editar
            </p>
          )}
        </div>

        {/* Período Contable */}
        <div>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: 'var(--primary-700)'
          }}>
            Período Contable <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            value={formData.periodo_contable_id}
            onChange={(e) => setFormData({ ...formData, periodo_contable_id: e.target.value })}
            disabled={!!presupuestoId}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid var(--primary-200)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              background: presupuestoId ? '#f9fafb' : 'white',
              cursor: presupuestoId ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">Seleccione un período</option>
            {periodos.map((periodo) => (
              <option key={periodo.id} value={periodo.id}>
                {periodo.anio}-{String(periodo.mes).padStart(2, '0')} ({periodo.estado})
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--primary-500)' }}>
              No se puede cambiar el período al editar
            </p>
          )}
        </div>

        {/* Monto Presupuestado */}
        <div>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: 'var(--primary-700)'
          }}>
            Monto Presupuestado (S/) <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.monto_presupuestado}
            onChange={(e) => setFormData({ ...formData, monto_presupuestado: parseFloat(e.target.value) || 0 })}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid var(--primary-200)',
              borderRadius: '8px',
              fontSize: '0.875rem'
            }}
            placeholder="0.00"
          />
        </div>

        {/* Notas */}
        <div>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: 'var(--primary-700)'
          }}>
            Notas (Opcional)
          </label>
          <textarea
            value={formData.notas}
            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
            rows={3}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid var(--primary-200)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              resize: 'vertical'
            }}
            placeholder="Comentarios adicionales sobre el presupuesto..."
          />
        </div>

        {/* Estado (only when editing) */}
        {presupuestoId && (
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)'
            }}>
              Estado
            </label>
            <select
              value={formData.estado}
              onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-200)',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}
            >
              <option value="ACTIVO">ACTIVO</option>
              <option value="BLOQUEADO">BLOQUEADO</option>
              <option value="CERRADO">CERRADO</option>
            </select>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginTop: '2rem',
        paddingTop: '2rem',
        borderTop: '1px solid var(--primary-100)'
      }}>
        <button
          type="submit"
          disabled={loading}
          className="primary-btn"
          style={{
            flex: 1,
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          <Save size={18} />
          {loading ? 'Guardando...' : presupuestoId ? 'Actualizar Presupuesto' : 'Crear Presupuesto'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="secondary-btn"
          style={{
            flex: 1,
            padding: '0.75rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          <X size={18} />
          Cancelar
        </button>
      </div>
    </form>
  )
}
