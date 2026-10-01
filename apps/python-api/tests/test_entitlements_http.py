import unittest
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from . import test_server_integration as integration
except ImportError:
    import test_server_integration as integration


class EntitlementHTTPTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        integration.ServerIntegrationTest.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        integration.ServerIntegrationTest.tearDownClass.__func__(cls)

    request = integration.ServerIntegrationTest.request
    login_cookie = integration.ServerIntegrationTest.login_cookie
    create_subject = integration.ServerIntegrationTest.create_subject

    def test_free_contract(self):
        cookie = self.login_cookie('student@studyhub.local', 'Student123!')
        headers = {'Cookie': cookie}
        status, _, entitlements = self.request('/api/me/entitlements', headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(entitlements['plan'], 'free')
        self.assertEqual(entitlements['usage']['documents']['limit'], 5)
        self.assertEqual(self.request('/api/quizzes/generate', 'POST', {'document_ids': [1]}, headers)[0], 403)
        status, _, sample = self.request('/api/quizzes/basic', 'POST', {'topic': 'lap-trinh'}, headers)
        self.assertEqual(status, 201)
        self.assertTrue(sample['sample'])
        status, _, reopened = self.request(f"/api/quizzes/{sample['id']}", headers=headers)
        self.assertEqual(status, 200)
        self.assertTrue(reopened['sample'])
        for path in ('/api/mock-exam', '/api/knowledge-gap', '/api/thesis-cv-advisor', '/api/offline-export', '/api/nova-voice'):
            status, _, body = self.request(path, 'POST', {}, headers)
            self.assertEqual((status, body['code']), (501, 'feature_unavailable'))

    def test_sixth_upload_is_rejected_without_file(self):
        status, response_headers, _ = self.request('/api/register', 'POST', {
            'name': 'Capacity Tester', 'email': 'capacity@example.test', 'password': 'StrongPassword123!'
        })
        self.assertEqual(status, 201)
        cookie = response_headers['Set-Cookie'].split(';', 1)[0]
        subject = self.create_subject(cookie, 'LIM')['id']
        before = set(self.tmp_uploads())
        for number in range(6):
            boundary = 'limit'
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nNote {number}\r\n'
                    f'--{boundary}\r\nContent-Disposition: form-data; name="subject_id"\r\n\r\n{subject}\r\n'
                    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="note{number}.txt"\r\n\r\nStudy note {number}\r\n'
                    f'--{boundary}--\r\n').encode()
            status, _, response = self.request('/api/upload', 'POST', body, {'Cookie': cookie, 'Content-Type': f'multipart/form-data; boundary={boundary}'})
            self.assertEqual(status, 201 if number < 5 else 409, response)
        self.assertEqual(len(set(self.tmp_uploads()) - before), 5)

    def test_expiry_boundary_and_cors(self):
        status, registration_headers, _ = self.request('/api/register', 'POST', {
            'name': 'Expiry Tester', 'email': 'expiry@example.test', 'password': 'StrongPassword123!'
        })
        self.assertEqual(status, 201)
        cookie = registration_headers['Set-Cookie'].split(';', 1)[0]
        expiry = (datetime.now(timezone.utc) + timedelta(days=20)).strftime('%Y-%m-%d %H:%M:%S')
        with closing(sqlite3.connect(Path(self.tmp.name) / 'integration.db')) as connection:
            connection.execute("INSERT INTO subscriptions(user_id,plan_id,status,expires_at) SELECT u.id,p.id,'active',? FROM users u,plans p WHERE u.email=? AND lower(p.name)='premium'", (expiry, 'expiry@example.test'))
            connection.commit()
        status, _, scheduled = self.request('/api/subscription/checkout', 'POST', {'plan': 'plus'}, {'Cookie': cookie})
        self.assertEqual(status, 200)
        self.assertEqual(scheduled['scheduled_change']['effective_at'], expiry)
        status, _, cancelled = self.request('/api/subscription/cancel', 'POST', {}, {'Cookie': cookie})
        self.assertEqual(status, 200)
        self.assertEqual(cancelled['scheduled_change']['effective_at'], expiry)
        with closing(sqlite3.connect(Path(self.tmp.name) / 'integration.db')) as connection:
            connection.execute("UPDATE subscriptions SET plan_id=(SELECT id FROM plans WHERE lower(name)='standard') WHERE user_id=(SELECT id FROM users WHERE email=?)", ('expiry@example.test',))
            connection.commit()
        status, _, upgrade = self.request('/api/subscription/checkout', 'POST', {'plan': 'pro'}, {'Cookie': cookie})
        self.assertEqual((status, upgrade['code']), (501, 'payment_unavailable'))
        status, _, view = self.request('/api/me/entitlements', headers={'Cookie': cookie})
        self.assertEqual(view['scheduled_change']['plan'], 'free')
        self.assertEqual(view['scheduled_change']['effective_at'], expiry)
        status, headers, _ = self.request('/api/ai/chat', 'OPTIONS', headers={
            'Origin': 'http://localhost:5173',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Idempotency-Key',
        })
        self.assertEqual(status, 204)
        self.assertIn('Idempotency-Key', headers['Access-Control-Allow-Headers'])

    def tmp_uploads(self):
        from pathlib import Path
        return Path(self.tmp.name, 'uploads').glob('*')


if __name__ == '__main__':
    unittest.main()
