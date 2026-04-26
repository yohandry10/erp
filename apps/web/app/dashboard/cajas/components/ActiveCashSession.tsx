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
    onCloseSession: () => void;
    className?: string;
}

export function ActiveCashSession({ sesion, onCloseSession, className = '' }: ActiveCashSessionProps) {
    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
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
                        height: '4px',
                        background: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
                        borderRadius: '16px 16px 0 0',
                    }}
                />
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <h2
                            style={{
                                fontSize: '1.5rem',
                                fontWeight: 700,
                                color: '#1e293b',
                                margin: 0,
                            }}
                        >
                            💰 {sesion.caja?.nombre || 'Caja Principal'}
                        </h2>
                        <span
                            style={{
                                padding: '0.375rem 0.75rem',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                background: '#dcfce7',
                                color: '#047857',
                                borderRadius: '9999px',
                                border: '1px solid #bbf7d0',
                            }}
                        >
                            {sesion.estado}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <p style={{ margin: 0 }}>
                            Abierto por: <span style={{ fontWeight: 600, color: '#1e293b' }}>{sesion.usuario?.nombres} {sesion.usuario?.apellidos}</span>
                        </p>
                        <p style={{ margin: 0 }}>
                            Hora apertura: <span style={{ fontWeight: 600, color: '#1e293b' }}>{new Date(sesion.hora_apertura).toLocaleString('es-PE')}</span>
                        </p>
                        <p style={{ margin: 0 }}>
                            Monto inicial: <span style={{ fontWeight: 700, color: '#059669' }}>S/ {sesion.monto_inicio.toFixed(2)}</span>
                        </p>
                    </div>
                </div>
                <button
                    onClick={onCloseSession}
                    style={{
                        background: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e2e8f0';
                        e.currentTarget.style.borderColor = '#94a3b8';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                    }}
                >
                    ← Cambiar sesión
                </button>
            </div>

            {/* Operations Panel */}
            <CashOperationsPanel
                sesionId={sesion.id}
                onOperationComplete={onCloseSession}
            />

            {/* Movements Table */}
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    borderRadius: '16px',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '4px',
                        background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
                        borderRadius: '16px 16px 0 0',
                    }}
                />
                <div
                    style={{
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid #e2e8f0',
                    }}
                >
                    <h3
                        style={{
                            fontSize: '1.125rem',
                            fontWeight: 700,
                            color: '#1e293b',
                            margin: 0,
                        }}
                    >
                        📋 Movimientos del Turno
                    </h3>
                </div>
                <CashMovementsTable sesionId={sesion.id} />
            </div>
        </div>
    );
}
