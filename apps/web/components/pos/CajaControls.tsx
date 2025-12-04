import React from 'react';
import { HelpIcon } from '@/components/help';

type EstadoCaja = {
  estado: 'ABIERTA' | 'CERRADA';
  montoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  montoFinal: number;
  cajaId?: string;
  sesionId?: string;
};

type Props = {
  estadoCaja: EstadoCaja | null;
  montoInicialInput: string;
  setMontoInicialInput: (v: string) => void;
  montoContadoInput: string;
  setMontoContadoInput: (v: string) => void;
  notasCierreInput: string;
  setNotasCierreInput: (v: string) => void;
  abrirCaja: () => void;
  confirmarAbrirCaja: () => void;
  cerrarCaja: () => void;
  mostrarModalAbrirCaja: boolean;
  setMostrarModalAbrirCaja: (v: boolean) => void;
};

export const CajaControls: React.FC<Props> = ({
  estadoCaja,
  montoInicialInput,
  setMontoInicialInput,
  montoContadoInput,
  setMontoContadoInput,
  notasCierreInput,
  setNotasCierreInput,
  abrirCaja,
  confirmarAbrirCaja,
  cerrarCaja,
  mostrarModalAbrirCaja,
  setMostrarModalAbrirCaja,
}) => {
  const formatMoney = (value: any): string => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  };

  return (
    <div className="caja-controls">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold">Caja:</span>
        <span className={estadoCaja?.estado === 'ABIERTA' ? 'status-success' : 'status-warning'}>
          {estadoCaja?.estado ?? 'CERRADA'}
        </span>
        {estadoCaja?.montoInicial !== undefined && (
          <span className="text-sm text-gray-500">
            Inicio: S/ {formatMoney(estadoCaja.montoInicial)}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button className="btn btn-green" onClick={abrirCaja} data-tour="btn-abrir-caja">
          Abrir caja
        </button>
        <button className="btn btn-red" onClick={cerrarCaja} disabled={estadoCaja?.estado !== 'ABIERTA'} data-tour="btn-cerrar-caja">
          Cerrar caja
        </button>
      </div>

      {mostrarModalAbrirCaja && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3 className="font-bold mb-2">
              Abrir Caja <HelpIcon helpKey="pos.apertura_caja" position="right" />
            </h3>
            <label className="text-sm flex items-center gap-1">
              Monto inicial <HelpIcon helpKey="pos.apertura_caja" position="top" />
            </label>
            <input
              type="number"
              value={montoInicialInput}
              onChange={(e) => setMontoInicialInput(e.target.value)}
              className="input"
              data-tour="input-monto-inicial"
            />
            <div className="flex gap-2 mt-3">
              <button className="btn btn-green" onClick={confirmarAbrirCaja}>
                Abrir
              </button>
              <button className="btn btn-secondary" onClick={() => setMostrarModalAbrirCaja(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3">
        <label className="text-sm flex items-center gap-1">
          Monto contado (cierre) <HelpIcon helpKey="pos.cierre_caja" position="top" />
        </label>
        <input
          type="number"
          value={montoContadoInput}
          onChange={(e) => setMontoContadoInput(e.target.value)}
          className="input"
        />
        <label className="text-sm mt-2">Notas de cierre</label>
        <textarea
          value={notasCierreInput}
          onChange={(e) => setNotasCierreInput(e.target.value)}
          className="input"
          rows={2}
        />
      </div>
    </div>
  );
};
