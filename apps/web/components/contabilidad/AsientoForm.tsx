'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react'

interface DetalleAsiento {
  cuenta_id: string
  cuenta_codigo?: string
  cuenta_nombre?: string
  debe: number
  haber: number
  concepto: string
  centro_costo_id?: string
}

interface AsientoFormData {
  fecha: string
  concepto: string
  referencia?: string
  detalles: DetalleAsiento[]
}

interface Cuenta {
  id: string
  codigo: string
  nombre: string
}

interface CentroCosto {
  id: string
  nombre: string
}

interface AsientoFormProps {
  onSubmit: (data: AsientoFormData) => Promise<void>
  onCancel: () => void
  cuentas: Cuenta[]
  centrosCosto: CentroCosto[]
  loading?: boolean
}

export default function AsientoForm({
  onSubmit,
  onCancel,
  cuentas,
  centrosCosto,
  loading = false
}: AsientoFormProps) {
  const [formData, setFormData] = useState<AsientoFormData>({
    fecha: new Date().toISOString().split('T')[0],
    concepto: '',
    referencia: '',
    detalles: [
      { cuenta_id: '', debe: 0, haber: 0, concepto: '', centro_costo_id: '' },
      { cuenta_id: '', debe: 0, haber: 0, concepto: '', centro_costo_id: '' }
    ]
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Calcular totales
  const totalDebe = formData.detalles.reduce((sum, d) => sum + (d.debe || 0), 0)
  const totalHaber = formData.detalles.reduce((sum, d) => sum + (d.haber || 0), 0)
  const diferencia = Math.abs(totalDebe - totalHaber)
  const isBalanced = diferencia < 0.01

  const handleAddDetalle = () => {
    setFormData({
      ...formData,
      detalles: [
        ...formData.detalles,
        { cuenta_id: '', debe: 0, haber: 0, concepto: '', centro_costo_id: '' }
      ]
    })
  }

  const handleRemoveDetalle = (index: number) => {
    if (formData.detalles.length <= 2) {
      setErrors({ ...errors, detalles: 'Debe haber al menos 2 movimientos' })
      return
    }
    const newDetalles = formData.detalles.filter((_, i) => i !== index)
    setFormData({ ...formData, detalles: newDetalles })
  }

  const handleDetalleChange = (index: number, field: keyof DetalleAsiento, value: any) => {
    const newDetalles = [...formData.detalles]
    newDetalles[index] = { ...newDetalles[index], [field]: value }

    // Si se cambia la cuenta, actualizar código y nombre
    if (field === 'cuenta_id') {
      const cuenta = cuentas.find(c => c.id === value)
      if (cuenta) {
        newDetalles[index].cuenta_codigo = cuenta.codigo
        newDetalles[index].cuenta_nombre = cuenta.nombre
      }
    }

    // Si se ingresa debe, limpiar haber y viceversa
    if (field === 'debe' && value > 0) {
      newDetalles[index].haber = 0
    }
    if (field === 'haber' && value > 0) {
      newDetalles[index].debe = 0
    }

    setFormData({ ...formData, detalles: newDetalles })
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.fecha) {
      newErrors.fecha = 'La fecha es requerida'
    }

    if (!formData.concepto.trim()) {
      newErrors.concepto = 'El concepto es requerido'
    }

    if (formData.detalles.length < 2) {
      newErrors.detalles = 'Debe haber al menos 2 movimientos'
    }

    // Validar cada detalle
    formData.detalles.forEach((detalle, index) => {
      if (!detalle.cuenta_id) {
        newErrors[`detalle_${index}_cuenta`] = 'Seleccione una cuenta'
      }
      if (!detalle.concepto.trim()) {
        newErrors[`detalle_${index}_concepto`] = 'El concepto es requerido'
      }
      if (detalle.debe === 0 && detalle.haber === 0) {
        newErrors[`detalle_${index}_monto`] = 'Debe ingresar un monto en debe o haber'
      }
      if (detalle.debe > 0 && detalle.haber > 0) {
        newErrors[`detalle_${index}_monto`] = 'Solo puede ingresar debe o haber, no ambos'
      }
    })

    // Validar balance
    if (!isBalanced) {
      newErrors.balance = `El asiento no cuadra. Diferencia: S/ ${diferencia.toFixed(2)}`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      await onSubmit(formData)
    } catch (error) {
      console.error('Error submitting form:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Información General */}
      <div className="activity-card">
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--primary-800)' }}>
          Información General
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Fecha *
            </label>
            <input
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: errors.fecha ? '2px solid var(--red-500)' : '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}
              disabled={loading}
            />
            {errors.fecha && (
              <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                {errors.fecha}
              </p>
            )}
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Referencia
            </label>
            <input
              type="text"
              value={formData.referencia}
              onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
              placeholder="Ej: F001-00123"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}
              disabled={loading}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Concepto *
            </label>
            <textarea
              value={formData.concepto}
              onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
              placeholder="Descripción del asiento contable"
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: errors.concepto ? '2px solid var(--red-500)' : '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                resize: 'vertical'
              }}
              disabled={loading}
            />
            {errors.concepto && (
              <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                {errors.concepto}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Detalles del Asiento */}
      <div className="activity-card">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)' }}>
            Movimientos (Debe / Haber)
          </h3>
          <button
            type="button"
            onClick={handleAddDetalle}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'var(--primary-600)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} />
            Agregar Movimiento
          </button>
        </div>

        {errors.detalles && (
          <div style={{ 
            padding: '0.75rem', 
            background: 'var(--red-50)', 
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--red-700)' }}>
              {errors.detalles}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {formData.detalles.map((detalle, index) => (
            <div 
              key={index}
              style={{
                padding: '1rem',
                border: '1px solid var(--primary-200)',
                borderRadius: '8px',
                background: 'var(--primary-50)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-700)' }}>
                  Movimiento {index + 1}
                </span>
                {formData.detalles.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDetalle(index)}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      background: 'var(--red-100)',
                      color: 'var(--red-700)',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    marginBottom: '0.5rem',
                    color: 'var(--primary-700)'
                  }}>
                    Cuenta *
                  </label>
                  <select
                    value={detalle.cuenta_id}
                    onChange={(e) => handleDetalleChange(index, 'cuenta_id', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: errors[`detalle_${index}_cuenta`] ? '2px solid var(--red-500)' : '1px solid var(--primary-300)',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                    disabled={loading}
                  >
                    <option value="">Seleccione una cuenta</option>
                    {cuentas.map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.id}>
                        {cuenta.codigo} - {cuenta.nombre}
                      </option>
                    ))}
                  </select>
                  {errors[`detalle_${index}_cuenta`] && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                      {errors[`detalle_${index}_cuenta`]}
                    </p>
                  )}
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    marginBottom: '0.5rem',
                    color: 'var(--emerald-700)'
                  }}>
                    Debe
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={detalle.debe || ''}
                    onChange={(e) => handleDetalleChange(index, 'debe', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: errors[`detalle_${index}_monto`] ? '2px solid var(--red-500)' : '1px solid var(--primary-300)',
                      borderRadius: '8px',
                      fontSize: '0.875rem'
                    }}
                    disabled={loading}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    marginBottom: '0.5rem',
                    color: 'var(--blue-700)'
                  }}>
                    Haber
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={detalle.haber || ''}
                    onChange={(e) => handleDetalleChange(index, 'haber', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: errors[`detalle_${index}_monto`] ? '2px solid var(--red-500)' : '1px solid var(--primary-300)',
                      borderRadius: '8px',
                      fontSize: '0.875rem'
                    }}
                    disabled={loading}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    marginBottom: '0.5rem',
                    color: 'var(--primary-700)'
                  }}>
                    Centro de Costo
                  </label>
                  <select
                    value={detalle.centro_costo_id || ''}
                    onChange={(e) => handleDetalleChange(index, 'centro_costo_id', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid var(--primary-300)',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      background: 'white'
                    }}
                    disabled={loading}
                  >
                    <option value="">Sin centro</option>
                    {centrosCosto.map((centro) => (
                      <option key={centro.id} value={centro.id}>
                        {centro.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.75rem', 
                  fontWeight: '600', 
                  marginBottom: '0.5rem',
                  color: 'var(--primary-700)'
                }}>
                  Concepto *
                </label>
                <input
                  type="text"
                  value={detalle.concepto}
                  onChange={(e) => handleDetalleChange(index, 'concepto', e.target.value)}
                  placeholder="Descripción del movimiento"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: errors[`detalle_${index}_concepto`] ? '2px solid var(--red-500)' : '1px solid var(--primary-300)',
                    borderRadius: '8px',
                    fontSize: '0.875rem'
                  }}
                  disabled={loading}
                />
                {errors[`detalle_${index}_concepto`] && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.25rem' }}>
                    {errors[`detalle_${index}_concepto`]}
                  </p>
                )}
              </div>

              {errors[`detalle_${index}_monto`] && (
                <p style={{ fontSize: '0.75rem', color: 'var(--red-600)', marginTop: '0.5rem' }}>
                  {errors[`detalle_${index}_monto`]}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Resumen y Balance */}
      <div className="activity-card">
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--primary-800)' }}>
          Resumen
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Total Debe</span>
            <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--emerald-600)' }}>
              {formatCurrency(totalDebe)}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Total Haber</span>
            <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--blue-600)' }}>
              {formatCurrency(totalHaber)}
            </span>
          </div>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            paddingTop: '0.75rem',
            borderTop: '2px solid var(--primary-200)'
          }}>
            <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)' }}>Diferencia</span>
            <span style={{ 
              fontSize: '1.25rem', 
              fontWeight: '700', 
              color: isBalanced ? 'var(--emerald-600)' : 'var(--red-600)' 
            }}>
              {formatCurrency(diferencia)}
            </span>
          </div>

          {isBalanced ? (
            <div style={{ 
              background: 'var(--emerald-50)',
              borderRadius: '8px',
              padding: '0.75rem',
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckCircle size={20} style={{ color: 'var(--emerald-600)' }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--emerald-700)', fontWeight: '600' }}>
                El asiento está balanceado correctamente
              </div>
            </div>
          ) : (
            <div style={{ 
              background: 'var(--red-50)',
              borderRadius: '8px',
              padding: '0.75rem',
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <AlertCircle size={20} style={{ color: 'var(--red-600)' }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--red-700)', fontWeight: '600' }}>
                El asiento está descuadrado. Debe = Haber para poder guardar.
              </div>
            </div>
          )}

          {errors.balance && (
            <p style={{ fontSize: '0.875rem', color: 'var(--red-600)', marginTop: '0.5rem', fontWeight: '600' }}>
              {errors.balance}
            </p>
          )}
        </div>
      </div>

      {/* Botones de Acción */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'white',
            color: 'var(--primary-700)',
            border: '1px solid var(--primary-300)',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !isBalanced}
          style={{
            padding: '0.75rem 1.5rem',
            background: loading || !isBalanced ? 'var(--primary-300)' : 'var(--primary-600)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: loading || !isBalanced ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Guardando...' : 'Guardar Asiento'}
        </button>
      </div>
    </form>
  )
}
