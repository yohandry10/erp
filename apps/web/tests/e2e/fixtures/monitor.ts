export function monitorFixture(pathname:string,body:any,tenant:string) {
 if(body.success!==true)return body
 const normalized=pathname.replace(/^\/backend(?=\/api\/)/,'').replace(/\/$/,'')
 if(!/^\/api\/contabilidad\/(eventos\/(estadisticas|fallidos|dead-letter)|asientos\/estadisticas\/por-tipo)$/.test(normalized))return body
 const events=normalized.includes('/eventos/'),window=normalized.endsWith('/fallidos')||normalized.endsWith('/dead-letter')
 return {...body,complete:true,tenant_id:tenant,...(events?{scope:'ACCOUNTING_OWNED_EVENTS'}:{}),
  ...(window?{window_limit:10,window_count:body.data.length}:{}),
  ...(!events?{total:body.data.length}:{})}
}
