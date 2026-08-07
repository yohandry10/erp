'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { useTaxConfig } from '@/hooks/useTaxConfig'
import { toast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'

interface CotizacionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface Cliente {
  id: string
  razon_social?: string
  nombre_comercial?: string
  numero_documento: string
  tipo_documento?: string
  email?: string
  telefono?: string
}

interface DetalleCotizacion {
  codigo: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  total: number
}

export default function CotizacionModal({ isOpen, onClose, onSuccess }: CotizacionModalProps) {
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const defaultCurrency = country.moneda || (isArgentina ? 'ARS' : country.paisCodigo === 'CO' ? 'COP' : 'PEN')
  const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$')
  const { tasaIgv, nombreImpuesto } = useTaxConfig()
  console.log('🎯 CotizacionModal recibido props:', { isOpen })
  console.log('🎯 Modal renderizando con isOpen:', isOpen)
  console.log('🎯 Elemento Dialog debe estar visible:', isOpen ? 'SÍ' : 'NO')

  const { get, post } = useApi()
  const [loading, setLoading] = useState(false)
  const [clientes, setClientes] = useState<Cliente[]>([])

  const [formData, setFormData] = useState({
    cliente_id: '',
    fecha_cotizacion: new Date().toISOString().split('T')[0],
    fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    vendedor: '',
    moneda: defaultCurrency,
    subtotal: 0,
    igv: 0,
    total: 0,
    estado: 'BORRADOR',
    probabilidad: 50,
    observaciones: ''
  })

  const [detalles, setDetalles] = useState<DetalleCotizacion[]>([
    {
      codigo: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      descuento: 0,
      total: 0
    }
  ])

  const loadClientes = useCallback(async () => {
    try {
      const response = await get('/api/pos/clientes')
      if (response && response.success && Array.isArray(response.data)) {
        setClientes(response.data)
        console.log('✅ Clientes cargados desde API:', response.data)
      } else {
        throw new Error('No se pudieron cargar clientes desde API')
      }
    } catch (error) {
      console.error('⚠️ Error cargando clientes desde API:', error)
      setClientes([])
    }
  }, [get])

  useEffect(() => {
    console.log('🔥 [COTIZACION MODAL] useEffect triggered - isOpen:', isOpen)
    if (isOpen) {
      setFormData(prev => ({ ...prev, moneda: defaultCurrency }))
      loadClientes()
    }
  }, [defaultCurrency, isOpen, loadClientes])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleDetalleChange = (index: number, field: string, value: any) => {
    const nuevosDetalles = [...detalles]
    nuevosDetalles[index] = { ...nuevosDetalles[index], [field]: value }

    if (field === 'cantidad' || field === 'precio_unitario' || field === 'descuento') {
      const detalle = nuevosDetalles[index]
      detalle.total = (detalle.cantidad * detalle.precio_unitario) - detalle.descuento
    }

    setDetalles(nuevosDetalles)
    calcularTotales(nuevosDetalles)
  }

  const calcularTotales = (detallesActualizados: DetalleCotizacion[]) => {
    const subtotal = detallesActualizados.reduce((sum, detalle) => sum + detalle.total, 0)
    const igv = subtotal * tasaIgv
    const total = subtotal + igv

    setFormData(prev => ({
      ...prev,
      subtotal: subtotal,
      igv: igv,
      total: total
    }))
  }

  const agregarDetalle = () => {
    setDetalles([...detalles, {
      codigo: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      descuento: 0,
      total: 0
    }])
  }

  const eliminarDetalle = (index: number) => {
    if (detalles.length > 1) {
      const nuevosDetalles = detalles.filter((_, i) => i !== index)
      setDetalles(nuevosDetalles)
      calcularTotales(nuevosDetalles)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.cliente_id) {
        toast({
          title: "Error",
          description: "Selecciona un cliente",
          variant: "destructive",
        })
        return
      }

      if (!formData.vendedor.trim()) {
        toast({
          title: "Error",
          description: "Ingresa el nombre del vendedor",
          variant: "destructive",
        })
        return
      }

      if (detalles.some(d => !d.descripcion.trim() || d.cantidad <= 0 || d.precio_unitario <= 0)) {
        toast({
          title: "Error",
          description: "Completa todos los detalles correctamente",
          variant: "destructive",
        })
        return
      }

      const payload = {
        ...formData,
        items: detalles
      }

      const response = await post('/api/cotizaciones/crear', payload)

      if (response && response.success) {
        toast({
          title: "¡Éxito!",
          description: `Cotización ${response.data.numero} creada exitosamente`,
          variant: "default",
        })
        onSuccess()
        handleClose()
      } else {
        throw new Error(response?.error || 'Error desconocido')
      }
    } catch (error: any) {
      console.error('❌ Error creando cotización:', error)
      toast({
        title: "Error",
        description: error?.message || "Error al crear la cotización",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFormData({
      cliente_id: '',
      fecha_cotizacion: new Date().toISOString().split('T')[0],
      fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      vendedor: '',
      moneda: defaultCurrency,
      subtotal: 0,
      igv: 0,
      total: 0,
      estado: 'BORRADOR',
      probabilidad: 50,
      observaciones: ''
    })
    setDetalles([{
      codigo: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      descuento: 0,
      total: 0
    }])
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] z-[999999] flex items-center justify-center p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="bg-card rounded-lg w-[90%] max-w-[1200px] overflow-auto shadow relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-blue-600 text-white p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold m-0">Nueva Cotización</h2>
            <button
              onClick={handleClose} className="border-0 text-white text-2xl font-bold cursor-pointer p-0 w-[30px] h-[30px] flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {/* Datos de la Cotización */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="text-[18px] font-semibold text-foreground/85 mb-4 mt-0">
                Datos de la Cotización
              </h3>
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
                <div>
                  <label htmlFor="cotizacion-modal-cliente-id" className="block text-sm font-medium text-foreground/85 mb-[4px]">
                    Cliente *
                  </label>
                  <select id="cotizacion-modal-cliente-id"
                    value={formData.cliente_id}
                    onChange={(e) => handleInputChange('cliente_id', e.target.value)} className="w-[100%] p-2 border rounded-[4px] text-sm"
                    required
                  >
                    <option value="">Seleccionar cliente</option>
                    {clientes.map(cliente => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.razon_social || cliente.nombre_comercial || 'Cliente'} - {cliente.numero_documento}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cotizacion-modal-vendedor" className="block text-sm font-medium text-foreground/85 mb-[4px]">
                    Vendedor *
                  </label>
                  <input id="cotizacion-modal-vendedor"
                    type="text"
                    value={formData.vendedor}
                    onChange={(e) => handleInputChange('vendedor', e.target.value)} className="w-[100%] p-2 border rounded-[4px] text-sm"
                    placeholder="Nombre del vendedor"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="cotizacion-modal-moneda" className="block text-sm font-medium text-foreground/85 mb-[4px]">
                    Moneda
                  </label>
                  <select id="cotizacion-modal-moneda"
                    value={formData.moneda}
                    onChange={(e) => handleInputChange('moneda', e.target.value)} className="w-[100%] p-2 border rounded-[4px] text-sm"
                  >
                    {isArgentina ? (
                      <option value="ARS">ARS - Pesos argentinos</option>
                    ) : (
                      <option value="PEN">PEN - Soles</option>
                    )}
                    <option value="USD">USD - Dólares</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="cotizacion-modal-fecha-cotizacion" className="block text-sm font-medium text-foreground/85 mb-[4px]">
                    Fecha Cotización
                  </label>
                  <input id="cotizacion-modal-fecha-cotizacion"
                    type="date"
                    value={formData.fecha_cotizacion}
                    onChange={(e) => handleInputChange('fecha_cotizacion', e.target.value)} className="w-[100%] p-2 border rounded-[4px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="cotizacion-modal-fecha-vencimiento" className="block text-sm font-medium text-foreground/85 mb-[4px]">
                    Fecha Vencimiento
                  </label>
                  <input id="cotizacion-modal-fecha-vencimiento"
                    type="date"
                    value={formData.fecha_vencimiento}
                    onChange={(e) => handleInputChange('fecha_vencimiento', e.target.value)} className="w-[100%] p-2 border rounded-[4px] text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="cotizacion-modal-probabilidad" className="block text-sm font-medium text-foreground/85 mb-[4px]">
                    Probabilidad (%)
                  </label>
                  <input id="cotizacion-modal-probabilidad"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.probabilidad}
                    onChange={(e) => handleInputChange('probabilidad', parseInt(e.target.value))} className="w-[100%] p-2 border rounded-[4px] text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Detalle de Items */}
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[18px] font-semibold text-foreground/85 m-0">
                  Detalle de Items
                </h3>
                <button
                  type="button"
                  onClick={agregarDetalle} className="bg-[#10b981] text-white py-[4px] px-3 rounded-[4px] text-sm border-0 cursor-pointer"
                >
                  + Agregar Item
                </button>
              </div>

              <div className="bg-card rounded-[4px] border">
                <div className="grid grid-cols-[1fr_2fr_80px_100px_80px_80px_40px] gap-2 p-2 bg-muted text-sm font-medium text-foreground/85 border-b">
                  <div>Código</div>
                  <div>Descripción *</div>
                  <div>Cantidad *</div>
                  <div>Precio Unit. *</div>
                  <div>{nombreImpuesto}</div>
                  <div>Total</div>
                  <div></div>
                </div>

                {detalles.map((detalle, index) => (
                  <div key={index} className="grid grid-cols-[1fr_2fr_80px_100px_80px_80px_40px] gap-2 p-2 items-center">
                    <input
                      type="text"
                      value={detalle.codigo}
                      onChange={(e) => handleDetalleChange(index, 'codigo', e.target.value)} className="w-[100%] p-[4px] border rounded-[2px] text-xs"
                      placeholder="Código"
                    />
                    <input
                      type="text"
                      value={detalle.descripcion}
                      onChange={(e) => handleDetalleChange(index, 'descripcion', e.target.value)} className="w-[100%] p-[4px] border rounded-[2px] text-xs"
                      placeholder="Descripción del producto/servicio"
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      value={detalle.cantidad}
                      onChange={(e) => handleDetalleChange(index, 'cantidad', parseFloat(e.target.value))} className="w-[100%] p-[4px] border rounded-[2px] text-xs text-center"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={detalle.precio_unitario}
                      onChange={(e) => handleDetalleChange(index, 'precio_unitario', parseFloat(e.target.value))} className="w-[100%] p-[4px] border rounded-[2px] text-xs text-right"
                      required
                    />
                    <div className="text-center text-xs">{Number((tasaIgv * 100).toFixed(2))}%</div>
                    <div className="text-right text-xs font-medium">
                      {detalle.total.toFixed(2)}
                    </div>
                    <div className="text-center">
                      {detalles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarDetalle(index)} className="border-0 text-red-500 text-base font-bold cursor-pointer p-0 w-5 h-5 flex items-center justify-center"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen */}
            <div className="bg-card p-4 rounded-lg border">
              <div className="grid grid-cols-[1fr_300px] gap-6">
                <div>
                  <label htmlFor="cotizacion-modal-observaciones" className="block text-sm font-medium text-foreground/85 mb-2">
                    Observaciones
                  </label>
                  <textarea id="cotizacion-modal-observaciones"
                    value={formData.observaciones}
                    onChange={(e) => handleInputChange('observaciones', e.target.value)}
                    rows={4} className="w-[100%] p-2 border rounded-[4px] text-sm"
                    placeholder="Observaciones adicionales..."
                  />
                </div>

                <div className="bg-muted p-4 rounded-[4px]">
                  <h4 className="text-sm font-medium text-foreground/85 mb-3 mt-0">
                    Resumen
                  </h4>
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">{currencySymbol} {formData.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{nombreImpuesto} ({Number((tasaIgv * 100).toFixed(2))}%):</span>
                      <span className="font-medium">{currencySymbol} {formData.igv.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-semibold text-foreground/85">Total:</span>
                      <span className="font-bold text-[18px] text-emerald-400">
                        {currencySymbol} {formData.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="bg-muted py-4 px-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose} className="py-2 px-4 border bg-card text-foreground/85 rounded-[4px] text-sm cursor-pointer"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading} className="py-2 px-6 bg-blue-600 text-white border-0 rounded-[4px] text-sm font-medium"
              >
                {loading ? 'Creando...' : 'Crear Cotización'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
