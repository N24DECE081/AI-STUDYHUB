import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ApiGatewayIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 8767
        cls.tmp = tempfile.TemporaryDirectory()
        env = os.environ.copy()
        env.update({
            'STUDYHUB_PORT': str(cls.port),
            'STUDYHUB_DB_PATH': str(Path(cls.tmp.name) / 'gateway.db'),
            'STUDYHUB_DB_MODE': 'sqlite',
            'STUDYHUB_API_RATE_LIMIT_PER_MINUTE': '1',
            'STUDYHUB_API_BURST': '2',
            'STUDYHUB_AUTH_RATE_LIMIT_PER_MINUTE': '1',
            'STUDYHUB_AUTH_BURST': '1',
        })
        env.pop('MYSQL_DATABASE', None)
        cls.proc = subprocess.Popen([sys.executable, str(ROOT / 'run.py')], cwd=ROOT, env=env,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        deadline = time.time() + 8
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{cls.port}/', timeout=0.5):
                    break
            except Exception:
                if cls.proc.poll() is not None:
                    raise RuntimeError('API gateway test server stopped during startup')
                time.sleep(0.1)
        else:
            raise RuntimeError('API gateway test server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        cls.tmp.cleanup()

    def api_get(self):
        req = urllib.request.Request(f'http://127.0.0.1:{self.port}/api/me')
        try:
            with urllib.request.urlopen(req, timeout=2) as response:
                return response.status, response.headers, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, error.headers, json.loads(error.read())

    def test_excess_api_requests_get_json_429_and_retry_after(self):
        self.assertEqual(self.api_get()[0], 200)
        self.assertEqual(self.api_get()[0], 200)
        status, headers, payload = self.api_get()
        self.assertEqual(status, 429)
        self.assertEqual(payload['code'], 'rate_limited')
        self.assertGreaterEqual(int(headers['Retry-After']), 1)
        self.assertEqual(headers['X-RateLimit-Remaining'], '0')


if __name__ == '__main__':
    unittest.main()
