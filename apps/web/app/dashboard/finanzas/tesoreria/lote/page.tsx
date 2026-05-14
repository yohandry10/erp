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
    referencia_lote?: string;
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
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando información...</p>
        </div>
      </div>
    );
  }

  if (processingResult) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">Pago Masivo Procesado</h1>
            <p className="dashboard-subtitle">El lote de pagos se ha procesado exitosamente</p>
          </div>
        </div>

        <div className="activity-section">
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-green-900 mb-2">
                  Lote Procesado Exitosamente
                </h2>
                <p className="text-green-700 mb-4">
                  Se han procesado {processingResult.total_pagos} pagos por un monto total de{' '}
                  {processingResult.cuenta_bancaria?.moneda || 'PEN'}{' '}
                  {processingResult.monto_total?.toFixed(2)}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <div className="text-sm text-gray-600">Referencia del Lote</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {processingResult.lote_id || 'N/A'}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <div className="text-sm text-gray-600">Pagos Exitosos</div>
                    <div className="text-lg font-semibold text-green-600">
                      {processingResult.pagos_exitosos || 0}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <div className="text-sm text-gray-600">Monto Total</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {processingResult.cuenta_bancaria?.moneda || 'PEN'}{' '}
                      {processingResult.monto_total?.toFixed(2)}
                    </div>
                  </div>
                </div>

                {processingResult.cuenta_bancaria && (
                  <div className="bg-white p-4 rounded-lg border border-green-200 mb-4">
                    <h3 className="font-semibold mb-2">Cuenta Bancaria</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Cuenta: </span>
                        <span className="font-semibold">
                          {processingResult.cuenta_bancaria.nombre}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Saldo Anterior: </span>
                        <span className="font-semibold">
                          {processingResult.cuenta_bancaria.moneda || 'PEN'}{' '}
                          {processingResult.cuenta_bancaria.saldo_anterior?.toFixed(2)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-600">Saldo Nuevo: </span>
                        <span className="font-semibold text-green-600">
                          {processingResult.cuenta_bancaria.moneda || 'PEN'}{' '}
                          {processingResult.cuenta_bancaria.saldo_nuevo?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {processingResult.pagos && processingResult.pagos.length > 0 && (
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <h3 className="font-semibold mb-3">Detalle de Pagos</h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {processingResult.pagos.map((pago: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                        >
                          <div className="flex-1">
                            <div className="font-semibold">{pago.proveedor}</div>
                            <div className="text-gray-600">
                              Doc: {pago.numero_documento} | {pago.estado_anterior} → {pago.estado_nuevo}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-600">
                              {processingResult.cuenta_bancaria?.moneda || 'PEN'}{' '}
                              {pago.monto?.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-600">
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
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleCancel}
              aria-label="Volver a tesorería"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="dashboard-title">Pago Masivo a Proveedores</h1>
          </div>
          <p className="dashboard-subtitle">
            Procesa múltiples pagos a proveedores en una sola operación
          </p>
        </div>
      </div>

      {error && (
        <div className="activity-section">
          <Card className="p-4 bg-red-50 border-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-red-900">Error</div>
                <div className="text-sm text-red-700">{error}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="activity-section">
        <Card className="p-6">
          {cuentasBancarias.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay cuentas bancarias disponibles</h3>
              <p className="text-gray-600 mb-4">
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
              <p className="text-gray-600 mb-4">
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
