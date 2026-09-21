#!/usr/bin/env python3
import json, os, re, secrets, sqlite3, hashlib, mimetypes, html, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
from email.parser import BytesParser
from email.policy import default

from backend.app.db.runtime import get_runtime_database
from backend.app.db.seed import seed as seed_database
from backend.app.security import authenticate, register as register_user, current_user, revoke_session, SESSION_COOKIE

ROOT=os.path.dirname(os.path.abspath(__file__)); WEB=os.path.join(ROOT,'web'); UP=os.path.join(ROOT,'uploads')
os.makedirs(UP,exist_ok=True)
if not os.environ.get('MYSQL_DATABASE') and os.environ.get('STUDYHUB_DB_PATH'):
 os.makedirs(os.path.dirname(os.environ['STUDYHUB_DB_PATH']),exist_ok=True)

def db():
 return get_runtime_database().open_connection()

def init_db():
 database=get_runtime_database()
 database.initialize()
 seed_database(database)

def cookie_value(handler, name):
    raw = handler.headers.get('Cookie', '')
    for item in raw.split(';'):
        key, sep, value = item.strip().partition('=')
        if sep and key == name:
            return value
    return None

def user_from(handler):
    token = cookie_value(handler, SESSION_COOKIE)
    with db() as c:
        return current_user(c, token)

def json_body(raw):
    try:
        return json.loads(raw or b'{}')
    except json.JSONDecodeError:
        return None

def require_user(handler):
    user = user_from(handler)
    if not user:
        handler.json({'error':'Bạn cần đăng nhập'},401)
        return None
    return user

def session_cookie(token, max_age=7 * 24 * 60 * 60):
    return f'{SESSION_COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax'

def demo_transaction_code(conn):
  stamp = time.strftime('%Y%m%d')
  for _ in range(10):
    code = f'DEMO-{stamp}-{secrets.token_hex(3).upper()[:5]}'
    if not conn.execute('SELECT 1 FROM demo_transactions WHERE transaction_code=?', (code,)).fetchone():
      return code
  raise sqlite3.IntegrityError('could not create a unique demo transaction code')

class H(BaseHTTPRequestHandler):
 server_version='StudyHub/1.0'
 def send(self,status=200,body=b'',ctype='application/json',headers=None):
  self.send_response(status); self.send_header('Content-Type',ctype); self.send_header('Cache-Control','no-store');
  if headers:
   for k,v in headers.items(): self.send_header(k,v)
  self.end_headers(); self.wfile.write(body)
 def json(self,obj,status=200,headers=None): self.send(status,json.dumps(obj,ensure_ascii=False).encode(),headers=headers)
 def body(self):
  n=int(self.headers.get('Content-Length','0')); return self.rfile.read(n)
 def do_GET(self):
  p=urlparse(self.path); path=p.path
  if path in ('/api/me','/api/auth/me'): return self.json({'user':user_from(self)})
  if path=='/api/subjects':
    c=db(); rows=[dict(r) for r in c.execute('SELECT * FROM subjects ORDER BY name')]; c.close(); return self.json(rows)
  if path=='/api/subscription':
   u=require_user(self)
   if not u:return
   with db() as c:
    active=c.execute('SELECT s.status,p.name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status=? ORDER BY s.id DESC LIMIT 1',(u['id'],'active')).fetchone()
    scheduled=c.execute('SELECT p.name,sc.billing_cycle,sc.effective_at FROM subscription_changes sc JOIN plans p ON p.id=sc.target_plan_id WHERE sc.user_id=? AND sc.status=? ORDER BY sc.id DESC LIMIT 1',(u['id'],'scheduled')).fetchone()
   codes={'free':'free','standard':'plus','plus':'plus','premium':'pro','pro':'pro'}
   current=dict(active) if active else {'name':'Free','status':'active'}
   change={'plan':codes.get(str(scheduled['name']).lower(),'free'),'billing_cycle':scheduled['billing_cycle'],'effective_at':scheduled['effective_at']} if scheduled else None
   return self.json({'plan':codes.get(str(current['name']).lower(),'free'),'status':current['status'],'billing_cycle':'month','scheduled_change':change})
  if path=='/api/documents':
    qs=parse_qs(p.query); q=qs.get('q',[''])[0]; sub=qs.get('subject',[''])[0]; c=db(); sql='SELECT d.*, d.original_filename AS file_name, d.storage_path AS file_path, d.uploaded_by AS uploader_id, s.code subject_code,s.name subject_name,u.full_name AS uploader FROM documents d JOIN subjects s ON s.id=d.subject_id JOIN users u ON u.id=d.uploaded_by WHERE 1=1'; args=[]
    if q: sql+=' AND (d.title LIKE ? OR d.description LIKE ?)'; args += [f'%{q}%',f'%{q}%']
    if sub: sql+=' AND s.code=?'; args.append(sub)
    sql+=' ORDER BY d.created_at DESC'; rows=[dict(r) for r in c.execute(sql,args)]; c.close(); return self.json(rows)
  if path=='/api/courses':
    qs=parse_qs(p.query); subject=qs.get('subject',[''])[0]; c=db(); sql='SELECT c.*, s.code subject_code,s.name subject_name,u.full_name AS creator FROM courses c JOIN subjects s ON s.id=c.subject_id JOIN users u ON u.id=c.created_by WHERE c.status != ?'; args=['archived']
    if subject: sql+=' AND s.code=?'; args.append(subject)
    sql+=' ORDER BY c.created_at DESC'; rows=[dict(r) for r in c.execute(sql,args)]; c.close(); return self.json(rows)
  if path=='/api/progress':
    u=require_user(self)
    if not u:return
    with db() as c:
     rows=[dict(r) for r in c.execute('''SELECT p.*, c.title course_title, c.subject_id, s.code subject_code, d.title document_title
        FROM user_progress p LEFT JOIN courses c ON c.id=p.course_id LEFT JOIN subjects s ON s.id=c.subject_id
        LEFT JOIN documents d ON d.id=p.document_id WHERE p.user_id=? ORDER BY p.updated_at DESC''',(u['id'],))]
    return self.json({'items':rows,'summary':{'count':len(rows),'completed':sum(1 for row in rows if row['completed'])}})
  m=re.fullmatch(r'/api/documents/(\d+)',path)
  if m:
    c=db(); r=c.execute('SELECT d.*, d.original_filename AS file_name, d.storage_path AS file_path, d.uploaded_by AS uploader_id, s.code subject_code,s.name subject_name,u.full_name AS uploader FROM documents d JOIN subjects s ON s.id=d.subject_id JOIN users u ON u.id=d.uploaded_by WHERE d.id=?',(m.group(1),)).fetchone(); c.close(); return self.json(dict(r) if r else {'error':'not found'},200 if r else 404)
  m=re.fullmatch(r'/view/(\d+)',path)
  if m:
   c=db(); r=c.execute('SELECT * FROM documents WHERE id=?',(m.group(1),)).fetchone()
   if not r or not r['storage_path']: c.close(); return self.json({'error':'document has no physical file'},404)
   fp=os.path.normpath(r['storage_path'] if os.path.isabs(r['storage_path']) else os.path.join(ROOT,r['storage_path']))
   if not os.path.exists(fp): c.close(); return self.json({'error':'file missing'},404)
   c.close()
   ext=os.path.splitext(r['original_filename'])[1].lower()
   if ext not in ('.txt','.md','.csv','.log'):
    return self.send(302,b'',headers={'Location':f'/download/{r["id"]}?view=1'})
   content=html.escape(open(fp,'r',encoding='utf-8',errors='replace').read())
   page=f'''<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(r["original_filename"])}</title><style>body{{margin:0;background:#f4f6f8;color:#18212b;font:16px/1.75 "Segoe UI",Arial,sans-serif}}main{{max-width:920px;margin:40px auto;padding:32px 40px;background:#fff;border:1px solid #dfe4ea;border-radius:12px;box-shadow:0 12px 35px #17203318}}h1{{margin:0 0 22px;font-size:24px}}pre{{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.8 "Cascadia Code","Segoe UI",monospace}}@media(max-width:600px){{main{{margin:0;border:0;border-radius:0;padding:22px}}}}</style></head><body><main><h1>{html.escape(r["original_filename"])}</h1><pre>{content}</pre></main></body></html>'''
   return self.send(200,page.encode('utf-8'),'text/html; charset=utf-8')
  m=re.fullmatch(r'/download/(\d+)',path)
  if m:
    view=parse_qs(p.query).get('view',['0'])[0]=='1'
    c=db(); r=c.execute('SELECT * FROM documents WHERE id=?',(m.group(1),)).fetchone();
    if not r or not r['storage_path']: c.close(); return self.json({'error':'document has no physical file'},404)
    rel=r['storage_path']; fp=os.path.normpath(rel if os.path.isabs(rel) else os.path.join(ROOT, rel))
    try: inside = os.path.commonpath([ROOT, fp]) == ROOT
    except ValueError: inside = False
    if not inside: c.close(); return self.json({'error':'invalid file path'},400)
    if not os.path.exists(fp): c.close(); return self.json({'error':'file missing'},404)
    if not view:
     c.execute('UPDATE documents SET downloads=downloads+1 WHERE id=?',(m.group(1),)); c.commit()
    c.close(); data=open(fp,'rb').read(); disposition='inline' if view else 'attachment'; fallback=re.sub(r'[^A-Za-z0-9._-]','_',r['original_filename']) or 'download'; encoded=quote(r['original_filename'],safe=''); return self.send(200,data,mimetypes.guess_type(fp)[0] or 'application/octet-stream',{'Content-Disposition':f'{disposition}; filename="{fallback}"; filename*=UTF-8\'\'{encoded}'})
  if path.startswith('/api/'):
    return self.json({'error':'not found'},404)
  fp=os.path.join(WEB,'index.html' if path=='/' else path.lstrip('/'))
  if not os.path.isfile(fp): return self.json({'error':'not found'},404)
  ext=os.path.splitext(fp)[1]; ct={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'}.get(ext,'application/octet-stream'); return self.send(200,open(fp,'rb').read(),ct)
 def do_POST(self):
  p=urlparse(self.path); path=p.path; data=self.body();
  if path in ('/api/login','/api/auth/login'):
   try:
    x=json.loads(data or '{}')
   except json.JSONDecodeError:
    return self.json({'error':'Dữ liệu đăng nhập không hợp lệ'},400)
   email=x.get('email','')
   password=x.get('password','')
   if not isinstance(email,str) or not isinstance(password,str) or not email.strip() or not password:
    return self.json({'error':'Vui lòng nhập email và mật khẩu'},400)
   with db() as c:
    result, error = authenticate(c, email, password)
   if error:
    return self.json({'error':error},403 if error == 'Tài khoản đang bị khóa' else 401)
   user, token, expires_at = result
   return self.json({'user':user,'expires_at':expires_at},200,{'Set-Cookie':session_cookie(token)})
  if path in ('/api/logout','/api/auth/logout'):
   token=cookie_value(self, SESSION_COOKIE)
   with db() as c:
    revoke_session(c, token)
   return self.json({'ok':True},200,{'Set-Cookie':session_cookie('',0)})
  if path in ('/api/register','/api/auth/register'):
   try:
    x=json.loads(data or '{}')
   except json.JSONDecodeError:
    return self.json({'error':'Dữ liệu đăng ký không hợp lệ'},400)
   name=x.get('name',''); email=x.get('email',''); pw=x.get('password','')
   if not all(isinstance(v,str) for v in (name,email,pw)):
    return self.json({'error':'Dữ liệu đăng ký không hợp lệ'},400)
   with db() as c:
    try:
     result, error = register_user(c, name, email, pw)
    except sqlite3.IntegrityError:
     result, error = None, 'Email đã tồn tại'
   if error:
    return self.json({'error':error},400)
   user, token, expires_at = result
   return self.json({'ok':True,'user':user,'expires_at':expires_at},201,{'Set-Cookie':session_cookie(token)})
  if path in ('/api/payment/demo', '/api/subscription/checkout'):
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'invalid checkout data'},400)
   target_code=str(x.get('plan','')).lower(); cycle=str(x.get('billing_cycle','month')).lower(); method=str(x.get('payment_method','demo')).lower()
   if target_code not in ('free','plus','pro') or cycle not in ('month','year') or method != 'demo':
    return self.json({'error':'invalid checkout selection'},400)
   names={'free':('free',),'plus':('plus','standard'),'pro':('pro','premium')}; ranks={'free':0,'plus':1,'pro':2}
   with db() as c:
    plans=[dict(row) for row in c.execute('SELECT id,name,price_monthly,price_yearly FROM plans WHERE status=?',('active',)).fetchall()]
    by_code={code:next((plan for plan in plans if str(plan['name']).lower() in aliases),None) for code,aliases in names.items()}
    target=by_code[target_code]
    if not target:return self.json({'error':'selected plan is unavailable'},400)
    active=c.execute('SELECT s.id,p.name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status=? ORDER BY s.id DESC LIMIT 1',(u['id'],'active')).fetchone()
    current_code=next((code for code,aliases in names.items() if active and str(active['name']).lower() in aliases),'free')
    if current_code==target_code:return self.json({'error':'this is already your current plan'},409)
    c.execute('UPDATE subscription_changes SET status=? WHERE user_id=? AND status=?',('cancelled',u['id'],'scheduled'))
    if ranks[target_code] < ranks[current_code]:
     c.execute('INSERT INTO subscription_changes(user_id,target_plan_id,billing_cycle,status,effective_at) VALUES(?,?,?,?,datetime(\'now\',\'+1 month\'))',(u['id'],target['id'],cycle,'scheduled'))
     c.commit()
     return self.json({'plan':current_code,'status':'active','scheduled_change':{'plan':target_code,'billing_cycle':cycle},'change_type':'downgrade_scheduled'})
    pending=c.execute("SELECT transaction_code FROM demo_transactions WHERE user_id=? AND status='PENDING'",(u['id'],)).fetchone()
    if pending:return self.json({'error':'another demo payment is already processing'},409)
    amount=target['price_yearly'] if cycle == 'year' else target['price_monthly']
    transaction_code=demo_transaction_code(c)
    c.execute('INSERT INTO demo_transactions(user_id,plan,amount,status,payment_method,transaction_code) VALUES(?,?,?,?,?,?)',(u['id'],target_code,amount,'PENDING','DEMO',transaction_code))
    c.execute('UPDATE demo_transactions SET status=? WHERE transaction_code=?',('SUCCESS',transaction_code))
    if active:c.execute('UPDATE subscriptions SET status=? WHERE id=?',('expired',active['id']))
    c.execute('INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,?)',(u['id'],target['id'],'active')); c.commit()
   return self.json({'plan':target_code,'status':'active','billing_cycle':cycle,'scheduled_change':None,'change_type':'upgrade_applied','payment_status':'SUCCESS','amount':amount,'payment_method':'DEMO','transaction_code':transaction_code})
  if path=='/api/subscription/cancel':
   u=require_user(self)
   if not u:return
   with db() as c:
    free=c.execute('SELECT id FROM plans WHERE lower(name)=? AND status=?',('free','active')).fetchone()
    active=c.execute('SELECT s.id,p.name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status=? ORDER BY s.id DESC LIMIT 1',(u['id'],'active')).fetchone()
    if not active or str(active['name']).lower()=='free':return self.json({'error':'no paid subscription to cancel'},409)
    c.execute('UPDATE subscription_changes SET status=? WHERE user_id=? AND status=?',('cancelled',u['id'],'scheduled'))
    c.execute('INSERT INTO subscription_changes(user_id,target_plan_id,billing_cycle,status,effective_at) VALUES(?,?,?,?,datetime(\'now\',\'+1 month\'))',(u['id'],free['id'],'month','scheduled')); c.commit()
   return self.json({'ok':True,'change_type':'cancellation_scheduled','scheduled_change':{'plan':'free'}})
  if path=='/api/courses':
    u=require_user(self)
    if not u:return
    if u['role'] not in ('teacher','admin'): return self.json({'error':'Chỉ Teacher/Admin mới có quyền tạo course'},403)
    x=json_body(data)
    if not isinstance(x,dict): return self.json({'error':'Dữ liệu course không hợp lệ'},400)
    title=x.get('title',''); description=x.get('description',''); sid=x.get('subject_id',''); status=x.get('status','published')
    if not all(isinstance(v,str) for v in (title,description)) or not title.strip(): return self.json({'error':'Tiêu đề course là bắt buộc'},400)
    try: subject_id=int(sid)
    except (TypeError,ValueError): return self.json({'error':'Môn học không hợp lệ'},400)
    if status not in ('draft','published'): return self.json({'error':'Trạng thái course không hợp lệ'},400)
    with db() as c:
     subject=c.execute('SELECT id FROM subjects WHERE id=?',(subject_id,)).fetchone()
     if not subject:return self.json({'error':'Môn học không tồn tại'},400)
     cur=c.execute('INSERT INTO courses(subject_id,created_by,title,description,status) VALUES(?,?,?,?,?)',(subject_id,u['id'],title.strip(),description.strip(),status)); course_id=cur.lastrowid; c.commit()
     row=c.execute('''SELECT c.*, s.code subject_code,s.name subject_name,u.full_name AS creator FROM courses c JOIN subjects s ON s.id=c.subject_id JOIN users u ON u.id=c.created_by WHERE c.id=?''',(course_id,)).fetchone()
    return self.json(dict(row),201)
  if path=='/api/progress':
     u=require_user(self)
     if not u:return
     x=json_body(data)
     if not isinstance(x,dict): return self.json({'error':'Dữ liệu tiến độ không hợp lệ'},400)
     course_id=x.get('course_id'); document_id=x.get('document_id'); value=x.get('progress_percent',0); position=x.get('last_position',0); completed=x.get('completed',False)
     if (course_id is None)==(document_id is None): return self.json({'error':'Cần chọn course hoặc document'},400)
     try:
      progress=int(value); last_position=int(position)
     except (TypeError,ValueError): return self.json({'error':'Tiến độ không hợp lệ'},400)
     if not 0 <= progress <= 100 or last_position < 0: return self.json({'error':'Tiến độ phải từ 0 đến 100'},400)
     completed=bool(completed)
     if completed and progress != 100: return self.json({'error':'Mục đã hoàn thành phải đạt 100%'},400)
     with db() as c:
      target='course_id' if course_id is not None else 'document_id'
      raw_id=course_id if course_id is not None else document_id
      try: raw_id=int(raw_id)
      except (TypeError,ValueError): return self.json({'error':'Đối tượng học không hợp lệ'},400)
      table='courses' if target=='course_id' else 'documents'
      if not c.execute(f'SELECT id FROM {table} WHERE id=?',(raw_id,)).fetchone(): return self.json({'error':'Đối tượng học không tồn tại'},404)
      existing=c.execute(f'SELECT id FROM user_progress WHERE user_id=? AND {target}=?',(u['id'],raw_id)).fetchone()
      if existing:
       c.execute('UPDATE user_progress SET progress_percent=?,last_position=?,completed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(progress,last_position,int(completed),existing['id']))
       progress_id=existing['id']
      else:
        progress_id=c.execute(f'INSERT INTO user_progress(user_id,{target},progress_percent,last_position,completed) VALUES(?,?,?,?,?)',(u['id'],raw_id,progress,last_position,int(completed))).lastrowid
      c.commit(); row=c.execute('SELECT * FROM user_progress WHERE id=?',(progress_id,)).fetchone()
     return self.json(dict(row),200)
  if path in ('/api/ai/chat','/api/chat','/api/ai-tutor/chat'):
   u=require_user(self)
   if not u:return
   x=json_body(data)
   tutor_contract=path=='/api/ai-tutor/chat'
   question=(x.get('message','') if tutor_contract else x.get('question','')).strip() if isinstance(x,dict) else ''
   document_id=x.get('document_id') if isinstance(x,dict) else None
   if tutor_contract:
    file_ids=x.get('file_ids',[])
    if isinstance(file_ids,list) and file_ids:
     document_id=file_ids[0]
    conversation_id=str(x.get('conversation_id') or secrets.token_hex(16))
    mode=str(x.get('mode') or 'explain').lower()
    if mode not in ('explain','solve','hint','summarize','generate_quiz'):
     return self.json({'error':'invalid tutor mode'},400)
   if not question:return self.json({'error':'Câu hỏi không được để trống'},400)
   with db() as c:
    if document_id:
     try: document_id=int(document_id)
     except (TypeError,ValueError): return self.json({'error':'invalid document id'},400)
     rows=c.execute('SELECT id,title,description,storage_path FROM documents WHERE id=?',(document_id,)).fetchall()
     if not rows:return self.json({'error':'document not found'},404)
    else:
     rows=c.execute('SELECT id,title,description,storage_path FROM documents ORDER BY created_at DESC').fetchall()
    tokens=[token.lower() for token in re.findall(r'\w+',question) if len(token)>2]
    matches=[]
    for row in rows:
     fp=row['storage_path'] if os.path.isabs(row['storage_path']) else os.path.join(ROOT,row['storage_path'])
     text=''
     if os.path.exists(fp) and os.path.splitext(fp)[1].lower() in ('.txt','.md','.csv','.log'):
      text=open(fp,'r',encoding='utf-8',errors='replace').read()
     haystack=(row['title']+' '+(row['description'] or '')+' '+text).lower()
     score=sum(haystack.count(token) for token in tokens)
     if score: matches.append((score,row,text))
    matches.sort(key=lambda item:item[0],reverse=True)
    selected=matches[:3]
    if selected:
     excerpts=[]
     for _,row,text in selected:
      source=text or row['description'] or row['title']
      excerpts.append(f"{row['title']}: {source[:700].strip()}")
     answer='\n\n'.join(excerpts)
     sources=[{'id':row['id'],'title':row['title']} for _,row,_ in selected]
    else:
     answer='Chưa tìm thấy đoạn nội dung phù hợp trong tài liệu đã lưu. Hãy thử câu hỏi cụ thể hơn hoặc chọn một tài liệu text.'
     sources=[]
    session_id=c.execute('INSERT INTO chat_sessions(user_id,document_id,title) VALUES(?,?,?)',(u['id'],document_id,'AI Tutor')).lastrowid
    c.execute('INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)',(session_id,'user',question))
    c.execute('INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)',(session_id,'assistant',answer)); c.commit()
   if tutor_contract:
    return self.json({'conversation_id':conversation_id,'message_id':str(session_id),'role':'assistant','content':answer},200)
   return self.json({'answer':answer,'sources':sources,'session_id':session_id,'mode':'local-rag'},200)
  if path=='/api/upload':
   u=user_from(self)
   if not u: return self.json({'error':'Bạn cần đăng nhập để upload tài liệu'},401)
   ctype=self.headers.get('Content-Type',''); m=re.search(r'boundary=(.+)',ctype)
   if not m:return self.json({'error':'multipart form required'},400)
   msg=BytesParser(policy=default).parsebytes(b'Content-Type: '+ctype.encode()+b'\r\n\r\n'+data)
   fields={}; filepart=None
   for part in msg.iter_parts():
    disp=part.get('Content-Disposition',''); name=re.search(r'name="([^"]+)"',disp); filename=re.search(r'filename="([^"]*)"',disp)
    if not name:continue
    if filename and filename.group(1): filepart=(filename.group(1),part.get_payload(decode=True) or b'')
    else: fields[name.group(1)]=(part.get_payload(decode=True) or b'').decode(errors='ignore')
   if not filepart:return self.json({'error':'Chưa chọn file'},400)
   title=fields.get('title','').strip(); sid=fields.get('subject_id','')
   if not title or not sid:return self.json({'error':'Thiếu tiêu đề hoặc môn học'},400)
   try:
    subject_id=int(sid)
   except ValueError:
    return self.json({'error':'Môn học không hợp lệ'},400)
   c=db(); subject=c.execute('SELECT id FROM subjects WHERE id=?',(subject_id,)).fetchone()
   if not subject:
    c.close(); return self.json({'error':'Môn học không tồn tại'},400)
   safe=re.sub(r'[^A-Za-z0-9._-]','_',filepart[0]); stored=f'{secrets.token_hex(8)}_{safe}'
   target=os.path.join(UP,stored)
   with open(target,'wb') as fh: fh.write(filepart[1])
   ext=os.path.splitext(filepart[0])[1].lower().lstrip('.') or 'unknown'
  mime={'.pdf':'application/pdf','.txt':'text/plain','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'}.get(os.path.splitext(filepart[0])[1].lower(),'application/octet-stream')
  document_id=c.execute('INSERT INTO documents(title,description,original_filename,storage_filename,file_type,mime_type,file_size,storage_path,status,subject_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(title,fields.get('description',''),filepart[0],stored,ext,mime,len(filepart[1]),os.path.join('uploads',stored),'ready',subject_id,u['id'])).lastrowid
  c.commit(); c.close(); return self.json({'ok':True,'document_id':document_id,'status':'ready'},201)
  return self.json({'error':'not found'},404)

class StudyHubHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True

def main():
    init_db()
    port=int(os.environ.get('STUDYHUB_PORT','5000'))
    print(f'StudyHub running at http://127.0.0.1:{port}')
    with StudyHubHTTPServer(('127.0.0.1', port), H) as server:
        server.serve_forever()
if __name__=='__main__':main()
