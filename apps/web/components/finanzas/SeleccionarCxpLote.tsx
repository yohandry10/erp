'use client';

import React, { useState, useEffect } from 'react';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { parseDateLocal } from '@/lib/date-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

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

interface SeleccionarCxpLoteProps {
  cxps: CuentaPorPagar[];
  onSelectionChange: (selectedIds: string[], montosParciales: Record<string, number>) => void;
  monedaFiltro?: string;
}

export function SeleccionarCxpLote({
  cxps,
  onSelectionChange,
  monedaFiltro,
}: SeleccionarCxpLoteProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [montosParciales, setMontosParciales] = useState<Record<string, number>>({});
  const [filtroProveedor, setFiltroProveedor] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroUrgencia, setFiltroUrgencia] = useState<string>('TODAS');

  // Filtrar CxPs
  const cxpsFiltradas = cxps.filter((cxp) => {
    // Filtro por moneda (si se especifica)
    if (monedaFiltro && cxp.moneda !== monedaFiltro) {
      return false;
    }

    // Filtro por proveedor
    if (filtroProveedor && !cxp.proveedor.razon_social.toLowerCase().includes(filtroProveedor.toLowerCase())) {
      return false;
    }

    // Filtro por estado
    if (filtroEstado !== 'TODOS' && cxp.estado !== filtroEstado) {
      return false;
    }

    // Filtro por urgencia
    if (filtroUrgencia !== 'TODAS' && cxp.urgencia !== filtroUrgencia) {
      return false;
    }

    return true;
  });

  // Obtener lista única de proveedores
  const proveedores = Array.from(
    new Set(cxps.map((cxp) => JSON.stringify({ id: cxp.proveedor.id, razon_social: cxp.proveedor.razon_social })))
  ).map((str) => JSON.parse(str));

  // Calcular totales
  const totalSeleccionado = Array.from(selectedIds).reduce((sum, id) => {
    const cxp = cxps.find((c) => c.id === id);
    if (!cxp) return sum;
    const monto = montosParciales[id] !== undefined ? montosParciales[id] : cxp.saldo;
    return sum + monto;
  }, 0);

  const cantidadSeleccionada = selectedIds.size;

  // Manejar selección de CxP
  const handleToggleSelection = (cxpId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(cxpId)) {
      newSelected.delete(cxpId);
      // Limpiar monto parcial si se deselecciona
      const newMontos = { ...montosParciales };
      delete newMontos[cxpId];
      setMontosParciales(newMontos);
    } else {
      newSelected.add(cxpId);
    }
    setSelectedIds(newSelected);
  };

  // Manejar cambio de monto parcial
  const handleMontoChange = (cxpId: string, monto: string) => {
    const montoNumerico = parseFloat(monto);
    if (!isNaN(montoNumerico) && montoNumerico > 0) {
      setMontosParciales({
        ...montosParciales,
        [cxpId]: montoNumerico,
      });
    } else {
      // Si el monto es inválido, remover del objeto
      const newMontos = { ...montosParciales };
      delete newMontos[cxpId];
      setMontosParciales(newMontos);
    }
  };

  // Seleccionar todas las CxPs filtradas
  const handleSelectAll = () => {
    const allIds = new Set(cxpsFiltradas.map((cxp) => cxp.id));
    setSelectedIds(allIds);
  };

  // Deseleccionar todas
  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    setMontosParciales({});
  };

  // Notificar cambios al componente padre
  useEffect(() => {
    onSelectionChange(Array.from(selectedIds), montosParciales);
  }, [montosParciales, onSelectionChange, selectedIds]);

  // Obtener badge de urgencia
  const getUrgenciaBadge = (urgencia?: string) => {
    switch (urgencia) {
      case 'VENCIDA':
        return <Badge variant="destructive">Vencida</Badge>;
      case 'HOY':
        return <Badge variant="destructive">Vence Hoy</Badge>;
      case 'URGENTE':
        return <Badge variant="default" className="bg-orange-500">Urgente (1-7 días)</Badge>;
      case 'PROXIMA':
        return <Badge variant="secondary">Próxima (8-15 días)</Badge>;
      case 'NORMAL':
        return <Badge variant="outline">Normal (&gt;15 días)</Badge>;
      default:
        return null;
    }
  };

  // Obtener badge de estado
  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'PENDIENTE':
        return <Badge variant="secondary">Pendiente</Badge>;
      case 'PARCIAL':
        return <Badge variant="default" className="bg-blue-500">Parcial</Badge>;
      case 'VENCIDA':
        return <Badge variant="destructive">Vencida</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="filtro-proveedor">Buscar Proveedor</Label>
            <Input
              id="filtro-proveedor"
              placeholder="Nombre o RUC..."
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="filtro-estado">Estado</Label>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger id="filtro-estado">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                <SelectItem value="PARCIAL">Parcial</SelectItem>
                <SelectItem value="VENCIDA">Vencida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="filtro-urgencia">Urgencia</Label>
            <Select value={filtroUrgencia} onValueChange={setFiltroUrgencia}>
              <SelectTrigger id="filtro-urgencia">
                <SelectValue placeholder="Todas las urgencias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas</SelectItem>
                <SelectItem value="VENCIDA">Vencida</SelectItem>
                <SelectItem value="HOY">Vence Hoy</SelectItem>
                <SelectItem value="URGENTE">Urgente (1-7 días)</SelectItem>
                <SelectItem value="PROXIMA">Próxima (8-15 días)</SelectItem>
                <SelectItem value="NORMAL">Normal (&gt;15 días)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Acciones de selección */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={cxpsFiltradas.length === 0}
          >
            Seleccionar Todas ({cxpsFiltradas.length})
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeselectAll}
            disabled={selectedIds.size === 0}
          >
            Deseleccionar Todas
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          <span className="font-semibold">{cantidadSeleccionada}</span> seleccionadas |{' '}
          <span className="font-semibold">
            {monedaFiltro || 'PEN'} {totalSeleccionado.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Lista de CxPs */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {cxpsFiltradas.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No hay cuentas por pagar que coincidan con los filtros
          </Card>
        ) : (
          cxpsFiltradas.map((cxp) => {
            const isSelected = selectedIds.has(cxp.id);
            const montoParcial = montosParciales[cxp.id];

            return (
              <Card
                key={cxp.id}
                className={`p-4 transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <div className="pt-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleSelection(cxp.id)}
                    />
                  </div>

                  {/* Información de la CxP */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">{cxp.proveedor.razon_social}</div>
                        <div className="text-sm text-muted-foreground">
                          RUC: {cxp.proveedor.ruc} | Doc: {cxp.numero_documento}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {getEstadoBadge(cxp.estado)}
                        {getUrgenciaBadge(cxp.urgencia)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Emisión</div>
                        <div>{parseDateLocal(cxp.fecha_emision).toLocaleDateString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Vencimiento</div>
                        <div>{parseDateLocal(cxp.fecha_vencimiento).toLocaleDateString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Total</div>
                        <div className="font-semibold">
                          {cxp.moneda} {cxp.total.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Saldo</div>
                        <div className="font-semibold text-amber-400">
                          {cxp.moneda} {cxp.saldo.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Input para monto parcial */}
                    {isSelected && (
                      <div className="pt-2 border-t">
                        <Label htmlFor={`monto-${cxp.id}`} className="text-xs">
                          Monto a pagar (dejar vacío para pagar saldo completo)
                        </Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id={`monto-${cxp.id}`}
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={cxp.saldo}
                            placeholder={`Máximo: ${cxp.saldo.toFixed(2)}`}
                            value={montoParcial !== undefined ? montoParcial : ''}
                            onChange={(e) => handleMontoChange(cxp.id, e.target.value)}
                            className="max-w-xs"
                          />
                          <span className="text-sm text-muted-foreground">
                            {montoParcial !== undefined
                              ? `Pagando: ${cxp.moneda} ${montoParcial.toFixed(2)}`
                              : `Pagando saldo completo: ${cxp.moneda} ${cxp.saldo.toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Resumen final */}
      {selectedIds.size > 0 && (
        <Card className="p-4 bg-primary/5 border-primary">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Resumen de Selección</div>
              <div className="text-sm text-muted-foreground">
                {cantidadSeleccionada} cuenta{cantidadSeleccionada !== 1 ? 's' : ''} por pagar seleccionada
                {cantidadSeleccionada !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Monto Total</div>
              <div className="text-2xl font-bold">
                {monedaFiltro || 'PEN'} {totalSeleccionado.toFixed(2)}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
