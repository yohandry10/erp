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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getRowStyle = (
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
      return {
        background: isSistema ? '#dbeafe' : '#d1fae5',
        borderLeft: `4px solid ${isSistema ? '#3b82f6' : '#10b981'}`,
      };
    }
    if (movimiento.conciliado && highlightMatches) {
      // Highlight automatic matches with a distinct style
      if (movimiento.match_automatico) {
        const baseStyle = {
          background: 'linear-gradient(90deg, #ecfdf5 0%, #d1fae5 100%)',
          borderLeft: '4px solid #10b981',
          boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.2)',
        };
        
        // Enhanced highlight when hovering over matched pair
        if (isMatchedPairHovered) {
          return {
            ...baseStyle,
            background: 'linear-gradient(90deg, #d1fae5 0%, #a7f3d0 100%)',
            boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.4), 0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            transform: 'scale(1.01)',
          };
        }
        
        return baseStyle;
      }
      return {
        background: '#f0fdf4',
        borderLeft: '4px solid #10b981',
      };
    }
    if (isHovered) {
      return {
        background: '#f9fafb',
      };
    }
    return {
      background: 'white',
    };
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
    
    // Add visual feedback
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedItem(null);
    setDropTarget(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
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
    const rowStyle = getRowStyle(movimiento, isSelected, isHovered, isSistema);
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
        style={{
          ...rowStyle,
          cursor: canBeDragged ? 'grab' : readOnly ? 'default' : 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          borderBottom: '1px solid #e5e7eb',
          opacity: isDragging ? 0.5 : 1,
          ...(isDropTarget && {
            background: 'linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)',
            borderLeft: '4px solid #f59e0b',
            boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.4), 0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            transform: 'scale(1.02)',
          }),
        }}
      >
        {/* Status Icon */}
        <td style={{ padding: '0.75rem', width: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {canBeDragged && (
              <Move 
                size={14} 
                style={{ 
                  color: '#9ca3af',
                  cursor: 'grab',
                  flexShrink: 0
                }} 
                title="Arrastrar para conciliar"
              />
            )}
            {movimiento.conciliado ? (
              movimiento.match_automatico ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <CheckCircle size={18} style={{ color: '#10b981' }} />
                  <Link2
                    size={10}
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      color: '#3b82f6',
                      background: 'white',
                      borderRadius: '50%',
                    }}
                  />
                </div>
              ) : (
                <CheckCircle size={18} style={{ color: '#10b981' }} />
              )
            ) : (
              <Clock size={18} style={{ color: '#f59e0b' }} />
            )}
          </div>
        </td>

        {/* Fecha */}
        <td style={{ padding: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#374151' }}>
            {formatDate(movimiento.fecha)}
          </span>
        </td>

        {/* Tipo */}
        <td style={{ padding: '0.75rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.25rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '600',
              background:
                movimiento.tipo === 'ABONO'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
              color: movimiento.tipo === 'ABONO' ? '#10b981' : '#ef4444',
            }}
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
        <td style={{ padding: '0.75rem', maxWidth: '250px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                fontSize: '0.875rem',
                color: '#111827',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
              title={movimiento.descripcion}
            >
              {movimiento.descripcion}
            </div>
            {movimiento.match_automatico && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.125rem 0.375rem',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  borderRadius: '4px',
                  fontSize: '0.625rem',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.025em',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                }}
                title="Match realizado automáticamente"
              >
                <Link2 size={10} />
                Auto
              </span>
            )}
          </div>
          {movimiento.referencia && (
            <div
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                marginTop: '0.125rem',
                fontFamily: 'monospace',
              }}
            >
              Ref: {movimiento.referencia}
            </div>
          )}
        </td>

        {/* Monto */}
        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: '700',
              color: movimiento.tipo === 'ABONO' ? '#10b981' : '#ef4444',
            }}
          >
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Legend and Statistics */}
      {highlightMatches && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Legend */}
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              padding: '1rem',
              background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              border: '1px solid #e5e7eb',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} style={{ color: '#f59e0b' }} />
              <span style={{ color: '#374151', fontWeight: '500' }}>Pendiente</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={16} style={{ color: '#10b981' }} />
              <span style={{ color: '#374151', fontWeight: '500' }}>Conciliado Manual</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <CheckCircle size={16} style={{ color: '#10b981' }} />
                <Link2
                  size={8}
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    color: '#3b82f6',
                    background: 'white',
                    borderRadius: '50%',
                  }}
                />
              </div>
              <span style={{ color: '#374151', fontWeight: '500' }}>
                Match Automático
              </span>
              <span
                style={{
                  padding: '0.125rem 0.5rem',
                  background: 'linear-gradient(90deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: '#065f46',
                  fontWeight: '600',
                }}
              >
                Resaltado
              </span>
            </div>
            {!readOnly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Move size={16} style={{ color: '#9ca3af' }} />
                <span style={{ color: '#374151', fontWeight: '500' }}>
                  Arrastra entre columnas para conciliar
                </span>
              </div>
            )}
          </div>

          {/* Statistics */}
          {totalConciliados > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
                padding: '1rem',
                background: 'white',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Total Conciliados
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
                  {totalConciliados}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Matches Automáticos
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>
                  {matchesAutomaticos}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Matches Manuales
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
                  {matchesManuales}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  % Automático
                </div>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: porcentajeAutomatico >= 80 ? '#10b981' : porcentajeAutomatico >= 50 ? '#f59e0b' : '#ef4444',
                  }}
                >
                  {porcentajeAutomatico}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dual Table - Pendientes */}
      <div>
        <h3
          style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '1rem',
          }}
        >
          Movimientos Pendientes de Conciliar
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Sistema */}
          <div
            style={{
              border: '2px solid #3b82f6',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: '#3b82f6',
                color: 'white',
                padding: '0.75rem 1rem',
                fontWeight: '600',
                fontSize: '0.875rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>MOVIMIENTOS DEL SISTEMA</span>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                }}
              >
                {movimientosSistemaPendientes.length}
              </span>
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {movimientosSistemaPendientes.length === 0 ? (
                <div
                  style={{
                    padding: '3rem',
                    textAlign: 'center',
                    color: '#6b7280',
                  }}
                >
                  <CheckCircle
                    size={48}
                    style={{ margin: '0 auto 1rem', color: '#10b981' }}
                  />
                  <p style={{ fontSize: '0.875rem' }}>
                    Todos los movimientos del sistema están conciliados
                  </p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '0.5rem', width: '60px' }}></th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Fecha
                      </th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Tipo
                      </th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Descripción
                      </th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'right',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
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
          <div
            style={{
              border: '2px solid #10b981',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: '#10b981',
                color: 'white',
                padding: '0.75rem 1rem',
                fontWeight: '600',
                fontSize: '0.875rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>MOVIMIENTOS DEL EXTRACTO</span>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                }}
              >
                {movimientosExtractoPendientes.length}
              </span>
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {movimientosExtractoPendientes.length === 0 ? (
                <div
                  style={{
                    padding: '3rem',
                    textAlign: 'center',
                    color: '#6b7280',
                  }}
                >
                  <AlertCircle
                    size={48}
                    style={{ margin: '0 auto 1rem', color: '#f59e0b' }}
                  />
                  <p style={{ fontSize: '0.875rem' }}>
                    No hay movimientos del extracto pendientes
                  </p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '0.5rem', width: '60px' }}></th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Fecha
                      </th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Tipo
                      </th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'left',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        Descripción
                      </th>
                      <th
                        style={{
                          padding: '0.5rem',
                          textAlign: 'right',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
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
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CheckCircle size={20} style={{ color: '#10b981' }} />
            Movimientos Conciliados ({movimientosSistemaConciliados.length})
          </h3>
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '0.75rem', width: '60px' }}></th>
                    <th
                      style={{
                        padding: '0.75rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                      }}
                    >
                      Fecha
                    </th>
                    <th
                      style={{
                        padding: '0.75rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                      }}
                    >
                      Tipo
                    </th>
                    <th
                      style={{
                        padding: '0.75rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                      }}
                    >
                      Descripción
                    </th>
                    <th
                      style={{
                        padding: '0.75rem',
                        textAlign: 'left',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                      }}
                    >
                      Origen
                    </th>
                    <th
                      style={{
                        padding: '0.75rem',
                        textAlign: 'right',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                      }}
                    >
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
                      style={{
                        background: mov.match_automatico 
                          ? 'linear-gradient(90deg, #ecfdf5 0%, #d1fae5 100%)'
                          : '#f0fdf4',
                        borderBottom: '1px solid #e5e7eb',
                        borderLeft: '4px solid #10b981',
                        boxShadow: mov.match_automatico 
                          ? '0 0 0 1px rgba(16, 185, 129, 0.2)'
                          : 'none',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: hoveredMatchId && mov.match_id && 
                          (mov.id === hoveredMatchId || mov.match_id === hoveredMatchId)
                          ? 'scale(1.01)'
                          : 'scale(1)',
                      }}
                    >
                      <td style={{ padding: '0.75rem' }}>
                        {mov.match_automatico ? (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <CheckCircle size={18} style={{ color: '#10b981' }} />
                            <Link2
                              size={10}
                              style={{
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                color: '#3b82f6',
                                background: 'white',
                                borderRadius: '50%',
                              }}
                            />
                          </div>
                        ) : (
                          <CheckCircle size={18} style={{ color: '#10b981' }} />
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                          {formatDate(mov.fecha)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background:
                              mov.tipo === 'ABONO'
                                ? 'rgba(16, 185, 129, 0.1)'
                                : 'rgba(239, 68, 68, 0.1)',
                            color: mov.tipo === 'ABONO' ? '#10b981' : '#ef4444',
                          }}
                        >
                          {mov.tipo === 'ABONO' ? (
                            <TrendingUp size={12} />
                          ) : (
                            <TrendingDown size={12} />
                          )}
                          {mov.tipo}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div
                            style={{
                              fontSize: '0.875rem',
                              color: '#111827',
                              flex: 1,
                            }}
                          >
                            {mov.descripcion}
                          </div>
                          {mov.match_automatico && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.125rem 0.375rem',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '0.625rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.025em',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                              }}
                              title="Match realizado automáticamente"
                            >
                              <Link2 size={10} />
                              Auto
                            </span>
                          )}
                        </div>
                        {mov.referencia && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              marginTop: '0.125rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            Ref: {mov.referencia}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            background: mov.es_extracto ? '#d1fae5' : '#dbeafe',
                            color: mov.es_extracto ? '#065f46' : '#1e40af',
                          }}
                        >
                          {mov.es_extracto ? 'Extracto' : 'Sistema'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: '0.875rem',
                            fontWeight: '700',
                            color: mov.tipo === 'ABONO' ? '#10b981' : '#ef4444',
                          }}
                        >
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
