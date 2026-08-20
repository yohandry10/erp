import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { CashDialogFrame } from './CashDialogFrame';
import { useCountryContext } from '@/hooks/use-country-context';

interface CashIncomeExpenseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    sesionId: string;
}

interface AccountingOption {
    id: string;
    codigo: string;
    nombre: string;
    aplicable_a?: { gasto?: boolean; ingreso?: boolean };
}

export function CashIncomeExpenseDialog({
    isOpen,
    onClose,
    onSuccess,
    sesionId,
}: CashIncomeExpenseDialogProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    const { get, post } = useApi();
    const [tipo, setTipo] = useState<'INGRESO' | 'GASTO'>('INGRESO');
    const [monto, setMonto] = useState('');
    const [motivo, setMotivo] = useState('');
    const [cuentaContrapartidaId, setCuentaContrapartidaId] = useState('');
    const [cuentas, setCuentas] = useState<AccountingOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const idempotencyKey = useRef('');

    const nextKey = useCallback(() => {
        if (!idempotencyKey.current) {
            idempotencyKey.current = `cash-manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        return idempotencyKey.current;
    }, []);

    useEffect(() => {
        idempotencyKey.current = '';
    }, [tipo, monto, motivo, cuentaContrapartidaId]);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        idempotencyKey.current = '';
        setError(null);
        get('/cajas/opciones-contables').then((response) => {
            if (!active) return;
            if (response?.success) {
                setCuentas(response.data?.cuentas || []);
            } else {
                setError('No se pudieron cargar las contrapartidas contables');
            }
        }).catch(() => {
            if (active) setError('No se pudieron cargar las contrapartidas contables');
        });
        return () => { active = false; };
    }, [get, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const montoNum = parseFloat(monto);
        if (!montoNum || montoNum <= 0) {
            setError('Ingrese un monto válido');
            return;
        }
        if (!motivo.trim()) {
            setError('Debe ingresar un motivo');
            return;
        }
        if (!cuentaContrapartidaId) {
            setError(`Seleccione la cuenta de ${tipo === 'INGRESO' ? 'ingreso' : 'gasto'}`);
            return;
        }

        try {
            setLoading(true);
            const payload = {
                tipo,
                monto: montoNum,
                motivo: motivo.trim(),
                cuenta_contrapartida_id: cuentaContrapartidaId,
            };
            const response = await post(`/cajas/movimientos/manual/${sesionId}`, payload, {
                headers: { 'Idempotency-Key': nextKey() },
            });
            if (response?.success) {
                idempotencyKey.current = '';
                onSuccess();
                onClose();
            } else {
                throw new Error(response?.message || 'Error registrando movimiento');
            }
        } catch (err: any) {
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
            title="Ingreso o gasto"
            description="Registre el efectivo y su contrapartida contable en una sola operación."
        >
            <form onSubmit={handleSubmit} className="w-full text-left">

                                {error && (
                                    <div className="mb-4 bg-destructive/10 border-l-4 border-red-400 p-4">
                                        <p className="text-sm text-destructive">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="cashincomeexpensedialog-tipo" className="block text-sm font-medium text-foreground/85">Tipo</label>
                                        <select id="cashincomeexpensedialog-tipo"
                                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-border focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                            value={tipo}
                                            onChange={(e) => {
                                                setTipo(e.target.value as 'INGRESO' | 'GASTO');
                                                setCuentaContrapartidaId('');
                                            }}
                                        >
                                            <option value="INGRESO">Ingreso</option>
                                            <option value="GASTO">Gasto</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-foreground/85">Monto</label>
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
                                        <label className="block text-sm font-medium text-foreground/85">
                                            Contrapartida contable
                                        </label>
                                        <select
                                            aria-label="Contrapartida contable del movimiento"
                                            className="mt-1 block w-full rounded-md border border-border p-2 text-sm"
                                            value={cuentaContrapartidaId}
                                            onChange={(e) => setCuentaContrapartidaId(e.target.value)}
                                        >
                                            <option value="">Seleccione una cuenta...</option>
                                            {cuentas
                                                .filter((cuenta) => tipo === 'INGRESO'
                                                    ? cuenta.aplicable_a?.ingreso
                                                    : cuenta.aplicable_a?.gasto)
                                                .map((cuenta) => (
                                                    <option key={cuenta.id} value={cuenta.id}>
                                                        {cuenta.codigo} · {cuenta.nombre}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="cashincomeexpensedialog-motivo" className="block text-sm font-medium text-foreground/85">Motivo</label>
                                        <textarea id="cashincomeexpensedialog-motivo"
                                            rows={3}
                                            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 mt-1 block w-full sm:text-sm border border-border rounded-md"
                                            placeholder="Detalle del ingreso/gasto..."
                                            value={motivo}
                                            onChange={(e) => setMotivo(e.target.value)}
                                        />
                                    </div>
                                </div>
                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                            >
                                {loading ? 'Procesando...' : 'Registrar'}
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
