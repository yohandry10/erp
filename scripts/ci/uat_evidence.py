"""Fail-closed validation of a requirement's concrete UI evidence."""
import hashlib
import json
import re
from pathlib import Path


class EvidenceValidationError(ValueError):
    pass


def _inside(root, name):
    path = (root / str(name).replace('\\', '/')).resolve()
    if not path.is_relative_to(root):
        raise EvidenceValidationError('Evidence/source path escapes candidate')
    return path


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_scoped_ui_proof(root, name, required_steps, *, expected_hash=None, bound_sources=None):
    """Check the actual proof, named assertions and its source provenance.

    bound_sources is a scoped source map recorded by a real replay runner when
    an older harness does not embed hashes. It must never be inferred from an
    unrelated passing requirement or a global test count.
    """
    root = Path(root).resolve()
    path = _inside(root, name)
    if not path.is_file():
        raise EvidenceValidationError('Missing requirement evidence: ' + name)
    digest = _sha(path)
    if expected_hash is not None and digest != expected_hash:
        raise EvidenceValidationError('Requirement evidence hash mismatch: ' + name)
    try:
        value = json.loads(path.read_bytes())
    except (ValueError, UnicodeError) as error:
        raise EvidenceValidationError('Invalid requirement proof: ' + name) from error
    if not isinstance(value, dict):
        raise EvidenceValidationError('Requirement proof must be an object: ' + name)
    result = str(value.get('result', ''))
    if value.get('complete') is False or value.get('success') is False or result.startswith(('FAIL', 'ERROR')):
        raise EvidenceValidationError('Failed/incomplete requirement proof: ' + name)
    if not (value.get('complete') is True or value.get('success') is True or result == 'PASS' or result.startswith('PASS_')):
        raise EvidenceValidationError('Explicit proof completion is absent: ' + name)
    if value.get('remoteWrites') is not False:
        raise EvidenceValidationError('Proof lacks explicit local-only transport: ' + name)
    if any(value.get(key) for key in ('page_errors', 'pageErrors', 'scriptErrors', 'unexpected_errors', 'unexpectedWriters', 'errors')):
        raise EvidenceValidationError('Requirement proof contains runtime errors: ' + name)
    steps = value.get('steps')
    if not isinstance(steps, list) or not required_steps:
        raise EvidenceValidationError('Named requirement assertions are absent: ' + name)
    if any(isinstance(step, dict) and (
            str(step.get('result', '')).startswith(('FAIL', 'ERROR'))
            or step.get('name', step.get('step')) in ('failure', 'error')
            or step.get('error') or step.get('errors')) for step in steps):
        raise EvidenceValidationError('Requirement proof contains a failed assertion: ' + name)
    passed = {step.get('name', step.get('step')) for step in steps
              if isinstance(step, dict) and step.get('result') == 'PASS'}
    if not set(required_steps).issubset(passed):
        raise EvidenceValidationError('A required UI assertion did not pass: ' + name)
    sources = {}
    for key in ('sourceHashes', 'sourceFiles', 'sources'):
        entries = value.get(key)
        if isinstance(entries, list):
            entries = {row.get('path'): row.get('sha256') for row in entries if isinstance(row, dict)}
        if isinstance(entries, dict):
            if key != 'sources' and any(not isinstance(p, str) or not isinstance(h, str)
                                        or not re.fullmatch('[0-9a-f]{64}', h)
                                        for p, h in entries.items()):
                raise EvidenceValidationError('Malformed source provenance: ' + name)
            sources.update({p: h for p, h in entries.items()
                            if isinstance(p, str) and isinstance(h, str) and re.fullmatch('[0-9a-f]{64}', h)})
    if bound_sources:
        for source, expected in bound_sources.items():
            if source in sources and sources[source] != expected:
                raise EvidenceValidationError('Conflicting source provenance: ' + source)
        sources.update(bound_sources)
    if not sources:
        raise EvidenceValidationError('Requirement version provenance is absent: ' + name)
    checked = {}
    for source, expected in sources.items():
        if not isinstance(expected, str) or not re.fullmatch('[0-9a-f]{64}', expected):
            raise EvidenceValidationError('Invalid source digest: ' + str(source))
        target = _inside(root, source)
        if not target.is_file() and not source.startswith('apps/'):
            target = _inside(root, 'apps/web/' + source)
        if not target.is_file() or _sha(target) != expected:
            raise EvidenceValidationError('Proof belongs to another source version: ' + source)
        checked[target.relative_to(root).as_posix()] = expected
    return dict(path=name, sha256=digest, requiredSteps=list(required_steps), sources=checked)
