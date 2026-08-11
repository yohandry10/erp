'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { PagoLoteWizard } from '@/components/finanzas/PagoLoteWizard';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface CuentaBancaria {
  id: string;
  nombre: string;
  banco: string;
  numero_cuenta: string;
  moneda: string;
  saldo: number;
}

interface CuentaPorPagar {
  id: string;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  total: number;
  saldo: number;
  estado: string;
  moneda: string;
  proveedor: {
    id: string;
    razon_social: string;
    ruc: string;
  };
  dias_hasta_vencimiento?: number;
  urgencia?: string;
}

export default function PagoLotePage() {
  const router = useRouter();
  const { get, post } = useApi({ retries: 1, timeoutMs: 8000 });

  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [cxpsDisponibles, setCxpsDisponibles] = useState<CuentaPorPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingResult, setProcessingResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar cuentas bancarias
      const cuentasResponse = await get('/api/finanzas/bancos/cuentas');
      if (cuentasResponse?.success) {
        setCuentasBancarias(cuentasResponse.data || []);
      }

      const cxpResponses = await Promise.all([
        get('/api/finanzas/tesoreria/programacion?estado=PENDIENTE&page=1&limit=100'),
        get('/api/finanzas/tesoreria/programacion?estado=PARCIAL&page=1&limit=100'),
      ]);
      setCxpsDisponibles(
        cxpResponses.flatMap((response) => (response?.success ? response.data || [] : [])),
      );
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error al cargar los datos. Por favor, intente nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (data: {
    pagos: Array<{ cxp_id: string; monto?: number }>;
    fecha_pago: string;
    metodo_pago: string;
    cuenta_bancaria_id: string;
    referencia_lote: string;
    idempotency_key: string;
    observaciones?: string;
  }) => {
    try {
      setError(null);

      const response = await post('/api/finanzas/tesoreria/lote', data);

      if (response?.success) {
        setProcessingResult(response.data);
      } else {
        throw new Error(response?.message || 'Error al procesar el lote de pagos');
      }
    } catch (err: any) {
      console.error('Error processing batch payment:', err);
      setError(err.message || 'Error al procesar el lote de pagos');
      throw err;
    }
  };

  const handleCancel = () => {
    router.push('/dashboard/finanzas/tesoreria');
  };

  const handleViewDetails = () => {
    router.push('/dashboard/finanzas/tesoreria/pagos');
  };

  const handleNewBatch = () => {
    setProcessingResult(null);
    loadData();
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Pago Masivo</h1>
            <p className="mt-2 text-base text-muted-foreground">Cargando cuentas bancarias y CxP disponibles para procesar pagos por lote.</p>
          </div>
        </div>
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando información...</p>
        </div>
      </div>
    );
  }

  if (processingResult) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Pago Masivo Procesado</h1>
            <p className="mt-2 text-base text-muted-foreground">El lote de pagos se ha procesado exitosamente</p>
          </div>
        </div>

        <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
          <Card className="p-6 bg-emerald-500/10 border-emerald-500/30">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-emerald-400 mb-2">
                  Lote Procesado Exitosamente
                </h2>
                <p className="text-emerald-400 mb-4">
                  Se han procesado {processingResult.total_pagos} pagos por un monto total de{' '}
                  {processingResult.cuenta_bancaria?.moneda || 'PEN'}{' '}
                  {processingResult.monto_total?.toFixed(2)}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-card p-4 rounded-lg border border-emerald-500/30">
                    <div className="text-sm text-foreground/80">Referencia del Lote</div>
                    <div className="text-lg font-semibold text-foreground">
                      {processingResult.lote_id || 'N/A'}
                    </div>
                  </div>
                  <div className="bg-card p-4 rounded-lg border border-emerald-500/30">
                    <div className="text-sm text-foreground/80">Pagos Exitosos</div>
                    <div className="text-lg font-semibold text-emerald-400">
                      {processingResult.pagos_exitosos || 0}
                    </div>
                  </div>
                  <div className="bg-card p-4 rounded-lg border border-emerald-500/30">
                    <div className="text-sm text-foreground/80">Monto Total</div>
                    <div className="text-lg font-semibold text-foreground">
                      {processingResult.cuenta_bancaria?.moneda || 'PEN'}{' '}
                      {processingResult.monto_total?.toFixed(2)}
                    </div>
                  </div>
                </div>

                {processingResult.cuenta_bancaria && (
                  <div className="bg-card p-4 rounded-lg border border-emerald-500/30 mb-4">
                    <h3 className="font-semibold mb-2">Cuenta Bancaria</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-foreground/80">Cuenta: </span>
                        <span className="font-semibold">
                          {processingResult.cuenta_bancaria.nombre}
                        </span>
                      </div>
                      <div>
                        <span className="text-foreground/80">Saldo Anterior: </span>
                        <span className="font-semibold">
                          {processingResult.cuenta_bancaria.moneda || 'PEN'}{' '}
                          {processingResult.cuenta_bancaria.saldo_anterior?.toFixed(2)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-foreground/80">Saldo Nuevo: </span>
                        <span className="font-semibold text-emerald-400">
                          {processingResult.cuenta_bancaria.moneda || 'PEN'}{' '}
                          {processingResult.cuenta_bancaria.saldo_nuevo?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {processingResult.pagos && processingResult.pagos.length > 0 && (
                  <div className="bg-card p-4 rounded-lg border border-emerald-500/30">
                    <h3 className="font-semibold mb-3">Detalle de Pagos</h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {processingResult.pagos.map((pago: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-sm"
                        >
                          <div className="flex-1">
                            <div className="font-semibold">{pago.proveedor}</div>
                            <div className="text-foreground/80">
                              Doc: {pago.numero_documento} | {pago.estado_anterior} → {pago.estado_nuevo}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-emerald-400">
                              {processingResult.cuenta_bancaria?.moneda || 'PEN'}{' '}
                              {pago.monto?.toFixed(2)}
                            </div>
                            <div className="text-xs text-foreground/80">
                              Saldo: {pago.saldo_anterior?.toFixed(2)} → {pago.saldo_nuevo?.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-4 mt-6">
            <Button variant="outline" onClick={() => router.push('/dashboard/finanzas/tesoreria')}>
              Volver a Tesorería
            </Button>
            <Button variant="outline" onClick={handleViewDetails}>
              Ver Historial de Pagos
            </Button>
            <Button onClick={handleNewBatch}>
              Procesar Nuevo Lote
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleCancel}
              aria-label="Volver a tesorería"
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Pago Masivo a Proveedores</h1>
          </div>
          <p className="mt-2 text-base text-muted-foreground">
            Procesa múltiples pagos a proveedores en una sola operación
          </p>
        </div>
      </div>

      {error && (
        <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
          <Card className="p-4 bg-destructive/10 border-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-destructive">Error</div>
                <div className="text-sm text-destructive">{error}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <Card className="p-6">
          {cuentasBancarias.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay cuentas bancarias disponibles</h3>
              <p className="text-foreground/80 mb-4">
                Debe configurar al menos una cuenta bancaria para procesar pagos masivos.
              </p>
              <Button onClick={() => router.push('/dashboard/finanzas/bancos')}>
                Configurar Cuentas Bancarias
              </Button>
            </div>
          ) : cxpsDisponibles.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay cuentas por pagar pendientes</h3>
              <p className="text-foreground/80 mb-4">
                No hay cuentas por pagar en estado pendiente o parcial para procesar.
              </p>
              <Button onClick={() => router.push('/dashboard/finanzas/cxp')}>
                Ver Cuentas por Pagar
              </Button>
            </div>
          ) : (
            <PagoLoteWizard
              cuentasBancarias={cuentasBancarias}
              cxpsDisponibles={cxpsDisponibles}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
