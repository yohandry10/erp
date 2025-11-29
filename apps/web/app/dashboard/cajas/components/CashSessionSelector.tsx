import React, { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

interface SesionCaja {
    id: string;
    estado: string;
    hora_apertura: string;
    hora_cierre?: string;
    monto_inicio: number;
    monto_cierre?: number;
    diferencia?: number;
    usuario?: {
        nombres: string;
        apellidos: string;
    };
    caja?: {
        nombre: string;
        codigo: string;
    };
}

interface CashSessionSelectorProps {
    onSelect: (sesion: SesionCaja) => void;
    className?: string;
}

export function CashSessionSelector({ onSelect, className = '' }: CashSessionSelectorProps) {
    const api = useApi();
    const [sesiones, setSesiones] = useState<SesionCaja[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        cargarSesiones();
    }, []);

    const cargarSesiones = async () => {
        try {
            setLoading(true);
            // Fetch open sessions first, then closed ones
            const response = await api.get('/cajas/sesiones');
            if (response?.success) {
                setSesiones(response.data || []);
            } else {
                throw new Error(response?.message || 'Error cargando sesiones');
            }
        } catch (err: any) {
            console.error('Error cargando sesiones:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatearFecha = (fecha: string) => {
        return new Date(fecha).toLocaleString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getEstadoColor = (estado: string) => {
        switch (estado) {
            case 'ABIERTA':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'CERRADA':
                return 'bg-gray-100 text-gray-800 border-gray-200';
            case 'CONGELADA':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    if (loading) {
        return <div className="p-4 text-center text-gray-500">Cargando sesiones...</div>;
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-500 bg-red-50 rounded-lg">
                Error: {error}
                <button
                    onClick={cargarSesiones}
                    className="block mx-auto mt-2 text-sm text-blue-600 hover:underline"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    if (sesiones.length === 0) {
        return (
            <div className={`text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300 ${className}`}>
                <p className="text-gray-500 mb-4">No hay sesiones recientes</p>
                <button
                    onClick={() => {/* TODO: Trigger open session dialog */ }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    Abrir Nueva Caja
                </button>
            </div>
        );
    }

    return (
        <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-700">Sesiones de Caja</h3>
                <button
                    onClick={cargarSesiones}
                    className="text-sm text-blue-600 hover:text-blue-800"
                >
                    Actualizar
                </button>
            </div>

            <div className="divide-y divide-gray-200 max-h-[400px] overflow-y-auto">
                {sesiones.map((sesion) => (
                    <div
                        key={sesion.id}
                        onClick={() => onSelect(sesion)}
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex justify-between items-center group"
                    >
                        <div>
                            <div className="flex items-center space-x-2 mb-1">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getEstadoColor(sesion.estado)}`}>
                                    {sesion.estado}
                                </span>
                                <span className="font-medium text-gray-900">
                                    {sesion.caja?.nombre || 'Caja Principal'}
                                </span>
                            </div>
                            <div className="text-sm text-gray-500">
                                {formatearFecha(sesion.hora_apertura)}
                                {sesion.hora_cierre && ` - ${formatearFecha(sesion.hora_cierre)}`}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                Por: {sesion.usuario?.nombres} {sesion.usuario?.apellidos}
                            </div>
                        </div>

                        <div className="text-right">
                            <div className="text-sm font-medium text-gray-900">
                                Ini: S/ {sesion.monto_inicio.toFixed(2)}
                            </div>
                            {sesion.monto_cierre !== undefined && (
                                <div className="text-sm text-gray-600">
                                    Fin: S/ {sesion.monto_cierre.toFixed(2)}
                                </div>
                            )}
                            {sesion.diferencia !== undefined && sesion.diferencia !== 0 && (
                                <div className={`text-xs font-medium ${sesion.diferencia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Dif: {sesion.diferencia > 0 ? '+' : ''}{sesion.diferencia.toFixed(2)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
