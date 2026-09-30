import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend.app.ai_tutor import agent, config, engine, memory
from backend.app.db.database import Database


class ModelRoutingTests(unittest.TestCase):
    def test_catalog_selects_reasoning_and_task_models(self):
        provider, main, task = config.catalog_models()
        self.assertEqual((provider, main, task), ('openrouter', 'openrouter/free', 'openrouter/free'))

    def test_environment_can_override_both_models(self):
        env = {'STUDYHUB_AI_PROVIDER': 'openai', 'STUDYHUB_AI_API_KEY': 'secret',
               'STUDYHUB_AI_MODEL': 'reasoner', 'STUDYHUB_AI_TASK_MODEL': 'helper'}
        settings = config.provider_settings(env)
        self.assertEqual(settings['model'], 'reasoner')
        self.assertEqual(settings['task_model'], 'helper')

    def test_groq_has_ordered_free_model_fallbacks(self):
        settings = config.provider_settings({'STUDYHUB_AI_PROVIDER': 'groq', 'GROQ_API_KEY': 'secret'})
        self.assertEqual(settings['model'], 'openai/gpt-oss-120b')
        self.assertEqual(settings['task_model'], 'openai/gpt-oss-20b')
        self.assertEqual(settings['fallback_models'], ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'])

    def test_professional_skill_is_loaded(self):
        prompt = config.skill_prompt()
        self.assertIn('Truy xuất', prompt)
        self.assertNotIn('name: professional_tutor', prompt)


class AgentToolTests(unittest.TestCase):
    def test_calculator_accepts_arithmetic_and_rejects_code(self):
        self.assertEqual(agent.safe_calculate('(2 + 3) * 4'), 20)
        with self.assertRaises(ValueError):
            agent.safe_calculate('__import__("os").system("dir")')

    def test_web_tool_runs_only_for_explicit_request(self):
        with mock.patch.object(agent, 'web_search') as search:
            _, _, trace = agent.run('Giải thích hàng đợi', '')
        search.assert_not_called()
        self.assertEqual(trace, [])


class AdaptiveTutorBehaviorTests(unittest.TestCase):
    def test_auto_mode_selects_guided_and_review_intents(self):
        self.assertEqual(engine.detect_mode('Hướng dẫn mình từng bước bài này'), 'guided')
        self.assertEqual(engine.detect_mode('Nhận xét code của mình giúp'), 'review')

    def test_guided_mode_gives_a_grounded_next_step_without_final_answer(self):
        answer = engine.LocalEngine().answer(
            mode='guided', question='Hướng dẫn từng bước kế thừa trong Java',
            context='Java: Kế thừa cho phép lớp con dùng lại thuộc tính và phương thức của lớp cha.\n\n'
                    'Java: Lớp con khai báo quan hệ kế thừa bằng từ khóa extends.')
        self.assertIn('Bước tiếp theo của bạn', answer)
        self.assertIn('extends', answer)
        self.assertNotIn('kết luận đáp án', answer.lower())

    def test_offline_review_does_not_claim_unverified_correctness(self):
        answer = engine.LocalEngine().answer(
            mode='review', question='Nhận xét code của mình: public class Main {', context='')
        self.assertIn('chưa có tài liệu/rubric', answer.lower())
        self.assertNotIn('code đã đúng', answer.lower())

    def test_learner_profile_is_separate_from_document_evidence(self):
        provider = engine.ProviderEngine(base_url='http://mock-provider/v1',
                                        api_key='test-key-not-real', model='mock-model')
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'{"choices":[{"message":{"content":"Stack la LIFO."}}]}'

        with mock.patch.object(engine.urllib.request, 'urlopen', return_value=Response()) as urlopen:
            provider.answer(mode='explain', question='Stack là gì?', context='Tài liệu: Stack là LIFO.',
                            learner_profile='Ưa thích ví dụ ngắn.')
        request = urlopen.call_args.args[0]
        body = json.loads(request.data)
        user_message = body['messages'][-1]['content']
        self.assertIn('Hồ sơ học tập riêng', user_message)
        self.assertIn('không dùng làm bằng chứng kiến thức', user_message)
        document_context = user_message.split('Hồ sơ học tập riêng', 1)[0]
        self.assertNotIn('Ưa thích ví dụ ngắn', document_context)
        self.assertEqual(body['model'], 'mock-model')


class MemoryIsolationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Database(Path(self.temp.name) / 'test.db')
        self.database.initialize()
        with self.database.connect() as conn:
            for user_id in (1, 2):
                conn.execute('INSERT INTO users(id,full_name,email,password_hash) VALUES(?,?,?,?)',
                             (user_id, f'User {user_id}', f'u{user_id}@example.com', 'hash'))
            conn.commit()

    def tearDown(self):
        self.temp.cleanup()

    def test_profiles_are_private_per_user(self):
        with self.database.connect() as conn:
            memory.remember(conn, 1, 'weakness', 'Vòng lặp Python', 0.9)
            first = memory.consolidate(conn, 1)
            second = memory.consolidate(conn, 2)
            conn.commit()
        self.assertIn('Vòng lặp Python', first['summary'])
        self.assertNotIn('Vòng lặp Python', second['summary'])

    def test_latest_assessment_is_not_counted_as_new_evidence_each_chat(self):
        with self.database.connect() as conn:
            conn.execute(
                'INSERT INTO tutor_assessments(user_id,subject,goal,current_level,target_level,study_time,pace,'
                'strengths,weaknesses,score_percent,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                (1, 'Java', 'Nắm vững vòng lặp', 'beginner', 'intermediate', 30, 'steady',
                 '["Hiểu cú pháp cơ bản"]', '["Điều kiện dừng vòng lặp"]', 40, 'completed'),
            )
            first = memory.consolidate(conn, 1)
            memory.consolidate(conn, 1)
            row = conn.execute(
                'SELECT evidence_count FROM learner_memories WHERE user_id=? AND memory_type=? AND content=?',
                (1, 'fact', 'Mức hiện tại theo lần tự đánh giá gần nhất: beginner'),
            ).fetchone()
            conn.commit()
        self.assertEqual(row['evidence_count'], 1)
        self.assertIn('beginner', first['summary'])


if __name__ == '__main__':
    unittest.main()
