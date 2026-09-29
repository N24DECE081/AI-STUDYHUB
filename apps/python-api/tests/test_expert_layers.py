import tempfile
import unittest
from pathlib import Path
from unittest import mock

from backend.app.ai_tutor import agent, config, memory
from backend.app.db.database import Database


class ModelRoutingTests(unittest.TestCase):
    def test_catalog_selects_reasoning_and_task_models(self):
        provider, main, task = config.catalog_models()
        self.assertEqual((provider, main, task), ('openai', 'gpt-4o', 'gpt-4o-mini'))

    def test_environment_can_override_both_models(self):
        env = {'STUDYHUB_AI_PROVIDER': 'openai', 'STUDYHUB_AI_API_KEY': 'secret',
               'STUDYHUB_AI_MODEL': 'reasoner', 'STUDYHUB_AI_TASK_MODEL': 'helper'}
        settings = config.provider_settings(env)
        self.assertEqual(settings['model'], 'reasoner')
        self.assertEqual(settings['task_model'], 'helper')

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


if __name__ == '__main__':
    unittest.main()
