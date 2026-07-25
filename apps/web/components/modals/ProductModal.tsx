'use client'

import { useState } from 'react'
import { useApiCall } from '@/hooks/use-api'

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ProductModal({ isOpen, onClose, onSuccess }: ProductModalProps) {
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    categoria: '',
    unidadMedida: 'UND',
    precioCompra: '',
    precioVenta: '',
    stock: '',
    stockMinimo: '',
    stockMaximo: '',
    proveedor: ''
  })

  const api = useApiCall()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const productData = {
      codigo: formData.codigo,
      nombre: formData.nombre,
      descripcion: formData.descripcion,
      categoria: formData.categoria,
      unidadMedida: formData.unidadMedida,
      precioCompra: parseFloat(formData.precioCompra),
      precioVenta: parseFloat(formData.precioVenta),
      stock: parseInt(formData.stock),
      stockMinimo: parseInt(formData.stockMinimo),
      stockMaximo: parseInt(formData.stockMaximo),
      proveedor: formData.proveedor
    }

    const result = await api.post('/api/inventario/productos', productData)

    if (result) {
      onSuccess()
      onClose()
      setFormData({
        codigo: '',
        nombre: '',
        descripcion: '',
        categoria: '',
        unidadMedida: 'UND',
        precioCompra: '',
        precioVenta: '',
        stock: '',
        stockMinimo: '',
        stockMaximo: '',
        proveedor: ''
      })
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1100]">
      <div className="bg-card rounded-xl p-8 w-[90%] max-w-[600px] overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Nuevo Producto</h2>
          <button
            onClick={onClose} className="border-0 text-2xl cursor-pointer text-muted-foreground"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4 mb-6">
            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Código *
              </label>
              <input
                type="text"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Nombre *
              </label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Descripción
              </label>
              <textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                rows={3} className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Categoría *
              </label>
              <select
                name="categoria"
                value={formData.categoria}
                onChange={handleChange}
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              >
                <option value="">Seleccionar categoría</option>
                <option value="Tecnología">Tecnología</option>
                <option value="Oficina">Oficina</option>
                <option value="Accesorios">Accesorios</option>
                <option value="Materiales">Materiales</option>
                <option value="Herramientas">Herramientas</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Unidad de Medida
              </label>
              <select
                name="unidadMedida"
                value={formData.unidadMedida}
                onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-sm"
              >
                <option value="UND">Unidad</option>
                <option value="KG">Kilogramo</option>
                <option value="LT">Litro</option>
                <option value="MT">Metro</option>
                <option value="PKG">Paquete</option>
                <option value="CJA">Caja</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Precio Compra *
              </label>
              <input
                type="number"
                name="precioCompra"
                value={formData.precioCompra}
                onChange={handleChange}
                step="0.01"
                min="0"
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Precio Venta *
              </label>
              <input
                type="number"
                name="precioVenta"
                value={formData.precioVenta}
                onChange={handleChange}
                step="0.01"
                min="0"
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Stock Inicial *
              </label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                min="0"
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Stock Mínimo *
              </label>
              <input
                type="number"
                name="stockMinimo"
                value={formData.stockMinimo}
                onChange={handleChange}
                min="0"
                required className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Stock Máximo
              </label>
              <input
                type="number"
                name="stockMaximo"
                value={formData.stockMaximo}
                onChange={handleChange}
                min="0" className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold text-foreground/85">
                Proveedor
              </label>
              <input
                type="text"
                name="proveedor"
                value={formData.proveedor}
                onChange={handleChange} className="w-[100%] p-3 border rounded-[6px] text-sm"
              />
            </div>
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
              {api.loading ? 'Guardando...' : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}