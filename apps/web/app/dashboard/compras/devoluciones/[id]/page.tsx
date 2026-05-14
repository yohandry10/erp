'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import {
  ArrowLeft,
  PackageX,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  User,
  Calendar,
  AlertCircle
} from 'lucide-react'

interface DevolucionItem {
  id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  motivo?: string
  motivo_detalle?: string
  observaciones?: string
  producto?: {
    codigo: string
    nombre: string
    unidad_medida: string
  }
}

interface Devolucion {
  id: string
  numero: string
  recepcion_id?: string
  orden_id: string
  proveedor_id: string
  fecha_devolucion: string
  estado: 'PENDIENTE' | 'EMITIDA' | 'ANULADA'
  motivo: string
  subtotal: number
  igv: number
  total: number
  observaciones?: string
  emitido_por?: string
  emitido_at?: string
  created_at: string
  created_by?: string
  orden?: {
    id: string
    numero: string
  }
  proveedor?: {
    id: string
    razon_social: string
    ruc: string
    direccion?: string
    telefono?: string
    email?: string
  }
  recepcion?: {
    id: string
    numero: string
    fecha_recepcion: string
  }
  items?: DevolucionItem[]
}

export default function DevolucionDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get, post } = useApi()

  const [devolucion, setDevolucion] = useState<Devolucion | null>(null)
  const [loading, setLoading] = useState(true)
  const [emitiendo, setEmitiendo] = useState(false)

  const devolucionId = params.id as string | undefined

  const loadDevolucion = useCallback(async () => {
    if (!devolucionId) return

    try {
      setLoading(true)
      const response = await get(`/api/compras/devoluciones/${devolucionId}`)
      const devolucionData = response?.data ?? response
      if (devolucionData?.id) {
        setDevolucion(devolucionData)
      }
    } catch (error) {
      console.error('Error loading devolucion:', error)
      alert('Error al cargar devolución')
    } finally {
      setLoading(false)
    }
  }, [devolucionId, get])

  useEffect(() => {
    loadDevolucion()
  }, [loadDevolucion])

  const handleEmitir = async () => {
    if (!devolucion || devolucion.estado !== 'PENDIENTE') return

    if (!confirm('¿Está seguro de emitir esta devolución? Esta acción actualizará el inventario y creará una nota de crédito.')) {
      return
    }

    try {
      setEmitiendo(true)
      const response = await post(`/api/compras/devoluciones/${devolucion.id}/emitir`, {})
      const devolucionEmitida = response?.data ?? response

      if (devolucionEmitida?.id || response?.success) {
        alert('Devolución emitida exitosamente')
        loadDevolucion()
      } else {
        alert(response?.message || 'Error al emitir devolución')
      }
    } catch (error) {
      console.error('Error emitiendo devolucion:', error)
      alert('Error al emitir devolución')
    } finally {
      setEmitiendo(false)
    }
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getEstadoBadge = (estado: string) => {
    const styles = {
      PENDIENTE: { bg: 'var(--amber-100)', color: 'var(--amber-800)', icon: Clock },
      EMITIDA: { bg: 'var(--emerald-100)', color: 'var(--emerald-800)', icon: CheckCircle },
      ANULADA: { bg: 'var(--red-100)', color: 'var(--red-800)', icon: XCircle }
    }

    const style = styles[estado as keyof typeof styles] || styles.PENDIENTE
    const Icon = style.icon

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '600',
        backgroundColor: style.bg,
        color: style.color
      }}>
        <Icon size={16} />
        {estado}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
          Cargando devolución...
        </div>
      </div>
    )
  }

  if (!devolucion) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <PackageX size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Devolución no encontrada</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => router.back()}
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '700' }}>
                Devolución {devolucion.numero}
              </h1>
              {getEstadoBadge(devolucion.estado)}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Creada el {formatDateTime(devolucion.created_at)}
            </p>
          </div>

          {devolucion.estado === 'PENDIENTE' && (
            <button
              onClick={handleEmitir}
              disabled={emitiendo}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                backgroundColor: 'var(--emerald-600)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: emitiendo ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: emitiendo ? 0.6 : 1
              }}
            >
              <CheckCircle size={18} />
              {emitiendo ? 'Emitiendo...' : 'Emitir Devolución'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Columna Principal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Información General */}
          <div style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              Información General
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Orden de Compra
                </label>
                <p style={{ fontSize: '14px', fontWeight: '500' }}>
                  {devolucion.orden?.numero || '-'}
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Recepción
                </label>
                <p style={{ fontSize: '14px', fontWeight: '500' }}>
                  {devolucion.recepcion?.numero || '-'}
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Fecha Devolución
                </label>
                <p style={{ fontSize: '14px', fontWeight: '500' }}>
                  {formatDate(devolucion.fecha_devolucion)}
                </p>
              </div>

              {devolucion.recepcion?.fecha_recepcion && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Fecha Recepción Original
                  </label>
                  <p style={{ fontSize: '14px', fontWeight: '500' }}>
                    {formatDate(devolucion.recepcion.fecha_recepcion)}
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Motivo
              </label>
              <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
                {devolucion.motivo}
              </p>

              {devolucion.observaciones && (
                <>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Observaciones
                  </label>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {devolucion.observaciones}
                  </p>
                </>
              )}
            </div>

            {devolucion.estado === 'EMITIDA' && devolucion.emitido_at && (
              <div style={{
                marginTop: '20px',
                padding: '16px',
                backgroundColor: 'var(--emerald-50)',
                border: '1px solid var(--emerald-200)',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'start' }}>
                  <CheckCircle size={20} style={{ color: 'var(--emerald-600)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontWeight: '600', color: 'var(--emerald-900)', marginBottom: '4px' }}>
                      Devolución Emitida
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--emerald-800)' }}>
                      Emitida el {formatDateTime(devolucion.emitido_at)}
                      {devolucion.emitido_por && ` por ${devolucion.emitido_por}`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600' }}>
                Items Devueltos ({devolucion.items?.length || 0})
              </h2>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--gray-50)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      PRODUCTO
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      CANTIDAD
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      P. UNITARIO
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      SUBTOTAL
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      MOTIVO
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {devolucion.items?.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '16px' }}>
                        <div>
                          <div style={{ fontWeight: '500', fontSize: '14px', marginBottom: '2px' }}>
                            {item.producto?.nombre || '-'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Código: {item.producto?.codigo || '-'}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center', fontSize: '14px', fontWeight: '500' }}>
                        {item.cantidad} {item.producto?.unidad_medida || ''}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px' }}>
                        {formatCurrency(item.precio_unitario)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                        {formatCurrency(item.subtotal)}
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px' }}>
                        <div>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            backgroundColor: 'var(--red-100)',
                            color: 'var(--red-800)'
                          }}>
                            {item.motivo_detalle || item.motivo || '-'}
                          </span>
                          {item.observaciones && (
                            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {item.observaciones}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div style={{ padding: '24px', backgroundColor: 'var(--gray-50)', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ maxWidth: '300px', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Subtotal:</span>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{formatCurrency(devolucion.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>IGV (18%):</span>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{formatCurrency(devolucion.igv)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '2px solid var(--border-color)'
                }}>
                  <span style={{ fontSize: '16px', fontWeight: '600' }}>Total:</span>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: 'var(--primary-600)' }}>
                    {formatCurrency(devolucion.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Lateral */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Proveedor */}
          <div style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              Proveedor
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                {devolucion.proveedor?.razon_social || '-'}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                RUC: {devolucion.proveedor?.ruc || '-'}
              </p>
            </div>

            {devolucion.proveedor?.direccion && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Dirección
                </label>
                <p style={{ fontSize: '13px' }}>
                  {devolucion.proveedor.direccion}
                </p>
              </div>
            )}

            {devolucion.proveedor?.telefono && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Teléfono
                </label>
                <p style={{ fontSize: '13px' }}>
                  {devolucion.proveedor.telefono}
                </p>
              </div>
            )}

            {devolucion.proveedor?.email && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Email
                </label>
                <p style={{ fontSize: '13px' }}>
                  {devolucion.proveedor.email}
                </p>
              </div>
            )}
          </div>

          {/* Información Adicional */}
          <div style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '24px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              Información Adicional
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                <Calendar size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                    Fecha de Creación
                  </p>
                  <p style={{ fontSize: '14px', fontWeight: '500' }}>
                    {formatDateTime(devolucion.created_at)}
                  </p>
                </div>
              </div>

              {devolucion.created_by && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <User size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      Creado por
                    </p>
                    <p style={{ fontSize: '14px', fontWeight: '500' }}>
                      {devolucion.created_by}
                    </p>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                <FileText size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                    Número de Devolución
                  </p>
                  <p style={{ fontSize: '14px', fontWeight: '500' }}>
                    {devolucion.numero}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
