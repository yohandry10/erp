import React, { useState } from 'react';
import { useApi } from '@/hooks/use-api';

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
    const api = useApi();
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
            const response = await api.post(`/cajas/movimientos/manual/${sesionId}`, payload);
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                    <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={onClose}></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <form onSubmit={handleSubmit} className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 border-b pb-2">
                                    Ingreso / Gasto
                                </h3>

                                {error && (
                                    <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                                        <p className="text-sm text-red-700">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Tipo</label>
                                        <select
                                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                            value={tipo}
                                            onChange={(e) => setTipo(e.target.value as 'INGRESO' | 'GASTO')}
                                        >
                                            <option value="INGRESO">Ingreso</option>
                                            <option value="GASTO">Gasto</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Monto</label>
                                        <div className="mt-1 relative rounded-md shadow-sm">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500 sm:text-sm">S/</span>
                                            </div>
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                                                placeholder="0.00"
                                                value={monto}
                                                onChange={(e) => setMonto(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Motivo</label>
                                        <textarea
                                            rows={3}
                                            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md"
                                            placeholder="Detalle del ingreso/gasto..."
                                            value={motivo}
                                            onChange={(e) => setMotivo(e.target.value)}
                                        />
                                    </div>
                                </div>
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
                                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                                onClick={onClose}
                            >
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
