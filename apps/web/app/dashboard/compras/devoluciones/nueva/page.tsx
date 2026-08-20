'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Search, Plus, Trash2, AlertCircle, PackageX } from 'lucide-react'
import { parseDateLocal } from '@/lib/date-utils'

interface Recepcion {
  id: string
  numero: string
  orden_id: string
  fecha_recepcion: string
  estado: string
  orden?: {
    numero: string
    proveedor?: {
      id: string
      razon_social: string
      ruc: string
    }
  }
  items?: RecepcionItem[]
}

interface RecepcionItem {
  id: string
  producto_id: string
  cantidad_recibida: number
  cantidad_disponible_devolucion?: number
  cantidad_devuelta?: number
  calidad: string
  almacen_id?: string
  lote?: string
  serie?: string
  observaciones?: string
  precio_unitario?: number
  detalle?: {
    descripcion?: string
    producto_id?: string
    precio_unitario?: number
  }
  producto?: {
    id?: string
    codigo: string
    nombre: string
  }
}

interface DevolucionItem {
  recepcion_item_id?: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  almacen_id?: string
  lote?: string
  serie?: string
  motivo: string
  observaciones?: string
  producto?: {
    id?: string
    codigo: string
    nombre: string
  }
}

export default function NuevaDevolucionPage() {
  const router = useRouter()
  const { get, post } = useApi()
  const idempotencyKeyRef = useRef(
    globalThis.crypto?.randomUUID?.() ?? `supplier-return-${Date.now()}`,
  )

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecepcion, setSelectedRecepcion] = useState<Recepcion | null>(null)
  const [items, setItems] = useState<DevolucionItem[]>([])
  const [motivoGeneral, setMotivoGeneral] = useState('')
  const [observacionesGenerales, setObservacionesGenerales] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const loadRecepciones = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/api/compras/recepciones?estado=CERRADA')
      const recepcionesData = Array.isArray(response) ? response : response?.data
      if (Array.isArray(recepcionesData)) {
        setRecepciones(recepcionesData)
      }
    } catch (error) {
      console.error('Error loading recepciones:', error)
      setFormError('Error al cargar recepciones')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    if (step === 1) {
      loadRecepciones()
    }
  }, [loadRecepciones, step])

  const loadRecepcionDetalle = async (recepcionId: string) => {
    try {
      setLoading(true)
      const response = await get(`/api/compras/recepciones/${recepcionId}`)
      const recepcion = response?.data ?? response
      if (recepcion?.id) {
        setSelectedRecepcion(recepcion)

        // Una devolución debe poder iniciarse desde cualquier item recibido en una recepción cerrada.
        const itemsRecibidos = (recepcion.items || [])
          .map((item: RecepcionItem) => {
            const cantidadRecibida = Number(item.cantidad_recibida || 0)
            const cantidadDisponible = Number(item.cantidad_disponible_devolucion ?? cantidadRecibida)

            return {
              recepcion_item_id: item.id,
              producto_id: item.producto_id || item.producto?.id || item.detalle?.producto_id || '',
              descripcion: item.producto?.nombre || item.detalle?.descripcion || 'Producto recibido',
              cantidad: Math.min(cantidadRecibida, cantidadDisponible),
              precio_unitario: Number(item.detalle?.precio_unitario ?? item.precio_unitario ?? 0),
              almacen_id: item.almacen_id,
              lote: item.lote,
              serie: item.serie,
              motivo: item.calidad === 'RECHAZADO' ? 'DEFECTUOSO' : 'OBSERVADO',
              observaciones: item.observaciones || '',
              producto: item.producto
            }
          })
          .filter((item: DevolucionItem) => item.cantidad > 0)

        setItems(itemsRecibidos)
        setStep(2)
      }
    } catch (error) {
      console.error('Error loading recepcion:', error)
      setFormError('Error al cargar detalle de recepción')
    } finally {
      setLoading(false)
    }
  }

  const addItem = () => {
    setItems([...items, {
      producto_id: '',
      descripcion: '',
      cantidad: 0,
      precio_unitario: 0,
      motivo: 'DEFECTUOSO',
      observaciones: ''
    }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof DevolucionItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleSubmit = async () => {
    if (!selectedRecepcion) return

    if (items.length === 0) {
      setFormError('Debe agregar al menos un item')
      return
    }

    if (!motivoGeneral) {
      setFormError('Debe especificar el motivo general de la devolución')
      return
    }

    const invalidItems = items.filter(item => !item.producto_id || item.cantidad <= 0)
    if (invalidItems.length > 0) {
      setFormError('Todos los items deben tener producto y cantidad válida')
      return
    }

    try {
      setLoading(true)
      setFormError(null)

      const payload = {
        idempotency_key: idempotencyKeyRef.current,
        recepcion_id: selectedRecepcion.id,
        orden_id: selectedRecepcion.orden_id,
        proveedor_id: selectedRecepcion.orden?.proveedor?.id,
        motivo: motivoGeneral,
        observaciones: observacionesGenerales,
        items: items.map(item => ({
          recepcion_item_id: item.recepcion_item_id,
          producto_id: item.producto_id,
          descripcion: item.descripcion || item.producto?.nombre || 'Producto devuelto',
          cantidad: item.cantidad,
          precio_unitario: Number(item.precio_unitario || 0),
          almacen_id: item.almacen_id,
          lote: item.lote,
          serie: item.serie,
          motivo_detalle: item.observaciones || item.motivo
        }))
      }

      const response = await post('/api/compras/devoluciones', payload)
      const devolucion = response?.data ?? response

      if (devolucion?.id || response?.success) {
        router.push(`/dashboard/compras/devoluciones/${devolucion.id}`)
      } else {
        setFormError(response?.message || 'Error al crear devolución')
      }
    } catch (error) {
      console.error('Error creating devolucion:', error)
      setFormError('Error al crear devolución')
    } finally {
      setLoading(false)
    }
  }

  const filteredRecepciones = recepciones.filter(r =>
    r.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.orden?.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.orden?.proveedor?.razon_social.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return parseDateLocal(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  return (
    <div className="p-6 max-w-[1200px] my-0 mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => step === 1 ? router.back() : setStep(1)} className="flex items-center gap-2 py-2 px-4 bg-card border rounded-lg cursor-pointer text-sm font-medium mb-4"
        >
          <ArrowLeft size={18} />
          Volver
        </button>

        <h1 className="text-2xl font-bold mb-[4px]">
          Nueva Devolución a Proveedor
        </h1>
        <p className="text-[var(--text-secondary)] text-sm">
          {step === 1 ? 'Seleccione la recepción' : 'Configure los items a devolver'}
        </p>
      </div>

      {/* Progress */}
      {formError && (
        <div className="py-3 px-4 border bg-[var(--red-50)] text-[var(--red-700)] rounded-lg mb-5 text-sm font-medium">
          {formError}
        </div>
      )}

      {/* Progress */}
      <div className="flex gap-4 mb-8 items-center">
        <div className="flex-[1]">
          <div className="h-[4px] bg-[var(--primary-600)] rounded-[2px]" />
          <p className="mt-2 text-[13px] font-semibold text-[var(--primary-600)]">
            1. Seleccionar Recepción
          </p>
        </div>
        <div className="flex-[1]">
          <div className="h-[4px] rounded-[2px]" />
          <p className="mt-2 text-[13px] font-semibold">
            2. Items a Devolver
          </p>
        </div>
      </div>

      {/* Step 1: Seleccionar Recepción */}
      {step === 1 && (
        <div>
          {/* Search */}
          <div className="mb-5">
            <div className="relative">
              <Search
                size={18} className="absolute left-3 top-[50%] -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                type="text"
                placeholder="Buscar por número de recepción, orden o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)} className="w-[100%] pt-3 pr-3 pb-3 pl-10 border rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Lista de Recepciones */}
          <div className="bg-card border rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-[60px] text-center text-[var(--text-secondary)]">
                Cargando recepciones...
              </div>
            ) : filteredRecepciones.length === 0 ? (
              <div className="p-[60px] text-center">
                <PackageX size={48} className="text-[var(--text-tertiary)]" />
                <p className="text-[var(--text-secondary)]">
                  No se encontraron recepciones cerradas
                </p>
              </div>
            ) : (
              <div>
                {filteredRecepciones.map((recepcion) => (
                  <div
                    key={recepcion.id}
                    onClick={() => loadRecepcionDetalle(recepcion.id)} className="p-5 border-b cursor-pointer transition"
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-50)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div className="flex justify-between">
                      <div>
                        <div className="flex gap-3 items-center mb-2">
                          <span className="text-base font-semibold">
                            {recepcion.numero}
                          </span>
                          <span className="py-[4px] px-2 rounded-[6px] text-[11px] font-semibold bg-[var(--emerald-100)] text-[var(--emerald-800)]">
                            {recepcion.estado}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] mb-[4px]">
                          Orden: {recepcion.orden?.numero}
                        </p>
                        <p className="text-sm font-medium">
                          {recepcion.orden?.proveedor?.razon_social}
                        </p>
                        <p className="text-[13px] text-[var(--text-secondary)]">
                          RUC: {recepcion.orden?.proveedor?.ruc}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] text-[var(--text-secondary)]">
                          {formatDate(recepcion.fecha_recepcion)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Items a Devolver */}
      {step === 2 && selectedRecepcion && (
        <div>
          {/* Info de Recepción */}
          <div className="bg-[var(--blue-50)] border rounded-xl p-4 mb-6">
            <div className="flex gap-2 mb-3">
              <AlertCircle size={20} className="text-[var(--blue-600)] shrink-0 mt-[2px]" />
              <div>
                <p className="font-semibold mb-[4px] text-[var(--blue-900)]">
                  Recepción: {selectedRecepcion.numero}
                </p>
                <p className="text-sm text-[var(--blue-800)]">
                  Orden: {selectedRecepcion.orden?.numero} | Proveedor: {selectedRecepcion.orden?.proveedor?.razon_social}
                </p>
              </div>
            </div>
          </div>

          {/* Motivo General */}
          <div className="bg-card border rounded-xl p-5 mb-5">
            <h3 className="text-base font-semibold mb-4">
              Información General
            </h3>

            <div className="mb-4">
              <label className="block mb-[6px] text-[13px] font-medium">
                Motivo General *
              </label>
              <select
                value={motivoGeneral}
                onChange={(e) => setMotivoGeneral(e.target.value)} className="w-[100%] py-2.5 px-3 border rounded-lg text-sm"
              >
                <option value="">Seleccione un motivo</option>
                <option value="DEFECTUOSO">Producto Defectuoso</option>
                <option value="INCORRECTO">Producto Incorrecto</option>
                <option value="DAÑADO">Producto Dañado en Transporte</option>
                <option value="VENCIDO">Producto Vencido</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            <div>
              <label className="block mb-[6px] text-[13px] font-medium">
                Observaciones Generales
              </label>
              <textarea
                value={observacionesGenerales}
                onChange={(e) => setObservacionesGenerales(e.target.value)}
                rows={3} className="w-[100%] py-2.5 px-3 border rounded-lg text-sm"
                placeholder="Detalles adicionales sobre la devolución..."
              />
            </div>
          </div>

          {/* Items */}
          <div className="bg-card border rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold">
                Items a Devolver ({items.length})
              </h3>
              <button
                onClick={addItem} className="flex items-center gap-[6px] py-2 px-3.5 bg-[var(--primary-600)] text-white border-0 rounded-[6px] cursor-pointer text-[13px] font-medium"
              >
                <Plus size={16} />
                Agregar Item
              </button>
            </div>

            {items.length === 0 ? (
              <div className="p-10 text-center text-[var(--text-secondary)]">
                No hay items agregados. Haga clic en &quot;Agregar Item&quot; para comenzar.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((item, index) => (
                  <div
                    key={index} className="p-4 border rounded-lg bg-[var(--gray-50)]"
                  >
                    <div className="grid grid-cols-[2fr_1fr_1.5fr_0.5fr] gap-3">
                      <div>
                        <label className="block mb-[6px] text-xs font-medium">
                          Producto *
                        </label>
                        {item.producto ? (
                          <div className="py-2.5 px-3 bg-card border rounded-[6px]">
                            <div className="font-medium text-sm">{item.producto.nombre}</div>
                            <div className="text-xs text-[var(--text-secondary)]">
                              Código: {item.producto.codigo}
                            </div>
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="ID del producto"
                            value={item.producto_id}
                            onChange={(e) => updateItem(index, 'producto_id', e.target.value)} className="w-[100%] py-2.5 px-3 border rounded-[6px] text-sm"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block mb-[6px] text-xs font-medium">
                          Cantidad *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.cantidad}
                          onChange={(e) => updateItem(index, 'cantidad', parseFloat(e.target.value) || 0)} className="w-[100%] py-2.5 px-3 border rounded-[6px] text-sm"
                        />
                      </div>

                      <div>
                        <label className="block mb-[6px] text-xs font-medium">
                          Motivo *
                        </label>
                        <select
                          value={item.motivo}
                          onChange={(e) => updateItem(index, 'motivo', e.target.value)} className="w-[100%] py-2.5 px-3 border rounded-[6px] text-sm"
                        >
                          <option value="DEFECTUOSO">Defectuoso</option>
                          <option value="INCORRECTO">Incorrecto</option>
                          <option value="DAÑADO">Dañado</option>
                          <option value="VENCIDO">Vencido</option>
                          <option value="OTRO">Otro</option>
                        </select>
                      </div>

                      <div className="flex items-end h-[100%]">
                        <button
                          onClick={() => removeItem(index)} className="p-2.5 bg-[var(--red-50)] text-[var(--red-600)] border rounded-[6px] cursor-pointer"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block mb-[6px] text-xs font-medium">
                        Observaciones del Item
                      </label>
                      <input
                        type="text"
                        placeholder="Detalles específicos de este item..."
                        value={item.observaciones || ''}
                        onChange={(e) => updateItem(index, 'observaciones', e.target.value)} className="w-[100%] py-2 px-3 border rounded-[6px] text-[13px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end mt-6">
            <button
              onClick={() => setStep(1)}
              disabled={loading} className="py-3 px-6 bg-card text-[var(--text-primary)] border rounded-lg text-sm font-medium"
            >
              Volver
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || items.length === 0 || !motivoGeneral} className="py-3 px-8 bg-[var(--primary-600)] text-white border-0 rounded-lg text-sm font-semibold"
            >
              {loading ? 'Creando...' : 'Crear Devolución'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
