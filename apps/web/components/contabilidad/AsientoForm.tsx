'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60'

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

export default function AsientoForm({
  onSubmit,
  onCancel,
  cuentas,
  centrosCosto,
  loading = false,
}: AsientoFormProps) {
  const [formData, setFormData] = useState<AsientoFormData>({
    fecha: new Date().toISOString().split('T')[0],
    concepto: '',
    referencia: '',
    detalles: [
      { cuenta_id: '', debe: 0, haber: 0, concepto: '', centro_costo_id: '' },
      { cuenta_id: '', debe: 0, haber: 0, concepto: '', centro_costo_id: '' },
    ],
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const totalDebe = formData.detalles.reduce((sum, d) => sum + (d.debe || 0), 0)
  const totalHaber = formData.detalles.reduce((sum, d) => sum + (d.haber || 0), 0)
  const diferencia = Math.abs(totalDebe - totalHaber)
  const isBalanced = diferencia < 0.01

  const handleAddDetalle = () => {
    setFormData({
      ...formData,
      detalles: [...formData.detalles, { cuenta_id: '', debe: 0, haber: 0, concepto: '', centro_costo_id: '' }],
    })
  }

  const handleRemoveDetalle = (index: number) => {
    if (formData.detalles.length <= 2) {
      setErrors({ ...errors, detalles: 'Debe haber al menos 2 movimientos' })
      return
    }
    setFormData({ ...formData, detalles: formData.detalles.filter((_, i) => i !== index) })
  }

  const handleDetalleChange = (index: number, field: keyof DetalleAsiento, value: any) => {
    const newDetalles = [...formData.detalles]
    newDetalles[index] = { ...newDetalles[index], [field]: value }

    if (field === 'cuenta_id') {
      const cuenta = cuentas.find((c) => c.id === value)
      if (cuenta) {
        newDetalles[index].cuenta_codigo = cuenta.codigo
        newDetalles[index].cuenta_nombre = cuenta.nombre
      }
    }

    if (field === 'debe' && value > 0) newDetalles[index].haber = 0
    if (field === 'haber' && value > 0) newDetalles[index].debe = 0

    setFormData({ ...formData, detalles: newDetalles })
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.fecha) newErrors.fecha = 'La fecha es requerida'
    if (!formData.concepto.trim()) newErrors.concepto = 'El concepto es requerido'
    if (formData.detalles.length < 2) newErrors.detalles = 'Debe haber al menos 2 movimientos'

    formData.detalles.forEach((detalle, index) => {
      if (!detalle.cuenta_id) newErrors[`detalle_${index}_cuenta`] = 'Seleccione una cuenta'
      if (!detalle.concepto.trim()) newErrors[`detalle_${index}_concepto`] = 'El concepto es requerido'
      if (detalle.debe === 0 && detalle.haber === 0) newErrors[`detalle_${index}_monto`] = 'Debe ingresar un monto'
      if (detalle.debe > 0 && detalle.haber > 0) newErrors[`detalle_${index}_monto`] = 'Use debe o haber, no ambos'
    })

    if (!isBalanced) newErrors.balance = `El asiento no cuadra. Diferencia: S/ ${diferencia.toFixed(2)}`

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    try {
      await onSubmit(formData)
    } catch (error) {
      console.error('Error submitting form:', error)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)

  const fieldError = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs font-medium text-cyan-100">{errors[key]}</p> : null

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card className="border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Informacion general</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className={labelClass}>Fecha *</span>
              <input
                type="date"
                value={formData.fecha}
                onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                className={cn(inputClass, errors.fecha && 'border-cyan-200')}
                disabled={loading}
              />
              {fieldError('fecha')}
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Referencia</span>
              <input
                type="text"
                value={formData.referencia}
                onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
                placeholder="Ej: F001-00123"
                className={inputClass}
                disabled={loading}
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className={labelClass}>Concepto *</span>
              <textarea
                value={formData.concepto}
                onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
                placeholder="Descripcion del asiento contable"
                rows={3}
                className={cn(inputClass, 'resize-none', errors.concepto && 'border-cyan-200')}
                disabled={loading}
              />
              {fieldError('concepto')}
            </label>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="flex-row items-center justify-between border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Movimientos debe / haber</CardTitle>
            <Button
              type="button"
              onClick={handleAddDetalle}
              disabled={loading}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-5">
            {errors.detalles && (
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                {errors.detalles}
              </div>
            )}

            {formData.detalles.map((detalle, index) => (
              <div key={index} className="rounded-2xl border border-cyan-400/15 bg-slate-900/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">Movimiento {index + 1}</span>
                  {formData.detalles.length > 2 && (
                    <Button
                      type="button"
                      onClick={() => handleRemoveDetalle(index)}
                      disabled={loading}
                      variant="outline"
                      size="sm"
                      className="gap-2 border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                      Quitar
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(220px,2fr)_130px_130px_minmax(160px,1fr)]">
                  <label className="space-y-2">
                    <span className={labelClass}>Cuenta *</span>
                    <select
                      value={detalle.cuenta_id}
                      onChange={(e) => handleDetalleChange(index, 'cuenta_id', e.target.value)}
                      className={cn(inputClass, errors[`detalle_${index}_cuenta`] && 'border-cyan-200')}
                      disabled={loading}
                    >
                      <option value="">Seleccione una cuenta</option>
                      {cuentas.map((cuenta) => (
                        <option key={cuenta.id} value={cuenta.id}>
                          {cuenta.codigo} - {cuenta.nombre}
                        </option>
                      ))}
                    </select>
                    {fieldError(`detalle_${index}_cuenta`)}
                  </label>

                  <label className="space-y-2">
                    <span className={labelClass}>Debe</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={detalle.debe || ''}
                      onChange={(e) => handleDetalleChange(index, 'debe', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className={cn(inputClass, errors[`detalle_${index}_monto`] && 'border-cyan-200')}
                      disabled={loading}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className={labelClass}>Haber</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={detalle.haber || ''}
                      onChange={(e) => handleDetalleChange(index, 'haber', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className={cn(inputClass, errors[`detalle_${index}_monto`] && 'border-cyan-200')}
                      disabled={loading}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className={labelClass}>Centro</span>
                    <select
                      value={detalle.centro_costo_id || ''}
                      onChange={(e) => handleDetalleChange(index, 'centro_costo_id', e.target.value)}
                      className={inputClass}
                      disabled={loading}
                    >
                      <option value="">Sin centro</option>
                      {centrosCosto.map((centro) => (
                        <option key={centro.id} value={centro.id}>
                          {centro.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mt-3 block space-y-2">
                  <span className={labelClass}>Concepto *</span>
                  <input
                    type="text"
                    value={detalle.concepto}
                    onChange={(e) => handleDetalleChange(index, 'concepto', e.target.value)}
                    placeholder="Descripcion del movimiento"
                    className={cn(inputClass, errors[`detalle_${index}_concepto`] && 'border-cyan-200')}
                    disabled={loading}
                  />
                  {fieldError(`detalle_${index}_concepto`)}
                  {fieldError(`detalle_${index}_monto`)}
                </label>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="sticky top-4 border-cyan-400/20 bg-slate-950/75 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Resumen del asiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">Debe</div>
                <div className="mt-2 text-lg font-bold text-white">{formatCurrency(totalDebe)}</div>
              </div>
              <div className="rounded-xl border border-blue-400/15 bg-blue-400/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200/70">Haber</div>
                <div className="mt-2 text-lg font-bold text-white">{formatCurrency(totalHaber)}</div>
              </div>
            </div>

            <div className="rounded-xl border border-cyan-400/15 bg-slate-900/75 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-300">Diferencia</span>
                <span className="text-xl font-bold text-white">{formatCurrency(diferencia)}</span>
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/10 p-3">
                {isBalanced ? (
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-100" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-cyan-100" />
                )}
                <p className="text-sm font-medium text-cyan-50">
                  {isBalanced ? 'El asiento esta balanceado correctamente.' : 'Debe y haber deben cuadrar antes de guardar.'}
                </p>
              </div>
              {errors.balance && <p className="mt-3 text-sm font-semibold text-cyan-100">{errors.balance}</p>}
            </div>

            <div className="grid gap-2">
              <Button
                type="submit"
                disabled={loading || !isBalanced}
                className="w-full bg-blue-600 text-white hover:bg-blue-500 disabled:bg-slate-700"
              >
                {loading ? 'Guardando...' : 'Guardar asiento'}
              </Button>
              <Button
                type="button"
                onClick={onCancel}
                disabled={loading}
                variant="outline"
                className="w-full border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white"
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </aside>
    </form>
  )
}
