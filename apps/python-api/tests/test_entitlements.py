import tempfile
import unittest
from pathlib import Path

from backend.app.db.database import Database
from backend.app.db.seed import seed
from backend.app.entitlements import service as ent


class EntitlementTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.database = Database(Path(self.tmp.name) / 'policy.db')
        self.database.initialize()
        seed(self.database)
        with self.database.connect() as connection:
            self.user_id = connection.execute(
                "INSERT INTO users(full_name,email,password_hash) VALUES('Policy','policy@example.test','x')"
            ).lastrowid
            connection.commit()

    def tearDown(self):
        self.tmp.cleanup()

    def test_free_limits_and_paid_capabilities(self):
        with self.database.connect() as connection:
            view = ent.snapshot(connection, self.user_id)
            self.assertEqual(view['plan'], 'free')
            self.assertEqual(view['usage']['tutor_chat']['limit'], 10)
            self.assertEqual(view['usage']['documents']['limit'], 5)
            self.assertFalse(view['capabilities']['document_quiz_generate']['allowed'])
            plus = connection.execute("SELECT id FROM plans WHERE lower(name)='standard'").fetchone()[0]
            connection.execute('INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,?)', (self.user_id, plus, 'active'))
            connection.commit()
            paid = ent.snapshot(connection, self.user_id)
            self.assertEqual(paid['plan'], 'plus')
            self.assertIsNone(paid['usage']['tutor_chat']['limit'])
            self.assertTrue(paid['capabilities']['document_quiz_generate']['allowed'])
            self.assertFalse(paid['capabilities']['mock_exam']['available'])

    def test_reservation_replay_and_release(self):
        with self.database.connect() as connection:
            first = ent.reserve(connection, self.user_id, 'tutor_chat', {'message': 'one'}, 'key-one')
            ent.release(connection, first.id)
            second = ent.reserve(connection, self.user_id, 'tutor_chat', {'message': 'one'}, 'key-one')
            ent.finalize(connection, second.id, {'answer': 'ok'})
            replay = ent.reserve(connection, self.user_id, 'tutor_chat', {'message': 'one'}, 'key-one')
            self.assertTrue(replay.replay['idempotent_replay'])
            self.assertEqual(ent.snapshot(connection, self.user_id)['usage']['tutor_chat']['used'], 1)


if __name__ == '__main__':
    unittest.main()
