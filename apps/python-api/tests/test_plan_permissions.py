"""Run: python -m unittest discover -s tests -p test_plan_permissions.py"""
import sqlite3
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

import test_server_integration as integration
from backend.app import permissions
from backend.app.timezone import VIETNAM_TZ


class PlanPermissionsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        integration.ServerIntegrationTest.setUpClass()
        cls.http = integration.ServerIntegrationTest('runTest')
        cls.path = Path(cls.http.tmp.name) / 'integration.db'

    @classmethod
    def tearDownClass(cls):
        integration.ServerIntegrationTest.tearDownClass()

    def test_permissions_and_limits_cannot_be_bypassed(self):
        email = 'plans-security@example.com'
        status, headers, result = self.http.request('/api/auth/register', 'POST', {
            'first_name': 'Plan', 'last_name': 'Test', 'email': email, 'password': 'PlanTest123!'
        })
        self.assertEqual(status, 201, result)
        auth = {'Cookie': headers['Set-Cookie'].split(';', 1)[0]}
        request = lambda path, payload=None: self.http.request(path, 'GET' if payload is None else 'POST', payload, auth)
        subject = self.http.create_subject(auth['Cookie'], 'PL')
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            uid = conn.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()['id']
            for code, name, docs, storage, quota in [
                ('free', 'Free', 10, 200 * 1024**2, 5),
                ('plus', 'Standard', 50, 2 * 1024**3, 200),
                ('pro', 'Premium', 200, 5 * 1024**3, None),
            ]:
                plan_id = conn.execute('SELECT id FROM plans WHERE name=?', (name,)).fetchone()['id']
                conn.execute('DELETE FROM subscriptions WHERE user_id=?', (uid,))
                conn.execute('INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,?)', (uid, plan_id, 'active'))
                conn.execute('DELETE FROM plan_usage WHERE user_id=?', (uid,))
                conn.execute('DELETE FROM documents WHERE uploaded_by=?', (uid,))
                conn.commit()
                status, _, subscription = request('/api/subscription')
                self.assertEqual(status, 200, subscription)
                self.assertEqual(subscription['plan'], code)
                policy = subscription['permissions']
                self.assertEqual((policy['max_documents'], policy['storage_bytes'], policy['tutor_limit']), (docs, storage, quota))
                for feature in permissions.PAID_FEATURES | permissions.MASTER_FEATURES | {'deep_focus', 'basic_quiz', 'basic_progress'}:
                    self.assertEqual(policy['features'][feature], permissions.allowed(code, feature))
                for path, payload, feature in [
                    ('/api/quizzes/generate', {}, 'advanced_quiz'),
                    ('/api/flashcards/generate', {}, 'advanced_quiz'),
                    ('/api/flashcards/preview', {}, 'advanced_quiz'),
                    ('/api/ai-tutor/roadmap', {}, 'personalized_roadmap'),
                    ('/api/ai-tutor/roadmap', {'target_level': 'advanced'}, 'advanced_roadmap'),
                    ('/api/ai-tutor/chat', {'message': 'Test', 'depth': 'DEEP'}, 'deep_analysis'),
                    ('/api/ai-tutor/chat', {'message': 'Test', 'model': 'custom'}, 'multiple_models'),
                ]:
                    status, _, body = request(path, payload)
                    if not permissions.allowed(code, feature):
                        self.assertEqual((status, body['code']), (403, 'plan_required'), (path, body))
                    else:
                        self.assertNotEqual(status, 403, (path, body))
                self.assertEqual(request('/api/progress')[0], 200)  # Basic progress stays available.
                status, _, basic = request('/api/flashcards/manual', {'subject_id': subject['id'], 'name': 'Basic flashcards', 'cards': [{'front': 'Question', 'back': 'Answer'}]})
                self.assertEqual(status, 201, basic)
                status, _, basic = request('/api/quizzes/manual', {'subject_id': subject['id'], 'title': 'Basic quiz', 'questions': [{'question': 'Which is A?', 'options': ['A', 'B', 'C', 'D'], 'correct_index': 0}]})
                self.assertEqual(status, 201, basic)
                self.assertEqual(request('/api/ai-tutor/memory')[0], 403 if code == 'free' else 200)
                before = permissions.snapshot(conn, uid)['tutor_used']
                self.assertEqual(request('/api/ai-tutor/chat', {'message': ''})[0], 400)
                self.assertEqual(request('/api/ai-tutor/chat', {'message': 'Test', 'mode': 'invalid'})[0], 400)
                self.assertEqual(permissions.snapshot(conn, uid)['tutor_used'], before)
                conn.execute('DELETE FROM plan_usage WHERE user_id=?', (uid,))
                conn.commit()
                if quota is not None:
                    day, month = permissions.period_keys()
                    key = day if code == 'free' else month
                    conn.execute('INSERT INTO plan_usage(user_id,period_key,used) VALUES(?,?,?)', (uid, key, quota - 1))
                    conn.commit()
                    with ThreadPoolExecutor(max_workers=4) as pool:
                        statuses = list(pool.map(lambda _: request('/api/ai-tutor/chat', {'message': 'Atomicity là gì?'})[0], range(4)))
                    self.assertEqual(sorted(statuses), [200, 429, 429, 429])
                    # Other chat aliases and history deletion cannot reset quota.
                    self.assertEqual(request('/api/ai/chat', {'question': 'Test'})[0], 429)
                    self.assertEqual(request('/api/chat', {'question': 'Test'})[0], 429)
                    self.http.request('/api/ai-tutor/conversations', 'DELETE', headers=auth)
                    self.assertEqual(request('/api/ai-tutor/chat', {'message': 'Test'})[0], 429)
                else:
                    conn.execute('INSERT INTO plan_usage(user_id,period_key,used) VALUES(?,?,100000)', (uid, permissions.period_keys()[1]))
                    conn.commit()
                    self.assertEqual(request('/api/ai-tutor/chat', {'message': 'Test'})[0], 200)
                # Exercise upload boundaries with existing physical-upload code.
                insert = "INSERT INTO documents(title,original_filename,storage_filename,file_type,mime_type,storage_path,file_size,subject_id,uploaded_by) VALUES(?,?,?,?,'text/plain','test-placeholder',?,?,?)"
                conn.executemany(insert, [(f'Doc {i}', 'test.txt', f'{uid}-{code}-{i}.txt', 'txt', 1, subject['id'], uid) for i in range(docs)])
                conn.commit()
                boundary = 'plan-test-boundary'
                payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="subject_id"\r\n\r\n{subject["id"]}\r\n'
                           f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nQuota\r\n'
                           f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nLearning test content\r\n--{boundary}--\r\n').encode()
                upload = lambda: self.http.request('/api/upload', 'POST', payload, {**auth, 'Content-Type': f'multipart/form-data; boundary={boundary}'})
                status, _, body = upload()
                self.assertEqual((status, body['code']), (403, 'document_quota_exceeded'))
                conn.execute('DELETE FROM documents WHERE id=(SELECT MAX(id) FROM documents WHERE uploaded_by=?)', (uid,))
                conn.commit()
                with ThreadPoolExecutor(max_workers=4) as pool:
                    statuses = list(pool.map(lambda _: upload()[0], range(4)))
                self.assertEqual(sorted(statuses), [201, 403, 403, 403])
                self.assertEqual(permissions.snapshot(conn, uid)['document_count'], docs)
                conn.execute('DELETE FROM documents WHERE uploaded_by=?', (uid,))
                conn.execute(insert, ('Full storage', 'full.txt', f'{uid}-{code}-full.txt', 'txt', storage, subject['id'], uid))
                conn.commit()
                status, _, body = upload()
                self.assertEqual((status, body['code']), (403, 'storage_quota_exceeded'))
                conn.execute('UPDATE documents SET file_size=? WHERE uploaded_by=?', (storage - len(b'Learning test content'), uid))
                conn.commit()
                self.assertEqual(upload()[0], 201)  # Exact boundary is allowed.
            now = datetime(2026, 10, 31, 23, 59, tzinfo=VIETNAM_TZ)
            self.assertEqual(permissions.period_keys(now), ('day:2026-10-31', 'month:2026-10'))
            self.assertEqual(permissions.period_keys(now + timedelta(minutes=1)), ('day:2026-11-01', 'month:2026-11'))
            # A pending payment cannot grant paid permissions.
            conn.execute("UPDATE subscriptions SET status='pending' WHERE user_id=?", (uid,))
            conn.commit()
            self.assertEqual(request('/api/subscription')[2]['plan'], 'free')
            self.assertFalse(permissions.allowed('free', 'unknown'))
        finally:
            conn.close()


if __name__ == '__main__':
    unittest.main()
