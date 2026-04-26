'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useApi } from '@/hooks/use-api'
import { Cliente } from '@/types/ventas'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Plus, X, ChevronDown } from 'lucide-react'
import ClienteQuickCreate from './ClienteQuickCreate'

interface ClienteSelectorProps {
  value?: string
  onChange: (clienteId: string, cliente?: Cliente) => void
  onCreateNew?: () => void
  disabled?: boolean
  error?: string
}

export default function ClienteSelector({
  value,
  onChange,
  onCreateNew,
  disabled = false,
  error
}: ClienteSelectorProps) {
  const { get } = useApi()
  const [searchTerm, setSearchTerm] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  // Load selected cliente on mount if value is provided
  useEffect(() => {
    if (value && !selectedCliente) {
      loadClienteById(value)
    }
  }, [value])

  // Load all clientes on mount
  useEffect(() => {
    loadAllClientes()
  }, [])

  // Search clientes with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchTerm.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchClientes(searchTerm)
      }, 300)
    } else if (searchTerm.length === 0 && clientes.length === 0) {
      // Reload all clientes if search is cleared and list is empty
      loadAllClientes()
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchTerm])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadClienteById = async (clienteId: string) => {
    try {
      const response = await get(`/api/ventas/clientes/${clienteId}`)
      if (response?.success && response.data) {
        setSelectedCliente(response.data)
      }
    } catch (error) {
      console.error('Error loading cliente:', error)
    }
  }

  const loadAllClientes = async () => {
    try {
      setLoading(true)
      console.log('🔍 [ClienteSelector] Cargando todos los clientes...')
      const response = await get('/api/ventas/clientes?limit=100')
      
      console.log('📦 [ClienteSelector] Respuesta recibida:', response)
      
      // Si response es null, probablemente no hay token
      if (response === null) {
        console.error('❌ [ClienteSelector] No se recibió respuesta - probablemente no hay token de autenticación')
        setClientes([])
        return
      }
      
      if (response?.success && response?.data) {
        console.log('✅ [ClienteSelector] Clientes cargados:', response.data.length || 0)
        setClientes(response.data || [])
      } else if (Array.isArray(response?.data)) {
        // A veces la respuesta viene directamente en data sin success flag
        console.log('✅ [ClienteSelector] Clientes cargados (sin success flag):', response.data.length)
        setClientes(response.data)
      } else if (Array.isArray(response)) {
        // A veces la respuesta es directamente el array
        console.log('✅ [ClienteSelector] Clientes cargados (array directo):', response.length)
        setClientes(response)
      } else {
        console.warn('⚠️ [ClienteSelector] Respuesta sin datos válidos:', response)
        setClientes([])
      }
    } catch (error) {
      console.error('❌ [ClienteSelector] Error loading clientes:', error)
      setClientes([])
    } finally {
      setLoading(false)
    }
  }

  const searchClientes = async (search: string) => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/clientes?search=${encodeURIComponent(search)}&limit=10`)
      
      if (response?.success) {
        setClientes(response.data || [])
        setIsOpen(true)
      }
    } catch (error) {
      console.error('Error searching clientes:', error)
      setClientes([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelectCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente)
    setSearchTerm('')
    setIsOpen(false)
    onChange(cliente.id, cliente)
  }

  const handleClearSelection = () => {
    setSelectedCliente(null)
    setSearchTerm('')
    onChange('')
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    if (selectedCliente) {
      setSelectedCliente(null)
      onChange('')
    }
  }

  const handleInputFocus = () => {
    if (clientes.length > 0) {
      setIsOpen(true)
    } else if (searchTerm.length === 0) {
      // Load all clientes if list is empty and no search term
      loadAllClientes()
      setIsOpen(true)
    }
  }

  const handleCreateNew = () => {
    setIsOpen(false)
    if (onCreateNew) {
      onCreateNew()
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Selected Cliente Display */}
      {selectedCliente ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem',
          border: error ? '2px solid var(--red-500)' : '2px solid var(--primary-200)',
          borderRadius: 'var(--border-radius)',
          background: 'rgba(255, 255, 255, 0.9)',
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'default',
          transition: 'all 0.3s ease'
        }}>
          <div style={{ flex: 1 }}>
            <p style={{
              fontSize: '0.95rem',
              fontWeight: '600',
              color: 'var(--primary-800)',
              margin: '0 0 0.25rem 0'
            }}>
              {selectedCliente.razon_social}
            </p>
            <p style={{
              fontSize: '0.8rem',
              color: 'var(--primary-500)',
              margin: 0
            }}>
              {selectedCliente.documento_tipo}: {selectedCliente.documento_numero}
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClearSelection}
              style={{
                marginLeft: '0.75rem',
                padding: '0.5rem',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--border-radius)',
                cursor: 'pointer',
                color: 'var(--primary-500)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--primary-100)'
                e.currentTarget.style.color = 'var(--primary-700)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--primary-500)'
              }}
            >
              <X style={{ width: '1.125rem', height: '1.125rem' }} />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Search Input */}
          <div style={{ position: 'relative' }}>
            <Search style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--primary-400)',
              width: '1.25rem',
              height: '1.25rem',
              pointerEvents: 'none'
            }} />
            <input
              type="text"
              placeholder="Buscar por RUC, DNI o nombre..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              disabled={disabled}
              style={{
                width: '100%',
                padding: '1rem 3rem 1rem 3rem',
                border: error ? '2px solid var(--red-500)' : '2px solid var(--primary-200)',
                borderRadius: 'var(--border-radius)',
                fontSize: '1rem',
                transition: 'all 0.3s ease',
                background: 'rgba(255, 255, 255, 0.9)',
                color: 'var(--primary-800)'
              }}
              onFocus={(e) => {
                if (!error) {
                  e.currentTarget.style.borderColor = 'var(--blue-500)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                  e.currentTarget.style.background = 'white'
                }
                handleInputFocus()
              }}
              onBlur={(e) => {
                if (!error) {
                  e.currentTarget.style.borderColor = 'var(--primary-200)'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)'
                }
              }}
            />
            {loading && (
              <div style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)'
              }}>
                <div className="loading-spinner" style={{
                  width: '1.25rem',
                  height: '1.25rem',
                  border: '2px solid var(--primary-200)',
                  borderTop: '2px solid var(--blue-600)',
                  borderRadius: '50%'
                }}></div>
              </div>
            )}
            {!loading && searchTerm && (
              <ChevronDown style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--primary-400)',
                width: '1.25rem',
                height: '1.25rem',
                pointerEvents: 'none'
              }} />
            )}
          </div>

          {/* Dropdown */}
          {isOpen && clientes.length > 0 && (
            <div style={{
              position: 'absolute',
              zIndex: 50,
              width: '100%',
              marginTop: '0.5rem',
              background: 'white',
              border: '1px solid var(--primary-200)',
              borderRadius: 'var(--border-radius)',
              boxShadow: 'var(--shadow-xl)',
              maxHeight: '20rem',
              overflowY: 'auto'
            }}>
              {clientes.map((cliente) => (
                <button
                  key={cliente.id}
                  type="button"
                  onClick={() => handleSelectCliente(cliente)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '1rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--primary-100)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--primary-50)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <p style={{
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    color: 'var(--primary-800)',
                    margin: '0 0 0.25rem 0'
                  }}>
                    {cliente.razon_social}
                  </p>
                  <p style={{
                    fontSize: '0.8rem',
                    color: 'var(--primary-500)',
                    margin: 0
                  }}>
                    {cliente.documento_tipo}: {cliente.documento_numero}
                    {cliente.nombre_comercial && ` • ${cliente.nombre_comercial}`}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {isOpen && !loading && searchTerm.length >= 2 && clientes.length === 0 && (
            <div style={{
              position: 'absolute',
              zIndex: 50,
              width: '100%',
              marginTop: '0.5rem',
              background: 'white',
              border: '1px solid var(--primary-200)',
              borderRadius: 'var(--border-radius)',
              boxShadow: 'var(--shadow-lg)',
              padding: '1.5rem',
              textAlign: 'center'
            }}>
              <p style={{
                fontSize: '0.875rem',
                color: 'var(--primary-600)',
                margin: 0
              }}>
                No se encontraron clientes
              </p>
            </div>
          )}
        </>
      )}

      {/* Create New Button */}
      {onCreateNew && !selectedCliente && (
        <button
          type="button"
          onClick={handleCreateNew}
          disabled={disabled}
          style={{
            marginTop: '0.75rem',
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'white',
            color: 'var(--primary-700)',
            border: '2px solid var(--primary-200)',
            borderRadius: 'var(--border-radius)',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            opacity: disabled ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.background = 'var(--primary-50)'
              e.currentTarget.style.borderColor = 'var(--primary-300)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white'
            e.currentTarget.style.borderColor = 'var(--primary-200)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <Plus style={{ width: '1rem', height: '1rem' }} />
          Nuevo Cliente (rápido)
        </button>
      )}

      {/* Error Message */}
      {error && (
        <p style={{
          marginTop: '0.5rem',
          fontSize: '0.875rem',
          color: 'var(--red-600)',
          fontWeight: '500'
        }}>{error}</p>
      )}

      {/* Helper Text */}
      {!selectedCliente && !error && (
        <p style={{
          marginTop: '0.5rem',
          fontSize: '0.8rem',
          color: 'var(--primary-500)',
          fontWeight: '500'
        }}>
          Haz clic para ver todos los clientes o escribe para buscar
        </p>
      )}
    </div>
  )
}
