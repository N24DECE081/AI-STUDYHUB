#!/usr/bin/env python3
import tempfile
from backend.app.flashcards import service as flashcards
from backend.app.quizzes import service as quizzes
from backend.app.quizzes import repository as quiz_store
import json, os, re, secrets, sqlite3, hashlib, mimetypes, html, zipfile, smtplib, ssl
from datetime import datetime, timezone, timedelta
from calendar import monthrange
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote, unquote
import unicodedata
import math, threading, time
import xml.etree.ElementTree as ET
from email.parser import BytesParser
from email.policy import default
from email.message import EmailMessage

from backend.app.db.runtime import get_runtime_database, mysql_requested
from backend.app.db.seed import seed as seed_database
from backend.app.timezone import VIETNAM_TZ, vietnam_now
from backend.app.security import authenticate, create_session, hash_password, register as register_user, current_user, public_user, revoke_session, SESSION_COOKIE, complete_profile, start_password_reset, verify_password_reset, reset_password
from backend.app.security.service import update_streak
from backend.app.music import search_music
from backend.app.security.session import token_hash
from backend.app.security.oauth import OAuthError, authorization_url as oauth_authorization_url, exchange_profile as oauth_exchange_profile, provider_status as oauth_provider_status
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
from backend.app.ai_tutor import memory as tutor_memory
from backend.app.ai_tutor import agent as tutor_agent
from backend.app.ai_tutor.roadmap import normalize_level, normalize_pace
from backend.app import web_assistant
from backend.app import permissions
from backend.app import study

tutor_config.load_env()

ROOT=os.path.dirname(os.path.abspath(__file__))
def load_local_env(path):
 if os.environ.get('STUDYHUB_NO_DOTENV'):
  return
 if not os.path.isfile(path): return
 with open(path,encoding='utf-8') as env_file:
  for raw_line in env_file:
   line=raw_line.strip()
   if not line or line.startswith('#'): continue
   key,separator,value=line.partition('=')
   if not separator or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',key.strip()): continue
   # Accept the misspelled key used by the initial OAuth template, while the
   # corrected name remains the only one consumed by the OAuth provider.
   if key.strip()=='SSTUDYHUB_FACEBOOK_CLIENT_ID': key='STUDYHUB_FACEBOOK_CLIENT_ID'
   value=value.strip()
   if len(value)>=2 and value[0]==value[-1] and value[0] in ('"',"'"):
    value=value[1:-1]
   os.environ.setdefault(key.strip(),value)
load_local_env(os.path.join(ROOT,'.env'))
WEB=os.path.join(ROOT,'web')
if not os.path.isdir(WEB):
 WEB=os.path.normpath(os.path.join(ROOT,'..','..','archive','web'))
configured_upload_dir=os.environ.get('STUDYHUB_UPLOAD_DIR','').strip()
UP=os.path.abspath(configured_upload_dir) if configured_upload_dir else os.path.join(ROOT,'uploads')
MAX_UPLOAD_BYTES=20 * 1024 * 1024
UPLOAD_MULTIPART_OVERHEAD_BYTES=1024 * 1024
def positive_int_env(name, default):
 try: return max(1, int(os.environ.get(name, default)))
 except (TypeError, ValueError): return default

class TokenBucketRateLimiter:
 def __init__(self, requests_per_minute, burst, max_keys=10000, clock=time.monotonic):
  self.rate=max(1,requests_per_minute)/60.0; self.burst=max(1,burst); self.max_keys=max(1,max_keys); self.clock=clock
  self.buckets={}; self.lock=threading.Lock()
 def consume(self,key):
  now=self.clock()
  with self.lock:
   tokens,updated=self.buckets.get(key,(float(self.burst),now))
   tokens=min(float(self.burst),tokens+max(0,now-updated)*self.rate)
   allowed=tokens>=1
   if allowed: tokens-=1
   elif self.rate: retry=max(1,math.ceil((1-tokens)/self.rate))
   if key not in self.buckets and len(self.buckets)>=self.max_keys:
    self.buckets.pop(next(iter(self.buckets)))
   self.buckets[key]=(tokens,now)
   return allowed, (0 if allowed else retry), max(0,int(tokens))

API_RATE_LIMIT=positive_int_env('STUDYHUB_API_RATE_LIMIT_PER_MINUTE',120)
API_BURST=positive_int_env('STUDYHUB_API_BURST',30)
AUTH_RATE_LIMIT=positive_int_env('STUDYHUB_AUTH_RATE_LIMIT_PER_MINUTE',10)
AUTH_BURST=positive_int_env('STUDYHUB_AUTH_BURST',5)
api_rate_limiter=TokenBucketRateLimiter(API_RATE_LIMIT,API_BURST)
auth_rate_limiter=TokenBucketRateLimiter(AUTH_RATE_LIMIT,AUTH_BURST)
ALLOWED_UPLOAD_EXTENSIONS={'.pdf','.txt','.md','.csv','.doc','.docx','.ppt','.pptx','.xlsx'}
DEFAULT_CORS_ORIGINS={
 'http://localhost:5173','http://127.0.0.1:5173',
 'http://localhost:5174','http://127.0.0.1:5174',
 'http://localhost:5175','http://127.0.0.1:5175',
}
os.makedirs(UP,exist_ok=True)
if not os.environ.get('MYSQL_DATABASE') and os.environ.get('STUDYHUB_DB_PATH'):
 os.makedirs(os.path.dirname(os.environ['STUDYHUB_DB_PATH']),exist_ok=True)

def db():
 return get_runtime_database().open_connection()

def init_db():
 database=get_runtime_database()
 database.initialize()
 with database.connect() as connection:
  permissions.initialize(connection)
  study.migrate(connection)
  connection.commit()
 with database.connect() as connection:
  has_users=connection.execute('SELECT 1 FROM users LIMIT 1').fetchone()
 if not has_users:
  production=os.environ.get('STUDYHUB_ENV','development').strip().lower() in ('production','prod')
  # Public deployments must never receive the well-known demo passwords.
  # Keep the public catalog/plans seed while omitting demo accounts.
  seed_database(database,include_demo_users=not production)

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
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None

def require_user(handler):
    user = user_from(handler)
    if not user:
        handler.json({'error':'Bạn cần đăng nhập'},401)
        return None
    return user

def session_cookie(token, max_age=7 * 24 * 60 * 60):
    cross_site = os.environ.get('STUDYHUB_SECURE_COOKIES', '').lower() in ('1', 'true', 'yes')
    policy = 'SameSite=None; Secure' if cross_site else 'SameSite=Lax'
    return f'{SESSION_COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; {policy}'

OAUTH_STATE_COOKIE='studyhub_oauth_state'

def oauth_state_cookie(value, max_age=600):
    secure = os.environ.get('STUDYHUB_SECURE_COOKIES', '').lower() in ('1', 'true', 'yes')
    suffix = '; Secure' if secure else ''
    return f'{OAUTH_STATE_COOKIE}={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax{suffix}'

def oauth_frontend_url():
 return os.environ.get('STUDYHUB_FRONTEND_URL','http://127.0.0.1:5174').strip().rstrip('/')

def reset_email_ready():
 return bool(os.environ.get('STUDYHUB_SMTP_HOST','').strip() and os.environ.get('STUDYHUB_RESET_EMAIL_FROM','').strip())

def send_reset_otp(recipient, code):
 host=os.environ.get('STUDYHUB_SMTP_HOST','').strip()
 sender=os.environ.get('STUDYHUB_RESET_EMAIL_FROM','').strip()
 if not host or not sender: raise RuntimeError('Chưa cấu hình SMTP để gửi mã OTP')
 try: port=int(os.environ.get('STUDYHUB_SMTP_PORT','587'))
 except ValueError: raise RuntimeError('STUDYHUB_SMTP_PORT không hợp lệ')
 message=EmailMessage()
 message['Subject']='StudyHub - Mã đặt lại mật khẩu'
 message['From']=sender; message['To']=recipient
 message.set_content(f'Mã OTP đặt lại mật khẩu StudyHub của bạn là: {code}\n\nMã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.')
 username=os.environ.get('STUDYHUB_SMTP_USERNAME','').strip(); password=os.environ.get('STUDYHUB_SMTP_PASSWORD','')
 with (smtplib.SMTP_SSL(host,port,context=ssl.create_default_context(),timeout=15) if port==465 else smtplib.SMTP(host,port,timeout=15)) as smtp:
  if port!=465: smtp.starttls(context=ssl.create_default_context())
  if username: smtp.login(username,password)
  smtp.send_message(message)

def oauth_user_session(provider, profile):
    with db() as c:
        account=c.execute(
            'SELECT user_id FROM oauth_accounts WHERE provider=? AND provider_user_id=?',
            (provider,profile['provider_user_id']),
        ).fetchone()
        row=c.execute('SELECT * FROM users WHERE id=?',(account['user_id'],)).fetchone() if account else None
        if not row:
            row=c.execute('SELECT * FROM users WHERE email=?',(profile['email'],)).fetchone()
        if not row:
            full_name=profile['name'] if len(profile['name'])>=2 else 'StudyHub User'
            user_id=c.execute(
                'INSERT INTO users(full_name,email,password_hash,role,status,profile_completed,avatar_url) VALUES(?,?,?,?,?,?,?)',
                (full_name,profile['email'],hash_password(secrets.token_urlsafe(32)),'student','active',0,profile['avatar_url'] or None),
            ).lastrowid
            row=c.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone()
        if row['status']!='active':
            raise OAuthError('Tài khoản StudyHub đang bị khóa')
        linked=c.execute('SELECT id FROM oauth_accounts WHERE provider=? AND provider_user_id=?',
                         (provider,profile['provider_user_id'])).fetchone()
        if linked:
            c.execute('UPDATE oauth_accounts SET user_id=?,provider_email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
                      (row['id'],profile['email'],linked['id']))
        else:
            c.execute('INSERT INTO oauth_accounts(user_id,provider,provider_user_id,provider_email) VALUES(?,?,?,?)',
                      (row['id'],provider,profile['provider_user_id'],profile['email']))
        c.execute('UPDATE users SET avatar_url=COALESCE(?,avatar_url),last_login_at=CURRENT_TIMESTAMP WHERE id=?',
                  (profile['avatar_url'] or None,row['id']))
        streak=update_streak(c,row['id'])
        token,expires_at=create_session(c,row['id'])
        c.commit()
        user=public_user(c.execute('SELECT * FROM users WHERE id=?',(row['id'],)).fetchone())
        user['streak']=streak
    return user,token,expires_at

def local_stamp():
    return vietnam_now().replace(microsecond=0).isoformat()

def parse_timestamp(value):
    if not value:
        return None
    try:
        parsed=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return (parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed).astimezone(VIETNAM_TZ)
    except (TypeError,ValueError):
        return None

def elapsed_seconds(started_at, ended_at):
    started=parse_timestamp(started_at); ended=parse_timestamp(ended_at)
    if not started or not ended:return 0
    return max(0,int((ended-started).total_seconds()))

def ensure_study_session(connection, user_id, token):
    """Create/touch the study clock belonging to the authenticated login."""
    if not token:return None
    key=token_hash(token); now=local_stamp()
    row=connection.execute('SELECT * FROM study_sessions WHERE session_key=?',(key,)).fetchone()
    if row:
        if row['status']=='active':
            connection.execute('UPDATE study_sessions SET last_seen_at=? WHERE id=?',(now,row['id']))
        connection.commit()
        return row['id']
    session_id=connection.execute(
        'INSERT INTO study_sessions(user_id,session_key,started_at,last_seen_at,status) VALUES(?,?,?,?,?)',
        (user_id,key,now,now,'active'),
    ).lastrowid
    connection.commit()
    return session_id

def close_study_session(connection, token):
    if not token:return None
    key=token_hash(token); now=local_stamp()
    row=connection.execute(
        'SELECT * FROM study_sessions WHERE session_key=? AND status=?',(key,'active')
    ).fetchone()
    if not row:return None
    duration=study.study_time(connection,row['user_id'],key)['current_session_seconds']
    connection.execute(
        'UPDATE study_sessions SET last_seen_at=?,ended_at=?,duration_seconds=?,status=? WHERE id=?',
        (now,now,duration,'completed',row['id']),
    )
    connection.commit()
    return duration

def study_time_summary(connection, user_id, token):
    return study.study_time(connection, user_id, token_hash(token) if token else None)


def document_text(row, connection=None):
    if connection is not None:
        chunks=connection.execute(
            'SELECT content FROM document_chunks WHERE document_id=? ORDER BY chunk_index',
            (row['id'],),
        ).fetchall()
        if chunks:
            return '\n\n'.join(chunk['content'] for chunk in chunks)
    path=row['storage_path']
    fp=path if os.path.isabs(path) else os.path.join(ROOT,path)
    return extract_document_text(fp)

def split_document_text(text, chunk_size=12000):
    """Normalize extracted text into database-sized chunks without losing content."""
    clean=str(text or '').replace('\x00','').replace('\r\n','\n').replace('\r','\n').strip()
    if not clean:
        return []
    page_parts=re.split(r'(?=\[PAGE:\d+\])',clean)
    if len(page_parts)>1:
        chunks=[]
        for page in page_parts:
            page=page.strip()
            if not page:
                continue
            marker_match=re.match(r'(\[PAGE:\d+\])\s*',page)
            marker=marker_match.group(1) if marker_match else ''
            body=page[marker_match.end():] if marker_match else page
            for piece in split_document_text(body,chunk_size):
                chunks.append(f'{marker}\n{piece}'.strip())
        return chunks
    chunks=[]; start=0; length=len(clean)
    while start<length:
        end=min(length,start+chunk_size)
        if end<length:
            split_at=max(clean.rfind('\n',start,end),clean.rfind(' ',start,end))
            if split_at<start+chunk_size//2:
                split_at=end
        else:
            split_at=length
        piece=clean[start:split_at].strip()
        if piece:
            chunks.append(piece)
        start=split_at
        while start<length and clean[start].isspace():
            start+=1
    return [chunk for chunk in chunks if chunk]

def store_document_chunks(connection, document_id, text):
    chunks=split_document_text(text)
    for index, content in enumerate(chunks):
        page_match=re.search(r'\[PAGE:(\d+)\]',content)
        page_number=int(page_match.group(1)) if page_match else None
        content=re.sub(r'\[PAGE:\d+\]\s*','',content).strip()
        if not content:
            continue
        connection.execute(
            'INSERT INTO document_chunks(document_id,chunk_index,content,page_number,token_count) VALUES(?,?,?,?,?)',
            (document_id,index,content,page_number,len(re.findall(r'\w+',content))),
        )
    return len(chunks)

class DocumentTextError(ValueError):
    pass

def tutor_context(user_id, file_ids, question, limit=None, fallback=False):
    """Retrieve the document context server-side; the client never sends answers.

    `fallback` is for requests about the library itself (summarize / quiz with no
    topic words): there the newest documents are the intended material, not an
    unrelated guess, so no fake context is created.
    """
    knowledge=tutor_config.yaml_settings('knowledge')
    kb=((knowledge.get('knowledge_bases') or {}).get('chuyen_gia_ai') or {})
    retrieval=kb.get('retrieval') or {}
    if limit is None:
        limit=max(1,min(10,int(retrieval.get('top_k') or 3)))
    try:
        minimum_sources=max(1,min(4,int(retrieval.get('minimum_sources') or 1)))
    except (TypeError,ValueError):
        minimum_sources=1
    query_keywords=tutor_engine.keywords(question,10)
    with db() as c:
        ids=[]
        for raw in (file_ids or [])[:5]:
            try: ids.append(int(raw))
            except (TypeError,ValueError): continue
        ids=list(dict.fromkeys(ids))
        if ids:
            marks=','.join('?' for _ in ids)
            rows=c.execute(
                f'SELECT id,title,description,storage_path FROM documents WHERE uploaded_by=? AND id IN ({marks})',
                [user_id,*ids],
            ).fetchall()
            if len(rows)!=len(ids):
                raise LookupError('document not found')
        else:
            rows=c.execute(
                'SELECT id,title,description,storage_path FROM documents WHERE uploaded_by=? ORDER BY created_at DESC',
                (user_id,),
            ).fetchall()
        scored=[]
        for row in rows:
            chunks=c.execute(
                'SELECT content,page_number,chunk_index FROM document_chunks WHERE document_id=? ORDER BY chunk_index',
                (row['id'],),
            ).fetchall()
            if not chunks:
                chunks=[{'content':document_text(row,c),'page_number':None,'chunk_index':0}]
            for chunk in chunks:
                text=str(chunk['content'] or '')
                haystack=(row['title']+' '+(row['description'] or '')+' '+text).lower()
                matched_terms=[token for token in query_keywords if token in haystack]
                lexical=sum(min(3,haystack.count(token)) for token in matched_terms)
                # Graph expansion: terms that co-occur in a chunk form lightweight
                # knowledge-graph edges. Multi-term matches receive an edge bonus.
                edge_bonus=max(0,len(matched_terms)-1)*2
                scored.append((lexical+edge_bonus,len(matched_terms),row,text,
                               chunk['page_number'],chunk['chunk_index']))
    scored.sort(key=lambda item:item[0],reverse=True)
    matched=[item for item in scored if item[0]>0][:limit]
    if matched:
        # Prefer independent documents first when enough relevant sources exist;
        # if there are fewer, use the available matches without fabricating citations.
        picked=[]; picked_documents=set()
        for item in matched:
            document_id=item[2]['id']
            if document_id not in picked_documents:
                picked.append(item); picked_documents.add(document_id)
                if len(picked_documents)>=minimum_sources:
                    break
        picked.extend(item for item in matched if item not in picked)
        picked=picked[:limit]
    elif fallback or (ids and set(query_keywords).issubset({'tài','liệu','nội','dung','giải','thích'})):
        picked=scored[:limit]
    else:
        picked=[]
    parts=[]; sources=[]
    for _,_,row,text,page_number,chunk_index in picked:
        source=text or row['description'] or row['title']
        # One titled block per document: paragraphs stay inside it (blank lines
        # separate documents, not paragraphs), so every quote keeps its source.
        body=re.sub(r'\n\s*\n+','\n',source[:1200].strip())
        page_label=f", trang {page_number}" if page_number else ''
        parts.append(f"{row['title']}{page_label}: {body}")
        sources.append({'id':row['id'],'title':row['title'],'type':'document',
                        'page':page_number,'chunk':chunk_index})
    return '\n\n'.join(parts), sources, query_keywords

def external_cache_key(question, query_keywords=None):
    keywords=query_keywords or tutor_engine.keywords(question,10)
    basis=' '.join(sorted(set(keywords))) or re.sub(r'\s+',' ',question.strip().lower())
    return hashlib.sha256(basis.encode('utf-8')).hexdigest(),keywords

def external_cache_lookup(question, query_keywords=None):
    """Find exact or strongly overlapping general-knowledge cache entries."""
    key,keywords=external_cache_key(question,query_keywords)
    wanted=set(keywords)
    with db() as c:
        exact=c.execute('SELECT * FROM external_knowledge_cache WHERE cache_key=?',(key,)).fetchone()
        candidates=[exact] if exact else c.execute(
            'SELECT * FROM external_knowledge_cache ORDER BY updated_at DESC LIMIT 200'
        ).fetchall()
        best=None; best_score=0
        for row in candidates:
            try:cached=set(json.loads(row['keywords']))
            except (TypeError,ValueError,json.JSONDecodeError):cached=set()
            overlap=len(wanted & cached)
            required=1 if min(len(wanted),len(cached))<=1 else 2
            if overlap>=required and overlap>best_score:
                best=row; best_score=overlap
        if not best:return None
        c.execute(
            'UPDATE external_knowledge_cache SET hit_count=hit_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',
            (best['id'],),
        )
        c.commit()
        return {'id':best['id'],'answer':best['answer'],'question':best['question'],'provider':best['provider'],'keywords':keywords}

def external_cache_store(question, answer, query_keywords=None, provider=None):
    answer=str(answer or '').strip()
    if not answer:return None
    key,keywords=external_cache_key(question,query_keywords)
    with db() as c:
        row=c.execute('SELECT id FROM external_knowledge_cache WHERE cache_key=?',(key,)).fetchone()
        if row:
            c.execute('''UPDATE external_knowledge_cache SET question=?,answer=?,keywords=?,provider=?,
              updated_at=CURRENT_TIMESTAMP WHERE id=?''',
              (question[:1000],answer[:16000],json.dumps(keywords,ensure_ascii=False),provider,row['id']))
            cache_id=row['id']
        else:
            cache_id=c.execute('''INSERT INTO external_knowledge_cache(
              cache_key,keywords,question,answer,provider) VALUES(?,?,?,?,?)''',
              (key,json.dumps(keywords,ensure_ascii=False),question[:1000],answer[:16000],provider)).lastrowid
        c.commit()
    return cache_id

def advance_document_progress(connection, user_id, document_id, progress_percent, last_position=0):
    """Advance a document from verified learning activity; progress never moves backwards."""
    try:
        document_id=int(document_id); progress_percent=max(0,min(100,int(progress_percent)))
        last_position=max(0,int(last_position or 0))
    except (TypeError,ValueError):
        return None
    owned=connection.execute(
        'SELECT id FROM documents WHERE id=? AND uploaded_by=?',(document_id,user_id)
    ).fetchone()
    if not owned:return None
    if progress_percent > 0: update_streak(connection,user_id,record=True)
    current=connection.execute(
        'SELECT id,progress_percent,last_position FROM user_progress WHERE user_id=? AND document_id=?',
        (user_id,document_id),
    ).fetchone()
    if current:
        progress=max(int(current['progress_percent'] or 0),progress_percent)
        position=max(int(current['last_position'] or 0),last_position)
        connection.execute('''UPDATE user_progress SET progress_percent=?,last_position=?,completed=?,
          updated_at=CURRENT_TIMESTAMP WHERE id=?''',(progress,position,int(progress==100),current['id']))
        progress_id=current['id']
    else:
        progress=progress_percent
        progress_id=connection.execute('''INSERT INTO user_progress(
          user_id,document_id,progress_percent,last_position,completed) VALUES(?,?,?,?,?)''',
          (user_id,document_id,progress,last_position,int(progress==100))).lastrowid
    return progress_id

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
    modules=[]
    lesson_keys={}
    for module in payload.get('modules') or []:
        lessons=module.get('lessons') or []
        topic=str(lessons[0].get('title') or '').removesuffix(' — phần 1') if lessons else ''
        # Compact only the old local template; distinct lessons and stored history stay intact.
        repeated=len(lessons)>1 and all(
            lesson.get('title')==f'{topic} — phần {index}'
            and lesson.get('objectives')==lessons[0].get('objectives')
            and lesson.get('examples')==[f'Ví dụ minh hoạ cho {topic} (phần {index})']
            for index,lesson in enumerate(lessons,start=1)
        )
        if repeated:
            key=str(lessons[0]['key'])
            lesson_keys.update({str(lesson['key']):key for lesson in lessons})
            lessons=[{**lessons[0], 'title':topic,
                      'examples':[f'Ví dụ minh hoạ cho {topic}'],
                      'estimated_minutes':sum(int(lesson.get('estimated_minutes') or 0) for lesson in lessons)}]
        modules.append({**module,'lessons':[dict(lesson) for lesson in lessons]})
    by_lesson={}
    public_exercises=[]
    for item in exercises:
        key=str(item.get('lesson_key') or '')
        key=lesson_keys.get(key,key)
        by_lesson.setdefault(key,[]).append(str(item.get('id')))
        public_exercises.append(tutor_store.to_public({**item,'lesson_key':key}))
    for module in modules:
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
        'modules': modules,
        'focus_weaknesses': payload.get('focus_weaknesses') or [],
        'adaptation_note': payload.get('adaptation_note') or row.get('adaptation_note'),
        'average_score': payload.get('average_score'),
        'version': row.get('version') or 1,
        'exercises': public_exercises,
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

def normalize_extracted_text(text):
    """Normalize extracted document content while preserving reading structure."""
    if text is None:
        return ''
    text = str(text).replace('\x00', '').replace('\r\n', '\n').replace('\r', '\n')
    lines = [line.rstrip() for line in text.split('\n')]
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if cleaned and cleaned[-1] != '':
                cleaned.append('')
            continue
        if re.fullmatch(r'(?:Page\s+\d+\s*(?:of\s*\d+)?)|(?:-+\s*\d+\s*-+)', stripped, flags=re.I):
            continue
        cleaned.append(stripped)
    normalized = '\n'.join(cleaned)
    normalized = re.sub(r'\n{3,}', '\n\n', normalized)
    normalized = re.sub(r'(?<!\n)\n(?=[A-Za-zÀ-ỹ0-9][^\n]*:)', '\n', normalized)
    normalized = re.sub(r'\n{2,}', '\n\n', normalized).strip()
    return normalized


def _extract_markitdown(path):
    """Use MarkItDown when available and avoid hard dependency failures."""
    try:
        from markitdown import MarkItDown
    except Exception:
        return ''
    try:
        result = MarkItDown().convert(path)
    except Exception:
        return ''
    for candidate in (
        getattr(result, 'text_content', None),
        getattr(result, 'markdown', None),
        getattr(result, 'content', None),
        getattr(result, 'text', None),
    ):
        if isinstance(candidate, str) and candidate.strip():
            return normalize_extracted_text(candidate)
    if isinstance(result, str) and result.strip():
        return normalize_extracted_text(result)
    return ''


def _docx_text_for_markdown(path):
    try:
        with zipfile.ZipFile(path) as archive:
            names = sorted(name for name in archive.namelist() if name == 'word/document.xml')
            if not names:
                return ''
            root = ET.fromstring(archive.read(names[0]))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            paragraphs = []
            for para in root.findall('.//w:p', ns):
                style_name = None
                for style in para.findall('./w:pPr/w:pStyle', ns):
                    style_name = style.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')
                    break
                texts = []
                for node in para.iterfind('.//w:t', ns):
                    value = (node.text or '').replace('\u00a0', ' ')
                    if value:
                        texts.append(value)
                if not texts:
                    continue
                text = ' '.join(texts).strip()
                if not text:
                    continue
                if style_name and style_name.lower().startswith('heading'):
                    paragraphs.append(f"# {text}")
                elif style_name and style_name.lower().startswith('list'):
                    paragraphs.append(f"- {text}")
                else:
                    paragraphs.append(text)
            return normalize_extracted_text('\n\n'.join(paragraphs))
    except (OSError, zipfile.BadZipFile, ET.ParseError):
        return ''


def _pptx_text_for_markdown(path):
    try:
        with zipfile.ZipFile(path) as archive:
            slide_names = sorted(name for name in archive.namelist() if name.startswith('ppt/slides/slide') and name.endswith('.xml'))
            chunks = []
            for name in slide_names:
                root = ET.fromstring(archive.read(name))
                texts = []
                for node in root.iter():
                    if node.tag.rsplit('}', 1)[-1] == 't' and (node.text or '').strip():
                        texts.append(node.text.strip())
                if texts:
                    chunks.append('\n'.join(f'- {text}' if i else text for i, text in enumerate(texts)))
            return normalize_extracted_text('\n\n'.join(chunks))
    except (OSError, zipfile.BadZipFile, ET.ParseError):
        return ''


def _xlsx_text_for_markdown(path):
    try:
        with zipfile.ZipFile(path) as archive:
            workbook = archive.read('xl/workbook.xml')
            root = ET.fromstring(workbook)
            texts = []
            for sheet in root.findall('.//{*}sheet'):
                sheet_name = sheet.get('name')
                if not sheet_name:
                    continue
                texts.append(f'## {sheet_name}')
                rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
                for rel in rels.findall('{*}Relationship'):
                    if rel.get('Type', '').endswith('/worksheet'):
                        target = rel.get('Target')
                        if target:
                            sheet_xml = ET.fromstring(archive.read('xl/' + target))
                            rows = []
                            for row in sheet_xml.findall('.//{*}sheetData/{*}row'):
                                cells = []
                                for cell in row.findall('{*}c'):
                                    value = cell.get('v')
                                    if value is not None:
                                        cells.append(value)
                                if cells:
                                    rows.append(' | '.join(cells))
                            if rows:
                                texts.append('\n'.join(f'- {row}' for row in rows))
            return normalize_extracted_text('\n\n'.join(texts))
    except (OSError, zipfile.BadZipFile, ET.ParseError):
        return ''


def extract_document_text(path):
    """Read the common study formats while preserving document structure and falling back safely."""
    ext = os.path.splitext(path)[1].lower()
    if not os.path.exists(path):
        return ''
    if ext in ('.txt', '.md', '.csv', '.log'):
        return normalize_extracted_text(open(path, 'r', encoding='utf-8', errors='replace').read())
    if ext in ('.docx', '.pptx', '.xlsx'):
        if ext == '.docx':
            extractors = (_docx_text_for_markdown, _extract_markitdown)
        else:
            extractors = (_extract_markitdown, _pptx_text_for_markdown if ext == '.pptx' else _xlsx_text_for_markdown)
        for extractor in extractors:
            text = extractor(path)
            if text:
                return text
        return ''
    if ext == '.pdf':
        markitdown_text = _extract_markitdown(path)
        if markitdown_text and len(markitdown_text) >= 80:
            return markitdown_text
        try:
            from pypdf import PdfReader
            pages = []
            for number, page in enumerate(PdfReader(path).pages, start=1):
                text = page.extract_text() or ''
                if text:
                    pages.append(f'[PAGE:{number}]\n{text}')
            extracted = '\n\n'.join(pages)
            normalized = normalize_extracted_text(extracted)
            if normalized:
                return normalized
        except Exception:
            pass
        try:
            raw = open(path, 'rb').read().decode('latin-1', errors='ignore')
            chunks = re.findall(r'\(([^()]*)\)\s*Tj', raw, re.S)
            extracted = '\n'.join(chunk.replace('\\n', '\n').replace('\\(', '(').replace('\\)', ')') for chunk in chunks)
            normalized = normalize_extracted_text(extracted)
            if normalized:
                return normalized
        except OSError:
            pass
        return markitdown_text or ''
    return ''

def learning_sources(connection, user_id, payload):
    if not isinstance(payload,dict):raise ValueError('Dữ liệu không hợp lệ.')
    ids=payload.get('document_ids')
    if not isinstance(ids,list) or not 1 <= len(ids) <= 20 or any(type(i) is not int or i<=0 for i in ids):
        raise ValueError('Chọn từ 1 đến 20 tài liệu trong cùng môn học.')
    ids=list(dict.fromkeys(ids)); marks=','.join('?' for _ in ids)
    rows=connection.execute(f"SELECT d.*,s.name subject_name FROM documents d JOIN subjects s ON s.id=d.subject_id WHERE d.uploaded_by=? AND d.id IN ({marks})",[user_id,*ids]).fetchall()
    if len(rows)!=len(ids):raise LookupError('Một hoặc nhiều tài liệu không tồn tại.')
    subject_id=rows[0]['subject_id']
    if any(row['subject_id']!=subject_id for row in rows) or ('subject_id' in payload and payload['subject_id']!=subject_id):
        raise ValueError('Các tài liệu phải thuộc cùng môn học đã chọn.')
    subject=connection.execute('SELECT id,name FROM subjects WHERE id=? AND (created_by=? OR created_by IS NULL)',(subject_id,user_id)).fetchone()
    if not subject:raise LookupError('Môn học không tồn tại.')
    by_id={row['id']:row for row in rows}; docs=[]
    for doc_id in ids:
        row=by_id[doc_id]
        try: content=document_text(row,connection)
        except (OSError,ValueError):raise ValueError('Không đọc được nội dung tài liệu. Hãy chọn tài liệu có văn bản.')
        if not content or not content.strip():raise ValueError('Một tài liệu không có nội dung chữ. Vui lòng bỏ chọn tài liệu đó.')
        docs.append({'id':doc_id,'title':row['title'],'text':content})
    return docs,dict(subject)


def persist_tutor_quiz(connection,user_id,quiz,exercise_id=None):
    payload=quizzes.normalize_manual({'title':str(quiz.get('topic') or 'Quiz nhanh')[:100],
      'questions':[{'question':q['question'],'options':q['options'],'correct_index':q['answer_index'],
                    'explanation':q.get('explanation','')} for q in quiz['questions']]})
    if exercise_id:payload['tutor_exercise_id']=exercise_id
    payload['subject']=quiz.get('subject') or quiz.get('topic') or 'Tự học'
    quiz_id=connection.execute('INSERT INTO chat_sessions(user_id,title) VALUES(?,?)',(user_id,'QUIZ_CARD:'+payload['title'])).lastrowid
    connection.execute('INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)',(quiz_id,'assistant',json.dumps(payload,ensure_ascii=False)))
    return quiz_id


def exercise_quiz(connection,user_id,exercise_id):
    if type(exercise_id) is not int:raise ValueError('Mã bài tập không hợp lệ.')
    exercise=tutor_store.get_exercise(connection,exercise_id)
    if not exercise or exercise['user_id']!=user_id:raise LookupError('Bài tập không tồn tại.')
    if exercise['exercise_type']!='multiple_choice':raise ValueError('Bài tập không phải trắc nghiệm.')
    title=f'Nova exercise {exercise_id}'
    row=connection.execute('SELECT id FROM chat_sessions WHERE user_id=? AND title=? ORDER BY id DESC LIMIT 1',
      (user_id,'QUIZ_CARD:'+title)).fetchone()
    if row:return row['id']
    options=exercise.get('options') or []
    if isinstance(options,str):options=json.loads(options)
    expected=str(exercise.get('expected_answer') or '').strip().casefold()
    correct=next((i for i,option in enumerate(options) if option.strip().casefold()==expected),None)
    if correct is None:raise ValueError('Bài tập chưa có đáp án hợp lệ.')
    return persist_tutor_quiz(connection,user_id,{'topic':title,'subject':exercise['topic'],'questions':[{'question':exercise['prompt'],
      'options':options,'answer_index':correct}]},exercise_id)

def finish_study_attempt(connection,user_id,attempt_id,payload):
    result=study.submit(connection,user_id,attempt_id,payload)
    attempt=study.owned(connection,user_id,attempt_id)
    quiz=json.loads(attempt['quiz_payload'])
    for document_id in dict.fromkeys(quiz.get('document_ids',[])):
        advance_document_progress(connection,user_id,document_id,60+round(result['score']*40/max(result['total'],1)),result['score'])
    return result

def handle_study_post(handler,path,data):
    match=re.fullmatch(r'/api/quiz-attempts/(\d+)/(answers|submit)',path)
    if path not in ('/api/quiz-attempts','/api/study-session/heartbeat') and not match:return False
    user=require_user(handler)
    if not user:return True
    payload=json_body(data)
    if not isinstance(payload,dict):
        handler.json({'error':'Dữ liệu học tập không hợp lệ.'},422);return True
    try:
        with db() as c:
            study.lock(c,user['id'])
            if path=='/api/quiz-attempts':
                study.migrate(c,user['id'])
                quiz_id=payload.get('quizId',payload.get('quiz_id'))
                if payload.get('tutorExerciseId'):
                    permissions.require_feature(permissions.plan_for(c,user['id']),'personalized_roadmap')
                    quiz_id=exercise_quiz(c,user['id'],payload['tutorExerciseId'])
                if payload.get('tutorMessageId'):
                    row=c.execute('''SELECT m.id,m.payload FROM tutor_messages m JOIN tutor_conversations t ON t.id=m.conversation_id
                        WHERE m.id=? AND t.user_id=? AND m.role='assistant' ''',(payload['tutorMessageId'],user['id'])).fetchone()
                    if not row:raise LookupError('Quiz trong Nova không tồn tại.')
                    tutor_quiz=json.loads(row['payload'] or '{}')
                    if not tutor_quiz.get('questions'):raise ValueError('Tin nhắn không chứa bài trắc nghiệm.')
                    quiz_id=tutor_quiz.get('quiz_id')
                    if not quiz_id:
                        quiz_id=persist_tutor_quiz(c,user['id'],tutor_quiz)
                        tutor_quiz['quiz_id']=quiz_id
                        c.execute('UPDATE tutor_messages SET payload=? WHERE id=?',(json.dumps(tutor_quiz,ensure_ascii=False),row['id']))
                if type(quiz_id) is not int:raise ValueError('Mã bài trắc nghiệm không hợp lệ.')
                result=study.start(c,user['id'],quiz_id,payload)
            elif path=='/api/study-session/heartbeat':
                token=cookie_value(handler,SESSION_COOKIE)
                study.heartbeat(c,user['id'],token_hash(token))
                result=study_time_summary(c,user['id'],token)
            elif match.group(2)=='answers':result=study.save_answers(c,user['id'],int(match.group(1)),payload)
            else:result=finish_study_attempt(c,user['id'],int(match.group(1)),payload)
            c.commit()
        handler.json(result,201 if path=='/api/quiz-attempts' else 200)
    except LookupError as error:handler.json({'error':str(error)},404)
    except ValueError as error:handler.json({'error':str(error)},422)
    except permissions.PermissionDenied as error:handler.json({'error':str(error),'code':error.code},error.status)
    return True

def handle_learning_post(handler,path,data):
    match=re.fullmatch(r'/api/(quizzes|flashcards)/([^/]+)/(start|answers|rename)',path)
    if path not in ('/api/quizzes/limits','/api/flashcards/generate','/api/quizzes/manual','/api/flashcards/manual') and not match:return False
    user=require_user(handler)
    if not user:return True
    try:
        payload=json_body(data)
        if not isinstance(payload,dict):raise ValueError('Dữ liệu không hợp lệ.')
        with db() as c:
            if path in ('/api/quizzes/limits','/api/flashcards/generate'):
                docs,subject=learning_sources(c,user['id'],payload)
                if path=='/api/quizzes/limits': result=quizzes.content_limits(docs)
                else:
                    deck=flashcards.generate_from_documents(docs,{**payload,'subject_id':subject['id'],'subject':subject['name']},get_engine())
                    # Generated IDs are always server-owned, never supplied by the client.
                    deck['id']=secrets.token_hex(16)
                    c.execute('INSERT INTO flashcard_decks(id,user_id,payload) VALUES(?,?,?)',(deck['id'],user['id'],json.dumps(deck,ensure_ascii=False)))
                    result=deck
            elif path in ('/api/quizzes/manual','/api/flashcards/manual'):
                subject_id=payload.get('subject_id')
                if type(subject_id) is not int or subject_id < 1:raise ValueError('Vui lòng chọn môn học.')
                subject=c.execute('SELECT id,name FROM subjects WHERE id=? AND (created_by=? OR created_by IS NULL)',(subject_id,user['id'])).fetchone()
                if not subject:raise LookupError('Môn học không tồn tại.')
                if path=='/api/flashcards/manual':
                    result=flashcards.normalize_deck({**payload,'id':secrets.token_hex(16),'subject':subject['name'],'document_ids':[]})
                    for card in result['cards']:card['remembered']=False
                    c.execute('INSERT INTO flashcard_decks(id,user_id,payload) VALUES(?,?,?)',(result['id'],user['id'],json.dumps(result,ensure_ascii=False)))
                else:
                    quiz=quizzes.normalize_manual(payload)
                    quiz.update(subject_id=subject_id,subject=subject['name'])
                    quiz_id=c.execute('INSERT INTO chat_sessions(user_id,subject_id,document_id,title) VALUES(?,?,?,?)',(user['id'],subject_id,None,'QUIZ_CARD:'+quiz['title'])).lastrowid
                    c.execute('INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)',(quiz_id,'assistant',json.dumps(quiz,ensure_ascii=False)))
                    result=public_quiz_payload(quiz,quiz_id)
            elif match.group(1)=='flashcards':
                if match.group(3)!='rename':raise LookupError('Không tìm thấy chức năng.')
                row=c.execute('SELECT payload FROM flashcard_decks WHERE id=? AND user_id=?',(unquote(match.group(2)),user['id'])).fetchone()
                if not row:raise LookupError('Bộ Flashcard không tồn tại.')
                name=flashcards.text(payload.get('name'),100)
                if not name:raise ValueError('Vui lòng nhập tên bộ Flashcard.')
                result=json.loads(row['payload']);result['name']=name
                c.execute('UPDATE flashcard_decks SET payload=? WHERE id=? AND user_id=?',(json.dumps(result,ensure_ascii=False),unquote(match.group(2)),user['id']))
            else:
                quiz_id=match.group(2)
                if match.group(3) in ('start','answers'):
                    study.lock(c,user['id'])
                    if match.group(3)=='start':result=study.start(c,user['id'],quiz_id,payload)
                    else:
                        quiz_store.owned_quiz(c,user['id'],quiz_id)
                        study.migrate(c,user['id'])
                        row=c.execute('SELECT id FROM quiz_attempts WHERE user_id=? AND quiz_id=? AND legacy_run_id=?',(user['id'],quiz_id,payload.get('run_id'))).fetchone()
                        if not row:raise ValueError('Hãy bắt đầu lượt làm bài trước khi lưu.')
                        result=study.save_answers(c,user['id'],row['id'],payload)
                else:
                    row,quiz=quiz_store.owned_quiz(c,user['id'],quiz_id)
                    title=flashcards.text(payload.get('name'),100)
                    if not title:raise ValueError('Vui lòng nhập tên bài trắc nghiệm.')
                    quiz['title']=title
                    c.execute('UPDATE chat_messages SET content=? WHERE id=?',(json.dumps(quiz,ensure_ascii=False),row['id']))
                    c.execute('UPDATE chat_sessions SET title=? WHERE id=?',('QUIZ_CARD:'+title,quiz_id))
                    result=public_quiz_payload(quiz,int(quiz_id))
            c.commit()
        handler.json(result,201 if path in ('/api/flashcards/generate','/api/flashcards/manual','/api/quizzes/manual') else 200)
    except LookupError as error:handler.json({'error':str(error)},404)
    except TutorEngineError:handler.json({'error':'Nova chưa thể tạo nội dung lúc này. Vui lòng thử lại.'},503)
    except ValueError as error:handler.json({'error':str(error)},400)
    return True

def public_quiz_payload(payload, quiz_id=None, created_at=None):
    """Return only quiz fields the client needs before submitting answers."""
    questions=[]
    for question in payload.get('questions',[]):
        questions.append({key:question[key] for key in (
            'id','question','options','document_id','source_title','difficulty'
        ) if key in question})
    result={key:payload[key] for key in ('kind','title','document_ids','question_count','subject_id','subject','time_limit','difficulty') if key in payload}
    result['questions']=questions
    if quiz_id is not None: result['id']=quiz_id
    if created_at is not None: result['created_at']=created_at
    return result

def _parse_activity_time(value):
    """Parse database timestamps as UTC without depending on a database dialect."""
    if not value:
        return None
    try:
        parsed=datetime.fromisoformat(str(value).replace('Z','+00:00'))
    except (TypeError,ValueError):
        return None
    return (parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed).astimezone(VIETNAM_TZ)

def _shift_month(year, month, offset):
    index=year*12+(month-1)+offset
    return index//12,index%12+1

def quiz_progress_analytics(connection, user_id, now=None):
    study.lock(connection,user_id)
    study.migrate(connection,user_id)
    result=study.analytics(connection,user_id,now)
    connection.commit()
    return result


def subscription_effective_at(billing_cycle='month', now=None):
    """Calculate a calendar-month/year boundary without database-specific SQL."""
    if billing_cycle not in ('month','year'):
        raise ValueError('billing_cycle must be month or year')
    current=now or datetime.now(timezone.utc)
    months=12 if billing_cycle=='year' else 1
    month_index=current.month-1+months
    year=current.year+month_index//12
    month=month_index%12+1
    day=min(current.day,monthrange(year,month)[1])
    effective=current.replace(year=year,month=month,day=day)
    return effective.strftime('%Y-%m-%d %H:%M:%S')

class H(BaseHTTPRequestHandler):
 server_version='StudyHub/1.0'
 def cors_headers(self):
    """Echo lại Origin nếu được phép."""
    allowed = [item.strip() for item in os.environ.get('STUDYHUB_CORS_ORIGINS', '').split(',') if item.strip()]
    origin = self.headers.get('Origin', '')

    if origin and (origin in allowed or '*' in allowed):
        if '*' in allowed:
            self.send_header('Access-Control-Allow-Origin', '*')
        else:
            self.send_header('Access-Control-Allow-Origin', origin)

    self.send_header('Vary', 'Origin')
    self.send_header('Access-Control-Allow-Credentials', 'true')


 def cors_origin(self):
    origin = self.headers.get('Origin', '')
    configured = os.environ.get('STUDYHUB_CORS_ORIGINS', '')
    allowed = [value.strip() for value in configured.split(',') if value.strip()]

    return origin if origin in allowed else None
 def send(self,status=200,body=b'',ctype='application/json',headers=None):
  self.plan_response_status=status
  if status>=400 and getattr(self,'plan_reservation',None):
   with db() as c: permissions.refund_tutor(c,self.plan_reservation)
   self.plan_reservation=None
  self.send_response(status); self.send_header('Content-Type',ctype); self.send_header('Cache-Control','no-store');
  origin=self.cors_origin()
  if origin:
   self.send_header('Access-Control-Allow-Origin', origin); self.send_header('Access-Control-Allow-Credentials', 'true'); self.send_header('Vary','Origin')
   self.send_header('Access-Control-Expose-Headers','Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining')
  if getattr(self,'gateway_rate_headers',None):
   for key,value in self.gateway_rate_headers.items(): self.send_header(key,value)
  if headers:
   for k,v in headers.items(): self.send_header(k,v)
  self.end_headers(); self.wfile.write(body)
 def json(self,obj,status=200,headers=None): self.send(status,json.dumps(obj,ensure_ascii=False).encode(),headers=headers)
 def redirect(self,location,cookies=()):
  self.send_response(302); self.send_header('Location',location); self.send_header('Cache-Control','no-store')
  for cookie in cookies:self.send_header('Set-Cookie',cookie)
  self.end_headers()
 def gateway_access(self):
  path=urlparse(self.path).path
  if path!='/api' and not path.startswith('/api/'): return True
  client_ip=self.client_address[0]
  allowed,retry,remaining=api_rate_limiter.consume(client_ip)
  limit=API_RATE_LIMIT
  if self.command=='POST' and path in ('/api/login','/api/auth/login','/api/register','/api/auth/register','/api/auth/password/otp','/api/auth/forgot-password','/api/auth/password/verify','/api/auth/reset-password/verify','/api/auth/password/reset','/api/auth/reset-password'):
   auth_allowed,auth_retry,auth_remaining=auth_rate_limiter.consume(client_ip)
   if not auth_allowed: allowed,retry,remaining,limit=False,auth_retry,0,AUTH_RATE_LIMIT
   elif auth_remaining<remaining: remaining,limit=auth_remaining,AUTH_RATE_LIMIT
  self.gateway_rate_headers={'X-RateLimit-Limit':str(limit),'X-RateLimit-Remaining':str(remaining)}
  if not allowed:
   return self.json({'error':'Request rate limit exceeded','code':'rate_limited','retry_after_seconds':retry},429,{'Retry-After':str(retry),'X-RateLimit-Limit':str(limit),'X-RateLimit-Remaining':'0'})
  return True
 def body(self):
  try: n=int(self.headers.get('Content-Length','0'))
  except (TypeError,ValueError): raise ValueError('invalid Content-Length')
  if n < 0: raise ValueError('invalid Content-Length')
  return self.rfile.read(n)
 def do_OPTIONS(self):
    if not self.gateway_access():
        return

    origin = self.cors_origin()

    # Reject requests with an invalid Origin
    if self.headers.get('Origin') and not origin:
        self.send_response(403)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        return

    self.send_response(204)

    # CORS headers
    if origin:
        self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Credentials', 'true')

    self.send_header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
    )
    self.send_header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
    )

    self.end_headers()
 def do_GET(self):
  if not self.gateway_access(): return
  p=urlparse(self.path); path=p.path
  feature=permissions.request_feature(path,{})
  if feature:
   u=require_user(self)
   if not u:return
   with db() as c:
    try: permissions.require_feature(permissions.plan_for(c,u['id']),feature)
    except permissions.PermissionDenied as error:return self.json({'error':str(error),'code':error.code},error.status)
  if path=='/api/health':
   return self.json({'status':'ok','service':'studyhub-api'})
  if path=='/api/music/search':
   try: return self.json(search_music(parse_qs(p.query).get('q',[''])[0]))
   except ValueError as exc: return self.json({'error':str(exc)},400)
   except Exception: return self.json({'error':'Không tải được kết quả YouTube. Hãy thử lại hoặc dùng tệp nhạc.'},502)
  if path=='/api/web-assistant/starters':
   # Lời chào + 4 gợi ý nhanh cho chatbot tư vấn ở trang chủ (khách không cần đăng nhập).
   return self.json(web_assistant.starters())
  if path=='/api/auth/oauth/status':
   return self.json({'providers':oauth_provider_status()})
  oauth_start=re.fullmatch(r'/api/auth/oauth/(google|facebook)',path)
  if oauth_start:
   provider=oauth_start.group(1); state=secrets.token_urlsafe(32)
   try:location=oauth_authorization_url(provider,state)
   except OAuthError as error:return self.json({'error':str(error)},503)
   return self.redirect(location,[oauth_state_cookie(f'{provider}:{state}')])
  oauth_callback=re.fullmatch(r'/api/auth/oauth/(google|facebook)/callback',path)
  if oauth_callback:
   provider=oauth_callback.group(1); query=parse_qs(p.query); state=query.get('state',[''])[0]; code=query.get('code',[''])[0]
   stored=cookie_value(self,OAUTH_STATE_COOKIE) or ''; clear_state=oauth_state_cookie('',0)
   if query.get('error'):
    return self.redirect(f'{oauth_frontend_url()}/?oauth_error=access_denied',[clear_state])
   if not state or not secrets.compare_digest(stored,f'{provider}:{state}'):
    return self.redirect(f'{oauth_frontend_url()}/?oauth_error=invalid_state',[clear_state])
   if not code:
    return self.redirect(f'{oauth_frontend_url()}/?oauth_error=missing_code',[clear_state])
   try:
    profile=oauth_exchange_profile(provider,code); user,token,_=oauth_user_session(provider,profile)
    with db() as c:ensure_study_session(c,user['id'],token)
   except OAuthError:
    return self.redirect(f'{oauth_frontend_url()}/?oauth_error=provider_failed',[clear_state])
   except Exception as error:
    self.log_error('OAuth callback failed: %r',error)
    return self.redirect(f'{oauth_frontend_url()}/?oauth_error=server_failed',[clear_state])
   return self.redirect(f'{oauth_frontend_url()}/?oauth=success',[clear_state,session_cookie(token)])
  if path in ('/api/me','/api/auth/me'):
   token=cookie_value(self,SESSION_COOKIE); user=user_from(self)
   if user and token:
    with db() as c:ensure_study_session(c,user['id'],token)
   return self.json({'user':user})
  if path=='/api/subjects':
    scope=parse_qs(p.query).get('scope',['all'])[0]
    if scope=='mine':
     u=require_user(self)
     if not u:return
     c=db(); rows=[dict(r) for r in c.execute('SELECT * FROM subjects WHERE created_by=? ORDER BY name',(u['id'],))]; c.close(); return self.json(rows)
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
   with db() as c: access=permissions.snapshot(c,u['id'])
   return self.json({'plan':codes.get(str(current['name']).lower(),'free'),'status':current['status'],'billing_cycle':'month','scheduled_change':change,'permissions':access})
  if path=='/api/documents':
   u=require_user(self)
   if not u:return
   qs=parse_qs(p.query); q=qs.get('q',[''])[0]; sub=qs.get('subject',[''])[0]; c=db(); sql='SELECT d.*, d.original_filename AS file_name, d.storage_path AS file_path, d.uploaded_by AS uploader_id, s.code subject_code,s.name subject_name,u.full_name AS uploader, (SELECT substr(dc.content,1,320) FROM document_chunks dc WHERE dc.document_id=d.id ORDER BY dc.chunk_index LIMIT 1) AS content_preview FROM documents d JOIN subjects s ON s.id=d.subject_id JOIN users u ON u.id=d.uploaded_by WHERE d.uploaded_by=?'; args=[u['id']]
   if q: sql+=' AND (d.title LIKE ? OR d.description LIKE ?)'; args += [f'%{q}%',f'%{q}%']
   if sub: sql+=' AND s.code=?'; args.append(sub)
   subject_id=qs.get('subject_id',[''])[0]
   if subject_id:sql+=' AND d.subject_id=?';args.append(subject_id)
   sql+=' ORDER BY d.created_at DESC'; rows=[dict(r) for r in c.execute(sql,args)]; c.close(); return self.json(rows)
  if path=='/api/courses':
    qs=parse_qs(p.query); subject=qs.get('subject',[''])[0]; c=db(); sql='SELECT c.*, s.code subject_code,s.name subject_name,u.full_name AS creator FROM courses c JOIN subjects s ON s.id=c.subject_id JOIN users u ON u.id=c.created_by WHERE c.status != ?'; args=['archived']
    if subject: sql+=' AND s.code=?'; args.append(subject)
    sql+=' ORDER BY c.created_at DESC'; rows=[dict(r) for r in c.execute(sql,args)]; c.close(); return self.json(rows)
  if path=='/api/progress':
    u=require_user(self)
    if not u:return
    with db() as c:
     course_rows=[dict(r) for r in c.execute('''SELECT p.*, c.title course_title, c.subject_id, s.code subject_code, NULL document_title
        FROM user_progress p JOIN courses c ON c.id=p.course_id JOIN subjects s ON s.id=c.subject_id
        WHERE p.user_id=? AND p.course_id IS NOT NULL ORDER BY p.updated_at DESC''',(u['id'],))]
     document_rows=[dict(r) for r in c.execute('''SELECT p.id, p.course_id, d.id document_id,
        COALESCE(p.progress_percent,0) progress_percent, COALESCE(p.last_position,0) last_position,
        COALESCE(p.completed,0) completed, p.updated_at, NULL course_title, d.title document_title,
        d.subject_id, s.code subject_code
        FROM documents d JOIN subjects s ON s.id=d.subject_id
        LEFT JOIN user_progress p ON p.document_id=d.id AND p.user_id=?
        WHERE d.uploaded_by=? ORDER BY d.created_at DESC''',(u['id'],u['id']))]
     analytics=quiz_progress_analytics(c,u['id'])
    rows=course_rows+document_rows
    measured=document_rows if document_rows else rows
    average=round(sum(int(row['progress_percent'] or 0) for row in measured)/len(measured)) if measured else 0
    return self.json({'items':rows,'summary':{'count':len(measured),'completed':sum(1 for row in measured if row['completed']),'average_percent':average},'analytics':analytics})
  if path in ('/api/progress/summary','/api/progress/timeline','/api/progress/today-tasks'):
   u=require_user(self)
   if not u:return
   with db() as c:analytics=quiz_progress_analytics(c,u['id'])
   if path.endswith('/summary'):return self.json({**analytics['summary'],'insights':analytics['insights']})
   if path.endswith('/today-tasks'):return self.json(analytics['tasks'])
   range_name=parse_qs(p.query).get('range',['7d'])[0]
   range_key={'7d':'day','8w':'week','6m':'month'}.get(range_name)
   if not range_key:return self.json({'error':'Khoảng thời gian phải là 7d, 8w hoặc 6m.'},422)
   return self.json({'range':range_name,'points':analytics['ranges'][range_key]})
  attempt_match=re.fullmatch(r'/api/quiz-attempts/(\d+)',path)
  if path=='/api/quiz-attempts/latest':
   u=require_user(self)
   if not u:return
   quiz_id=parse_qs(p.query).get('quiz_id',[''])[0]
   try:
    with db() as c:
     quiz_store.owned_quiz(c,u['id'],quiz_id)
     row=c.execute('SELECT id FROM quiz_attempts WHERE user_id=? AND quiz_id=? ORDER BY id DESC LIMIT 1',(u['id'],quiz_id)).fetchone()
     result=study.public_attempt(c,study.owned(c,u['id'],row['id'])) if row else None
    return self.json({'attempt':result})
   except LookupError as error:return self.json({'error':str(error)},404)
  if attempt_match:
   u=require_user(self)
   if not u:return
   try:
    with db() as c:result=study.public_attempt(c,study.owned(c,u['id'],int(attempt_match.group(1))))
    return self.json(result)
   except LookupError as error:return self.json({'error':str(error)},404)
  if path=='/api/study-time':
   u=require_user(self)
   if not u:return
   token=cookie_value(self,SESSION_COOKIE)
   with db() as c:
    ensure_study_session(c,u['id'],token)
    summary=study_time_summary(c,u['id'],token)
   return self.json(summary)
  if path=='/api/flashcards':
   u=require_user(self)
   if not u:return
   with db() as c:
    decks=[json.loads(row['payload']) for row in c.execute('SELECT payload FROM flashcard_decks WHERE user_id=? ORDER BY id',(u['id'],)).fetchall()]
   return self.json(decks)
  if path=='/api/flashcards/pronunciation':
   u=require_user(self)
   if not u:return
   return self.json(flashcards.pronunciation(parse_qs(p.query).get('term',[''])[0]))
  if path=='/api/streak':
    u=require_user(self)
    if not u:return
    with db() as c:
     streak=update_streak(c,u['id'])
     c.commit()
    return self.json(streak)
  if path=='/api/quizzes/history':
   u=require_user(self)
   if not u:return
   with db() as c:
    sessions=c.execute("SELECT id,title,created_at FROM chat_sessions WHERE user_id=? AND title LIKE 'QUIZ_CARD:%' ORDER BY created_at DESC,id DESC",(u['id'],)).fetchall()
    history=[]
    for session in sessions:
     message=c.execute("SELECT content FROM chat_messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1",(session['id'],)).fetchone()
     if not message:continue
     try:payload=json.loads(message['content'])
     except (TypeError,json.JSONDecodeError):continue
     if payload.get('tutor_exercise_id'):continue  # Internal attempt definition, not another Quiz Card.
     attempts=[]
     for attempt in c.execute("SELECT content,created_at FROM chat_messages WHERE session_id=? AND role='user' ORDER BY id DESC",(session['id'],)).fetchall():
      try:
       value=json.loads(attempt['content'])
       if value.get('kind')=='quiz_attempt': attempts.append({'score':value.get('score',0),'total':value.get('total',payload.get('question_count',0)),'score_10':round((value.get('score',0)*10)/max(value.get('total',1),1),2),'score_30':round((value.get('score',0)*30)/max(value.get('total',1),1),2),'created_at':attempt['created_at'],'duration':value.get('duration',0)})
      except (TypeError,json.JSONDecodeError):pass
     history.append({'id':session['id'],'title':payload.get('title',session['title'].replace('QUIZ_CARD:','')),'document_ids':payload.get('document_ids',[]),'question_count':payload.get('question_count',len(payload.get('questions',[]))),'created_at':session['created_at'],'attempts':attempts,'subject':payload.get('subject','Chưa phân loại'),'subject_id':payload.get('subject_id'),'time_limit':payload.get('time_limit',0),'difficulty':payload.get('difficulty','mixed')})
   return self.json({'items':history})
  m=re.fullmatch(r'/api/quizzes/(\d+)',path)
  if m:
   u=require_user(self)
   if not u:return
   with db() as c:
    quiz=c.execute("SELECT id,title,created_at FROM chat_sessions WHERE id=? AND user_id=? AND title LIKE 'QUIZ_CARD:%'",(m.group(1),u['id'])).fetchone()
    if not quiz:return self.json({'error':'Quiz không tồn tại'},404)
    message=c.execute("SELECT content FROM chat_messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1",(quiz['id'],)).fetchone()
   if not message:return self.json({'error':'Quiz chưa có câu hỏi'},422)
   payload=json.loads(message['content'])
   return self.json(public_quiz_payload(payload,quiz['id'],quiz['created_at']))
  m=re.fullmatch(r'/api/documents/(\d+)/content',path)
  if m:
   u=require_user(self)
   if not u:return
   with db() as c:
    row=c.execute('''SELECT d.*, d.original_filename AS file_name, s.code subject_code,
      s.name subject_name FROM documents d JOIN subjects s ON s.id=d.subject_id
      WHERE d.id=? AND d.uploaded_by=?''',(m.group(1),u['id'])).fetchone()
    if not row:return self.json({'error':'Tài liệu không tồn tại'},404)
    try:content=document_text(row,c)
    except (OSError,DocumentTextError,ValueError) as error:
     self.log_error('document text read failed for %s: %r',row['id'],error)
     return self.json({'error':'Không thể đọc nội dung văn bản của tài liệu'},422)
    advance_document_progress(c,u['id'],row['id'],25,len(content or ''))
    c.commit()
   return self.json({
    'id':row['id'],'title':row['title'],'file_name':row['file_name'],
    'file_type':row['file_type'],'subject_code':row['subject_code'],
    'subject_name':row['subject_name'],'content':content or '',
    'character_count':len(content or ''),'display_mode':'plain_text',
   })
  m=re.fullmatch(r'/api/documents/(\d+)',path)
  if m:
   u=require_user(self)
   if not u:return
   c=db(); r=c.execute('SELECT d.*, d.original_filename AS file_name, d.storage_path AS file_path, d.uploaded_by AS uploader_id, s.code subject_code,s.name subject_name,u.full_name AS uploader FROM documents d JOIN subjects s ON s.id=d.subject_id JOIN users u ON u.id=d.uploaded_by WHERE d.id=? AND d.uploaded_by=?',(m.group(1),u['id'])).fetchone(); c.close(); return self.json(dict(r) if r else {'error':'not found'},200 if r else 404)
  m=re.fullmatch(r'/view/(\d+)',path)
  if m:
   u=require_user(self)
   if not u:return
   c=db(); r=c.execute('SELECT * FROM documents WHERE id=? AND uploaded_by=?',(m.group(1),u['id'])).fetchone()
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
   u=require_user(self)
   if not u:return
   view=parse_qs(p.query).get('view',['0'])[0]=='1'
   c=db(); r=c.execute('SELECT * FROM documents WHERE id=? AND uploaded_by=?',(m.group(1),u['id'])).fetchone();
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
   health=tutor_engine.provider_health_snapshot()
   status['health']=health
   if status.get('engine')=='provider' and not health.get('ok',True):
    # Mô hình đang lỗi (hết quota, key sai, mạng): Nova tự trả lời từ tài liệu.
    reason=health.get('reason') or 'không rõ nguyên nhân'
    status['degraded']=True
    status['degraded_reason']=reason
    status['label']=f'{status["label"]} — tạm lỗi: {reason}'
    status['hint']='Nova đang trả lời từ tài liệu của bạn cho tới khi mô hình hoạt động lại.'
   return self.json(status,200)
  if path=='/api/ai-tutor/health':
   u=require_user(self)
   if not u:return
   status=tutor_config.engine_status()
   if status.get('engine')!='provider':
    return self.json({'ok':True,'engine':'local','provider_configured':False,
                      'message':'Nova is running offline; no provider is configured.'},200)
   result=get_engine().health_check()
   return self.json({'engine':'provider','provider':status.get('provider'),**result},
                    200 if result.get('ok') else 503)
  if path=='/api/ai-tutor/metrics':
   u=require_user(self)
   if not u:return
   if u['role']!='admin':
    return self.json({'error':'Only admins can view AI runtime metrics'},403)
   return self.json({'health':tutor_engine.provider_health_snapshot(),
                     'metrics':tutor_engine.provider_metrics_snapshot()},200)
  if path=='/api/ai-tutor/assessment':
   u=require_user(self)
   if not u:return
   with db() as c:
    row=tutor_store.latest_assessment(c,u['id'])
   plan=start_assessment({})
   return self.json({'questions':plan['questions'],'assessment':tutor_store.to_public_assessment(row)},200)
  if path=='/api/ai-tutor/memory':
   u=require_user(self)
   if not u:return
   with db() as c:
    result=tutor_memory.profile(c,u['id'])
    c.commit()
   return self.json(result,200)
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
 def do_DELETE(self):
  if not self.gateway_access(): return
  path=urlparse(self.path).path
  match=re.fullmatch(r'/api/quizzes/(\d+)',path)
  if match:
   u=require_user(self)
   if not u:return
   with db() as c:
    deleted=c.execute("DELETE FROM chat_sessions WHERE id=? AND user_id=? AND title LIKE 'QUIZ_CARD:%'",(match.group(1),u['id'])).rowcount;c.commit()
   return self.json({'ok':True} if deleted else {'error':'Bài trắc nghiệm không tồn tại'},200 if deleted else 404)
  match=re.fullmatch(r'/api/flashcards/([^/]+)',path)
  if match:
   u=require_user(self)
   if not u:return
   with db() as c:
    deleted=c.execute('DELETE FROM flashcard_decks WHERE id=? AND user_id=?',(unquote(match.group(1)),u['id'])).rowcount;c.commit()
   return self.json({'ok':True} if deleted else {'error':'Bộ thẻ không tồn tại'},200 if deleted else 404)
  if path=='/api/ai-tutor/conversations':
   user=require_user(self)
   if not user:return
   with db() as connection:
    deleted=tutor_store.delete_conversations(connection,user['id'])
   return self.json({'ok':True,'deleted':deleted,'memory_retained':True},200)
  match=re.fullmatch(r'/api/ai-tutor/conversations/([^/]+)',path)
  if match:
   user=require_user(self)
   if not user:return
   client_key=unquote(match.group(1))
   with db() as connection:
    deleted=tutor_store.delete_conversation(connection,user['id'],client_key)
   if not deleted:return self.json({'error':'Cuộc hội thoại không tồn tại'},404)
   return self.json({'ok':True,'conversation_id':client_key},200)
  match=re.fullmatch(r'/api/documents/(\d+)',path)
  if not match:return self.json({'error':'not found'},404)
  user=require_user(self)
  if not user:return
  with db() as connection:
   document=connection.execute(
    'SELECT id,storage_path FROM documents WHERE id=? AND uploaded_by=?',
    (match.group(1),user['id']),
   ).fetchone()
   if not document:return self.json({'error':'Tài liệu không tồn tại'},404)
   connection.execute('DELETE FROM documents WHERE id=?',(document['id'],))
   connection.commit()
  stored_path=document['storage_path']
  file_path=os.path.abspath(stored_path if os.path.isabs(stored_path) else os.path.join(ROOT,stored_path))
  upload_root=os.path.abspath(UP)
  try:
   inside_uploads=os.path.commonpath([upload_root,file_path])==upload_root
  except ValueError:
   inside_uploads=False
  file_removed=False
  if inside_uploads and os.path.isfile(file_path):
   try:
    os.remove(file_path); file_removed=True
   except OSError as error:
    self.log_error('document file cleanup failed after delete: %r',error)
  return self.json({'ok':True,'document_id':document['id'],'file_removed':file_removed},200)
 def do_POST(self):
  self.plan_reservation=None
  self.plan_response_status=500
  try:
   self.post_with_permissions()
  finally:
   if self.plan_reservation and self.plan_response_status >= 400:
    with db() as c: permissions.refund_tutor(c,self.plan_reservation)
   self.plan_reservation=None
 def post_with_permissions(self):
  if not self.gateway_access(): return
  try:
   content_length=int(self.headers.get('Content-Length','0'))
  except (TypeError,ValueError):
   return self.json({'error':'Content-Length không hợp lệ'},400)
  if content_length < 0:
   return self.json({'error':'Content-Length không hợp lệ'},400)
  if content_length > MAX_UPLOAD_BYTES + UPLOAD_MULTIPART_OVERHEAD_BYTES:
   return self.json({'error':f'Payload vượt quá giới hạn upload {MAX_UPLOAD_BYTES // (1024 * 1024)}MB'},413)
  try:
   p=urlparse(self.path); path=p.path; data=self.body()
  except ValueError:
   return self.json({'error':'Content-Length không hợp lệ'},400)
  feature=permissions.request_feature(path,{})
  if feature or path in permissions.CHAT_PATHS:
   u=require_user(self)
   if not u:return
   x={} if path=='/api/flashcards/preview' else json_body(data)
   if not isinstance(x,dict):return self.json({'error':'Dữ liệu yêu cầu không hợp lệ'},400)
   with db() as c:
    plan=permissions.plan_for(c,u['id'])
    try:
     feature=permissions.request_feature(path,x)
     if feature: permissions.require_feature(plan,feature)
     if path in permissions.CHAT_PATHS and str(x.get('message') or x.get('question') or '').strip():
      self.plan_reservation=permissions.reserve_tutor(c,u['id'],plan)
    except permissions.PermissionDenied as error:return self.json({'error':str(error),'code':error.code},error.status)
  if handle_study_post(self,path,data):return
  if handle_learning_post(self,path,data):return
  if path in ('/api/flashcards/preview','/api/documents/preview'):
   u=require_user(self)
   if not u:return
   ctype=self.headers.get('Content-Type','')
   if 'multipart/form-data' not in ctype or 'boundary=' not in ctype:
    return self.json({'error':'multipart form required'},400)
   msg=BytesParser(policy=default).parsebytes(b'Content-Type: '+ctype.encode()+b'\r\n\r\n'+data)
   parts=[part for part in msg.iter_parts() if part.get_filename()] if msg.is_multipart() else []
   if len(parts)!=1:return self.json({'error':'Hãy chọn một file'},400)
   filename=parts[0].get_filename(); content=parts[0].get_payload(decode=True) or b''
   extension=os.path.splitext(filename)[1].lower()
   if extension not in ALLOWED_UPLOAD_EXTENSIONS:return self.json({'error':'Định dạng file không được hỗ trợ'},400)
   if not content:return self.json({'error':'File không được rỗng'},400)
   if len(content)>MAX_UPLOAD_BYTES:return self.json({'error':'File quá lớn'},413)
   if extension=='.pdf' and not content.lstrip().startswith(b'%PDF-'):
    return self.json({'error':'File PDF không hợp lệ'},422)
   if extension in ('.docx','.pptx','.xlsx') and not content.startswith(b'PK'):
    return self.json({'error':'File Office không hợp lệ'},422)
   try:
    with tempfile.TemporaryDirectory() as folder:
     target=os.path.join(folder,'preview'+extension)
     with open(target,'wb') as output:output.write(content)
     extracted=extract_document_text(target)
    if not extracted.strip():raise DocumentTextError('empty')
   except Exception:
    return self.json({'error':'Không đọc được nội dung chữ trong tài liệu'},422)
   suggest = flashcards.document_suggestion if path=='/api/documents/preview' else flashcards.suggest
   return self.json(suggest(extracted,filename,get_engine()))
  if path=='/api/flashcards':
   u=require_user(self)
   if not u:return
   try:deck=flashcards.normalize_deck(json_body(data))
   except ValueError as error:return self.json({'error':str(error)},400)
   with db() as c:
    study.lock(c,u['id'])
    existing=c.execute('SELECT id FROM flashcard_decks WHERE id=? AND user_id=?',(deck['id'],u['id'])).fetchone()
    if existing:
     original=c.execute('SELECT payload FROM flashcard_decks WHERE id=? AND user_id=?',(deck['id'],u['id'])).fetchone()
     original_cards={card['id']:card for card in json.loads(original['payload'])['cards']}
     for card in deck['cards']:
      if card['id'] in original_cards:
       previous=original_cards[card['id']]
       card.update(remembered=previous.get('remembered',False),rememberedAt=previous.get('rememberedAt'))
    payload=json.dumps(deck,ensure_ascii=False)
    if existing:c.execute('UPDATE flashcard_decks SET payload=? WHERE id=? AND user_id=?',(payload,deck['id'],u['id']))
    else:c.execute('INSERT INTO flashcard_decks(id,user_id,payload) VALUES(?,?,?)',(deck['id'],u['id'],payload))
    c.commit()
   return self.json(deck,200 if existing else 201)
  match=re.fullmatch(r'/api/flashcards/([^/]+)/review',path)
  if match:
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict):return self.json({'error':'Đánh giá không hợp lệ'},422)
   try:
    with db() as c:
     study.lock(c,u['id'])
     card_id=x.get('card_id') or unquote(match.group(1))
     if x.get('card_id'):x={**x,'deckId':unquote(match.group(1))}
     result=study.review(c,u['id'],card_id,x);c.commit()
    return self.json(result)
   except LookupError as error:return self.json({'error':str(error)},404)
   except ValueError as error:return self.json({'error':str(error)},422)

  if path=='/api/quizzes/generate':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   try:
    count=quizzes.validate_count(x.get('question_count',10) if isinstance(x,dict) else None)
    difficulty=x.get('difficulty','mixed');time_limit=x.get('time_limit',0)
    if difficulty not in ('easy','medium','hard','mixed'):raise ValueError('Độ khó không hợp lệ.')
    if type(time_limit) is not int or not 0 <= time_limit <= 240:raise ValueError('Thời gian phải từ 1 đến 240 phút hoặc không giới hạn.')
    with db() as c:docs,subject=learning_sources(c,u['id'],x)
    limits=quizzes.content_limits(docs)
    if count>limits['max_questions']:raise ValueError(f"Tối đa {limits['max_questions']} câu dựa trên tài liệu đã chọn.")
    engine=get_engine()
    if not engine.uses_model:
     return self.json({'error':'Nova AI chưa được kết nối. Bạn có thể tạo bài ở chế độ Thủ công hoặc thử lại khi AI sẵn sàng.','code':'ai_not_configured','retryable':False},503)
    questions=quizzes.generate(docs,count,engine,difficulty)
   except LookupError as error:return self.json({'error':str(error)},404)
   except quizzes.QuizGenerationError as error:return self.json({'error':str(error),'code':'quiz_quality_failed'},422)
   except ValueError as error:return self.json({'error':str(error)},400)
   except TutorEngineError:return self.json({'error':'Nova chưa thể tạo bài trắc nghiệm lúc này. Vui lòng thử lại.','retryable':True},503)
   title=flashcards.text(x.get('title'),100) or 'Quiz: '+', '.join(doc['title'] for doc in docs[:2])
   for index,question in enumerate(questions):question['id']=f'q{index+1}'
   document_ids=[doc['id'] for doc in docs]
   payload={'kind':'quiz','title':title,'subject_id':subject['id'],'subject':subject['name'],'document_ids':document_ids,'question_count':len(questions),'questions':questions,'time_limit':time_limit,'difficulty':difficulty}
   with db() as c:
    quiz_id=c.execute('INSERT INTO chat_sessions(user_id,subject_id,document_id,title) VALUES(?,?,?,?)',(u['id'],subject['id'],document_ids[0],'QUIZ_CARD:'+title)).lastrowid
    c.execute('INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)',(quiz_id,'assistant',json.dumps(payload,ensure_ascii=False)));c.commit()
   return self.json(public_quiz_payload(payload,quiz_id),201)
  m=re.fullmatch(r'/api/quizzes/(\d+)/submit',path)
  if m:
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict):return self.json({'error':'Đáp án không hợp lệ'},400)
   try:
    with db() as c:
     study.lock(c,u['id'])
     _,quiz=quiz_store.owned_quiz(c,u['id'],m.group(1))
     study.migrate(c,u['id'])
     if x.get('run_id') is not None:
      row=c.execute('SELECT id FROM quiz_attempts WHERE user_id=? AND quiz_id=? AND legacy_run_id=?',(u['id'],m.group(1),x['run_id'])).fetchone()
      if not row:raise ValueError('Lượt làm bài không tồn tại.')
      attempt_id=row['id']
     else:
      if quiz.get('time_limit'):raise ValueError('Hãy bắt đầu lượt làm bài trước khi nộp.')
      attempt_id=study.start(c,u['id'],m.group(1),x)['attemptId']
     result=finish_study_attempt(c,u['id'],attempt_id,x);c.commit()
    return self.json(result)
   except LookupError as error:return self.json({'error':str(error)},404)
   except ValueError as error:return self.json({'error':str(error)},400)

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
   with db() as c:ensure_study_session(c,user['id'],token)
   return self.json({'user':user,'expires_at':expires_at},200,{'Set-Cookie':session_cookie(token)})
  if path in ('/api/logout','/api/auth/logout'):
   token=cookie_value(self, SESSION_COOKIE)
   with db() as c:
    close_study_session(c,token)
    revoke_session(c, token)
   return self.json({'ok':True},200,{'Set-Cookie':session_cookie('',0)})
  if path=='/api/auth/profile':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu hồ sơ không hợp lệ'},400)
   first_name=x.get('first_name',''); last_name=x.get('last_name','')
   if not isinstance(first_name,str) or not isinstance(last_name,str): return self.json({'error':'Dữ liệu hồ sơ không hợp lệ'},400)
   with db() as c: user,error=complete_profile(c,u['id'],first_name,last_name)
   if error:return self.json({'error':error},400)
   return self.json({'user':user},200)
  if path in ('/api/auth/password/otp', '/api/auth/forgot-password'):
   x=json_body(data)
   identifier=x.get('identifier','') if isinstance(x,dict) else ''
   if not isinstance(identifier,str) or not identifier.strip(): return self.json({'error':'Vui lòng nhập email hoặc số điện thoại'},400)
   if not reset_email_ready(): return self.json({'error':'Dịch vụ gửi email chưa được cấu hình'},503)
   with db() as c: delivery=start_password_reset(c,identifier)
   if not delivery:return self.json({'ok':True},202)
   try: send_reset_otp(delivery['email'],delivery['code'])
   except Exception as error:
    self.log_error('Password-reset email failed: %r',error)
    return self.json({'error':'Không thể gửi mã OTP. Vui lòng thử lại sau.'},503)
   return self.json({'ok':True},202)
  if path in ('/api/auth/password/verify', '/api/auth/reset-password/verify'):
   x=json_body(data)
   identifier=x.get('identifier','') if isinstance(x,dict) else ''; code=x.get('code','') if isinstance(x,dict) else ''
   with db() as c: reset_token,error=verify_password_reset(c,identifier,code)
   if error:return self.json({'error':error},400)
   return self.json({'reset_token':reset_token},200)
  if path in ('/api/auth/password/reset', '/api/auth/reset-password'):
   x=json_body(data)
   reset_token=x.get('reset_token','') if isinstance(x,dict) else ''; password=x.get('password','') if isinstance(x,dict) else ''
   if not isinstance(reset_token,str) or not isinstance(password,str): return self.json({'error':'Dữ liệu đặt lại mật khẩu không hợp lệ'},400)
   with db() as c: error=reset_password(c,reset_token,password)
   if error:return self.json({'error':error},400)
   return self.json({'ok':True},200)
  if path in ('/api/register','/api/auth/register'):
   try:
    x=json.loads(data or '{}')
   except json.JSONDecodeError:
    return self.json({'error':'Dữ liệu đăng ký không hợp lệ'},400)
   name=x.get('name',''); first_name=x.get('first_name',''); last_name=x.get('last_name',''); email=x.get('email',''); pw=x.get('password','')
   if not all(isinstance(v,str) for v in (name,first_name,last_name,email,pw)):
    return self.json({'error':'Dữ liệu đăng ký không hợp lệ'},400)
   with db() as c:
    try:
     result, error = register_user(c, name, email, pw, first_name, last_name)
    except Exception as exc:
     if not isinstance(exc,sqlite3.IntegrityError) and getattr(exc,'errno',None)!=1062:
      raise
     result, error = None, 'Email đã tồn tại'
   if error:
    return self.json({'error':error},400)
   user, token, expires_at = result
   with db() as c:ensure_study_session(c,user['id'],token)
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
    if c.execute('SELECT id FROM subjects WHERE created_by=? AND code=?',(u['id'],code)).fetchone():return self.json({'error':'Mã môn học đã tồn tại'},409)
    row=c.execute('INSERT INTO subjects(code,name,description,created_by) VALUES(?,?,?,?)',(code,name,description,u['id'])).lastrowid
    c.commit(); subject=c.execute('SELECT id,code,name,description FROM subjects WHERE id=?',(row,)).fetchone()
   return self.json(dict(subject),201)
  if path=='/api/subscription/checkout':
   u=require_user(self)
   if not u:return
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'invalid checkout data'},400)
   target_code=str(x.get('plan','')).lower(); cycle=str(x.get('billing_cycle','month')).lower()
   if target_code not in ('free','plus','pro') or cycle not in ('month','year'):
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
     effective_at=subscription_effective_at(cycle)
     c.execute('INSERT INTO subscription_changes(user_id,target_plan_id,billing_cycle,status,effective_at) VALUES(?,?,?,?,?)',(u['id'],target['id'],cycle,'scheduled',effective_at))
     c.commit()
     return self.json({'plan':current_code,'status':'active','scheduled_change':{'plan':target_code,'billing_cycle':cycle,'effective_at':effective_at},'change_type':'downgrade_scheduled'})
   return self.json({'error':'Cổng thanh toán chưa được tích hợp. Yêu cầu demo không thu tiền và không kích hoạt gói trả phí.','mode':'demo','payment_status':'not_configured'},501)
  if path=='/api/subscription/cancel':
   u=require_user(self)
   if not u:return
   with db() as c:
    free=c.execute('SELECT id FROM plans WHERE lower(name)=? AND status=?',('free','active')).fetchone()
    active=c.execute('SELECT s.id,p.name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status=? ORDER BY s.id DESC LIMIT 1',(u['id'],'active')).fetchone()
    if not active or str(active['name']).lower()=='free':return self.json({'error':'no paid subscription to cancel'},409)
    c.execute('UPDATE subscription_changes SET status=? WHERE user_id=? AND status=?',('cancelled',u['id'],'scheduled'))
    effective_at=subscription_effective_at('month')
    c.execute('INSERT INTO subscription_changes(user_id,target_plan_id,billing_cycle,status,effective_at) VALUES(?,?,?,?,?)',(u['id'],free['id'],'month','scheduled',effective_at)); c.commit()
   return self.json({'ok':True,'change_type':'cancellation_scheduled','scheduled_change':{'plan':'free','effective_at':effective_at}})
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
     subject=c.execute('SELECT id FROM subjects WHERE id=? AND created_by=?',(subject_id,u['id'])).fetchone()
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
      if target=='document_id':
       target_row=c.execute('SELECT id FROM documents WHERE id=? AND uploaded_by=?',(raw_id,u['id'])).fetchone()
      else:
       target_row=c.execute('SELECT id FROM courses WHERE id=?',(raw_id,)).fetchone()
      if not target_row:return self.json({'error':'Đối tượng học không tồn tại'},404)
      if target=='document_id':
       return self.json({'error':'Tiến độ tài liệu được hệ thống cập nhật tự động từ hoạt động học'},403)
      existing=c.execute(f'SELECT id FROM user_progress WHERE user_id=? AND {target}=?',(u['id'],raw_id)).fetchone()
      if existing:
       c.execute('UPDATE user_progress SET progress_percent=?,last_position=?,completed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(progress,last_position,int(completed),existing['id']))
       progress_id=existing['id']
      else:
        progress_id=c.execute(f'INSERT INTO user_progress(user_id,{target},progress_percent,last_position,completed) VALUES(?,?,?,?,?)',(u['id'],raw_id,progress,last_position,int(completed))).lastrowid
      c.commit(); row=c.execute('SELECT * FROM user_progress WHERE id=?',(progress_id,)).fetchone()
     return self.json(dict(row),200)
  if path=='/api/web-assistant/chat':
   # Chatbot tư vấn thông tin StudyHub cho khách vãng lai: KHÔNG cần đăng nhập, nhưng
   # vẫn chịu giới hạn tần suất chung của API và trần số câu gọi mô hình mỗi ngày mỗi IP.
   x=json_body(data)
   if not isinstance(x,dict): return self.json({'error':'Dữ liệu câu hỏi không hợp lệ'},400)
   message=str(x.get('message') or '').strip()
   if not message: return self.json({'error':'Câu hỏi không được để trống'},400)
   if len(message)>600: return self.json({'error':'Câu hỏi quá dài (tối đa 600 ký tự)'},400)
   history=x.get('history') if isinstance(x.get('history'),list) else []
   return self.json(web_assistant.ask(message,history=history,client_ip=self.client_address[0]),200)
  if path in ('/api/ai/chat','/api/chat'):
   u=require_user(self)
   if not u:return
   x = json_body(data)
   if not isinstance(x, dict):return self.json({'error': 'Dữ liệu câu hỏi không hợp lệ'}, 400)
   tutor_contract = path == '/api/ai-tutor/chat'
   question = (
    x.get('message', '')
    if tutor_contract
    else x.get('question', '')
   ).strip()

   document_id = x.get('document_id')

   if tutor_contract:
    # code xử lý AI Tutor ở đây
    file_ids=x.get('file_ids',[])
    if isinstance(file_ids,list) and file_ids:
     document_id=file_ids[0]
    conversation_id=str(x.get('conversation_id') or secrets.token_hex(16))
    mode=str(x.get('mode') or 'explain').lower()
    if mode not in tutor_engine.MODES:
     return self.json({'error':'invalid tutor mode'},400)
   if not question:return self.json({'error':'Câu hỏi không được để trống'},400)
   with db() as c:
    if document_id:
     try: document_id=int(document_id)
     except (TypeError,ValueError): return self.json({'error':'invalid document id'},400)
     rows=c.execute('SELECT id,title,description,storage_path FROM documents WHERE id=? AND uploaded_by=?',(document_id,u['id'])).fetchall()
     if not rows:return self.json({'error':'document not found'},404)
    else:
     rows=c.execute('SELECT id,title,description,storage_path FROM documents WHERE uploaded_by=? ORDER BY created_at DESC',(u['id'],)).fetchall()
    tokens=[token.lower() for token in re.findall(r'\w+',question) if len(token)>2]
    matches=[]
    for row in rows:
     text=document_text(row,c)
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
   depth=str(x.get('depth') or 'auto').lower()
   if depth not in tutor_engine.DEPTHS:
    return self.json({'error':'invalid explanation depth'},400)
   requested_model=str(x.get('model') or 'auto').strip()
   settings=tutor_config.provider_settings()
   allowed_models=[] if not settings else tutor_config.model_list([settings['model'],*settings['fallback_models']])
   if requested_model!='auto' and requested_model not in allowed_models:
    return self.json({'error':'Model không được cấu hình hoặc không có quyền sử dụng'},400)
   model_override=None if requested_model=='auto' else requested_model
   message=str(x.get('message') or '').strip()
   if not message:return self.json({'error':'Câu hỏi không được để trống'},400)
   # Khung chat một ô: người học không chọn chế độ nữa, Nova tự đọc câu hỏi để quyết
   # định giải thích / giải bài / gợi ý / tóm tắt / tạo quiz. Vẫn nhận chế độ tường minh
   # cho client cũ và cho test.
   if mode in ('', 'auto', 'tu_dong'):
    mode=tutor_engine.detect_mode(message)
   if mode not in tutor_engine.MODES:
    return self.json({'error':'invalid tutor mode'},400)
   file_ids=x.get('file_ids',[])
   if not isinstance(file_ids,list):
    return self.json({'error':'Danh sách tài liệu không hợp lệ'},400)
   if len(file_ids)>5:
    return self.json({'error':'Nova chỉ hỗ trợ tối đa 5 tài liệu trong một cuộc trò chuyện'},400)
   conversation_key=str(x.get('conversation_id') or '').strip() or secrets.token_hex(16)
   preference_intent=tutor_memory.chat_preference(message)
   if preference_intent:
    context,sources,query_keywords,agent_trace='',[],[],[{'tool':'preference_router','status':'handled'}]
   else:
    try:
     context,sources,query_keywords=tutor_context(u['id'],file_ids,message,fallback=mode in ('summarize','generate_quiz'))
    except LookupError:
     return self.json({'error':'Tài liệu không tồn tại hoặc không thuộc tài khoản này'},404)
    context,tool_sources,agent_trace=tutor_agent.run(message,context)
    sources.extend(tool_sources)
   engine=get_engine()
   retrieval_tier='conversation' if preference_intent else ('documents' if context else 'miss')
   cached_knowledge=None
   if not context and not preference_intent:
    cached_knowledge=external_cache_lookup(message,query_keywords)
    if cached_knowledge:
     context=f"Bộ nhớ kiến thức bên ngoài: {cached_knowledge['answer']}"
     sources=[{'id':cached_knowledge['id'],'title':'Kho kiến thức bên ngoài','type':'external_cache'}]
     retrieval_tier='external_cache'
   with db() as c:
    conversation=tutor_store.conversation_for(c,u['id'],conversation_key,mode=mode,title=message[:60])
    conversation_id=int(conversation['id']); conversation_title=str(conversation['title'] or '')
    history=tutor_store.history(c,conversation_id,8)
    memory_profile=tutor_memory.profile(c,u['id']) if permissions.allowed(permissions.plan_for(c,u['id']),'ai_analytics') else {}
    profile_summary=str(memory_profile.get('summary') or '')
    if 'Chưa đủ dữ liệu' in profile_summary:
     profile_summary=''
   quiz=None; quiz_topic=''
   if mode=='generate_quiz':
    quiz,quiz_topic=chat_quiz(engine,message,context)
   try:
    if preference_intent:
     answer=preference_intent['reply']
    elif quiz:
     answer=(f'## Quiz nhanh: {quiz_topic}\n\n'
             f'{len(quiz["questions"])} câu hỏi bám theo tài liệu. Chọn đáp án rồi bấm **Kiểm tra** để xem kết quả.')
    elif retrieval_tier=='miss' and not getattr(engine,'uses_model',False):
     answer=('## Chưa tìm thấy kiến thức phù hợp\n\n'
             'Nova đã lọc từ khóa chính, kiểm tra tài liệu của bạn và tra kho kiến thức bên ngoài '
             'nhưng chưa có kết quả. Hãy bổ sung tài liệu liên quan hoặc cấu hình AI provider để '
             'Nova tìm hiểu và lưu câu trả lời vào cache cho lần sau.')
    else:
     answer=engine.answer(mode=mode,question=message,context=context,history=history,
                          learner_profile=profile_summary,depth=depth,model=model_override)
   except TutorEngineError as error:
    return self.json({'error':f'AI Tutor tạm thời không trả lời được: {error}','retryable':True},502)
   health=tutor_engine.provider_health_snapshot()
   if retrieval_tier=='miss' and getattr(engine,'uses_model',False) and health.get('ok',True):
    provider=tutor_config.engine_status().get('provider') or 'external-ai'
    cache_id=external_cache_store(message,answer,query_keywords,provider)
    retrieval_tier='external_provider'
    sources=[{'id':cache_id,'title':f'Kiến thức chung · {provider}','type':'external_provider'}]
   elif retrieval_tier=='external_cache' and not quiz:
    answer=(f'## Kiến thức ngoài tài liệu\n\n{answer}\n\n'
            '> Nguồn: kho kiến thức bên ngoài đã lưu, do tài liệu của bạn không có nội dung phù hợp.')
   degraded=bool(getattr(engine,'name','')=='provider-resilient' and not health.get('ok',True))
   with db() as c:
    if not tutor_store.conversation_owned(c,conversation_id,u['id']):
     return self.json({'conversation_id':conversation_key,'role':'assistant','content':'',
       'discarded':True,'reason':'conversation_deleted'},200)
    tutor_store.add_message(c,conversation_id,'user',message,mode)
    if quiz:quiz['quiz_id']=persist_tutor_quiz(c,u['id'],quiz)
    message_id=tutor_store.add_message(c,conversation_id,'assistant',answer,mode,payload=quiz)
    tutor_memory.observe_question(c,u['id'],message)
    tutor_memory.consolidate(c,u['id'])
    for source in sources:
     if source.get('type')=='document':
      advance_document_progress(c,u['id'],source.get('id'),60)
    if conversation_title in ('','Cuộc hội thoại mới'):
     tutor_store.rename_conversation(c,conversation_id,message[:60])
    c.commit()
   provider_engine=getattr(engine,'primary',None)
   model_used=getattr(provider_engine,'last_model',None)
   failovers=getattr(provider_engine,'last_failovers',[])
   return self.json({'conversation_id':conversation_key,'message_id':str(message_id),'role':'assistant','content':answer,'sources':sources,'mode':mode,'depth':depth,
     'model_requested':requested_model,'model_used':model_used,'model_failovers':failovers,
     'quiz':quiz,
     'retrieval':{'tier':retrieval_tier,'keywords':query_keywords},
     'agent_trace':agent_trace,
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
    if str(x.get('target_level') or assessment.get('target_level') or '').strip().lower()=='advanced':
     try: permissions.require_feature(permissions.plan_for(c,u['id']),'advanced_roadmap')
     except permissions.PermissionDenied as error:return self.json({'error':str(error),'code':error.code},error.status)
   subject=str(x.get('subject') or assessment.get('subject') or '').strip()
   goal=str(x.get('goal') or assessment.get('goal') or '').strip()
   if not subject or not goal:
    return self.json({'error':'Cần hoàn thành phần đánh giá trước khi tạo lộ trình'},400)
   payload={'subject':subject,'goal':goal,
     'current_level':x.get('current_level') or assessment.get('current_level'),
     'target_level':x.get('target_level') or assessment.get('target_level'),
     'pace':x.get('pace') or assessment.get('pace') or 'steady',
     'study_time':x.get('study_time') or assessment.get('study_time') or 240,
     'learner_type':str(x.get('learner_type') or '').strip(),
     'deadline_weeks':x.get('deadline_weeks') or 4,
     'constraints':str(x.get('constraints') or '').strip(),
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
    choice=exercise['exercise_type']=='multiple_choice'
    if choice:
     try:
      study.lock(c,u['id'])
      attempt_id=x.get('attemptId')
      if attempt_id is None:
       run=study.start(c,u['id'],exercise_quiz(c,u['id'],exercise['id']),x)
       attempt_id=run['attemptId']
      if type(attempt_id) is not int:raise ValueError('Mã lượt làm bài không hợp lệ.')
      attempt=study.owned(c,u['id'],attempt_id)
      quiz=json.loads(attempt['quiz_payload'])
      if quiz.get('tutor_exercise_id')!=exercise['id']:raise LookupError('Lượt làm bài không thuộc bài tập này.')
      cached=json.loads(attempt['result'] or '{}').get('exercise_response')
      if cached:return self.json(cached,201)
      if attempt['status']=='submitted':raise ValueError('Lượt làm bài đã nộp. Hãy bắt đầu lượt mới.')
      options=quiz['questions'][0]['options']
      selected=next((i for i,option in enumerate(options) if option.casefold()==answer.casefold()),None)
      quiz_result=study.submit(c,u['id'],attempt_id,{**x,'answers':{'q1':selected} if selected is not None else {}})
     except LookupError as error:return self.json({'error':str(error)},404)
     except ValueError as error:return self.json({'error':str(error)},422)
    if not choice:update_streak(c,u['id'],record=True)
    submission_id=tutor_store.add_submission(c,exercise['id'],u['id'],answer=answer,answer_type=answer_type,result=result,commit=not choice)
    submissions=tutor_store.submissions_for_roadmap(c,exercise['roadmap_id'],u['id'])
    progress=tutor_store.progress_for_roadmap(c,exercise['roadmap_id'],u['id'])
    if roadmap_row:
     stored=json.loads(roadmap_row['payload']) if roadmap_row['payload'] else {}
     if stored:
      adapted=adapt_roadmap(stored,submissions)
      tutor_store.update_roadmap(c,exercise['roadmap_id'],adapted,adapted.get('adaptation_note'),commit=not choice)
    response=tutor_store.submission_payload(submission_id,exercise,result)
    if adapted:
     response['adaptation']={'note':adapted.get('adaptation_note'),'average_score':adapted.get('average_score')}
    response['progress']=progress
    if choice:
     response['attemptId']=attempt_id
     c.execute('UPDATE quiz_attempts SET result=? WHERE id=?',(json.dumps({**quiz_result,'exercise_response':response},ensure_ascii=False),attempt_id))
    c.commit()
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
   if len(content)>MAX_UPLOAD_BYTES:return self.json({'error':f'File vượt quá giới hạn {MAX_UPLOAD_BYTES // (1024 * 1024)}MB'},413)
   try:
    subject_id=int(sid)
   except ValueError:
    return self.json({'error':'Môn học không hợp lệ'},400)
   c=db()
   try:
    subject=c.execute('SELECT id FROM subjects WHERE id=? AND created_by=?',(subject_id,u['id'])).fetchone()
   except Exception:
    c.close(); return self.json({'error':'Không thể kiểm tra môn học'},500)
   if not subject:
    c.close(); return self.json({'error':'Môn học không tồn tại'},400)
   try: permissions.check_upload(c,u['id'],len(content))
   except permissions.PermissionDenied as error:
    c.rollback(); c.close(); return self.json({'error':str(error),'code':error.code},error.status)
   safe=re.sub(r'[^A-Za-z0-9._-]','_',filename); stored=f'{secrets.token_hex(8)}_{safe}'
   target=os.path.join(UP,stored)
   ext=extension.lstrip('.')
   mime={'.pdf':'application/pdf','.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}.get(extension,'application/octet-stream')
   try:
    with open(target,'wb') as fh: fh.write(content)
    extracted_text=extract_document_text(target)
    if not split_document_text(extracted_text):
     raise DocumentTextError('no extractable text')
    storage_path=target if configured_upload_dir else os.path.join('uploads',stored)
    document_id=c.execute('INSERT INTO documents(title,description,original_filename,storage_filename,file_type,mime_type,file_size,storage_path,status,visibility,subject_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(title,fields.get('description','').strip(),filename,stored,ext,mime,len(content),storage_path,'ready','private',subject_id,u['id'])).lastrowid
    chunk_count=store_document_chunks(c,document_id,extracted_text)
    c.commit()
   except Exception as error:
    cleanup_errors=[]
    try: c.rollback()
    except Exception as cleanup_error: cleanup_errors.append(cleanup_error)
    try:
     if os.path.exists(target): os.remove(target)
    except OSError as cleanup_error: cleanup_errors.append(cleanup_error)
    c.close()
    if cleanup_errors: self.log_error('upload cleanup failed after %r: %r',error,cleanup_errors)
    if isinstance(error,DocumentTextError):
     return self.json({'error':'Không đọc được nội dung chữ trong tài liệu. Hãy dùng PDF có text, DOCX, PPTX, TXT, MD hoặc CSV.'},422)
    return self.json({'error':'Không thể lưu tài liệu'},500)
   c.close(); return self.json({'ok':True,'document_id':document_id,'status':'ready','chunk_count':chunk_count},201)
  return self.json({'error':'not found'},404)

class StudyHubHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    request_queue_size = 64
    daemon_threads = True
    def __init__(self, server_address, RequestHandlerClass, max_concurrent=None):
        self.request_slots = threading.BoundedSemaphore(max_concurrent or positive_int_env('STUDYHUB_MAX_CONCURRENT_REQUESTS',32))
        super().__init__(server_address, RequestHandlerClass)
    def process_request(self, request, client_address):
        if not self.request_slots.acquire(blocking=False):
            body=json.dumps({'error':'API gateway is busy','code':'gateway_overloaded'}).encode()
            response=(b'HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json; charset=utf-8\r\n'
                      b'Cache-Control: no-store\r\nRetry-After: 1\r\nConnection: close\r\nContent-Length: '+str(len(body)).encode()+b'\r\n\r\n'+body)
            try: request.sendall(response)
            except OSError: pass
            finally: self.shutdown_request(request)
            return
        try: super().process_request(request, client_address)
        except Exception:
            self.request_slots.release()
            raise
    def process_request_thread(self, request, client_address):
        try: super().process_request_thread(request, client_address)
        finally: self.request_slots.release()

def main():
    init_db()
    port=int(os.environ.get('PORT') or os.environ.get('STUDYHUB_PORT','5000'))
    host=os.environ.get('STUDYHUB_HOST') or ('0.0.0.0' if os.environ.get('PORT') else '127.0.0.1')
    status=tutor_config.engine_status()
    environment=os.environ.get('STUDYHUB_ENV','development')
    database_mode='mysql' if mysql_requested() else 'sqlite'
    print(f'Environment: {environment}')
    print(f'Database: {database_mode} (configured)')
    print(f'Rate limit: enabled (api={API_RATE_LIMIT}/minute, burst={API_BURST}; auth={AUTH_RATE_LIMIT}/minute, burst={AUTH_BURST})')
    print(f'AI provider mode: {status["engine"]}')
    detail=f" ({status['provider']} / {status['model']})" if status['engine']=='provider' else ' - provider key not configured'
    print(f'AI Tutor engine: {status["engine"]}{detail}')
    print(f'StudyHub running at http://{host}:{port}')
    with StudyHubHTTPServer((host, port), H) as server:
        server.serve_forever()
if __name__=='__main__':main()
