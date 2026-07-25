'use client'

import { useState } from 'react'
import { useApiCall } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'

interface CpeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CpeModal({ isOpen, onClose, onSuccess }: CpeModalProps) {
  const { tasaIgv } = useTaxConfig()
  const taxPercent = Math.round(tasaIgv * 10000) / 100
  const [formData, setFormData] = useState({
    tipoComprobante: '01', // Factura por defecto
    serie: 'F001',
    clienteRuc: '',
    clienteRazonSocial: '',
    clienteDireccion: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    fechaVencimiento: '',
    moneda: 'PEN',
    tipoOperacion: '0101',
    observaciones: '',
    items: [
      {
        codigo: '',
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'NIU',
        valorUnitario: 0,
        precioUnitario: 0,
        descuento: 0,
        igv: 0,
        total: 0
      }
    ]
  })

  const api = useApiCall()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Calcular totales
    const subtotal = formData.items.reduce((sum, item) => sum + (item.valorUnitario * item.cantidad), 0)
    const totalIgv = formData.items.reduce((sum, item) => sum + item.igv, 0)
    const total = subtotal + totalIgv

    const cpeData = {
      ...formData,
      subtotal,
      totalIgv,
      total
    }

    const result = await api.post('/api/cpe/comprobantes', cpeData)

    if (result) {
      onSuccess()
      onClose()
      // Reset form
      setFormData({
        tipoComprobante: '01',
        serie: 'F001',
        clienteRuc: '',
        clienteRazonSocial: '',
        clienteDireccion: '',
        fechaEmision: new Date().toISOString().split('T')[0],
        fechaVencimiento: '',
        moneda: 'PEN',
        tipoOperacion: '0101',
        observaciones: '',
        items: [
          {
            codigo: '',
            descripcion: '',
            cantidad: 1,
            unidadMedida: 'NIU',
            valorUnitario: 0,
            precioUnitario: 0,
            descuento: 0,
            igv: 0,
            total: 0
          }
        ]
      })
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))

    // Auto-update serie based on tipo comprobante
    if (name === 'tipoComprobante') {
      let newSerie = 'F001'
      switch (value) {
        case '01': newSerie = 'F001'; break
        case '03': newSerie = 'B001'; break
        case '07': newSerie = 'NC01'; break
        case '08': newSerie = 'ND01'; break
      }
      setFormData(prev => ({ ...prev, serie: newSerie }))
    }
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }

    // Recalcular totales del item
    if (field === 'cantidad' || field === 'valorUnitario') {
      const cantidad = field === 'cantidad' ? value : newItems[index].cantidad
      const valorUnitario = field === 'valorUnitario' ? value : newItems[index].valorUnitario
      const subtotalItem = cantidad * valorUnitario
      const igvItem = subtotalItem * tasaIgv
      const totalItem = subtotalItem + igvItem

      newItems[index] = {
        ...newItems[index],
        precioUnitario: valorUnitario * (1 + tasaIgv),
        igv: igvItem,
        total: totalItem
      }
    }

    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        codigo: '',
        descripcion: '',
        cantidad: 1,
        unidadMedida: 'NIU',
        valorUnitario: 0,
        precioUnitario: 0,
        descuento: 0,
        igv: 0,
        total: 0
      }]
    }))
  }

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      }))
    }
  }

  if (!isOpen) return null

  const subtotal = formData.items.reduce((sum, item) => sum + (item.valorUnitario * item.cantidad), 0)
  const totalIgv = formData.items.reduce((sum, item) => sum + item.igv, 0)
  const total = subtotal + totalIgv

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1100]">
      <div className="bg-card rounded-xl p-8 w-[95%] max-w-[900px] overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Nuevo Comprobante Electrónico</h2>
          <button
            onClick={onClose} className="border-0 text-2xl cursor-pointer text-muted-foreground"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Datos del Comprobante */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 text-foreground/85">
              Datos del Comprobante
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
              <div>
                <label className="block mb-2 font-semibold text-foreground/85">
                  Tipo de Comprobante *
                </label>
                <select
                  name="tipoComprobante"
                  value={formData.tipoComprobante}
                  onChange={handleChange}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                >
                  <option value="01">01 - Factura</option>
                  <option value="03">03 - Boleta de Venta</option>
                  <option value="07">07 - Nota de Crédito</option>
                  <option value="08">08 - Nota de Débito</option>
                </select>
              </div>

              <div>
                <label className="block mb-2 font-semibold text-foreground/85">
                  Serie *
                </label>
                <input
                  type="text"
                  name="serie"
                  value={formData.serie}
                  onChange={handleChange}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-foreground/85">
                  Fecha de Emisión *
                </label>
                <input
                  type="date"
                  name="fechaEmision"
                  value={formData.fechaEmision}
                  onChange={handleChange}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-foreground/85">
                  Moneda
                </label>
                <select
                  name="moneda"
                  value={formData.moneda}
                  onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-sm"
                >
                  <option value="PEN">PEN - Soles</option>
                  <option value="USD">USD - Dólares</option>
                </select>
              </div>
            </div>
          </div>

          {/* Datos del Cliente */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 text-foreground/85">
              Datos del Cliente
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
              <div>
                <label className="block mb-2 font-semibold text-foreground/85">
                  RUC/DNI *
                </label>
                <input
                  type="text"
                  name="clienteRuc"
                  value={formData.clienteRuc}
                  onChange={handleChange}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-foreground/85">
                  Razón Social/Nombre *
                </label>
                <input
                  type="text"
                  name="clienteRazonSocial"
                  value={formData.clienteRazonSocial}
                  onChange={handleChange}
                  required className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-foreground/85">
                  Dirección
                </label>
                <input
                  type="text"
                  name="clienteDireccion"
                  value={formData.clienteDireccion}
                  onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-sm"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-foreground/85">
                Detalle de Items
              </h3>
              <button
                type="button"
                onClick={addItem} className="py-2 px-4 rounded-[6px] border bg-[rgba(59,_130,_246,_0.1)] text-blue-500 cursor-pointer text-sm"
              >
                + Agregar Item
              </button>
            </div>

            {formData.items.map((item, index) => (
              <div key={index} className="border rounded-lg p-4 mb-4 bg-muted">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-base font-semibold text-foreground/85">
                    Item {index + 1}
                  </h4>
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)} className="py-1 px-2 rounded-[4px] border bg-destructive/10 text-red-500 cursor-pointer text-[0.8rem]"
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4">
                  <div>
                    <label className="block mb-2 font-semibold text-foreground/85">
                      Código
                    </label>
                    <input
                      type="text"
                      value={item.codigo}
                      onChange={(e) => handleItemChange(index, 'codigo', e.target.value)} className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold text-foreground/85">
                      Descripción *
                    </label>
                    <input
                      type="text"
                      value={item.descripcion}
                      onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                      required className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold text-foreground/85">
                      Cantidad *
                    </label>
                    <input
                      type="number"
                      value={item.cantidad}
                      onChange={(e) => handleItemChange(index, 'cantidad', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      required className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold text-foreground/85">
                      Valor Unitario *
                    </label>
                    <input
                      type="number"
                      value={item.valorUnitario}
                      onChange={(e) => handleItemChange(index, 'valorUnitario', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      required className="w-[100%] p-2 border rounded-[4px] text-sm"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold text-foreground/85">
                      IGV
                    </label>
                    <input
                      type="number"
                      value={item.igv.toFixed(2)}
                      readOnly className="w-[100%] p-2 border rounded-[4px] text-sm bg-muted"
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold text-foreground/85">
                      Total
                    </label>
                    <input
                      type="number"
                      value={item.total.toFixed(2)}
                      readOnly className="w-[100%] p-2 border rounded-[4px] text-sm bg-muted font-semibold"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="bg-muted/30 p-6 rounded-lg mb-8 border">
            <h3 className="text-xl font-semibold mb-4 text-foreground/85">
              Resumen
            </h3>
            <div className="grid grid-cols-[repeat(3,_1fr)] gap-4 text-right">
              <div>
                <div className="font-semibold text-muted-foreground">Subtotal:</div>
                <div className="text-base font-semibold">S/ {subtotal.toFixed(2)}</div>
              </div>
              <div>
                <div className="font-semibold text-muted-foreground">IGV ({taxPercent}%):</div>
                <div className="text-base font-semibold">S/ {totalIgv.toFixed(2)}</div>
              </div>
              <div>
                <div className="font-semibold text-muted-foreground">Total:</div>
                <div className="text-[1.3rem] font-bold text-emerald-400">S/ {total.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div className="mb-8">
            <label className="block mb-2 font-semibold text-foreground/85">
              Observaciones
            </label>
            <textarea
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              rows={3} className="w-[100%] p-3 border rounded-[6px] text-sm"
            />
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-card text-foreground/85 cursor-pointer font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={api.loading} className="py-3 px-6 border-0 rounded-[6px] text-white font-semibold"
            >
              {api.loading ? 'Creando...' : 'Crear Comprobante'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
