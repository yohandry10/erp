'use client'

import { useState } from 'react'
import { useWizardContext } from '../WizardContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AlertCircle } from 'lucide-react'

export function SunatConfigStep() {
  const { state, updateConfiguration } = useWizardContext()
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
        <span style={{ fontSize: '1.5rem' }}>🏛️</span>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-700)',
          margin: 0,
        }}>
          Configure la conexión con el Operador de Servicios Electrónicos (OSE)
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Conexión con SUNAT */}
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
            🏛️ Conexión con SUNAT
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
                {state.configuration.ose_activo ? 'Conexión Activa' : 'Desconectado - Configuración pendiente'}
              </p>
              <p style={{
                fontSize: '0.875rem',
                color: '#92400e',
                margin: '0.25rem 0 0 0',
              }}>
                Configure los datos del OSE y active la conexión para enviar comprobantes electrónicos vía OSE
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <Label htmlFor="ose_url" style={{ marginBottom: '0.5rem', display: 'block' }}>
                URL OSE {state.configuration.ose_activo && <span style={{ color: '#ef4444' }}>*</span>}
              </Label>
              <Input
                id="ose_url"
                type="url"
                value={state.configuration.ose_url || ''}
                onChange={(e) => {
                  updateConfiguration({ ose_url: e.target.value })
                  setErrors({ ...errors, ose_url: '' })
                }}
                placeholder="https://ose.ejemplo.com/api"
                disabled={!state.configuration.ose_activo}
                style={{ fontSize: '1rem' }}
              />
              {errors.ose_url && (
                <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                  {errors.ose_url}
                </p>
              )}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
            }}>
              <div>
                <Label htmlFor="ose_username" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Usuario OSE {state.configuration.ose_activo && <span style={{ color: '#ef4444' }}>*</span>}
                </Label>
                <Input
                  id="ose_username"
                  value={state.configuration.ose_username || ''}
                  onChange={(e) => {
                    updateConfiguration({ ose_username: e.target.value })
                    setErrors({ ...errors, ose_username: '' })
                  }}
                  placeholder="usuario"
                  disabled={!state.configuration.ose_activo}
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
                  Contraseña OSE {state.configuration.ose_activo && <span style={{ color: '#ef4444' }}>*</span>}
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
                  disabled={!state.configuration.ose_activo}
                  style={{ fontSize: '1rem' }}
                />
                {errors.ose_password && (
                  <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                    {errors.ose_password}
                  </p>
                )}
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
            }}>
              <div>
                <Label htmlFor="ose_activo" style={{ fontSize: '1rem', fontWeight: '500', display: 'block' }}>
                  Estado Conexión
                </Label>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  margin: '0.25rem 0 0 0',
                }}>
                  Activar conexión OSE para envío de comprobantes
                </p>
              </div>
              <Switch
                id="ose_activo"
                checked={state.configuration.ose_activo || false}
                onCheckedChange={(checked) => updateConfiguration({ ose_activo: checked })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
