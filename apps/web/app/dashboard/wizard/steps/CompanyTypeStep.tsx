'use client'

import React, { useEffect } from 'react'
import { useWizard } from '../useWizard'
import { Label } from '@/components/ui/label'
import { Building2, Package, Truck, FileText } from 'lucide-react'

type TipoEmpresa = 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'

export function CompanyTypeStep() {
  const { state, updateConfiguration } = useWizard()

  const tiposEmpresa: Array<{
    value: TipoEmpresa
    label: string
    description: string
    icon: React.ReactNode
    flujoLogistica: boolean
  }> = [
    {
      value: 'MICRO',
      label: 'Microempresa',
      description: 'Flujo simplificado - Ideal para negocios pequeños',
      icon: <Building2 size={24} />,
      flujoLogistica: false,
    },
    {
      value: 'PEQUEÑA',
      label: 'Pequeña Empresa',
      description: 'Flujo simplificado - Para empresas en crecimiento',
      icon: <Package size={24} />,
      flujoLogistica: false,
    },
    {
      value: 'MEDIANA',
      label: 'Mediana Empresa',
      description: 'Flujo completo con logística - Control de almacén',
      icon: <Truck size={24} />,
      flujoLogistica: true,
    },
    {
      value: 'GRANDE',
      label: 'Gran Empresa',
      description: 'Flujo completo con logística - Gestión avanzada',
      icon: <FileText size={24} />,
      flujoLogistica: true,
    },
  ]

  const handleTipoEmpresaChange = (tipo: TipoEmpresa) => {
    const tipoConfig = tiposEmpresa.find(t => t.value === tipo)
    updateConfiguration({
      tipo_empresa: tipo,
      usar_flujo_logistica: tipoConfig?.flujoLogistica,
    })
  }

  // Set default values on mount if not set
  useEffect(() => {
    if (!state.configuration.tipo_empresa) {
      updateConfiguration({
        gre_obligatorio: false,
        gre_automatico_habilitado: true,
        umbral_gre_automatico: 700,
      })
    }
  }, [])

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '8px',
      }}>
        <Building2 size={24} style={{ color: 'var(--primary-600)' }} />
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-700)',
          margin: 0,
        }}>
          Selecciona el tipo de empresa para configurar los flujos de trabajo apropiados
        </p>
      </div>

      {/* Tipo de Empresa Selection */}
      <div style={{ marginBottom: '2rem' }}>
        <Label style={{ marginBottom: '1rem', display: 'block', fontSize: '1rem', fontWeight: '600' }}>
          Tipo de Empresa <span style={{ color: '#ef4444' }}>*</span>
        </Label>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
        }}>
          {tiposEmpresa.map((tipo) => (
            <button
              key={tipo.value}
              type="button"
              onClick={() => handleTipoEmpresaChange(tipo.value)}
              style={{
                padding: '1.5rem',
                borderRadius: '12px',
                border: state.configuration.tipo_empresa === tipo.value
                  ? '2px solid var(--primary-600)'
                  : '2px solid rgba(0, 0, 0, 0.1)',
                backgroundColor: state.configuration.tipo_empresa === tipo.value
                  ? 'rgba(59, 130, 246, 0.1)'
                  : 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
              onMouseEnter={(e) => {
                if (state.configuration.tipo_empresa !== tipo.value) {
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'
                  e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (state.configuration.tipo_empresa !== tipo.value) {
                  e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.1)'
                  e.currentTarget.style.backgroundColor = 'white'
                }
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                color: state.configuration.tipo_empresa === tipo.value
                  ? 'var(--primary-600)'
                  : 'var(--gray-700)',
              }}>
                {tipo.icon}
                <span style={{ fontWeight: '600', fontSize: '1rem' }}>
                  {tipo.label}
                </span>
              </div>
              <p style={{
                fontSize: '0.875rem',
                color: 'var(--gray-600)',
                margin: 0,
                lineHeight: '1.4',
              }}>
                {tipo.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Configuración GRE */}
      {state.configuration.tipo_empresa && (
        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          backgroundColor: 'rgba(249, 250, 251, 1)',
          borderRadius: '12px',
          border: '1px solid rgba(0, 0, 0, 0.1)',
        }}>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: '600',
            marginBottom: '1rem',
            color: 'var(--gray-900)',
          }}>
            Configuración de Guías de Remisión Electrónica (GRE)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* GRE Obligatorio */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
            }}>
              <input
                type="checkbox"
                id="gre_obligatorio"
                checked={state.configuration.gre_obligatorio || false}
                onChange={(e) => updateConfiguration({ gre_obligatorio: e.target.checked })}
                style={{
                  width: '20px',
                  height: '20px',
                  marginTop: '2px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ flex: 1 }}>
                <Label htmlFor="gre_obligatorio" style={{ cursor: 'pointer', fontWeight: '600' }}>
                  GRE Obligatorio
                </Label>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'var(--gray-600)',
                  margin: '0.25rem 0 0 0',
                }}>
                  Exigir generación de GRE antes de completar pedidos
                </p>
              </div>
            </div>

            {/* GRE Automático */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid rgba(0, 0, 0, 0.1)',
            }}>
              <input
                type="checkbox"
                id="gre_automatico"
                checked={state.configuration.gre_automatico_habilitado !== false}
                onChange={(e) => updateConfiguration({ gre_automatico_habilitado: e.target.checked })}
                style={{
                  width: '20px',
                  height: '20px',
                  marginTop: '2px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ flex: 1 }}>
                <Label htmlFor="gre_automatico" style={{ cursor: 'pointer', fontWeight: '600' }}>
                  Sugerencia Automática de GRE
                </Label>
                <p style={{
                  fontSize: '0.875rem',
                  color: 'var(--gray-600)',
                  margin: '0.25rem 0 0 0',
                }}>
                  Sugerir generación de GRE cuando el monto supere el umbral
                </p>
              </div>
            </div>

            {/* Umbral GRE */}
            {state.configuration.gre_automatico_habilitado !== false && (
              <div style={{
                padding: '1rem',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
              }}>
                <Label htmlFor="umbral_gre" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: '600' }}>
                  Umbral para Sugerencia de GRE (S/)
                </Label>
                <input
                  type="number"
                  id="umbral_gre"
                  value={state.configuration.umbral_gre_automatico || 700}
                  onChange={(e) => updateConfiguration({ umbral_gre_automatico: parseFloat(e.target.value) })}
                  min="0"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(0, 0, 0, 0.2)',
                    fontSize: '1rem',
                  }}
                />
                <p style={{
                  fontSize: '0.75rem',
                  color: 'var(--gray-500)',
                  marginTop: '0.5rem',
                }}>
                  Monto mínimo (en soles) para sugerir la generación de GRE
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Box */}
      {state.configuration.tipo_empresa && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: state.configuration.usar_flujo_logistica
            ? 'rgba(16, 185, 129, 0.1)'
            : 'rgba(251, 191, 36, 0.1)',
          borderRadius: '8px',
          border: state.configuration.usar_flujo_logistica
            ? '1px solid rgba(16, 185, 129, 0.2)'
            : '1px solid rgba(251, 191, 36, 0.2)',
        }}>
          <p style={{
            fontSize: '0.875rem',
            color: state.configuration.usar_flujo_logistica
              ? 'var(--success-700)'
              : 'var(--warning-700)',
            margin: 0,
            lineHeight: '1.5',
          }}>
            <strong>
              {state.configuration.usar_flujo_logistica ? '✓ Flujo Completo:' : '⚡ Flujo Simplificado:'}
            </strong>
            {' '}
            {state.configuration.usar_flujo_logistica
              ? 'Los pedidos pasarán por etapas de preparación y despacho en el módulo de Inventario antes de facturar.'
              : 'Los pedidos irán directamente de confirmación a facturación, ideal para operaciones ágiles.'
            }
          </p>
        </div>
      )}
    </div>
  )
}
