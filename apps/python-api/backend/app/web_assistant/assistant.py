"""Bộ máy chatbot tư vấn StudyHub cho khách trên trang chủ.

Ba chế độ trả lời, chọn theo chính câu hỏi:

1. `studyhub` — câu hỏi về StudyHub (bảng giá, gói học, tính năng, chính sách, liên hệ):
   mô hình CHỈ được dùng nội dung các mục tri thức khớp trong `knowledge.ENTRIES`,
   tuyệt đối không thêm giá/tính năng/số liệu nào khác. Thiếu thông tin thì nói thẳng
   là chưa có và mời liên hệ.
2. `general` — câu hỏi ngoài StudyHub (kiến thức chung, học tập, đời sống, tin tức...):
   khi backend có API key, mô hình trả lời tự do theo kiến thức chung, ghi chú rõ đây
   không phải thông tin StudyHub, và bị cấm bịa số liệu/chính sách của StudyHub.
3. `small_talk` — chào hỏi / cảm ơn / "bạn là ai, có gì đặc biệt": trả lời tự nhiên dựa
   trên hồ sơ StudyHub (định vị + điểm khác biệt), không đọc như văn mẫu.

Không có API key (hoặc hết quota mỗi IP) thì rơi về bản offline dựng sẵn — vẫn an toàn,
không bịa. Toàn bộ tri thức StudyHub nằm trong `knowledge.py` (trích từ tài liệu tổng hợp
của nhóm); mô hình không được thêm dữ kiện nào ngoài đó.
"""

from __future__ import annotations

import os
import re
import threading
import time
import unicodedata

from . import knowledge as kb
from ..ai_tutor import config as ai_config
from ..ai_tutor.engine import EngineError, ProviderEngine, is_gibberish

# Điểm khớp tối thiểu để coi là "câu hỏi có trong tài liệu". Đặt cao vừa đủ để
# câu ngoài phạm vi có trùng 1 từ khoá chung (vd "giá vàng hôm nay") bị từ chối.
MIN_SCORE = 2.4
# Câu hỏi rất ngắn (1-3 từ) chỉ cần khớp 1 từ khoá là đủ.
SHORT_QUESTION_TOKENS = 3
MIN_SHORT_SCORE = 1.2
# Trần an toàn cho một câu trả lời.
MAX_ANSWER_CHARS = 2000

DEFAULT_AI_PER_DAY = 60
_QUOTA_LOCK = threading.Lock()
_QUOTA: dict[str, tuple[int, str]] = {}

STUDYHUB_LABEL = 'THÔNG TIN STUDYHUB'
GENERAL_LABEL = 'DANH MỤC CHỦ ĐỀ STUDYHUB MÌNH CÓ SẴN (chỉ để gợi ý chủ đề, không nêu chi tiết)'

STUDYHUB_PROMPT = (
    'Bạn là Nova, trợ lý tư vấn của StudyHub (studyhub.vn) — nền tảng học tập AI cho sinh viên. '
    'Xưng "mình", gọi người hỏi là "bạn". Trả lời tiếng Việt, tự nhiên và linh hoạt theo đúng câu hỏi: '
    'cùng một ý có thể diễn đạt theo nhiều cách, không rập khuôn, không mở đầu bằng "Theo tài liệu" '
    'và không nhắc tới việc bạn đang đọc tài liệu.\n'
    'Về StudyHub (bảng giá, gói học, tính năng, chính sách, số liệu, lộ trình, liên hệ): CHỈ dùng '
    'thông tin trong phần "THÔNG TIN STUDYHUB" của tin nhắn người dùng — tuyệt đối không tự thêm giá, '
    'tính năng, con số, cam kết hay chính sách nào khác.\n'
    'Nếu khách hỏi một thông tin StudyHub mà phần đó không có, nói thẳng là mình chưa có thông tin đó '
    'và mời liên hệ support@studyhub.vn hoặc hotline 1900 1234.\n'
    'Nếu câu hỏi có kèm phần kiến thức chung, cứ trả lời ngắn phần đó nhưng không được gán nó cho StudyHub.\n'
    'Độ dài 4-8 dòng, dùng gạch đầu dòng khi liệt kê; có thể hỏi lại một câu ngắn để hiểu đúng nhu cầu.'
)

GENERAL_PROMPT = (
    'Bạn là Nova, trợ lý của StudyHub (studyhub.vn). Câu hỏi này KHÔNG thuộc StudyHub, hãy trả lời '
    'bằng kiến thức chung của bạn: ngắn gọn, dễ hiểu, linh hoạt, giọng thân thiện, xưng "mình" gọi "bạn", '
    'dùng ví dụ khi hữu ích, độ dài 3-8 dòng.\n'
    'Bắt buộc: KHÔNG bịa thông tin về StudyHub (giá, gói, tính năng, chính sách, số liệu). Nếu câu hỏi '
    'pha lẫn phần StudyHub mà bạn không có dữ liệu, nói rõ là mình chưa có thông tin và mời liên hệ '
    'support@studyhub.vn.\n'
    'Không bịa dữ liệu bạn không kiểm chứng được (thời tiết, giá vàng, tin tức hôm nay): nói rõ là mình '
    'không tra cứu được thời gian thực rồi chỉ đưa kiến thức nền.\n'
    f'Kết thúc câu trả lời bằng đúng một dòng in nghiêng: {kb.GENERAL_NOTE}'
)


def normalize(text: str) -> str:
    """Chuẩn hoá tiếng Việt: viết thường, bỏ dấu, gộp khoảng trắng."""
    lowered = unicodedata.normalize('NFD', str(text or '').lower())
    stripped = ''.join(char for char in lowered if unicodedata.category(char) != 'Mn')
    return re.sub(r'\s+', ' ', stripped.replace('đ', 'd')).strip()


def tokens(text: str) -> list[str]:
    return [token for token in re.split(r'[^a-z0-9]+', normalize(text)) if token]


def _keyword_weight(keyword: str) -> float:
    """Từ khoá càng dài/càng cụ thể càng đáng tin."""
    if len(keyword) >= 12:
        return 2.4
    if len(keyword) >= 6:
        return 2.0
    return 1.2


def _score(question_norm: str, question_tokens: list[str], entry: dict) -> tuple[float, int]:
    score = 0.0
    matched_tokens = 0
    for keyword in entry['keywords']:
        normalized_keyword = normalize(keyword)
        if not normalized_keyword:
            continue
        if ' ' in normalized_keyword and normalized_keyword in question_norm:
            score += _keyword_weight(normalized_keyword)
            matched_tokens += len(normalized_keyword.split())
        elif normalized_keyword in question_tokens:
            score += _keyword_weight(normalized_keyword)
            matched_tokens += 1
    title_tokens = set(tokens(entry['title']))
    score += 0.8 * len(title_tokens & set(question_tokens))
    return score, matched_tokens


def retrieve(question: str, limit: int = 3) -> list[dict]:
    """Trả về các mục tri thức khớp nhất kèm điểm số."""
    question_norm = normalize(question)
    question_tokens = tokens(question)
    scored = []
    for entry in kb.ENTRIES:
        score, matched = _score(question_norm, question_tokens, entry)
        if score > 0:
            scored.append({'entry': entry, 'score': score, 'matched': matched})
    scored.sort(key=lambda item: item['score'], reverse=True)
    return scored[:limit]


def entries_by_ids(identifiers) -> list[dict]:
    """Lấy các mục tri thức theo id, giữ đúng thứ tự yêu cầu (bỏ id không tồn tại)."""
    wanted = list(identifiers)
    return [entry for identifier in wanted for entry in kb.ENTRIES if entry['id'] == identifier]


def render_context(entries) -> str:
    """Dựng khối ngữ cảnh gửi mô hình từ các mục tri thức (dict có title/answer)."""
    return '\n\n'.join(f"[{entry['title']}]\n{entry['answer']}" for entry in entries)


def _in_scope(question: str, best: dict | None) -> bool:
    if not best:
        return False
    if best['score'] >= MIN_SCORE:
        return True
    question_tokens = tokens(question)
    if len(question_tokens) <= SHORT_QUESTION_TOKENS and best['score'] >= MIN_SHORT_SCORE:
        return True
    return False


def _wants_differentiators(question_norm: str) -> bool:
    """Câu kiểu 'bạn có gì đặc biệt', 'khác gì app khác', 'vì sao chọn StudyHub'."""
    return any(hint in question_norm for hint in kb.DIFFERENTIATOR_HINTS)


def _mentions_studyhub(question_norm: str) -> bool:
    return any(hint in question_norm for hint in kb.STUDYHUB_HINTS)


def _small_talk_kind(question_norm: str) -> str | None:
    """Phân loại câu xã giao. Trả 'empty' khi câu chỉ có dấu câu."""
    stripped = question_norm.strip(' !?.,')
    if not stripped:
        return 'empty'
    if stripped in kb.SMALL_TALK['greeting'] or (
        len(stripped.split()) <= 3 and any(stripped.startswith(item.strip()) for item in kb.SMALL_TALK['greeting'])
    ):
        return 'greeting'
    if any(item in stripped for item in kb.SMALL_TALK['thanks']) and len(stripped.split()) <= 4:
        return 'thanks'
    if any(item in stripped for item in kb.SMALL_TALK['capability']) or _wants_differentiators(stripped):
        return 'capability'
    return None


def _offline_answer(matches: list[dict]) -> str:
    parts = [match['entry']['answer'] for match in matches[:2]]
    answer = '\n\n'.join(parts)
    return answer[:MAX_ANSWER_CHARS]


def _looks_unclear(question: str) -> bool:
    """Câu gõ loạn ký tự (không có nguyên âm, hoặc chuỗi phụ âm dài) coi như chưa rõ."""
    letters = re.sub(r'[^a-z]', ' ', normalize(question)).split()
    if not letters:
        return True
    if not any(re.search(r'[aeiouy]', token) for token in letters):
        return True
    return any(re.search(r'[bcdfghjklmnpqrstvwxz]{5,}', token) for token in letters)


def _provider(settings: dict):
    return ProviderEngine(
        base_url=settings['base_url'],
        api_key=settings['api_key'],
        model=settings['model'],
        timeout=30,
    )


def _compose_with_model(*, question: str, context: str, history: list, prompt: str,
                        settings: dict, context_label: str = STUDYHUB_LABEL) -> str | None:
    """Nhờ mô hình trả lời/diễn đạt lại; trả None khi gọi lỗi để caller dùng bản offline."""
    messages = [{'role': 'system', 'content': prompt}]
    for item in (history or [])[-4:]:
        if not isinstance(item, dict):
            continue
        role = 'assistant' if item.get('role') == 'assistant' else 'user'
        content = str(item.get('content') or '').strip()
        if content:
            messages.append({'role': role, 'content': content[:600]})
    block = f'{context_label}:\n{context[:6000]}\n\n' if context else ''
    messages.append({'role': 'user', 'content': f'{block}CÂU HỎI KHÁCH: {question}'})
    try:
        text = _provider(settings)._chat(messages).strip()
    except EngineError:
        return None
    except Exception:  # noqa: BLE001 - provider lỗi bất kỳ thì dùng bản offline
        return None
    if not text:
        return None
    return text[:MAX_ANSWER_CHARS]


def _quota_allow(ip: str) -> bool:
    """Giới hạn số câu gọi mô hình mỗi ngày cho từng IP (bảo vệ quota API)."""
    if not ip:
        return True
    try:
        limit = int(os.environ.get('STUDYHUB_WEB_ASSISTANT_AI_PER_DAY') or DEFAULT_AI_PER_DAY)
    except (TypeError, ValueError):
        limit = DEFAULT_AI_PER_DAY
    if limit <= 0:
        return False
    day = time.strftime('%Y-%m-%d')
    with _QUOTA_LOCK:
        count, stored_day = _QUOTA.get(ip, (0, day))
        if stored_day != day:
            count = 0
        if count >= limit:
            _QUOTA[ip] = (count, day)
            return False
        _QUOTA[ip] = (count + 1, day)
        if len(_QUOTA) > 5000:
            for key in list(_QUOTA)[:1000]:
                _QUOTA.pop(key, None)
    return True


def ask(message: str, history=None, client_ip: str = '') -> dict:
    """Trả lời một câu hỏi của khách. Luôn trả về dict an toàn cho client."""
    question = str(message or '').strip()
    question_norm = normalize(question)
    base = {
        'answer': kb.NEED_QUESTION_ANSWER,
        'in_scope': False,
        'mode': 'general',
        'topic': None,
        'sources': [],
        'engine': 'knowledge',
        'suggestions': list(kb.STARTERS),
    }
    if not question:
        return base
    if len(question) > 600:
        question = question[:600]

    kind = _small_talk_kind(question_norm)
    if kind == 'empty':
        return base
    if _looks_unclear(question) or is_gibberish(question):
        return base

    matches = retrieve(question)
    best = matches[0] if matches else None
    in_scope = bool(best and _in_scope(question, best))

    # "Bạn có gì đặc biệt / bạn làm được gì / khác gì app khác": luôn trả lời bằng hồ sơ
    # định vị + điểm khác biệt thật của StudyHub, kể cả khi chưa khớp từ khoá mạnh.
    pitch = kind == 'capability' or _wants_differentiators(question_norm) or (
        not in_scope and _mentions_studyhub(question_norm) and bool(best)
    )
    if pitch and not in_scope:
        matches = entries_by_ids(kb.PITCH_ENTRY_IDS) + matches
        best = matches[0] if matches else None
        in_scope = bool(matches)

    if kind in ('greeting', 'thanks'):
        mode = 'small_talk'
        context_label = STUDYHUB_LABEL
        context = render_context(entries_by_ids(kb.PITCH_ENTRY_IDS))
        offline = kb.SMALL_TALK_ANSWERS[kind]
        topic = None
        in_scope = False
    elif in_scope:
        mode = 'studyhub'
        context_label = STUDYHUB_LABEL
        context = render_context([match['entry'] for match in matches[:4]])
        offline = _offline_answer(matches)
        topic = matches[0]['entry']['title']
    else:
        # Ngoài StudyHub: mô hình trả lời theo kiến thức chung, chỉ được biết DANH MỤC
        # chủ đề StudyHub (không có nội dung) để không gán bừa dữ kiện cho StudyHub.
        mode = 'general'
        context_label = GENERAL_LABEL
        # Chỉ đưa DANH MỤC chủ đề (đã bỏ phần chi tiết trong ngoặc như giá) để mô hình biết
        # StudyHub có gì mà không thể trích số liệu/khoá học ra trả lời như thông tin StudyHub.
        context = '; '.join(re.sub(r'\s*\([^)]*\)', '', entry['title']) for entry in kb.ENTRIES)
        offline = kb.OUT_OF_SCOPE_ANSWER
        topic = None

    answer, engine = offline[:MAX_ANSWER_CHARS], 'knowledge'
    settings = ai_config.provider_settings()
    if settings and _quota_allow(client_ip):
        prompt = GENERAL_PROMPT if mode == 'general' else STUDYHUB_PROMPT
        polished = _compose_with_model(
            question=question,
            context=context,
            history=history or [],
            prompt=prompt,
            settings=settings,
            context_label=context_label,
        )
        if polished:
            answer = polished
            engine = 'ai' if mode != 'general' else 'ai-general'

    return {
        'answer': answer,
        'in_scope': in_scope,
        'mode': mode,
        'topic': topic,
        'sources': [{'id': match['entry']['id'], 'title': match['entry']['title']} for match in matches[:2]],
        'engine': engine,
        'suggestions': list(kb.STARTERS),
    }


def starters() -> dict:
    """Lời chào + 4 gợi ý nhanh cho widget trang chủ."""
    return {
        'name': kb.ASSISTANT_NAME,
        'status': kb.ASSISTANT_STATUS,
        'greeting': kb.GREETING,
        'starters': list(kb.STARTERS),
    }
