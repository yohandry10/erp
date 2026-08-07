'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { DollarSign, Save, X, AlertCircle } from 'lucide-react'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { useCountryContext } from '@/hooks/use-country-context'

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
  const { symbol } = useLocalizedMoney()
  const country = useCountryContext()
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
      <div className="flex min-h-48 items-center justify-center p-12 text-center">
        <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
        <p>Cargando formulario...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl p-8">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white">
            <DollarSign size={24} />
          </div>
          <div>
            <h2 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground mb-1">
              {presupuestoId ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {presupuestoId
                ? 'Actualice el monto presupuestado y las notas'
                : 'Complete los datos para crear un nuevo presupuesto'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-6 rounded-lg bg-[#fef2f2] border flex items-center gap-3">
          <AlertCircle size={20} className="text-destructive shrink-0" />
          <p className="m-0 text-destructive text-[0.875rem]">{error}</p>
        </div>
      )}

      <div className="grid gap-6">
        {/* Centro de Costo */}
        <div>
          <label htmlFor="presupuesto-form-centro-costo-id" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Centro de Costo <span className="text-destructive">*</span>
          </label>
          <select id="presupuesto-form-centro-costo-id"
            value={formData.centro_costo_id}
            onChange={(e) => setFormData({ ...formData, centro_costo_id: e.target.value })}
            disabled={!!presupuestoId}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
          >
            <option value="">Seleccione un centro de costo</option>
            {centrosCosto.map((centro) => (
              <option key={centro.id} value={centro.id}>
                {centro.codigo} - {centro.nombre}
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p className="mt-2 text-xs text-[var(--primary-500)]">
              No se puede cambiar el centro de costo al editar
            </p>
          )}
        </div>

        {/* Cuenta Contable */}
        <div>
          <label htmlFor="presupuesto-form-cuenta-id" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Cuenta Contable <span className="text-destructive">*</span>
          </label>
          <select id="presupuesto-form-cuenta-id"
            value={formData.cuenta_id}
            onChange={(e) => setFormData({ ...formData, cuenta_id: e.target.value })}
            disabled={!!presupuestoId}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
          >
            <option value="">Seleccione una cuenta</option>
            {cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.codigo} - {cuenta.nombre}
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p className="mt-2 text-xs text-[var(--primary-500)]">
              No se puede cambiar la cuenta al editar
            </p>
          )}
        </div>

        {/* Período Contable */}
        <div>
          <label htmlFor="presupuesto-form-periodo-contable-id" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Período Contable <span className="text-destructive">*</span>
          </label>
          <select id="presupuesto-form-periodo-contable-id"
            value={formData.periodo_contable_id}
            onChange={(e) => setFormData({ ...formData, periodo_contable_id: e.target.value })}
            disabled={!!presupuestoId}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
          >
            <option value="">Seleccione un período</option>
            {periodos.map((periodo) => (
              <option key={periodo.id} value={periodo.id}>
                {periodo.anio}-{String(periodo.mes).padStart(2, '0')} ({periodo.estado})
              </option>
            ))}
          </select>
          {presupuestoId && (
            <p className="mt-2 text-xs text-[var(--primary-500)]">
              No se puede cambiar el período al editar
            </p>
          )}
        </div>

        {/* Monto Presupuestado */}
        <div>
          <label htmlFor="presupuesto-form-monto-presupuestado" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Monto Presupuestado ({country.moneda || symbol}) <span className="text-destructive">*</span>
          </label>
          <input id="presupuesto-form-monto-presupuestado"
            type="number"
            step="0.01"
            min="0"
            value={formData.monto_presupuestado}
            onChange={(e) => setFormData({ ...formData, monto_presupuestado: parseFloat(e.target.value) || 0 })}
            required className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
            placeholder="0.00"
          />
        </div>

        {/* Notas */}
        <div>
          <label htmlFor="presupuesto-form-notas" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
            Notas (Opcional)
          </label>
          <textarea id="presupuesto-form-notas"
            value={formData.notas}
            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
            rows={3} className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
            placeholder="Comentarios adicionales sobre el presupuesto..."
          />
        </div>

        {/* Estado (only when editing) */}
        {presupuestoId && (
          <div>
            <label htmlFor="presupuesto-form-estado" className="block mb-2 text-[0.875rem] font-semibold text-[var(--primary-700)]">
              Estado
            </label>
            <select id="presupuesto-form-estado"
              value={formData.estado}
              onChange={(e) => setFormData({ ...formData, estado: e.target.value })} className="w-[100%] p-3 border rounded-lg text-[0.875rem]"
            >
              <option value="ACTIVO">ACTIVO</option>
              <option value="BLOQUEADO">BLOQUEADO</option>
              <option value="CERRADO">CERRADO</option>
            </select>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mt-8 pt-8 border-t">
        <button
          type="submit"
          disabled={loading}
          className="primary-btn flex-[1] py-3 px-6 flex items-center justify-center gap-2"
        >
          <Save size={18} />
          {loading ? 'Guardando...' : presupuestoId ? 'Actualizar Presupuesto' : 'Crear Presupuesto'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={loading}
          className="secondary-btn flex-[1] py-3 px-6 flex items-center justify-center gap-2"
        >
          <X size={18} />
          Cancelar
        </button>
      </div>
    </form>
  )
}
