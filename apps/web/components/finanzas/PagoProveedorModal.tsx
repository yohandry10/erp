'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ProtectedComponent } from '@/components/auth/ProtectedComponent';
import { Button } from '@/components/ui/button';
import { DollarSign, Calendar, CreditCard, Building2, FileText } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useLocalizedMoney } from '@/hooks/use-localized-money';

interface CuentaBancaria {
  id: string;
  banco: string;
  numero_cuenta: string;
  tipo_cuenta: string;
  moneda: string;
  saldo?: number;
  saldo_actual?: number;
  activo: boolean;
}

interface PagoProveedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cxpId: string;
  cxpNumero: string;
  saldoPendiente: number;
  moneda: string;
  onPagoSuccess: () => void;
}

export default function PagoProveedorModal({
  isOpen,
  onClose,
  cxpId,
  cxpNumero,
  saldoPendiente,
  moneda,
  onPagoSuccess,
}: PagoProveedorModalProps) {
  const { get, post } = useApi({ showSuccessToast: true, throwOnError: true, retries: 1, timeoutMs: 12000 });
  const { formatCurrency: formatLocalizedCurrency } = useLocalizedMoney();
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [monto, setMonto] = useState<string>('');
  const [fechaPago, setFechaPago] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [metodoPago, setMetodoPago] = useState<string>('TRANSFERENCIA');
  const [cuentaBancariaId, setCuentaBancariaId] = useState<string>('');
  const [referencia, setReferencia] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  const getSaldoCuenta = (cuenta: CuentaBancaria) => Number(cuenta.saldo ?? cuenta.saldo_actual ?? 0);

  const loadCuentasBancarias = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get('/api/finanzas/bancos/cuentas');
      const cuentas = (data.data || []).filter(
        (cuenta: CuentaBancaria) => cuenta.activo && cuenta.moneda === moneda
      );
      setCuentasBancarias(cuentas);

      // Auto-select first account if available
      setCuentaBancariaId((prev) => (cuentas.length > 0 && !prev ? cuentas[0].id : prev));
    } catch (err) {
      console.error('Error loading cuentas bancarias:', err);
      setError('Error al cargar las cuentas bancarias');
    } finally {
      setLoading(false);
    }
  }, [get, moneda]);

  useEffect(() => {
    if (isOpen) {
      loadCuentasBancarias();
      setMonto(saldoPendiente.toString());
    }
  }, [isOpen, loadCuentasBancarias, saldoPendiente]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validations
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }

    if (montoNum > saldoPendiente) {
      setError(`El monto no puede ser mayor al saldo pendiente (${formatCurrency(saldoPendiente)})`);
      return;
    }

    if (!fechaPago) {
      setError('La fecha de pago es requerida');
      return;
    }

    if (!metodoPago) {
      setError('El método de pago es requerido');
      return;
    }

    // Check if selected account has sufficient balance for TRANSFERENCIA or CHEQUE
    if ((metodoPago === 'TRANSFERENCIA' || metodoPago === 'CHEQUE') && cuentaBancariaId) {
      const cuentaSeleccionada = cuentasBancarias.find((cuenta) => cuenta.id === cuentaBancariaId);
      const saldoCuenta = cuentaSeleccionada ? getSaldoCuenta(cuentaSeleccionada) : 0;
      if (cuentaSeleccionada && saldoCuenta < montoNum) {
        setError(`La cuenta seleccionada no tiene saldo suficiente (Saldo: ${formatCurrency(saldoCuenta)})`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload: any = {
        monto: montoNum,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        idempotency_key: `cxp-pago:${cxpId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      };

      if (cuentaBancariaId) {
        payload.cuenta_bancaria_id = cuentaBancariaId;
      }

      if (referencia.trim()) {
        payload.referencia = referencia.trim();
      }

      if (observaciones.trim()) {
        payload.observaciones = observaciones.trim();
      }

      await post(`/api/finanzas/cxp/${cxpId}/aplicar-pago`, payload);

      // Success
      onPagoSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error applying payment:', err);
      setError(err.message || 'Error al aplicar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setMonto('');
    setFechaPago(new Date().toISOString().split('T')[0]);
    setMetodoPago('TRANSFERENCIA');
    setCuentaBancariaId('');
    setReferencia('');
    setObservaciones('');
    setError(null);
    onClose();
  };

  const formatCurrency = (amount: number) => {
    return formatLocalizedCurrency(amount, moneda || 'PEN');
  };

  const handleMontoChange = (value: string) => {
    // Allow only numbers and decimal point
    const regex = /^\d*(?:\.\d{0,2})?$/;
    if (regex.test(value) || value === '') {
      setMonto(value);
    }
  };

  const setPagoCompleto = () => {
    setMonto(saldoPendiente.toString());
  };

  const requiresCuentaBancaria = metodoPago === 'TRANSFERENCIA' || metodoPago === 'CHEQUE';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !submitting) handleClose();
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Aplicar Pago a Cuenta por Pagar
          </DialogTitle>
          <DialogDescription>
            Registre el pago para la cuenta por pagar <strong>{cxpNumero}</strong>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-red-200 text-destructive px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Saldo Info */}
        <div className="bg-primary/10 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-primary">Saldo Pendiente:</span>
            <span className="text-xl font-bold text-primary">
              {formatCurrency(saldoPendiente)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Monto */}
          <div>
            <label htmlFor="cxp-pago-monto" className="block text-sm font-medium text-foreground/85 mb-2">
              <DollarSign className="inline h-4 w-4 mr-1" />
              Monto del Pago *
            </label>
            <div className="flex gap-2">
              <input
                id="cxp-pago-monto"
                type="text"
                value={monto}
                onChange={(e) => handleMontoChange(e.target.value)}
                placeholder="0.00"
                className="flex-1 px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={setPagoCompleto}
                className="whitespace-nowrap"
              >
                Pago Completo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Máximo: {formatCurrency(saldoPendiente)}
            </p>
          </div>

          {/* Fecha Pago */}
          <div>
            <label htmlFor="cxp-pago-fecha" className="block text-sm font-medium text-foreground/85 mb-2">
              <Calendar className="inline h-4 w-4 mr-1" />
              Fecha de Pago *
            </label>
            <input
              id="cxp-pago-fecha"
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Método de Pago */}
          <div>
            <label htmlFor="cxp-pago-metodo" className="block text-sm font-medium text-foreground/85 mb-2">
              <CreditCard className="inline h-4 w-4 mr-1" />
              Método de Pago *
            </label>
            <select
              id="cxp-pago-metodo"
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="TRANSFERENCIA">Transferencia Bancaria</option>
              <option value="CHEQUE">Cheque</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TARJETA">Tarjeta</option>
            </select>
          </div>

          {/* Cuenta Bancaria */}
          {requiresCuentaBancaria && (
            <div>
              <label htmlFor="cxp-pago-cuenta" className="block text-sm font-medium text-foreground/85 mb-2">
                <Building2 className="inline h-4 w-4 mr-1" />
                Cuenta Bancaria {requiresCuentaBancaria && '*'}
              </label>
              {loading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                  Cargando cuentas...
                </div>
              ) : cuentasBancarias.length === 0 ? (
                <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-200 rounded-lg p-3">
                  No hay cuentas bancarias activas en {moneda}. Puede continuar sin seleccionar una cuenta.
                </div>
              ) : (
                <select
                  id="cxp-pago-cuenta"
                  value={cuentaBancariaId}
                  onChange={(e) => setCuentaBancariaId(e.target.value)}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required={requiresCuentaBancaria}
                >
                  <option value="">Seleccione una cuenta</option>
                  {cuentasBancarias.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.banco} - {cuenta.numero_cuenta} ({cuenta.tipo_cuenta}) - Saldo: {formatCurrency(getSaldoCuenta(cuenta))}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Referencia */}
          <div>
            <label htmlFor="cxp-pago-referencia" className="block text-sm font-medium text-foreground/85 mb-2">
              <FileText className="inline h-4 w-4 mr-1" />
              Número de Referencia
            </label>
            <input
              id="cxp-pago-referencia"
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej: OP-2025-001234, Cheque #12345"
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Número de operación, cheque, etc.
            </p>
          </div>

          {/* Observaciones */}
          <div>
            <label htmlFor="cxp-pago-observaciones" className="block text-sm font-medium text-foreground/85 mb-2">
              Observaciones
            </label>
            <textarea
              id="cxp-pago-observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Observaciones adicionales sobre el pago..."
              rows={3}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <ProtectedComponent
              modulo="finanzas"
              accion="create"
              recurso="pagos"
              fallback={null}
            >
              <Button
                type="submit"
                disabled={submitting || loading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Procesando...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Aplicar Pago
                  </>
                )}
              </Button>
            </ProtectedComponent>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
