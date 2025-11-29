import React from 'react';
import { CashOperationsPanel } from './CashOperationsPanel';
import { CashMovementsTable } from './CashMovementsTable';

interface SesionCaja {
    id: string;
    estado: string;
    hora_apertura: string;
    monto_inicio: number;
    usuario?: {
        nombres: string;
        apellidos: string;
    };
    caja?: {
        nombre: string;
        codigo: string;
    };
}

interface ActiveCashSessionProps {
    sesion: SesionCaja;
    onCloseSession: () => void; // Callback when session is closed or user goes back
    className?: string;
}

export function ActiveCashSession({ sesion, onCloseSession, className = '' }: ActiveCashSessionProps) {
    return (
        <div className={`space-y-6 ${className}`}>
            {/* Header */}
            <div className="bg-white p-6 rounded-lg shadow flex justify-between items-start">
                <div>
                    <div className="flex items-center space-x-3 mb-2">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {sesion.caja?.nombre || 'Caja Principal'}
                        </h2>
                        <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-800 rounded-full border border-green-200">
                            {sesion.estado}
                        </span>
                    </div>
                    <div className="text-sm text-gray-500 space-y-1">
                        <p>Abierto por: <span className="font-medium text-gray-900">{sesion.usuario?.nombres} {sesion.usuario?.apellidos}</span></p>
                        <p>Hora apertura: <span className="font-medium text-gray-900">{new Date(sesion.hora_apertura).toLocaleString('es-PE')}</span></p>
                        <p>Monto inicial: <span className="font-medium text-gray-900">S/ {sesion.monto_inicio.toFixed(2)}</span></p>
                    </div>
                </div>
                <button
                    onClick={onCloseSession}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                    Cambiar sesión
                </button>
            </div>

            {/* Operations Panel */}
            <CashOperationsPanel
                sesionId={sesion.id}
                onOperationComplete={onCloseSession} // Refresh or go back on complete
            />

            {/* Movements Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Movimientos del Turno</h3>
                </div>
                <CashMovementsTable sesionId={sesion.id} />
            </div>
        </div>
    );
}
