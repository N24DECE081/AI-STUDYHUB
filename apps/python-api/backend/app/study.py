"""Account-owned learning records. Legacy Quiz routes use the same records.

All new timestamps are UTC; calendar buckets use the application's GMT+7 clock.
"""
import json
import secrets
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

from .quizzes import repository as quizzes
from .security.service import update_streak
from .timezone import VIETNAM_TZ


def stamp(value=None):
    return (value or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')


def parsed(value):
    date = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return date.replace(tzinfo=timezone.utc) if date.tzinfo is None else date.astimezone(timezone.utc)


def lock(conn, user_id):
    if getattr(conn, 'dialect', '') == 'mysql':
        conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', (user_id,)).fetchone()
    else:
        conn.execute('BEGIN IMMEDIATE')


def key(payload):
    value = payload.get('idempotencyKey', payload.get('idempotency_key'))
    if value is None:value = secrets.token_hex(16)
    if not isinstance(value, str) or not 1 <= len(value) <= 80:
        raise ValueError('Khóa đồng bộ không hợp lệ.')
    return value


def action_stamp(payload):
    value = payload.get('occurredAt')
    if value is None:
        return stamp()
    at = parsed(value)
    now = datetime.now(timezone.utc)
    if at > now + timedelta(minutes=1):
        raise ValueError('Thời điểm học không được nằm trong tương lai.')
    return stamp(min(at, now))


def record_day(conn, user_id, at):
    day = parsed(at).astimezone(VIETNAM_TZ).date().isoformat()
    insert = 'INSERT IGNORE' if getattr(conn, 'dialect', '') == 'mysql' else 'INSERT OR IGNORE'
    conn.execute(f'{insert} INTO user_activity_days(user_id,activity_date) VALUES(?,?)', (user_id, day))
    return update_streak(conn, user_id)


def event(conn, user_id, kind, ref, xp=0, at=None):
    insert = 'INSERT IGNORE' if getattr(conn, 'dialect', '') == 'mysql' else 'INSERT OR IGNORE'
    at = at or stamp()
    conn.execute(f'{insert} INTO study_events(user_id,type,ref_id,xp_earned,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                 (user_id, kind, str(ref), xp, at, at))


def owned(conn, user_id, attempt_id):
    row = conn.execute('SELECT * FROM quiz_attempts WHERE id=? AND user_id=?', (attempt_id, user_id)).fetchone()
    if not row or row['quiz_id'] is None and row['status'] == 'in_progress':
        raise LookupError('Lượt làm bài không tồn tại hoặc không thuộc tài khoản này.')
    return dict(row)


def public_attempt(conn, attempt):
    quiz = json.loads(attempt['quiz_payload'])
    started = parsed(attempt['started_at']).timestamp()
    legacy_row = conn.execute('SELECT content FROM chat_messages WHERE id=?', (attempt['legacy_run_id'],)).fetchone() if attempt['legacy_run_id'] else None
    legacy = json.loads(legacy_row['content']) if legacy_row else {}
    started = legacy.get('started_at', started)
    return {'attemptId': attempt['id'], 'run_id': attempt['legacy_run_id'], 'started_at': started,
            'deadline': legacy.get('deadline', started + quiz.get('time_limit', 0) * 60 if quiz.get('time_limit') else None),
            'server_now': time.time(), 'status': attempt['status'], 'revision': attempt['revision'],
            'answers': {r['question_id']: r['selected_option_id'] for r in conn.execute(
                'SELECT question_id,selected_option_id FROM quiz_answers WHERE attempt_id=?', (attempt['id'],)).fetchall()},
            'result': json.loads(attempt['result']) if attempt['result'] else None}


def start(conn, user_id, quiz_id, payload, run=None):
    _, quiz = quizzes.owned_quiz(conn, user_id, quiz_id)
    client_key = key(payload)
    existing = conn.execute('''SELECT a.* FROM quiz_attempts a LEFT JOIN quiz_attempt_keys k ON k.attempt_id=a.id
        WHERE a.user_id=? AND (a.client_key=? OR k.user_id=? AND k.client_key=?)''', (user_id, client_key, user_id, client_key)).fetchone()
    if existing:
        if existing['quiz_id'] != int(quiz_id):
            raise ValueError('Khóa đồng bộ đã dùng cho một bài khác.')
        return public_attempt(conn, dict(existing))
    if payload.get('resume'):
        existing = conn.execute("SELECT * FROM quiz_attempts WHERE user_id=? AND quiz_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1", (user_id, quiz_id)).fetchone()
        if existing:
            conn.execute('INSERT INTO quiz_attempt_keys(user_id,client_key,attempt_id) VALUES(?,?,?)', (user_id, client_key, existing['id']))
            return public_attempt(conn, dict(existing))
    if run is None:
        now = parsed(action_stamp(payload)).timestamp()
        legacy = {'kind': 'quiz_run', 'started_at': now, 'deadline': now + quiz.get('time_limit', 0) * 60 if quiz.get('time_limit') else None,
                  'answers': {}, 'revision': 0, 'result': None}
        run_id = conn.execute('INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)', (quiz_id, 'system', json.dumps(legacy))).lastrowid
    else:
        run_id, legacy = run
    sources = quiz.get('document_ids') or []
    attempt_id = conn.execute('''INSERT INTO quiz_attempts(user_id,quiz_id,subject_id,document_id,legacy_run_id,client_key,quiz_payload,started_at,total_questions)
        VALUES(?,?,?,?,?,?,?,?,?)''', (user_id, quiz_id, quiz.get('subject_id'), sources[0] if sources else None,
        run_id, client_key, json.dumps(quiz, ensure_ascii=False), stamp(datetime.fromtimestamp(legacy['started_at'], timezone.utc)), len(quiz['questions']))).lastrowid
    return public_attempt(conn, owned(conn, user_id, attempt_id))


def save_answers(conn, user_id, attempt_id, payload):
    attempt = owned(conn, user_id, attempt_id)
    if attempt['status'] == 'submitted':
        return {'saved': False, 'submitted': True}
    quiz = json.loads(attempt['quiz_payload'])
    run = public_attempt(conn, attempt)
    now = action_stamp(payload)
    # ponytail: offline practice trusts validated action times; proctored exams need signed online checkpoints.
    if run['deadline'] and parsed(now).timestamp() >= run['deadline']:
        return {'saved': False, 'expired': True}
    answers = payload.get('answers')
    if answers is None:
        answers = {payload.get('questionId'): payload.get('selectedOptionId')}
    quizzes.validate_answers(quiz, answers)
    revision = payload.get('revision', attempt['revision'] + 1)
    if type(revision) is not int or not 1 <= revision <= 100000:
        raise ValueError('Phiên bản đáp án không hợp lệ.')
    if revision <= attempt['revision']:
        return {'saved': True, 'revision': attempt['revision']}
    spent = payload.get('timeSpentSeconds', 0)
    if type(spent) is not int or not 0 <= spent <= 86400:
        raise ValueError('Thời gian trả lời không hợp lệ.')
    if parsed(now) < parsed(attempt['started_at']):
        raise ValueError('Thời điểm trả lời phải sau khi bắt đầu lượt làm bài.')
    questions = {q['id']: q for q in quiz['questions']}
    for question_id, selected in answers.items():
        correct = int(selected == questions[question_id]['correct_index'])
        current = conn.execute('SELECT id FROM quiz_answers WHERE attempt_id=? AND question_id=?', (attempt_id, question_id)).fetchone()
        if current:
            conn.execute('UPDATE quiz_answers SET selected_option_id=?,is_correct=? WHERE id=?', (selected, correct, current['id']))
        else:
            conn.execute('INSERT INTO quiz_answers(attempt_id,question_id,selected_option_id,is_correct,answered_at,time_spent_seconds) VALUES(?,?,?,?,?,?)',
                         (attempt_id, question_id, selected, correct, now, spent))
        event(conn, user_id, 'quiz_answer', f'{attempt_id}:{question_id}', at=now)
    count = conn.execute('SELECT COALESCE(SUM(is_correct),0) AS total FROM quiz_answers WHERE attempt_id=?', (attempt_id,)).fetchone()['total']
    conn.execute('UPDATE quiz_attempts SET revision=?,correct_count=? WHERE id=?', (revision, count, attempt_id))
    if attempt['legacy_run_id']:
        row, legacy = quizzes.load_run(conn, attempt['quiz_id'], attempt['legacy_run_id'])
        legacy.update(answers={**run['answers'], **answers}, revision=revision)
        quizzes.replace_run(conn, row, legacy)
    if answers:
        record_day(conn, user_id, now)
    return {'saved': True, 'revision': revision}


def submit(conn, user_id, attempt_id, payload):
    attempt = owned(conn, user_id, attempt_id)
    if attempt['status'] == 'submitted':
        return json.loads(attempt['result'])
    if payload.get('answers') is not None:
        save_answers(conn, user_id, attempt_id, {**payload, 'revision': attempt['revision'] + 1})
    attempt = owned(conn, user_id, attempt_id)
    run = public_attempt(conn, attempt)
    quiz = json.loads(attempt['quiz_payload'])
    items = []
    for q in quiz['questions']:
        selected = run['answers'].get(q['id'])
        items.append({'id': q['id'], 'question': q['question'], 'selected_index': selected, 'correct_index': q['correct_index'],
                      'correct': selected == q['correct_index'], 'explanation': q.get('explanation', ''),
                      'source_document_id': q.get('document_id'), 'source_title': q.get('source_title'),
                      'source_locator': q.get('source_locator', ''), 'options': q['options']})
    score, total = sum(item['correct'] for item in items), len(items)
    now = action_stamp(payload)
    if parsed(now) < parsed(attempt['started_at']):
        raise ValueError('Thời điểm nộp bài phải sau khi bắt đầu lượt làm bài.')
    end = min(parsed(now).timestamp(), run['deadline']) if run['deadline'] else parsed(now).timestamp()
    duration = max(0, int(end - run['started_at']))
    result = {'attemptId': attempt_id, 'attempt_id': attempt_id, 'score': score, 'total': total, 'correctCount': score,
              'scorePercent': round(score * 100 / total), 'correct_count': score, 'wrong_count': total - score,
              'duration': duration, 'durationSeconds': duration, 'score_30': round(score * 30 / total, 2),
              'score_10': round(score * 10 / total, 2), 'weak_count': total - score,
              'weak_items': [i for i in items if not i['correct']], 'items': items}
    legacy_payload = {'kind': 'quiz_attempt', 'quiz_id': attempt['quiz_id'], 'user_id': user_id, 'score': score, 'total': total,
                      'duration': duration, 'answers': run['answers'], 'attempt_id': attempt_id}
    legacy_id = conn.execute('INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)',
                             (attempt['quiz_id'], 'user', json.dumps(legacy_payload))).lastrowid
    conn.execute("UPDATE quiz_attempts SET status='submitted',submitted_at=?,correct_count=?,score_percent=?,duration_seconds=?,result=?,legacy_message_id=? WHERE id=?",
                 (now, score, result['scorePercent'], duration, json.dumps(result, ensure_ascii=False), legacy_id, attempt_id))
    if attempt['legacy_run_id']:
        row, legacy = quizzes.load_run(conn, attempt['quiz_id'], attempt['legacy_run_id'])
        legacy.update(result={**result, 'attempt_id': legacy_id})
        quizzes.replace_run(conn, row, legacy)
    event(conn, user_id, 'quiz_submit', attempt_id, score * 10 + 5, now)
    record_day(conn, user_id, now)
    return result


def review(conn, user_id, card_id, payload):
    client_key = key(payload)
    rating = payload.get('result') or {'known': 'remembered', 'again': 'not_remembered'}.get(payload.get('rating'))
    if rating not in ('remembered', 'not_remembered'):
        raise ValueError('Đánh giá không hợp lệ.')
    deck_id = payload.get('deckId') or payload.get('deck_id')
    rows = conn.execute('SELECT id,payload FROM flashcard_decks WHERE user_id=?' + (' AND id=?' if deck_id else ''),
                        (user_id, deck_id) if deck_id else (user_id,)).fetchall()
    matches = [(json.loads(r['payload']), r['id']) for r in rows if any(card['id'] == card_id for card in json.loads(r['payload'])['cards'])]
    if not matches:
        raise LookupError('Thẻ không tồn tại hoặc không thuộc tài khoản này.')
    if len(matches) != 1:
        raise ValueError('Cần chọn đúng bộ thẻ để ôn tập.')
    deck, deck_id = matches[0]
    previous = conn.execute('SELECT * FROM flashcard_reviews WHERE user_id=? AND client_key=?', (user_id, client_key)).fetchone()
    if previous:
        if previous['deck_id'] != deck_id or previous['card_id'] != card_id or previous['result'] != rating:
            raise ValueError('Khóa đồng bộ đã dùng cho đánh giá khác.')
        return {'deck': deck, 'reviewId': previous['id'], 'streak': update_streak(conn, user_id)}
    now = action_stamp(payload)
    review_id = conn.execute('INSERT INTO flashcard_reviews(user_id,deck_id,card_id,client_key,result,reviewed_at) VALUES(?,?,?,?,?,?)',
                             (user_id, deck_id, card_id, client_key, rating, now)).lastrowid
    card = next(card for card in deck['cards'] if card['id'] == card_id)
    latest = conn.execute('SELECT result,reviewed_at FROM flashcard_reviews WHERE user_id=? AND deck_id=? AND card_id=? ORDER BY reviewed_at DESC,id DESC LIMIT 1',
                          (user_id, deck_id, card_id)).fetchone()
    remembered = latest['result'] == 'remembered'
    card.update(remembered=remembered, rememberedAt=latest['reviewed_at'].replace(' ', 'T') + 'Z' if remembered else None)
    conn.execute('UPDATE flashcard_decks SET payload=? WHERE user_id=? AND id=?', (json.dumps(deck, ensure_ascii=False), user_id, deck_id))
    event(conn, user_id, 'card_review', review_id, 5 if rating == 'remembered' else 0, now)
    return {'deck': deck, 'reviewId': review_id, 'streak': record_day(conn, user_id, now)}


def heartbeat(conn, user_id, session_key, now=None):
    now = now or datetime.now(timezone.utc)
    at = stamp(now)
    ref = session_key + ':' + now.astimezone(VIETNAM_TZ).date().isoformat()
    row = conn.execute("SELECT * FROM study_events WHERE user_id=? AND type='study_session' AND ref_id=?", (user_id, ref)).fetchone()
    if row:
        delta = int((now - parsed(row['updated_at'])).total_seconds())
        delta = delta if 0 <= delta <= 60 else 0  # A closed/idle tab cannot accrue study time.
        latest = conn.execute("SELECT MAX(updated_at) AS at FROM study_events WHERE user_id=? AND type='study_session'", (user_id,)).fetchone()['at']
        delta = min(delta, max(0, int((now - parsed(latest)).total_seconds())))  # Do not double count overlapping devices.
        conn.execute('UPDATE study_events SET updated_at=?,duration_seconds=duration_seconds+? WHERE id=?', (at, delta, row['id']))
        if row['duration_seconds'] + delta >= 30:
            update_streak(conn, user_id, record=True)
    else:
        event(conn, user_id, 'study_session', ref, at=at)
        conn.execute("UPDATE study_events SET session_key=? WHERE user_id=? AND type='study_session' AND ref_id=?", (session_key, user_id, ref))


def study_time(conn, user_id, session_key=None):
    rows = conn.execute("SELECT * FROM study_events WHERE user_id=? AND type='study_session'", (user_id,)).fetchall()
    today = datetime.now(VIETNAM_TZ).date()
    return {'total_seconds': sum(r['duration_seconds'] for r in rows),
            'current_session_seconds': sum(r['duration_seconds'] for r in rows if r['session_key'] == session_key),
            'today_seconds': sum(r['duration_seconds'] for r in rows if parsed(r['created_at']).astimezone(VIETNAM_TZ).date() == today),
            'session_count': len({r['session_key'] for r in rows}), 'active': bool(session_key), 'sessions': []}


def migrate(conn, user_id=None):
    """Backfill genuine old completions once; retain scores even without old definitions."""
    where, args = (' AND s.user_id=?', (user_id,)) if user_id else ('', ())
    rows = conn.execute("""SELECT m.*,s.user_id,s.subject_id,s.document_id FROM chat_messages m
        JOIN chat_sessions s ON s.id=m.session_id LEFT JOIN quiz_attempts a ON a.legacy_message_id=m.id
        WHERE m.role='user' AND s.title LIKE 'QUIZ_CARD:%' AND a.id IS NULL""" + where, args).fetchall()
    for row in rows:
        try:
            old = json.loads(row['content'])
            if not isinstance(old, dict) or old.get('kind') != 'quiz_attempt' or type(old.get('total')) is not int or old['total'] <= 0:
                continue
            if not isinstance(old.get('answers') or {}, dict):continue
            definition = conn.execute("SELECT content FROM chat_messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1", (row['session_id'],)).fetchone()
            quiz = json.loads(definition['content']) if definition else {'questions': []}
            if not isinstance(quiz, dict):quiz = {'questions': []}
            at = stamp(parsed(row['created_at']))
            attempt_id = conn.execute('''INSERT INTO quiz_attempts(user_id,quiz_id,subject_id,document_id,legacy_message_id,client_key,quiz_payload,started_at,submitted_at,total_questions,correct_count,score_percent,duration_seconds,status,result)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',?)''', (row['user_id'], row['session_id'], row['subject_id'], row['document_id'], row['id'], f'legacy:{row["id"]}',
                json.dumps(quiz), at, at, int(old['total']), int(old.get('score', 0)), round(old.get('score', 0) * 100 / old['total']), int(old.get('duration', 0)), json.dumps(old))).lastrowid
            for question, selected in (old.get('answers') or {}).items():
                if type(selected) is int and 0 <= selected < 4:
                    conn.execute('INSERT INTO quiz_answers(attempt_id,question_id,selected_option_id,answered_at) VALUES(?,?,?,?)', (attempt_id, question, selected, at))
            event(conn, row['user_id'], 'quiz_submit', attempt_id, int(old.get('score', 0)) * 10 + 5, at)
            record_day(conn, row['user_id'], at)
        except (ValueError, TypeError, KeyError):
            continue  # Only unrelated/malformed legacy messages, never new API failures.
    runs = conn.execute("""SELECT m.*,s.user_id FROM chat_messages m JOIN chat_sessions s ON s.id=m.session_id
        LEFT JOIN quiz_attempts a ON a.legacy_run_id=m.id
        WHERE m.role='system' AND s.title LIKE 'QUIZ_CARD:%' AND a.id IS NULL""" + where, args).fetchall()
    for row in runs:
        try:
            run = json.loads(row['content'])
            if not isinstance(run, dict) or run.get('kind') != 'quiz_run':
                continue
            if run.get('result'):
                conn.execute('UPDATE quiz_attempts SET legacy_run_id=?,started_at=? WHERE legacy_message_id=?',
                             (row['id'], stamp(datetime.fromtimestamp(run['started_at'], timezone.utc)), run['result'].get('attempt_id')))
                continue
            _, quiz = quizzes.owned_quiz(conn, row['user_id'], row['session_id'])
            saved_answers = quizzes.validate_answers(quiz, run.get('answers', {}))
            stamp(datetime.fromtimestamp(run['started_at'], timezone.utc))
            result = start(conn, row['user_id'], row['session_id'], {'idempotencyKey': f'legacy-run:{row["id"]}'}, (row['id'], run))
            questions = {q['id']: q for q in quiz['questions']}
            at = stamp(parsed(row['created_at']))
            for question, selected in saved_answers.items():
                conn.execute('INSERT INTO quiz_answers(attempt_id,question_id,selected_option_id,is_correct,answered_at) VALUES(?,?,?,?,?)',
                             (result['attemptId'], question, selected, int(selected == questions[question]['correct_index']), at))
                event(conn, row['user_id'], 'quiz_answer', f'{result["attemptId"]}:{question}', at=at)
            if saved_answers:record_day(conn, row['user_id'], at)
            correct = sum(selected == questions[q]['correct_index'] for q, selected in run.get('answers', {}).items())
            conn.execute('UPDATE quiz_attempts SET revision=?,correct_count=? WHERE id=?', (run.get('revision', 0), correct, result['attemptId']))
        except (ValueError, TypeError, KeyError, LookupError):
            continue


def analytics(conn, user_id, now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(VIETNAM_TZ)
    attempts = [dict(r) for r in conn.execute('SELECT * FROM quiz_attempts WHERE user_id=?', (user_id,)).fetchall()]
    answers = [dict(r) for r in conn.execute('SELECT q.* FROM quiz_answers q JOIN quiz_attempts a ON a.id=q.attempt_id WHERE a.user_id=?', (user_id,)).fetchall()]
    reviews = [dict(r) for r in conn.execute('SELECT * FROM flashcard_reviews WHERE user_id=? ORDER BY reviewed_at,id', (user_id,)).fetchall()]
    def metrics(start=None, end=None):
        inside = lambda value: start is None or start <= parsed(value).astimezone(VIETNAM_TZ) < end
        selected = [a for a in answers if inside(a['answered_at'])]
        ids = {a['attempt_id'] for a in selected}
        active = [a for a in attempts if a['id'] in ids or inside(a['submitted_at'] or a['started_at'])]
        total = sum(a['total_questions'] for a in active)
        correct = sum(a['is_correct'] or 0 for a in selected)
        correct += sum(a['correct_count'] for a in active if a['client_key'].startswith('legacy:') and inside(a['submitted_at']))
        accuracy = round(correct * 100 / len(selected)) if selected else 0
        completion = round(len(selected) * 100 / total) if total else 0
        last_reviews = {(r['deck_id'], r['card_id']): r for r in reviews if inside(r['reviewed_at'])}
        return {'attempts': len(active), 'questions_total': total, 'questions_answered': len(selected), 'correct_answers': correct,
                'accuracy_percent': accuracy, 'completion_percent': completion, 'learning_percent': round((accuracy + completion) / 2),
                'cards_remembered': sum(r['result'] == 'remembered' for r in last_reviews.values()), 'card_reviews': sum(inside(r['reviewed_at']) for r in reviews)}
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    def bucket(start, end, label):
        return {'key': start.date().isoformat(), 'label': label, **metrics(start, end)}
    days = [today + timedelta(days=i) for i in range(-6, 1)]
    monday = today - timedelta(days=today.weekday())
    weeks = [monday + timedelta(weeks=i) for i in range(-7, 1)]
    months = []
    for offset in range(-5, 2):
        year, month = divmod(now.year * 12 + now.month - 1 + offset, 12)
        months.append(datetime(year, month + 1, 1, tzinfo=VIETNAM_TZ))
    summary = metrics()
    decks = [json.loads(r['payload']) for r in conn.execute('SELECT payload FROM flashcard_decks WHERE user_id=?', (user_id,)).fetchall()]
    summary.update(xp=conn.execute('SELECT COALESCE(SUM(xp_earned),0) AS total FROM study_events WHERE user_id=?', (user_id,)).fetchone()['total'],
                   cards_remembered=sum(c.get('remembered') is True for d in decks for c in d['cards']), deck_count=len(decks),
                   streak=update_streak(conn, user_id)['current_streak'], today_minutes=study_time(conn, user_id)['today_seconds'] // 60)
    weak = {}
    answer_counts = Counter(a['attempt_id'] for a in answers)
    for a in attempts:
        quiz = json.loads(a['quiz_payload'])
        subject = quiz.get('subject') or 'Tự học'
        values = weak.setdefault(subject, [0, 0])
        values[0] += a['correct_count']
        values[1] += answer_counts[a['id']]
    insights = {'this_week': metrics(monday, monday + timedelta(days=7)), 'last_week': metrics(monday - timedelta(days=7), monday),
                'weak_subjects': [{'subject': subject, 'accuracy_percent': round(v[0] * 100 / v[1])} for subject, v in weak.items() if v[1] and v[0] / v[1] < .7]}
    today_metrics = metrics(today, today + timedelta(days=1))
    tasks = {'cards_remembered': today_metrics['cards_remembered'], 'questions_answered': today_metrics['questions_answered'], 'study_minutes': summary['today_minutes'],
             'targets': {'cards_remembered': 10, 'questions_answered': 20, 'study_minutes': 30}}
    tasks['completion_percent'] = round(sum(min(1, tasks[k] / target) for k, target in tasks['targets'].items()) * 100 / 3)
    return {'summary': summary, 'today': today_metrics, 'tasks': tasks, 'insights': insights,
            'ranges': {'day': [bucket(d, d + timedelta(days=1), d.strftime('%d/%m')) for d in days],
                       'week': [bucket(d, d + timedelta(days=7), d.strftime('%d/%m')) for d in weeks],
                       'month': [bucket(d, months[i + 1], d.strftime('%m/%Y')) for i, d in enumerate(months[:-1])]}}
