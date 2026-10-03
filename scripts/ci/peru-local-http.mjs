import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// La ampliación del runner comparte la IP local entre más administradores.
// Mantiene el limitador real y repite exclusivamente el login tras Retry-After.
export async function fetchWithLocalLoginRetry(url,options={},onThrottle) {
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
  const endpoint=new URL(url);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname));
  for(let attempt=0;attempt<2;attempt++) {
    const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
    if(attempt===0&&response.status===429&&options.method==='POST'
      &&endpoint.pathname.replace(/\/$/,'')==='/api/auth/login') {
      const seconds=Number(response.headers.get('retry-after'));
      assert.ok(Number.isInteger(seconds)&&seconds>0&&seconds<=60,'Retry-After de login debe estar acotado');
      onThrottle?.(seconds);
      await response.body?.cancel();
      console.log(`[local-login] Respeta Retry-After: ${seconds}s`);
      await delay(seconds*1000);
      continue;
    }
    return response;
  }
  throw new Error('Login local sin respuesta final');
}
