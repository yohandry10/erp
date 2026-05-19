import Image from 'next/image';
import React from 'react';
import { cn } from '@/lib/utils';

export interface ProductoPOS {
  id: string;
  codigo: string;
  codigo_barras?: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  subcategoria?: string;
  marca?: string;
  precio_venta: number;
  precio_mayorista?: number;
  precio_especial?: number;
  stock_actual: number;
  stock_minimo: number;
  stock_reservado?: number;
  stock_disponible?: number;
  impuesto: number;
  imagen_url?: string;
  es_servicio?: boolean;
  controla_stock?: boolean;
  afectacion_igv?: string;
  tipo_operacion?: string;
  clasificador_sunat?: string;
  favorito?: boolean;
}

type Props = {
  productos: ProductoPOS[];
  onAgregar: (producto: ProductoPOS) => void;
  productoSeleccionado?: string | null;
  onSeleccionar?: (productoId: string) => void;
};

const formatMoney = (value: any): string => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
};

export const ProductGrid: React.FC<Props> = ({ productos, onAgregar, productoSeleccionado, onSeleccionar }) => {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
      {productos.map((producto) => {
        const esServicio = producto.es_servicio;
        const stockDisponible = producto.stock_disponible ?? producto.stock_actual ?? 0;
        const estaSeleccionado = productoSeleccionado === producto.id;
        
        return (
          <div 
            key={producto.id} 
            className={cn(
              'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-cyan-400/15 bg-[linear-gradient(145deg,rgba(15,23,42,0.92),rgba(30,41,59,0.76)),radial-gradient(circle_at_100%_0%,rgba(14,165,233,0.18),transparent_12rem)] p-4 text-slate-100 shadow-[0_18px_38px_rgba(2,8,23,0.22)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/45 hover:shadow-[0_24px_52px_rgba(8,145,178,0.24)]',
              estaSeleccionado && 'scale-[1.02] border-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.2)]',
            )}
            onClick={() => onSeleccionar?.(producto.id)}
          >
            <div className="relative mb-3 flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-400/15 bg-slate-950/90">
              {producto.imagen_url ? (
                <Image
                  src={producto.imagen_url}
                  alt={producto.nombre}
                  fill
                  sizes="(max-width: 768px) 50vw, 160px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.9)),radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),transparent_10rem)] text-5xl opacity-50">
                  📦
                </div>
              )}
              {esServicio && <span className="absolute right-2 top-2 rounded-md bg-cyan-400/15 px-2 py-1 text-xs font-semibold text-cyan-100">Servicio</span>}
              {producto.favorito && <span className="absolute right-2 top-2 rounded-md bg-gradient-to-br from-amber-400 to-amber-500 px-2 py-1 text-xs font-semibold text-white">★</span>}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <div className="break-words text-xs font-medium text-sky-300">{producto.codigo}</div>
              <div className="line-clamp-3 text-sm font-semibold leading-snug text-slate-50">{producto.nombre}</div>
              <div className="mt-1 text-lg font-bold text-emerald-300">S/ {formatMoney(producto.precio_venta)}</div>
              {!esServicio && (
                <div className="text-xs text-slate-400">
                  Stock: {stockDisponible}
                  {producto.stock_minimo !== undefined && (
                    <span className={stockDisponible <= producto.stock_minimo ? 'text-red-400' : 'text-emerald-300'}>
                      {' '}
                      (min {producto.stock_minimo})
                    </span>
                  )}
                </div>
              )}
            </div>
            <button 
              className="mt-3 w-full rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-[0_14px_30px_rgba(37,99,235,0.28)] transition hover:brightness-110"
              onClick={() => onAgregar(producto)}
            >
              Agregar
            </button>
          </div>
        );
      })}
    </div>
  );
};
