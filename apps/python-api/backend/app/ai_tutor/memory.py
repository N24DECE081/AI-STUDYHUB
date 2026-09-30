"""Privacy-scoped L1/L2/L3 memory synthesis for the AI tutor."""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata

from . import config


def _key(kind: str, content: str) -> str:
    normalized = re.sub(r'\s+', ' ', content.strip().lower())
    return f'{kind}:{hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]}'


def remember(conn, user_id: int, kind: str, content: str, confidence: float = 0.65,
             *, reinforce: bool = True) -> None:
    """Upsert one L2 fact. All reads and writes are scoped to one user."""
    settings = config.yaml_settings('memory').get('memory') or {}
    if not settings.get('enabled', False):
        return
    content = re.sub(r'\s+', ' ', str(content or '')).strip()[:500]
    if not content or kind not in {'fact', 'strength', 'weakness', 'preference', 'goal'}:
        return
    memory_key = _key(kind, content)
    existing = conn.execute(
        'SELECT evidence_count,confidence FROM learner_memories WHERE user_id=? AND memory_key=?',
        (user_id, memory_key),
    ).fetchone()
    if existing:
        if not reinforce:
            return
        count = int(existing['evidence_count'] or 1) + 1
        score = min(0.98, max(float(existing['confidence'] or 0), confidence) + 0.05)
        conn.execute(
            'UPDATE learner_memories SET evidence_count=?,confidence=?,last_seen_at=CURRENT_TIMESTAMP '
            'WHERE user_id=? AND memory_key=?',
            (count, score, user_id, memory_key),
        )
    else:
        conn.execute(
            'INSERT INTO learner_memories(user_id,memory_key,memory_type,content,confidence) VALUES(?,?,?,?,?)',
            (user_id, memory_key, kind, content, max(0.0, min(1.0, confidence))),
        )


def remember_preference(conn, user_id: int, slot: str, content: str) -> None:
    """Replace a named preference instead of accumulating contradictory old values."""
    memory_key = f'preference-slot:{slot}'
    conn.execute('DELETE FROM learner_memories WHERE user_id=? AND memory_key=?', (user_id, memory_key))
    conn.execute(
        'INSERT INTO learner_memories(user_id,memory_key,memory_type,content,confidence) VALUES(?,?,?,?,?)',
        (user_id, memory_key, 'preference', content[:500], 0.95),
    )


def _plain(text: str) -> str:
    normalized = unicodedata.normalize('NFD', str(text or '').lower())
    plain = ''.join(char for char in normalized if unicodedata.category(char) != 'Mn').replace('đ', 'd')
    return re.sub(r'\s+', ' ', plain).strip()


def chat_preference(question: str) -> dict | None:
    """Recognize Vietnamese nickname/name/style commands, including common unaccented forms."""
    raw = re.sub(r'\s+', ' ', str(question or '')).strip().strip('.!?')
    plain = _plain(raw)
    assistant_patterns = (
        r'(?:tu gio )?goi ban la (.+?)(?: nhe)?$',
        r'dat biet danh (?:cho chatbot|cho ban|cua ban) la (.+)$',
        r'doi biet danh cua ban (?:thanh|la) (.+)$',
    )
    user_patterns = (r'(?:tu gio )?goi toi la (.+?)(?: nhe)?$', r'ten toi la (.+)$')
    for pattern in assistant_patterns:
        match = re.search(pattern, plain)
        if match:
            value = raw[match.start(1):].removesuffix(' nhé').removesuffix(' nhe').strip(' "“”')[:60]
            return {'slot': 'assistant_name', 'value': value,
                    'content': f'Tên gọi của trợ lý: {value}',
                    'reply': f'Được nhé — từ giờ mình sẽ dùng tên **{value}**.'}
    for pattern in user_patterns:
        match = re.search(pattern, plain)
        if match:
            value = raw[match.start(1):].removesuffix(' nhé').removesuffix(' nhe').strip(' "“”')[:60]
            return {'slot': 'user_name', 'value': value,
                    'content': f'Cách gọi người học: {value}',
                    'reply': f'Được, từ giờ mình sẽ gọi bạn là **{value}**.'}
    if any(phrase in plain for phrase in ('giai thich ngan hon', 'tra loi ngan hon', 'noi ngan gon hon')):
        return {'slot': 'response_style', 'value': 'concise',
                'content': 'Ưu tiên giải thích ngắn gọn',
                'reply': 'Được, từ giờ mình sẽ giải thích ngắn gọn và đi thẳng vào ý chính.'}
    return None


def consolidate(conn, user_id: int) -> dict:
    """Synthesize L2 facts plus assessment/submission evidence into an L3 profile."""
    assessment = conn.execute(
        'SELECT subject,goal,current_level,target_level,strengths,weaknesses FROM tutor_assessments '
        'WHERE user_id=? AND status=? ORDER BY id DESC LIMIT 1', (user_id, 'completed'),
    ).fetchone()
    if assessment:
        remember(conn, user_id, 'goal', f"Mục tiêu: {assessment['goal']} ({assessment['subject']})", 0.9,
                 reinforce=False)
        remember(conn, user_id, 'fact',
                 f"Mức hiện tại theo lần tự đánh giá gần nhất: {assessment['current_level']}", 0.85,
                 reinforce=False)
        remember(conn, user_id, 'fact',
                 f"Mức mục tiêu theo lần tự đánh giá gần nhất: {assessment['target_level']}", 0.85,
                 reinforce=False)
        for kind, column in (('strength', 'strengths'), ('weakness', 'weaknesses')):
            try:
                values = json.loads(assessment[column] or '[]')
            except (TypeError, json.JSONDecodeError):
                values = []
            for value in values[:8]:
                remember(conn, user_id, kind, str(value), 0.85, reinforce=False)
    rows = conn.execute(
        'SELECT memory_type,content,confidence,evidence_count FROM learner_memories '
        'WHERE user_id=? ORDER BY confidence DESC,evidence_count DESC,last_seen_at DESC LIMIT 30',
        (user_id,),
    ).fetchall()
    grouped = {kind: [] for kind in ('goal', 'strength', 'weakness', 'preference', 'fact')}
    for row in rows:
        grouped.setdefault(row['memory_type'], []).append(row['content'])
    parts = []
    labels = {'goal': 'Mục tiêu', 'strength': 'Điểm mạnh', 'weakness': 'Điểm cần cải thiện',
              'preference': 'Cách học phù hợp', 'fact': 'Thông tin học tập'}
    for kind in ('goal', 'strength', 'weakness', 'preference', 'fact'):
        if grouped.get(kind):
            parts.append(f"{labels[kind]}: {', '.join(grouped[kind][:4])}")
    summary = '\n'.join(parts) or 'Chưa đủ dữ liệu để tổng hợp hồ sơ học tập.'
    payload = json.dumps(grouped, ensure_ascii=False)
    existing = conn.execute('SELECT user_id FROM learner_profiles WHERE user_id=?', (user_id,)).fetchone()
    if existing:
        conn.execute('UPDATE learner_profiles SET summary=?,payload=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
                     (summary, payload, user_id))
    else:
        conn.execute('INSERT INTO learner_profiles(user_id,summary,payload) VALUES(?,?,?)',
                     (user_id, summary, payload))
    return {'summary': summary, 'memories': grouped}


def profile(conn, user_id: int) -> dict:
    row = conn.execute('SELECT summary,payload,updated_at FROM learner_profiles WHERE user_id=?',
                       (user_id,)).fetchone()
    if not row:
        return consolidate(conn, user_id)
    try:
        memories = json.loads(row['payload'] or '{}')
    except (TypeError, json.JSONDecodeError):
        memories = {}
    return {'summary': row['summary'], 'memories': memories, 'updated_at': row['updated_at']}


def observe_question(conn, user_id: int, question: str) -> None:
    """Extract only explicit, low-risk learner preferences from a chat turn."""
    text = re.sub(r'\s+', ' ', str(question or '')).strip()
    preference = chat_preference(text)
    if preference:
        remember_preference(conn, user_id, preference['slot'], preference['content'])
        return
    lowered = text.lower()
    if any(token in lowered for token in ('tôi muốn học', 'mục tiêu của tôi', 'tôi cần học')):
        remember(conn, user_id, 'goal', text, 0.7)
    if any(token in lowered for token in ('giải thích ngắn', 'ví dụ thực tế', 'từng bước', 'dễ hiểu')):
        remember(conn, user_id, 'preference', text, 0.65)
