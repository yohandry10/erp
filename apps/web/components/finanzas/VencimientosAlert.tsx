'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { AlertTriangle, X, ChevronDown, ChevronUp, Clock } from 'lucide-react'

interface VencimientoItem {
  id: string
  numero_documento: string
  proveedor_razon_social: string
  fecha_vencimiento: string
  saldo: number
  moneda: string
  dias_restantes: number
}

interface VencimientosAlertProps {
  diasAdelante?: number
  proveedorId?: string
  onCuentaClick?: (cuentaId: string) => void
}

export default function VencimientosAlert({ 
  diasAdelante = 7, 
  proveedorId,
  onCuentaClick 
}: VencimientosAlertProps) {
  const { get } = useApi()
  const [vencimientos, setVencimientos] = useState<VencimientoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    loadVencimientos()
  }, [diasAdelante, proveedorId])

  const loadVencimientos = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append('dias', diasAdelante.toString())
      if (proveedorId) {
        params.append('proveedor_id', proveedorId)
      }

      const response = await get(`/api/finanzas/cxp/vencimientos?${params.toString()}`)
      
      if (response?.success && response.data?.vencimientos) {
        setVencimientos(response.data.vencimientos)
      }
    } catch (error) {
      console.error('Error loading vencimientos:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getAlertColor = (diasRestantes: number) => {
    if (diasRestantes < 0) return { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }
    if (diasRestantes <= 3) return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }
    return { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
  }

  if (loading || dismissed || vencimientos.length === 0) {
    return null
  }

  const vencidosCount = vencimientos.filter(v => v.dias_restantes < 0).length
  const proximosCount = vencimientos.filter(v => v.dias_restantes >= 0).length
  const totalSaldo = vencimientos.reduce((sum, v) => sum + v.saldo, 0)

  const alertColor = vencidosCount > 0 
    ? { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', icon: '#ef4444' }
    : { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '#f59e0b' }

  return (
    <div style={{
      background: alertColor.bg,
      border: `2px solid ${alertColor.border}`,
      borderRadius: '12px',
      padding: '1rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <AlertTriangle size={24} style={{ color: alertColor.icon, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h3 style={{ 
              fontSize: '1rem', 
              fontWeight: '700', 
              color: alertColor.text,
              margin: 0,
              marginBottom: '0.25rem'
            }}>
              {vencidosCount > 0 
                ? `⚠️ ${vencidosCount} cuenta${vencidosCount > 1 ? 's' : ''} vencida${vencidosCount > 1 ? 's' : ''}`
                : `📅 ${proximosCount} cuenta${proximosCount > 1 ? 's' : ''} por vencer`
              }
            </h3>
            <p style={{ 
              fontSize: '0.875rem', 
              color: alertColor.text,
              margin: 0,
              opacity: 0.9
            }}>
              {vencidosCount > 0 && proximosCount > 0
                ? `${vencidosCount} vencida${vencidosCount > 1 ? 's' : ''} y ${proximosCount} próxima${proximosCount > 1 ? 's' : ''} a vencer`
                : vencidosCount > 0
                  ? `Requiere${vencidosCount > 1 ? 'n' : ''} atención inmediata`
                  : `Vence${proximosCount > 1 ? 'n' : ''} en los próximos ${diasAdelante} días`
              }
              {' • '}
              <strong>{formatCurrency(totalSaldo, vencimientos[0]?.moneda || 'PEN')}</strong> total
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${alertColor.border}`,
              background: 'white',
              color: alertColor.text,
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease'
            }}
          >
            {expanded ? (
              <>
                Ocultar <ChevronUp size={16} />
              </>
            ) : (
              <>
                Ver detalles <ChevronDown size={16} />
              </>
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: alertColor.text,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s ease',
              opacity: 0.7
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.background = 'rgba(0,0,0,0.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ 
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: `1px solid ${alertColor.border}`
        }}>
          <div style={{ 
            display: 'grid',
            gap: '0.75rem',
            maxHeight: '400px',
            overflowY: 'auto'
          }}>
            {vencimientos.map((vencimiento) => {
              const itemColor = getAlertColor(vencimiento.dias_restantes)
              const isOverdue = vencimiento.dias_restantes < 0

              return (
                <div
                  key={vencimiento.id}
                  style={{
                    background: 'white',
                    border: `1px solid ${itemColor.border}`,
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    transition: 'all 0.2s ease',
                    cursor: onCuentaClick ? 'pointer' : 'default'
                  }}
                  onClick={() => onCuentaClick?.(vencimiento.id)}
                  onMouseEnter={(e) => {
                    if (onCuentaClick) {
                      e.currentTarget.style.transform = 'translateX(4px)'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (onCuentaClick) {
                      e.currentTarget.style.transform = 'translateX(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <Clock size={20} style={{ color: itemColor.border, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '0.25rem'
                      }}>
                        {vencimiento.numero_documento}
                        <span style={{ 
                          marginLeft: '0.5rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          color: '#6b7280'
                        }}>
                          • {vencimiento.proveedor_razon_social}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem',
                        color: itemColor.text,
                        fontWeight: '600'
                      }}>
                        {isOverdue 
                          ? `⚠️ Vencido hace ${Math.abs(vencimiento.dias_restantes)} día${Math.abs(vencimiento.dias_restantes) > 1 ? 's' : ''}`
                          : vencimiento.dias_restantes === 0
                            ? '🔴 Vence HOY'
                            : `Vence en ${vencimiento.dias_restantes} día${vencimiento.dias_restantes > 1 ? 's' : ''}`
                        }
                        {' • '}
                        {formatDate(vencimiento.fecha_vencimiento)}
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '700',
                    color: itemColor.text,
                    textAlign: 'right',
                    flexShrink: 0
                  }}>
                    {formatCurrency(vencimiento.saldo, vencimiento.moneda)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
