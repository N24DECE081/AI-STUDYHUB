import os, subprocess, sys, time, urllib.request, urllib.error, tempfile, json, sqlite3, hashlib
from datetime import datetime, timezone
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

# Test phải chạy offline: không đọc .env thật của máy.
os.environ['STUDYHUB_NO_DOTENV'] = '1'
for _name in ('DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY',
              'MISTRAL_API_KEY', 'TOGETHER_API_KEY', 'XAI_API_KEY', 'ANTHROPIC_API_KEY',
              'STUDYHUB_AI_PROVIDER', 'STUDYHUB_AI_API_KEY', 'STUDYHUB_AI_BASE_URL', 'STUDYHUB_AI_MODEL'):
    os.environ.pop(_name, None)

class ServerIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 8765
        cls.tmp = tempfile.TemporaryDirectory()
        env = os.environ.copy()
        env['STUDYHUB_PORT'] = str(cls.port)
        env['PYTHONIOENCODING'] = 'utf-8'
        env['STUDYHUB_DB_PATH'] = str(Path(cls.tmp.name) / 'integration.db')
        env['STUDYHUB_UPLOAD_DIR'] = str(Path(cls.tmp.name) / 'uploads')
        env['STUDYHUB_DB_MODE'] = 'sqlite'
        # Keep this broad API contract suite independent of the gateway's
        # dedicated low-limit integration test (all requests share localhost).
        env['STUDYHUB_API_RATE_LIMIT_PER_MINUTE'] = '10000'
        env['STUDYHUB_API_BURST'] = '1000'
        env['STUDYHUB_AUTH_RATE_LIMIT_PER_MINUTE'] = '10000'
        env['STUDYHUB_AUTH_BURST'] = '1000'
        env.pop('MYSQL_DATABASE', None)
        env['STUDYHUB_CORS_ORIGINS'] = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175'
        cls.proc = subprocess.Popen([sys.executable, str(ROOT/'run.py')], cwd=ROOT, env=env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, text=True)
        deadline=time.time()+5
        while time.time()<deadline:
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{cls.port}/api/subjects', timeout=0.5): break
            except Exception: time.sleep(0.1)
        else:
            cls.proc.terminate()
            out,_ = cls.proc.communicate(timeout=3)
            raise RuntimeError('server did not start: '+(out or '')[:2000])
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=5); cls.tmp.cleanup()
    def get(self,path,timeout=2):
        with urllib.request.urlopen(f'http://127.0.0.1:{self.port}{path}', timeout=timeout) as r:
            return r.status, r.headers.get_content_type(), r.read()
    def request(self,path,method='GET',payload=None,headers=None,timeout=20):
        body=None if payload is None else (payload if isinstance(payload,bytes) else json.dumps(payload).encode())
        request_headers=dict(headers or {})
        if body is not None and not isinstance(payload,bytes):
            request_headers.setdefault('Content-Type','application/json')
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}{path}',data=body,headers=request_headers,method=method)
        try:
            with urllib.request.urlopen(req,timeout=timeout) as response:
                raw=response.read()
                result=json.loads(raw) if 'application/json' in response.headers.get('Content-Type','') else raw
                return response.status,response.headers,result
        except urllib.error.HTTPError as error:
            raw=error.read()
            try: result=json.loads(raw)
            except json.JSONDecodeError: result=raw
            return error.code,error.headers,result
    def login_cookie(self,email,password):
        status,headers,result=self.request('/api/auth/login','POST',{'email':email,'password':password})
        self.assertEqual(status,200,result)
        return headers['Set-Cookie'].split(';',1)[0]
    def test_real_http_assets_and_api(self):
        status,ctype,body=self.get('/api/subjects')
        self.assertEqual(status,200); self.assertEqual(ctype,'application/json'); self.assertIn(b'ATTT',body)
        status,_,body=self.request('/api/documents')
        self.assertEqual(status,401); self.assertIn('error',body)
        if not (ROOT/'web').is_dir():
            self.skipTest('vanilla web/ UI is not shipped; the React frontend owns the assets')
        status,ctype,body=self.get('/')
        self.assertEqual(status,200); self.assertEqual(ctype,'text/html'); self.assertIn(b'StudyHub',body)
        status,ctype,body=self.get('/styles.css')
        self.assertEqual(status,200); self.assertEqual(ctype,'text/css'); self.assertIn(b'--red',body)
        status,ctype,body=self.get('/app.js')
        self.assertEqual(status,200); self.assertEqual(ctype,'application/javascript'); self.assertIn(b'function',body)
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

    def test_library_subjects_are_scoped_to_their_owner(self):
        student=self.login_cookie('student@studyhub.local','Student123!')
        teacher=self.login_cookie('teacher@studyhub.local','Teacher123!')
        code=f'U{time.time_ns()}'[-12:]
        status,_,created=self.request('/api/subjects','POST',{
            'name':'Private library subject','code':code,'description':'Student only'
        },{'Cookie':student})
        self.assertEqual(status,201,created)
        status,_,student_subjects=self.request('/api/subjects?scope=mine',headers={'Cookie':student})
        self.assertEqual(status,200,student_subjects)
        self.assertIn(created['id'],[subject['id'] for subject in student_subjects])
        status,_,teacher_subjects=self.request('/api/subjects?scope=mine',headers={'Cookie':teacher})
        self.assertEqual(status,200,teacher_subjects)
        self.assertNotIn(created['id'],[subject['id'] for subject in teacher_subjects])
        status,_,unauthorized=self.request('/api/subjects?scope=mine')
        self.assertEqual(status,401,unauthorized)

    def test_google_oauth_status_does_not_expose_secrets(self):
        status,_,body=self.request('/api/auth/oauth/status')
        self.assertEqual(status,200,body)
        self.assertIn('google',body['providers'])
        self.assertFalse(body['providers']['google']['configured'])
        self.assertNotIn('secret',json.dumps(body).lower())

    def test_real_time_study_session_and_document_progress(self):
        email=f'progress_clock_{time.time_ns()}@example.com'
        status,headers,body=self.request('/api/auth/register','POST',{
            'name':'Progress Clock','email':email,'password':'StrongPass123!'
        })
        self.assertEqual(status,201,body)
        cookie=headers['Set-Cookie'].split(';',1)[0]
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        user_id=connection.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()[0]
        subject_id=connection.execute('SELECT id FROM subjects ORDER BY id LIMIT 1').fetchone()[0]
        document_id=connection.execute('''INSERT INTO documents(
            subject_id,uploaded_by,title,original_filename,storage_filename,file_type,
            mime_type,file_size,storage_path,status,visibility
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)''',(
            subject_id,user_id,'Real progress document','progress.txt',f'{time.time_ns()}.txt',
            'txt','text/plain',4,'uploads/progress.txt','ready','private'
        )).lastrowid
        connection.execute(
            "UPDATE study_sessions SET started_at=datetime('now','-3665 seconds') "
            "WHERE user_id=? AND status='active'",(user_id,)
        )
        connection.commit(); connection.close()

        status,_,progress=self.request('/api/progress',headers={'Cookie':cookie})
        self.assertEqual(status,200,progress)
        document=next(item for item in progress['items'] if item.get('document_id')==document_id)
        self.assertEqual(document['progress_percent'],0)
        status,_,saved=self.request('/api/progress','POST',{
            'document_id':document_id,'progress_percent':60,'completed':False
        },{'Cookie':cookie})
        self.assertEqual(status,403,saved)
        self.assertIn('tự động',saved['error'])
        status,_,content=self.request(
            f'/api/documents/{document_id}/content',headers={'Cookie':cookie}
        )
        self.assertEqual(status,200,content)
        status,_,progress=self.request('/api/progress',headers={'Cookie':cookie})
        document=next(item for item in progress['items'] if item.get('document_id')==document_id)
        self.assertEqual(document['progress_percent'],25)
        status,_,study_time=self.request('/api/study-time',headers={'Cookie':cookie})
        self.assertEqual(status,200,study_time)
        self.assertTrue(study_time['active'])
        self.assertGreaterEqual(study_time['current_session_seconds'],3665)

        status,_,logout=self.request('/api/auth/logout','POST',{}, {'Cookie':cookie})
        self.assertEqual(status,200,logout)
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        closed=connection.execute(
            'SELECT status,duration_seconds FROM study_sessions WHERE user_id=? ORDER BY id DESC LIMIT 1',
            (user_id,),
        ).fetchone()
        connection.close()
        self.assertEqual(closed[0],'completed')
        self.assertGreaterEqual(closed[1],3665)

    def test_progress_analytics_uses_quiz_completion_and_correct_answers(self):
        email=f'progress_analytics_{time.time_ns()}@example.com'
        status,headers,body=self.request('/api/auth/register','POST',{
            'name':'Progress Analytics','email':email,'password':'StrongPass123!'
        })
        self.assertEqual(status,201,body)
        cookie=headers['Set-Cookie'].split(';',1)[0]
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        user_id=connection.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()[0]
        session_id=connection.execute(
            "INSERT INTO chat_sessions(user_id,title) VALUES(?,?)",
            (user_id,'QUIZ_CARD:Analytics test')
        ).lastrowid
        connection.execute(
            "INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)",
            (session_id,'user',json.dumps({
                'kind':'quiz_attempt','score':6,'total':10,
                'answers':{f'q{index}':index % 4 for index in range(1,9)},
            }))
        )
        connection.commit(); connection.close()

        status,_,result=self.request('/api/progress',headers={'Cookie':cookie})
        self.assertEqual(status,200,result)
        summary=result['analytics']['summary']
        self.assertEqual(summary['completion_percent'],80)
        self.assertEqual(summary['accuracy_percent'],60)
        self.assertEqual(summary['learning_percent'],70)
        self.assertEqual(summary['xp'],65)
        self.assertEqual(result['analytics']['today']['questions_answered'],8)
        self.assertEqual(result['analytics']['ranges']['day'][-1]['learning_percent'],70)

    def test_course_creation_and_progress_round_trip(self):
        student_cookie=self.login_cookie('student@studyhub.local','Student123!')
        subjects=json.loads(self.get('/api/subjects')[2]); subject_id=subjects[0]['id']
        forbidden_status,_,forbidden=self.request('/api/courses','POST',{
            'title':'Student must not create courses','description':'forbidden','subject_id':subject_id
        },{'Cookie':student_cookie})
        self.assertEqual(forbidden_status,403,forbidden)
        payload=json.dumps({'email':'teacher@studyhub.local','password':'Teacher123!'}).encode()
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/login', data=payload, headers={'Content-Type':'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=2) as r:
            cookie=r.headers['Set-Cookie'].split(';',1)[0]
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
        status,_,document=self.request(f"/api/documents/{uploaded['document_id']}",headers={'Cookie':cookie})
        self.assertEqual(status,200,document)
        stored=ROOT / document['file_path']
        self.assertEqual(stored.parent.resolve(), (Path(self.tmp.name) / 'uploads').resolve())
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        saved=connection.execute(
            'SELECT d.uploaded_by,d.visibility,c.content FROM documents d '
            'JOIN document_chunks c ON c.document_id=d.id WHERE d.id=?',
            (uploaded['document_id'],),
        ).fetchone()
        connection.close()
        self.assertIsNotNone(saved)
        self.assertEqual(saved[1],'private')
        self.assertEqual(saved[2],'student file')
        status,_,content=self.request(
            f"/api/documents/{uploaded['document_id']}/content",headers={'Cookie':cookie}
        )
        self.assertEqual(status,200,content)
        self.assertEqual(content['content'],'student file')
        self.assertEqual(content['display_mode'],'plain_text')
        status,_,documents=self.request('/api/documents',headers={'Cookie':cookie})
        self.assertEqual(status,200,documents)
        listed=next(item for item in documents if item['id']==uploaded['document_id'])
        self.assertEqual(listed['content_preview'],'student file')
        status,_,tutor_result=self.request('/api/ai-tutor/chat','POST',{
            'conversation_id':f'auto-progress-{time.time_ns()}',
            'message':'Giải thích nội dung student file','mode':'explain',
            'file_ids':[uploaded['document_id']],
        },{'Cookie':cookie})
        self.assertEqual(status,200,tutor_result)
        self.assertEqual(tutor_result['retrieval']['tier'],'documents')
        status,_,automatic_progress=self.request('/api/progress',headers={'Cookie':cookie})
        learned=next(item for item in automatic_progress['items']
                     if item.get('document_id')==uploaded['document_id'])
        self.assertEqual(learned['progress_percent'],60)
        teacher=self.login_cookie('teacher@studyhub.local','Teacher123!')
        status,_,other_document=self.request(f"/api/documents/{uploaded['document_id']}",headers={'Cookie':teacher})
        self.assertEqual(status,404,other_document)
        status,_,other_content=self.request(
            f"/api/documents/{uploaded['document_id']}/content",headers={'Cookie':teacher}
        )
        self.assertEqual(status,404,other_content)
        status,_,teacher_documents=self.request('/api/documents',headers={'Cookie':teacher})
        self.assertEqual(status,200,teacher_documents)
        self.assertNotIn(uploaded['document_id'],[item['id'] for item in teacher_documents])
        status,_,cross_user_tutor=self.request('/api/ai-tutor/chat','POST',{
            'message':'Tóm tắt tài liệu','mode':'summarize','file_ids':[uploaded['document_id']],
        },{'Cookie':teacher})
        self.assertEqual(status,404,cross_user_tutor)
        status,_,cross_user_delete=self.request(
            f"/api/documents/{uploaded['document_id']}",'DELETE',headers={'Cookie':teacher}
        )
        self.assertEqual(status,404,cross_user_delete)
        status,_,deleted=self.request(
            f"/api/documents/{uploaded['document_id']}",'DELETE',headers={'Cookie':cookie}
        )
        self.assertEqual(status,200,deleted)
        self.assertTrue(deleted['ok'])
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        remaining=connection.execute(
            'SELECT COUNT(*) FROM document_chunks WHERE document_id=?',(uploaded['document_id'],)
        ).fetchone()[0]
        connection.close()
        self.assertEqual(remaining,0)
        self.assertFalse(stored.exists())

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

    def test_ai_tutor_uses_external_cache_when_documents_do_not_match(self):
        cookie=self.login_cookie('student@studyhub.local','Student123!')
        cached_answer=('Xenolith quasar là mục kiến thức thử nghiệm được lưu trong '
                       'bộ nhớ kiến thức bên ngoài của StudyHub.')
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        connection.execute('''INSERT INTO external_knowledge_cache(
            cache_key,keywords,question,answer,provider
        ) VALUES(?,?,?,?,?)''',(
            hashlib.sha256(str(time.time_ns()).encode()).hexdigest(),
            json.dumps(['quasar','xenolith']),
            'Quasar xenolith là gì?',cached_answer,'test-cache',
        ))
        connection.commit(); connection.close()
        status,_,result=self.request('/api/ai-tutor/chat','POST',{
            'conversation_id':f'external-cache-{time.time_ns()}',
            'message':'Giải thích quasar xenolith','mode':'explain','file_ids':[],
        },{'Cookie':cookie})
        self.assertEqual(status,200,result)
        self.assertEqual(result['retrieval']['tier'],'external_cache')
        self.assertEqual(result['sources'][0]['type'],'external_cache')
        self.assertIn('Xenolith quasar',result['content'])

    def test_ai_tutor_invalid_utf8_returns_json_error_without_dropping_connection(self):
        cookie=self.login_cookie('student@studyhub.local','Student123!')
        status,headers,result=self.request('/api/ai-tutor/chat','POST',b'{"message":"\xff"}',{
            'Content-Type':'application/json','Cookie':cookie
        })
        self.assertEqual(status,400,result)
        self.assertEqual(headers.get_content_type(),'application/json')
        self.assertIn('error',result)

    def test_ai_tutor_rejects_more_than_five_files(self):
        cookie=self.login_cookie('student@studyhub.local','Student123!')
        status,_,result=self.request('/api/ai-tutor/chat','POST',{
            'message':'Tóm tắt các tài liệu','mode':'summarize','file_ids':[1,2,3,4,5,6],
        },{'Cookie':cookie})
        self.assertEqual(status,400,result)
        self.assertIn('5',result['error'])

    def test_subscription_upgrade_and_downgrade_are_persisted(self):
        cookie=self.login_cookie('student@studyhub.local','Student123!')
        headers={'Content-Type':'application/json','Cookie':cookie}
        status,_,response=self.request('/api/subscription/checkout','POST',{
            'plan':'plus','billing_cycle':'month','payment_method':'card',
            'payment_status':'paid','transaction_id':'client-forged-transaction'
        },headers)
        self.assertEqual(status,501)
        self.assertEqual(response['payment_status'],'not_configured')
        self.assertIn('không kích hoạt',response['error'].lower())
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api/subscription',headers={'Cookie':cookie})
        with urllib.request.urlopen(req, timeout=2) as r:
            current=json.loads(r.read())
        self.assertEqual(current['plan'],'free')
        self.assertIsNone(current['scheduled_change'])
        # Seed an existing paid subscription directly to exercise a no-charge downgrade.
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        connection.execute("INSERT INTO subscriptions(user_id,plan_id,status) SELECT users.id,plans.id,'active' FROM users,plans WHERE users.email='student@studyhub.local' AND lower(plans.name)='standard'")
        connection.commit(); connection.close()
        before=datetime.now(timezone.utc).replace(tzinfo=None)
        status,_,downgrade=self.request('/api/subscription/checkout','POST',{'plan':'free','billing_cycle':'month'},{'Cookie':cookie})
        self.assertEqual(status,200,downgrade)
        effective=datetime.strptime(downgrade['scheduled_change']['effective_at'],'%Y-%m-%d %H:%M:%S')
        self.assertGreater(effective,before)
        connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
        stored=connection.execute("SELECT effective_at FROM subscription_changes WHERE user_id=(SELECT id FROM users WHERE email='student@studyhub.local') AND status='scheduled'").fetchone()
        connection.close()
        self.assertEqual(stored[0],downgrade['scheduled_change']['effective_at'])
        before_cancel=datetime.now(timezone.utc).replace(tzinfo=None)
        status,_,cancelled=self.request('/api/subscription/cancel','POST',{},headers)
        self.assertEqual(status,200,cancelled)
        cancel_effective=datetime.strptime(cancelled['scheduled_change']['effective_at'],'%Y-%m-%d %H:%M:%S')
        self.assertGreater(cancel_effective,before_cancel)

    def test_quiz_hides_solutions_until_submit_and_is_user_scoped(self):
        student=self.login_cookie('student@studyhub.local','Student123!')
        teacher=self.login_cookie('teacher@studyhub.local','Teacher123!')
        subjects=json.loads(self.get('/api/subjects')[2])
        boundary='----QuizSourceUpload'
        upload=(
            f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nQuiz test source\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="subject_id"\r\n\r\n{subjects[0]["id"]}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="quiz-source.txt"\r\nContent-Type: text/plain\r\n\r\n'
            'Database indexes improve query performance. Foreign keys keep related records consistent.\r\n'
            f'--{boundary}--\r\n'
        ).encode()
        status,_,uploaded=self.request('/api/upload','POST',upload,{'Cookie':student,'Content-Type':f'multipart/form-data; boundary={boundary}'})
        self.assertEqual(status,201,uploaded)
        status,_,source=self.request(f"/api/documents/{uploaded['document_id']}",headers={'Cookie':student})
        self.assertEqual(status,200,source)
        stored=ROOT / source['file_path']
        self.assertEqual(stored.parent.resolve(), (Path(self.tmp.name) / 'uploads').resolve())
        self.addCleanup(lambda path=stored: path.unlink(missing_ok=True))
        status,_,created=self.request('/api/quizzes/generate','POST',{'document_ids':[uploaded['document_id']]},{'Cookie':student})
        self.assertEqual(status,201,created)
        quiz_id=created['id']
        status,_,unauthenticated=self.request(f'/api/quizzes/{quiz_id}')
        self.assertEqual(status,401,unauthenticated)
        status,_,other_user=self.request(f'/api/quizzes/{quiz_id}',headers={'Cookie':teacher})
        self.assertEqual(status,404,other_user)
        status,_,quiz=self.request(f'/api/quizzes/{quiz_id}',headers={'Cookie':student})
        self.assertEqual(status,200)
        self.assertGreater(quiz['question_count'],0)
        for question in quiz['questions']:
            self.assertNotIn('correct_index',question)
            self.assertNotIn('explanation',question)
            self.assertNotIn('answer',question)
        answer_id=quiz['questions'][0]['id']
        status,_,result=self.request(f'/api/quizzes/{quiz_id}/submit','POST',{'answers':{answer_id:0}},{'Cookie':student})
        self.assertEqual(status,200,result)
        self.assertIn('correct_index',result['items'][0])
        self.assertTrue(result['items'][0]['explanation'])

    def test_cors_allows_vite_ports_and_rejects_other_origins(self):
        for origin in ('http://localhost:5173','http://127.0.0.1:5174','http://localhost:5175'):
            status,headers,_=self.request('/api/auth/me','OPTIONS',headers={
                'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'
            })
            self.assertEqual(status,204)
            self.assertEqual(headers.get('Access-Control-Allow-Origin'),origin)
            self.assertEqual(headers.get('Access-Control-Allow-Credentials'),'true')
        status,headers,_=self.request('/api/auth/me','OPTIONS',headers={
            'Origin':'https://untrusted.example','Access-Control-Request-Method':'POST'
        })
        self.assertEqual(status,403)
        self.assertIsNone(headers.get('Access-Control-Allow-Origin'))
        status,headers,_=self.request('/api/auth/me',headers={'Origin':'http://localhost:3000'})
        self.assertEqual(status,200)
        self.assertIsNone(headers.get('Access-Control-Allow-Origin'))
        status,headers,_=self.request('/api/auth/login','POST',{
            'email':'student@studyhub.local','password':'Student123!'
        },{'Origin':'http://127.0.0.1:5174'})
        self.assertEqual(status,200)
        self.assertTrue(headers.get('Set-Cookie','').startswith('studyhub_session='))
        self.assertEqual(headers.get('Access-Control-Allow-Credentials'),'true')

    def test_upload_limit_below_at_and_above_with_json_and_cleanup(self):
        cookie=self.login_cookie('student@studyhub.local','Student123!')
        subjects=json.loads(self.get('/api/subjects')[2])
        subject_id=subjects[0]['id']
        limit=20*1024*1024
        created_paths=[]
        for size in (limit-1,limit,limit+1):
            upload_dir=Path(self.tmp.name) / 'uploads'
            before_files=set(os.listdir(upload_dir))
            connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
            before_rows=connection.execute('SELECT COUNT(*) FROM documents').fetchone()[0]
            connection.close()
            boundary=f'----StudyHubBoundary{size}'
            fields=[
                f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nUpload {size}\r\n'.encode(),
                f'--{boundary}\r\nContent-Disposition: form-data; name="subject_id"\r\n\r\n{subject_id}\r\n'.encode(),
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="limit.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode(),
            ]
            body=b''.join(fields)+b'x'*size+f'\r\n--{boundary}--\r\n'.encode()
            status,headers,response=self.request('/api/upload','POST',body,{
                'Cookie':cookie,'Content-Type':f'multipart/form-data; boundary={boundary}'
            },timeout=120)
            self.assertEqual(headers.get_content_type(),'application/json')
            if size<=limit:
                self.assertEqual(status,201,response)
                connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
                row=connection.execute('SELECT storage_path,file_size FROM documents WHERE id=?',(response['document_id'],)).fetchone()
                connection.close()
                self.assertEqual(row[1],size)
                stored=ROOT / row[0]
                created_paths.append(stored)
                self.addCleanup(lambda path=stored: path.unlink(missing_ok=True))
            else:
                self.assertEqual(status,413,response)
                self.assertIn('20MB',response['error'])
                connection=sqlite3.connect(Path(self.tmp.name) / 'integration.db')
                after_rows=connection.execute('SELECT COUNT(*) FROM documents').fetchone()[0]
                connection.close()
                self.assertEqual(after_rows,before_rows)
                self.assertEqual(set(os.listdir(upload_dir)),before_files)
        for path in created_paths:
            if path.exists(): path.unlink()

if __name__=='__main__': unittest.main()
