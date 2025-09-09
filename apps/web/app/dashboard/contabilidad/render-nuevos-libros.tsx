// Funciones de renderizado para los nuevos libros contables
// Este archivo contiene las funciones de renderizado que faltan en el archivo principal

export const renderRegistroCompras = (registroCompras: any, loading: boolean, formatearMoneda: Function, formatearFecha: Function, exportarExcel: Function) => {
  if (loading) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f4f6',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }}></div>
        <p>🛒 Cargando Registro de Compras...</p>
      </div>
    )
  }

  if (!registroCompras || !registroCompras.compras.length) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>📋 No hay compras registradas en el período seleccionado</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>🛒 Registro de Compras</h2>
        <button
          onClick={() => exportarExcel('registro-compras')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          📊 Exportar Excel
        </button>
      </div>

      {/* Resumen */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ 
          backgroundColor: '#f0fdf4', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #10b981' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#065f46', fontWeight: '600' }}>Total Comprobantes</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
            {registroCompras.resumen.cantidadComprobantes}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#fef3c7', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #f59e0b' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: '600' }}>Base Imponible</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
            {formatearMoneda(registroCompras.resumen.baseImponible)}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#dbeafe', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #3b82f6' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: '600' }}>IGV</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>
            {formatearMoneda(registroCompras.resumen.igv)}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#f3e8ff', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #8b5cf6' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#5b21b6', fontWeight: '600' }}>Total</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>
            {formatearMoneda(registroCompras.resumen.total)}
          </div>
        </div>
      </div>

      {/* Tabla de compras */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Fecha
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Tipo
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Serie-Número
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Proveedor
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                RUC
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Base Imponible
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                IGV
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Total
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Origen
              </th>
            </tr>
          </thead>
          <tbody>
            {registroCompras.compras.map((compra: any, index: number) => (
              <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '0.75rem' }}>
                  {formatearFecha(compra.fechaEmision)}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: compra.tipoComprobante === '01' ? '#dbeafe' : '#f3f4f6',
                    color: compra.tipoComprobante === '01' ? '#1e40af' : '#374151',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {compra.tipoComprobante === '01' ? 'FACTURA' : 'OTROS'}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                  {compra.serieNumero}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  {compra.razonSocialProveedor}
                </td>
                <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                  {compra.numeroDocumentoProveedor}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatearMoneda(compra.baseImponibleOperacionGravada)}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatearMoneda(compra.igv)}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>
                  {formatearMoneda(compra.importeTotal)}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: compra.origen === 'ORDEN_COMPRA' ? '#f0fdf4' : '#fef3c7',
                    color: compra.origen === 'ORDEN_COMPRA' ? '#065f46' : '#92400e',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {compra.origen === 'ORDEN_COMPRA' ? 'COMPRA' : 'GASTO'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const renderBalanceComprobacion = (balanceComprobacion: any, loading: boolean, formatearMoneda: Function, exportarExcel: Function) => {
  if (loading) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f4f6',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }}></div>
        <p>⚖️ Cargando Balance de Comprobación...</p>
      </div>
    )
  }

  if (!balanceComprobacion || !balanceComprobacion.cuentas.length) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>📋 No hay movimientos contables en el período seleccionado</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>⚖️ Balance de Comprobación</h2>
        <button
          onClick={() => exportarExcel('balance-comprobacion')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          📊 Exportar Excel
        </button>
      </div>

      {/* Estado del Balance */}
      <div style={{ 
        marginBottom: '2rem',
        padding: '1rem',
        backgroundColor: balanceComprobacion.estadoBalance.balanceado ? '#f0fdf4' : '#fef2f2',
        border: `2px solid ${balanceComprobacion.estadoBalance.balanceado ? '#10b981' : '#ef4444'}`,
        borderRadius: '8px'
      }}>
        <div style={{ 
          fontSize: '1.1rem', 
          fontWeight: '700',
          color: balanceComprobacion.estadoBalance.balanceado ? '#065f46' : '#991b1b',
          textAlign: 'center'
        }}>
          {balanceComprobacion.estadoBalance.mensaje}
        </div>
      </div>

      {/* Totales */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ 
          backgroundColor: '#f0fdf4', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #10b981' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#065f46', fontWeight: '600' }}>Total Debe</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
            {formatearMoneda(balanceComprobacion.totales.totalDebe)}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#fef2f2', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #ef4444' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#991b1b', fontWeight: '600' }}>Total Haber</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>
            {formatearMoneda(balanceComprobacion.totales.totalHaber)}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#dbeafe', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #3b82f6' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: '600' }}>Saldos Deudores</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>
            {formatearMoneda(balanceComprobacion.totales.totalSaldosDeudores)}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#f3e8ff', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #8b5cf6' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#5b21b6', fontWeight: '600' }}>Saldos Acreedores</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>
            {formatearMoneda(balanceComprobacion.totales.totalSaldosAcreedores)}
          </div>
        </div>
      </div>

      {/* Tabla de cuentas */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Código
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Nombre de Cuenta
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Naturaleza
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Saldo Anterior
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Debe
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Haber
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Saldo Actual
              </th>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: '600' }}>
                Movimientos
              </th>
            </tr>
          </thead>
          <tbody>
            {balanceComprobacion.cuentas.map((cuenta: any, index: number) => (
              <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontWeight: '600' }}>
                  {cuenta.codigo}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  {cuenta.nombre}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: cuenta.naturaleza === 'DEUDORA' ? '#dbeafe' : '#fef2f2',
                    color: cuenta.naturaleza === 'DEUDORA' ? '#1e40af' : '#991b1b',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    {cuenta.naturaleza}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatearMoneda(cuenta.saldoAnterior)}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: '#10b981', fontWeight: '600' }}>
                  {formatearMoneda(cuenta.totalDebe)}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontFamily: 'monospace', color: '#ef4444', fontWeight: '600' }}>
                  {formatearMoneda(cuenta.totalHaber)}
                </td>
                <td style={{ 
                  padding: '0.75rem', 
                  textAlign: 'right', 
                  fontFamily: 'monospace', 
                  fontWeight: '700',
                  color: cuenta.saldoActual >= 0 ? '#10b981' : '#ef4444'
                }}>
                  {formatearMoneda(Math.abs(cuenta.saldoActual))}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center', fontFamily: 'monospace' }}>
                  {cuenta.cantidadMovimientos}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const renderKardexValorizado = (kardexValorizado: any, loading: boolean, formatearMoneda: Function, formatearFecha: Function, exportarExcel: Function) => {
  if (loading) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f4f6',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 1rem'
        }}></div>
        <p>📦 Cargando Kardex Valorizado...</p>
      </div>
    )
  }

  if (!kardexValorizado || !kardexValorizado.kardex.length) {
    return (
      <div className="activity-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>📋 No hay movimientos de inventario en el período seleccionado</p>
      </div>
    )
  }

  return (
    <div className="activity-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>📦 Kardex Valorizado</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: '600'
          }}>
            Método: {kardexValorizado.metodoValuacion}
          </span>
          <button
            onClick={() => exportarExcel('kardex-valorizado')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            📊 Exportar Excel
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ 
          backgroundColor: '#f0fdf4', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #10b981' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#065f46', fontWeight: '600' }}>Total Productos</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
            {kardexValorizado.resumen.totalProductos}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#fef3c7', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #f59e0b' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: '600' }}>Stock Final</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
            {kardexValorizado.resumen.stockTotalFinal.toLocaleString()}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#dbeafe', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #3b82f6' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: '600' }}>Valor Final</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#3b82f6' }}>
            {formatearMoneda(kardexValorizado.resumen.valorTotalFinal)}
          </div>
        </div>
        <div style={{ 
          backgroundColor: '#f3e8ff', 
          padding: '1rem', 
          borderRadius: '8px', 
          border: '1px solid #8b5cf6' 
        }}>
          <div style={{ fontSize: '0.875rem', color: '#5b21b6', fontWeight: '600' }}>Total Movimientos</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>
            {kardexValorizado.resumen.totalMovimientos}
          </div>
        </div>
      </div>

      {/* Kardex por producto */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {kardexValorizado.kardex.map((producto: any, index: number) => (
          <div key={index} style={{ 
            border: '1px solid #e5e7eb', 
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {/* Cabecera del producto */}
            <div style={{ 
              backgroundColor: '#f9fafb', 
              padding: '1rem',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
                    {producto.producto.codigo} - {producto.producto.nombre}
                  </h3>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    Categoría: {producto.producto.categoria}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Stock Final</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#10b981' }}>
                    {producto.stockFinal.toLocaleString()} unidades
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    Valor: {formatearMoneda(producto.valorFinal)}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    Costo Promedio: {formatearMoneda(producto.costoPromedio)}
                  </div>
                </div>
              </div>
            </div>

            {/* Movimientos del producto */}
            {producto.movimientos.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Fecha
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Tipo
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Motivo
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Cantidad
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Costo Unit.
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Valor Mov.
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Stock Acum.
                      </th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
                        Valor Acum.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {producto.movimientos.map((mov: any, movIndex: number) => (
                      <tr key={movIndex} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.5rem' }}>
                          {formatearFecha(mov.fecha)}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: mov.tipoMovimiento === 'ENTRADA' ? '#d1fae5' : 
                                           mov.tipoMovimiento === 'SALIDA' ? '#fee2e2' : '#fef3c7',
                            color: mov.tipoMovimiento === 'ENTRADA' ? '#065f46' : 
                                   mov.tipoMovimiento === 'SALIDA' ? '#991b1b' : '#92400e',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            {mov.tipoMovimiento}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.75rem' }}>
                          {mov.motivo}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                          {mov.cantidad.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatearMoneda(mov.costoUnitario)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatearMoneda(mov.valorMovimiento)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>
                          {mov.stockAcumulado.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: '600' }}>
                          {formatearMoneda(mov.valorAcumulado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}