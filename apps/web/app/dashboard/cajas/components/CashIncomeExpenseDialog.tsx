import React, { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { CashDialogFrame } from './CashDialogFrame';

interface CashIncomeExpenseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    sesionId: string;
}

export function CashIncomeExpenseDialog({
    isOpen,
    onClose,
    onSuccess,
    sesionId,
}: CashIncomeExpenseDialogProps) {
    const { post } = useApi();
    const [tipo, setTipo] = useState<'INGRESO' | 'GASTO'>('INGRESO');
    const [monto, setMonto] = useState('');
    const [motivo, setMotivo] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

        try {
            setLoading(true);
            const payload = {
                tipo,
                monto: montoNum,
                motivo: motivo.trim(),
            };
            const response = await post(`/cajas/movimientos/manual/${sesionId}`, payload);
            if (response?.success) {
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
            description="Registre un movimiento extraordinario de la sesión de caja."
        >
            <form onSubmit={handleSubmit} className="w-full text-left">

                                {error && (
                                    <div className="mb-4 bg-destructive/10 border-l-4 border-red-400 p-4">
                                        <p className="text-sm text-destructive">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground/85">Tipo</label>
                                        <select
                                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-border focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                            value={tipo}
                                            onChange={(e) => setTipo(e.target.value as 'INGRESO' | 'GASTO')}
                                        >
                                            <option value="INGRESO">Ingreso</option>
                                            <option value="GASTO">Gasto</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-foreground/85">Monto</label>
                                        <div className="mt-1 relative rounded-md shadow-sm">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-muted-foreground sm:text-sm">S/</span>
                                            </div>
                                            <input
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
                                        <label className="block text-sm font-medium text-foreground/85">Motivo</label>
                                        <textarea
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
