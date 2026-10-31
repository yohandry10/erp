// Opt in only for positive isolated catalog fixtures. Explicit fields win.
export function cpeListFixture(rows: any[], demo = false) {
  return {success:true,meta:{total:rows.length,page:1,pageSize:50},data:rows.map(row=>({
    cxcId:null,requiereVincularCobro:false,isDemoRepresentation:demo,...row,
  }))}
}
