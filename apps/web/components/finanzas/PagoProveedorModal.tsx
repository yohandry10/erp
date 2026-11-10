'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
import { useCountryContext } from '@/hooks/use-country-context';
import { fiscalDateForCountry } from '@/lib/fiscal-date';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/use-permission';
import { confirmCxpPayment, readCxpPaymentIntent, type CxpPaymentIntent } from '@/lib/finanzas/cxp-payment-contract';

interface CuentaBancaria {
  id: string;
  tenant_id: string;
  banco: string;
  numero_cuenta: string;
  tipo_cuenta: string;
  moneda: string;
  saldo?: number;
  saldo_actual?: number;
  activa?: boolean;
  activo?: boolean;
}

interface PagoProveedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cxpId: string;
  cxpNumero: string;
  saldoPendiente: number;
  moneda: string;
  proveedorId: string;
  total: number;
  canApply: boolean;
  onPagoSuccess: () => void;
}

export default function PagoProveedorModal({
  isOpen,
  onClose,
  cxpId,
  cxpNumero,
  saldoPendiente,
  moneda,
  proveedorId,
  total,
  canApply,
  onPagoSuccess,
}: PagoProveedorModalProps) {
  const { get, post } = useApi({ requireLive: true, showErrorToast: false, throwOnError: true, retries: 0, timeoutMs: 12000 });
  const { session, loading: authLoading } = useAuth();
  const { hasPermission: canPay, loading: permissionLoading } = usePermission('finanzas', 'create', 'pagos');
  const tenantId = session?.user?.tenant_id || '';
  const actorId = session?.user?.id || '';
  const scope = `${tenantId}.${actorId}.${cxpId}`;
  const storageKey = `erp.cxp-payment.pending.${scope}`;
  const [pending, setPending] = useState<CxpPaymentIntent | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [ready, setReady] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const open = isOpen || recoveryOpen;
  const revision = useRef(0);
  const sending = useRef(false);
  const activeScope = useRef('');
  activeScope.current = !authLoading && !permissionLoading && canPay ? scope : '';
  const { formatCurrency: formatLocalizedCurrency } = useLocalizedMoney();
  const country = useCountryContext();
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [monto, setMonto] = useState<string>('');
  const [fechaPago, setFechaPago] = useState<string>(
    fiscalDateForCountry(country.paisCodigo)
  );
  const [metodoPago, setMetodoPago] = useState<string>('TRANSFERENCIA');
  const [cuentaBancariaId, setCuentaBancariaId] = useState<string>('');
  const [referencia, setReferencia] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  const getSaldoCuenta = (cuenta: CuentaBancaria) => Number(cuenta.saldo ?? cuenta.saldo_actual ?? 0);

  const loadCuentasBancarias = useCallback(async () => {
    const context = activeScope.current;
    const generation = revision.current;
    setLoading(true);
    setError(null);
    setCuentasBancarias([]);
    try {
      const data = await get('/api/finanzas/bancos/cuentas');
      if (data?.success !== true || data.offline || data.cached || data.pending || data.queued || !Array.isArray(data.data)
        || new Set(data.data.map((cuenta: CuentaBancaria) => cuenta.id)).size !== data.data.length
        || data.data.some((cuenta: CuentaBancaria) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cuenta.id || '')
          || cuenta.tenant_id !== tenantId || typeof cuenta.banco !== 'string' || !cuenta.banco.trim()
          || typeof cuenta.numero_cuenta !== 'string' || !cuenta.numero_cuenta.trim() || !/^[A-Z]{3}$/.test(cuenta.moneda || '')
          || typeof (cuenta.activa ?? cuenta.activo) !== 'boolean'
          || !Number.isFinite(cuenta.saldo ?? cuenta.saldo_actual))) throw new Error('Catálogo bancario incompleto');
      const cuentas = data.data.filter(
        (cuenta: CuentaBancaria) =>
          (cuenta.activa === true || cuenta.activo === true) && cuenta.moneda === moneda
      );
      if (activeScope.current !== context || revision.current !== generation) return;
      setCuentasBancarias(cuentas);

      // Auto-select first account if available
      setCuentaBancariaId((prev) => (cuentas.some((cuenta: CuentaBancaria) => cuenta.id === prev) ? prev : cuentas[0]?.id || ''));
    } catch (err) {
      if (activeScope.current === context && revision.current === generation) setError('Error al cargar las cuentas bancarias. Reintenta la consulta.');
    } finally {
      if (activeScope.current === context && revision.current === generation) setLoading(false);
    }
  }, [get, moneda, tenantId]);

  useEffect(() => {
    revision.current++; sending.current = false; setSubmitting(false); setPending(null); setRecoveryError(null); setReady(''); setRecoveryOpen(false);
    setCuentasBancarias([]); setCuentaBancariaId(''); setError(null);
    if (!tenantId || !actorId || authLoading || permissionLoading || !canPay) return;
    try { setPending(readCxpPaymentIntent(localStorage.getItem(storageKey), tenantId, actorId, cxpId)); }
    catch { setRecoveryError('No se pudo recuperar el pago pendiente. La intención se conserva; no se puede registrar otro pago.'); }
    setReady(scope);
    return () => { revision.current++; activeScope.current = ''; };
  }, [scope, storageKey, tenantId, actorId, cxpId, authLoading, permissionLoading, canPay]);

  useEffect(() => {
    if (!open || ready !== scope) return;
    revision.current++;
    let intent: CxpPaymentIntent | null = null;
    try { intent = readCxpPaymentIntent(localStorage.getItem(storageKey), tenantId, actorId, cxpId); setPending(intent); }
    catch { setRecoveryError('No se pudo recuperar el pago pendiente. La intención se conserva; no se puede registrar otro pago.'); }
    setMonto(intent ? intent.payload.monto.toString() : saldoPendiente.toString());
    setFechaPago(intent?.payload.fecha_pago || fiscalDateForCountry(country.paisCodigo));
    setMetodoPago(intent?.payload.metodo_pago || 'TRANSFERENCIA');
    setCuentaBancariaId(intent?.payload.cuenta_bancaria_id || '');
    setReferencia(intent?.payload.referencia || ''); setObservaciones(intent?.payload.observaciones || ''); setError(null);
    if (!intent) void loadCuentasBancarias();
    return () => { revision.current++; };
  }, [open, ready, scope, storageKey, tenantId, actorId, cxpId, saldoPendiente, country.paisCodigo, loadCuentasBancarias]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current || ready !== scope || activeScope.current !== scope || recoveryError || !canPay || !pending && !canApply) return;
    setError(null);

    // Validations
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }

    if (!pending && montoNum > saldoPendiente) {
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

    const requiereBanco = metodoPago !== 'EFECTIVO';
    if (requiereBanco && !cuentaBancariaId) {
      setError('Seleccione una cuenta bancaria para el medio de pago elegido');
      return;
    }
    if (requiereBanco && !referencia.trim()) {
      setError('Ingrese la referencia de la operacion bancaria');
      return;
    }

    // Check if selected account has sufficient balance for a bank-backed payment.
    if (!pending && requiereBanco && cuentaBancariaId) {
      const cuentaSeleccionada = cuentasBancarias.find((cuenta) => cuenta.id === cuentaBancariaId);
      if (!cuentaSeleccionada) { setError('Seleccione una cuenta bancaria actual y activa.'); return; }
      const saldoCuenta = cuentaSeleccionada ? getSaldoCuenta(cuentaSeleccionada) : 0;
      if (cuentaSeleccionada && saldoCuenta < montoNum) {
        setError(`La cuenta seleccionada no tiene saldo suficiente (Saldo: ${formatCurrency(saldoCuenta)})`);
        return;
      }
    }

    setSubmitting(true);
    sending.current = true;
    const context = scope;
    const generation = revision.current;

    try {
      const payload: CxpPaymentIntent['payload'] = {
        monto: montoNum,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        idempotency_key: pending?.payload.idempotency_key || `cxp-pago:${cxpId}:${crypto.randomUUID()}`,
      };

      if (requiereBanco && cuentaBancariaId) {
        payload.cuenta_bancaria_id = cuentaBancariaId;
      }

      if (referencia.trim()) {
        payload.referencia = referencia.trim();
      }

      if (observaciones.trim()) {
        payload.observaciones = observaciones.trim();
      }

      const intent = pending || { tenantId, actorId, cxpId, number: cxpNumero, currency: moneda, providerId: proveedorId, total, payload };
      readCxpPaymentIntent(JSON.stringify(intent), tenantId, actorId, cxpId);
      const stored = readCxpPaymentIntent(localStorage.getItem(storageKey), tenantId, actorId, cxpId);
      if (stored && JSON.stringify(stored) !== JSON.stringify(intent)) throw new Error('Hay otro pago pendiente. Su intención se conserva.');
      if (intent.number !== cxpNumero || intent.currency !== moneda || intent.providerId !== proveedorId || intent.total !== total) throw new Error('El documento cambió. Se conserva el pago pendiente para revisar su contexto.');
      // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
      // codeql[js/clear-text-storage-of-sensitive-data]
      localStorage.setItem(storageKey, JSON.stringify(intent)); setPending(intent);
      const response = await post(`/api/finanzas/cxp/${cxpId}/aplicar-pago`, intent.payload);
      if (activeScope.current !== context || revision.current !== generation) return;
      confirmCxpPayment(response, intent);
      if (JSON.stringify(readCxpPaymentIntent(localStorage.getItem(storageKey), tenantId, actorId, cxpId)) !== JSON.stringify(intent)) throw new Error('La intención del pago cambió. Se conserva el resultado para su recuperación.');
      localStorage.removeItem(storageKey); setPending(null);
      sending.current = false; setSubmitting(false);
      handleClose();
      onPagoSuccess();
    } catch (err: any) {
      if (activeScope.current === context && revision.current === generation) setError(err.message || 'El pago no está confirmado. Reintenta la misma operación.');
    } finally {
      if (activeScope.current === context && revision.current === generation) { setSubmitting(false); sending.current = false; }
    }
  };

  const handleClose = () => {
    if (sending.current) return;
    revision.current++;
    setRecoveryOpen(false);
    setMonto('');
    setFechaPago(fiscalDateForCountry(country.paisCodigo));
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

  const requiresCuentaBancaria = metodoPago !== 'EFECTIVO';
  const frozen = submitting || !!pending || !!recoveryError;
  if (authLoading || permissionLoading || !canPay || ready !== scope) return null;

  return (
    <>
    {(pending || recoveryError) && <Button type="button" variant="outline" onClick={() => setRecoveryOpen(true)}>Revisar pago pendiente</Button>}
    <Dialog open={open} onOpenChange={(open) => {
      if (!open && !submitting) handleClose();
    }}>
      <DialogContent className="min-w-0 max-w-2xl max-h-[90dvh] overflow-y-auto [&>*]:min-w-0">
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
        {pending && <p role="status">Hay un pago pendiente de confirmación. Se conservan los datos y la misma clave para recuperar su resultado.</p>}
        {recoveryError && <p role="alert">{recoveryError}</p>}

        {/* Saldo Info */}
        <div className="bg-primary/10 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-primary">Saldo Pendiente:</span>
            <span className="text-xl font-bold text-primary">
              {formatCurrency(saldoPendiente)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
          <fieldset disabled={frozen} className="min-w-0 space-y-4">
          {/* Monto */}
          <div>
            <label htmlFor="cxp-pago-monto" className="block text-sm font-medium text-foreground/85 mb-2">
              <DollarSign className="inline h-4 w-4 mr-1" />
              Monto del Pago *
            </label>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                id="cxp-pago-monto"
                type="text"
                value={monto}
                onChange={(e) => handleMontoChange(e.target.value)}
                placeholder="0.00"
                className="min-w-0 w-full flex-1 px-4 py-2 text-base border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={setPagoCompleto}
                className="min-h-11 shrink-0 whitespace-nowrap"
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
                  {pending ? `Cuenta del pago pendiente: ${pending.payload.cuenta_bancaria_id}` : `No hay cuentas bancarias activas en ${moneda}. Registre o active una cuenta para usar este medio.`}
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
              Número de Referencia {requiresCuentaBancaria && '*'}
            </label>
            <input
              id="cxp-pago-referencia"
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej: OP-2025-001234, Cheque #12345"
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required={requiresCuentaBancaria}
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

          </fieldset>
          {!pending && requiresCuentaBancaria && !loading && cuentasBancarias.length === 0 && <Button type="button" variant="outline" onClick={() => void loadCuentasBancarias()}>Reintentar cuentas bancarias</Button>}
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
                disabled={submitting || !!recoveryError || !pending && (loading || !canApply || requiresCuentaBancaria && !cuentasBancarias.length)}
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
                    {pending ? 'Reintentar pago pendiente' : 'Aplicar Pago'}
                  </>
                )}
              </Button>
            </ProtectedComponent>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
