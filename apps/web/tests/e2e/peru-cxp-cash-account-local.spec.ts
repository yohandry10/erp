import {test,expect} from '@playwright/test'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {loginPeruLocal} from './helpers/peru-login-local'
import {readLocalSql,consumeLocalAccounting} from './helpers/peru-local-accounting'

test('CxP en efectivo: COMMIT perdido y replay conservan un pago, un retiro y crédito10111',async({page,context})=>{
 test.setTimeout(300000);page.setDefaultTimeout(25000)
 if(process.env.E2E_EPHEMERAL_LOCAL_DB!=='1'||process.env.PGPORT!=='55456'||process.env.LOCAL_API_URL!=='http://127.0.0.1:3126')throw Error('Sólo stack efímero propio')
 const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,fixture=JSON.parse(readFileSync(path.join(output,'cash-browser-fixture.json'),'utf8'))
 const requests:any[]=[],receipts:any[]=[]
 const proof={complete:false,remoteWrites:false,scope:'Real owned cash supplier payment UI/API/PostgreSQL/GL; no historical payment replay',steps:[] as any[],scriptErrors:[] as string[],requests,receipts}
 const json=(sql:string)=>JSON.parse(readLocalSql(sql)),suffix=randomUUID().slice(0,8).toUpperCase()
 page.on('pageerror',e=>proof.scriptErrors.push(e.message))
 await context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))
 try{
  const auth=await loginPeruLocal(page,fixture.email,'Cliente-Local-2026-Only!'),token=auth.access_token??auth.data?.access_token
  expect(token).toBeTruthy()
  const post=async(endpoint:string,data:unknown)=>{
   const r=await context.request.post(process.env.LOCAL_API_URL+'/api/'+endpoint,{headers:{authorization:'Bearer '+token,'idempotency-key':randomUUID()},data})
   expect(r.status(),await r.text()).toBe(201);const value=await r.json();return value.data??value
  }
  const base='20'+String(Date.now()).slice(-8),weights=[5,4,3,2,7,6,5,4,3,2],digit=11-weights.reduce((sum,w,i)=>sum+Number(base[i])*w,0)%11
  const provider=await post('compras/proveedores',{ruc:base+String(digit===10?0:digit===11?1:digit),razon_social:'Proveedor efectivo UI '+suffix,direccion:'Av. Local 123',email:'cash-supplier-'+suffix+'@example.test'})
  const today=readLocalSql(`SELECT app.hoy_tenant('${fixture.tenant}')`)
  const invoice=await post('finanzas/cxp',{proveedor_id:provider.id,numero_documento:'F001-CASH-'+suffix,serie:'F001',tipo_documento:'FACTURA',fecha_emision:today,condiciones_pago:'CREDITO_30',subtotal:100,igv:18,total:118,moneda:'PEN',tipo_cambio:1,destino_credito_fiscal:'GRAVADAS'})
  const opening=await post('pos/caja/abrir',{monto_inicial:100,caja_id:fixture.caja_id,moneda:'PEN',dispositivo:'cxp-cash-'+suffix})
  expect(opening.id).toMatch(/^[0-9a-f-]{36}$/i)
  await context.route(new RegExp('/api/finanzas/cxp/'+invoice.id+'/aplicar-pago/?$'),async route=>{
   if(route.request().method()!=='POST')return route.continue()
   requests.push(route.request().postDataJSON());const actual=await route.fetch();expect(actual.status()).toBe(201);receipts.push(await actual.json())
   if(requests.length===1)return route.fulfill({status:503,json:{message:'ACK perdido después de pago y retiro reales'}})
   return route.fulfill({response:actual})
  })
  await page.goto('/dashboard/finanzas/cxp/'+invoice.id+'/',{waitUntil:'domcontentloaded'})
  await page.getByRole('button',{name:'Aplicar Pago',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Aplicar Pago a Cuenta por Pagar',exact:true})
  await dialog.locator('#cxp-pago-monto').fill('10');await dialog.locator('#cxp-pago-metodo').selectOption('EFECTIVO');await dialog.locator('#cxp-pago-referencia').fill('P2-CASH-'+suffix)
  await dialog.getByRole('button',{name:'Aplicar Pago',exact:true}).click()
  await expect(dialog.getByText('ACK perdido después de pago y retiro reales',{exact:true})).toBeVisible()
  expect(requests).toHaveLength(1)
  const first=receipts[0].data,payment=first.pago,event=payment.event_id
  expect(json(`SELECT jsonb_build_object('saldo',(SELECT saldo FROM cuentas_por_pagar WHERE id='${invoice.id}'),'payments',(SELECT count(*) FROM pagos_facturas WHERE cuenta_por_pagar_id='${invoice.id}'),'cashBalance',(SELECT saldo_nuevo FROM movimientos_caja WHERE sesion_caja_id='${opening.id}' ORDER BY secuencia DESC LIMIT 1))`)).toEqual({saldo:108,payments:1,cashBalance:90})
  proof.steps.push({name:'actual_cash_payment_commit_lost_ack_preserves_debt108_cash90',result:'PASS',paymentId:payment.id,eventId:event})
  await dialog.getByRole('button',{name:'Reintentar pago pendiente',exact:true}).click();await expect(dialog).toHaveCount(0)
  expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);expect(receipts[1].data.pago.id).toBe(payment.id)
  expect(receipts[1].data.movimiento_caja.id).toBe(first.movimiento_caja.id)
  expect(Number(readLocalSql(`SELECT count(*) FROM movimientos_caja WHERE referencia_documento='${payment.id}'`))).toBe(1)
  proof.steps.push({name:'same_original_body_key_recovers_one_payment_and_one_withdrawal',result:'PASS',paymentId:payment.id})
  await consumeLocalAccounting('cxp-cash-accounting')
  const journals=json(`SELECT jsonb_agg(jsonb_build_object('id',a.id,'estado',a.estado,'debe',a.total_debe,'haber',a.total_haber,'lines',(SELECT jsonb_agg(jsonb_build_object('code',p.codigo,'debe',d.debe,'haber',d.haber) ORDER BY p.codigo) FROM detalle_asientos d JOIN plan_cuentas p ON p.id=d.cuenta_id AND p.tenant_id=d.tenant_id WHERE d.asiento_id=a.id))) FROM asientos_contables a WHERE source_event_id='${event}'`)
  expect(journals).toHaveLength(1);expect(journals[0]).toMatchObject({estado:'CONFIRMADO',debe:10,haber:10})
  expect(journals[0].lines).toHaveLength(2);expect(journals[0].lines).toContainEqual({code:'10111',debe:0,haber:10});expect(journals[0].lines.some((line:any)=>line.code==='10')).toBe(false)
  const replay=await post('finanzas/cxp/'+invoice.id+'/aplicar-pago',requests[0]);expect(replay.pago.id).toBe(payment.id)
  expect(Number(readLocalSql(`SELECT count(*) FROM asientos_contables WHERE source_event_id='${event}'`))).toBe(1)
  expect(json(`SELECT jsonb_build_object('count',count(*),'completed',bool_and(status='completed')) FROM outbox_events WHERE event_id='${event}'`)).toEqual({count:1,completed:true})
  proof.steps.push({name:'actual_unique_balanced_payment_journal_credits_operating_cash10111_after_replay',result:'PASS',journals})
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText('P2-CASH-'+suffix,{exact:true})).toBeVisible()
  await post('cajas/'+fixture.caja_id+'/cierre',{sesionId:opening.id,monto_contado:90,moneda:'PEN',notas:'Cierre del ensayo efectivo '+suffix})
  expect(readLocalSql(`SELECT estado FROM sesiones_caja WHERE id='${opening.id}'`)).toBe('CERRADA')
  proof.steps.push({name:'reload_reads_original_payment_and_owned_cash_session_closes_at90',result:'PASS',sessionId:opening.id})
  expect(proof.scriptErrors).toEqual([]);proof.complete=true
 }finally{writeFileSync(path.join(output,'browser-cxp-cash-account.json'),JSON.stringify(proof,null,2))}
})
