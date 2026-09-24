import unittest, urllib.request, urllib.error, json, subprocess, time, os, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Test phải chạy offline: không đọc .env thật của máy.
os.environ['STUDYHUB_NO_DOTENV'] = '1'

for _name in (
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
    'GROQ_API_KEY',
    'STUDYHUB_AI_PROVIDER',
    'STUDYHUB_AI_API_KEY',
    'STUDYHUB_AI_BASE_URL',
    'STUDYHUB_AI_MODEL',
):
    os.environ.pop(_name, None)
class StudyHubSmokeTest(unittest.TestCase):
    """Smoke test for the vanilla ``web/`` preview UI inside the Python API.

    The React frontend is the real UI and ``web/`` is no longer shipped, so the
    suite skips instead of hanging on a server that cannot serve ``/``.
    """

    @classmethod
    def setUpClass(cls):
        if not (ROOT/'web').is_dir():
            raise unittest.SkipTest('vanilla web/ UI is not part of this checkout; React frontend is the UI')
        cls.port=8766
        cls.tmp=tempfile.TemporaryDirectory()
        env=os.environ.copy(); env['STUDYHUB_PORT']=str(cls.port); env['PYTHONUNBUFFERED']='1'
        env['STUDYHUB_DB_MODE'] = 'sqlite'
        env['STUDYHUB_DB_PATH'] = os.path.join(cls.tmp.name, 'smoke.db')

        env.pop('MYSQL_DATABASE', None)

        cls.proc = subprocess.Popen(
           [sys.executable, str(ROOT / 'server.py')],
           cwd=str(ROOT),
           stdout=subprocess.PIPE,
           stderr=subprocess.STDOUT,
           env=env
)      
        deadline=time.time()+5
        while time.time()<deadline:
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{cls.port}/api/subjects',timeout=.4).close(); break
            except Exception: time.sleep(.1)
        else:
            cls.proc.terminate()
            out,_=cls.proc.communicate(timeout=3)
            raise RuntimeError('server did not start: '+(out or b'').decode(errors='replace')[:2000])
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=3); cls.tmp.cleanup()
    def request(self,path,method='GET',data=None,headers=None):
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}'+path,data=data,headers=headers or {},method=method)
        try:
            with urllib.request.urlopen(req) as r: return r.status,r.headers.get('Content-Type',''),r.read()
        except urllib.error.HTTPError as e: return e.code,e.headers.get('Content-Type',''),e.read()
    def test_home(self):
        s,ct,b=self.request('/'); self.assertEqual(s,200); self.assertIn('text/html',ct); self.assertIn(b'StudyHub',b)
    def test_subjects(self):
        s,ct,b=self.request('/api/subjects'); self.assertEqual(s,200); self.assertGreaterEqual(len(json.loads(b)),4)
    def test_documents(self):
        s,ct,b=self.request('/api/documents'); self.assertEqual(s,200); self.assertGreaterEqual(len(json.loads(b)),3)
    def test_static_assets(self):
        for path,ctype in [('/styles.css','text/css'),('/app.js','application/javascript')]:
            s,ct,b=self.request(path); self.assertEqual(s,200); self.assertIn(ctype,ct); self.assertGreater(len(b),100)
    def test_missing_static_is_404(self):
        s,_,_=self.request('/missing.css'); self.assertEqual(s,404)
    def test_login_does_not_expose_password(self):
        payload=json.dumps({'email':'teacher@studyhub.local','password':'Teacher123!'}).encode()
        s,_,b=self.request('/api/login','POST',payload,{'Content-Type':'application/json'}); self.assertEqual(s,200); self.assertNotIn(b'password',b)

if __name__=='__main__': unittest.main(verbosity=2)
