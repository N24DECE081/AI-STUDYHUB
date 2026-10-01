import unittest
from unittest.mock import Mock
from backend.app.quizzes import service
from backend.app.ai_tutor.engine import EngineError


class QuizGenerationTests(unittest.TestCase):
    def engine(self):
        engine = Mock(uses_model=True)
        counter = iter(range(1000))
        def complete(**kwargs):
            payload = kwargs['payload']
            source = payload['sources'][0]
            return {'questions': [{
                'question': f'Câu 6: Khi giao dịch {next(counter)} bị gián đoạn, thuộc tính nào đảm bảo rollback?',
                'options': ['Atomicity', 'Isolation', 'Durability', 'Consistency'],
                'answer_index': 0, 'explanation': 'Atomicity đảm bảo giao dịch hoàn tất hoặc rollback toàn bộ.',
                'difficulty': level, 'document_id': source['document_id'], 'evidence': source['text'],
            } for level in payload['levels']]}
        engine.complete_json.side_effect = complete
        return engine

    def test_count_validation(self):
        for value in [None, True, False, 0, -1, 121, 1.5, '10', [], {}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                service.validate_count(value)
        for value in [1, 10, 120]:
            self.assertEqual(service.validate_count(value), value)

    def test_exact_counts_difficulty_and_numbering(self):
        for count in [1, 10, 120]:
            engine = self.engine()
            questions = service.generate([{'id': 1, 'title': 'Transactions', 'text': 'Atomicity means all operations complete or roll back together.'}], count, engine)
            self.assertEqual(len(questions), count)
            self.assertTrue(all(q['options'][q['correct_index']] == 'Atomicity' for q in questions))
            self.assertFalse(any(q['question'].startswith('Câu 6') for q in questions))
            if count == 10:
                self.assertEqual([sum(q['difficulty'] == level for q in questions) for level in ['understand','apply','analyze']], [3,4,3])
            self.assertEqual(engine.complete_json.call_count, (count + service.BATCH_SIZE - 1) // service.BATCH_SIZE)

    def test_short_quiz_samples_end_of_long_document(self):
        engine = self.engine()
        service.generate([{'id':1,'title':'Long document','text':'A' * 50000 + 'Final chapter with important conclusions.'}],1,engine)
        sources = engine.complete_json.call_args.kwargs['payload']['sources']
        self.assertTrue(any('Final chapter' in source['text'] for source in sources))

    def test_no_trivial_offline_fallback(self):
        with self.assertRaises(EngineError):
            service.generate([{'id': 1, 'title': 'x', 'text': 'Some source'}], 1, Mock(uses_model=False))

    def test_invalid_evidence_options_duplicates_and_partial_output_rejected(self):
        source = {'id': 1, 'title': 'Transactions', 'text': 'Atomicity means all operations complete or roll back together.'}
        for mutation in ['evidence', 'options', 'answer_index', 'difficulty', 'duplicate', 'partial']:
            engine = self.engine()
            build = engine.complete_json.side_effect
            def invalid(**kwargs):
                raw = build(**kwargs)
                if mutation == 'duplicate': raw['questions'][1] = dict(raw['questions'][0])
                elif mutation == 'partial': raw['questions'].pop()
                else: raw['questions'][0][mutation] = {'evidence':'This is invented supporting evidence.', 'options':['A'] * 4, 'answer_index':True, 'difficulty':'easy'}[mutation]
                return raw
            engine.complete_json.side_effect = invalid
            with self.subTest(mutation=mutation), self.assertRaises(service.QuizGenerationError):
                service.generate([source], 2, engine)
            self.assertEqual(engine.complete_json.call_count, 2)

    def test_empty_text_and_provider_failure(self):
        with self.assertRaises(service.QuizGenerationError):
            service.generate([{'id':1,'title':'x','text':''}], 1, self.engine())
        engine = self.engine(); engine.complete_json.side_effect = EngineError('offline')
        with self.assertRaises(EngineError):
            service.generate([{'id':1,'title':'x','text':'Actual source text'}], 1, engine)


class QuizHTTPTests(unittest.TestCase):
    """Real provider HTTP adapter, persistence and grading with an offline fixture."""
    @classmethod
    def setUpClass(cls):
        import json
        import threading
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from unittest.mock import patch
        from test_server_integration import ServerIntegrationTest
        class Provider(BaseHTTPRequestHandler):
            sequence = 0
            def log_message(self, *args): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                payload = json.loads(body['messages'][-1]['content'])
                source = payload['sources'][0]
                rows = []
                for level in payload['levels']:
                    Provider.sequence += 1
                    rows.append({'question':f'Câu 6: Tình huống giao dịch {Provider.sequence} bị ngắt cần thuộc tính nào để rollback?',
                        'options':['Atomicity','Isolation','Durability','Consistency'], 'answer_index':0,
                        'explanation':'Atomicity đảm bảo mọi thao tác thành công hoặc rollback toàn bộ.',
                        'document_id':source['document_id'],'evidence':source['text'],'difficulty':level})
                data = json.dumps({'choices':[{'message':{'content':json.dumps({'questions':rows})}}]}).encode()
                self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(data)
        cls.provider = ThreadingHTTPServer(('127.0.0.1',0), Provider)
        cls.thread = threading.Thread(target=cls.provider.serve_forever,daemon=True);cls.thread.start()
        try:
            with patch.dict('os.environ',{'STUDYHUB_AI_PROVIDER':'custom','STUDYHUB_AI_BASE_URL':f'http://127.0.0.1:{cls.provider.server_port}/v1','STUDYHUB_AI_MODEL':'fixture','STUDYHUB_AI_TASK_MODEL':'fixture'}):
                ServerIntegrationTest.setUpClass.__func__(cls)
        except Exception:
            cls.provider.shutdown();cls.provider.server_close();raise

    @classmethod
    def tearDownClass(cls):
        from test_server_integration import ServerIntegrationTest
        ServerIntegrationTest.tearDownClass.__func__(cls)
        cls.provider.shutdown();cls.provider.server_close();cls.thread.join()

    def test_generate_120_persist_hide_answers_and_submit(self):
        from test_server_integration import ServerIntegrationTest as Integration
        self.request = Integration.request.__get__(self)
        self.login_cookie = Integration.login_cookie.__get__(self)
        self.create_subject = Integration.create_subject.__get__(self)
        cookie = self.login_cookie('student@studyhub.local','Student123!')
        subject = self.create_subject(cookie,'QHT')['id']
        boundary = 'QuizHTTPBoundary'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nTransactions\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="subject_id"\r\n\r\n{subject}\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="transactions.txt"\r\nContent-Type: text/plain\r\n\r\n'
                'Atomicity means all operations complete or roll back together.\r\n'
                f'--{boundary}--\r\n').encode()
        status,_,document = self.request('/api/upload','POST',body,{'Cookie':cookie,'Content-Type':f'multipart/form-data; boundary={boundary}'})
        self.assertEqual(status,201,document)
        status,_,quiz = self.request('/api/quizzes/generate','POST',{'document_ids':[document['document_id']],'question_count':120},{'Cookie':cookie})
        self.assertEqual(status,201,quiz)
        self.assertEqual(len(quiz['questions']),120)
        self.assertEqual(quiz['questions'][0]['id'],'q1'); self.assertEqual(quiz['questions'][-1]['id'],'q120')
        for question in quiz['questions']:
            self.assertNotIn('correct_index',question);self.assertNotIn('source_locator',question)
            self.assertNotIn('explanation',question);self.assertFalse(question['question'].startswith('Câu 6'))
        status,_,saved=self.request(f"/api/quizzes/{quiz['id']}",headers={'Cookie':cookie})
        self.assertEqual(status,200,saved);self.assertEqual(len(saved['questions']),120)
        import sqlite3, json
        from pathlib import Path
        with sqlite3.connect(Path(self.tmp.name) / 'integration.db') as conn:
            payload = json.loads(conn.execute("SELECT content FROM chat_messages WHERE session_id=? AND role='assistant'",(quiz['id'],)).fetchone()[0])
        correct = payload['questions'][0]['correct_index']
        self.assertEqual(payload['questions'][0]['options'][correct], 'Atomicity')
        status,_,result=self.request(f"/api/quizzes/{quiz['id']}/submit",'POST',{'answers':{'q1':correct}},{'Cookie':cookie})
        self.assertEqual(status,200,result);self.assertEqual(result['score'],1);self.assertEqual(result['total'],120)
        self.assertTrue(result['items'][0]['source_locator'])
