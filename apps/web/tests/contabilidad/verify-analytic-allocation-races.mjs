import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

// React and a DOM in memory: no browser driver, network or business database.
const require = createRequire(import.meta.url), { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','HTMLSelectElement','Node','Event','MutationObserver']) {
  Object.defineProperty(globalThis,key,{value: key==='window'?dom.window:dom.window[key],configurable:true});
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { render, screen, fireEvent, act, cleanup } = require('@testing-library/react'), ts = require('typescript');
const source = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')), '../../components/contabilidad/DistribucionAnaliticaPanel.tsx');
let api;
const wrap = tag => ({ children, ...props }) => React.createElement(tag,props,children);
const icons = Object.fromEntries(['AlertCircle','Loader2','Plus','Save','Trash2'].map(name=>[name,props=>React.createElement('svg',{'aria-hidden':true,...props})]));
const exports = {};
const dependencies = name => name==='@/hooks/use-api'?{useApi:()=>api}:name==='lucide-react'?icons:name==='@/components/ui/button'?{Button:wrap('button')}:name==='@/components/ui/card'?{Card:wrap('section'),CardHeader:wrap('header'),CardContent:wrap('div'),CardTitle:wrap('h3')}:require(name);
const baseline=process.argv.includes('--baseline-f006');
const componentSource=baseline?execFileSync('git',['show','f00668512e5e34306631383639a6e191b84fd9aa:apps/web/components/contabilidad/DistribucionAnaliticaPanel.tsx'],{cwd:path.resolve(path.dirname(source),'../../../..'),encoding:'utf8'}):fs.readFileSync(source,'utf8');
vm.runInNewContext(ts.transpileModule(componentSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:dependencies,console,setTimeout,clearTimeout},{filename:source});
const Panel = exports.DistribucionAnaliticaPanel;
const centre='11111111-1111-4111-8111-111111111111', detail='22222222-2222-4222-8222-222222222222';
const centres=[{id:centre,codigo:'CC-1',nombre:'Centro de prueba',activo:true,eje:'CENTRO_COSTO'}];
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}};
const gates=()=>({centres:deferred(),distribution:deferred()});
const read=g=>endpoint=>g[endpoint.endsWith('/centros-costo')?'centres':'distribution'].promise;
const resolve=async(g,rows=[])=>act(async()=>{g.centres.resolve({success:true,data:centres});g.distribution.resolve({success:true,data:rows});});
const element=id=>React.createElement(Panel,{detalleId:id,cuenta:'63 · Gasto',importe:12.34,formatCurrency:n=>String(n),onClose:()=>{}});
const checks=[];
const failures=[];
const check=async(name,body)=>{
  const deadline=setTimeout(()=>{console.error('Unfinished test:',name);process.exit(2)},15000);
  try{await body();checks.push(name)}catch(error){failures.push({name,message:error.message.slice(0,180)})}finally{clearTimeout(deadline);cleanup()}
};
const ready=()=>act(async()=>{});
const destination=()=>screen.getByRole('combobox',{name:'Destino',exact:true});
const save=()=>screen.getByRole('button',{name:'Guardar reparto',exact:true});
const saved=[{centro_costo_id:centre,eje:'CENTRO_COSTO',porcentaje:100,monto:12.34}];
const getSaved=async endpoint=>({success:true,data:endpoint.endsWith('/centros-costo')?centres:saved});
await check('late_superseded_read_preserves_selection_and_one_original_save',async()=>{
  const old=gates(), current=gates(), posts=[];let loaded=false,stored=[];
  const currentGet=endpoint=>!loaded?read(current)(endpoint):Promise.resolve({success:true,data:endpoint.endsWith('/centros-costo')?centres:stored});
  api={get:read(old),post:async(endpoint,body)=>{posts.push({endpoint,body});stored=body.imputaciones.map(row=>({...row,eje:body.eje,monto:12.34}));return{success:true}},del:async()=>({success:true})};
  const view=render(element(detail));
  api={...api,get:currentGet};view.rerender(element(detail));
  await resolve(current);loaded=true;
  fireEvent.change(screen.getByRole('combobox',{name:'Destino',exact:true}),{target:{value:centre}});
  assert.equal(screen.getByRole('combobox',{name:'Destino',exact:true}).value,centre);
  assert.equal(screen.getByRole('button',{name:'Guardar reparto',exact:true}).disabled,false);
  await resolve(old);
  assert.equal(screen.getByRole('combobox',{name:'Destino',exact:true}).value,centre,'An older read must not erase the selected destination');
  assert.equal(screen.getByRole('button',{name:'Guardar reparto',exact:true}).disabled,false);
  assert.equal(posts.length,0);
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Guardar reparto',exact:true})));
  assert.equal(posts.length,1);assert.equal(posts[0].body.detalle_asiento_id,detail);
  assert.equal(posts[0].body.eje,'CENTRO_COSTO');assert.deepEqual(JSON.parse(JSON.stringify(posts[0].body.imputaciones)),[{centro_costo_id:centre,porcentaje:100}]);
});
await check('a_late_read_from_another_detail_cannot_replace_the_current_form',async()=>{
  const old=gates(),current=gates();let active=old;
  api={get:endpoint=>read(active)(endpoint),post:async()=>({success:true}),del:async()=>({success:true})};
  const view=render(element(detail));active=current;view.rerender(element('33333333-3333-4333-8333-333333333333'));
  await resolve(current,saved);
  await resolve(old,[{...saved[0],centro_costo_id:'44444444-4444-4444-8444-444444444444',porcentaje:50}]);
  assert.equal(destination().value,centre);assert.equal(screen.getByRole('spinbutton',{name:'Porcentaje'}).value,'100');
});
await check('a_late_failed_read_cannot_erase_a_selection_or_show_an_old_error',async()=>{
  const old=gates(),current=gates();api={get:read(old),post:async()=>({success:true}),del:async()=>({success:true})};
  const view=render(element(detail));api={...api,get:read(current)};view.rerender(element(detail));
  await resolve(current);fireEvent.change(destination(),{target:{value:centre}});
  await act(async()=>{old.centres.resolve({success:true,data:centres});old.distribution.reject(new Error('Error de lectura anterior'));});
  assert.equal(destination().value,centre);assert.ok(!screen.queryByText('Error de lectura anterior'),'An obsolete read error must not appear');assert.equal(save().disabled,false);
});
await check('failed_read_blocks_the_form_and_retry_restores_the_server_snapshot',async()=>{
  let fail=true;api={get:async endpoint=>fail?Promise.reject(new Error('Lectura no disponible')):getSaved(endpoint),post:async()=>({success:true}),del:async()=>({success:true})};
  render(element(detail));await ready();
  assert.ok(screen.getByRole('alert').textContent.includes('Lectura no disponible'));
  assert.ok(!screen.queryByRole('combobox',{name:'Destino'}),'Failed reads must hide the editor');assert.ok(!screen.queryByRole('button',{name:'Guardar reparto',exact:true}),'Failed reads must block saving');
  fail=false;await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Reintentar consulta',exact:true})));
  assert.equal(destination().value,centre);assert.equal(save().disabled,false);
});
await check('a_failed_save_keeps_the_current_selection_for_correction',async()=>{
  let posts=0;api={get:getSaved,post:async()=>{posts++;throw new Error('Reparto rechazado')},del:async()=>({success:true})};
  render(element(detail));await ready();await act(async()=>fireEvent.click(save()));
  assert.equal(posts,1);assert.equal(destination().value,centre);assert.equal(save().disabled,false);assert.ok(screen.getByText('Reparto rechazado'));
});
await check('a_late_failed_write_does_not_paint_another_detail_or_leave_it_locked',async()=>{
  const pending=deferred();let posts=0;
  api={get:getSaved,post:()=>{posts++;return pending.promise},del:async()=>({success:true})};
  const view=render(element(detail));await ready();fireEvent.click(save());
  view.rerender(element('33333333-3333-4333-8333-333333333333'));await ready();
  await act(async()=>pending.reject(new Error('Error de la línea anterior')));
  assert.equal(posts,1);assert.equal(destination().value,centre);assert.equal(save().disabled,false);assert.ok(!screen.queryByText('Error de la línea anterior'),'An obsolete write error must not appear on another detail');
});
await check('a_late_failed_delete_remains_bound_to_its_original_detail',async()=>{
  const pending=deferred(),deletes=[];
  api={get:getSaved,post:async()=>({success:true}),del:endpoint=>{deletes.push(endpoint);return pending.promise}};
  const view=render(element(detail));await ready();fireEvent.click(screen.getByRole('button',{name:'Eliminar eje',exact:true}));
  view.rerender(element('33333333-3333-4333-8333-333333333333'));await ready();
  await act(async()=>pending.reject(new Error('Error de borrado anterior')));
  assert.deepEqual(deletes,[`/api/contabilidad/distribucion-analitica/${detail}?eje=CENTRO_COSTO`]);
  assert.equal(destination().value,centre);assert.equal(save().disabled,false);assert.ok(!screen.queryByText('Error de borrado anterior'),'An obsolete delete error must not appear');
});
await check('switching_axes_preserves_the_server_distributions_and_saves_the_selected_axis',async()=>{
  const project='55555555-5555-4555-8555-555555555555',posts=[];
  const options=[...centres,{id:project,codigo:'PR-1',nombre:'Proyecto de prueba',activo:true,eje:'PROYECTO'}];
  const rows=[...saved,{centro_costo_id:project,eje:'PROYECTO',porcentaje:100,monto:12.34}];
  let reads=0;
  api={get:async endpoint=>{reads++;return{success:true,data:endpoint.endsWith('/centros-costo')?options:rows}},post:async(endpoint,body)=>{posts.push(body);return{success:true}},del:async()=>({success:true})};
  render(element(detail));await ready();assert.equal(destination().value,centre);
  fireEvent.change(screen.getByRole('combobox',{name:'Eje analítico',exact:true}),{target:{value:'PROYECTO'}});assert.equal(destination().value,project);
  fireEvent.change(screen.getByRole('combobox',{name:'Eje analítico',exact:true}),{target:{value:'CENTRO_COSTO'}});assert.equal(destination().value,centre);
  fireEvent.change(screen.getByRole('combobox',{name:'Eje analítico',exact:true}),{target:{value:'PROYECTO'}});assert.equal(reads,2);
  await act(async()=>fireEvent.click(save()));assert.equal(posts.length,1);assert.equal(posts[0].eje,'PROYECTO');assert.equal(posts[0].imputaciones[0].centro_costo_id,project);assert.equal(destination().value,project);
});
dom.window.close();
console.log(JSON.stringify({passed:failures.length===0,baseline,checks:checks.length,names:checks,failures,browser:false,network:false}));
process.exitCode=failures.length?1:0;
