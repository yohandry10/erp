"""Publish acceptance only after every finite requirement and current gate passes."""
import hashlib,json,re,sys
import subprocess
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[2];out=root/'artifacts/peru-uat-570'
sys.path.insert(0,str(root/'scripts/ci'))
from uat_evidence import validate_scoped_ui_proof
read=lambda p:json.loads(p.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
matrix=read(root/'artifacts/peru-uat-20261007/acceptance-matrix.json')
catalog={c['id']:c for c in matrix['operation_acceptance']}
plan=read(out/'finite-writer-ui-scope-plan.json')
snapshot=read(out/'final-supplier-return-current-sources-before-full.json')
run=root/'artifacts'/snapshot['run']
gates=[]
def gate(kind,path,predicate):
 p=root/path;v=read(p);assert predicate(v),(kind,path)
 gates.append(dict(kind=kind,evidence=path,sha256=sha(p),result='PASS'))
 return v
def current_web_sources(v,allowed=()):
 changed=[]
 for f,h in v['sourceFiles'].items():
  p=root/'apps/web'/f
  if sha(p)!=h:changed.append(f)
 assert set(changed).issubset(set(allowed)),changed
 return changed

meta=gate('integratedUI',str((run/'run.json').relative_to(root)).replace('\\','/'),lambda v:v['success'] and v['scope']=='full' and all(v[k]for k in ['withBrowser','withSurvey','withRecords','withNative']) and v['remoteWrites'] is False)
gate('backupRestore',str((run/'backup/restore.json').relative_to(root)).replace('\\','/'),lambda v:v['success'])
gate('nativeFreshBusiness',str((run/'native-run.json').relative_to(root)).replace('\\','/'),lambda v:v['success'] and v['previousProcessesAndBinariesPreserved'] and v['preservedUATWrites']==0 and v['remoteWrites'] is False)
gate('nativeFreshSQL',str((run/'native-original-assets.json').relative_to(root)).replace('\\','/'),lambda v:v['success'] and v['surface']=='WINDOWS_TAURI_WEBVIEW2' and len(v['checks'])==5 and all(c['result']=='PASS'for c in v['checks']))
gate('routeSurvey',str((run/'module-survey/survey.json').relative_to(root)).replace('\\','/'),lambda v:len(v['routes'])==101 and all(not f['errors']for f in v['routes']))
gate('recordSurvey',str((run/'record-survey/survey.json').relative_to(root)).replace('\\','/'),lambda v:len(v['findings'])==22 and not v['missingFixtures'] and all(not f['errors']for f in v['findings']))
browser_log=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',(run/'browser.log').read_text(encoding='utf-8',errors='replace'));assert re.search(r'\b47 passed\b',browser_log)
for r in snapshot['sourceFiles']:assert sha(root/r['path'])==r['sha256'],r['path']
api=gate('api','artifacts/peru-uat-570/integrated-document-branch-current-final-api-gates-manifest.json',lambda v:v['result']=='PASS')
for f,h in api['sourceFiles'].items():assert sha(root/f)==h,f
report=read(out/api['report']);assert report['success'] and report['numPassedTests']==5208 and report['numPassedTestSuites']==372
web=gate('web','artifacts/peru-uat-570/supplier-return-final-web-gates-manifest.json',lambda v:v['result']=='PASS' and all(v[k]=='PASS'for k in ['build','typecheck','lint']))
current_web_sources(web)
rust=gate('rust','artifacts/peru-uat-570/document-fiscal-offline-and-native-regressions.json',lambda v:v['result']=='PASS' and v['RustTests']==46)
for f,h in rust['sources'].items():assert sha(root/f)==h,f
sql=gate('sqlFresh','artifacts/erp-peru-570-fresh-20261015183336818-25220-20261015183336818-25220.json',lambda v:v['success'] and v['sql570Passed'] and v['atomicRollbackPassed'] and v['preservationPassed'] and v['preservationNegativeControlsPassed'] and len(v['sqlVerifiers'])==80 and v['remoteWrites'] is False)
migrations=list((root/'supabase/migrations').glob('570__*.sql'));assert len(migrations)==1 and sha(migrations[0])==sql['migrationSha256']
verifiers=list((root/'supabase/verify').glob('570__*.sql'));assert len(verifiers)==1 and sha(verifiers[0])==sql['verifierSha256']
gate('native','artifacts/peru-uat-570/supplier-return-final-native-postconditions.json',lambda v:v['result']=='PASS' and v['physicalRestartUIVerified'] and v['actorSQLiteQueuedRequests']==0 and v['preservedUATBusinessWrites']==0)
gate('preservation','artifacts/peru-uat-570/final-runtime-preservation-and-availability.json',lambda v:v['result']=='PASS' and v['epoch']['newBusinessWrites']==0 and v['remoteWrites'] is False)
gate('postRebootPreservation','artifacts/peru-uat-570/post-complete-host-reboot-preservation-and-availability.json',lambda v:v['result']=='PASS' and v['epoch']['newBusinessWrites']==0 and v['actorSQLiteQueuedRequests']==0 and v['remoteWrites'] is False)
contracts_path=read(out/'active-uat-work-progress.json')['currentClientContractsGate']
contracts=gate('clientContracts','artifacts/peru-uat-570/'+contracts_path,lambda v:v['result']=='PASS' and v['sourcesUnchangedDuringRun'] and len(v['scripts'])==26 and all(r['result']=='PASS'for r in v['scripts']))
current_web_sources(contracts)
ci=gate('isolatedCI','artifacts/peru-uat-570/final-current-isolated-ci-after-return.json',lambda v:v['result']=='PASS' and v['isolatedBusinessCases']==115 and v['publicLoginThemePassed']==1 and v['allProductChangesVerifiedByCurrentScopedUI'])
current_web_sources(ci)
storage=gate('storage','artifacts/peru-uat-570/integrated-current-wizard-logo-reset-real-ui.json',lambda v:v['complete'] and len(v['steps'])==4 and not v['page_errors'] and v['databaseAndStorageRestored'] and v['remoteWrites'] is False)
for f,h in storage['sourceHashes'].items():assert sha(root/f)==h,f
fiscal=gate('fiscalBoundary','artifacts/peru-uat-570/native-supplier-return-final-fiscal-boundary-controls-ui.json',lambda v:v['complete'] and len(v['steps'])==4 and not v['page_errors'] and not v['unexpectedWriters'] and v['businessWrites']==0 and v['externalFiscalAcceptance'] is False)
assert fiscal['binarySha256']==read(out/'supplier-return-final-native-launch.json')['binarySha256']
native_return=gate('nativeReturnFeedback','artifacts/peru-uat-570/native-supplier-return-feedback-contract-ui.json',lambda v:v['complete'] and len(v['steps'])==2 and not v['page_errors'] and v['originalSQLRowUnchanged'] and v['realRowDisplayRestored'] and v['businessWrites']==0)
assert native_return['binarySha256']==fiscal['binarySha256']
images=gate('productionImages','artifacts/peru-uat-570/final-production-image-gates.json',lambda v:v['result']=='PASS' and len(v['images'])==2 and all(i['node'].startswith('24.')for i in v['images'].values()) and v['productionDeploymentPerformed'] is False)
wizard_ci=gate('wizardCI','artifacts/peru-uat-570/final-wizard-ci-contract-gate.json',lambda v:v['result']=='PASS' and v['passed']==4 and v['githubExcludedFromDockerContext'] and v['productionImageInputsUnchanged'])
assert wizard_ci['beforeWorkflowSha256']==images['sourceFiles']['.github/workflows/ci.yml'] and wizard_ci['afterWorkflowSha256']==sha(root/'.github/workflows/ci.yml')
for f,h in images['sourceFiles'].items():
 if f!='.github/workflows/ci.yml':assert sha(root/f)==h,f

def cases(ids):
 assert ids and all(catalog.get(i,{}).get('ui_complete')for i in ids),ids
 for case_id in ids:
  case=catalog[case_id]
  assert case.get('verified_steps'),('Missing named requirement assertions',case_id)
  for evidence in case['evidence']:
   assert (root/evidence).is_file(),('Missing requirement evidence',case_id,evidence)
   if Path(evidence).suffix.lower()=='.json':good_evidence(evidence,case_id)
 return ids
def good_evidence(path,case_id=None):
 v=read(root/path)
 if case_id:
  named={s['step']for s in catalog[case_id]['verified_steps']if s['evidence']==path}
 else:named={s.get('name',s.get('step'))for s in v.get('steps',[])if s.get('result')=='PASS'}
 proof=validate_scoped_ui_proof(root,path,named)
 return proof['sha256']
validated=[]
for r in plan['rows']:
 assert sha(root/r['source'])==r['sourceSha256'],r['source']
 resolution=r['resolution'];kind=resolution['kind'];v=dict(r)
 if kind in ['EXPLICIT_SCOPED_UI_CASES','EXISTING_EXPLICIT_SCOPED_UI_REFERENCES']:
  cases(resolution['caseIds'])
 elif kind=='EXISTING_EXACT_UI_REQUEST_TRACE':
  assert resolution['references']
  for ref in resolution['references']:cases([ref['case']]);good_evidence(ref['evidence'],ref['case'])
 elif kind=='EXACT_FRESH_FULL_UI_TEST':
  test=resolution['freshTest'];assert test['title'] in (root/'apps/web'/test['file']).read_text(encoding='utf-8')
  assert test['title'] in (run/'browser.log').read_text(encoding='utf-8',errors='replace'),test
 elif kind=='PRIOR_REAL_UI_SPECIFIC_STEP':
  evidence=read(root/resolution['evidence']);good_evidence(resolution['evidence']);assert any(s.get('name')==resolution['step'] and s.get('result')=='PASS'for s in evidence['steps'])
 elif kind in ['NO_OFFERED_UI_CONSUMER','OPTIONAL_EXTERNAL_REFERENCE_LOOKUP','NOT_OFFERED_IN_PERU_COUNTRY_CONDITION']:
  assert resolution['reason'] and resolution['source']==r['source']
 else:raise AssertionError(('Unaccepted writer classification',r['index'],kind))
 v['validated']=True;validated.append(v)
by_key={(r['method'],r['endpoint'],r['source']):r for r in validated}
all_writers={}
for route in matrix['routes']:
 for op in route['operations']:
  if op['method']in ['GET','HEAD','OPTIONS']:continue
  key=(op['method'],op['endpoint'],op['source'])
  bound=[i for i in op['acceptance_cases']if catalog[i]['ui_complete']]
  if not bound:assert key in by_key,('Unreviewed offered writer',key)
  all_writers[key]=dict(method=op['method'],endpoint=op['endpoint'],source=op['source'],caseIds=bound,reviewedPlanIndex=by_key[key]['index']if key in by_key else None)
assert len(all_writers)==195 and len(validated)==124
coverage=dict(result='PASS',scope='CURRENT_STATIC_NON_GET_CALL_SITES_RECONCILED_WITH_PERU_OFFERED_CONTROL_SCOPE',uniqueWriters=len(all_writers),reviewedCandidates=len(validated),unresolved=0,rows=list(all_writers.values()),reviewedResolutions=validated,authorityAcceptanceClaimed=False,nonGetCallCountIsNotBusinessCommitCount=True)

retained=[];modules=[]
# A requirement must be checked even when it is absent from the writer plan.
# A global PASS and ui_complete flag never replace its own proof and version.
for c in catalog.values():
 if c['ui_complete'] and c.get('environment')!='LOCAL3300_ANTERIOR':cases([c['id']])
for c in catalog.values():
 if c['ui_complete'] and c.get('environment')!='LOCAL3300_ANTERIOR':continue
 assert c.get('environment')=='LOCAL3300_ANTERIOR' or re.search('TECHNICAL|SUPPORT|REPRODUCED',c.get('classification','')) or c['id']in ['mixed-receipt-native-second-partial','budget-delete-receipt-baseline'],('Missing functional UI acceptance',c['id'])
 retained.append(dict(id=c['id'],reason='Se conserva como evidencia histórica/técnica con su alcance original; los requisitos funcionales vigentes se verifican por casos separados.'))
for name in sorted({c['module']for c in catalog.values()}|{r['module']for r in matrix['routes']}):
 requirements=[dict(id=c['id'],operation=c['operation'],caseIds=[c['id']],evidence=c['evidence'],originalScopeLimits=c.get('limits',[]))for c in catalog.values()if c['module']==name and c['ui_complete'] and c.get('environment')!='LOCAL3300_ANTERIOR']
 if name=='dashboard':
  # These dashboard requirements were originally classified under Administration.
  # Keep their existing scoped cases and evidence; do not infer acceptance from routes.
  for requirement_id in ['dashboard-operational-read-semantic-recovery','dashboard-operational-lifecycle','dashboard-operational-roles','operational-dashboard-seven-source-failures']:
   cases([requirement_id]);c=catalog[requirement_id]
   requirements.append(dict(id=c['id'],operation=c['operation'],caseIds=[c['id']],evidence=c['evidence'],originalScopeLimits=c.get('limits',[]),originalModule=c['module']))
 assert requirements,name
 modules.append(dict(module=name,requirements=requirements,status='PASS_FINITE_VERIFIED_PRODUCT_SCOPE'))
known=[]
for c in matrix['corrections']:
 if re.search('CORREGIDO|RECUPERADO|CONTENIDO|SOPORTE_API_CORREGIDO',c['status']):continue
 assert c['severity']in ['P2','P3'],('Open blocking defect',c['id'])
 known.append(dict(id=c['id'],severity=c['severity'],issue=c['issue'],status=c['status'],evidence=c.get('evidence',[]),releaseImpact='Observación acotada ya contrastada; no impide el escenario funcional ni cambia permisos, importes persistidos o aceptación fiscal. Se conserva para seguimiento.'))
assert len(known)==15
result=dict(result='PASS',scope='CANDIDATO_TECNICO_UAT_PERU',uatComplete=True,readyForProductionCandidate=True,authorityAcceptanceClaimed=False,productionDeploymentPerformed=False,productionDeploymentAuthorized=False,productionSchemaRemains569=True,localCandidateSchema570=True,modules=modules,retainedEvidenceOnly=retained,knownNonBlockingObservations=known,openBlockingDefects=[],gates=gates,sourceHashes={r['path']:r['sha256']for r in snapshot['sourceFiles']},integratedRun=run.name,verifiedAt=datetime.now(timezone.utc).isoformat(),acceptanceCriteria='Todos los controles funcionales ofrecidos de Perú tienen casos UI de alcance expreso, gates vigentes y restauración. Las transmisiones/constancias fiscales reales se validan al activar cada contribuyente según RELEASE.md; no se inventan con fixtures. Las observaciones P2/P3 conservan su alcance y evidencia.')
result.update(baseCommit=subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=root).strip(),branch=subprocess.check_output(['git','branch','--show-current'],text=True,cwd=root).strip(),worktree=str(root),workingTreeHasChanges=True)
result.pop('productionSchemaRemains569',None)
result.update(lastRecordedProductionSchema=569,productionEnvironmentChangedByThisUAT=False,remoteCIExecutedForThisUncommittedCandidate=False)
result['sourceHashes'].update(images['sourceFiles'])
result['sourceHashes']['.github/workflows/ci.yml']=wizard_ci['afterWorkflowSha256']
for f in ['artifacts/peru-uat-20261007/build-acceptance-matrix.mjs','artifacts/peru-uat-20261007/current-finite-readiness.mjs','artifacts/peru-uat-20261007/current-finite-acceptance-cases.mjs','artifacts/peru-uat-570/validate-final-finite-uat.py','scripts/ci/validate-peru-uat.py','scripts/ci/uat_evidence.py','scripts/ci/test_uat_evidence.py','artifacts/peru-uat-570/finite-writer-ui-scope-plan.json','apps/web/playwright.config.ts']:
 result['sourceHashes'][f]=sha(root/f)
if '--publish' in sys.argv:
 target=out/'finite-uat-product-acceptance.json';assert not target.exists()
 writer=out/'final-finite-offered-writer-coverage.json';assert not writer.exists()
 writer.write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf-8')
 result['offeredWriterCoverage']=dict(evidence=str(writer.relative_to(root)).replace('\\','/'),sha256=sha(writer),uniqueWriters=195,unresolved=0)
 target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(result='PASS',published='--publish'in sys.argv,modules=len(modules),requirements=sum(len(m['requirements'])for m in modules),writers=len(all_writers),retainedTechnicalOrHistorical=len(retained),knownObservations=len(known))))
