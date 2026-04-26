'use client'

import { useEffect, useState } from 'react'
import { useWizardContext } from '../WizardContext'
import { useCountryContext } from '@/hooks/use-country-context'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'

export function SunatConfigStep() {
  const { state, updateConfiguration } = useWizardContext()
  const country = useCountryContext()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const emisionModo = state.configuration.emision_cpe_modo || 'SUNAT_DIRECTO'
  const authTipo = state.configuration.ose_auth_tipo || 'BASIC'
  const isOseApi = emisionModo === 'OSE_API'
  const isColombia = country.paisCodigo === 'CO'
  const oseLabel = isColombia ? 'Proveedor' : 'OSE'
  const dianEnvironment = state.configuration.dian_environment || 'HOMOLOGACION'

  const handleEmisionModoChange = (value: 'SUNAT_DIRECTO' | 'OSE_API') => {
    updateConfiguration({
      emision_cpe_modo: value,
      ose_activo: value === 'OSE_API',
    })
  }

  const handleAuthTipoChange = (value: 'BASIC' | 'BEARER' | 'API_KEY' | 'NONE') => {
    updateConfiguration({ ose_auth_tipo: value })
  }

  useEffect(() => {
    if (isOseApi && !state.configuration.ose_activo) {
      updateConfiguration({ ose_activo: true })
    }
  }, [isOseApi, state.configuration.ose_activo, updateConfiguration])

  useEffect(() => {
    if (isColombia && !state.configuration.dian_activo) {
      updateConfiguration({ dian_activo: true })
    }
  }, [isColombia, state.configuration.dian_activo, updateConfiguration])

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
        <span style={{ fontSize: '1.5rem' }}>🏛️</span>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-700)',
          margin: 0,
        }}>
          Define como se enviaran los comprobantes: {country.servicioFiscal} directo (SOAP) o API externa ({oseLabel} o propia).
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            🧭 Modo de emision
          </h3>

          <div style={{ marginBottom: '1rem' }}>
            <Label htmlFor="emision_modo" style={{ marginBottom: '0.5rem', display: 'block' }}>
              Selecciona el modo de envio
            </Label>
            <Select value={emisionModo} onValueChange={(value) => handleEmisionModoChange(value as 'SUNAT_DIRECTO' | 'OSE_API')}>
              <SelectTrigger id="emision_modo">
              <SelectValue placeholder="Selecciona un modo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SUNAT_DIRECTO">{country.servicioFiscal} directo (SOAP)</SelectItem>
              <SelectItem value="OSE_API">{oseLabel} API (REST)</SelectItem>
            </SelectContent>
          </Select>
          </div>

          {!isOseApi && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '8px',
            }}>
              <AlertCircle size={20} style={{ color: '#0f766e', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#134e4a',
                  margin: 0,
                }}>
                  {country.servicioFiscal} directo activo
                </p>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#0f766e',
                  margin: '0.25rem 0 0 0',
                }}>
                  Puedes cambiar a {oseLabel} API cuando tengas un endpoint (proveedor o API propia).
                </p>
              </div>
            </div>
          )}
        </div>

        {isColombia && (
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
              🇨🇴 Configuración DIAN
            </h3>

            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}>
              <AlertCircle size={20} style={{ color: '#2563eb', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#1e3a8a',
                  margin: 0,
                }}>
                  Datos requeridos por DIAN
                </p>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#1d4ed8',
                  margin: '0.25rem 0 0 0',
                }}>
                  Esta información la entrega la DIAN o tu proveedor tecnológico autorizado.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <Label htmlFor="dian_environment" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Ambiente DIAN
                </Label>
                <Select
                  value={dianEnvironment}
                  onValueChange={(value) => updateConfiguration({ dian_environment: value as 'HOMOLOGACION' | 'PRODUCCION' })}
                >
                  <SelectTrigger id="dian_environment">
                    <SelectValue placeholder="Selecciona ambiente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOMOLOGACION">Homologación</SelectItem>
                    <SelectItem value="PRODUCCION">Producción</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="dian_url" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  URL DIAN <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <Input
                  id="dian_url"
                  type="url"
                  value={state.configuration.dian_url || ''}
                  onChange={(e) => updateConfiguration({ dian_url: e.target.value })}
                  placeholder="https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc"
                  style={{ fontSize: '1rem' }}
                />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
              }}>
                <div>
                  <Label htmlFor="dian_usuario" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Usuario DIAN <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_usuario"
                    value={state.configuration.dian_usuario || ''}
                    onChange={(e) => updateConfiguration({ dian_usuario: e.target.value })}
                    placeholder="usuario"
                    style={{ fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <Label htmlFor="dian_password" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Password DIAN <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_password"
                    type="password"
                    value={state.configuration.dian_password || ''}
                    onChange={(e) => updateConfiguration({ dian_password: e.target.value })}
                    placeholder="••••••••"
                    style={{ fontSize: '1rem' }}
                  />
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
              }}>
                <div>
                  <Label htmlFor="dian_software_id" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Software ID <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_software_id"
                    value={state.configuration.dian_software_id || ''}
                    onChange={(e) => updateConfiguration({ dian_software_id: e.target.value })}
                    placeholder="SoftwareId"
                    style={{ fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <Label htmlFor="dian_software_pin" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Software PIN <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_software_pin"
                    type="password"
                    value={state.configuration.dian_software_pin || ''}
                    onChange={(e) => updateConfiguration({ dian_software_pin: e.target.value })}
                    placeholder="PIN"
                    style={{ fontSize: '1rem' }}
                  />
                </div>
              </div>

              {dianEnvironment === 'HOMOLOGACION' && (
                <div>
                  <Label htmlFor="dian_test_set_id" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Test Set ID <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_test_set_id"
                    value={state.configuration.dian_test_set_id || ''}
                    onChange={(e) => updateConfiguration({ dian_test_set_id: e.target.value })}
                    placeholder="TestSetId"
                    style={{ fontSize: '1rem' }}
                  />
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
              }}>
                <div>
                  <Label htmlFor="dian_resolucion_numero" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Resolución DIAN <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_resolucion_numero"
                    value={state.configuration.dian_resolucion_numero || ''}
                    onChange={(e) => updateConfiguration({ dian_resolucion_numero: e.target.value })}
                    placeholder="18760000001"
                    style={{ fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <Label htmlFor="dian_resolucion_prefijo" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Prefijo <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_resolucion_prefijo"
                    value={state.configuration.dian_resolucion_prefijo || ''}
                    onChange={(e) => updateConfiguration({ dian_resolucion_prefijo: e.target.value.toUpperCase() })}
                    placeholder="FE"
                    maxLength={4}
                    style={{ fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <Label htmlFor="dian_resolucion_desde" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Desde <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_resolucion_desde"
                    type="number"
                    value={state.configuration.dian_resolucion_desde ?? ''}
                    onChange={(e) => updateConfiguration({ dian_resolucion_desde: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                    placeholder="1"
                    style={{ fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <Label htmlFor="dian_resolucion_hasta" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Hasta <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_resolucion_hasta"
                    type="number"
                    value={state.configuration.dian_resolucion_hasta ?? ''}
                    onChange={(e) => updateConfiguration({ dian_resolucion_hasta: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                    placeholder="50000"
                    style={{ fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <Label htmlFor="dian_resolucion_fecha_inicio" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Vigencia inicio <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_resolucion_fecha_inicio"
                    type="date"
                    value={state.configuration.dian_resolucion_fecha_inicio || ''}
                    onChange={(e) => updateConfiguration({ dian_resolucion_fecha_inicio: e.target.value })}
                    style={{ fontSize: '1rem' }}
                  />
                </div>

                <div>
                  <Label htmlFor="dian_resolucion_fecha_fin" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Vigencia fin <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="dian_resolucion_fecha_fin"
                    type="date"
                    value={state.configuration.dian_resolucion_fecha_fin || ''}
                    onChange={(e) => updateConfiguration({ dian_resolucion_fecha_fin: e.target.value })}
                    style={{ fontSize: '1rem' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {isOseApi && (
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
              🔌 Configuracion {oseLabel} API
            </h3>

            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              backgroundColor: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.2)',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}>
              <AlertCircle size={20} style={{ color: '#d97706', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#78350f',
                  margin: 0,
                }}>
                  {oseLabel} API lista para configurar
                </p>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#92400e',
                  margin: '0.25rem 0 0 0',
                }}>
                  La URL debe ser el endpoint exacto que indique tu proveedor o tu propia API.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <Label htmlFor="ose_url" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  URL {oseLabel} API <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <Input
                  id="ose_url"
                  type="url"
                  value={state.configuration.ose_url || ''}
                  onChange={(e) => {
                    updateConfiguration({ ose_url: e.target.value })
                    setErrors({ ...errors, ose_url: '' })
                  }}
                  placeholder="https://ose.ejemplo.com/api/enviar"
                  style={{ fontSize: '1rem' }}
                />
                {errors.ose_url && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.ose_url}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="ose_status_url" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  URL estado (opcional)
                </Label>
                <Input
                  id="ose_status_url"
                  type="url"
                  value={state.configuration.ose_status_url || ''}
                  onChange={(e) => updateConfiguration({ ose_status_url: e.target.value })}
                  placeholder="https://ose.ejemplo.com/api/estado"
                  style={{ fontSize: '1rem' }}
                />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Si no se define, se reutiliza la URL principal.
                </p>
              </div>

              <div>
                <Label htmlFor="ose_auth_tipo" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Tipo de autenticacion
                </Label>
                <Select value={authTipo} onValueChange={(value) => handleAuthTipoChange(value as 'BASIC' | 'BEARER' | 'API_KEY' | 'NONE')}>
                  <SelectTrigger id="ose_auth_tipo">
                    <SelectValue placeholder="Selecciona el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BASIC">Basic</SelectItem>
                    <SelectItem value="BEARER">Bearer token</SelectItem>
                    <SelectItem value="API_KEY">API Key</SelectItem>
                    <SelectItem value="NONE">Sin autenticacion</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authTipo === 'BASIC' && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '1rem',
                }}>
                  <div>
                    <Label htmlFor="ose_username" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Usuario {oseLabel} <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="ose_username"
                      value={state.configuration.ose_username || ''}
                      onChange={(e) => {
                        updateConfiguration({ ose_username: e.target.value })
                        setErrors({ ...errors, ose_username: '' })
                      }}
                      placeholder="usuario"
                      style={{ fontSize: '1rem' }}
                    />
                    {errors.ose_username && (
                      <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                        {errors.ose_username}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="ose_password" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Password {oseLabel} <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="ose_password"
                      type="password"
                      value={state.configuration.ose_password || ''}
                      onChange={(e) => {
                        updateConfiguration({ ose_password: e.target.value })
                        setErrors({ ...errors, ose_password: '' })
                      }}
                      placeholder="••••••••"
                      style={{ fontSize: '1rem' }}
                    />
                    {errors.ose_password && (
                      <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                        {errors.ose_password}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {authTipo === 'BEARER' && (
                <div>
                  <Label htmlFor="ose_bearer_token" style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Bearer token <span style={{ color: '#ef4444' }}>*</span>
                  </Label>
                  <Input
                    id="ose_bearer_token"
                    type="password"
                    value={state.configuration.ose_bearer_token || ''}
                    onChange={(e) => updateConfiguration({ ose_bearer_token: e.target.value })}
                    placeholder="token"
                    style={{ fontSize: '1rem' }}
                  />
                </div>
              )}

              {authTipo === 'API_KEY' && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '1rem',
                }}>
                  <div>
                    <Label htmlFor="ose_api_header" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Header API Key <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="ose_api_header"
                      value={state.configuration.ose_api_header || ''}
                      onChange={(e) => updateConfiguration({ ose_api_header: e.target.value })}
                      placeholder="x-api-key"
                      style={{ fontSize: '1rem' }}
                    />
                  </div>

                  <div>
                    <Label htmlFor="ose_api_key" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      API Key <span style={{ color: '#ef4444' }}>*</span>
                    </Label>
                    <Input
                      id="ose_api_key"
                      type="password"
                      value={state.configuration.ose_api_key || ''}
                      onChange={(e) => updateConfiguration({ ose_api_key: e.target.value })}
                      placeholder="clave"
                      style={{ fontSize: '1rem' }}
                    />
                  </div>
                </div>
              )}

              {authTipo === 'NONE' && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                  El {oseLabel} no requiere autenticacion adicional.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
