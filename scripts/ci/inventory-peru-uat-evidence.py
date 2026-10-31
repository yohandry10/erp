"""Inventory exact requirement evidence without granting acceptance to stale runs."""
import collections, datetime, hashlib, json, re, sys
from functools import lru_cache
from pathlib import Path
import uat_evidence

root=Path(__file__).resolve().parents[2]
out=root/'artifacts/peru-go-prod-remediation-20261016'
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
target=out/('requirement-evidence-inventory-'+stamp+'.json')
matrix=json.loads((root/'artifacts/peru-uat-20261007/acceptance-matrix.json').read_bytes())
cases={c['id']:c for c in matrix['operation_acceptance'] if c.get('ui_complete') and c.get('environment')!='LOCAL3300_ANTERIOR'}
raw_sha=uat_evidence._sha
checked={}
def cached_sha(path):
    name=str(path)
    if name not in checked:checked[name]=raw_sha(path)
    return checked[name]
uat_evidence._sha=cached_sha
@lru_cache(None)
def validate(name,steps):
    try:
        proof=uat_evidence.validate_scoped_ui_proof(root,name,steps)
        return dict(result='PASS_CURRENT_EXACT_PROOF',proof=proof)
    except (uat_evidence.EvidenceValidationError,OSError)as error:
        return dict(result='REPLAY_REQUIRED',reason=str(error))

rows=[]
for case_id,c in cases.items():
    required=collections.defaultdict(set)
    for step in c.get('verified_steps',[]):
        if str(step.get('evidence','')).endswith('.json'):required[step['evidence']].add(step['step'])
    evidence=[dict(path=name,requiredSteps=sorted(steps),**validate(name,tuple(sorted(steps)))) for name,steps in required.items()]
    reasons=[e['reason'] for e in evidence if e['result']!='PASS_CURRENT_EXACT_PROOF']
    if not evidence:reasons.append('No named structured assertion with version provenance')
    rows.append(dict(id=case_id,module=c['module'],operation=c['operation'],result='REPLAY_REQUIRED' if reasons else 'PASS_CURRENT_EXACT_PROOF',evidence=evidence,reasons=reasons))

# Every dependency read for provenance must remain unchanged during this audit.
changed=[name for name,digest in checked.items()if not Path(name).is_file()or raw_sha(Path(name))!=digest]
counts=collections.Counter(row['result']for row in rows)
reasons=collections.Counter(reason.split(':',1)[0]for row in rows for reason in row['reasons'])
proof=dict(scope='Requirement evidence inventory only; no global acceptance',result='INVENTORY_COMPLETE' if not changed else 'SOURCE_CHANGED_RETRY_REQUIRED',
    remoteWrites=False,cases=len(rows),counts=dict(counts),reasonCounts=dict(reasons),sourcesUnchanged=not changed,changedFiles=changed,
    matrixSha256=raw_sha(root/'artifacts/peru-uat-20261007/acceptance-matrix.json'),rows=rows,recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in proof.items()if k not in ['rows','changedFiles']},ensure_ascii=False))
print(str(target))
raise SystemExit(0 if not changed else 1)
