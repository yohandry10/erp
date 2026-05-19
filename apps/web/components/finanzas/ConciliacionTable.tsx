'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Clock, 
  TrendingUp, 
  TrendingDown,
  Link2,
  AlertCircle,
  Move
} from 'lucide-react';
import { formatDate } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500';
const tdClass = 'px-3 py-3 text-sm text-slate-700';
const amountClass = 'text-sm font-bold text-blue-700';
const statusIconClass = 'text-blue-600';
const mutedIconClass = 'text-slate-400';
const panelHeaderClass = 'flex items-center justify-between bg-blue-600 px-4 py-3 text-sm font-semibold text-white';

interface MovimientoBancario {
  id: string;
  fecha: string;
  tipo: 'ABONO' | 'CARGO';
  monto: number;
  descripcion: string;
  referencia?: string;
  conciliado: boolean;
  es_extracto: boolean;
  match_id?: string; // ID del movimiento con el que está matcheado
  match_automatico?: boolean; // Indica si fue un match automático
}

interface ConciliacionTableProps {
  movimientosSistema: MovimientoBancario[];
  movimientosExtracto: MovimientoBancario[];
  onSelectSistema?: (id: string) => void;
  onSelectExtracto?: (id: string) => void;
  selectedSistemaId?: string | null;
  selectedExtractoId?: string | null;
  highlightMatches?: boolean;
  readOnly?: boolean;
  onDragMatch?: (sistemaId: string, extractoId: string) => void;
}

export default function ConciliacionTable({
  movimientosSistema,
  movimientosExtracto,
  onSelectSistema,
  onSelectExtracto,
  selectedSistemaId,
  selectedExtractoId,
  highlightMatches = true,
  readOnly = false,
  onDragMatch,
}: ConciliacionTableProps) {
  const [hoveredSistemaId, setHoveredSistemaId] = useState<string | null>(null);
  const [hoveredExtractoId, setHoveredExtractoId] = useState<string | null>(null);
  const [hoveredMatchId, setHoveredMatchId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ id: string; isSistema: boolean } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount);
  };

  const getRowClass = (
    movimiento: MovimientoBancario,
    isSelected: boolean,
    isHovered: boolean,
    isSistema: boolean
  ) => {
    // Highlight matched pair when hovering over one of them
    const isMatchedPairHovered = 
      hoveredMatchId && 
      movimiento.match_id && 
      (movimiento.id === hoveredMatchId || movimiento.match_id === hoveredMatchId);

    if (isSelected) {
      return isSistema
        ? 'border-l-4 border-l-blue-600 bg-blue-50'
        : 'border-l-4 border-l-cyan-600 bg-cyan-50';
    }
    if (movimiento.conciliado && highlightMatches) {
      if (movimiento.match_automatico) {
        return cn(
          'border-l-4 border-l-cyan-500 bg-cyan-50/80 shadow-[inset_0_0_0_1px_rgba(14,116,144,0.12)]',
          isMatchedPairHovered && 'scale-[1.01] bg-cyan-100 shadow-[inset_0_0_0_2px_rgba(14,116,144,0.22)]'
        );
      }
      return 'border-l-4 border-l-cyan-500 bg-cyan-50/60';
    }
    if (isHovered) {
      return 'bg-slate-50';
    }
    return 'bg-white';
  };

  const handleRowClick = (id: string, isSistema: boolean) => {
    if (readOnly) return;
    if (isSistema && onSelectSistema) {
      onSelectSistema(id);
    } else if (!isSistema && onSelectExtracto) {
      onSelectExtracto(id);
    }
  };

  const handleDragStart = (e: React.DragEvent, movimiento: MovimientoBancario, isSistema: boolean) => {
    if (readOnly || movimiento.conciliado) {
      e.preventDefault();
      return;
    }
    setDraggedItem({ id: movimiento.id, isSistema });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', movimiento.id);
    
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, movimiento: MovimientoBancario, isSistema: boolean) => {
    if (readOnly || movimiento.conciliado || !draggedItem) {
      return;
    }

    // Only allow drop if dragging from opposite side and same tipo
    if (draggedItem.isSistema !== isSistema) {
      const draggedMovimiento = draggedItem.isSistema
        ? movimientosSistema.find(m => m.id === draggedItem.id)
        : movimientosExtracto.find(m => m.id === draggedItem.id);
      
      if (draggedMovimiento && draggedMovimiento.tipo === movimiento.tipo) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(movimiento.id);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetMovimiento: MovimientoBancario, targetIsSistema: boolean) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedItem || !onDragMatch || readOnly) {
      setDraggedItem(null);
      return;
    }

    // Validate: must be from opposite sides and same tipo
    if (draggedItem.isSistema === targetIsSistema) {
      setDraggedItem(null);
      return;
    }

    const draggedMovimiento = draggedItem.isSistema
      ? movimientosSistema.find(m => m.id === draggedItem.id)
      : movimientosExtracto.find(m => m.id === draggedItem.id);

    if (!draggedMovimiento || draggedMovimiento.tipo !== targetMovimiento.tipo) {
      setDraggedItem(null);
      return;
    }

    // Perform the match
    const sistemaId = draggedItem.isSistema ? draggedItem.id : targetMovimiento.id;
    const extractoId = draggedItem.isSistema ? targetMovimiento.id : draggedItem.id;
    
    onDragMatch(sistemaId, extractoId);
    setDraggedItem(null);
  };

  const renderMovimientoRow = (
    movimiento: MovimientoBancario,
    isSelected: boolean,
    isHovered: boolean,
    isSistema: boolean
  ) => {
    const rowClass = getRowClass(movimiento, isSelected, isHovered, isSistema);
    const isDropTarget = dropTarget === movimiento.id;
    const isDragging = draggedItem?.id === movimiento.id;
    const canBeDragged = !readOnly && !movimiento.conciliado;
    const canBeDropTarget = !readOnly && !movimiento.conciliado && draggedItem && draggedItem.isSistema !== isSistema;

    const handleMouseEnter = () => {
      if (isSistema) {
        setHoveredSistemaId(movimiento.id);
      } else {
        setHoveredExtractoId(movimiento.id);
      }
      
      // If this is a matched item, highlight its pair
      if (movimiento.conciliado && movimiento.match_id) {
        setHoveredMatchId(movimiento.id);
      }
    };

    const handleMouseLeave = () => {
      if (isSistema) {
        setHoveredSistemaId(null);
      } else {
        setHoveredExtractoId(null);
      }
      setHoveredMatchId(null);
    };

    return (
      <tr
        key={movimiento.id}
        draggable={canBeDragged}
        onDragStart={(e) => handleDragStart(e, movimiento, isSistema)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, movimiento, isSistema)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, movimiento, isSistema)}
        onClick={() => handleRowClick(movimiento.id, isSistema)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'border-b border-slate-200 transition duration-200',
          canBeDragged ? 'cursor-grab' : readOnly ? 'cursor-default' : 'cursor-pointer',
          rowClass,
          isDragging && 'opacity-50',
          isDropTarget && 'scale-[1.01] border-l-4 border-l-blue-500 bg-blue-100 shadow-[inset_0_0_0_2px_rgba(37,99,235,0.22)]'
        )}
      >
        {/* Status Icon */}
        <td className="w-[60px] px-3 py-3">
          <div className="flex items-center gap-1">
            {canBeDragged && (
              <span title="Arrastrar para conciliar">
                <Move 
                  size={14} 
                  className="shrink-0 cursor-grab text-slate-400"
                />
              </span>
            )}
            {movimiento.conciliado ? (
              movimiento.match_automatico ? (
                <div className="relative inline-block">
                  <CheckCircle size={18} className={statusIconClass} />
                  <Link2
                    size={10}
                    className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white text-blue-600"
                  />
                </div>
              ) : (
                <CheckCircle size={18} className={statusIconClass} />
              )
            ) : (
              <Clock size={18} className={mutedIconClass} />
            )}
          </div>
        </td>

        {/* Fecha */}
        <td className={tdClass}>
          <span>
            {formatDate(movimiento.fecha)}
          </span>
        </td>

        {/* Tipo */}
        <td className={tdClass}>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
          >
            {movimiento.tipo === 'ABONO' ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {movimiento.tipo}
          </span>
        </td>

        {/* Descripción */}
        <td className={cn(tdClass, 'max-w-[250px]')}>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 truncate text-sm text-slate-950"
              title={movimiento.descripcion}
            >
              {movimiento.descripcion}
            </div>
            {movimiento.match_automatico && (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-blue-600 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white shadow-sm"
                title="Match realizado automáticamente"
              >
                <Link2 size={10} />
                Auto
              </span>
            )}
          </div>
          {movimiento.referencia && (
            <div className="mt-0.5 font-mono text-xs text-slate-500">
              Ref: {movimiento.referencia}
            </div>
          )}
        </td>

        {/* Monto */}
        <td className={cn(tdClass, 'text-right')}>
          <span className={amountClass}>
            {movimiento.tipo === 'ABONO' ? '+' : '-'} {formatCurrency(movimiento.monto)}
          </span>
        </td>
      </tr>
    );
  };

  const movimientosSistemaPendientes = movimientosSistema.filter((m) => !m.conciliado);
  const movimientosExtractoPendientes = movimientosExtracto.filter((m) => !m.conciliado);
  const movimientosSistemaConciliados = movimientosSistema.filter((m) => m.conciliado);
  const movimientosExtractoConciliados = movimientosExtracto.filter((m) => m.conciliado);
  
  // Calculate automatic match statistics
  const totalConciliados = movimientosSistemaConciliados.length;
  const matchesAutomaticos = movimientosSistemaConciliados.filter((m) => m.match_automatico).length;
  const matchesManuales = totalConciliados - matchesAutomaticos;
  const porcentajeAutomatico = totalConciliados > 0 
    ? Math.round((matchesAutomaticos / totalConciliados) * 100) 
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Legend and Statistics */}
      {highlightMatches && (
        <div className="flex flex-col gap-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock size={16} className={mutedIconClass} />
              <span className="font-medium text-slate-700">Pendiente</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className={statusIconClass} />
              <span className="font-medium text-slate-700">Conciliado Manual</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative inline-block">
                <CheckCircle size={16} className={statusIconClass} />
                <Link2
                  size={8}
                  className="absolute -bottom-px -right-px rounded-full bg-white text-blue-600"
                />
              </div>
              <span className="font-medium text-slate-700">
                Match Automático
              </span>
              <span
                className="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-800"
              >
                Resaltado
              </span>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Move size={16} className={mutedIconClass} />
                <span className="font-medium text-slate-700">
                  Arrastra entre columnas para conciliar
                </span>
              </div>
            )}
          </div>

          {/* Statistics */}
          {totalConciliados > 0 && (
            <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="text-center">
                <div className="mb-1 text-xs text-slate-500">
                  Total Conciliados
                </div>
                <div className="text-2xl font-bold text-slate-950">
                  {totalConciliados}
                </div>
              </div>
              <div className="text-center">
                <div className="mb-1 text-xs text-slate-500">
                  Matches Automáticos
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {matchesAutomaticos}
                </div>
              </div>
              <div className="text-center">
                <div className="mb-1 text-xs text-slate-500">
                  Matches Manuales
                </div>
                <div className="text-2xl font-bold text-cyan-700">
                  {matchesManuales}
                </div>
              </div>
              <div className="text-center">
                <div className="mb-1 text-xs text-slate-500">
                  % Automático
                </div>
                <div className="text-2xl font-bold text-blue-700">
                  {porcentajeAutomatico}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dual Table - Pendientes */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-950">
          Movimientos Pendientes de Conciliar
        </h3>
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Sistema */}
          <div className="overflow-hidden rounded-lg border-2 border-blue-600">
            <div className={panelHeaderClass}>
              <span>MOVIMIENTOS DEL SISTEMA</span>
              <span className="rounded-full bg-white/20 px-2 py-1 text-xs">
                {movimientosSistemaPendientes.length}
              </span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {movimientosSistemaPendientes.length === 0 ? (
                <div className="px-8 py-12 text-center text-slate-500">
                  <CheckCircle
                    size={48}
                    className="mx-auto mb-4 text-blue-600"
                  />
                  <p className="text-sm">
                    Todos los movimientos del sistema están conciliados
                  </p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-[60px] px-2 py-2"></th>
                      <th className={thClass}>
                        Fecha
                      </th>
                      <th className={thClass}>
                        Tipo
                      </th>
                      <th className={thClass}>
                        Descripción
                      </th>
                      <th className={cn(thClass, 'text-right')}>
                        Monto
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosSistemaPendientes.map((mov) =>
                      renderMovimientoRow(
                        mov,
                        selectedSistemaId === mov.id,
                        hoveredSistemaId === mov.id,
                        true
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Extracto */}
          <div className="overflow-hidden rounded-lg border-2 border-cyan-600">
            <div className="flex items-center justify-between bg-cyan-700 px-4 py-3 text-sm font-semibold text-white">
              <span>MOVIMIENTOS DEL EXTRACTO</span>
              <span className="rounded-full bg-white/20 px-2 py-1 text-xs">
                {movimientosExtractoPendientes.length}
              </span>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {movimientosExtractoPendientes.length === 0 ? (
                <div className="px-8 py-12 text-center text-slate-500">
                  <AlertCircle
                    size={48}
                    className="mx-auto mb-4 text-slate-400"
                  />
                  <p className="text-sm">
                    No hay movimientos del extracto pendientes
                  </p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="w-[60px] px-2 py-2"></th>
                      <th className={thClass}>
                        Fecha
                      </th>
                      <th className={thClass}>
                        Tipo
                      </th>
                      <th className={thClass}>
                        Descripción
                      </th>
                      <th className={cn(thClass, 'text-right')}>
                        Monto
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosExtractoPendientes.map((mov) =>
                      renderMovimientoRow(
                        mov,
                        selectedExtractoId === mov.id,
                        hoveredExtractoId === mov.id,
                        false
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Movimientos Conciliados */}
      {(movimientosSistemaConciliados.length > 0 || movimientosExtractoConciliados.length > 0) && (
        <div>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-950">
            <CheckCircle size={20} className={statusIconClass} />
            Movimientos Conciliados ({movimientosSistemaConciliados.length})
          </h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="w-[60px] px-3 py-3"></th>
                    <th className={thClass}>
                      Fecha
                    </th>
                    <th className={thClass}>
                      Tipo
                    </th>
                    <th className={thClass}>
                      Descripción
                    </th>
                    <th className={thClass}>
                      Origen
                    </th>
                    <th className={cn(thClass, 'text-right')}>
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosSistemaConciliados.map((mov) => (
                    <tr
                      key={mov.id}
                      onMouseEnter={() => {
                        if (mov.match_id) setHoveredMatchId(mov.id);
                      }}
                      onMouseLeave={() => setHoveredMatchId(null)}
                      className={cn(
                        'border-b border-slate-200 border-l-4 border-l-cyan-500 bg-cyan-50/70 transition duration-200',
                        mov.match_automatico && 'shadow-[inset_0_0_0_1px_rgba(14,116,144,0.12)]',
                        hoveredMatchId && mov.match_id && (mov.id === hoveredMatchId || mov.match_id === hoveredMatchId) && 'scale-[1.01]'
                      )}
                    >
                      <td className={tdClass}>
                        {mov.match_automatico ? (
                          <div className="relative inline-block">
                            <CheckCircle size={18} className={statusIconClass} />
                            <Link2
                              size={10}
                              className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white text-blue-600"
                            />
                          </div>
                        ) : (
                          <CheckCircle size={18} className={statusIconClass} />
                        )}
                      </td>
                      <td className={tdClass}>
                        <span>
                          {formatDate(mov.fecha)}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                        >
                          {mov.tipo === 'ABONO' ? (
                            <TrendingUp size={12} />
                          ) : (
                            <TrendingDown size={12} />
                          )}
                          {mov.tipo}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-sm text-slate-950">
                            {mov.descripcion}
                          </div>
                          {mov.match_automatico && (
                            <span
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-blue-600 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white shadow-sm"
                              title="Match realizado automáticamente"
                            >
                              <Link2 size={10} />
                              Auto
                            </span>
                          )}
                        </div>
                        {mov.referencia && (
                          <div className="mt-0.5 font-mono text-xs text-slate-500">
                            Ref: {mov.referencia}
                          </div>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span
                          className={cn(
                            'rounded px-2 py-1 text-xs font-semibold',
                            mov.es_extracto ? 'bg-cyan-50 text-cyan-800' : 'bg-blue-50 text-blue-800'
                          )}
                        >
                          {mov.es_extracto ? 'Extracto' : 'Sistema'}
                        </span>
                      </td>
                      <td className={cn(tdClass, 'text-right')}>
                        <span className={amountClass}>
                          {mov.tipo === 'ABONO' ? '+' : '-'} {formatCurrency(mov.monto)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
