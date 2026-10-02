"""Validated flashcard contracts; AI output is only an editable suggestion."""
import json
import re
import uuid
from urllib.parse import quote, urlparse
from urllib.request import urlopen

COLORS = {'#38bdf8', '#a78bfa', '#fb7185', '#fb923c', '#4ade80', '#facc15', '#64748b'}
COLORS.update({'var(--primary-pink)', 'var(--secondary-mint)', 'var(--pink-soft)', 'var(--mint-soft)', 'var(--primary-pink-hover)', 'var(--secondary-mint-hover)'})
DEFAULT_COLOR = '#38bdf8'

def color(value):
    return value.lower() if isinstance(value, str) and value.lower() in COLORS else DEFAULT_COLOR

def text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ''

def audio_url(value):
    value = text(value, 1000)
    try:
        parsed = urlparse(value)
    except ValueError:
        return ''
    return value if parsed.scheme == 'https' and parsed.hostname in ('api.dictionaryapi.dev', 'api.dictionaryapi.dev.', 'ssl.gstatic.com') else ''

def normalize_deck(payload):
    if not isinstance(payload, dict):
        raise ValueError('Dữ liệu bộ thẻ không hợp lệ')
    name = text(payload.get('name'), 100)
    cards = payload.get('cards')
    if not name or not isinstance(cards, list) or not 1 <= len(cards) <= 100:
        raise ValueError('Nhập tên và từ 1 đến 100 thẻ')
    deck_color = color(payload.get('color'))
    normalized = []
    card_ids = set()
    for card in cards:
        if not isinstance(card, dict):
            raise ValueError('Thẻ không hợp lệ')
        front, back = text(card.get('front'), 1000), text(card.get('back'), 4000)
        if not front or not back:
            raise ValueError('Mỗi thẻ cần cả mặt trước và mặt sau')
        card_id = text(card.get('id'), 80) or str(uuid.uuid4())
        if card_id in card_ids:
            raise ValueError('ID thẻ bị trùng')
        card_ids.add(card_id)
        normalized.append({'id': card_id,
            'front': front, 'back': back, 'color': color(card['color']) if card.get('color') is not None and card.get('color') != '' else None,
            'remembered': card.get('remembered') is True,
            'language': 'en' if card.get('language') == 'en' else '',
            'pronunciation': text(card.get('pronunciation'), 200), 'audioUrl': audio_url(card.get('audioUrl'))})
    return {'id': text(payload.get('id'), 80) or str(uuid.uuid4()), 'name': name,
        'subject': text(payload.get('subject'), 200),
        'subject_id': payload.get('subject_id') if type(payload.get('subject_id')) is int else None,
        'document_ids': [v for v in payload.get('document_ids',[]) if type(v) is int] if isinstance(payload.get('document_ids'),list) else [], 'description': text(payload.get('description'), 2000),
        'keywords': [text(v, 80) for v in payload.get('keywords', []) if isinstance(v, str)][:20] if isinstance(payload.get('keywords'), list) else [],
        'difficulty': payload.get('difficulty') if payload.get('difficulty') in ('beginner','intermediate','advanced') else 'beginner',
        'color': deck_color, 'cover': payload.get('cover') if payload.get('cover') in ('lines','grid','plain') else 'plain', 'cards': normalized}

def content_title(content):
    """Prefer a content heading over page markers, institutional headers and filenames."""
    candidates = []
    for line in content.splitlines()[:100]:
        line = re.sub(r'\[(?:PAGE|SLIDE|SHEET):[^\]]*\]', '', line, flags=re.I).strip()
        heading = bool(re.match(r'^#{1,6}\s+', line))
        line = re.sub(r'^#{1,6}\s+|[*`]', '', line).strip()
        if not line or re.fullmatch(r'[\W\d_]+', line):
            continue
        if re.match(r'^(?:trường\b|khoa\s|bộ giáo dục|giảng viên|sinh viên|họ và tên|mã sinh viên|tác giả|mục lục$|table of contents$|page\s+\d|trang\s+\d)', line, re.I):
            continue
        priority = 0 if heading or re.match(r'^(?:chương|bài|chapter|unit)\s+\d', line, re.I) else 1
        candidates.append((priority, len(candidates), line))
    if not candidates:
        return 'Tài liệu học tập'
    title = min(candidates)[2]
    if len(title) > 120:
        title = title[:120].rsplit(' ', 1)[0]
    return title


def document_suggestion(content, filename, engine):
    if not content.strip():
        raise ValueError('Tài liệu không có nội dung chữ')
    fallback = {'title': content_title(content), 'description': content[:500]}
    sampled = content if len(content) <= 6500 else '\n[…]\n'.join((content[:2100], content[len(content)//2-1050:len(content)//2+1050], content[-2100:]))
    try:
        raw = engine.complete_json(task='document_metadata', payload={'filename': filename, 'document': sampled})
        if not isinstance(raw, dict) or not text(raw.get('title'), 200):
            raise ValueError('missing title')
        return {'suggestion': {'title': text(raw['title'], 200),
            'description': text(raw.get('description'), 2000) or fallback['description']}, 'warning': ''}
    except Exception:
        return {'suggestion': fallback, 'warning': 'Chưa nhận được gợi ý AI. Tên được trích từ tiêu đề trong tài liệu; bạn có thể chỉnh sửa trước khi lưu.'}


def suggest(content, filename, engine):
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    if not lines:
        raise ValueError('Tài liệu không có nội dung chữ')
    fallback = {'name': content_title(content)[:100], 'description': content[:500], 'subject': '',
        'keywords': [], 'difficulty': 'beginner', 'cards': [{'front': lines[0][:200], 'back': content[:1500]}]}
    warning = ''
    try:
        # Sample the beginning, middle and end of long documents within the model budget.
        sampled = content if len(content) <= 6500 else '\n[…]\n'.join((content[:2100], content[len(content)//2-1050:len(content)//2+1050], content[-2100:]))
        raw = engine.complete_json(task='flashcard_metadata', payload={'filename': filename, 'document': sampled})
        if not isinstance(raw, dict):
            raise ValueError('invalid AI JSON')
        candidate = {**fallback, **raw, 'name': raw.get('title') or raw.get('name') or fallback['name']}
        try:
            deck = normalize_deck(candidate)
        except ValueError:
            candidate['cards'] = fallback['cards']
            deck = normalize_deck(candidate)
            warning = 'Nội dung thẻ AI chưa hợp lệ; đã giữ tên gợi ý và dùng bản nháp trích từ tài liệu.'
        if (not all(key in raw for key in ('description','subject','keywords','difficulty','cards'))
                or not all(isinstance(raw.get(key), str) for key in ('description', 'subject'))
                or not isinstance(raw.get('keywords'), list)
                or raw.get('difficulty') not in ('beginner', 'intermediate', 'advanced')):
            warning = 'AI trả thiếu thông tin; hãy kiểm tra và bổ sung trước khi lưu.'
    except Exception:
        deck = normalize_deck(fallback)
        warning = 'Chưa nhận được gợi ý AI hợp lệ. Bản nháp được trích từ tài liệu; hãy kiểm tra trước khi lưu.'
    return {'suggestion': deck, 'warning': warning}

def pronunciation(term):
    term = text(term, 120)
    result = {'term': term, 'pronunciation': '', 'audioUrl': ''}
    if not re.fullmatch(r"[A-Za-z][A-Za-z '\-]{0,119}", term):
        return result
    try:
        with urlopen('https://api.dictionaryapi.dev/api/v2/entries/en/' + quote(term.lower()), timeout=4) as response:
            data = json.loads(response.read(256000))
        variants = []
        for entry in data if isinstance(data, list) else []:
            if not isinstance(entry, dict):
                continue
            result['pronunciation'] = result['pronunciation'] or text(entry.get('phonetic'), 200)
            for item in entry.get('phonetics', []) if isinstance(entry.get('phonetics'), list) else []:
                if isinstance(item, dict):
                    variants.append({'pronunciation': text(item.get('text'), 200), 'audioUrl': audio_url(item.get('audio'))})
        # Keep the audio and IPA from the same accent when the dictionary offers several variants.
        chosen = next((item for item in variants if item['pronunciation'] and item['audioUrl']), None)
        if chosen is None:
            chosen = next((item for item in variants if item['pronunciation']), None)
        if chosen:
            result.update(chosen)
        else:
            result['audioUrl'] = next((item['audioUrl'] for item in variants if item['audioUrl']), '')
    except Exception:
        pass
    return result


def generate_from_documents(documents, payload, engine):
    from backend.app.ai_tutor.engine import EngineError
    from backend.app.quizzes.service import content_limits, normalize
    limits = content_limits(documents)
    count = payload.get('requested_count')
    if count is None:
        count = limits['suggested_flashcards']
    if type(count) is not int or count not in (10,20,30,50) and payload.get('requested_count') is not None:
        raise ValueError('Chọn AI tự đề xuất hoặc 10, 20, 30, 50 thẻ.')
    if not 1 <= count <= limits['max_flashcards']:
        raise ValueError(f"Tài liệu đã chọn cho phép tối đa {limits['max_flashcards']} thẻ.")
    if not text(payload.get('name'),100):
        raise ValueError('Vui lòng nhập tên bộ Flashcard.')
    if not getattr(engine,'uses_model',False):
        raise EngineError('AI unavailable')
    # Sample throughout every selected document within the existing task input budget.
    sources = []
    for doc in documents:
        content = doc['text']
        budget = max(180, 5000 // len(documents))
        sample = content if len(content) <= budget else content[:budget//2] + '\n[…]\n' + content[-budget//2:]
        sources.append({'document_id':doc['id'],'text':sample})
    cards, seen = [], set()
    for start in range(0,count,4):
        size = min(4,count-start)
        raw = engine.complete_json(task='document_flashcards',payload={'sources':sources,'count':size,'avoid':[c['front'][:100] for c in cards[-10:]]})
        rows = raw.get('cards') if isinstance(raw,dict) else None
        if not isinstance(rows,list) or len(rows) != size:
            raise ValueError('Nova chưa tạo đủ thẻ. Hãy thử ít thẻ hơn hoặc bổ sung tài liệu.')
        for row in rows:
            if not isinstance(row,dict):
                raise ValueError('Nova trả về thẻ chưa hợp lệ. Vui lòng thử lại.')
            front, back, evidence = text(row.get('front'),1000), text(row.get('back'),4000), text(row.get('evidence'),1000)
            if not front or not back or normalize(front) in seen or len(evidence)<10 or not any(s['document_id']==row.get('document_id') and normalize(evidence) in normalize(s['text']) for s in sources):
                raise ValueError('Nova chưa tạo được thẻ có nguồn rõ ràng. Vui lòng thử lại.')
            seen.add(normalize(front));cards.append({'front':front,'back':back,'language':row.get('language',''),'remembered':False})
    return normalize_deck({**payload,'cards':cards})
