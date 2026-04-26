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
        <span style={{ fontSize: '1.5rem' }}>📊</span>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-700)',
          margin: 0,
        }}>
          Configure los parámetros tributarios y numeración de comprobantes
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Parámetros Tributarios */}
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '1rem',
          }}>
            📊 Parámetros Tributarios
          </h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
          }}>
            {isPeru && (
              <div>
                <Label htmlFor="regimen_tributario" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Régimen Tributario <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <select
                  id="regimen_tributario"
                  value={state.configuration.regimen_tributario || ''}
                  onChange={(e) => {
                    updateConfiguration({ regimen_tributario: e.target.value as any })
                    setErrors({ ...errors, regimen_tributario: '' })
                  }}
                  style={{
                    width: '100%',
                    height: '2.5rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
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
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.regimen_tributario}
                  </p>
                )}
              </div>
            )}

            {isColombia && (
              <div>
                <Label htmlFor="dian_tipo_contribuyente" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Tipo de contribuyente DIAN <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <select
                  id="dian_tipo_contribuyente"
                  value={state.configuration.dian_tipo_contribuyente || ''}
                  onChange={(e) => {
                    updateConfiguration({ dian_tipo_contribuyente: e.target.value as '1' | '2' })
                    setErrors({ ...errors, dian_tipo_contribuyente: '' })
                  }}
                  style={{
                    width: '100%',
                    height: '2.5rem',
                    padding: '0.5rem 0.75rem',
                    fontSize: '1rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                >
                  <option value="">Seleccione tipo</option>
                  <option value="1">Persona jurídica</option>
                  <option value="2">Persona natural</option>
                </select>
                {errors.dian_tipo_contribuyente && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.dian_tipo_contribuyente}
                  </p>
                )}
              </div>
            )}

            {isColombia && (
              <div>
                <Label htmlFor="dian_regimen_fiscal" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Régimen fiscal DIAN <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <Input
                  id="dian_regimen_fiscal"
                  value={state.configuration.dian_regimen_fiscal || ''}
                  onChange={(e) => {
                    updateConfiguration({ dian_regimen_fiscal: e.target.value.toUpperCase() })
                    setErrors({ ...errors, dian_regimen_fiscal: '' })
                  }}
                  placeholder="O-13"
                  style={{ fontSize: '1rem' }}
                />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Usa el código de responsabilidad fiscal DIAN (ej: O-13).
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="igv_porcentaje" style={{ marginBottom: '0.5rem', display: 'block' }}>
                {country.impuesto}
              </Label>
              <Input
                id="igv_porcentaje"
                type="number"
                step="0.01"
                value={state.configuration.igv_porcentaje || 18}
                onChange={(e) => updateConfiguration({ igv_porcentaje: parseFloat(e.target.value) })}
                placeholder="18"
                style={{ fontSize: '1rem' }}
              />
            </div>

            {isPeru && (
              <div>
                <Label htmlFor="retencion_renta_porcentaje" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Retención Renta (%)
                </Label>
                <Input
                  id="retencion_renta_porcentaje"
                  type="number"
                  step="0.01"
                  value={state.configuration.retencion_renta_porcentaje || 0}
                  onChange={(e) => updateConfiguration({ retencion_renta_porcentaje: parseFloat(e.target.value) })}
                  placeholder="0"
                  style={{ fontSize: '1rem' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Numeración Comprobantes */}
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '1rem',
          }}>
            📄 Numeración Comprobantes
          </h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}>
            <div>
              <Label htmlFor="serie_factura" style={{ marginBottom: '0.5rem', display: 'block' }}>
                {isPeru ? 'Serie Facturas' : 'Prefijo Factura'} <span style={{ color: '#ef4444' }}>*</span>
              </Label>
              <Input
                id="serie_factura"
                value={state.configuration.serie_factura || ''}
                onChange={(e) => {
                  updateConfiguration({ serie_factura: e.target.value.toUpperCase() })
                  setErrors({ ...errors, serie_factura: '' })
                }}
                placeholder="F001"
                maxLength={4}
                style={{ fontSize: '1rem' }}
              />
              {errors.serie_factura && (
                <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                  {errors.serie_factura}
                </p>
              )}
            </div>

            {isPeru && (
              <div>
                <Label htmlFor="serie_boleta" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Serie Boletas <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <Input
                  id="serie_boleta"
                  value={state.configuration.serie_boleta || ''}
                  onChange={(e) => {
                    updateConfiguration({ serie_boleta: e.target.value.toUpperCase() })
                    setErrors({ ...errors, serie_boleta: '' })
                  }}
                  placeholder="B001"
                  maxLength={4}
                  style={{ fontSize: '1rem' }}
                />
                {errors.serie_boleta && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.serie_boleta}
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="serie_nota_credito" style={{ marginBottom: '0.5rem', display: 'block' }}>
                Serie Notas de Crédito
              </Label>
              <Input
                id="serie_nota_credito"
                value={state.configuration.serie_nota_credito || ''}
                onChange={(e) => updateConfiguration({ serie_nota_credito: e.target.value.toUpperCase() })}
                placeholder="NC01"
                maxLength={4}
                style={{ fontSize: '1rem' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
