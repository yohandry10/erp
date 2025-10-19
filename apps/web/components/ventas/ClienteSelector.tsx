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

  // Search clientes with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchTerm.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        searchClientes(searchTerm)
      }, 300)
    } else if (searchTerm.length === 0) {
      setClientes([])
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
        <div className={`flex items-center justify-between p-3 border rounded-md bg-white ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">
              {selectedCliente.razon_social}
            </p>
            <p className="text-xs text-gray-500">
              {selectedCliente.documento_tipo}: {selectedCliente.documento_numero}
            </p>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="ml-2"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Buscar por RUC, DNI o nombre..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                if (clientes.length > 0) {
                  setIsOpen(true)
                }
              }}
              disabled={disabled}
              className={`pl-10 pr-10 ${error ? 'border-red-500' : ''}`}
            />
            {loading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
            {!loading && searchTerm && (
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            )}
          </div>

          {/* Dropdown */}
          {isOpen && clientes.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {clientes.map((cliente) => (
                <button
                  key={cliente.id}
                  type="button"
                  onClick={() => handleSelectCliente(cliente)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {cliente.razon_social}
                  </p>
                  <p className="text-xs text-gray-500">
                    {cliente.documento_tipo}: {cliente.documento_numero}
                    {cliente.nombre_comercial && ` • ${cliente.nombre_comercial}`}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* No Results */}
          {isOpen && !loading && searchTerm.length >= 2 && clientes.length === 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4">
              <p className="text-sm text-gray-600 text-center">
                No se encontraron clientes
              </p>
            </div>
          )}
        </>
      )}

      {/* Create New Button */}
      {onCreateNew && !selectedCliente && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCreateNew}
          disabled={disabled}
          className="mt-2 w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Cliente (rápido)
        </Button>
      )}

      {/* Error Message */}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* Helper Text */}
      {!selectedCliente && !error && (
        <p className="mt-1 text-xs text-gray-500">
          Escribe al menos 2 caracteres para buscar
        </p>
      )}
    </div>
  )
}
