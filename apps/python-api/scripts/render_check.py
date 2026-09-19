import os, subprocess, time, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
shot=ROOT/'docs'/'frontend-home-final.png'
env=os.environ.copy(); env['STUDYHUB_PORT']='8765'
proc=subprocess.Popen(['python',str(ROOT/'run.py')],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
try:
    for _ in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8765/',timeout=1) as r:
                if r.status==200: break
        except Exception: time.sleep(.2)
    subprocess.run(['/usr/bin/chromium','--headless','--no-sandbox','--disable-gpu','--hide-scrollbars',f'--screenshot={shot}','--window-size=1440,1000','http://127.0.0.1:8765/#home'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    print('BROWSER RENDER PASS:',shot)
finally:
    proc.terminate(); proc.wait(timeout=5)
