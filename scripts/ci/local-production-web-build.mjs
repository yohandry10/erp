import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Only reuses a completed, unchanged local Web build. No URL or executable is
// taken from the artifact; the integral runner retains all loopback endpoints.
export function readLocalProductionWebBuild(root, filename, expectedApiUrl = 'http://127.0.0.1:3126') {
  if (!filename) return null;
  const file=fs.realpathSync(filename),artifacts=fs.realpathSync(path.join(root,'artifacts'));
  assert(file.startsWith(artifacts+path.sep),'Production Web gate must be a local artifact');
  const bytes=fs.readFileSync(file),proof=JSON.parse(bytes);
  assert(proof.success===true&&proof.complete===true&&proof.remoteWrites===false&&proof.sourcesUnchangedDuringRun===true,'Incomplete production Web gate');
  assert(proof.generatedMetadataRestored===true,'Generated build metadata was not restored');
  for(const phase of ['production-build','types-before-build','types-after-build','lint']){
    assert(proof.phases.some(row=>row.phase===phase&&row.exitCode===0),'Missing successful Web phase: '+phase);
  }
  assert(['http://127.0.0.1:3126','http://127.0.0.1:3186'].includes(expectedApiUrl),'Unowned build API destination');
  assert.equal(proof.localBuildApiUrl,expectedApiUrl,'Production Web build targets a different local API');
  assert(/^\.next-[a-zA-Z0-9-]+$/.test(proof.buildDirectory),'Unsafe production build directory');
  const build=path.join(root,'apps/web',proof.buildDirectory);
  assert(fs.readFileSync(path.join(build,'BUILD_ID'),'utf8').trim(),'Production BUILD_ID missing');
  const routes=JSON.parse(fs.readFileSync(path.join(build,'routes-manifest.json'),'utf8'));
  assert.deepEqual(routes.rewrites,{beforeFiles:[],afterFiles:[{...routes.rewrites.afterFiles[0],source:'/backend/:path*',destination:expectedApiUrl+'/:path*'}],fallback:[]},'Compiled proxy route differs from the owned API');
  assert(routes.rewrites.afterFiles[0].regex,'Compiled proxy matcher missing');
  const sources=Object.entries(proof.sourceHashes||{});assert(sources.length>100,'Web build provenance missing');
  for(const [name,expected]of sources){
    const source=path.resolve(root,name);assert(source.startsWith(root+path.sep),'Source path escaped repository');
    assert(/^[a-f0-9]{64}$/.test(expected),'Invalid source digest');
    assert.equal(createHash('sha256').update(fs.readFileSync(source)).digest('hex'),expected,'Production Web source changed: '+name);
  }
  return {gate:file,gateSha256:createHash('sha256').update(bytes).digest('hex'),buildDirectory:proof.buildDirectory,sourceCount:sources.length};
}
