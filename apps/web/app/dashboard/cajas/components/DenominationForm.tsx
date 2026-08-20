import React, { useMemo, useState } from 'react';
import { useCountryContext } from '@/hooks/use-country-context';

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

const DENOMINACIONES = {
    PE: {
        billetes: [200, 100, 50, 20, 10],
        monedas: [5, 2, 1, 0.5, 0.2, 0.1],
    },
    AR: {
        billetes: [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10],
        monedas: [10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01],
    },
    CO: {
        billetes: [100000, 50000, 20000, 10000, 5000, 2000],
        monedas: [1000, 500, 200, 100, 50],
    },
} as const;

export function DenominationForm({
    initialValues,
    onSubmit,
    readOnly = false,
    className = '',
}: DenominationFormProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    const countryCode = country.paisCodigo === 'AR' ? 'AR' : country.paisCodigo === 'CO' ? 'CO' : 'PE';
    const denominaciones = DENOMINACIONES[countryCode];
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
                        {denominaciones.billetes.map((denom) => (
                            <div key={`billete-${denom}`} className="flex items-center justify-between">
                                <label className="text-foreground/85 font-medium w-24">
                                    {currencySymbol} {denom}
                                </label>
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={billetes[denom] || ''}
                                        aria-label={`Cantidad de billetes de ${currencySymbol} ${denom}`}
                                        onChange={(e) => handleBilleteChange(denom, e.target.value)}
                                        disabled={readOnly}
                                        className="w-24 px-3 py-1 border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right disabled:bg-muted"
                                        placeholder="0"
                                    />
                                    <span className="text-muted-foreground w-24 text-right text-sm">
                                        = {currencySymbol} {((billetes[denom] || 0) * denom).toFixed(2)}
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
                        {denominaciones.monedas.map((denom) => (
                            <div key={`moneda-${denom}`} className="flex items-center justify-between">
                                <label className="text-foreground/85 font-medium w-24">
                                    {currencySymbol} {denom.toFixed(2)}
                                </label>
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={monedas[denom] || ''}
                                        aria-label={`Cantidad de monedas de ${currencySymbol} ${denom}`}
                                        onChange={(e) => handleMonedaChange(denom, e.target.value)}
                                        disabled={readOnly}
                                        className="w-24 px-3 py-1 border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right disabled:bg-muted"
                                        placeholder="0"
                                    />
                                    <span className="text-muted-foreground w-24 text-right text-sm">
                                        = {currencySymbol} {((monedas[denom] || 0) * denom).toFixed(2)}
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
                    {currencySymbol} {total.toFixed(2)}
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
