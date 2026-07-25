import React, { useMemo, useState } from 'react';

export interface Denominaciones {
    billetes: { [denominacion: number]: number };
    monedas: { [denominacion: number]: number };
}

interface DenominationFormProps {
    initialValues?: Denominaciones;
    onSubmit?: (denominaciones: Denominaciones, total: number) => void;
    readOnly?: boolean;
    className?: string;
}

const BILLETES = [200, 100, 50, 20, 10];
const MONEDAS = [5, 2, 1, 0.5, 0.2, 0.1];

export function DenominationForm({
    initialValues,
    onSubmit,
    readOnly = false,
    className = '',
}: DenominationFormProps) {
    const [billetes, setBilletes] = useState<{ [key: number]: number }>(
        initialValues?.billetes || {}
    );
    const [monedas, setMonedas] = useState<{ [key: number]: number }>(
        initialValues?.monedas || {}
    );
    const total = useMemo(() => {
        let sum = 0;
        Object.entries(billetes).forEach(([denom, qty]) => {
            sum += parseFloat(denom) * (qty || 0);
        });
        Object.entries(monedas).forEach(([denom, qty]) => {
            sum += parseFloat(denom) * (qty || 0);
        });
        return Math.round(sum * 100) / 100;
    }, [billetes, monedas]);

    const handleBilleteChange = (denom: number, value: string) => {
        if (readOnly) return;
        const qty = parseInt(value) || 0;
        setBilletes((prev) => ({ ...prev, [denom]: qty }));
    };

    const handleMonedaChange = (denom: number, value: string) => {
        if (readOnly) return;
        const qty = parseInt(value) || 0;
        setMonedas((prev) => ({ ...prev, [denom]: qty }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (onSubmit) {
            onSubmit({ billetes, monedas }, total);
        }
    };

    return (
        <form onSubmit={handleSubmit} className={`space-y-6 ${className}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Billetes */}
                <div className="bg-card p-4 rounded-lg shadow-sm border border-border">
                    <h3 className="text-lg font-semibold text-foreground mb-4 border-b pb-2">
                        Billetes
                    </h3>
                    <div className="space-y-3">
                        {BILLETES.map((denom) => (
                            <div key={`billete-${denom}`} className="flex items-center justify-between">
                                <label className="text-foreground/85 font-medium w-24">
                                    S/ {denom}
                                </label>
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={billetes[denom] || ''}
                                        onChange={(e) => handleBilleteChange(denom, e.target.value)}
                                        disabled={readOnly}
                                        className="w-24 px-3 py-1 border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right disabled:bg-muted"
                                        placeholder="0"
                                    />
                                    <span className="text-muted-foreground w-24 text-right text-sm">
                                        = S/ {((billetes[denom] || 0) * denom).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Monedas */}
                <div className="bg-card p-4 rounded-lg shadow-sm border border-border">
                    <h3 className="text-lg font-semibold text-foreground mb-4 border-b pb-2">
                        Monedas
                    </h3>
                    <div className="space-y-3">
                        {MONEDAS.map((denom) => (
                            <div key={`moneda-${denom}`} className="flex items-center justify-between">
                                <label className="text-foreground/85 font-medium w-24">
                                    S/ {denom.toFixed(2)}
                                </label>
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={monedas[denom] || ''}
                                        onChange={(e) => handleMonedaChange(denom, e.target.value)}
                                        disabled={readOnly}
                                        className="w-24 px-3 py-1 border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right disabled:bg-muted"
                                        placeholder="0"
                                    />
                                    <span className="text-muted-foreground w-24 text-right text-sm">
                                        = S/ {((monedas[denom] || 0) * denom).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Total */}
            <div className="bg-muted/30 p-4 rounded-lg border border-border flex justify-between items-center">
                <span className="text-xl font-bold text-foreground">Total Arqueo:</span>
                <span className="text-2xl font-bold text-primary">
                    S/ {total.toFixed(2)}
                </span>
            </div>

            {!readOnly && onSubmit && (
                <div className="flex justify-end">
                    <button
                        type="submit"
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                    >
                        Confirmar Arqueo
                    </button>
                </div>
            )}
        </form>
    );
}
