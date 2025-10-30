'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MatchManualModal from '@/components/finanzas/MatchManualModal';
import { ImportarExtractoCSV, ConciliacionTable, ConciliacionWizard, ConciliacionGuide } from '@/components/finanzas';

interface Conciliacion {
  id: string;
  periodo: string;
  estado: 'ABIERTA' | 'EN_PROCESO' | 'CERRADA';
  fecha_desde: string;
  fecha_hasta: string;
  saldo_libro: number;
  saldo_banco: number;
  diferencia: number;
  cuentas_bancarias: {
    banco: string;
    numero_cuenta: string;
    moneda: string;
  };
}

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

export default function ConciliacionDetailPage() {
  const params = useParams();
  const conciliacionId = params.id as string;

  const [conciliacion, setConciliacion] = useState<Conciliacion | null>(null);
  const [movimientosSistema, setMovimientosSistema] = useState<MovimientoBancario[]>([]);
  const [movimientosExtracto, setMovimientosExtracto] = useState<MovimientoBancario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedSistemaId, setSelectedSistemaId] = useState<string | null>(null);
  const [selectedExtractoId, setSelectedExtractoId] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [reporteDiferencias, setReporteDiferencias] = useState<any>(null);
  const [loadingDiferencias, setLoadingDiferencias] = useState(false);
  const [closingConciliacion, setClosingConciliacion] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  useEffect(() => {
    if (conciliacionId) {
      loadConciliacion();
    }
  }, [conciliacionId]);

  const loadConciliacion = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setConciliacion(data.data);
        await loadMovimientos(data.data);
      }
    } catch (error) {
      console.error('Error loading conciliación:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMovimientos = async (conciliacionData: Conciliacion) => {
    try {
      const cuentaBancariaId = conciliacionData.cuentas_bancarias;
      const fechaDesde = conciliacionData.fecha_desde;
      const fechaHasta = conciliacionData.fecha_hasta;

      // Load movimientos del sistema
      const sistemaResponse = await fetch(
        `${API_BASE_URL}/api/finanzas/bancos/cuentas/${cuentaBancariaId}/movimientos?` +
          `fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}&es_extracto=false`,
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

      // Load movimientos del extracto
      const extractoResponse = await fetch(
        `${API_BASE_URL}/api/finanzas/bancos/cuentas/${cuentaBancariaId}/movimientos?` +
          `fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}&es_extracto=true&conciliacion_id=${conciliacionId}`,
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
    } catch (error) {
      console.error('Error loading movimientos:', error);
    }
  };

  const handleMatchSuccess = () => {
    // Reload data after successful match
    loadConciliacion();
  };

  const handleImportSuccess = () => {
    // Reload data after successful import
    setShowImportModal(false);
    loadConciliacion();
  };

  const handleDragMatch = async (sistemaId: string, extractoId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}/marcar-item`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            movimiento_sistema_id: sistemaId,
            movimiento_extracto_id: extractoId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al realizar el match');
      }

      // Success - reload data
      loadConciliacion();
    } catch (error) {
      console.error('Error performing drag match:', error);
      // You could add a toast notification here
    }
  };

  const handleOpenCloseModal = async () => {
    setLoadingDiferencias(true);
    setShowCloseModal(true);
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}/diferencias`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        setReporteDiferencias(data.data);
      }
    } catch (error) {
      console.error('Error loading diferencias:', error);
    } finally {
      setLoadingDiferencias(false);
    }
  };

  const handleCerrarConciliacion = async (forzarCierre: boolean = false) => {
    setClosingConciliacion(true);
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}/cerrar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            forzar_cierre: forzarCierre,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al cerrar la conciliación');
      }

      // Success - reload data and close modal
      await loadConciliacion();
      setShowCloseModal(false);
      alert('Conciliación cerrada exitosamente');
    } catch (error: any) {
      console.error('Error closing conciliación:', error);
      alert(error.message || 'Error al cerrar la conciliación');
    } finally {
      setClosingConciliacion(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getEstadoBadge = (estado: string) => {
    const badges = {
      ABIERTA: 'bg-blue-100 text-blue-800',
      EN_PROCESO: 'bg-yellow-100 text-yellow-800',
      CERRADA: 'bg-green-100 text-green-800',
    };
    return badges[estado as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!conciliacion) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-600">Conciliación no encontrada</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Conciliación Bancaria</h1>
          <p className="text-gray-600 mt-1">
            {conciliacion.cuentas_bancarias.banco} - {conciliacion.cuentas_bancarias.numero_cuenta}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getEstadoBadge(conciliacion.estado)}`}>
          {conciliacion.estado}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Período</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{conciliacion.periodo}</p>
            <p className="text-xs text-gray-500 mt-1">
              {formatDate(conciliacion.fecha_desde)} - {formatDate(conciliacion.fecha_hasta)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Saldo Libro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{formatCurrency(conciliacion.saldo_libro)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Saldo Banco</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{formatCurrency(conciliacion.saldo_banco)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Diferencia</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-lg font-semibold ${
                conciliacion.diferencia === 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(conciliacion.diferencia)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Guide - Only show for open conciliaciones */}
      {conciliacion.estado !== 'CERRADA' && !showWizard && (
        <ConciliacionGuide />
      )}

      {/* View Toggle */}
      <div className="flex gap-3 mb-4">
        <Button
          onClick={() => setShowWizard(!showWizard)}
          variant={showWizard ? "default" : "outline"}
          className={showWizard ? "bg-purple-600 hover:bg-purple-700" : ""}
          disabled={conciliacion.estado === 'CERRADA'}
        >
          {showWizard ? '📋 Vista Detallada' : '🧙 Modo Wizard'}
        </Button>
      </div>

      {/* Wizard View */}
      {showWizard ? (
        <ConciliacionWizard
          conciliacionId={conciliacionId}
          conciliacion={conciliacion}
          onComplete={() => {
            loadConciliacion();
            setShowWizard(false);
          }}
        />
      ) : (
        <>
          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={() => setShowImportModal(true)}
              disabled={conciliacion.estado === 'CERRADA'}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Importar Extracto CSV
            </Button>
            <Button variant="outline" disabled={conciliacion.estado === 'CERRADA'}>
              Match Automático
            </Button>
            <Button
              onClick={() => setShowMatchModal(true)}
              disabled={conciliacion.estado === 'CERRADA'}
              variant="outline"
            >
              Match Manual
            </Button>
            <Button
              onClick={handleOpenCloseModal}
              disabled={conciliacion.estado === 'CERRADA'}
              className="bg-green-600 hover:bg-green-700 ml-auto"
            >
              Cerrar Conciliación
            </Button>
          </div>

          {/* Dual Table View */}
          <ConciliacionTable
            movimientosSistema={movimientosSistema}
            movimientosExtracto={movimientosExtracto}
            onSelectSistema={setSelectedSistemaId}
            onSelectExtracto={setSelectedExtractoId}
            selectedSistemaId={selectedSistemaId}
            selectedExtractoId={selectedExtractoId}
            highlightMatches={true}
            readOnly={conciliacion.estado === 'CERRADA'}
            onDragMatch={handleDragMatch}
          />
        </>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <ImportarExtractoCSV
                conciliacionId={conciliacionId}
                cuentaBancariaId={conciliacion.cuentas_bancarias as any}
                banco={conciliacion.cuentas_bancarias.banco}
                onImportSuccess={handleImportSuccess}
                onCancel={() => setShowImportModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Match Manual Modal */}
      <MatchManualModal
        isOpen={showMatchModal}
        onClose={() => setShowMatchModal(false)}
        conciliacionId={conciliacionId}
        onMatchSuccess={handleMatchSuccess}
      />

      {/* Close Confirmation Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Confirmar Cierre de Conciliación
              </h2>

              {loadingDiferencias ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : reporteDiferencias ? (
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Resumen de Conciliación</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-blue-700">Período:</p>
                        <p className="font-semibold">{reporteDiferencias.conciliacion.periodo}</p>
                      </div>
                      <div>
                        <p className="text-blue-700">Cuenta:</p>
                        <p className="font-semibold">
                          {reporteDiferencias.conciliacion.cuenta_bancaria.banco} -{' '}
                          {reporteDiferencias.conciliacion.cuenta_bancaria.numero_cuenta}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Saldos */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Saldo Libro</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-lg font-semibold">
                          {formatCurrency(reporteDiferencias.saldos.saldo_libro)}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Saldo Banco</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-lg font-semibold">
                          {formatCurrency(reporteDiferencias.saldos.saldo_banco)}
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Diferencia</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p
                          className={`text-lg font-semibold ${
                            reporteDiferencias.saldos.diferencia_neta === 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(reporteDiferencias.saldos.diferencia_neta)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Movimientos Statistics */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                          Movimientos del Sistema
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Total:</span>
                          <span className="font-semibold">
                            {reporteDiferencias.movimientos_sistema.total}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Conciliados:</span>
                          <span className="font-semibold text-green-600">
                            {reporteDiferencias.movimientos_sistema.conciliados}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Pendientes:</span>
                          <span
                            className={`font-semibold ${
                              reporteDiferencias.movimientos_sistema.pendientes > 0
                                ? 'text-red-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {reporteDiferencias.movimientos_sistema.pendientes}
                          </span>
                        </div>
                        <div className="pt-2 border-t">
                          <div className="flex justify-between text-sm">
                            <span>Abonos:</span>
                            <span className="font-semibold text-green-600">
                              {formatCurrency(reporteDiferencias.movimientos_sistema.total_abonos)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Cargos:</span>
                            <span className="font-semibold text-red-600">
                              {formatCurrency(reporteDiferencias.movimientos_sistema.total_cargos)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">
                          Movimientos del Extracto
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Total:</span>
                          <span className="font-semibold">
                            {reporteDiferencias.movimientos_extracto.total}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Conciliados:</span>
                          <span className="font-semibold text-green-600">
                            {reporteDiferencias.movimientos_extracto.conciliados}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Pendientes:</span>
                          <span
                            className={`font-semibold ${
                              reporteDiferencias.movimientos_extracto.pendientes > 0
                                ? 'text-red-600'
                                : 'text-gray-600'
                            }`}
                          >
                            {reporteDiferencias.movimientos_extracto.pendientes}
                          </span>
                        </div>
                        <div className="pt-2 border-t">
                          <div className="flex justify-between text-sm">
                            <span>Abonos:</span>
                            <span className="font-semibold text-green-600">
                              {formatCurrency(reporteDiferencias.movimientos_extracto.total_abonos)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Cargos:</span>
                            <span className="font-semibold text-red-600">
                              {formatCurrency(reporteDiferencias.movimientos_extracto.total_cargos)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Metrics */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-600">
                        Métricas de Conciliación
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-600">Sistema</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {reporteDiferencias.metricas.porcentaje_conciliado_sistema.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Extracto</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {reporteDiferencias.metricas.porcentaje_conciliado_extracto.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">General</p>
                          <p className="text-2xl font-bold text-green-600">
                            {reporteDiferencias.metricas.porcentaje_conciliado_general.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pending Items Warning */}
                  {(reporteDiferencias.movimientos_sistema.pendientes > 0 ||
                    reporteDiferencias.movimientos_extracto.pendientes > 0) && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h4 className="font-semibold text-yellow-900 mb-2">
                        ⚠️ Advertencia: Movimientos Pendientes
                      </h4>
                      <p className="text-sm text-yellow-800 mb-3">
                        Hay movimientos sin conciliar. Se recomienda conciliar todos los movimientos
                        antes de cerrar. Si continúa, estos movimientos quedarán sin conciliar.
                      </p>
                      {reporteDiferencias.movimientos_sistema.pendientes_detalle.length > 0 && (
                        <div className="mb-3">
                          <p className="text-sm font-semibold text-yellow-900 mb-1">
                            Movimientos del Sistema Pendientes:
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {reporteDiferencias.movimientos_sistema.pendientes_detalle.map(
                              (mov: any) => (
                                <div
                                  key={mov.id}
                                  className="text-xs bg-white rounded px-2 py-1 flex justify-between"
                                >
                                  <span>
                                    {mov.fecha} - {mov.descripcion}
                                  </span>
                                  <span className="font-semibold">{formatCurrency(mov.monto)}</span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                      {reporteDiferencias.movimientos_extracto.pendientes_detalle.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-yellow-900 mb-1">
                            Movimientos del Extracto Pendientes:
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {reporteDiferencias.movimientos_extracto.pendientes_detalle.map(
                              (mov: any) => (
                                <div
                                  key={mov.id}
                                  className="text-xs bg-white rounded px-2 py-1 flex justify-between"
                                >
                                  <span>
                                    {mov.fecha} - {mov.descripcion}
                                  </span>
                                  <span className="font-semibold">{formatCurrency(mov.monto)}</span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Success Message */}
                  {reporteDiferencias.movimientos_sistema.pendientes === 0 &&
                    reporteDiferencias.movimientos_extracto.pendientes === 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h4 className="font-semibold text-green-900 mb-2">
                          ✓ Listo para Cerrar
                        </h4>
                        <p className="text-sm text-green-800">
                          Todos los movimientos han sido conciliados. La conciliación está lista para
                          ser cerrada.
                        </p>
                      </div>
                    )}

                  {/* Actions */}
                  <div className="flex gap-3 justify-end pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setShowCloseModal(false)}
                      disabled={closingConciliacion}
                    >
                      Cancelar
                    </Button>
                    {(reporteDiferencias.movimientos_sistema.pendientes > 0 ||
                      reporteDiferencias.movimientos_extracto.pendientes > 0) && (
                      <Button
                        onClick={() => handleCerrarConciliacion(true)}
                        disabled={closingConciliacion}
                        className="bg-yellow-600 hover:bg-yellow-700"
                      >
                        {closingConciliacion ? 'Cerrando...' : 'Forzar Cierre'}
                      </Button>
                    )}
                    <Button
                      onClick={() => handleCerrarConciliacion(false)}
                      disabled={
                        closingConciliacion ||
                        reporteDiferencias.movimientos_sistema.pendientes > 0 ||
                        reporteDiferencias.movimientos_extracto.pendientes > 0
                      }
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {closingConciliacion ? 'Cerrando...' : 'Cerrar Conciliación'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-600 py-12">
                  No se pudo cargar el reporte de diferencias
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
