import json
import tempfile
import unittest
from pathlib import Path
from ci_queue_api.history import canonical_green
from ci_queue_api.records import read_history, public_job, lookup_job, status_snapshot_unassigned
from ci_queue_api.completion import execution_completion, recipe_finalization_digest
from ci_queue_api.history import build_preset_history, _canonical_git_green

CASES = json.loads((Path(__file__).parents[1] / 'fixtures/finalization-completion.json').read_text())

class FinalizationTests(unittest.TestCase):
    def test_valid_publication_with_uncertain_cleanup_is_canonical_green(self):
        case = next(case for case in CASES if case['name'] == 'passed-valid-publication-cleanup-uncertain')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'history').mkdir()
            (root / 'state/finalization').mkdir(parents=True)
            (root / 'history/job-1.json').write_text(case['terminalBytes'])
            (root / 'state/finalization/job-1.json').write_text(json.dumps(case['record']))
            job = read_history(root)[0]
            self.assertTrue(canonical_green(job, {'argv': ['check'], 'finalization': job['finalization']}))
            completion = public_job(job)['completion']
            self.assertEqual(completion['state'], 'complete')
            self.assertTrue(completion['eligible'])
            self.assertEqual(completion['testStatus'], 'passed')
            self.assertEqual(completion['finalization'], {'phase': 'passed', 'cleanup': 'uncertain', 'recovery': 'none'})

    def test_shared_cases_through_real_history(self):
        for case in CASES:
            if case['terminalDigest'] != __import__('hashlib').sha256(case['terminalBytes'].encode()).hexdigest():
                continue
            with self.subTest(case=case['name']), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'history').mkdir()
                (root / 'state/finalization').mkdir(parents=True)
                (root / 'history/job-1.json').write_text(case['terminalBytes'])
                if case['record']:
                    (root / 'state/finalization/job-1.json').write_text(json.dumps(case['record']))
                public = public_job(read_history(root)[0])
                self.assertEqual({key: public.get('completion', {}).get(key) for key in case['expected']}, case['expected'])
                if case['name'] in ('v2-confirmed', 'v2-retryable', 'v2-blocked'):
                    self.assertEqual(public['completion']['finalization']['recovery'], case['record']['recovery'])
                    self.assertNotIn('lastQueuedRecoveryTicketId', public['completion']['finalization'])

    def test_required_hook_cannot_be_green_without_record(self):
        ticket = json.loads(CASES[0]['terminalBytes'])
        self.assertFalse(canonical_green(ticket, {'argv': ['check']}))

    def test_public_history_joins_record_and_keeps_test_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'history').mkdir()
            (root / 'state/finalization').mkdir(parents=True)
            case = CASES[0]
            (root / 'history/job-1.json').write_text(case['terminalBytes'])
            (root / 'state/finalization/job-1.json').write_text(json.dumps(case['record']))
            job = read_history(root)[0]
            self.assertTrue(canonical_green(job, {'argv': ['check'], 'finalization': job['finalization']}))
            public = public_job(job)
            self.assertEqual(public['status'], 'passed')
            self.assertEqual(public['completion']['state'], 'complete')
            self.assertEqual(public_job(lookup_job(root,'job-1'))['completion'], public['completion'])

    def test_shared_pure_contract_and_private_projection(self):
        for case in CASES:
            with self.subTest(case=case['name']):
                actual = execution_completion(json.loads(case['terminalBytes']), case['record'], case['terminalDigest'])
                self.assertEqual({key: actual[key] for key in case['expected']}, case['expected'])
        raw = json.loads(CASES[0]['terminalBytes'])
        raw['completion'] = {'state':'complete','eligible':True,'finalization':{'argv':['secret']}}
        self.assertFalse(public_job(raw)['completion']['eligible'])
        self.assertNotIn('completion', public_job({**raw,'recordKind':'observed-execution'}))

    def test_corrupt_record_fails_closed_and_completion_refreshes_without_ticket_change(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'history').mkdir()
            (root / 'state/finalization').mkdir(parents=True)
            case = CASES[0]
            (root / 'history/job-1.json').write_text(case['terminalBytes'])
            record_path = root / 'state/finalization/job-1.json'
            record_path.write_text('{')
            first = status_snapshot_unassigned(root)
            self.assertEqual(first['history'][0]['completion']['state'],'running')
            revision = status_snapshot_unassigned(root,view='live')['historyRevision']
            record_path.write_text(json.dumps(case['record']))
            self.assertEqual(status_snapshot_unassigned(root)['history'][0]['completion']['state'],'complete')
            self.assertNotEqual(status_snapshot_unassigned(root,view='live')['historyRevision'],revision)
            bad = {**case['record'],'phase':'failed','failureReason':'/Users/operator token=secret argv private',
                   'result':{'schemaVersion':1,'cleanup':'uncertain','outputs':[{'path':'/private/secret','sha256':'a'*64,'role':'secret'}]}}
            record_path.write_text(json.dumps(bad))
            projected = public_job(read_history(root)[0])['completion']
            self.assertEqual(projected['state'],'failed')
            text = json.dumps(projected)
            for private in ['/Users','secret','argv','/private']:
                self.assertNotIn(private,text)

    def test_new_recipe_digest_rejects_legacy_and_mirror_only_green(self):
        case = CASES[0]
        ticket = json.loads(case['terminalBytes'])
        recipe = {'argv':['check'], 'finalization':ticket['finalization']}
        self.assertEqual(recipe_finalization_digest(recipe),ticket['finalizationDigest'])
        legacy = {**ticket,'schemaVersion':3,'finalization':None,'finalizationDigest':None}
        self.assertFalse(canonical_green(legacy, recipe))
        config = type('Config',(),{'presets':{'check':recipe},'project_id':'fixture'})()
        payload = {'schema':1,'preset':'check','projectId':'fixture','projectIdSource':'ticket',
                   'ticketId':'job-1','finalizationDigest':ticket['finalizationDigest']}
        slot = {'preset':'check','state':'publicado','annotated':True,'ref':'refs/ci/last-green/check','payload':payload}
        self.assertEqual(_canonical_git_green(slot,config,{'job-1'})[1], 'execution-incomplete')

    def test_meta_last_green_and_duration_wait_for_completed_hook(self):
        from ci_queue_api.config import load_project_config
        from ci_queue_api.dashboard_state import write_dashboard_state, read_dashboard_state
        import hashlib
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'history').mkdir()
            (root / 'state/finalization').mkdir(parents=True)
            ticket = {**json.loads(CASES[0]['terminalBytes']), 'projectId':'fixture',
                      'startedAt':'2026-01-01T00:00:00Z','finishedAt':'2026-01-01T00:00:01Z','durationMs':1000}
            body = json.dumps(ticket)
            (root / 'history/job-1.json').write_text(body)
            config_path = root / 'ci-queue.json'
            config_path.write_text(json.dumps({'schemaVersion':1,'project':{'id':'fixture','name':'Fixture'},
                'presets':{'check':{'argv':['check'],'finalization':ticket['finalization']}}}))
            config = load_project_config(config_path)
            state = write_dashboard_state(root, config, {'revision':0,'action':'save-meta',
                'meta':{'name':'Target','description':'','presets':['check']}})
            self.assertEqual(state['meta']['checks'][0]['status'],'pending')
            history = build_preset_history(root,config)['presets'][0]
            self.assertIsNone(history['lastGreenCanonical'])
            self.assertIsNone(history['durationReference'])
            record = {**CASES[0]['record'],'ticketDigest':hashlib.sha256(body.encode()).hexdigest()}
            (root / 'state/finalization/job-1.json').write_text(json.dumps(record))
            self.assertEqual(read_dashboard_state(root,config)['meta']['checks'][0]['status'],'passed')
            history = build_preset_history(root,config)['presets'][0]
            self.assertEqual(history['lastGreenCanonical']['ticketId'],'job-1')
            self.assertEqual(history['durationReference']['sampleCount'],1)

    def test_loader_cannot_disable_static_hook_with_invalid_explicit_digest(self):
        from ci_queue_api.config import load_project_config, ConfigError
        ticket = json.loads(CASES[0]['terminalBytes'])
        for digest in (None, '', 'not-a-digest', '0' * 64):
            with self.subTest(digest=digest), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'ci-queue.json'
                recipe = {'argv':['check'],'finalization':ticket['finalization'],'finalizationDigest':digest}
                path.write_text(json.dumps({'schemaVersion':1,'project':{'id':'fixture','name':'Fixture'},'presets':{'check':recipe}}))
                self.assertFalse(canonical_green({'status':'passed','exitCode':0,'argv':['check']},recipe))
                with self.assertRaises(ConfigError):
                    load_project_config(path)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'ci-queue.json'
            for recipe in ({'argv':['check'],'finalizationDigest':ticket['finalizationDigest']},
                           {'argv':['check'],'finalization':ticket['finalization'],'finalizationDigest':ticket['finalizationDigest']}):
                path.write_text(json.dumps({'schemaVersion':1,'project':{'id':'fixture','name':'Fixture'},'presets':{'check':recipe}}))
                loaded = load_project_config(path).presets['check']
                self.assertEqual(recipe_finalization_digest(loaded),ticket['finalizationDigest'])
                self.assertFalse(canonical_green({'status':'passed','exitCode':0,'argv':['check']},loaded))
                root = Path(directory)
                (root / 'history').mkdir(exist_ok=True)
                (root / 'state/finalization').mkdir(parents=True,exist_ok=True)
                (root / 'history/job-1.json').write_text(CASES[0]['terminalBytes'])
                (root / 'state/finalization/job-1.json').write_text(json.dumps(CASES[0]['record']))
                self.assertTrue(canonical_green(read_history(root)[0],loaded))

    def test_loader_rejects_invalid_static_finalization(self):
        from ci_queue_api.config import load_project_config, ConfigError
        for spec in (None, {}, {**json.loads(CASES[0]['terminalBytes'])['finalization'],'contractDigest':'0'*64}):
            with self.subTest(spec=spec), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'ci-queue.json'
                path.write_text(json.dumps({'schemaVersion':1,'project':{'id':'fixture','name':'Fixture'},
                    'presets':{'check':{'argv':['check'],'finalization':spec}}}))
                with self.assertRaises(ConfigError):
                    load_project_config(path)

    def test_invalid_phase_never_crashes_or_exposes_private_text(self):
        for phase in (None, 'private /Users/operator token=secret', [], {'private':'secret'}):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'history').mkdir()
                (root / 'state/finalization').mkdir(parents=True)
                record = {**CASES[0]['record']}
                if phase is None:
                    record.pop('phase')
                else:
                    record['phase'] = phase
                (root / 'history/job-1.json').write_text(CASES[0]['terminalBytes'])
                (root / 'state/finalization/job-1.json').write_text(json.dumps(record))
                for job in (read_history(root)[0],lookup_job(root,'job-1')):
                    public = public_job(job)
                    self.assertEqual(public['status'],'passed')
                    self.assertFalse(public['completion']['eligible'])
                    self.assertNotIn('finalization',public['completion'])
                    self.assertNotIn('secret',json.dumps(public['completion']))
                    self.assertNotIn('/Users',json.dumps(public['completion']))
