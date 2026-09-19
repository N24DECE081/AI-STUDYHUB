import os, subprocess, sys, time, urllib.request, urllib.error, tempfile, json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ServerIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 8765
        cls.tmp = tempfile.TemporaryDirectory()
        env = os.environ.copy()
        env['STUDYHUB_PORT'] = str(cls.port)
        env['STUDYHUB_DB_PATH'] = str(Path(cls.tmp.name) / 'integration.db')
        cls.proc = subprocess.Popen([sys.executable, str(ROOT/'run.py')], cwd=ROOT, env=env,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        deadline=time.time()+5
        while time.time()<deadline:
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{cls.port}/', timeout=0.5): break
            except Exception: time.sleep(0.1)
        else:
            out=cls.proc.stdout.read() if cls.proc.stdout else ''
            raise RuntimeError('server did not start: '+out)
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=5); cls.tmp.cleanup()
    def get(self,path):
        with urllib.request.urlopen(f'http://127.0.0.1:{self.port}{path}', timeout=2) as r:
            return r.status, r.headers.get_content_type(), r.read()
    def test_real_http_assets_and_api(self):
        status,ctype,body=self.get('/')
        self.assertEqual(status,200); self.assertEqual(ctype,'text/html'); self.assertIn(b'StudyHub',body)
        status,ctype,body=self.get('/styles.css')
        self.assertEqual(status,200); self.assertEqual(ctype,'text/css'); self.assertIn(b'--red',body)
        status,ctype,body=self.get('/app.js')
        self.assertEqual(status,200); self.assertEqual(ctype,'application/javascript'); self.assertIn(b'function',body)
        status,ctype,body=self.get('/api/subjects')
        self.assertEqual(status,200); self.assertEqual(ctype,'application/json'); self.assertIn(b'ATTT',body)
        status,ctype,body=self.get('/api/documents')
        self.assertEqual(status,200); self.assertEqual(ctype,'application/json')
        app_js=self.get('/app.js')[2]
        self.assertIn(b'function submitUpload', app_js)
        self.assertIn(b"go('library')", app_js)
        self.assertIn(b'loadDocs()', app_js)

    def test_login_session_and_no_password_leak(self):
        import json
        payload=json.dumps({'email':'teacher@studyhub.local','password':'Teacher123!'}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/login', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            body=r.read(); cookie=r.headers.get('Set-Cookie')
        self.assertEqual(r.status,200)
        self.assertIsNotNone(cookie)
        self.assertNotIn(b'password',body)
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/me', headers={'Cookie':cookie.split(';',1)[0]})
        with urllib.request.urlopen(req, timeout=2) as r:
            me=json.loads(r.read())
        self.assertEqual(me['user']['role'],'teacher')
        self.assertNotIn('password_hash', me['user'])


    def test_register_logout_and_session_persistence(self):
        import json
        email=f'integration_student_{time.time_ns()}@example.com'
        payload=json.dumps({'name':'Integration Student','email':email,'password':'StrongPass123!'}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/register', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            body=json.loads(r.read()); cookie=r.headers.get('Set-Cookie')
        self.assertEqual(r.status,201)
        self.assertIsNotNone(cookie)
        self.assertEqual(body['user']['email'], email)
        self.assertNotIn('password_hash', body['user'])
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/me', headers={'Cookie':cookie.split(';',1)[0]})
        with urllib.request.urlopen(req, timeout=2) as r:
            me=json.loads(r.read())
        self.assertEqual(me['user']['email'], email)
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/logout', data=b'{}', headers={'Cookie':cookie.split(';',1)[0], 'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            logout=json.loads(r.read())
        self.assertTrue(logout['ok'])
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/me', headers={'Cookie':cookie.split(';',1)[0]})
        with urllib.request.urlopen(req, timeout=2) as r:
            me=json.loads(r.read())
        self.assertIsNone(me['user'])

    def test_course_creation_and_progress_round_trip(self):
        payload=json.dumps({'email':'teacher@studyhub.local','password':'Teacher123!'}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/login', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            cookie=r.headers['Set-Cookie'].split(';',1)[0]
        subjects=json.loads(self.get('/api/subjects')[2]); subject_id=subjects[0]['id']
        payload=json.dumps({'title':'Integration Course','description':'Course created over HTTP','subject_id':subject_id}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/courses', data=payload, headers={'Content-Type':'application/json','Cookie':cookie}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            self.assertEqual(r.status,201); course=json.loads(r.read())
        self.assertEqual(course['title'],'Integration Course')
        payload=json.dumps({'course_id':course['id'],'progress_percent':65}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/progress', data=payload, headers={'Content-Type':'application/json','Cookie':cookie}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            self.assertEqual(r.status,200); saved=json.loads(r.read())
        self.assertEqual(saved['progress_percent'],65)
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/progress', headers={'Cookie':cookie})
        with urllib.request.urlopen(req, timeout=2) as r:
            progress=json.loads(r.read())
        self.assertEqual(progress['items'][0]['course_title'],'Integration Course')
        self.assertEqual(progress['items'][0]['progress_percent'],65)

    def test_any_authenticated_user_can_upload(self):
        payload=json.dumps({'email':'student@studyhub.local','password':'Student123!'}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/login', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            cookie=r.headers['Set-Cookie'].split(';',1)[0]
        subject_id=json.loads(self.get('/api/subjects')[2])[0]['id']
        boundary='----StudyHubUploadTest'
        fields=[
            (f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nStudent upload\r\n').encode(),
            (f'--{boundary}\r\nContent-Disposition: form-data; name="subject_id"\r\n\r\n{subject_id}\r\n').encode(),
            (f'--{boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\nUploaded by student\r\n').encode(),
            (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="student.txt"\r\nContent-Type: text/plain\r\n\r\nstudent file\r\n').encode(),
            f'--{boundary}--\r\n'.encode(),
        ]
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/upload', data=b''.join(fields), headers={'Content-Type':f'multipart/form-data; boundary={boundary}','Cookie':cookie}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            self.assertEqual(r.status,201); uploaded=json.loads(r.read())
        self.assertTrue(uploaded['ok'])
        document=json.loads(self.get(f"/api/documents/{uploaded['document_id']}")[2])
        stored=ROOT / document['file_path']
        if stored.exists(): stored.unlink()

    def test_missing_asset_is_404(self):
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.get('/does-not-exist.css')
        self.assertEqual(cm.exception.code,404)

    def test_ai_chat_with_missing_document_returns_json_404(self):
        payload=json.dumps({'email':'student@studyhub.local','password':'Student123!'}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/auth/login', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            cookie=r.headers['Set-Cookie'].split(';',1)[0]
        payload=json.dumps({'question':'test','document_id':999999}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/ai/chat', data=payload, headers={'Content-Type':'application/json','Cookie':cookie}, method='POST')
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req, timeout=2)
        self.assertEqual(cm.exception.code,404)
        self.assertEqual(json.loads(cm.exception.read())['error'], 'document not found')

    def test_ai_tutor_contract_returns_client_conversation_id(self):
        payload=json.dumps({'email':'student@studyhub.local','password':'Student123!'}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/auth/login', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            cookie=r.headers['Set-Cookie'].split(';',1)[0]
        payload=json.dumps({'conversation_id':'browser-conversation-1','message':'Giải thích tài liệu hiện có','mode':'explain','file_ids':[]}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/ai-tutor/chat', data=payload, headers={'Content-Type':'application/json','Cookie':cookie}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            result=json.loads(r.read())
        self.assertEqual(result['conversation_id'],'browser-conversation-1')
        self.assertEqual(result['role'],'assistant')
        self.assertTrue(result['message_id'])
        self.assertIsInstance(result['content'],str)

if __name__=='__main__': unittest.main()
