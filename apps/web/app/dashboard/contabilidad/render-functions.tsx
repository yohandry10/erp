// Funciones de renderizado para los nuevos libros contables

export const renderRegistroCompras = (registroCompras: any, loading: boolean, formatearMoneda: Function) => {
  if (loading) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl text-center p-8">
        <p>🛒 Cargando Registro de Compras...</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      <h2>🛒 Registro de Compras</h2>
      <p>Funcionalidad implementada - Datos de compras y gastos</p>
      <div className="mt-4">
        <p><strong>Total comprobantes:</strong> {registroCompras?.resumen?.cantidadComprobantes || 0}</p>
        <p><strong>Base imponible:</strong> {registroCompras?.resumen?.baseImponible ? formatearMoneda(registroCompras.resumen.baseImponible) : 'S/ 0.00'}</p>
        <p><strong>IGV:</strong> {registroCompras?.resumen?.igv ? formatearMoneda(registroCompras.resumen.igv) : 'S/ 0.00'}</p>
        <p><strong>Total:</strong> {registroCompras?.resumen?.total ? formatearMoneda(registroCompras.resumen.total) : 'S/ 0.00'}</p>
      </div>
      {registroCompras?.compras?.length > 0 && (
        <div className="mt-8">
          <h3>Últimas compras:</h3>
          <div className="max-h-[300px] overflow-y-auto">
            {registroCompras.compras.slice(0, 5).map((compra: any, index: number) => (
              <div key={index} className="p-2 border-b flex justify-between">
                <span>{compra.razonSocialProveedor}</span>
                <span>{formatearMoneda(compra.importeTotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const renderBalanceComprobacion = (balanceComprobacion: any, loading: boolean, formatearMoneda: Function) => {
  if (loading) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl text-center p-8">
        <p>⚖️ Cargando Balance de Comprobación...</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      <h2>⚖️ Balance de Comprobación</h2>
      <p>Funcionalidad implementada - Verificación de cuadre contable</p>

      {balanceComprobacion?.estadoBalance && (
        <div className="mt-4 p-4 rounded-lg">
          <p className="m-0 font-bold">
            {balanceComprobacion.estadoBalance.mensaje}
          </p>
        </div>
      )}

      <div className="mt-4">
        <p><strong>Total cuentas:</strong> {balanceComprobacion?.cuentas?.length || 0}</p>
        <p><strong>Total debe:</strong> {balanceComprobacion?.totales?.totalDebe ? formatearMoneda(balanceComprobacion.totales.totalDebe) : 'S/ 0.00'}</p>
        <p><strong>Total haber:</strong> {balanceComprobacion?.totales?.totalHaber ? formatearMoneda(balanceComprobacion.totales.totalHaber) : 'S/ 0.00'}</p>
        <p><strong>Diferencia:</strong> {balanceComprobacion?.totales?.diferenciaDebe ? formatearMoneda(balanceComprobacion.totales.diferenciaDebe) : 'S/ 0.00'}</p>
      </div>

      {balanceComprobacion?.cuentas?.length > 0 && (
        <div className="mt-8">
          <h3>Principales cuentas con movimientos:</h3>
          <div className="max-h-[300px] overflow-y-auto">
            {balanceComprobacion.cuentas.slice(0, 10).map((cuenta: any, index: number) => (
              <div key={index} className="p-2 border-b grid grid-cols-[1fr_2fr_1fr_1fr] gap-2 text-[0.875rem]">
                <span className="font-semibold">{cuenta.codigo}</span>
                <span>{cuenta.nombre}</span>
                <span className="text-right text-[#10b981]">{formatearMoneda(cuenta.totalDebe)}</span>
                <span className="text-right text-red-500">{formatearMoneda(cuenta.totalHaber)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const renderKardexValorizado = (kardexValorizado: any, loading: boolean, formatearMoneda: Function) => {
  if (loading) {
    return (
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl text-center p-8">
        <p>📦 Cargando Kardex Valorizado...</p>
      </div>
    )
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
      <h2>📦 Kardex Valorizado</h2>
      <p>Funcionalidad implementada - Control valorizado de inventarios</p>

      <div className="mt-4">
        <p><strong>Método de valuación:</strong> {kardexValorizado?.metodoValuacion || 'PROMEDIO_PONDERADO'}</p>
        <p><strong>Total productos:</strong> {kardexValorizado?.resumen?.totalProductos || 0}</p>
        <p><strong>Stock total inicial:</strong> {kardexValorizado?.resumen?.stockTotalInicial?.toLocaleString() || '0'} unidades</p>
        <p><strong>Stock total final:</strong> {kardexValorizado?.resumen?.stockTotalFinal?.toLocaleString() || '0'} unidades</p>
        <p><strong>Valor total final:</strong> {kardexValorizado?.resumen?.valorTotalFinal ? formatearMoneda(kardexValorizado.resumen.valorTotalFinal) : 'S/ 0.00'}</p>
        <p><strong>Total movimientos:</strong> {kardexValorizado?.resumen?.totalMovimientos || 0}</p>
      </div>

      {kardexValorizado?.kardex?.length > 0 && (
        <div className="mt-8">
          <h3>Productos con movimientos:</h3>
          <div className="max-h-[400px] overflow-y-auto">
            {kardexValorizado.kardex.map((producto: any, index: number) => (
              <div key={index} className="p-4 mb-4 border rounded-lg bg-muted">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="m-0 text-base font-semibold">
                      {producto.producto.codigo} - {producto.producto.nombre}
                    </h4>
                    <p className="mt-1 mr-0 mb-0 ml-0 text-[0.875rem] text-muted-foreground">
                      Categoría: {producto.producto.categoria}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.875rem] text-muted-foreground">Stock Final</div>
                    <div className="text-base font-bold text-[#10b981]">
                      {producto.stockFinal?.toLocaleString() || '0'} unidades
                    </div>
                    <div className="text-[0.875rem] text-muted-foreground">
                      Valor: {formatearMoneda(producto.valorFinal || 0)}
                    </div>
                    <div className="text-[0.875rem] text-muted-foreground">
                      Costo promedio: {formatearMoneda(producto.costoPromedio || 0)}
                    </div>
                  </div>
                </div>

                {producto.movimientos?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[0.875rem] font-semibold mt-0 mr-0 mb-2 ml-0">
                      Últimos movimientos: {producto.movimientos.length}
                    </p>
                    <div className="max-h-[150px] overflow-y-auto">
                      {producto.movimientos.slice(0, 3).map((mov: any, movIndex: number) => (
                        <div key={movIndex} className="flex justify-between py-1 px-0 border-b text-xs">
                          <span>{mov.tipoMovimiento}</span>
                          <span>{mov.cantidad} unidades</span>
                          <span>{formatearMoneda(mov.valorMovimiento || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}