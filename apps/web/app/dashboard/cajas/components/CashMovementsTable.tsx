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
    const { get } = useApi();
    const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cargarMovimientos = useCallback(async () => {
        try {
            setLoading(true);
            const response = await get(`/cajas/movimientos/${sesionId}`);
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
    }, [get, sesionId]);

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
                return 'text-emerald-400 bg-emerald-500/10';
            case 'VENTA':
                return 'text-primary bg-primary/10';
            case 'RETIRO':
            case 'GASTO':
                return 'text-destructive bg-destructive/10';
            case 'CIERRE':
                return 'text-foreground/80 bg-muted/30';
            default:
                return 'text-foreground/80 bg-muted/30';
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">Cargando movimientos...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-red-500">Error: {error}</div>;
    }

    if (movimientos.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">No hay movimientos registrados en esta sesión.</div>;
    }

    return (
        <div className={`overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg ${className}`}>
            <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-muted/30">
                    <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-foreground sm:pl-6">
                            #
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                            Hora
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                            Tipo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                            Referencia / Motivo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-foreground">
                            Monto
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-foreground">
                            Saldo
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-foreground">
                            Usuario
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-card">
                    {movimientos.map((mov) => (
                        <tr key={mov.id}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-foreground sm:pl-6">
                                {mov.secuencia}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                                {formatearHora(mov.timestamp)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getTipoColor(mov.tipo_movimiento)}`}>
                                    {mov.tipo_movimiento}
                                </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                                {mov.referencia_tipo && (
                                    <span className="font-medium text-foreground/85 mr-2">
                                        {mov.referencia_tipo}: {mov.referencia_documento}
                                    </span>
                                )}
                                {mov.motivo && <span className="text-muted-foreground italic">{mov.motivo}</span>}
                            </td>
                            <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-medium ${mov.monto >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                                {mov.monto >= 0 ? '+' : ''}S/ {mov.monto.toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-foreground font-medium">
                                S/ {mov.saldo_nuevo.toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-muted-foreground">
                                {mov.usuario?.nombres}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
