import React from 'react';

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
    <div className="product-grid">
      {productos.map((producto) => {
        const esServicio = producto.es_servicio;
        const stockDisponible = producto.stock_disponible ?? producto.stock_actual ?? 0;
        const estaSeleccionado = productoSeleccionado === producto.id;
        
        return (
          <div 
            key={producto.id} 
            className="product-card"
            onClick={() => onSeleccionar?.(producto.id)}
            style={{
              border: estaSeleccionado ? '3px solid var(--blue-500)' : undefined,
              boxShadow: estaSeleccionado ? '0 0 0 3px rgba(59, 130, 246, 0.2)' : undefined,
              transform: estaSeleccionado ? 'scale(1.02)' : undefined,
            }}
          >
            <div className="product-image">
              {producto.imagen_url ? (
                <img src={producto.imagen_url} alt={producto.nombre} />
              ) : (
                <div className="placeholder-img" />
              )}
              {esServicio && <span className="badge badge-blue">Servicio</span>}
              {producto.favorito && <span className="badge badge-gold">★</span>}
            </div>
            <div className="product-info">
              <div className="product-code">{producto.codigo}</div>
              <div className="product-name">{producto.nombre}</div>
              <div className="product-price">S/ {formatMoney(producto.precio_venta)}</div>
              {!esServicio && (
                <div className="product-stock">
                  Stock: {stockDisponible}
                  {producto.stock_minimo !== undefined && (
                    <span className={stockDisponible <= producto.stock_minimo ? 'text-red-500' : 'text-green-600'}>
                      {' '}
                      (min {producto.stock_minimo})
                    </span>
                  )}
                </div>
              )}
            </div>
            <button 
              className="btn btn-primary w-full mt-2" 
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
