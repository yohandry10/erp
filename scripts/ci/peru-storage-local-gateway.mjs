import http from 'node:http';
import assert from 'node:assert/strict';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
const rest=new URL(process.env.LOCAL_RAW_POSTGREST_URL);
const storage=new URL(process.env.LOCAL_STORAGE_URL);
for(const url of [rest,storage]) assert.equal(url.hostname,'127.0.0.1');
const port=Number(process.env.LOCAL_STORAGE_GATEWAY_PORT);
assert.ok(port>1024&&port<65536);
const server=http.createServer((incoming,outgoing)=>{
 const parsed=new URL(incoming.url,'http://127.0.0.1');
 const isStorage=parsed.pathname.startsWith('/storage/v1/');
 const target=isStorage?storage:rest;
 const suffix=isStorage?parsed.pathname.slice('/storage/v1'.length):parsed.pathname.replace(/^\/rest\/v1(?=\/)/,'');
 const headers={...incoming.headers,host:target.host};
 const request=http.request({hostname:target.hostname,port:target.port,method:incoming.method,path:suffix+parsed.search,headers},response=>{
  outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
 });
 request.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end('Servicio local no disponible');});
 incoming.pipe(request);
});
server.listen(port,'127.0.0.1',()=>process.stdout.write('LOCAL_STORAGE_GATEWAY_READY\n'));
process.once('SIGTERM',()=>server.close());
