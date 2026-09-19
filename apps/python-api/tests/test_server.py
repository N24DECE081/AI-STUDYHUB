import unittest, urllib.request, urllib.error, json, subprocess, time, os, sys, re

class StudyHubSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port=8766
        env=os.environ.copy(); env['STUDYHUB_PORT']=str(cls.port); env['PYTHONUNBUFFERED']='1'
        cls.proc=subprocess.Popen([sys.executable,'server.py'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        deadline=time.time()+5
        while time.time()<deadline:
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{cls.port}/',timeout=.4).close(); break
            except Exception: time.sleep(.1)
        else:
            out=cls.proc.stdout.read().decode(errors='replace') if cls.proc.stdout else ''
            raise RuntimeError('server did not start: '+out)
    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(timeout=3)
    def request(self,path,method='GET',data=None,headers=None):
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}'+path,data=data,headers=headers or {},method=method)
        try:
            with urllib.request.urlopen(req) as r: return r.status,r.headers.get('Content-Type',''),r.read()
        except urllib.error.HTTPError as e: return e.code,e.headers.get('Content-Type',''),e.read()
    def test_home(self):
        s,ct,b=self.request('/'); self.assertEqual(s,200); self.assertIn('text/html',ct); self.assertIn(b'id="root"',b)
    def test_subjects(self):
        s,ct,b=self.request('/api/subjects'); self.assertEqual(s,200); self.assertGreaterEqual(len(json.loads(b)),4)
    def test_documents(self):
        s,ct,b=self.request('/api/documents'); self.assertEqual(s,200); self.assertGreaterEqual(len(json.loads(b)),3)
    def test_spa_entrypoint_and_assets(self):
        s,ct,b=self.request('/'); self.assertEqual(s,200); self.assertIn('text/html',ct)
        self.assertIn(b'/assets/',b)
        asset=re.search(rb'/assets/[^"\']+\.js',b).group(0)
        s,ct,b=self.request(asset.decode()); self.assertEqual(s,200); self.assertIn('application/javascript',ct); self.assertGreater(len(b),100)
        s,ct,b=self.request('/ai-tutor'); self.assertEqual(s,200); self.assertIn(b'id="root"',b)
    def test_missing_static_is_404(self):
        s,_,_=self.request('/missing.css'); self.assertEqual(s,404)
    def test_login_does_not_expose_password(self):
        payload=json.dumps({'email':'teacher@studyhub.local','password':'Teacher123!'}).encode()
        s,_,b=self.request('/api/login','POST',payload,{'Content-Type':'application/json'}); self.assertEqual(s,200); self.assertNotIn(b'password',b)

if __name__=='__main__': unittest.main(verbosity=2)
