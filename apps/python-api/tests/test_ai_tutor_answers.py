"""Answer-quality and provider-wiring coverage for the AI Tutor.

The journey suite proves the contracts hold; this suite proves the tutor actually
answers: relevant material produces an answer built on it, missing material is
reported instead of faked, the maths mode computes, quizzes have one verifiable
answer, and a configured provider (mock OpenAI-compatible endpoint) is really
called with the learner's question and document context.
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Test phải chạy offline: không đọc .env thật của máy. Các ca kiểm provider tự
# đặt biến môi trường cho endpoint giả của chúng (ProviderWiringTests).
os.environ['STUDYHUB_NO_DOTENV'] = '1'
for _name in ('DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY',
              'MISTRAL_API_KEY', 'TOGETHER_API_KEY', 'XAI_API_KEY', 'ANTHROPIC_API_KEY',
              'STUDYHUB_AI_PROVIDER', 'STUDYHUB_AI_API_KEY', 'STUDYHUB_AI_BASE_URL', 'STUDYHUB_AI_MODEL'):
    os.environ.pop(_name, None)

from backend.app.ai_tutor import config, engine, grading, roadmap, repository as tutor_store  # noqa: E402
import server  # noqa: E402  (chat_quiz: chế độ Tạo quiz dựng câu hỏi có cấu trúc)

DOCUMENT = (
    'Nhập môn Java: Kế thừa là cơ chế cho phép lớp con dùng lại thuộc tính và phương thức của lớp cha. '
    'Lớp con khai báo bằng từ khoá extends và có thể ghi đè phương thức của lớp cha. '
    'Đa hình là khả năng một lời gọi phương thức chạy hành vi khác nhau tuỳ theo lớp thực tế của đối tượng. '
    'Ví dụ: Animal a = new Dog(); a.speak() in ra tiếng chó. '
    'Lưu ý: không thể kế thừa nhiều lớp trong Java, chỉ kế thừa một lớp và triển khai nhiều interface.'
)
MOCK_REPLY = 'TRẢ LỜI TỪ MÔ HÌNH: kế thừa cho phép lớp con dùng lại thuộc tính và phương thức của lớp cha.'
STACK_DOCUMENT = (
    'stack-queue: Cấu trúc dữ liệu Stack và Queue\n'
    'Stack là cấu trúc dữ liệu hoạt động theo nguyên tắc vào sau ra trước (LIFO).\n'
    'Các thao tác chính của Stack gồm push để thêm phần tử và pop để lấy phần tử ra.\n'
    'Ví dụ: chồng đĩa trong bếp, đĩa đặt sau cùng sẽ được lấy ra đầu tiên.\n'
    'Queue là cấu trúc dữ liệu hoạt động theo nguyên tắc vào trước ra trước (FIFO).\n'
    'Lưu ý: Stack dùng cho bài toán quay lui, Queue dùng cho bài toán duyệt theo mức.'
)


class MockProvider:
    """Minimal OpenAI-compatible endpoint that records what it received."""

    def __init__(self, reply: str = MOCK_REPLY, status: int = 200):
        self.reply = reply
        self.status = status
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802 - http.server API
                length = int(self.headers.get('Content-Length', 0))
                raw = self.rfile.read(length)
                try:
                    body = json.loads(raw or b'{}')
                except json.JSONDecodeError:
                    body = {'raw': raw.decode(errors='replace')}
                outer.requests.append({'path': self.path, 'body': body,
                                       'authorization': self.headers.get('Authorization')})
                if outer.status != 200:
                    # Giả lập hết quota (429) để kiểm cơ chế dự phòng offline.
                    detail = json.dumps({'error': {'message': 'quota exceeded', 'type': 'insufficient_quota'}}).encode()
                    self.send_response(outer.status)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(detail)))
                    self.end_headers()
                    self.wfile.write(detail)
                    return
                payload = json.dumps({'choices': [{'message': {'content': outer.reply}}]}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, format, *args):  # noqa: A002 - http.server signature
                return

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self):
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


class OfflineAnswerTests(unittest.TestCase):
    """The offline engine must answer real questions, not echo a template."""

    def setUp(self):
        self.engine = engine.LocalEngine()

    def ask(self, question, mode='explain', context=DOCUMENT, history=None):
        return self.engine.answer(mode=mode, question=question, context=context, history=history)

    def test_explain_answers_with_the_material_it_has(self):
        answer = self.ask('Kế thừa là gì?')
        self.assertIn('Kế thừa là cơ chế cho phép lớp con dùng lại', answer)
        self.assertIn('Trả lời ngắn', answer)
        self.assertIn('Nhập môn Java', answer)
        self.assertNotIn('Cách hiểu nhanh', answer)

    def test_explain_states_missing_material_instead_of_faking_it(self):
        answer = self.ask('Đạo hàm là gì?')
        self.assertIn('chưa tìm thấy nội dung', answer)
        self.assertNotIn('Trả lời ngắn', answer)
        self.assertNotIn('Kế thừa là cơ chế', answer)

    def test_empty_context_never_produces_a_fake_answer(self):
        answer = self.ask('Kế thừa là gì?', context='')
        self.assertIn('chưa tìm thấy nội dung', answer)

    def test_comparison_covers_both_sides(self):
        answer = self.ask('So sánh kế thừa và đa hình')
        self.assertIn('**Kế thừa**', answer)
        self.assertIn('**Đa hình**', answer)
        self.assertIn('Đa hình là khả năng một lời gọi phương thức', answer)

    def test_comparison_reports_the_side_it_cannot_cover(self):
        answer = self.ask('So sánh kế thừa và đạo hàm')
        self.assertIn('không có nội dung về “đạo hàm”', answer)

    def test_solve_computes_arithmetic_deterministically(self):
        answer = self.ask('5 + 6 * 4 bằng bao nhiêu?', mode='solve', context='')
        self.assertIn('29', answer)
        wrong = self.ask('5 + 6 * 4 bằng bao nhiêu?', mode='solve', context='')
        self.assertNotIn('= **30**', wrong)

    def test_solve_says_when_it_has_no_data(self):
        answer = self.ask('Giải bài tập về đạo hàm riêng', mode='solve', context='')
        self.assertIn('chưa có dữ kiện để giải', answer)

    def test_quiz_has_exactly_one_correct_option_from_the_material(self):
        answer = self.ask('Tạo quiz về Java', mode='generate_quiz')
        self.assertIn('**Đáp án:**', answer)
        items = engine.build_quiz(DOCUMENT)
        self.assertTrue(items, 'the document has enough statements to quiz on')
        document_sentences = engine.sentences(DOCUMENT)
        for item in items:
            self.assertEqual(len(item['options']), 4)
            self.assertEqual(len(set(item['options'])), 4)
            correct = item['options'][item['answer_index']]
            self.assertTrue(any(correct[:60] in sentence for sentence in document_sentences),
                            'the correct option must be a statement of the material')
            answered = item['options'][item['answer_index']].lower()
            self.assertTrue(all(word in answered for word in item['anchor'].split()),
                            f"anchor {item['anchor']!r} must come from the answering statement")

    def test_summary_and_hint_stay_grounded_in_the_material(self):
        summary = self.ask('Tóm tắt tài liệu', mode='summarize')
        self.assertIn('Kế thừa là cơ chế', summary)
        self.assertIn('Từ khoá chính', summary)
        hint = self.ask('Gợi ý cách dùng đa hình', mode='hint')
        self.assertIn('đa hình', hint.lower())
        self.assertIn('Chưa đưa đáp án', hint)

    def test_follow_up_inherits_the_previous_topic(self):
        history = [{'role': 'user', 'content': 'Kế thừa là gì?'},
                   {'role': 'assistant', 'content': '...'}]
        answer = self.ask('cho ví dụ', history=history)
        self.assertIn('Kế thừa', answer)

    def test_example_follow_up_answers_the_example_not_the_definition_again(self):
        history = [{'role': 'user', 'content': 'Kế thừa là gì?'},
                   {'role': 'assistant', 'content': '...'}]
        answer = self.ask('Còn ví dụ thì sao?', history=history)
        self.assertNotIn('Trả lời ngắn', answer)
        self.assertIn('Animal a = new Dog()', answer)
        self.assertLess(answer.index('Ví dụ trong tài liệu'), answer.index('Chi tiết trong tài liệu'))

    def test_procedure_is_not_invented_when_the_material_has_no_steps(self):
        answer = self.ask('Làm sao để kế thừa một lớp?')
        self.assertIn('Các ý liên quan trong tài liệu', answer)
        self.assertNotIn('Trình tự trong tài liệu', answer)

    def test_procedure_is_labelled_as_steps_when_the_material_lists_them(self):
        ordered = ('Quy trình nấu cơm: Bước 1 vo gạo thật sạch. Bước 2 đong nước vừa đủ. '
                   'Bước 3 bật nồi và chờ cơm chín.')
        answer = self.ask('Cách nấu cơm?', context=f'Nấu ăn: {ordered}')
        self.assertIn('Trình tự trong tài liệu', answer)

    def test_narrow_topic_still_shows_related_material(self):
        answer = self.ask('Đa hình là gì?')
        self.assertIn('Liên quan trong tài liệu', answer)
        self.assertIn('Kế thừa là cơ chế', answer)

    def test_short_answer_prefers_the_definition_over_a_note(self):
        answer = self.ask('Stack là gì?', context=STACK_DOCUMENT)
        short = answer.split('**Trả lời ngắn:**')[1].split('\n')[0]
        self.assertIn('Stack là cấu trúc dữ liệu', short)
        self.assertNotIn('Lưu ý', short)
        queue = self.ask('Queue là gì?', context=STACK_DOCUMENT)
        self.assertIn('Queue là cấu trúc dữ liệu', queue.split('**Trả lời ngắn:**')[1].split('\n')[0])

    def test_quotes_carry_the_document_title(self):
        answer = self.ask('Stack là gì?', context=STACK_DOCUMENT)
        self.assertIn('*stack-queue*', answer)

    def test_arithmetic_question_does_not_use_a_number_as_the_topic(self):
        answer = self.ask('12 * 8 + 5 bằng bao nhiêu?', mode='solve', context=STACK_DOCUMENT)
        self.assertIn('101', answer)
        self.assertNotIn('Hướng giải: 12', answer)
        self.assertIn('Bài toán của bạn', answer)

    def test_hint_points_at_the_document_instead_of_dumping_keywords(self):
        hint = self.ask('Gợi ý cách cài đặt Stack bằng mảng', mode='hint', context=STACK_DOCUMENT)
        self.assertIn('stack-queue', hint)
        self.assertIn('Chưa đưa đáp án', hint)
        self.assertNotIn('nhắc tới:', hint)
        self.assertIn('Stack', hint)

    def test_comparison_follow_up_uses_the_previous_topic(self):
        history = [{'role': 'user', 'content': 'Queue là gì?'},
                   {'role': 'assistant', 'content': '...'}]
        answer = self.ask('Vậy nó khác gì Stack?', context=STACK_DOCUMENT, history=history)
        self.assertIn('## So sánh: queue và stack', answer)

    def test_comparison_with_two_named_topics_needs_no_separator(self):
        answer = self.ask('Stack khác gì Queue?', context=STACK_DOCUMENT)
        self.assertIn('## So sánh: stack và queue', answer)
        natural = self.ask('Stack và Queue khác nhau thế nào?', context=STACK_DOCUMENT)
        self.assertIn('## So sánh: Stack và Queue', natural)

    def test_comparison_without_two_sides_never_recurses(self):
        answer = self.ask('Khác gì?', context=STACK_DOCUMENT)
        self.assertTrue(answer.strip())
        self.assertNotIn('So sánh:', answer.splitlines()[0])

    def test_gibberish_input_asks_for_a_real_question(self):
        answer = self.ask('x' * 40, context=STACK_DOCUMENT)
        self.assertIn('Mình chưa rõ câu hỏi', answer)

    def test_library_summary_ignores_the_previous_topic(self):
        history = [{'role': 'user', 'content': 'Gợi ý cách cài đặt Stack bằng mảng'},
                   {'role': 'assistant', 'content': '...'}]
        summary = self.ask('Tóm tắt tài liệu', mode='summarize', context=STACK_DOCUMENT, history=history)
        self.assertEqual(summary.splitlines()[0], '## Tóm tắt')


class ProviderFallbackTests(unittest.TestCase):
    """Key hết quota / sai key thì Nova vẫn phải trả lời được từ tài liệu."""

    def setUp(self):
        engine.PROVIDER_HEALTH.update({'ok': True, 'reason': '', 'code': None})
        self.addCleanup(engine.PROVIDER_HEALTH.update, {'ok': True, 'reason': '', 'code': None})

    def test_reason_mapping(self):
        cases = {
            'AI provider error 401: unauthorized': 'API key',
            'AI provider error 402: insufficient balance': 'hết số dư',
            'AI provider error 429: rate limit exceeded': 'hạn mức',
            'AI provider error 503: bad gateway': 'nhà cung cấp đang lỗi',
            'AI provider unavailable: <urlopen error timed out>': 'quá lâu',
        }
        for message, expected in cases.items():
            self.assertIn(expected, engine.provider_failure_reason(engine.EngineError(message)))

    def test_out_of_quota_answers_from_the_documents_and_warns(self):
        health = type('BrokenProvider', (), {
            'answer': lambda self, **kwargs: (_ for _ in ()).throw(
                engine.EngineError('AI provider error 429: quota exceeded')),
            'complete_json': lambda self, **kwargs: (_ for _ in ()).throw(
                engine.EngineError('AI provider error 429: quota exceeded')),
        })()
        resilient = engine.ResilientEngine(health)
        answer = resilient.answer(mode='explain', question='Kế thừa là gì?', context=DOCUMENT)
        self.assertIn('Mô hình AI đang tạm không dùng được', answer)
        self.assertIn('hạn mức', answer)
        self.assertIn('Kế thừa là cơ chế cho phép lớp con dùng lại', answer)
        self.assertFalse(engine.PROVIDER_HEALTH['ok'])
        self.assertIn('hạn mức', engine.PROVIDER_HEALTH['reason'])

    def test_grading_still_works_when_the_provider_is_down(self):
        broken = type('Broken', (), {
            'complete_json': lambda self, **kwargs: (_ for _ in ()).throw(
                engine.EngineError('AI provider error 500: server error')),
        })()
        resilient = engine.ResilientEngine(broken)
        result = resilient.complete_json(task='grading', payload={
            'student_answer': 'Kế thừa cho phép lớp con dùng lại thuộc tính và phương thức của lớp cha.',
            'expected_answer': 'Kế thừa cho phép lớp con dùng lại thuộc tính và phương thức của lớp cha.',
            'exercise_type': 'short_answer'})
        self.assertTrue(isinstance(result, dict) and result)

    def test_healthy_provider_clears_the_warning(self):
        engine.PROVIDER_HEALTH.update({'ok': False, 'reason': 'hết hạn mức', 'code': None})
        healthy = type('Healthy', (), {
            'answer': lambda self, **kwargs: 'TRẢ LỜI TỪ MÔ HÌNH',
        })()
        resilient = engine.ResilientEngine(healthy)
        self.assertEqual(resilient.answer(mode='explain', question='x', context=''), 'TRẢ LỜI TỪ MÔ HÌNH')
        self.assertTrue(engine.PROVIDER_HEALTH['ok'])


class ProviderWiringTests(unittest.TestCase):
    """A configured provider must be used for chat: key stays server-side."""

    @classmethod
    def setUpClass(cls):
        cls.mock = MockProvider()
        cls.mock.start()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.port = 8771
        env = os.environ.copy()
        env.pop('MYSQL_DATABASE', None)
        env.update({
            'STUDYHUB_PORT': str(cls.port),
            'STUDYHUB_DB_MODE': 'sqlite',
            'STUDYHUB_DB_PATH': str(Path(cls.tmp.name) / 'provider.db'),
            'STUDYHUB_AI_PROVIDER': 'openai',
            'STUDYHUB_AI_API_KEY': 'test-key-not-real',
            'STUDYHUB_AI_BASE_URL': f'http://127.0.0.1:{cls.mock.port}/v1',
            'STUDYHUB_AI_MODEL': 'mock-model',
            'PYTHONUNBUFFERED': '1',
        })
        cls.proc = subprocess.Popen([sys.executable, 'server.py'], cwd=str(ROOT),
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{cls.port}/api/subjects', timeout=0.4).close()
                break
            except Exception:
                time.sleep(0.2)
        else:
            cls.proc.terminate()
            raise RuntimeError('server did not start')
        cls.cookie = cls.register()

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try:
            cls.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.proc.kill()
        cls.tmp.cleanup()
        cls.mock.stop()

    @staticmethod
    def _call(path, method='GET', payload=None, cookie=None):
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {'Content-Type': 'application/json'} if payload is not None else {}
        if cookie:
            headers['Cookie'] = cookie
        request = urllib.request.Request(f'http://127.0.0.1:8771{path}', data=data,
                                         headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.status, response.headers, json.loads(response.read() or b'{}')
        except urllib.error.HTTPError as error:
            return error.code, error.headers, json.loads(error.read() or b'{}')

    @classmethod
    def register(cls):
        payload = {'name': 'Provider Tester', 'email': f'provider_{time.time_ns()}@example.com',
                   'password': 'StrongPass123!'}
        status, headers, _ = cls._call('/api/register', 'POST', payload)
        assert status == 201, status
        return headers.get('Set-Cookie').split(';', 1)[0]

    def test_engine_status_reports_the_provider_without_leaking_the_key(self):
        status, _, body = self._call('/api/ai-tutor/engine', cookie=self.cookie)
        self.assertEqual(status, 200, body)
        self.assertEqual(body['engine'], 'provider')
        self.assertEqual(body['model'], 'mock-model')
        self.assertNotIn('test-key-not-real', json.dumps(body))

    def test_chat_calls_the_provider_with_question_and_document_context(self):
        self.mock.requests.clear()
        question = 'Kế thừa trong Java là gì?'
        status, _, body = self._call('/api/ai-tutor/chat', 'POST',
                                     {'message': question, 'mode': 'explain'}, cookie=self.cookie)
        self.assertEqual(status, 200, body)
        self.assertEqual(body['content'], MOCK_REPLY)
        self.assertTrue(self.mock.requests, 'the provider endpoint was never called')
        sent = self.mock.requests[-1]
        self.assertEqual(sent['authorization'], 'Bearer test-key-not-real')
        self.assertEqual(sent['body']['model'], 'mock-model')
        messages = sent['body']['messages']
        self.assertEqual(messages[0]['role'], 'system')
        self.assertIn('Nova', messages[0]['content'])
        user_message = messages[-1]['content']
        self.assertIn(question, user_message)
        self.assertIn('Ngữ cảnh tài liệu', user_message)

    def test_provider_failure_falls_back_to_the_documents_instead_of_erroring(self):
        self.mock.reply = ''
        try:
            status, _, body = self._call('/api/ai-tutor/chat', 'POST',
                                         {'message': 'Kế thừa là gì?', 'mode': 'explain'},
                                         cookie=self.cookie)
            # Không còn 502: mô hình lỗi thì Nova trả lời từ tài liệu kèm cảnh báo.
            self.assertEqual(status, 200, body)
            self.assertIn('Mô hình AI đang tạm không dùng được', body['content'])
            self.assertTrue(body['content'].strip())
        finally:
            self.mock.reply = MOCK_REPLY

    def test_out_of_quota_keeps_nova_working_and_flags_the_badge(self):
        """Key hết quota: chat vẫn trả lời (từ tài liệu) và badge báo đang tạm lỗi."""
        previous = self.mock.status
        self.mock.status = 429
        try:
            status, _, body = self._call('/api/ai-tutor/chat', 'POST',
                                         {'message': 'Kế thừa là gì?', 'mode': 'explain'},
                                         cookie=self.cookie)
            self.assertEqual(status, 200, body)
            self.assertIn('hạn mức', body['content'])
            self.assertIn('tài liệu của bạn', body['content'])
            self.assertTrue(body.get('engine_degraded'))
            status, _, engine_body = self._call('/api/ai-tutor/engine', cookie=self.cookie)
            self.assertEqual(status, 200, engine_body)
            self.assertTrue(engine_body.get('degraded'))
            self.assertIn('hạn mức', engine_body['label'])
        finally:
            self.mock.status = previous
            self._call('/api/ai-tutor/chat', 'POST', {'message': 'Kế thừa là gì?', 'mode': 'explain'},
                       cookie=self.cookie)
            self._call('/api/ai-tutor/engine', cookie=self.cookie)


class EnvConfigTests(unittest.TestCase):
    def test_env_file_is_loaded_and_real_environment_wins(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / '.env'
            path.write_text('# comment\nSTUDYHUB_AI_PROVIDER=openai\n'
                            'STUDYHUB_AI_API_KEY="from-file"\nexport STUDYHUB_AI_MODEL=file-model\n')
            environ = {'STUDYHUB_AI_MODEL': 'already-set'}
            loaded = config.load_env([path], environ=environ)
            self.assertEqual(environ['STUDYHUB_AI_API_KEY'], 'from-file')
            self.assertEqual(environ['STUDYHUB_AI_PROVIDER'], 'openai')
            self.assertEqual(environ['STUDYHUB_AI_MODEL'], 'already-set')
            self.assertNotIn('STUDYHUB_AI_MODEL', loaded)

    def test_standard_provider_keys_are_detected(self):
        settings = config.provider_settings({'DEEPSEEK_API_KEY': 'k'})
        self.assertIsNotNone(settings)
        self.assertEqual(settings['provider'], 'deepseek')
        self.assertEqual(settings['base_url'], 'https://api.deepseek.com/v1')

    def test_suite_runs_with_the_dotenv_lookup_disabled(self):
        """Có .env thật trên máy thì test vẫn phải chạy offline, không gọi model thật."""
        self.assertTrue(config.dotenv_disabled(os.environ))
        self.assertEqual(config.engine_status({'STUDYHUB_NO_DOTENV': '1'})['engine'], 'local')
        self.assertTrue(config.dotenv_disabled({'STUDYHUB_NO_DOTENV': 'yes'}))
        self.assertFalse(config.dotenv_disabled({'STUDYHUB_NO_DOTENV': '0'}))


class RoadmapResilienceTests(unittest.TestCase):
    """Model thật đôi khi trả JSON lộ trình thiếu bài — không được làm hỏng request."""

    class _HalfBrokenProvider:
        name = 'provider-resilient'

        def __init__(self, modules):
            self.modules = modules
            self.fallback = engine.LocalEngine()

        def complete_json(self, *, task, payload):
            if task == 'roadmap':
                return {'title': 'Lộ trình từ model', 'modules': self.modules}
            raise engine.EngineError('provider down')

    def _payload(self):
        return {'subject': 'Giải tích 1', 'goal': 'Thi qua môn', 'current_level': 'beginner',
                'target_level': 'intermediate', 'pace': 'steady', 'study_time': 240,
                'topics': ['Đạo hàm'], 'weaknesses': ['Tích phân']}

    def test_a_roadmap_whose_modules_have_no_lessons_falls_back_to_the_offline_one(self):
        provider = self._HalfBrokenProvider([{'title': 'Chặng 1', 'lessons': []}])
        built = roadmap.build_roadmap(self._payload(), engine=provider)
        self.assertTrue(built['modules'])
        self.assertTrue(all(module['lessons'] for module in built['modules']))
        self.assertIn('Đạo hàm', built['topics'])

    def test_lessons_given_as_plain_strings_are_kept(self):
        """Model trả lessons dạng chuỗi hoặc khoá khác — vẫn phải dựng được lộ trình."""
        provider = self._HalfBrokenProvider([
            {'title': 'Chặng 1', 'lessons': ['Khái niệm Stack và nguyên lý LIFO', 'Khái niệm Queue']},
        ])
        built = roadmap.build_roadmap(self._payload(), engine=provider)
        self.assertEqual([lesson['title'] for lesson in built['modules'][0]['lessons']],
                         ['Khái niệm Stack và nguyên lý LIFO', 'Khái niệm Queue'])

    def test_alternate_keys_from_the_model_are_understood(self):
        provider = self._HalfBrokenProvider([
            {'title': 'Chặng 1', 'items': [{'name': 'Bài A', 'goals': 'Hiểu A. Áp dụng A.',
                                            'duration': 25}]},
        ])
        built = roadmap.build_roadmap(self._payload(), engine=provider)
        lesson = built['modules'][0]['lessons'][0]
        self.assertEqual(lesson['title'], 'Bài A')
        self.assertEqual(lesson['objectives'], ['Hiểu A.', 'Áp dụng A.'])
        self.assertEqual(lesson['estimated_minutes'], 25)

    def test_modules_given_as_bare_strings_fall_back_instead_of_crashing(self):
        """Model trả module chỉ có tiêu đề (không có bài) → dùng lộ trình offline, không lỗi 502."""
        provider = self._HalfBrokenProvider(['Chặng một', 'Chặng hai'])
        built = roadmap.build_roadmap(self._payload(), engine=provider)
        self.assertTrue(built['modules'])
        self.assertTrue(all(module['lessons'] for module in built['modules']))

    def test_an_empty_module_is_dropped_and_the_rest_is_renumbered(self):
        provider = self._HalfBrokenProvider([
            {'title': 'Chặng A', 'lessons': [{'title': 'Bài A1', 'objectives': ['Hiểu A1']}]},
            {'title': 'Chặng B', 'lessons': []},
        ])
        built = roadmap.build_roadmap(self._payload(), engine=provider)
        self.assertEqual(len(built['modules']), 1)
        self.assertEqual(built['modules'][0]['key'], 'm1')
        self.assertEqual(built['modules'][0]['lessons'][0]['key'], 'm1-l1')
        self.assertEqual(built['modules'][0]['lessons'][0]['title'], 'Bài A1')

    def test_keyless_local_provider_needs_no_key(self):
        settings = config.provider_settings({'STUDYHUB_AI_PROVIDER': 'ollama'})
        self.assertIsNotNone(settings)
        self.assertEqual(settings['model'], 'llama3.1')
        self.assertEqual(settings['api_key'], '')

    def test_without_any_key_the_engine_is_offline(self):
        self.assertIsNone(config.provider_settings({}))
        self.assertEqual(config.engine_status({})['engine'], 'local')
        self.assertIsInstance(engine.get_engine(), engine.LocalEngine)


class GradingWithModelTests(unittest.TestCase):
    """Có model thì bài viết do model chấm; trắc nghiệm/tính toán vẫn do backend."""

    WRITTEN = {'exercise_type': 'short_answer', 'prompt': 'Stack là gì?', 'topic': 'Stack',
               'expected_answer': 'Stack là cấu trúc dữ liệu vào sau ra trước (LIFO).',
               'rubric': 'Nêu đúng LIFO và ví dụ.', 'max_score': 10}

    class _ModelEngine:
        name = 'provider-resilient'
        uses_model = True

        def __init__(self):
            self.calls = []

        @property
        def fallback(self):
            return engine.LocalEngine()

        def complete_json(self, *, task: str, payload: dict) -> dict:
            self.calls.append(task)
            if task != 'grading':
                raise engine.EngineError(f'unexpected task {task}')
            self.payload = payload
            return {'ratio': 0.85, 'is_correct': True, 'strengths': ['Nêu đúng nguyên lý LIFO'],
                    'weaknesses': [], 'missing_points': ['Chưa có ví dụ'],
                    'suggested_answer': 'Stack: LIFO, push/pop, ví dụ chồng đĩa.',
                    'recommended_review': ['Ôn thêm ví dụ'],
                    'explanation': 'Chấm theo rubric bởi model giả lập.'}

    def test_written_answers_are_graded_by_the_model(self):
        stub = self._ModelEngine()
        result = grading.grade_exercise(self.WRITTEN, 'Stack là cấu trúc LIFO, thêm sau lấy trước.',
                                        answer_type='text', engine=stub)
        self.assertEqual(stub.calls, ['grading'])
        self.assertEqual(result['score'], 8.5)
        self.assertIn('Chấm theo rubric bởi model giả lập.', result['feedback'])
        self.assertIn('Nêu đúng nguyên lý LIFO', result['strengths'])
        self.assertEqual(result['graded_by'], 'ai')
        self.assertEqual(stub.payload['rubric'], 'Nêu đúng LIFO và ví dụ.')
        self.assertEqual(stub.payload['student_answer'], 'Stack là cấu trúc LIFO, thêm sau lấy trước.')

    def test_objective_questions_never_reach_the_model(self):
        stub = self._ModelEngine()
        choice = {'exercise_type': 'multiple_choice', 'prompt': 'Thao tác lấy phần tử?',
                  'options': ['push', 'pop'], 'expected_answer': 'pop', 'max_score': 10, 'topic': 'Stack'}
        result = grading.grade_exercise(choice, 'pop', answer_type='choice', engine=stub)
        self.assertEqual(stub.calls, [])
        self.assertEqual(result['score'], 10.0)
        self.assertEqual(result['graded_by'], 'backend')
        maths = {'exercise_type': 'math', 'prompt': 'Tính 5 + 6 × 4', 'expected_answer': '29',
                 'max_score': 10, 'topic': 'Số học'}
        self.assertEqual(grading.grade_exercise(maths, '29', answer_type='math', engine=stub)['score'], 10.0)
        self.assertEqual(stub.calls, [])

    def test_the_offline_engine_still_grades_text_by_keywords(self):
        result = grading.grade_exercise(self.WRITTEN, 'Stack là cấu trúc dữ liệu vào sau ra trước (LIFO).',
                                        answer_type='text', engine=engine.LocalEngine())
        self.assertGreater(result['score'], 0)
        self.assertIn(result['grade'], ('Excellent', 'Very Good', 'Good', 'Pass'))


class ModeInstructionTests(unittest.TestCase):
    """Chế độ chat phải khác nhau thật, không chỉ là cái nhãn.

    Trước đây chỉ gửi 'chế độ hiện tại: hint' trong system prompt nên model vẫn đưa
    đáp án, và ba chế độ Giải thích / Giải bài / Gợi ý cho ra câu trả lời gần như
    giống nhau. Các ca dưới đây khoá lại: mỗi chế độ gửi một chỉ dẫn hành vi riêng.
    """

    @classmethod
    def setUpClass(cls):
        cls.mock = MockProvider('Nội dung trả lời thử.')
        cls.mock.start()

    @classmethod
    def tearDownClass(cls):
        cls.mock.stop()

    def system_prompt(self, mode):
        provider = engine.ProviderEngine(base_url=f'http://127.0.0.1:{self.mock.port}/v1',
                                         api_key='test-key-not-real', model='mock-model')
        provider.answer(mode=mode, question='Stack là gì?', context=DOCUMENT)
        return self.mock.requests[-1]['body']['messages'][0]['content']

    def test_every_mode_sends_its_own_behaviour_instruction(self):
        prompts = {mode: self.system_prompt(mode) for mode in engine.MODES}
        self.assertEqual(len(set(prompts.values())), len(engine.MODES),
                         'mỗi chế độ phải có chỉ dẫn riêng, không dùng chung một prompt')
        self.assertIn('GIẢI THÍCH', prompts['explain'])
        self.assertIn('GIẢI BÀI', prompts['solve'])
        self.assertIn('GỢI Ý', prompts['hint'])
        self.assertIn('TÓM TẮT', prompts['summarize'])
        self.assertIn('TẠO QUIZ', prompts['generate_quiz'])

    def test_hint_mode_forbids_handing_over_the_answer(self):
        prompt = self.system_prompt('hint')
        self.assertIn('KHÔNG đưa đáp án', prompt)
        self.assertIn('câu hỏi gợi mở', prompt)
        # gợi ý phải ngắn và không được đưa ví dụ giải sẵn (ví dụ sẵn là để chép)
        self.assertIn('NGẮN', prompt)
        self.assertIn('KHÔNG đưa ví dụ đã giải sẵn', prompt)
        # chỉ dẫn của chế độ Giải bài không được lẫn sang chế độ Gợi ý
        self.assertNotIn('kết luận đáp án rõ ràng', prompt)
        self.assertNotIn('GIẢI BÀI', prompt)

    def test_explain_and_hint_stop_overlapping(self):
        """Hai chế độ từng cho ra câu trả lời na ná nhau: chốt lại ranh giới."""
        explain = self.system_prompt('explain')
        hint = self.system_prompt('hint')
        # giải thích: được ví dụ mẫu nhưng bằng dữ liệu khác, và không hỏi ngược
        self.assertIn('ví dụ minh hoạ đã giải', explain)
        self.assertIn('KHÁC với bài', explain)
        self.assertIn('Không kết thúc bằng câu hỏi', explain)
        # gợi ý: không giảng lại khái niệm, chỉ dữ kiện + bước tiếp theo + câu hỏi
        self.assertIn('Không giảng lại toàn bộ khái niệm', hint)
        self.assertNotIn('ví dụ minh hoạ đã giải', hint)

    def test_quiz_mode_asks_the_model_for_multiple_choice_questions(self):
        prompt = self.system_prompt('generate_quiz')
        self.assertIn('4 lựa chọn', prompt)
        self.assertIn('đúng một đáp án', prompt)

    def test_structured_quiz_request_asks_for_answer_index(self):
        """Quiz của UI cần answer_index: model phải được yêu cầu đúng cấu trúc đó."""
        reply = json.dumps({'topic': 'Stack', 'questions': [
            {'question': 'Stack theo nguyên tắc nào?', 'options': ['LIFO', 'FIFO'],
             'answer_index': 0, 'max_score': 10}]}, ensure_ascii=False)
        mock = MockProvider(reply)
        mock.start()
        try:
            provider = engine.ProviderEngine(base_url=f'http://127.0.0.1:{mock.port}/v1',
                                             api_key='test-key-not-real', model='mock-model')
            provider.complete_json(task='quiz', payload={'topic': 'Stack', 'context': DOCUMENT})
        finally:
            mock.stop()
        prompt = mock.requests[-1]['body']['messages'][0]['content']
        self.assertIn('answer_index', prompt)
        self.assertIn('options', prompt)


class ChatQuizTests(unittest.TestCase):
    """Chế độ Tạo quiz trả câu hỏi CÓ CẤU TRÚC để UI bấm chọn, không phải văn bản."""

    def test_offline_engine_still_builds_a_checkable_quiz(self):
        quiz, topic = server.chat_quiz(engine.LocalEngine(), 'Stack', STACK_DOCUMENT)
        self.assertIsNotNone(quiz, 'engine offline vẫn phải dựng được quiz từ tài liệu')
        self.assertEqual(topic, 'Stack')
        for question in quiz['questions']:
            self.assertTrue(question['question'].strip())
            self.assertGreaterEqual(len(question['options']), 2)
            self.assertTrue(0 <= question['answer_index'] < len(question['options']))

    def test_provider_quiz_json_is_normalised_and_broken_items_dropped(self):
        reply = json.dumps({'topic': 'Stack và Queue', 'questions': [
            {'question': 'Stack hoạt động theo nguyên tắc nào?',
             'options': ['LIFO', 'FIFO', 'Ngẫu nhiên', 'Theo mức'], 'answer_index': 0, 'max_score': 10},
            {'question': 'Câu chỉ có một lựa chọn', 'options': ['LIFO'], 'answer_index': 0, 'max_score': 10},
            {'question': 'Đáp án trỏ ra ngoài danh sách', 'options': ['a', 'b'], 'answer_index': 7, 'max_score': 10},
        ]})
        mock = MockProvider(reply)
        mock.start()
        try:
            provider = engine.ProviderEngine(base_url=f'http://127.0.0.1:{mock.port}/v1',
                                             api_key='test-key-not-real', model='mock-model')
            quiz, topic = server.chat_quiz(provider, 'Stack', STACK_DOCUMENT)
        finally:
            mock.stop()
        self.assertEqual(topic, 'Stack và Queue')
        self.assertIsNotNone(quiz)
        self.assertEqual(len(quiz['questions']), 1, 'câu hỏi hỏng phải bị loại, không đẩy ra UI')
        first = quiz['questions'][0]
        self.assertEqual(first['options'][first['answer_index']], 'LIFO')

    def test_unreachable_provider_returns_no_quiz_so_chat_falls_back(self):
        provider = engine.ProviderEngine(base_url='http://127.0.0.1:9/v1', api_key='test-key-not-real',
                                         model='mock-model', timeout=2)
        quiz, _topic = server.chat_quiz(provider, 'Stack', STACK_DOCUMENT)
        self.assertIsNone(quiz, 'provider lỗi thì route phải rơi về câu trả lời dạng văn bản')


class QuizPersistenceTests(unittest.TestCase):
    """Quiz phải mở lại được sau khi tải lại trang: lưu kèm tin nhắn trong DB."""

    def setUp(self):
        from backend.app.db.database import Database
        self.tmp = tempfile.TemporaryDirectory()
        self.database = Database(Path(self.tmp.name) / 'quiz.db')
        self.database.initialize()
        self.quiz = {'topic': 'Stack', 'questions': [
            {'question': 'Queue lấy phần tử ra ở đâu?', 'options': ['Đầu hàng', 'Cuối hàng', 'Giữa', 'Ngẫu nhiên'],
             'answer_index': 0, 'max_score': 10}]}

    def tearDown(self):
        self.tmp.cleanup()

    def _user_and_conversation(self):
        with self.database.connect() as conn:
            user_id = conn.execute('INSERT INTO users(full_name,email,password_hash) VALUES(?,?,?)',
                                   ('Người học', 'quiz@example.com', 'hash')).lastrowid
            conversation = tutor_store.conversation_for(conn, int(user_id), 'client-quiz',
                                                        mode='generate_quiz', title='Quiz')
            conn.commit()
        return int(user_id), int(conversation['id'])

    def test_quiz_survives_a_reload(self):
        user_id, conversation_id = self._user_and_conversation()
        with self.database.connect() as conn:
            tutor_store.add_message(conn, conversation_id, 'assistant', '## Quiz nhanh: Stack',
                                    'generate_quiz', payload=self.quiz)
            conn.commit()
        with self.database.connect() as conn:
            conversations = tutor_store.conversations_for(conn, user_id)
        message = conversations[0]['messages'][0]
        self.assertIsNotNone(message['quiz'], 'tải lại hội thoại vẫn phải có quiz để bấm')
        self.assertEqual(message['quiz']['questions'][0]['options'][0], 'Đầu hàng')

    def test_plain_answers_have_no_quiz_attached(self):
        user_id, conversation_id = self._user_and_conversation()
        with self.database.connect() as conn:
            tutor_store.add_message(conn, conversation_id, 'assistant', 'Stack là LIFO.', 'explain')
            conn.commit()
        with self.database.connect() as conn:
            conversations = tutor_store.conversations_for(conn, user_id)
        self.assertIsNone(conversations[0]['messages'][0]['quiz'])

    def test_payload_column_is_added_to_an_existing_database(self):
        with self.database.connect() as conn:
            conn.execute('ALTER TABLE tutor_messages DROP COLUMN payload')
            conn.commit()
            self.assertNotIn('payload', {row[1] for row in conn.execute('PRAGMA table_info(tutor_messages)')})
        self.database.initialize()
        with self.database.connect() as conn:
            columns = {row[1] for row in conn.execute('PRAGMA table_info(tutor_messages)')}
        self.assertIn('payload', columns, 'DB cũ phải được thêm cột khi khởi động lại')


if __name__ == '__main__':
    unittest.main()
