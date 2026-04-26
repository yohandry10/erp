// Funciones de renderizado para los nuevos libros contables

export const renderRegistroCompras = (registroCompras: any, loading: boolean, formatearMoneda: Function) => {
  if (loading) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>🛒 Cargando Registro de Compras...</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <h2>🛒 Registro de Compras</h2>
      <p>Funcionalidad implementada - Datos de compras y gastos</p>
      <div style={{ marginTop: '1rem' }}>
        <p><strong>Total comprobantes:</strong> {registroCompras?.resumen?.cantidadComprobantes || 0}</p>
        <p><strong>Base imponible:</strong> {registroCompras?.resumen?.baseImponible ? formatearMoneda(registroCompras.resumen.baseImponible) : 'S/ 0.00'}</p>
        <p><strong>IGV:</strong> {registroCompras?.resumen?.igv ? formatearMoneda(registroCompras.resumen.igv) : 'S/ 0.00'}</p>
        <p><strong>Total:</strong> {registroCompras?.resumen?.total ? formatearMoneda(registroCompras.resumen.total) : 'S/ 0.00'}</p>
      </div>
      {registroCompras?.compras?.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Últimas compras:</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {registroCompras.compras.slice(0, 5).map((compra: any, index: number) => (
              <div key={index} style={{ 
                padding: '0.5rem', 
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
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
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>⚖️ Cargando Balance de Comprobación...</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <h2>⚖️ Balance de Comprobación</h2>
      <p>Funcionalidad implementada - Verificación de cuadre contable</p>
      
      {balanceComprobacion?.estadoBalance && (
        <div style={{ 
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: balanceComprobacion.estadoBalance.balanceado ? '#f0fdf4' : '#fef2f2',
          border: `2px solid ${balanceComprobacion.estadoBalance.balanceado ? '#10b981' : '#ef4444'}`,
          borderRadius: '8px'
        }}>
          <p style={{ 
            margin: 0,
            fontWeight: '700',
            color: balanceComprobacion.estadoBalance.balanceado ? '#065f46' : '#991b1b'
          }}>
            {balanceComprobacion.estadoBalance.mensaje}
          </p>
        </div>
      )}
      
      <div style={{ marginTop: '1rem' }}>
        <p><strong>Total cuentas:</strong> {balanceComprobacion?.cuentas?.length || 0}</p>
        <p><strong>Total debe:</strong> {balanceComprobacion?.totales?.totalDebe ? formatearMoneda(balanceComprobacion.totales.totalDebe) : 'S/ 0.00'}</p>
        <p><strong>Total haber:</strong> {balanceComprobacion?.totales?.totalHaber ? formatearMoneda(balanceComprobacion.totales.totalHaber) : 'S/ 0.00'}</p>
        <p><strong>Diferencia:</strong> {balanceComprobacion?.totales?.diferenciaDebe ? formatearMoneda(balanceComprobacion.totales.diferenciaDebe) : 'S/ 0.00'}</p>
      </div>

      {balanceComprobacion?.cuentas?.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Principales cuentas con movimientos:</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {balanceComprobacion.cuentas.slice(0, 10).map((cuenta: any, index: number) => (
              <div key={index} style={{ 
                padding: '0.5rem', 
                borderBottom: '1px solid #e5e7eb',
                display: 'grid',
                gridTemplateColumns: '1fr 2fr 1fr 1fr',
                gap: '0.5rem',
                fontSize: '0.875rem'
              }}>
                <span style={{ fontFamily: 'monospace', fontWeight: '600' }}>{cuenta.codigo}</span>
                <span>{cuenta.nombre}</span>
                <span style={{ textAlign: 'right', color: '#10b981' }}>{formatearMoneda(cuenta.totalDebe)}</span>
                <span style={{ textAlign: 'right', color: '#ef4444' }}>{formatearMoneda(cuenta.totalHaber)}</span>
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
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>📦 Cargando Kardex Valorizado...</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <h2>📦 Kardex Valorizado</h2>
      <p>Funcionalidad implementada - Control valorizado de inventarios</p>
      
      <div style={{ marginTop: '1rem' }}>
        <p><strong>Método de valuación:</strong> {kardexValorizado?.metodoValuacion || 'PROMEDIO_PONDERADO'}</p>
        <p><strong>Total productos:</strong> {kardexValorizado?.resumen?.totalProductos || 0}</p>
        <p><strong>Stock total inicial:</strong> {kardexValorizado?.resumen?.stockTotalInicial?.toLocaleString() || '0'} unidades</p>
        <p><strong>Stock total final:</strong> {kardexValorizado?.resumen?.stockTotalFinal?.toLocaleString() || '0'} unidades</p>
        <p><strong>Valor total final:</strong> {kardexValorizado?.resumen?.valorTotalFinal ? formatearMoneda(kardexValorizado.resumen.valorTotalFinal) : 'S/ 0.00'}</p>
        <p><strong>Total movimientos:</strong> {kardexValorizado?.resumen?.totalMovimientos || 0}</p>
      </div>

      {kardexValorizado?.kardex?.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Productos con movimientos:</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {kardexValorizado.kardex.map((producto: any, index: number) => (
              <div key={index} style={{ 
                padding: '1rem', 
                marginBottom: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                      {producto.producto.codigo} - {producto.producto.nombre}
                    </h4>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                      Categoría: {producto.producto.categoria}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Stock Final</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#10b981' }}>
                      {producto.stockFinal?.toLocaleString() || '0'} unidades
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Valor: {formatearMoneda(producto.valorFinal || 0)}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Costo promedio: {formatearMoneda(producto.costoPromedio || 0)}
                    </div>
                  </div>
                </div>
                
                {producto.movimientos?.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: '600', margin: '0 0 0.5rem 0' }}>
                      Últimos movimientos: {producto.movimientos.length}
                    </p>
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                      {producto.movimientos.slice(0, 3).map((mov: any, movIndex: number) => (
                        <div key={movIndex} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          padding: '0.25rem 0',
                          borderBottom: '1px solid #e5e7eb',
                          fontSize: '0.75rem'
                        }}>
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