// Run only through root's scoped offline guard. No HTTP, SQL, UI, or ERP writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const webRoot=process.argv[2]||path.resolve(__dirname,'../..');
const helper=fs.readFileSync(path.join(webRoot,'lib/journal-catalog.ts'),'utf8'),page=fs.readFileSync(path.join(webRoot,'app/dashboard/contabilidad/asientos/page.tsx'),'utf8');
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
let transport=async()=>{throw Error('Unconfigured offline transport')};const requestLog=[];
const session={user:{id:'actor-A',tenant_id:'A'},access_token:'fixture-token-not-real'};
function moduleFrom(text,deps){const module={exports:{}};vm.runInNewContext(compile(text),{module,exports:module.exports,require:name=>{assert.ok(Object.hasOwn(deps,name),'unapproved dependency '+name);return deps[name];},Map,Number,Error,Headers,FormData,URL,process:{env:{}},console});return module.exports;}
const apiURL=moduleFrom(fs.readFileSync(path.join(webRoot,'lib/api-url.ts'),'utf8'),{});
const offlineSource=fs.readFileSync(path.join(webRoot,'lib/offline-store.ts'),'utf8'),offlineSF=ts.createSourceFile('offline-store.ts',offlineSource,ts.ScriptTarget.Latest,true);
const flags=moduleFrom(offlineSF.statements.filter(n=>ts.isFunctionDeclaration(n)&&['isOfflineCachedResponse','isOfflineQueuedResponse'].includes(n.name?.text)).map(n=>n.getText(offlineSF)).join('\n'),{});
const api=moduleFrom(fs.readFileSync(path.join(webRoot,'lib/api-fetch.ts'),'utf8'),{'./api-url':apiURL,'./auth-service':{customAuth:{getCachedSession:()=>({session,accessToken:session.access_token})}},'./offline-store':{fetchWithOfflineSupport:async(url,options,scope)=>{requestLog.push({url,options,scope});return transport(url,options,scope);}}});
const {loadJournalCatalog,readJournalPage}=moduleFrom(helper,{'./api-fetch':api,'./offline-store':flags});
const sf=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),component=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AsientosPage');
// Execute actual component declarations and callbacks up to its formatting/render code.
const prefix=component.body.statements.slice(0,component.body.statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(sf)==='formatCurrency'))).map(n=>n.getText(sf)).join('\n');
function host(get){let index=0,slots=[],session={user:{id:'actor-A',tenant_id:'A',roles:['admin']},access_token:'A-1'},selected='A',cleanup=null;const hooks={
 useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
 useRef(initial){const i=index++;return slots[i]??(slots[i]={current:initial});},useCallback(fn){index++;return fn;},useEffect(fn){index++;this.nextEffect=fn;}};
 const sandbox={...hooks,useEffect:fn=>hooks.useEffect(fn),useApi:()=>({get}),useAuth:()=>({session,loading:false}),useTenant:()=>({tenant:{id:selected},user:{id:session.user.id},loading:false}),useCountryContext:()=>({}),useRouter:()=>({}),loadJournalCatalog,readJournalPage:get,JSON,Error};
 const actual=vm.runInNewContext(compile('function actual(){'+prefix+'\nreturn {asientos,loading,error,loadAsientos};}\nactual;'),sandbox);
 return {render(){index=0;return actual();},change(tenant,actor){selected=tenant;session={user:{id:actor,tenant_id:tenant,roles:['admin']},access_token:tenant+'-new'};},effect(){cleanup?.();cleanup=hooks.nextEffect();},unmount(){cleanup?.();}};
}
const rows=Array.from({length:156},(_,i)=>({id:'journal-'+i,tenant_id:'A',referencia:i===143?'UAT570-NC-REEMBOLSO-41.44':'other'}));
function response(endpoint,data=rows){const p=Number(new URL(endpoint,'http://local').searchParams.get('page'));return{success:true,data:data.slice((p-1)*50,p*50),page:p,limit:50,total:data.length,totalPages:Math.ceil(data.length/50)};}
(async()=>{
 const calls=[],h=host(async endpoint=>{calls.push(endpoint);return response(endpoint);});let state=h.render();await state.loadAsientos();state=h.render();assert.equal(state.asientos.length,156);assert.equal(state.asientos[143].referencia,'UAT570-NC-REEMBOLSO-41.44');assert.equal(calls.length,4);assert.equal(state.error,null);
 let second;const wait=new Promise(resolve=>second=resolve),broken=host(async endpoint=>endpoint.includes('page=1')?response(endpoint):wait);const pending=broken.render().loadAsientos();await new Promise(resolve=>setImmediate(resolve));assert.equal(broken.render().asientos.length,0);second({success:false,message:'page2 unavailable'});await pending;state=broken.render();assert.equal(state.asientos.length,0);assert.equal(state.error,'page2 unavailable');assert.equal(state.loading,false);
 let release;const held=new Promise(resolve=>release=resolve),stale=host(async()=>held);const old=stale.render().loadAsientos();stale.change('B','actor-B');assert.equal(stale.render().asientos.length,0);stale.change('A','actor-A');assert.equal(stale.render().asientos.length,0);release(response('/?page=1'));await old;state=stale.render();assert.equal(state.asientos.length,0);assert.equal(state.error,null);assert.equal(state.loading,true);
 // The same actual callback must remain silent after effect cleanup/unmount.
 let unlock;const deferred=new Promise(resolve=>unlock=resolve),removed=host(async()=>deferred);removed.render();removed.effect();removed.unmount();unlock(response('/?page=1'));await new Promise(resolve=>setImmediate(resolve));assert.equal(removed.render().asientos.length,0);
 await assert.rejects(loadJournalCatalog(async endpoint=>({...response(endpoint),page:99}),'A',()=>true),/paginación/);
 await assert.rejects(loadJournalCatalog(async endpoint=>({...response(endpoint),data:response(endpoint).data.map(r=>({...r,id:'duplicate'}))}),'A',()=>true),/cambió/);
 // Real readJournalPage + real fetchApi + real cache marker functions; no network.
 for(const headers of[{'x-erp-offline-cache':'true'},{'x-erp-offline-queued':'true'}]){
  const cached=new Response(JSON.stringify(response('/?page=1')),{status:200,headers});transport=async()=>cached;
  await assert.rejects(readJournalPage('/api/contabilidad/asientos?page=1&limit=50'),/listado completo actual/);assert.equal(cached.bodyUsed,false);
 }
 const unavailable=new Response('{invalid-json',{status:503});transport=async()=>unavailable;
 await assert.rejects(readJournalPage('/api/contabilidad/asientos?page=2&limit=50'),/listado completo actual/);assert.equal(unavailable.bodyUsed,false);
 transport=async url=>new Response(JSON.stringify(response(url)),{status:200});const live=await readJournalPage('/api/contabilidad/asientos?page=1&limit=50');assert.equal(live.data.length,50);
 transport=async url=>{const body=response(url);return new Response(JSON.stringify(body),{status:200,headers:body.page===2?{'x-erp-offline-cache':'true'}:{}});};
 const cacheFailure=host(readJournalPage);await cacheFailure.render().loadAsientos();state=cacheFailure.render();assert.equal(state.asientos.length,0);assert.match(state.error,/listado completo actual/);assert.equal(state.loading,false);
 for(const request of requestLog){assert.equal(request.options.method,'GET');assert.equal(request.options.credentials,'include');assert.equal(request.options.cache,'no-store');assert.equal(request.options.headers.get('Authorization'),'Bearer fixture-token-not-real');assert.equal(request.scope.tenantId,'A');assert.equal(request.scope.userId,'actor-A');}
 console.log(JSON.stringify({success:true,scope:'journal-list-pagination-only',cases:['156-full-refund-after-first50','page2-error-no-partial-publication','stale-context-A-B-A-and-unmount-ignored','metadata-and-duplicate-boundaries','real-reader-rejects-cache-queue-503-before-json','real-transport-page2-cache-clears-no-partial'],actualHTTP:0,actualSQL:0,actualUI:0,ERPSourceWrites:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
