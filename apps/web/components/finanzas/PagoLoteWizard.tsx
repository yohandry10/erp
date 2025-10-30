'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { SeleccionarCxpLote } from './SeleccionarCxpLote';
import { Badge } from '../ui/badge';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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

interface PagoLoteWizardProps {
  cuentasBancarias: CuentaBancaria[];
  cxpsDisponibles: CuentaPorPagar[];
  onSubmit: (data: {
    pagos: Array<{ cxp_id: string; monto?: number }>;
    fecha_pago: string;
    metodo_pago: string;
    cuenta_bancaria_id: string;
    referencia_lote?: string;
    observaciones?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

type WizardStep = 'seleccion-cuenta' | 'seleccion-cxp' | 'confirmacion';

export function PagoLoteWizard({
  cuentasBancarias,
  cxpsDisponibles,
  onSubmit,
  onCancel,
}: PagoLoteWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('seleccion-cuenta');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Datos del formulario
  const [cuentaBancariaId, setCuentaBancariaId] = useState<string>('');
  const [fechaPago, setFechaPago] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [metodoPago, setMetodoPago] = useState<string>('TRANSFERENCIA');
  const [referenciaLote, setReferenciaLote] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  // Selección de CxPs
  const [selectedCxpIds, setSelectedCxpIds] = useState<string[]>([]);
  const [montosParciales, setMontosParciales] = useState<Record<string, number>>({});

  // Obtener cuenta bancaria seleccionada
  const cuentaSeleccionada = cuentasBancarias.find((c) => c.id === cuentaBancariaId);

  // Filtrar CxPs por moneda de la cuenta seleccionada
  const cxpsFiltradas = cuentaSeleccionada
    ? cxpsDisponibles.filter((cxp) => cxp.moneda === cuentaSeleccionada.moneda)
    : [];

  // Calcular monto total del lote
  const montoTotalLote = selectedCxpIds.reduce((sum, id) => {
    const cxp = cxpsDisponibles.find((c) => c.id === id);
    if (!cxp) return sum;
    const monto = montosParciales[id] !== undefined ? montosParciales[id] : cxp.saldo;
    return sum + monto;
  }, 0);

  // Validar saldo suficiente
  const saldoSuficiente = cuentaSeleccionada
    ? cuentaSeleccionada.saldo >= montoTotalLote
    : false;

  // Manejar cambio de selección de CxPs
  const handleSelectionChange = (ids: string[], montos: Record<string, number>) => {
    setSelectedCxpIds(ids);
    setMontosParciales(montos);
  };

  // Manejar envío del formulario
  const handleSubmit = async () => {
    if (!cuentaBancariaId || selectedCxpIds.length === 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const pagos = selectedCxpIds.map((cxpId) => ({
        cxp_id: cxpId,
        monto: montosParciales[cxpId],
      }));

      await onSubmit({
        pagos,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        cuenta_bancaria_id: cuentaBancariaId,
        referencia_lote: referenciaLote || undefined,
        observaciones: observaciones || undefined,
      });
    } catch (error) {
      console.error('Error al procesar pago en lote:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Renderizar paso 1: Selección de cuenta bancaria
  const renderSeleccionCuenta = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Paso 1: Seleccionar Cuenta Bancaria</h3>
        <p className="text-sm text-muted-foreground">
          Seleccione la cuenta bancaria desde la que se realizarán los pagos
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="cuenta-bancaria">Cuenta Bancaria *</Label>
          <Select value={cuentaBancariaId} onValueChange={setCuentaBancariaId}>
            <SelectTrigger id="cuenta-bancaria">
              <SelectValue placeholder="Seleccione una cuenta" />
            </SelectTrigger>
            <SelectContent>
              {cuentasBancarias.map((cuenta) => (
                <SelectItem key={cuenta.id} value={cuenta.id}>
                  {cuenta.nombre} - {cuenta.banco} ({cuenta.numero_cuenta}) - Saldo:{' '}
                  {cuenta.moneda} {cuenta.saldo.toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {cuentaSeleccionada && (
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Banco</div>
                <div className="font-semibold">{cuentaSeleccionada.banco}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Número de Cuenta</div>
                <div className="font-semibold">{cuentaSeleccionada.numero_cuenta}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Moneda</div>
                <div className="font-semibold">{cuentaSeleccionada.moneda}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Saldo Disponible</div>
                <div className="font-semibold text-green-600">
                  {cuentaSeleccionada.moneda} {cuentaSeleccionada.saldo.toFixed(2)}
                </div>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fecha-pago">Fecha de Pago *</Label>
            <Input
              id="fecha-pago"
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="metodo-pago">Método de Pago *</Label>
            <Select value={metodoPago} onValueChange={setMetodoPago}>
              <SelectTrigger id="metodo-pago">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="EFECTIVO">Efectivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="referencia-lote">Referencia del Lote (Opcional)</Label>
          <Input
            id="referencia-lote"
            placeholder="Ej: LOTE-2025-001"
            value={referenciaLote}
            onChange={(e) => setReferenciaLote(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => setCurrentStep('seleccion-cxp')}
          disabled={!cuentaBancariaId}
        >
          Siguiente: Seleccionar CxP
        </Button>
      </div>
    </div>
  );

  // Renderizar paso 2: Selección de CxPs
  const renderSeleccionCxp = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Paso 2: Seleccionar Cuentas por Pagar</h3>
        <p className="text-sm text-muted-foreground">
          Seleccione las cuentas por pagar que desea incluir en el lote de pagos
        </p>
      </div>

      {cuentaSeleccionada && (
        <Card className="p-3 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="text-muted-foreground">Cuenta: </span>
              <span className="font-semibold">{cuentaSeleccionada.nombre}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Saldo: </span>
              <span className="font-semibold text-green-600">
                {cuentaSeleccionada.moneda} {cuentaSeleccionada.saldo.toFixed(2)}
              </span>
            </div>
          </div>
        </Card>
      )}

      <SeleccionarCxpLote
        cxps={cxpsFiltradas}
        onSelectionChange={handleSelectionChange}
        monedaFiltro={cuentaSeleccionada?.moneda}
      />

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setCurrentStep('seleccion-cuenta')}>
          Atrás
        </Button>
        <Button
          type="button"
          onClick={() => setCurrentStep('confirmacion')}
          disabled={selectedCxpIds.length === 0}
        >
          Siguiente: Confirmar
        </Button>
      </div>
    </div>
  );

  // Renderizar paso 3: Confirmación
  const renderConfirmacion = () => {
    const cxpsSeleccionadas = cxpsDisponibles.filter((cxp) =>
      selectedCxpIds.includes(cxp.id)
    );

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Paso 3: Confirmar Pago en Lote</h3>
          <p className="text-sm text-muted-foreground">
            Revise los detalles del lote de pagos antes de confirmar
          </p>
        </div>

        {/* Resumen de la cuenta bancaria */}
        {cuentaSeleccionada && (
          <Card className="p-4">
            <h4 className="font-semibold mb-3">Cuenta Bancaria</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Banco</div>
                <div className="font-semibold">{cuentaSeleccionada.banco}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Cuenta</div>
                <div className="font-semibold">{cuentaSeleccionada.numero_cuenta}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Saldo Actual</div>
                <div className="font-semibold">
                  {cuentaSeleccionada.moneda} {cuentaSeleccionada.saldo.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Saldo Después</div>
                <div
                  className={`font-semibold ${
                    saldoSuficiente ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {cuentaSeleccionada.moneda}{' '}
                  {(cuentaSeleccionada.saldo - montoTotalLote).toFixed(2)}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Validación de saldo */}
        {!saldoSuficiente && (
          <Card className="p-4 bg-red-50 border-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <div className="font-semibold text-red-900">Saldo Insuficiente</div>
                <div className="text-sm text-red-700">
                  El saldo de la cuenta bancaria no es suficiente para procesar este lote de
                  pagos. Falta: {cuentaSeleccionada?.moneda}{' '}
                  {(montoTotalLote - (cuentaSeleccionada?.saldo || 0)).toFixed(2)}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Detalles del pago */}
        <Card className="p-4">
          <h4 className="font-semibold mb-3">Detalles del Pago</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Fecha de Pago</div>
              <div className="font-semibold">
                {new Date(fechaPago).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Método de Pago</div>
              <div className="font-semibold">{metodoPago}</div>
            </div>
            {referenciaLote && (
              <div className="col-span-2">
                <div className="text-muted-foreground">Referencia</div>
                <div className="font-semibold">{referenciaLote}</div>
              </div>
            )}
          </div>
        </Card>

        {/* Lista de CxPs seleccionadas */}
        <Card className="p-4">
          <h4 className="font-semibold mb-3">
            Cuentas por Pagar ({cxpsSeleccionadas.length})
          </h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {cxpsSeleccionadas.map((cxp) => {
              const montoPago =
                montosParciales[cxp.id] !== undefined ? montosParciales[cxp.id] : cxp.saldo;

              return (
                <div
                  key={cxp.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                >
                  <div className="flex-1">
                    <div className="font-semibold">{cxp.proveedor.razon_social}</div>
                    <div className="text-muted-foreground">
                      Doc: {cxp.numero_documento} | Saldo: {cxp.moneda} {cxp.saldo.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-orange-600">
                      {cxp.moneda} {montoPago.toFixed(2)}
                    </div>
                    {montoPago < cxp.saldo && (
                      <Badge variant="secondary" className="text-xs">
                        Pago Parcial
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Resumen total */}
        <Card className="p-4 bg-primary/5 border-primary">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Total del Lote</div>
              <div className="text-sm text-muted-foreground">
                {selectedCxpIds.length} cuenta{selectedCxpIds.length !== 1 ? 's' : ''} por pagar
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                {cuentaSeleccionada?.moneda} {montoTotalLote.toFixed(2)}
              </div>
            </div>
          </div>
        </Card>

        {/* Observaciones */}
        <div>
          <Label htmlFor="observaciones">Observaciones (Opcional)</Label>
          <Textarea
            id="observaciones"
            placeholder="Agregue observaciones sobre este lote de pagos..."
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => setCurrentStep('seleccion-cxp')}>
            Atrás
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!saldoSuficiente || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirmar y Procesar Lote
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  // Renderizar el paso actual
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'seleccion-cuenta':
        return renderSeleccionCuenta();
      case 'seleccion-cxp':
        return renderSeleccionCxp();
      case 'confirmacion':
        return renderConfirmacion();
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Indicador de pasos */}
      <div className="flex items-center justify-center gap-2">
        <div
          className={`flex items-center gap-2 ${
            currentStep === 'seleccion-cuenta' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep === 'seleccion-cuenta'
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-200'
            }`}
          >
            1
          </div>
          <span className="text-sm font-medium hidden md:inline">Cuenta</span>
        </div>

        <div className="w-12 h-0.5 bg-gray-300" />

        <div
          className={`flex items-center gap-2 ${
            currentStep === 'seleccion-cxp' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep === 'seleccion-cxp'
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-200'
            }`}
          >
            2
          </div>
          <span className="text-sm font-medium hidden md:inline">Selección</span>
        </div>

        <div className="w-12 h-0.5 bg-gray-300" />

        <div
          className={`flex items-center gap-2 ${
            currentStep === 'confirmacion' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep === 'confirmacion'
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-200'
            }`}
          >
            3
          </div>
          <span className="text-sm font-medium hidden md:inline">Confirmar</span>
        </div>
      </div>

      {/* Contenido del paso actual */}
      {renderCurrentStep()}
    </div>
  );
}
