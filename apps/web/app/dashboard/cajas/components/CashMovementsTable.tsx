import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';

interface MovimientoCaja {
    id: string;
    secuencia: number;
    tipo_movimiento: string;
    monto: number;
    saldo_anterior: number;
    saldo_nuevo: number;
    timestamp: string;
    referencia_tipo?: string;
    referencia_documento?: string;
    motivo?: string;
    usuario?: {
        nombres: string;
        apellidos: string;
    };
}

interface CashMovementsTableProps {
    sesionId: string;
    className?: string;
}

export function CashMovementsTable({ sesionId, className = '' }: CashMovementsTableProps) {
    const api = useApi();
    const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cargarMovimientos = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get(`/cajas/movimientos/${sesionId}`);
            if (response?.success) {
                setMovimientos(response.data || []);
            } else {
                throw new Error(response?.message || 'Error cargando movimientos');
            }
        } catch (err: any) {
            console.error('Error cargando movimientos:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [api, sesionId]);

    useEffect(() => {
        if (sesionId) {
            cargarMovimientos();
        }
    }, [cargarMovimientos, sesionId]);

    const formatearHora = (fecha: string) => {
        return new Date(fecha).toLocaleTimeString('es-PE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getTipoColor = (tipo: string) => {
        switch (tipo) {
            case 'APERTURA':
            case 'INGRESO':
                return 'text-green-600 bg-green-50';
            case 'VENTA':
                return 'text-blue-600 bg-blue-50';
            case 'RETIRO':
            case 'GASTO':
                return 'text-red-600 bg-red-50';
            case 'CIERRE':
                return 'text-gray-600 bg-gray-50';
            default:
                return 'text-gray-600 bg-gray-50';
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Cargando movimientos...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-red-500">Error: {error}</div>;
    }

    if (movimientos.length === 0) {
        return <div className="p-8 text-center text-gray-500">No hay movimientos registrados en esta sesión.</div>;
    }

    return (
        <div className={`overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg ${className}`}>
            <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                            #
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Hora
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Tipo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Referencia / Motivo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                            Monto
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                            Saldo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Usuario
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                    {movimientos.map((mov) => (
                        <tr key={mov.id}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                                {mov.secuencia}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {formatearHora(mov.timestamp)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getTipoColor(mov.tipo_movimiento)}`}>
                                    {mov.tipo_movimiento}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {mov.referencia_tipo && (
                                    <span className="font-medium text-gray-700 mr-2">
                                        {mov.referencia_tipo}: {mov.referencia_documento}
                                    </span>
                                )}
                                {mov.motivo && <span className="text-gray-500 italic">{mov.motivo}</span>}
                            </td>
                            <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-medium ${mov.monto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {mov.monto >= 0 ? '+' : ''}S/ {mov.monto.toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-900 font-medium">
                                S/ {mov.saldo_nuevo.toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {mov.usuario?.nombres}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
