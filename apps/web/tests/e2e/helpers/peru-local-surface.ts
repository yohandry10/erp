import {test as base,expect} from '@playwright/test'

// La variante Windows usa exclusivamente una instancia creada por el ejecutor
// efímero. No descubre ni conecta las instancias de escritorio del usuario.
export const test=base.extend({
  context:async({context,playwright},use)=>{
    const endpoint=process.env.LOCAL_NATIVE_CDP_URL
    if(!endpoint){await use(context);return}
    if(process.env.E2E_EPHEMERAL_LOCAL_DB!=='1'||endpoint!=='http://127.0.0.1:9333')throw Error('CDP nativo efímero inválido')
    const browser=await playwright.chromium.connectOverCDP(endpoint)
    const native=browser.contexts()[0]
    try{await use(native)}finally{await native.unrouteAll({behavior:'wait'});await browser.close()}
  },
  page:async({context},use)=>{
    const native=!!process.env.LOCAL_NATIVE_CDP_URL
    const page=native?context.pages().find(p=>p.url().startsWith('http://tauri.localhost')):await context.newPage()
    if(!page)throw Error('No existe la ventana Windows del ensayo efímero')
    try{await use(page)}finally{if(!native)await page.close()}
  },
})
export {expect}
