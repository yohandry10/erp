'use client'

import React, { useEffect } from 'react'
import { useWizard } from '../useWizard'
import { useCountryContext } from '@/hooks/use-country-context'
import { Label } from '@/components/ui/label'
import { Building2, Package, Truck, FileText } from 'lucide-react'

type TipoEmpresa = 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'

export function CompanyTypeStep() {
  const { state, updateConfiguration } = useWizard()
  const country = useCountryContext()

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
  }, [state.configuration.tipo_empresa, updateConfiguration])

  return (
    <div className="py-4 px-0">
      <div className="flex items-center gap-3 mb-6 p-4 bg-[rgba(59,_130,_246,_0.1)] rounded-2">
        <Building2 size={24} className="text-[var(--primary-600)]" />
        <p className="text-[0.875rem] text-[var(--primary-700)] m-0">
          Selecciona el tipo de empresa para configurar los flujos de trabajo apropiados
        </p>
      </div>

      {/* Tipo de Empresa Selection */}
      <div className="mb-8">
        <Label className="mb-4 block text-4 font-semibold">
          Tipo de Empresa <span className="text-red-500">*</span>
        </Label>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
          {tiposEmpresa.map((tipo) => (
            <button
              key={tipo.value}
              type="button"
              onClick={() => handleTipoEmpresaChange(tipo.value)} className="p-6 rounded-3 cursor-pointer transition text-left flex flex-col gap-3"
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
              <div className="flex items-center gap-3">
                {tipo.icon}
                <span className="font-semibold text-4">
                  {tipo.label}
                </span>
              </div>
              <p className="text-[0.875rem] text-[var(--gray-600)] m-0 leading-[1.4]">
                {tipo.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Configuración GRE - Solo para Perú */}
      {state.configuration.tipo_empresa && country.paisCodigo === 'PE' && (
        <div className="mt-8 p-6 bg-[rgba(249,_250,_251,_1)] rounded-3 border">
          <h3 className="text-4 font-semibold mb-4 text-[var(--gray-900)]">
            Configuración de Guías de Remisión Electrónica (GRE)
          </h3>

          <div className="flex flex-col gap-4">
            {/* GRE Obligatorio */}
            <div className="flex items-start gap-3 p-4 bg-white rounded-2 border">
              <input
                type="checkbox"
                id="gre_obligatorio"
                checked={state.configuration.gre_obligatorio || false}
                onChange={(e) => updateConfiguration({ gre_obligatorio: e.target.checked })} className="w-5 h-5 mt-[2px] cursor-pointer"
              />
              <div className="flex-[1]">
                <Label htmlFor="gre_obligatorio" className="cursor-pointer font-semibold">
                  GRE Obligatorio
                </Label>
                <p className="text-[0.875rem] text-[var(--gray-600)] mt-1 mr-0 mb-0 ml-0">
                  Exigir generación de GRE antes de completar pedidos
                </p>
              </div>
            </div>

            {/* GRE Automático */}
            <div className="flex items-start gap-3 p-4 bg-white rounded-2 border">
              <input
                type="checkbox"
                id="gre_automatico"
                checked={state.configuration.gre_automatico_habilitado !== false}
                onChange={(e) => updateConfiguration({ gre_automatico_habilitado: e.target.checked })} className="w-5 h-5 mt-[2px] cursor-pointer"
              />
              <div className="flex-[1]">
                <Label htmlFor="gre_automatico" className="cursor-pointer font-semibold">
                  Sugerencia Automática de GRE
                </Label>
                <p className="text-[0.875rem] text-[var(--gray-600)] mt-1 mr-0 mb-0 ml-0">
                  Sugerir generación de GRE cuando el monto supere el umbral
                </p>
              </div>
            </div>

            {/* Umbral GRE */}
            {state.configuration.gre_automatico_habilitado !== false && (
              <div className="p-4 bg-white rounded-2 border">
                <Label htmlFor="umbral_gre" className="mb-2 block font-semibold">
                  Umbral para Sugerencia de GRE (S/)
                </Label>
                <input
                  type="number"
                  id="umbral_gre"
                  value={state.configuration.umbral_gre_automatico || 700}
                  onChange={(e) => updateConfiguration({ umbral_gre_automatico: parseFloat(e.target.value) })}
                  min="0"
                  step="0.01" className="w-[100%] p-3 rounded-[6px] border text-4"
                />
                <p className="text-3 text-[var(--gray-500)] mt-2">
                  Monto mínimo (en soles) para sugerir la generación de GRE
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Info Box */}
      {state.configuration.tipo_empresa && (
        <div className="mt-6 p-4 rounded-2">
          <p className="text-[0.875rem] m-0 leading-6">
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
