import Image from 'next/image';
import React from 'react';
import { cn } from '@/lib/utils';
import { Package, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  currencySymbol: string;
  locale: string;
  taxRate: number;
  taxName: string;
};

/**
 * El catálogo guarda el precio sin impuesto, pero al consumidor hay que exhibirle el
 * precio final que va a pagar. Solo se recarga lo gravado: exonerado, inafecto y
 * exportacion se muestran tal cual. Si falta la afectacion se asume gravado, que
 * es lo que hace el calculo de la venta, para que lo exhibido y lo cobrado no
 * difieran.
 */
const precioAlPublico = (producto: ProductoPOS, taxRate: number): number => {
  const afectacion = String(producto.afectacion_igv ?? '10').trim();
  return afectacion === '10' ? producto.precio_venta * (1 + taxRate) : producto.precio_venta;
};

const formatMoney = (value: any, locale: string): string => {
  const num = Number(value);
  return Number.isFinite(num)
    ? num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0,00';
};

export const ProductGrid: React.FC<Props> = ({
  productos,
  onAgregar,
  productoSeleccionado,
  onSeleccionar,
  currencySymbol,
  locale,
  taxRate,
  taxName,
}) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(145px,1fr))]">
      {productos.map((producto) => {
        const esServicio = producto.es_servicio;
        const stockDisponible = producto.stock_disponible ?? producto.stock_actual ?? 0;
        const estaSeleccionado = productoSeleccionado === producto.id;
        const stockBajo = !esServicio && stockDisponible <= producto.stock_minimo;

        return (
          <div
            key={producto.id}
            className={cn(
              'group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-primary/45 hover:bg-accent/30',
              estaSeleccionado && 'border-primary ring-2 ring-primary/15',
            )}
            onClick={() => onSeleccionar?.(producto.id)}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/35 text-muted-foreground">
                {producto.imagen_url ? (
                  <Image
                    src={producto.imagen_url}
                    alt={producto.nombre}
                    fill
                    sizes="44px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{producto.codigo}</span>
                  {producto.favorito && <Star className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Producto favorito" />}
                </div>
                <div className="mt-1 line-clamp-4 min-h-20 text-sm font-semibold leading-5" title={producto.nombre}>{producto.nombre}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-lg font-bold tracking-tight">
                {currencySymbol} {formatMoney(precioAlPublico(producto, taxRate), locale)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {String(producto.afectacion_igv ?? '10').trim() === '10'
                  ? `${taxName} incluido`
                  : `Exento de ${taxName}`}
              </div>
              {!esServicio && (
                <div className={cn('mt-1 text-xs text-muted-foreground', stockBajo && 'font-medium text-destructive')}>
                  <div>{stockDisponible} disponibles</div>
                  {stockBajo && <div>Stock bajo · mín. {producto.stock_minimo}</div>}
                </div>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              aria-label={`Agregar ${producto.nombre}`}
              className="mt-3 min-h-10 w-full gap-2"
              onClick={(event) => {
                event.stopPropagation();
                onAgregar(producto);
              }}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        );
      })}
    </div>
  );
};
