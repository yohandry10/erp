import { 
  CreditCard, 
  Eye, 
  Edit, 
  Building2,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  tipo_cuenta: string
  moneda: string
  saldo: number
  permite_sobregiro: boolean
  activa: boolean
}

interface CuentaBancariaCardProps {
  cuenta: CuentaBancaria
  onView: () => void
  onEdit: () => void
}

const TIPO_CUENTA_LABELS: Record<string, string> = {
  CORRIENTE: 'Corriente',
  AHORROS: 'Ahorros',
  DETRACCION: 'Detracción',
  PLAZO_FIJO: 'Plazo Fijo',
}

const TIPO_CUENTA_COLORS: Record<string, string> = {
  CORRIENTE: '#3b82f6',
  AHORROS: '#10b981',
  DETRACCION: '#f59e0b',
  PLAZO_FIJO: '#8b5cf6',
}

export default function CuentaBancariaCard({ cuenta, onView, onEdit }: CuentaBancariaCardProps) {
  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : moneda === 'EUR' ? 'EUR' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const tipoCuentaColor = TIPO_CUENTA_COLORS[cuenta.tipo_cuenta] || '#6b7280'
  const saldoColor = cuenta.saldo >= 0 ? '#10b981' : '#ef4444'

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Header con tipo de cuenta */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: tipoCuentaColor
      }} />

      {/* Estado activa/inactiva */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CreditCard size={20} style={{ color: tipoCuentaColor }} />
          <span style={{
            fontSize: '0.75rem',
            fontWeight: '600',
            color: tipoCuentaColor,
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            {TIPO_CUENTA_LABELS[cuenta.tipo_cuenta] || cuenta.tipo_cuenta}
          </span>
        </div>
        
        {cuenta.activa ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.625rem',
            fontWeight: '600',
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#10b981'
          }}>
            <CheckCircle size={12} />
            ACTIVA
          </span>
        ) : (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.625rem',
            fontWeight: '600',
            background: 'rgba(107, 114, 128, 0.1)',
            color: '#6b7280'
          }}>
            <XCircle size={12} />
            INACTIVA
          </span>
        )}
      </div>

      {/* Nombre de la cuenta */}
      <h3 style={{
        fontSize: '1.125rem',
        fontWeight: '700',
        color: '#111827',
        marginBottom: '0.5rem',
        lineHeight: '1.4'
      }}>
        {cuenta.nombre}
      </h3>

      {/* Banco */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem'
      }}>
        <Building2 size={16} style={{ color: '#6b7280' }} />
        <span style={{
          fontSize: '0.875rem',
          color: '#6b7280',
          fontWeight: '500'
        }}>
          {cuenta.banco}
        </span>
      </div>

      {/* Número de cuenta */}
      <div style={{
        background: '#f9fafb',
        padding: '0.75rem',
        borderRadius: '8px',
        marginBottom: '1rem'
      }}>
        <div style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          marginBottom: '0.25rem',
          fontWeight: '500'
        }}>
          Número de Cuenta
        </div>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: '600',
          color: '#111827',
          fontFamily: 'monospace',
          letterSpacing: '0.05em'
        }}>
          {cuenta.numero_cuenta}
        </div>
      </div>

      {/* Saldo */}
      <div style={{
        background: cuenta.saldo >= 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        border: `1px solid ${cuenta.saldo >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              marginBottom: '0.25rem',
              fontWeight: '500'
            }}>
              Saldo Disponible
            </div>
            <div style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              color: saldoColor,
              lineHeight: '1'
            }}>
              {formatCurrency(cuenta.saldo, cuenta.moneda)}
            </div>
          </div>
          <DollarSign size={32} style={{ color: saldoColor, opacity: 0.3 }} />
        </div>
      </div>

      {/* Permite sobregiro */}
      {cuenta.permite_sobregiro && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem',
          background: 'rgba(245, 158, 11, 0.1)',
          borderRadius: '6px',
          marginBottom: '1rem'
        }}>
          <AlertCircle size={14} style={{ color: '#f59e0b' }} />
          <span style={{
            fontSize: '0.75rem',
            color: '#f59e0b',
            fontWeight: '500'
          }}>
            Permite sobregiro
          </span>
        </div>
      )}

      {/* Acciones */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e5e7eb'
      }}>
        <button
          onClick={onView}
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            color: '#374151',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f9fafb'
            e.currentTarget.style.borderColor = '#9ca3af'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white'
            e.currentTarget.style.borderColor = '#d1d5db'
          }}
        >
          <Eye size={16} />
          Ver Movimientos
        </button>
        <button
          onClick={onEdit}
          style={{
            flex: 1,
            padding: '0.75rem',
            borderRadius: '8px',
            border: 'none',
            background: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2563eb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#3b82f6'
          }}
        >
          <Edit size={16} />
          Editar
        </button>
      </div>
    </div>
  )
}
