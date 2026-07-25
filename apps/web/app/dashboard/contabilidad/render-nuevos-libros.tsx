const panelClass = 'rounded-2xl border border-cyan-400/20 bg-card/65 p-5 text-foreground shadow-xl shadow-blue-950/20'
const emptyClass = 'flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-cyan-400/20 bg-card/65 p-8 text-center text-muted-foreground'
const tableClass = '!m-0 w-full min-w-full border-collapse !bg-card/80 text-sm !shadow-none'
const thClass = '!border-cyan-400/10 !bg-card/90 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'
const tdClass = '!border-cyan-400/10 !bg-transparent px-3 py-3 text-foreground/90'
const metricClass = 'rounded-xl border border-cyan-400/15 bg-card/45 p-4'
const metricLabelClass = 'text-xs font-semibold uppercase tracking-[0.14em] text-primary/80'
const metricValueClass = 'mt-2 text-2xl font-black text-white'
const exportButtonClass = 'rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-cyan-400/15'

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className={emptyClass}>
      <div className="mb-4 size-10 animate-spin rounded-full border-4 border-border border-t-cyan-300" />
      <p>{label}</p>
    </div>
  )
}

function StatusPill({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-cyan-300/30 bg-cyan-300/10 text-primary' : 'border-border/30 bg-slate-400/10 text-foreground/90'}`}>
      {children}
    </span>
  )
}

export const renderRegistroCompras = (registroCompras: any, loading: boolean, formatearMoneda: Function, formatearFecha: Function, exportarExcel: Function) => {
  if (loading) return <LoadingPanel label="Cargando Registro de Compras..." />

  if (!registroCompras || !registroCompras.compras.length) {
    return <div className={emptyClass}>No hay compras registradas en el periodo seleccionado.</div>
  }

  const metrics = [
    ['Total comprobantes', registroCompras.resumen.cantidadComprobantes],
    ['Base imponible', formatearMoneda(registroCompras.resumen.baseImponible)],
    ['IGV', formatearMoneda(registroCompras.resumen.igv)],
    ['Total', formatearMoneda(registroCompras.resumen.total)],
  ]

  return (
    <div className={panelClass}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black text-white">Registro de Compras</h2>
        <button type="button" onClick={() => exportarExcel('registro-compras')} className={exportButtonClass}>
          Exportar Excel
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={String(label)} className={metricClass}>
            <div className={metricLabelClass}>{label}</div>
            <div className={metricValueClass}>{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-cyan-400/10">
        <table className={tableClass}>
          <thead>
            <tr>
              {['Fecha', 'Tipo', 'Serie-Numero', 'Proveedor', 'RUC', 'Base Imponible', 'IGV', 'Total', 'Origen'].map((head) => (
                <th key={head} className={`${thClass} ${['Base Imponible', 'IGV', 'Total'].includes(head) ? 'text-right' : head === 'Origen' ? 'text-center' : ''}`}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan-400/10">
            {registroCompras.compras.map((compra: any, index: number) => (
              <tr key={index} className="!bg-card/50 transition hover:!bg-card/80">
                <td className={tdClass}>{formatearFecha(compra.fechaEmision)}</td>
                <td className={tdClass}>
                  <StatusPill active={compra.tipoComprobante === '01'}>{compra.tipoComprobante === '01' ? 'FACTURA' : 'OTROS'}</StatusPill>
                </td>
                <td className={`${tdClass} font-mono`}>{compra.serieNumero}</td>
                <td className={tdClass}>{compra.razonSocialProveedor}</td>
                <td className={`${tdClass} font-mono`}>{compra.numeroDocumentoProveedor}</td>
                <td className={`${tdClass} text-right font-mono`}>{formatearMoneda(compra.baseImponibleOperacionGravada)}</td>
                <td className={`${tdClass} text-right font-mono`}>{formatearMoneda(compra.igv)}</td>
                <td className={`${tdClass} text-right font-mono font-bold text-primary`}>{formatearMoneda(compra.importeTotal)}</td>
                <td className={`${tdClass} text-center`}>
                  <StatusPill active={compra.origen === 'ORDEN_COMPRA'}>{compra.origen === 'ORDEN_COMPRA' ? 'COMPRA' : 'GASTO'}</StatusPill>
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
  if (loading) return <LoadingPanel label="Cargando Balance de Comprobacion..." />

  if (!balanceComprobacion || !balanceComprobacion.cuentas.length) {
    return <div className={emptyClass}>No hay movimientos contables en el periodo seleccionado.</div>
  }

  const metrics = [
    ['Total Debe', formatearMoneda(balanceComprobacion.totales.totalDebe)],
    ['Total Haber', formatearMoneda(balanceComprobacion.totales.totalHaber)],
    ['Saldos Deudores', formatearMoneda(balanceComprobacion.totales.totalSaldosDeudores)],
    ['Saldos Acreedores', formatearMoneda(balanceComprobacion.totales.totalSaldosAcreedores)],
  ]

  return (
    <div className={panelClass}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black text-white">Balance de Comprobacion</h2>
        <button type="button" onClick={() => exportarExcel('balance-comprobacion')} className={exportButtonClass}>
          Exportar Excel
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-center text-base font-bold text-primary">
        {balanceComprobacion.estadoBalance.mensaje}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={String(label)} className={metricClass}>
            <div className={metricLabelClass}>{label}</div>
            <div className={metricValueClass}>{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-cyan-400/10">
        <table className={tableClass}>
          <thead>
            <tr>
              {['Codigo', 'Nombre de Cuenta', 'Naturaleza', 'Saldo Anterior', 'Debe', 'Haber', 'Saldo Actual', 'Movimientos'].map((head) => (
                <th key={head} className={`${thClass} ${['Saldo Anterior', 'Debe', 'Haber', 'Saldo Actual'].includes(head) ? 'text-right' : ['Naturaleza', 'Movimientos'].includes(head) ? 'text-center' : ''}`}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan-400/10">
            {balanceComprobacion.cuentas.map((cuenta: any, index: number) => (
              <tr key={index} className="!bg-card/50 transition hover:!bg-card/80">
                <td className={`${tdClass} font-mono font-bold text-white`}>{cuenta.codigo}</td>
                <td className={tdClass}>{cuenta.nombre}</td>
                <td className={`${tdClass} text-center`}><StatusPill active={cuenta.naturaleza === 'DEUDORA'}>{cuenta.naturaleza}</StatusPill></td>
                <td className={`${tdClass} text-right font-mono`}>{formatearMoneda(cuenta.saldoAnterior)}</td>
                <td className={`${tdClass} text-right font-mono font-semibold text-primary`}>{formatearMoneda(cuenta.totalDebe)}</td>
                <td className={`${tdClass} text-right font-mono font-semibold text-foreground/90`}>{formatearMoneda(cuenta.totalHaber)}</td>
                <td className={`${tdClass} text-right font-mono font-bold text-primary`}>{formatearMoneda(Math.abs(cuenta.saldoActual))}</td>
                <td className={`${tdClass} text-center font-mono`}>{cuenta.cantidadMovimientos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const renderKardexValorizado = (kardexValorizado: any, loading: boolean, formatearMoneda: Function, formatearFecha: Function, exportarExcel: Function) => {
  if (loading) return <LoadingPanel label="Cargando Kardex Valorizado..." />

  if (!kardexValorizado || !kardexValorizado.kardex.length) {
    return <div className={emptyClass}>No hay movimientos de inventario en el periodo seleccionado.</div>
  }

  const metrics = [
    ['Total Productos', kardexValorizado.resumen.totalProductos],
    ['Stock Final', kardexValorizado.resumen.stockTotalFinal.toLocaleString()],
    ['Valor Final', formatearMoneda(kardexValorizado.resumen.valorTotalFinal)],
    ['Total Movimientos', kardexValorizado.resumen.totalMovimientos],
  ]

  return (
    <div className={panelClass}>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Kardex Valorizado</h2>
          <p className="mt-1 text-sm text-muted-foreground">Metodo: {kardexValorizado.metodoValuacion}</p>
        </div>
        <button type="button" onClick={() => exportarExcel('kardex-valorizado')} className={exportButtonClass}>
          Exportar Excel
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={String(label)} className={metricClass}>
            <div className={metricLabelClass}>{label}</div>
            <div className={metricValueClass}>{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {kardexValorizado.kardex.map((producto: any, index: number) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-cyan-400/15 bg-card/45">
            <div className="flex flex-col gap-3 border-b border-cyan-400/10 p-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-base font-bold text-white">{producto.producto.codigo} - {producto.producto.nombre}</h3>
                <p className="mt-1 text-sm text-muted-foreground">Categoria: {producto.producto.categoria}</p>
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3 lg:text-right">
                <span>Stock: <strong className="text-primary">{producto.stockFinal.toLocaleString()}</strong></span>
                <span>Valor: <strong className="text-primary">{formatearMoneda(producto.valorFinal)}</strong></span>
                <span>Costo prom.: <strong className="text-primary">{formatearMoneda(producto.costoPromedio)}</strong></span>
              </div>
            </div>

            {producto.movimientos.length > 0 ? (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      {['Fecha', 'Tipo', 'Motivo', 'Cantidad', 'Costo Unit.', 'Valor Mov.', 'Stock Acum.', 'Valor Acum.'].map((head) => (
                        <th key={head} className={`${thClass} ${['Cantidad', 'Costo Unit.', 'Valor Mov.', 'Stock Acum.', 'Valor Acum.'].includes(head) ? 'text-right' : ''}`}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {producto.movimientos.map((mov: any, movIndex: number) => (
                      <tr key={movIndex} className="!bg-card/50 transition hover:!bg-card/80">
                        <td className={tdClass}>{formatearFecha(mov.fecha)}</td>
                        <td className={tdClass}><StatusPill active={mov.tipoMovimiento === 'ENTRADA'}>{mov.tipoMovimiento}</StatusPill></td>
                        <td className={`${tdClass} text-xs`}>{mov.motivo}</td>
                        <td className={`${tdClass} text-right font-mono`}>{mov.cantidad.toLocaleString()}</td>
                        <td className={`${tdClass} text-right font-mono`}>{formatearMoneda(mov.costoUnitario)}</td>
                        <td className={`${tdClass} text-right font-mono`}>{formatearMoneda(mov.valorMovimiento)}</td>
                        <td className={`${tdClass} text-right font-mono font-bold text-primary`}>{mov.stockAcumulado.toLocaleString()}</td>
                        <td className={`${tdClass} text-right font-mono font-bold text-primary`}>{formatearMoneda(mov.valorAcumulado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
