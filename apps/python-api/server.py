#!/usr/bin/env python3
import json, os, re, secrets, sqlite3, hashlib, mimetypes, html
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
import unicodedata
from email.parser import BytesParser
from email.policy import default

from backend.app.db.runtime import get_runtime_database
from backend.app.db.seed import seed as seed_database
from backend.app.security import authenticate, register as register_user, current_user, revoke_session, SESSION_COOKIE
from backend.app.ai_tutor import (
    EngineError as TutorEngineError,
    GradingError as TutorGradingError,
    RoadmapError as TutorRoadmapError,
    adapt as adapt_roadmap,
    build_assessment_questions,
    build_exercises,
    build_roadmap,
    get_engine,
    grade_exercise,
    start_assessment,
    summarize_answers,
)
from backend.app.ai_tutor import config as tutor_config
from backend.app.ai_tutor import engine as tutor_engine
from backend.app.ai_tutor import repository as tutor_store
from backend.app.ai_tutor.roadmap import normalize_level, normalize_pace

tutor_config.load_env()

ROOT=os.path.dirname(os.path.abspath(__file__)); WEB=os.path.join(ROOT,'web'); UP=os.path.join(ROOT,'uploads')
MAX_UPLOAD_BYTES=20 * 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS={'.pdf','.txt','.md','.csv','.doc','.docx','.ppt','.pptx'}
os.makedirs(UP,exist_ok=True)
if not os.environ.get('MYSQL_DATABASE') and os.environ.get('STUDYHUB_DB_PATH'):
 os.makedirs(os.path.dirname(os.environ['STUDYHUB_DB_PATH']),exist_ok=True)

def db():
 return get_runtime_database().open_connection()

def init_db():
 database=get_runtime_database()
 database.initialize()
 with database.connect() as connection:
  has_users=connection.execute('SELECT 1 FROM users LIMIT 1').fetchone()
 if not has_users:
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

def document_text(row):
    path=row['storage_path']
    fp=path if os.path.isabs(path) else os.path.join(ROOT,path)
    if os.path.exists(fp) and os.path.splitext(fp)[1].lower() in ('.txt','.md','.csv','.log'):
        return open(fp,'r',encoding='utf-8',errors='replace').read()
    return ''

def tutor_context(file_ids, question, limit=3, fallback=False):
    """Retrieve the document context server-side; the client never sends answers.

    `fallback` is for requests about the library itself (summarize / quiz with no
    topic words): there the newest documents are the intended material, not an
    unrelated guess, so no fake context is created.
    """
    tokens=[token.lower() for token in re.findall(r'\w+',question) if len(token)>2]
    with db() as c:
        ids=[]
        for raw in (file_ids or [])[:5]:
            try: ids.append(int(raw))
            except (TypeError,ValueError): continue
        if ids:
            marks=','.join('?' for _ in ids)
            rows=c.execute(f'SELECT id,title,description,storage_path FROM documents WHERE id IN ({marks})',ids).fetchall()
        else:
            rows=c.execute('SELECT id,title,description,storage_path FROM documents ORDER BY created_at DESC').fetchall()
    scored=[]
    for row in rows:
        text=document_text(row)
        haystack=(row['title']+' '+(row['description'] or '')+' '+text).lower()
        scored.append((sum(haystack.count(token) for token in tokens),row,text))
    scored.sort(key=lambda item:item[0],reverse=True)
    matched=[item for item in scored if item[0]>0][:limit]
    if matched:
        picked=matched
    elif ids or fallback:
        picked=scored[:limit]
    else:
        picked=[]
    parts=[]; sources=[]
    for _,row,text in picked:
        source=text or row['description'] or row['title']
        # One titled block per document: paragraphs stay inside it (blank lines
        # separate documents, not paragraphs), so every quote keeps its source.
        body=re.sub(r'\n\s*\n+','\n',source[:1200].strip())
        parts.append(f"{row['title']}: {body}")
        sources.append({'id':row['id'],'title':row['title']})
    return '\n\n'.join(parts), sources

def chat_quiz(engine, topic, context):
    """Sinh quiz trắc nghiệm CÓ CẤU TRÚC để UI render thành câu hỏi bấm chọn được.

    Có model thì model đặt câu hỏi từ tài liệu; không có model (hết quota, mất mạng)
    thì bản offline chắt câu hỏi và đáp án từ chính tài liệu — không bịa. Trả (None, '')
    khi không dựng được quiz, để route rơi về câu trả lời dạng văn bản.
    """
    try:
        data=engine.complete_json(task='quiz',payload={'topic':topic,'context':context[:6000],'question_count':4})
    except Exception:
        return None,''
    if not isinstance(data,dict): return None,''
    questions=[]
    for item in (data.get('questions') or [])[:5]:
        if not isinstance(item,dict): continue
        prompt=str(item.get('question') or '').strip()
        options=[str(option).strip() for option in (item.get('options') or []) if str(option).strip()]
        if not prompt or len(options)<2: continue
        try: answer_index=int(item.get('answer_index') or 0)
        except (TypeError,ValueError): continue
        if not 0<=answer_index<len(options): continue
        options=options[:4]
        if answer_index>=len(options): continue
        try: max_score=int(item.get('max_score') or 10)
        except (TypeError,ValueError): max_score=10
        questions.append({'question':prompt[:400],'options':options,'answer_index':answer_index,
                          'max_score':max(1,min(max_score,100))})
    if not questions: return None,''
    title=str(data.get('topic') or topic or 'Tài liệu của bạn').strip()[:120]
    return {'topic':title,'questions':questions},title

def public_roadmap(row, exercises, progress):
    payload=row.get('payload') or {}
    if not isinstance(payload,dict): payload={}
    by_lesson={}
    for item in exercises:
        by_lesson.setdefault(str(item.get('lesson_key') or ''),[]).append(str(item.get('id')))
    for module in payload.get('modules') or []:
        for lesson in module.get('lessons') or []:
            lesson['exercise_ids']=by_lesson.get(str(lesson.get('key')),[])
    return {
        'roadmap_id': str(row.get('id')),
        'title': payload.get('title') or row.get('title'),
        'summary': payload.get('summary') or row.get('summary') or '',
        'subject': payload.get('subject') or row.get('subject'),
        'goal': payload.get('goal') or row.get('goal'),
        'current_level': payload.get('current_level') or row.get('difficulty'),
        'target_level': payload.get('target_level') or row.get('difficulty'),
        'pace': payload.get('pace') or 'steady',
        'topics': payload.get('topics') or [],
        'modules': payload.get('modules') or [],
        'focus_weaknesses': payload.get('focus_weaknesses') or [],
        'adaptation_note': payload.get('adaptation_note') or row.get('adaptation_note'),
        'average_score': payload.get('average_score'),
        'version': row.get('version') or 1,
        'exercises': [tutor_store.to_public(item) for item in exercises],
        'progress': progress,
    }

def public_submission(row):
    def load(value):
        try: return json.loads(value) if value else []
        except (TypeError,ValueError): return []
    return {
        'submission_id': str(row.get('id')),
        'exercise_id': str(row.get('exercise_id')),
        'exercise_type': row.get('exercise_type'),
        'topic': row.get('topic'),
        'difficulty': row.get('difficulty'),
        'answer': row.get('answer'),
        'answer_type': row.get('answer_type'),
        'score': row.get('score'),
        'max_score': row.get('max_score'),
        'percentage': row.get('percentage'),
        'grade': row.get('grade'),
        'is_correct': bool(row.get('is_correct')),
        'feedback': row.get('feedback'),
        'strengths': load(row.get('strengths')),
        'weaknesses': load(row.get('weaknesses')),
        'missing_points': load(row.get('missing_points')),
        'suggested_answer': row.get('suggested_answer'),
        'recommended_review': load(row.get('recommended_review')),
        'created_at': row.get('created_at'),
    }

class H(BaseHTTPRequestHandler):
 server_version='StudyHub/1.0'
 def cors_headers(self):
  """Echo lại Origin nếu được phép (mặc định chỉ Vite dev); '*' cho phép tất cả."""
  allowed=[item.strip() for item in os.environ.get('STUDYHUB_CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173').split(',') if item.strip()]
  origin=self.headers.get('Origin','')
  if origin and (origin in allowed or '*' in allowed):
   self.send_header('Access-Control-Allow-Origin',origin)
  elif '*' in allowed:
   self.send_header('Access-Control-Allow-Origin','*')
  else:
   self.send_header('Access-Control-Allow-Origin',allowed[0] if allowed else 'http://localhost:5173')
  self.send_header('Vary','Origin')
  self.send_header('Access-Control-Allow-Credentials','true')
 def send(self,status=200,body=b'',ctype='application/json',headers=None):
  self.send_response(status); self.send_header('Content-Type',ctype); self.send_header('Cache-Control','no-store');
  self.cors_headers()
  if headers:
   for k,v in headers.items(): self.send_header(k,v)
  self.end_headers(); self.wfile.write(body)
 def json(self,obj,status=200,headers=None): self.send(status,json.dumps(obj,ensure_ascii=False).encode(),headers=headers)
 def body(self):
  n=int(self.headers.get('Content-Length','0')); return self.rfile.read(n)
 def do_OPTIONS(self):
    self.send_response(204)
    self.cors_headers()
    self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    self.end_headers()
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
  if path=='/api/streak':
    u=require_user(self)
    if not u:return
    with db() as c:
     row=c.execute('SELECT current_streak,last_activity_date,recovery_count FROM user_streaks WHERE user_id=?',(u['id'],)).fetchone()
    return self.json(dict(row) if row else {'current_streak':0,'last_activity_date':None,'recovery_count':0})
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
  if path=='/api/ai-tutor/engine':
   u=require_user(self)
   if not u:return
   status=tutor_config.engine_status()
   health=tutor_engine.PROVIDER_HEALTH
   if status.get('engine')=='provider' and not health.get('ok',True):
    # Mô hình đang lỗi (hết quota, key sai, mạng): Nova tự trả lời từ tài liệu.
    reason=health.get('reason') or 'không rõ nguyên nhân'
    status['degraded']=True
    status['degraded_reason']=reason
    status['label']=f'{status["label"]} — tạm lỗi: {reason}'
    status['hint']='Nova đang trả lời từ tài liệu của bạn cho tới khi mô hình hoạt động lại.'
   return self.json(status,200)
  if path=='/api/ai-tutor/assessment':
   u=require_user(self)
   if not u:return
   with db() as c:
    row=tutor_store.latest_assessment(c,u['id'])
   plan=start_assessment({})
   return self.json({'questions':plan['questions'],'assessment':tutor_store.to_public_assessment(row)},200)
  if path=='/api/ai-tutor/roadmap':
   u=require_user(self)
   if not u:return
   with db() as c:
    row=tutor_store.latest_roadmap(c,u['id'])
    if not row:
     return self.json({'roadmap_id':None,'modules':[],'exercises':[],
       'progress':{'total_exercises':0,'graded':0,'average_percentage':0,'completed':False}},200)
    rows=tutor_store.exercises_for_roadmap(c,row['id'])
    progress=tutor_store.progress_for_roadmap(c,row['id'],u['id'])
   return self.json(public_roadmap(row,rows,progress),200)
  if path=='/api/ai-tutor/exercises':
   u=require_user(self)
   if not u:return
   with db() as c:
    row=tutor_store.latest_roadmap(c,u['id'])
    if not row:
     return self.json({'roadmap_id':None,'exercises':[],
       'progress':{'total_exercises':0,'graded':0,'average_percentage':0,'completed':False}},200)
    rows=tutor_store.exercises_for_roadmap(c,row['id'])
    progress=tutor_store.progress_for_roadmap(c,row['id'],u['id'])
   return self.json({'roadmap_id':str(row['id']),'exercises':[tutor_store.to_public(item) for item in rows],
     'progress':progress},200)
  if path=='/api/ai-tutor/submissions':
   u=require_user(self)
   if not u:return
   with db() as c:
    items=tutor_store.recent_submissions(c,u['id'],20)
   return self.json({'items':[public_submission(item) for item in items]},200)
  if path=='/api/ai-tutor/conversations':
   u=require_user(self)
   if not u:return
   with db() as c:
    conversations=tutor_store.conversations_for(c,u['id'])
   return self.json({'conversations':conversations},200)
  if path.startswith('/api/'):
    return self.json({'error':'not found'},404)
  fp=os.path.join(WEB,'index.html' if path=='/' else path.lstrip('/'))
  if not os.path.isfile(fp): return self.json({'error':'not found'},404)
  ext=os.path.splitext(fp)[1]; ct={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'}.get(ext,'application/octet-stream'); return self.send(200,open(fp,'rb').read(),ct)
 def do_POST(self):
  content_length = int(self.headers.get('Content-Length', 0))

  # Chặn nếu dung lượng vượt quá 50MB (50 * 1024 * 1024 bytes)
  if content_length > MAX_UPLOAD_BYTES + 1024 * 1024:
    self.send_response(413)
    self.send_header('Content-Type', 'application/json')
    self.end_headers()
    self.wfile.write(b'{"error": "Payload Too Large: Dung luong file vuot qua gioi han 50MB"}')
    return


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
  if path=='/api/subjects':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu môn học không hợp lệ'},400)
   name=str(x.get('name','')).strip(); description=str(x.get('description','')).strip()
   raw_code=str(x.get('code','')).strip().upper()
   if not 2 <= len(name) <= 100:return self.json({'error':'Tên môn học phải từ 2 đến 100 ký tự'},400)
   if len(description)>500:return self.json({'error':'Mô tả môn học tối đa 500 ký tự'},400)
   code=re.sub(r'[^A-Z0-9]','',raw_code)
   if not code:
    code=''.join(ch for ch in unicodedata.normalize('NFKD',name).upper() if ch.isascii() and ch.isalnum())[:8] or 'SUB'
   if not 2 <= len(code) <= 12:return self.json({'error':'Mã môn học phải từ 2 đến 12 ký tự'},400)
   with db() as c:
    if c.execute('SELECT id FROM subjects WHERE code=?',(code,)).fetchone():return self.json({'error':'Mã môn học đã tồn tại'},409)
    row=c.execute('INSERT INTO subjects(code,name,description) VALUES(?,?,?)',(code,name,description)).lastrowid
    c.commit(); subject=c.execute('SELECT id,code,name,description FROM subjects WHERE id=?',(row,)).fetchone()
   return self.json(dict(subject),201)
  if path=='/api/subscription/checkout':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'invalid checkout data'},400)
   target_code=str(x.get('plan','')).lower(); cycle=str(x.get('billing_cycle','month')).lower(); method=str(x.get('payment_method','')).lower()
   if target_code not in ('free','plus','pro') or cycle not in ('month','year') or method not in ('card','bank','ewallet','demo'):
    return self.json({'error':'invalid checkout selection'},400)
   names={'free':('free',),'plus':('plus','standard'),'pro':('pro','premium')}; ranks={'free':0,'plus':1,'pro':2}
   with db() as c:
    plans=[dict(row) for row in c.execute('SELECT id,name FROM plans WHERE status=?',('active',)).fetchall()]
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
    if active:c.execute('UPDATE subscriptions SET status=? WHERE id=?',('expired',active['id']))
    c.execute('INSERT INTO subscriptions(user_id,plan_id,status) VALUES(?,?,?)',(u['id'],target['id'],'active')); c.commit()
   return self.json({'plan':target_code,'status':'active','billing_cycle':cycle,'scheduled_change':None,'change_type':'upgrade_applied'})
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
  if path in ('/api/ai/chat','/api/chat'):
   u=require_user(self)
   if not u:return
   x=json_body(data)
   question=(x.get('question','')).strip() if isinstance(x,dict) else ''
   document_id=x.get('document_id') if isinstance(x,dict) else None
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
   return self.json({'answer':answer,'sources':sources,'session_id':session_id,'mode':'local-rag'},200)
  if path=='/api/ai-tutor/chat':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu AI Tutor không hợp lệ'},400)
   mode=str(x.get('mode') or 'auto').lower()
   message=str(x.get('message') or '').strip()
   if not message:return self.json({'error':'Câu hỏi không được để trống'},400)
   # Khung chat một ô: người học không chọn chế độ nữa, Nova tự đọc câu hỏi để quyết
   # định giải thích / giải bài / gợi ý / tóm tắt / tạo quiz. Vẫn nhận chế độ tường minh
   # cho client cũ và cho test.
   if mode in ('', 'auto', 'tu_dong'):
    mode=tutor_engine.detect_mode(message)
   if mode not in ('explain','solve','hint','summarize','generate_quiz'):
    return self.json({'error':'invalid tutor mode'},400)
   file_ids=x.get('file_ids') if isinstance(x.get('file_ids'),list) else []
   conversation_key=str(x.get('conversation_id') or '').strip() or secrets.token_hex(16)
   context,sources=tutor_context(file_ids,message,fallback=mode in ('summarize','generate_quiz'))
   engine=get_engine()
   with db() as c:
    conversation=tutor_store.conversation_for(c,u['id'],conversation_key,mode=mode,title=message[:60])
    conversation_id=int(conversation['id']); conversation_title=str(conversation['title'] or '')
    history=tutor_store.history(c,conversation_id,8)
   quiz=None; quiz_topic=''
   if mode=='generate_quiz':
    quiz,quiz_topic=chat_quiz(engine,message,context)
   try:
    if quiz:
     answer=(f'## Quiz nhanh: {quiz_topic}\n\n'
             f'{len(quiz["questions"])} câu hỏi bám theo tài liệu. Chọn đáp án rồi bấm **Kiểm tra** để xem kết quả.')
    else:
     answer=engine.answer(mode=mode,question=message,context=context,history=history)
   except TutorEngineError as error:
    return self.json({'error':f'AI Tutor tạm thời không trả lời được: {error}','retryable':True},502)
   health=tutor_engine.PROVIDER_HEALTH
   degraded=bool(getattr(engine,'name','')=='provider-resilient' and not health.get('ok',True))
   with db() as c:
    tutor_store.add_message(c,conversation_id,'user',message,mode)
    message_id=tutor_store.add_message(c,conversation_id,'assistant',answer,mode,payload=quiz)
    if conversation_title in ('','Cuộc hội thoại mới'):
     tutor_store.rename_conversation(c,conversation_id,message[:60])
   return self.json({'conversation_id':conversation_key,'message_id':str(message_id),'role':'assistant','content':answer,'sources':sources,'mode':mode,
     'quiz':quiz,
     'engine_degraded':degraded,'engine_degraded_reason':health.get('reason','') if degraded else ''},200)
  if path=='/api/ai-tutor/assessment/start':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu đánh giá không hợp lệ'},400)
   return self.json(start_assessment(x),200)
  if path=='/api/ai-tutor/assessment/submit':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu đánh giá không hợp lệ'},400)
   answers=x.get('answers') if isinstance(x.get('answers'),list) else []
   if not answers:return self.json({'error':'Cần trả lời ít nhất một câu hỏi đánh giá'},400)
   subject=str(x.get('subject') or '').strip(); goal=str(x.get('goal') or '').strip()
   if not subject:return self.json({'error':'Thiếu môn học / chủ đề'},400)
   if not goal:return self.json({'error':'Thiếu mục tiêu học tập'},400)
   summary=summarize_answers(answers,build_assessment_questions({
     'subject':subject,'topics':x.get('topics') if isinstance(x.get('topics'),list) else []}))
   target=normalize_level(x.get('target_level'),'intermediate')
   pace=normalize_pace(x.get('pace'))
   try: study_time=int(x.get('study_time') or 0)
   except (TypeError,ValueError): study_time=0
   if study_time<=0: study_time={'slow':120,'steady':240,'fast':420}[pace]
   with db() as c:
    assessment_id=tutor_store.create_assessment(c,u['id'],subject=subject,goal=goal,
      current_level=summary['level'],target_level=target,study_time=study_time,pace=pace,
      strengths=summary['strengths'],weaknesses=summary['weaknesses'],
      score_percent=summary['percentage'],answers=answers)
   return self.json({'assessment_id':str(assessment_id),'subject':subject,'goal':goal,
     'current_level':summary['level'],'target_level':target,'score_percent':summary['percentage'],
     'score':summary['score'],'max_score':summary['max_score'],'strengths':summary['strengths'],
     'weaknesses':summary['weaknesses'],'detail':summary['detail'],'pace':pace,
     'study_time':study_time,'topics':x.get('topics') if isinstance(x.get('topics'),list) else []},201)
  if path=='/api/ai-tutor/roadmap':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu lộ trình không hợp lệ'},400)
   with db() as c:
    assessment=tutor_store.latest_assessment(c,u['id'])
   subject=str(x.get('subject') or assessment.get('subject') or '').strip()
   goal=str(x.get('goal') or assessment.get('goal') or '').strip()
   if not subject or not goal:
    return self.json({'error':'Cần hoàn thành phần đánh giá trước khi tạo lộ trình'},400)
   payload={'subject':subject,'goal':goal,
     'current_level':x.get('current_level') or assessment.get('current_level'),
     'target_level':x.get('target_level') or assessment.get('target_level'),
     'pace':x.get('pace') or assessment.get('pace') or 'steady',
     'study_time':x.get('study_time') or assessment.get('study_time') or 240,
     'strengths':x.get('strengths') if isinstance(x.get('strengths'),list) else assessment.get('strengths') or [],
     'weaknesses':x.get('weaknesses') if isinstance(x.get('weaknesses'),list) else assessment.get('weaknesses') or [],
     'topics':x.get('topics') if isinstance(x.get('topics'),list) else []}
   engine=get_engine()
   try:
    built=build_roadmap(payload,engine=engine)
    exercises=build_exercises(built,payload,engine=engine)
   except (TutorRoadmapError,TutorEngineError) as error:
    return self.json({'error':f'Không tạo được lộ trình: {error}','retryable':True},502)
   assessment_id=None
   if x.get('assessment_id'):
    try: assessment_id=int(x['assessment_id'])
    except (TypeError,ValueError): assessment_id=None
   if assessment_id is None and assessment.get('id'): assessment_id=int(assessment['id'])
   with db() as c:
    roadmap_id=tutor_store.create_roadmap(c,u['id'],assessment_id,subject=subject,goal=goal,
      difficulty=built['current_level'],title=built['title'],summary=built['summary'],payload=built)
    tutor_store.replace_exercises(c,roadmap_id,u['id'],exercises)
    row=tutor_store.latest_roadmap(c,u['id'])
    rows=tutor_store.exercises_for_roadmap(c,roadmap_id)
    progress=tutor_store.progress_for_roadmap(c,roadmap_id,u['id'])
   return self.json(public_roadmap(row,rows,progress),201)
  m=re.fullmatch(r'/api/ai-tutor/exercises/(\d+)/submit',path)
  if m:
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu bài làm không hợp lệ'},400)
   answer=str(x.get('answer') or '').strip()
   answer_type=str(x.get('answer_type') or 'text').lower()
   with db() as c:
    exercise=tutor_store.get_exercise(c,int(m.group(1)))
    if not exercise or int(exercise.get('user_id') or 0)!=int(u['id']):
     return self.json({'error':'exercise not found'},404)
    roadmap_row=c.execute('SELECT * FROM tutor_roadmaps WHERE id=?',(exercise['roadmap_id'],)).fetchone()
   engine=get_engine()
   try:
    result=grade_exercise(exercise,answer,answer_type=answer_type,engine=engine)
   except TutorGradingError as error:
    return self.json({'error':f'Không chấm được bài làm: {error}','retryable':True},422)
   adapted=None; progress={'total_exercises':0,'graded':0,'average_percentage':0,'completed':False}
   with db() as c:
    submission_id=tutor_store.add_submission(c,exercise['id'],u['id'],answer=answer,answer_type=answer_type,result=result)
    submissions=tutor_store.submissions_for_roadmap(c,exercise['roadmap_id'],u['id'])
    progress=tutor_store.progress_for_roadmap(c,exercise['roadmap_id'],u['id'])
    if roadmap_row:
     stored=json.loads(roadmap_row['payload']) if roadmap_row['payload'] else {}
     if stored:
      adapted=adapt_roadmap(stored,submissions)
      tutor_store.update_roadmap(c,exercise['roadmap_id'],adapted,adapted.get('adaptation_note'))
   response=tutor_store.submission_payload(submission_id,exercise,result)
   if adapted:
    response['adaptation']={'note':adapted.get('adaptation_note'),'average_score':adapted.get('average_score')}
   response['progress']=progress
   return self.json(response,201)
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
   if len(title)>200:return self.json({'error':'Tiêu đề tối đa 200 ký tự'},400)
   if len(fields.get('description',''))>2000:return self.json({'error':'Mô tả tối đa 2000 ký tự'},400)
   filename=filepart[0].strip(); content=filepart[1]
   extension=os.path.splitext(filename)[1].lower()
   if not filename or extension not in ALLOWED_UPLOAD_EXTENSIONS:return self.json({'error':'Định dạng file không được hỗ trợ'},400)
   if not content:return self.json({'error':'File không được rỗng'},400)
   if len(content)>MAX_UPLOAD_BYTES:return self.json({'error':'File vượt quá giới hạn 10MB'},413)
   try:
    subject_id=int(sid)
   except ValueError:
    return self.json({'error':'Môn học không hợp lệ'},400)
   c=db(); subject=c.execute('SELECT id FROM subjects WHERE id=?',(subject_id,)).fetchone()
   if not subject:
    c.close(); return self.json({'error':'Môn học không tồn tại'},400)
   safe=re.sub(r'[^A-Za-z0-9._-]','_',filename); stored=f'{secrets.token_hex(8)}_{safe}'
   target=os.path.join(UP,stored)
   with open(target,'wb') as fh: fh.write(content)
   ext=extension.lstrip('.')
   mime={'.pdf':'application/pdf','.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'}.get(extension,'application/octet-stream')
   document_id=c.execute('INSERT INTO documents(title,description,original_filename,storage_filename,file_type,mime_type,file_size,storage_path,status,subject_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(title,fields.get('description','').strip(),filename,stored,ext,mime,len(content),os.path.join('uploads',stored),'ready',subject_id,u['id'])).lastrowid
   c.commit(); c.close(); return self.json({'ok':True,'document_id':document_id,'status':'ready'},201)
  return self.json({'error':'not found'},404)

class StudyHubHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True

def main():
    init_db()
    port=int(os.environ.get('STUDYHUB_PORT','5000'))
    host=os.environ.get('STUDYHUB_HOST','127.0.0.1')
    status=tutor_config.engine_status()
    detail=f" ({status['provider']} · {status['model']})" if status['engine']=='provider' else ' — chưa cấu hình provider key'
    print(f'AI Tutor engine: {status["engine"]}{detail}')
    print(f'StudyHub running at http://{host}:{port}')
    with StudyHubHTTPServer((host, port), H) as server:
        server.serve_forever()
if __name__=='__main__':main()
