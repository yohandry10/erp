'use client'

import { useState } from 'react'
import { useApiCall } from '@/hooks/use-api'

interface CpeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CpeModal({ isOpen, onClose, onSuccess }: CpeModalProps) {
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
      const igvItem = subtotalItem * 0.18 // 18% IGV
      const totalItem = subtotalItem + igvItem

      newItems[index] = {
        ...newItems[index],
        precioUnitario: valorUnitario * 1.18,
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
        width: '95%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>Nuevo Comprobante Electrónico</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Datos del Comprobante */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
              Datos del Comprobante
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Tipo de Comprobante *
                </label>
                <select
                  name="tipoComprobante"
                  value={formData.tipoComprobante}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="01">01 - Factura</option>
                  <option value="03">03 - Boleta de Venta</option>
                  <option value="07">07 - Nota de Crédito</option>
                  <option value="08">08 - Nota de Débito</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Serie *
                </label>
                <input
                  type="text"
                  name="serie"
                  value={formData.serie}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Fecha de Emisión *
                </label>
                <input
                  type="date"
                  name="fechaEmision"
                  value={formData.fechaEmision}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Moneda
                </label>
                <select
                  name="moneda"
                  value={formData.moneda}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="PEN">PEN - Soles</option>
                  <option value="USD">USD - Dólares</option>
                </select>
              </div>
            </div>
          </div>

          {/* Datos del Cliente */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
              Datos del Cliente
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  RUC/DNI *
                </label>
                <input
                  type="text"
                  name="clienteRuc"
                  value={formData.clienteRuc}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Razón Social/Nombre *
                </label>
                <input
                  type="text"
                  name="clienteRazonSocial"
                  value={formData.clienteRazonSocial}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                  Dirección
                </label>
                <input
                  type="text"
                  name="clienteDireccion"
                  value={formData.clienteDireccion}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#374151' }}>
                Detalle de Items
              </h3>
              <button
                type="button"
                onClick={addItem}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #3b82f6',
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                + Agregar Item
              </button>
            </div>

            {formData.items.map((item, index) => (
              <div key={index} style={{ 
                border: '1px solid #e5e7eb', 
                borderRadius: '8px', 
                padding: '1rem', 
                marginBottom: '1rem',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '600', color: '#374151' }}>
                    Item {index + 1}
                  </h4>
                  {formData.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #ef4444',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                      Código
                    </label>
                    <input
                      type="text"
                      value={item.codigo}
                      onChange={(e) => handleItemChange(index, 'codigo', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                      Descripción *
                    </label>
                    <input
                      type="text"
                      value={item.descripcion}
                      onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                      Cantidad *
                    </label>
                    <input
                      type="number"
                      value={item.cantidad}
                      onChange={(e) => handleItemChange(index, 'cantidad', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                      Valor Unitario *
                    </label>
                    <input
                      type="number"
                      value={item.valorUnitario}
                      onChange={(e) => handleItemChange(index, 'valorUnitario', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                      IGV
                    </label>
                    <input
                      type="number"
                      value={item.igv.toFixed(2)}
                      readOnly
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        backgroundColor: '#f3f4f6'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
                      Total
                    </label>
                    <input
                      type="number"
                      value={item.total.toFixed(2)}
                      readOnly
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        backgroundColor: '#f3f4f6',
                        fontWeight: '600'
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div style={{ 
            backgroundColor: '#f8fafc', 
            padding: '1.5rem', 
            borderRadius: '8px', 
            marginBottom: '2rem',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
              Resumen
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'right' }}>
              <div>
                <div style={{ fontWeight: '600', color: '#6b7280' }}>Subtotal:</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>S/ {subtotal.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontWeight: '600', color: '#6b7280' }}>IGV (18%):</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>S/ {totalIgv.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontWeight: '600', color: '#6b7280' }}>Total:</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#059669' }}>S/ {total.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Observaciones */}
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }}>
              Observaciones
            </label>
            <textarea
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.9rem',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={api.loading}
              style={{
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: api.loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: api.loading ? 'not-allowed' : 'pointer',
                fontWeight: '600'
              }}
            >
              {api.loading ? 'Creando...' : 'Crear Comprobante'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
} 