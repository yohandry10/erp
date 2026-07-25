'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format-utils';
import { fetchApi } from '@/lib/api-fetch';

interface MovimientoBancario {
  id: string;
  fecha: string;
  tipo: 'ABONO' | 'CARGO';
  monto: number;
  descripcion: string;
  referencia?: string;
  conciliado: boolean;
  es_extracto: boolean;
}

interface MatchManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  conciliacionId: string;
  onMatchSuccess: () => void;
}

export default function MatchManualModal({
  isOpen,
  onClose,
  conciliacionId,
  onMatchSuccess,
}: MatchManualModalProps) {
  const [movimientosSistema, setMovimientosSistema] = useState<MovimientoBancario[]>([]);
  const [movimientosExtracto, setMovimientosExtracto] = useState<MovimientoBancario[]>([]);
  const [selectedSistema, setSelectedSistema] = useState<string | null>(null);
  const [selectedExtracto, setSelectedExtracto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMovimientos = useCallback(async () => {
    if (!conciliacionId) return;

    setLoading(true);
    setError(null);
    try {
      // Get conciliación details to get cuenta_bancaria_id
      const conciliacionResponse = await fetchApi(
        `/api/finanzas/conciliacion/${conciliacionId}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (!conciliacionResponse.ok) {
        throw new Error('Error al cargar la conciliación');
      }

      const conciliacionData = await conciliacionResponse.json();
      const cuentaBancariaId = conciliacionData.data.cuenta_bancaria_id;
      const fechaDesde = conciliacionData.data.fecha_desde;
      const fechaHasta = conciliacionData.data.fecha_hasta;

      // Load movimientos del sistema (no conciliados)
      const sistemaResponse = await fetchApi(
        `/api/finanzas/bancos/cuentas/${cuentaBancariaId}/movimientos?` +
          `fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}&conciliado=false&es_extracto=false`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (sistemaResponse.ok) {
        const sistemaData = await sistemaResponse.json();
        setMovimientosSistema(sistemaData.data || []);
      }

      // Load movimientos del extracto (no conciliados)
      const extractoResponse = await fetchApi(
        `/api/finanzas/bancos/cuentas/${cuentaBancariaId}/movimientos?` +
          `fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}&conciliado=false&es_extracto=true&conciliacion_id=${conciliacionId}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (extractoResponse.ok) {
        const extractoData = await extractoResponse.json();
        setMovimientosExtracto(extractoData.data || []);
      }
    } catch (err) {
      console.error('Error loading movimientos:', err);
      setError('Error al cargar los movimientos bancarios');
    } finally {
      setLoading(false);
    }
  }, [conciliacionId]);

  useEffect(() => {
    if (isOpen && conciliacionId) {
      loadMovimientos();
    }
  }, [conciliacionId, isOpen, loadMovimientos]);

  const handleMatch = async () => {
    if (!selectedSistema || !selectedExtracto) {
      setError('Debe seleccionar un movimiento del sistema y uno del extracto');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetchApi(
        `/api/finanzas/conciliacion/${conciliacionId}/marcar-item`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            movimiento_sistema_id: selectedSistema,
            movimiento_extracto_id: selectedExtracto,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al realizar el match');
      }

      // Success
      onMatchSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error matching:', err);
      setError(err.message || 'Error al realizar el match manual');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedSistema(null);
    setSelectedExtracto(null);
    setError(null);
    onClose();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount);
  };

  const getSelectedSistemaMovimiento = () => {
    return movimientosSistema.find((m) => m.id === selectedSistema);
  };

  const getSelectedExtractoMovimiento = () => {
    return movimientosExtracto.find((m) => m.id === selectedExtracto);
  };

  const calculateDifference = () => {
    const sistema = getSelectedSistemaMovimiento();
    const extracto = getSelectedExtractoMovimiento();
    if (sistema && extracto) {
      return Math.abs(sistema.monto - extracto.monto);
    }
    return 0;
  };

  const canMatch = () => {
    const sistema = getSelectedSistemaMovimiento();
    const extracto = getSelectedExtractoMovimiento();
    return sistema && extracto && sistema.tipo === extracto.tipo;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match Manual de Movimientos</DialogTitle>
          <DialogDescription>
            Seleccione un movimiento del sistema y uno del extracto bancario para conciliarlos manualmente.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-red-200 text-destructive px-4 py-3 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-foreground/80">Cargando movimientos...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Movimientos del Sistema */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-primary">
                Movimientos del Sistema ({movimientosSistema.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {movimientosSistema.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    No hay movimientos del sistema pendientes de conciliar
                  </p>
                ) : (
                  movimientosSistema.map((mov) => (
                    <button
                      type="button"
                      key={mov.id}
                      data-testid="match-sistema-item"
                      aria-pressed={selectedSistema === mov.id}
                      aria-label={`Seleccionar movimiento del sistema ${mov.tipo} ${formatCurrency(mov.monto)} ${mov.descripcion}`}
                      onClick={() => setSelectedSistema(mov.id)}
                      className={`w-full text-left p-3 border rounded cursor-pointer transition-all ${
                        selectedSistema === mov.id
                          ? 'border-blue-500 bg-primary/10 shadow-md'
                          : 'border-border hover:border-blue-300 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs text-muted-foreground">{formatDate(mov.fecha)}</span>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            mov.tipo === 'ABONO'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {mov.tipo}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">
                        {formatCurrency(mov.monto)}
                      </p>
                      <p className="text-xs text-foreground/80 truncate">{mov.descripcion}</p>
                      {mov.referencia && (
                        <p className="text-xs text-muted-foreground mt-1">Ref: {mov.referencia}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Movimientos del Extracto */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-emerald-400">
                Movimientos del Extracto ({movimientosExtracto.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {movimientosExtracto.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    No hay movimientos del extracto pendientes de conciliar
                  </p>
                ) : (
                  movimientosExtracto.map((mov) => (
                    <button
                      type="button"
                      key={mov.id}
                      data-testid="match-extracto-item"
                      aria-pressed={selectedExtracto === mov.id}
                      aria-label={`Seleccionar movimiento del extracto ${mov.tipo} ${formatCurrency(mov.monto)} ${mov.descripcion}`}
                      onClick={() => setSelectedExtracto(mov.id)}
                      className={`w-full text-left p-3 border rounded cursor-pointer transition-all ${
                        selectedExtracto === mov.id
                          ? 'border-green-500 bg-emerald-500/10 shadow-md'
                          : 'border-border hover:border-green-300 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs text-muted-foreground">{formatDate(mov.fecha)}</span>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            mov.tipo === 'ABONO'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {mov.tipo}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">
                        {formatCurrency(mov.monto)}
                      </p>
                      <p className="text-xs text-foreground/80 truncate">{mov.descripcion}</p>
                      {mov.referencia && (
                        <p className="text-xs text-muted-foreground mt-1">Ref: {mov.referencia}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Match Summary */}
        {selectedSistema && selectedExtracto && (
          <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
            <h4 className="font-semibold text-sm mb-3">Resumen del Match</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-foreground/80 mb-1">Monto Sistema:</p>
                <p className="font-semibold">
                  {formatCurrency(getSelectedSistemaMovimiento()?.monto || 0)}
                </p>
              </div>
              <div>
                <p className="text-foreground/80 mb-1">Monto Extracto:</p>
                <p className="font-semibold">
                  {formatCurrency(getSelectedExtractoMovimiento()?.monto || 0)}
                </p>
              </div>
              <div>
                <p className="text-foreground/80 mb-1">Diferencia:</p>
                <p
                  className={`font-semibold ${
                    calculateDifference() === 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {formatCurrency(calculateDifference())}
                </p>
              </div>
            </div>
            {!canMatch() && (
              <div className="mt-3 text-sm text-destructive">
                ⚠️ Los tipos de movimiento no coinciden. No se puede realizar el match.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!canMatch() || submitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting ? 'Procesando...' : 'Realizar Match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
