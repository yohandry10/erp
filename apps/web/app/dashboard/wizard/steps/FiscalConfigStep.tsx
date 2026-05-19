'use client'

import { useState } from 'react'
import { useWizardContext } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCountryContext } from '@/hooks/use-country-context'

export function FiscalConfigStep() {
  const { state, updateConfiguration } = useWizardContext()
  const country = useCountryContext()
  const isPeru = country.paisCodigo === 'PE'
  const isColombia = country.paisCodigo === 'CO'
  const [errors, setErrors] = useState<Record<string, string>>({})

  return (
    <div className="py-4 px-0">
      <div className="flex items-center gap-3 mb-6 p-4 bg-[rgba(59,_130,_246,_0.1)] rounded-2">
        <span className="text-6">📊</span>
        <p className="text-[0.875rem] text-[var(--primary-700)] m-0">
          Configure los parámetros tributarios y numeración de comprobantes
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Parámetros Tributarios */}
        <div className="p-6 bg-white rounded-2 border">
          <h3 className="text-[1.125rem] font-semibold text-gray-900 mb-4">
            📊 Parámetros Tributarios
          </h3>
          
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-4">
            {isPeru && (
              <div>
                <Label htmlFor="regimen_tributario" className="mb-2 block">
                  Régimen Tributario <span className="text-red-500">*</span>
                </Label>
                <select
                  id="regimen_tributario"
                  value={state.configuration.regimen_tributario || ''}
                  onChange={(e) => {
                    updateConfiguration({ regimen_tributario: e.target.value as any })
                    setErrors({ ...errors, regimen_tributario: '' })
                  }} className="w-[100%] h-10 py-2 px-3 text-4 border rounded-1.5 bg-white cursor-pointer transition"
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                >
                  <option value="">Seleccione régimen</option>
                  <option value="GENERAL">Régimen General (IGV %)</option>
                  <option value="MYPE">Régimen MYPE Tributario</option>
                  <option value="RER">RER (%)</option>
                  <option value="RUS">RUS</option>
                </select>
                {errors.regimen_tributario && (
                  <p className="text-3 text-red-500 mt-1">
                    {errors.regimen_tributario}
                  </p>
                )}
              </div>
            )}

            {isColombia && (
              <div>
                <Label htmlFor="dian_tipo_contribuyente" className="mb-2 block">
                  Tipo de contribuyente DIAN <span className="text-red-500">*</span>
                </Label>
                <select
                  id="dian_tipo_contribuyente"
                  value={state.configuration.dian_tipo_contribuyente || ''}
                  onChange={(e) => {
                    updateConfiguration({ dian_tipo_contribuyente: e.target.value as '1' | '2' })
                    setErrors({ ...errors, dian_tipo_contribuyente: '' })
                  }} className="w-[100%] h-10 py-2 px-3 text-4 border rounded-1.5 bg-white cursor-pointer transition"
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                >
                  <option value="">Seleccione tipo</option>
                  <option value="1">Persona jurídica</option>
                  <option value="2">Persona natural</option>
                </select>
                {errors.dian_tipo_contribuyente && (
                  <p className="text-3 text-red-500 mt-1">
                    {errors.dian_tipo_contribuyente}
                  </p>
                )}
              </div>
            )}

            {isColombia && (
              <div>
                <Label htmlFor="dian_regimen_fiscal" className="mb-2 block">
                  Régimen fiscal DIAN <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dian_regimen_fiscal"
                  value={state.configuration.dian_regimen_fiscal || ''}
                  onChange={(e) => {
                    updateConfiguration({ dian_regimen_fiscal: e.target.value.toUpperCase() })
                    setErrors({ ...errors, dian_regimen_fiscal: '' })
                  }}
                  placeholder="O-13" className="text-4"
                />
                <p className="text-3 text-gray-500 mt-1">
                  Usa el código de responsabilidad fiscal DIAN (ej: O-13).
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="igv_porcentaje" className="mb-2 block">
                {country.impuesto}
              </Label>
              <Input
                id="igv_porcentaje"
                type="number"
                step="0.01"
                value={state.configuration.igv_porcentaje || 18}
                onChange={(e) => updateConfiguration({ igv_porcentaje: parseFloat(e.target.value) })}
                placeholder="18" className="text-4"
              />
            </div>

            {isPeru && (
              <div>
                <Label htmlFor="retencion_renta_porcentaje" className="mb-2 block">
                  Retención Renta (%)
                </Label>
                <Input
                  id="retencion_renta_porcentaje"
                  type="number"
                  step="0.01"
                  value={state.configuration.retencion_renta_porcentaje || 0}
                  onChange={(e) => updateConfiguration({ retencion_renta_porcentaje: parseFloat(e.target.value) })}
                  placeholder="0" className="text-4"
                />
              </div>
            )}
          </div>
        </div>

        {/* Numeración Comprobantes */}
        <div className="p-6 bg-white rounded-2 border">
          <h3 className="text-[1.125rem] font-semibold text-gray-900 mb-4">
            📄 Numeración Comprobantes
          </h3>
          
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
            <div>
              <Label htmlFor="serie_factura" className="mb-2 block">
                {isPeru ? 'Serie Facturas' : 'Prefijo Factura'} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="serie_factura"
                value={state.configuration.serie_factura || ''}
                onChange={(e) => {
                  updateConfiguration({ serie_factura: e.target.value.toUpperCase() })
                  setErrors({ ...errors, serie_factura: '' })
                }}
                placeholder="F001"
                maxLength={4} className="text-4"
              />
              {errors.serie_factura && (
                <p className="text-3 text-red-500 mt-1">
                  {errors.serie_factura}
                </p>
              )}
            </div>

            {isPeru && (
              <div>
                <Label htmlFor="serie_boleta" className="mb-2 block">
                  Serie Boletas <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="serie_boleta"
                  value={state.configuration.serie_boleta || ''}
                  onChange={(e) => {
                    updateConfiguration({ serie_boleta: e.target.value.toUpperCase() })
                    setErrors({ ...errors, serie_boleta: '' })
                  }}
                  placeholder="B001"
                  maxLength={4} className="text-4"
                />
                {errors.serie_boleta && (
                  <p className="text-3 text-red-500 mt-1">
                    {errors.serie_boleta}
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="serie_nota_credito" className="mb-2 block">
                Serie Notas de Crédito
              </Label>
              <Input
                id="serie_nota_credito"
                value={state.configuration.serie_nota_credito || ''}
                onChange={(e) => updateConfiguration({ serie_nota_credito: e.target.value.toUpperCase() })}
                placeholder="NC01"
                maxLength={4} className="text-4"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
