'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { CashSessionSelector } from './components/CashSessionSelector';
import { ActiveCashSession } from './components/ActiveCashSession';
import { CashOpenDialog } from './components/CashOpenDialog';
import { CortesList } from './components/CortesList';
import { useToast } from '@/components/ui/use-toast';

export default function CashManagementPage() {
    const { toast } = useToast();
    const [sesionActiva, setSesionActiva] = useState<any | null>(null);
    const [showOpenDialog, setShowOpenDialog] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleSessionSelect = (sesion: any) => {
        setSesionActiva(sesion);
    };

    const handleCloseSessionView = () => {
        setSesionActiva(null);
        setRefreshKey(prev => prev + 1);
    };

    const handleOpenSuccess = () => {
        setRefreshKey(prev => prev + 1);
        toast({
            title: '✅ Caja Abierta',
            description: 'La sesión de caja se ha iniciado correctamente.',
        });
    };

    return (
        <div
            style={{
                maxWidth: '1400px',
                margin: '0 auto',
                padding: '2rem',
            }}
        >
            {/* Header */}
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    borderRadius: '24px',
                    padding: '2rem',
                    marginBottom: '2rem',
                    boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '6px',
                        background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
                        borderRadius: '24px 24px 0 0',
                    }}
                />
                <div>
                    <h1
                        style={{
                            fontSize: '2.5rem',
                            fontWeight: 900,
                            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            margin: 0,
                            letterSpacing: '-0.05em',
                        }}
                    >
                        💰 Gestión de Cajas
                    </h1>
                    <p
                        style={{
                            fontSize: '1rem',
                            color: '#475569',
                            fontWeight: 500,
                            marginTop: '0.5rem',
                        }}
                    >
                        Administración de turnos, movimientos y cierres
                    </p>
                </div>
                {!sesionActiva && (
                    <button
                        onClick={() => setShowOpenDialog(true)}
                        style={{
                            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '1rem 2rem',
                            borderRadius: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                            fontSize: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.3s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                            e.currentTarget.style.boxShadow = '0 25px 50px -12px rgb(0 0 0 / 0.25)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)';
                        }}
                    >
                        🔓 Abrir Nueva Caja
                    </button>
                )}
            </div>

            {!sesionActiva ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <CashSessionSelector
                        key={refreshKey}
                        onSelect={handleSessionSelect}
                    />

                    <CortesList id="cortes" />

                    {/* Info Card */}
                    <div
                        style={{
                            background: 'linear-gradient(135deg, rgba(239, 246, 255, 0.95) 0%, rgba(219, 234, 254, 0.9) 100%)',
                            border: '1px solid #bfdbfe',
                            borderRadius: '12px',
                            padding: '1.25rem',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '1rem',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                    >
                        <div
                            style={{
                                flexShrink: 0,
                                width: '40px',
                                height: '40px',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Info style={{ width: '20px', height: '20px', color: 'white' }} />
                        </div>
                        <div>
                            <h4
                                style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: '#1e40af',
                                    margin: 0,
                                    marginBottom: '0.5rem',
                                }}
                            >
                                Información
                            </h4>
                            <p
                                style={{
                                    fontSize: '0.9rem',
                                    color: '#1d4ed8',
                                    margin: 0,
                                    lineHeight: 1.6,
                                }}
                            >
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
