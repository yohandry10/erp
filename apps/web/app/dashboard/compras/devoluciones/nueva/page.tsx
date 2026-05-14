'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Search, Plus, Trash2, AlertCircle, PackageX } from 'lucide-react'

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
  calidad: string
  almacen_id?: string
  lote?: string
  serie?: string
  observaciones?: string
  precio_unitario?: number
  detalle?: {
    descripcion?: string
    precio_unitario?: number
  }
  producto?: {
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
    codigo: string
    nombre: string
  }
}

export default function NuevaDevolucionPage() {
  const router = useRouter()
  const { get, post } = useApi()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRecepcion, setSelectedRecepcion] = useState<Recepcion | null>(null)
  const [items, setItems] = useState<DevolucionItem[]>([])
  const [motivoGeneral, setMotivoGeneral] = useState('')
  const [observacionesGenerales, setObservacionesGenerales] = useState('')

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
      alert('Error al cargar recepciones')
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
          .filter((item: RecepcionItem) => Number(item.cantidad_recibida || 0) > 0)
          .map((item: RecepcionItem) => ({
            recepcion_item_id: item.id,
            producto_id: item.producto_id,
            descripcion: item.producto?.nombre || item.detalle?.descripcion || 'Producto recibido',
            cantidad: item.cantidad_recibida,
            precio_unitario: Number(item.detalle?.precio_unitario ?? item.precio_unitario ?? 0),
            almacen_id: item.almacen_id,
            lote: item.lote,
            serie: item.serie,
            motivo: item.calidad === 'RECHAZADO' ? 'DEFECTUOSO' : 'OBSERVADO',
            observaciones: item.observaciones || '',
            producto: item.producto
          }))

        setItems(itemsRecibidos)
        setStep(2)
      }
    } catch (error) {
      console.error('Error loading recepcion:', error)
      alert('Error al cargar detalle de recepción')
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
      alert('Debe agregar al menos un item')
      return
    }

    if (!motivoGeneral) {
      alert('Debe especificar el motivo general de la devolución')
      return
    }

    const invalidItems = items.filter(item => !item.producto_id || item.cantidad <= 0)
    if (invalidItems.length > 0) {
      alert('Todos los items deben tener producto y cantidad válida')
      return
    }

    try {
      setLoading(true)

      const payload = {
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
        alert('Devolución creada exitosamente')
        router.push(`/dashboard/compras/devoluciones/${devolucion.id}`)
      } else {
        alert(response?.message || 'Error al crear devolución')
      }
    } catch (error) {
      console.error('Error creating devolucion:', error)
      alert('Error al crear devolución')
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
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => step === 1 ? router.back() : setStep(1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '16px'
          }}
        >
          <ArrowLeft size={18} />
          Volver
        </button>

        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
          Nueva Devolución a Proveedor
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          {step === 1 ? 'Seleccione la recepción' : 'Configure los items a devolver'}
        </p>
      </div>

      {/* Progress */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '32px',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            height: '4px',
            backgroundColor: 'var(--primary-600)',
            borderRadius: '2px'
          }} />
          <p style={{
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: '600',
            color: 'var(--primary-600)'
          }}>
            1. Seleccionar Recepción
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            height: '4px',
            backgroundColor: step >= 2 ? 'var(--primary-600)' : 'var(--gray-200)',
            borderRadius: '2px'
          }} />
          <p style={{
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: '600',
            color: step >= 2 ? 'var(--primary-600)' : 'var(--text-tertiary)'
          }}>
            2. Items a Devolver
          </p>
        </div>
      </div>

      {/* Step 1: Seleccionar Recepción */}
      {step === 1 && (
        <div>
          {/* Search */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)'
                }}
              />
              <input
                type="text"
                placeholder="Buscar por número de recepción, orden o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 40px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          {/* Lista de Recepciones */}
          <div style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Cargando recepciones...
              </div>
            ) : filteredRecepciones.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <PackageX size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--text-secondary)' }}>
                  No se encontraron recepciones cerradas
                </p>
              </div>
            ) : (
              <div>
                {filteredRecepciones.map((recepcion) => (
                  <div
                    key={recepcion.id}
                    onClick={() => loadRecepcionDetalle(recepcion.id)}
                    style={{
                      padding: '20px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-50)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '600' }}>
                            {recepcion.numero}
                          </span>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            backgroundColor: 'var(--emerald-100)',
                            color: 'var(--emerald-800)'
                          }}>
                            {recepcion.estado}
                          </span>
                        </div>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Orden: {recepcion.orden?.numero}
                        </p>
                        <p style={{ fontSize: '14px', fontWeight: '500' }}>
                          {recepcion.orden?.proveedor?.razon_social}
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          RUC: {recepcion.orden?.proveedor?.ruc}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
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
          <div style={{
            backgroundColor: 'var(--blue-50)',
            border: '1px solid var(--blue-200)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'start', marginBottom: '12px' }}>
              <AlertCircle size={20} style={{ color: 'var(--blue-600)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--blue-900)' }}>
                  Recepción: {selectedRecepcion.numero}
                </p>
                <p style={{ fontSize: '14px', color: 'var(--blue-800)' }}>
                  Orden: {selectedRecepcion.orden?.numero} | Proveedor: {selectedRecepcion.orden?.proveedor?.razon_social}
                </p>
              </div>
            </div>
          </div>

          {/* Motivo General */}
          <div style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Información General
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                Motivo General *
              </label>
              <select
                value={motivoGeneral}
                onChange={(e) => setMotivoGeneral(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
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
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                Observaciones Generales
              </label>
              <textarea
                value={observacionesGenerales}
                onChange={(e) => setObservacionesGenerales(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
                placeholder="Detalles adicionales sobre la devolución..."
              />
            </div>
          </div>

          {/* Items */}
          <div style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
                Items a Devolver ({items.length})
              </h3>
              <button
                onClick={addItem}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  backgroundColor: 'var(--primary-600)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500'
                }}
              >
                <Plus size={16} />
                Agregar Item
              </button>
            </div>

            {items.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No hay items agregados. Haga clic en &quot;Agregar Item&quot; para comenzar.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {items.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--gray-50)'
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 0.5fr', gap: '12px', alignItems: 'start' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500' }}>
                          Producto *
                        </label>
                        {item.producto ? (
                          <div style={{
                            padding: '10px 12px',
                            backgroundColor: 'white',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px'
                          }}>
                            <div style={{ fontWeight: '500', fontSize: '14px' }}>{item.producto.nombre}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Código: {item.producto.codigo}
                            </div>
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="ID del producto"
                            value={item.producto_id}
                            onChange={(e) => updateItem(index, 'producto_id', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              fontSize: '14px'
                            }}
                          />
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500' }}>
                          Cantidad *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.cantidad}
                          onChange={(e) => updateItem(index, 'cantidad', parseFloat(e.target.value) || 0)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            fontSize: '14px'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500' }}>
                          Motivo *
                        </label>
                        <select
                          value={item.motivo}
                          onChange={(e) => updateItem(index, 'motivo', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            fontSize: '14px'
                          }}
                        >
                          <option value="DEFECTUOSO">Defectuoso</option>
                          <option value="INCORRECTO">Incorrecto</option>
                          <option value="DAÑADO">Dañado</option>
                          <option value="VENCIDO">Vencido</option>
                          <option value="OTRO">Otro</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                        <button
                          onClick={() => removeItem(index)}
                          style={{
                            padding: '10px',
                            backgroundColor: 'var(--red-50)',
                            color: 'var(--red-600)',
                            border: '1px solid var(--red-200)',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500' }}>
                        Observaciones del Item
                      </label>
                      <input
                        type="text"
                        placeholder="Detalles específicos de este item..."
                        value={item.observaciones || ''}
                        onChange={(e) => updateItem(index, 'observaciones', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '24px'
          }}>
            <button
              onClick={() => setStep(1)}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: 'white',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: loading ? 0.6 : 1
              }}
            >
              Volver
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || items.length === 0 || !motivoGeneral}
              style={{
                padding: '12px 32px',
                backgroundColor: 'var(--primary-600)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (loading || items.length === 0 || !motivoGeneral) ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: (loading || items.length === 0 || !motivoGeneral) ? 0.6 : 1
              }}
            >
              {loading ? 'Creando...' : 'Crear Devolución'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
