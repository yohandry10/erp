'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Cliente } from '@/types/ventas'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Plus, X, ChevronDown } from 'lucide-react'
import ClienteQuickCreate from './ClienteQuickCreate'
import { useCountryContext } from '@/hooks/use-country-context'
import { unwrapApiArray } from '@/lib/api-contract'

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
  const country = useCountryContext()
  const [searchTerm, setSearchTerm] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  const loadClienteById = useCallback(async (clienteId: string) => {
    try {
      const response = await get(`/api/ventas/clientes/${clienteId}`)
      if (response?.success && response.data) {
        setSelectedCliente(response.data)
      }
    } catch (error) {
      console.error('Error loading cliente:', error)
    }
  }, [get])

  const loadAllClientes = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/api/ventas/clientes?limit=100')
      setClientes(unwrapApiArray<Cliente>(response))
    } catch (error) {
      console.error('❌ [ClienteSelector] Error loading clientes:', error)
      setClientes([])
    } finally {
      setLoading(false)
    }
  }, [get])

  const searchClientes = useCallback(async (search: string) => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/clientes?search=${encodeURIComponent(search)}&limit=10`)
      // ClientesService devuelve { data, pagination } sin `success`; otros
      // despliegues pueden envolverlo como { success, data }. Normalizar ambos
      // contratos evita que una búsqueda válida deje el selector vacío.
      setClientes(unwrapApiArray<Cliente>(response))
      setIsOpen(true)
    } catch (error) {
      console.error('Error searching clientes:', error)
      setClientes([])
    } finally {
      setLoading(false)
    }
  }, [get])

  // Load selected cliente on mount if value is provided
  useEffect(() => {
    if (value && (!selectedCliente || selectedCliente.id !== value)) {
      loadClienteById(value)
    }
  }, [loadClienteById, selectedCliente, value])

  // Load all clientes on mount
  useEffect(() => {
    loadAllClientes()
  }, [loadAllClientes])

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
  }, [clientes.length, loadAllClientes, searchClientes, searchTerm])

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
    <div className="relative" ref={dropdownRef}>
      {/* Selected Cliente Display */}
      {selectedCliente ? (
        <div className="flex items-center justify-between p-4 bg-card/90 transition">
          <div className="flex-[1]">
            <p className="text-[0.95rem] font-semibold text-[var(--primary-800)] mt-0 mr-0 mb-1 ml-0">
              {selectedCliente.razon_social}
            </p>
            <p className="text-[0.8rem] text-[var(--primary-500)] m-0">
              {selectedCliente.documento_tipo}: {selectedCliente.documento_numero}
            </p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClearSelection} className="ml-3 p-2 bg-transparent border-0 cursor-pointer text-[var(--primary-500)] transition flex items-center justify-center"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--primary-100)'
                e.currentTarget.style.color = 'var(--primary-700)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--primary-500)'
              }}
            >
              <X className="w-[1.125rem] h-[1.125rem]" />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-4 top-[50%] -translate-y-1/2 text-[var(--primary-400)] w-5 h-5" />
            <input aria-label="Buscar"
              type="text"
              placeholder={`Buscar por ${country.paisCodigo === 'AR' ? 'CUIT/DNI' : country.paisCodigo === 'CO' ? 'NIT/CC' : 'RUC/DNI'} o nombre...`}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              disabled={disabled} className="w-[100%] pt-4 pr-12 pb-4 pl-12 text-base transition bg-card/90 text-[var(--primary-800)]"
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
              <div className="absolute right-4 top-[50%] -translate-y-1/2">
                <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary w-5 h-5 rounded-full"></div>
              </div>
            )}
            {!loading && searchTerm && (
              <ChevronDown className="absolute right-4 top-[50%] -translate-y-1/2 text-[var(--primary-400)] w-5 h-5" />
            )}
          </div>

          {/* Dropdown */}
          {isOpen && clientes.length > 0 && (
            <div className="absolute z-[50] w-[100%] mt-2 bg-card border shadow max-h-[20rem] overflow-y-auto">
              {clientes.map((cliente) => (
                <button
                  key={cliente.id}
                  type="button"
                  onClick={() => handleSelectCliente(cliente)} className="w-[100%] text-left p-4 bg-transparent border-0 border-b cursor-pointer transition"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--primary-50)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <p className="text-[0.95rem] font-semibold text-[var(--primary-800)] mt-0 mr-0 mb-1 ml-0">
                    {cliente.razon_social}
                  </p>
                  <p className="text-[0.8rem] text-[var(--primary-500)] m-0">
                    {cliente.documento_tipo}: {cliente.documento_numero}
                    {cliente.nombre_comercial && ` • ${cliente.nombre_comercial}`}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {isOpen && !loading && searchTerm.length >= 2 && clientes.length === 0 && (
            <div className="absolute z-[50] w-[100%] mt-2 bg-card border shadow p-6 text-center">
              <p className="text-[0.875rem] text-[var(--primary-600)] m-0">
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
          disabled={disabled} className="mt-3 w-[100%] py-3 px-4 bg-card text-[var(--primary-700)] text-[0.875rem] font-semibold transition flex items-center justify-center gap-2"
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
          <Plus className="w-4 h-4" />
          Nuevo Cliente (rápido)
        </button>
      )}

      {/* Error Message */}
      {error && (
        <p className="mt-2 text-[0.875rem] text-[var(--red-600)] font-medium">{error}</p>
      )}

      {/* Helper Text */}
      {!selectedCliente && !error && (
        <p className="mt-2 text-[0.8rem] text-[var(--primary-500)] font-medium">
          Haz clic para ver todos los clientes o escribe para buscar
        </p>
      )}
    </div>
  )
}
