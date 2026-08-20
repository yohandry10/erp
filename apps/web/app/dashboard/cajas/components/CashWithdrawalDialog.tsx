import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { CashDialogFrame } from './CashDialogFrame';
import { useCountryContext } from '@/hooks/use-country-context';

interface CashWithdrawalDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    sesionId: string;
}

interface AccountingOption {
    id: string;
    codigo: string;
    nombre: string;
    aplicable_a?: { boveda?: boolean; gasto?: boolean; ingreso?: boolean };
}

interface BankOption {
    id: string;
    banco?: string;
    nombre?: string;
    numero_cuenta?: string;
    moneda: string;
}

export function CashWithdrawalDialog({ isOpen, onClose, onSuccess, sesionId }: CashWithdrawalDialogProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    const { get, post } = useApi();
    const [monto, setMonto] = useState<string>('');
    const [motivo, setMotivo] = useState<string>('DEPOSITO_BANCARIO');
    const [detalle, setDetalle] = useState<string>('');
    const [fotoComprobante, setFotoComprobante] = useState<string>('');
    const [cuentaBancariaId, setCuentaBancariaId] = useState('');
    const [cuentaContrapartidaId, setCuentaContrapartidaId] = useState('');
    const [cuentas, setCuentas] = useState<AccountingOption[]>([]);
    const [cuentasBancarias, setCuentasBancarias] = useState<BankOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const idempotencyKey = useRef('');

    const nextKey = useCallback(() => {
        if (!idempotencyKey.current) {
            idempotencyKey.current = `cash-withdraw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        return idempotencyKey.current;
    }, []);

    useEffect(() => {
        idempotencyKey.current = '';
    }, [monto, motivo, detalle, fotoComprobante, cuentaBancariaId, cuentaContrapartidaId]);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        idempotencyKey.current = '';
        setError(null);
        get('/cajas/opciones-contables').then((response) => {
            if (!active) return;
            if (!response?.success) {
                setError('No se pudieron cargar las cuentas contables de caja');
                return;
            }
            setCuentas(response.data?.cuentas || []);
            setCuentasBancarias(response.data?.cuentas_bancarias || []);
        }).catch(() => {
            if (active) setError('No se pudieron cargar las cuentas contables de caja');
        });
        return () => { active = false; };
    }, [get, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!monto || parseFloat(monto) <= 0) {
            setError('Ingrese un monto válido');
            return;
        }

        if (motivo === 'OTRO' && !detalle.trim()) {
            setError('Debe especificar el detalle para este motivo');
            return;
        }
        if (motivo === 'DEPOSITO_BANCARIO' && !fotoComprobante.trim()) {
            setError('Debe ingresar la URL de la foto del comprobante');
            return;
        }
        if (motivo === 'DEPOSITO_BANCARIO' && !cuentaBancariaId) {
            setError('Seleccione la cuenta bancaria que recibirá el efectivo');
            return;
        }
        if (motivo !== 'DEPOSITO_BANCARIO' && !cuentaContrapartidaId) {
            setError('Seleccione la contrapartida contable del retiro');
            return;
        }

        try {
            setLoading(true);
            const payload = {
                monto: parseFloat(monto),
                motivo,
                motivo_detalle: detalle,
                foto_comprobante: fotoComprobante || undefined,
                cuenta_bancaria_id: motivo === 'DEPOSITO_BANCARIO' ? cuentaBancariaId : undefined,
                cuenta_contrapartida_id: motivo !== 'DEPOSITO_BANCARIO' ? cuentaContrapartidaId : undefined,
            };

            const response = await post(`/cajas/retiros/${sesionId}`, payload, {
                headers: { 'Idempotency-Key': nextKey() },
            });

            if (response?.success) {
                idempotencyKey.current = '';
                onSuccess();
                onClose();
            } else {
                throw new Error(response?.message || 'Error al registrar retiro');
            }
        } catch (err: any) {
            console.error('Error registrando retiro:', err);
            setError(err.message || 'Error desconocido');
        } finally {
            setLoading(false);
        }
    };

    return (
        <CashDialogFrame
            isOpen={isOpen}
            onClose={onClose}
            preventClose={loading}
            title="Retiro de efectivo"
            description="Cada salida exige un destino financiero explícito antes de descontar efectivo."
        >
            <form onSubmit={handleSubmit} className="w-full text-left">

                                {error && (
                                    <div className="mb-4 bg-destructive/10 border-l-4 border-red-400 p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <p className="text-sm text-destructive">{error}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground/85">Monto a Retirar</label>
                                        <div className="mt-1 relative rounded-md shadow-sm">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-muted-foreground sm:text-sm">{currencySymbol}</span>
                                            </div>
                                            <input aria-label="Monto"
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-border rounded-md"
                                                placeholder="0.00"
                                                value={monto}
                                                onChange={(e) => setMonto(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="cashwithdrawaldialog-motivo" className="block text-sm font-medium text-foreground/85">Motivo</label>
                                        <select id="cashwithdrawaldialog-motivo"
                                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-border focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                            value={motivo}
                                            onChange={(e) => {
                                                setMotivo(e.target.value);
                                                setCuentaBancariaId('');
                                                setCuentaContrapartidaId('');
                                            }}
                                        >
                                            <option value="DEPOSITO_BANCARIO">Depósito Bancario</option>
                                            <option value="COMPRA_EMERGENCIA">Compra de Emergencia</option>
                                            <option value="BOVEDA">Bóveda</option>
                                            <option value="OTRO">Otro</option>
                                        </select>
                                    </div>

                                    {motivo === 'DEPOSITO_BANCARIO' && (
                                        <div className="space-y-4 rounded-lg border border-border p-3">
                                            <div>
                                                <label className="block text-sm font-medium text-foreground/85">Cuenta bancaria destino</label>
                                                <select
                                                    aria-label="Cuenta bancaria destino"
                                                    className="mt-1 block w-full rounded-md border border-border p-2 text-sm"
                                                    value={cuentaBancariaId}
                                                    onChange={(e) => setCuentaBancariaId(e.target.value)}
                                                >
                                                    <option value="">Seleccione una cuenta real...</option>
                                                    {cuentasBancarias.map((cuenta) => (
                                                        <option key={cuenta.id} value={cuenta.id}>
                                                            {cuenta.banco || cuenta.nombre} · {cuenta.numero_cuenta} · {cuenta.moneda}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                            <label htmlFor="cashwithdrawaldialog-url-de-evidencia-del-deposito" className="block text-sm font-medium text-foreground/85">URL de evidencia del depósito</label>
                                            <input id="cashwithdrawaldialog-url-de-evidencia-del-deposito"
                                                type="text"
                                                className="mt-1 block w-full sm:text-sm border border-border rounded-md p-2"
                                                placeholder="https://..."
                                                value={fotoComprobante}
                                                onChange={(e) => setFotoComprobante(e.target.value)}
                                            />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                El sistema registrará Dr banco / Cr caja en el mismo commit. La conciliación con el extracto se completa luego en Bancos.
                                            </p>
                                        </div>
                                    )}

                                    {motivo !== 'DEPOSITO_BANCARIO' && (
                                        <div>
                                            <label className="block text-sm font-medium text-foreground/85">
                                                {motivo === 'BOVEDA' ? 'Cuenta de bóveda / transferencia interna' : 'Cuenta de gasto'}
                                            </label>
                                            <select
                                                aria-label="Contrapartida contable del retiro"
                                                className="mt-1 block w-full rounded-md border border-border p-2 text-sm"
                                                value={cuentaContrapartidaId}
                                                onChange={(e) => setCuentaContrapartidaId(e.target.value)}
                                            >
                                                <option value="">Seleccione la contrapartida...</option>
                                                {cuentas
                                                    .filter((cuenta) => motivo === 'BOVEDA'
                                                        ? cuenta.aplicable_a?.boveda
                                                        : cuenta.aplicable_a?.gasto)
                                                    .map((cuenta) => (
                                                        <option key={cuenta.id} value={cuenta.id}>
                                                            {cuenta.codigo} · {cuenta.nombre}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label htmlFor="cashwithdrawaldialog-detalle-observaciones" className="block text-sm font-medium text-foreground/85">Detalle / Observaciones</label>
                                        <textarea id="cashwithdrawaldialog-detalle-observaciones"
                                            rows={3}
                                            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 mt-1 block w-full sm:text-sm border border-border rounded-md"
                                            placeholder="Detalle adicional..."
                                            value={detalle}
                                            onChange={(e) => setDetalle(e.target.value)}
                                        />
                                    </div>
                                </div>
                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                            >
                                {loading ? 'Procesando...' : 'Registrar Retiro'}
                            </button>
                            <button
                                type="button"
                                className="mt-3 w-full inline-flex justify-center rounded-md border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground/85 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                                onClick={onClose}
                            >
                                Cancelar
                            </button>
                        </div>
            </form>
        </CashDialogFrame>
    );
}
