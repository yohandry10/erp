'use client'

import { User, Building2, Mail, Phone, MapPin, FileText } from 'lucide-react'
import { Cliente, TipoCliente } from '@/types/ventas'

interface ClienteCardProps {
  cliente: Cliente
  showDetails?: boolean
}

export default function ClienteCard({
  cliente,
  showDetails = true
}: ClienteCardProps) {
  const isEmpresa = cliente.tipo === TipoCliente.EMPRESA

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {isEmpresa ? (
            <Building2 className="w-10 h-10 text-blue-600" />
          ) : (
            <User className="w-10 h-10 text-blue-600" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-lg truncate">
                {cliente.razon_social}
              </h3>
              {cliente.nombre_comercial && (
                <p className="text-sm text-gray-600 truncate">
                  {cliente.nombre_comercial}
                </p>
              )}
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex-shrink-0">
              {isEmpresa ? 'Empresa' : 'Persona'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
            <FileText className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{cliente.documento_tipo}:</span>
            <span>{cliente.documento_numero}</span>
          </div>

          {showDetails && (
            <div className="space-y-2 pt-3 border-t border-gray-100">
              {cliente.direccion && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">{cliente.direccion}</span>
                </div>
              )}
              
              {cliente.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <a
                    href={`mailto:${cliente.email}`}
                    className="hover:text-blue-600 transition-colors"
                  >
                    {cliente.email}
                  </a>
                </div>
              )}
              
              {cliente.telefono && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  <a
                    href={`tel:${cliente.telefono}`}
                    className="hover:text-blue-600 transition-colors"
                  >
                    {cliente.telefono}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
