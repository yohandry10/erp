'use client';

import React, { useState } from 'react';
import { CashSessionSelector } from './components/CashSessionSelector';
import { ActiveCashSession } from './components/ActiveCashSession';
import { CashOpenDialog } from './components/CashOpenDialog';

export default function CashManagementPage() {
    const [sesionActiva, setSesionActiva] = useState<any | null>(null);
    const [showOpenDialog, setShowOpenDialog] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0); // To force refresh lists

    const handleSessionSelect = (sesion: any) => {
        setSesionActiva(sesion);
    };

    const handleCloseSessionView = () => {
        setSesionActiva(null);
        setRefreshKey(prev => prev + 1);
    };

    const handleOpenSuccess = () => {
        setRefreshKey(prev => prev + 1);
        // Optionally auto-select the new session if we could get it
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Gestión de Cajas</h1>
                    <p className="text-sm text-gray-500 mt-1">Administración de turnos, movimientos y cierres</p>
                </div>
                {!sesionActiva && (
                    <button
                        onClick={() => setShowOpenDialog(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm font-medium transition-colors"
                    >
                        Abrir Nueva Caja
                    </button>
                )}
            </div>

            {!sesionActiva ? (
                <div className="space-y-6">
                    <CashSessionSelector
                        key={refreshKey}
                        onSelect={handleSessionSelect}
                    />

                    {/* Info Card */}
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start space-x-3">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-blue-800">Información</h4>
                            <p className="text-sm text-blue-700 mt-1">
                                Seleccione una sesión activa para ver detalles, registrar movimientos o realizar el cierre.
                                Si no hay sesiones abiertas, puede iniciar una nueva con el botón "Abrir Nueva Caja".
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <ActiveCashSession
                    sesion={sesionActiva}
                    onCloseSession={handleCloseSessionView}
                />
            )}

            <CashOpenDialog
                isOpen={showOpenDialog}
                onClose={() => setShowOpenDialog(false)}
                onSuccess={handleOpenSuccess}
            />
        </div>
    );
}
