import copy
import ast
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from uat_evidence import EvidenceValidationError, validate_scoped_ui_proof


class RequirementEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'writer.ts').write_text('export const version = 1;\n')
        self.source_hash = hashlib.sha256((self.root / 'writer.ts').read_bytes()).hexdigest()
        self.proof = dict(complete=True, remoteWrites=False, page_errors=[],
                          steps=[dict(name='same intent preserves committed operation', result='PASS')],
                          sourceHashes={'writer.ts': self.source_hash})

    def write(self, value):
        target = self.root / 'proof.json'
        target.write_text(json.dumps(value))
        return hashlib.sha256(target.read_bytes()).hexdigest()

    def check(self, value=None, **options):
        digest = self.write(self.proof if value is None else value)
        return validate_scoped_ui_proof(self.root, 'proof.json',
                                       ['same intent preserves committed operation'],
                                       expected_hash=options.pop('expected_hash', digest), **options)

    def test_valid_named_current_proof(self):
        self.assertEqual(self.check()['sources'], {'writer.ts': self.source_hash})

    def test_missing_individual_proof_cannot_be_accepted(self):
        with self.assertRaisesRegex(EvidenceValidationError, 'Missing requirement'):
            validate_scoped_ui_proof(self.root, 'absent.json', ['required'])

    def test_each_failure_or_runtime_error_is_rejected(self):
        for field, bad in [('complete', False), ('success', False), ('result', 'FAIL_SQL'),
                           ('page_errors', ['unhandled exception']), ('pageErrors', ['error']),
                           ('scriptErrors', ['error']), ('unexpected_errors', ['error']),
                           ('errors', ['error']), ('unexpectedWriters', ['POST /writer'])]:
            with self.subTest(field=field):
                value = copy.deepcopy(self.proof); value[field] = bad
                with self.assertRaises(EvidenceValidationError): self.check(value)

    def test_unrelated_passing_step_cannot_replace_required_step(self):
        value = copy.deepcopy(self.proof)
        value['steps'] = [dict(name='unrelated request passed', result='PASS')]
        with self.assertRaisesRegex(EvidenceValidationError, 'required UI assertion'): self.check(value)

    def test_changed_proof_digest_is_rejected(self):
        with self.assertRaisesRegex(EvidenceValidationError, 'hash mismatch'):
            self.check(expected_hash='0' * 64)

    def test_changed_source_is_not_revalidated_by_a_global_gate(self):
        (self.root / 'writer.ts').write_text('export const version = 2;\n')
        with self.assertRaisesRegex(EvidenceValidationError, 'another source version'): self.check()

    def test_missing_version_provenance_is_rejected(self):
        value = copy.deepcopy(self.proof); value.pop('sourceHashes')
        with self.assertRaisesRegex(EvidenceValidationError, 'provenance is absent'): self.check(value)

    def test_scoped_replay_binding_can_version_legacy_step_proof(self):
        value = copy.deepcopy(self.proof); value.pop('sourceHashes')
        self.assertEqual(self.check(value, bound_sources={'writer.ts': self.source_hash})['sources'],
                         {'writer.ts': self.source_hash})

    def test_source_binding_does_not_invent_successful_completion(self):
        value=copy.deepcopy(self.proof);value.pop('complete')
        with self.assertRaisesRegex(EvidenceValidationError,'completion is absent'):
            self.check(value,bound_sources={'writer.ts':self.source_hash})

    def test_failure_elsewhere_in_the_same_proof_cannot_be_ignored(self):
        for failure in [dict(name='another required operation',result='FAIL'),
                        dict(name='failure',error='Writer failed after the passing assertion'),
                        dict(step='another assertion',result='PASS',errors=['unhandled exception'])]:
            value=copy.deepcopy(self.proof);value['steps'].append(failure)
            with self.subTest(failure=failure),self.assertRaisesRegex(EvidenceValidationError,'failed assertion'):
                self.check(value)

    def test_replay_binding_cannot_override_stale_embedded_version(self):
        with self.assertRaisesRegex(EvidenceValidationError, 'Conflicting source'):
            self.check(bound_sources={'writer.ts': '0' * 64})

    def test_paths_cannot_escape_candidate(self):
        with self.assertRaisesRegex(EvidenceValidationError, 'escapes candidate'):
            validate_scoped_ui_proof(self.root, '../outside.json', ['required'])

    def test_remote_transport_is_rejected(self):
        value = copy.deepcopy(self.proof); value['remoteWrites'] = True
        with self.assertRaisesRegex(EvidenceValidationError, 'local-only'): self.check(value)

    def test_malformed_embedded_provenance_is_not_replaced_by_binding(self):
        value = copy.deepcopy(self.proof); value['sourceHashes']['writer.ts'] = 'not-a-digest'
        with self.assertRaisesRegex(EvidenceValidationError, 'Malformed source'):
            self.check(value, bound_sources={'writer.ts': self.source_hash})

    def consumer(self):
        path = Path(__file__).with_name('validate-peru-uat.py')
        tree = ast.parse(path.read_text(encoding='utf-8'))
        definitions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                       and node.name in ('cases', 'good_evidence')]
        catalog = {'unrelated-to-writer-plan': dict(id='unrelated-to-writer-plan', ui_complete=True, environment='CURRENT',
                    evidence=['proof.json'], verified_steps=[dict(evidence='proof.json',
                    step='same intent preserves committed operation')])}
        context = dict(root=self.root, catalog=catalog, Path=Path,
                       read=lambda p: json.loads(p.read_bytes()),
                       validate_scoped_ui_proof=validate_scoped_ui_proof)
        exec(compile(ast.Module(body=definitions, type_ignores=[]), str(path), 'exec'), context)
        return tree, context

    def test_actual_acceptance_consumer_checks_individual_evidence(self):
        _, context = self.consumer()
        self.write(self.proof)
        self.assertEqual(context['cases'](['unrelated-to-writer-plan']), ['unrelated-to-writer-plan'])
        for field, bad in [('success', False), ('page_errors', ['runtime failure'])]:
            value = copy.deepcopy(self.proof); value[field] = bad; self.write(value)
            with self.subTest(field=field), self.assertRaises(EvidenceValidationError):
                context['cases'](['unrelated-to-writer-plan'])
        (self.root / 'proof.json').unlink()
        with self.assertRaises(AssertionError): context['cases'](['unrelated-to-writer-plan'])

    def test_requirements_absent_from_writer_plan_are_also_checked(self):
        tree, context = self.consumer()
        value = copy.deepcopy(self.proof); value['success'] = False; self.write(value)
        loops = [node for node in tree.body if isinstance(node, ast.For)
                 and isinstance(node.target, ast.Name) and node.target.id == 'c'
                 and any(isinstance(child, ast.Call) and isinstance(child.func, ast.Name)
                         and child.func.id == 'cases' for child in ast.walk(node))]
        self.assertEqual(len(loops), 1)
        with self.assertRaises(EvidenceValidationError):
            exec(compile(ast.Module(body=loops, type_ignores=[]), '<acceptance loop>', 'exec'), context)


if __name__ == '__main__': unittest.main()
