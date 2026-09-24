"""Server-side AI engine for the StudyHub AI Tutor.

Every AI call happens behind the HTTP API: the React client never holds a
provider key and never runs AI processing. When provider credentials are absent
the deterministic local engine answers instead, so chat, assessment, roadmaps,
exercises and grading all keep working offline.
"""
from __future__ import annotations

import ast
import json
import math
import re
import urllib.error
import urllib.request
from collections import Counter

from . import config

MODES = ('explain', 'solve', 'hint', 'summarize', 'generate_quiz')
# Chỉ dẫn hành vi cho từng chế độ. Khi Nova dùng model thật, chỉ gửi mỗi tên chế độ
# ("chế độ hiện tại: hint") là không đủ — model vẫn đưa đáp án, nên mỗi chế độ nói rõ
# nó muốn gì. Bản offline đã tự định tuyến sang compose_* riêng nên không cần phần này.
MODE_INSTRUCTIONS = {
    'explain': ('Nhiệm vụ của lượt này: GIẢI THÍCH. Nêu định nghĩa, bản chất và ví dụ minh hoạ cho khái niệm '
                'người học hỏi. Không trình bày lời giải hoàn chỉnh cho một bài tập cụ thể; nếu câu hỏi kèm '
                'bài tập, hãy giải thích kiến thức cần dùng rồi mời người học chuyển sang chế độ "Giải bài".'),
    'solve': ('Nhiệm vụ của lượt này: GIẢI BÀI. Trình bày lời giải theo từng bước có đánh số, ở mỗi bước nêu '
              'rõ quy tắc/công thức đang dùng và tính toán cụ thể, kết thúc bằng kết luận đáp án rõ ràng.'),
    'hint': ('Nhiệm vụ của lượt này: GỢI Ý. TUYỆT ĐỐI KHÔNG đưa đáp án, đáp số, kết quả cuối hay lời giải '
             'hoàn chỉnh — kể cả khi người học hỏi lại lần nữa, xin đáp án, nói "cứ giải đi" hoặc nói sẽ tự '
             'làm. Chỉ được phép: nhắc lại dữ kiện đã cho, chỉ ra kiến thức/công thức cần dùng, nêu bước '
             'tiếp theo cần làm, và hỏi ngược để người học tự đi tiếp. Kết thúc bằng một câu hỏi gợi mở.'),
    'summarize': ('Nhiệm vụ của lượt này: TÓM TẮT. Bám sát ngữ cảnh tài liệu được cung cấp, trình bày theo '
                  'mục ngắn gọn, không thêm kiến thức ngoài tài liệu; mục nào tài liệu không có thì ghi rõ '
                  'là tài liệu chưa đề cập.'),
    'generate_quiz': ('Nhiệm vụ của lượt này: TẠO QUIZ. Đặt 3-5 câu hỏi trắc nghiệm bám sát nội dung tài '
                      'liệu, mỗi câu có 4 lựa chọn và đúng một đáp án; không bịa nội dung ngoài tài liệu.'),
}
LEVELS = ('beginner', 'intermediate', 'advanced')
LEVEL_LABELS = {'beginner': 'mới bắt đầu', 'intermediate': 'trung bình', 'advanced': 'nâng cao'}
PACE_LABELS = {'slow': 'chậm mà chắc', 'steady': 'đều đặn', 'fast': 'cấp tốc'}
DIFFICULTY_ORDER = {'beginner': 0, 'intermediate': 1, 'advanced': 2}

STOP_WORDS = {
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'you', 'your',
    'cua', 'cho', 'voi', 'nhung', 'trong', 'duoc', 'cac', 'mot', 'khi', 'hay', 'nhu', 'thi',
    'la', 'va', 'co', 'khong', 'cung', 'nay', 'do', 'ra', 'vao', 'sau', 'truoc', 'theo',
    'what', 'which', 'when', 'where', 'how', 'why', 'does', 'did', 'can', 'into', 'than',
    'của', 'cho', 'với', 'nhưng', 'trong', 'được', 'các', 'một', 'khi', 'hay', 'như', 'thì',
    'là', 'và', 'có', 'không', 'cũng', 'này', 'đó', 'ra', 'vào', 'sau', 'trước', 'theo',
    'để', 'tại', 'về', 'bằng', 'nếu', 'vì', 'nên', 'đang', 'sẽ', 'đã', 'bị', 'cần', 'phải',
    'mỗi', 'những', 'cái', 'điều', 'rồi', 'thể', 'nữa', 'lại', 'ở', 'từ', 'đến', 'trên',
    'dưới', 'giữa', 'hoặc', 'vậy', 'tức', 'thường', 'rất', 'quá', 'chỉ', 'còn', 'hơn',
}


class EngineError(RuntimeError):
    """Raised when the configured provider cannot produce a valid answer."""


def tokenize(text: str) -> list[str]:
    """Lowercase word tokens used by the deterministic engine and by grading."""
    return [token for token in re.findall(r'\w+', (text or '').lower()) if token not in STOP_WORDS]


def keywords(text: str, limit: int = 12) -> list[str]:
    counts: dict[str, int] = {}
    for token in tokenize(text):
        if len(token) < 3:
            continue
        counts[token] = counts.get(token, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], -len(item[0]), item[0]))
    return [word for word, _ in ranked[:limit]]


def overlap_score(student: str, reference: str) -> float:
    """Jaccard-like coverage of the reference tokens by the student answer."""
    reference_tokens = {token for token in tokenize(reference) if len(token) > 2}
    if not reference_tokens:
        return 0.0
    student_tokens = {token for token in tokenize(student) if len(token) > 2}
    if not student_tokens:
        return 0.0
    return len(reference_tokens & student_tokens) / len(reference_tokens)


def sentences(text: str) -> list[str]:
    """Sentences of a passage; short labels ('Lưu ý:', 'Ví dụ:') stay attached to what follows."""
    parts = re.split(r'(?<=[.!?;:])\s+|\n+', text or '')
    merged: list[str] = []
    pending = ''
    for part in parts:
        piece = f'{pending} {part.strip()}'.strip()
        pending = ''
        if not piece:
            continue
        if piece.endswith(':') and len(piece) < 30:
            pending = piece
            continue
        if merged and len(piece) < 30:
            merged[-1] = f'{merged[-1]} {piece}'
        else:
            merged.append(piece)
    return [part for part in merged if len(part) >= 30]


def top_phrases(texts, limit: int = 8) -> list[str]:
    """Most frequent two-word phrases: readable keywords for Vietnamese text."""
    counts: Counter = Counter()
    for text in texts:
        words = re.findall(r'\w+', (text or '').lower())
        for index in range(len(words) - 1):
            first, second = words[index], words[index + 1]
            if len(first) < 3 or len(second) < 3:
                continue
            if first in STOP_WORDS or second in STOP_WORDS:
                continue
            counts[f'{first} {second}'] += 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], -len(item[0]), item[0]))
    repeated = [phrase for phrase, count in ranked if count >= 2]
    return (repeated or [phrase for phrase, _ in ranked])[:limit]


CODE_HINTS = {
    'class': r'\b(class|interface|enum|struct|record)\b',
    'inheritance': r'\b(extends|implements)\b|:\s*[A-Z]\w+',
    'override': r'@Override|@override|\boverride\b|\bdef\s+\w+\s*\(|\b[A-Za-z_<>\[\]]+\s+\w+\s*\([^)]*\)\s*\{',
    'body': r'\{[\s\S]*\}',
    'return': r'\breturn\b|System\.out|\bprint\s*\(|\bconsole\.log',
}


def key_phrases(text: str, limit: int = 12) -> list[str]:
    """Readable two-word (then long single) phrases from a reference answer."""
    tokens = tokenize(text)
    phrases: list[str] = []
    for size in (2, 1):
        for index in range(len(tokens) - size + 1):
            phrase = ' '.join(tokens[index:index + size])
            if size == 1 and len(phrase) < 5:
                continue
            if phrase not in phrases:
                phrases.append(phrase)
    return phrases[:limit]


def rubric_gaps(answer: str, rubric: str, expected: str, limit: int = 4, satisfied=None) -> list[str]:
    """Missing points a learner can act on: rubric criteria first, then key phrases.

    `satisfied` lets a caller mark criteria that were already checked another way
    (for code, the structural scan covers syntax and safety criteria).
    """
    lowered = (answer or '').lower()
    criteria = [item.strip() for item in re.split(r'[,;.\n]', rubric or '') if len(item.strip()) >= 12]
    gaps = [item for item in criteria
            if overlap_score(answer, item) < 0.34 and not (satisfied and satisfied(item))]
    if gaps:
        return gaps[:limit]
    return [phrase for phrase in key_phrases(expected, 16) if phrase not in lowered][:limit]


def term_coverage(answer: str, reference: str, min_length: int = 2) -> float:
    """Share of the reference's terms that appear in the answer (offline heuristic)."""
    terms = [term for term in tokenize(reference) if len(term) >= min_length]
    if not terms:
        return 0.0
    lowered = (answer or '').lower()
    return sum(1 for term in terms if term in lowered) / len(terms)


def rubric_criteria(rubric: str, min_length: int = 8) -> list[str]:
    return [item.strip() for item in re.split(r'[,;.]', rubric or '') if len(item.strip()) >= min_length]


ESSAY_STOPWORDS = {
    'viết', 'đoạn', 'phân', 'tích', 'ngắn', 'hãy', 'cho', 'biết', 'trình', 'bày', 'nêu', 'giải',
    'thích', 'của', 'và', 'là', 'có', 'theo', 'dựa', 'trên', 'tài', 'liệu', 'bài', 'học', 'với',
    'kèm', 'dòng', 'câu', 'trả', 'lời', 'về', 'từ', 'các', 'một', 'những', 'để', 'trong', 'khi',
    'này', 'đó', 'như', 'nào', 'vì', 'sao', 'sự', 'vai', 'trò', 'mục', 'tiêu', 'phần', 'nội',
    'dung', 'chính', 'mình', 'bạn', 'người', 'chọn', 'dùng', 'sau', 'trước', 'tổng', 'quan',
}


def content_only(text: str) -> str:
    """Instruction-free content words of a prompt (used by the offline essay grader)."""
    return ' '.join(term for term in tokenize(text)
                    if len(term) >= 3 and term not in ESSAY_STOPWORDS)


def concept_phrase(prompt: str, topic: str = '') -> str:
    """Lesson concept a question targets: quoted title in the prompt, else the topic."""
    quoted = re.findall(r'[“"]([^”"]+)[”"]', prompt or '')
    candidate = quoted[0] if quoted else (topic or '')
    candidate = re.split(r'—|--|\s-\s', candidate)[0]
    return candidate.strip().lower()


def concept_ratio(prompt: str, topic: str, answer: str) -> float:
    """Share of the question's concept title words that appear in the answer."""
    terms = [term for term in tokenize(concept_phrase(prompt, topic))
             if len(term) >= 3 and term not in ESSAY_STOPWORDS]
    if not terms:
        return 0.0
    lowered = (answer or '').lower()
    return sum(1 for term in terms if term in lowered) / len(terms)


def keyword_ratio(expected: str, answer: str) -> float:
    """Share of the expected answer's content keywords that appear in the answer."""
    terms = keywords(expected, 8)
    if not terms:
        return 0.0
    lowered = (answer or '').lower()
    return sum(1 for term in terms if term in lowered) / len(terms)


def depth_factor(prompt: str, answer: str) -> float:
    """How close the answer length is to what the question demands (e.g. '3-5 câu')."""
    demanded = re.search(r'(\d+)\s*[–-]\s*(\d+)\s*câu', prompt or '')
    if not demanded:
        return 1.0
    wanted = max(1, int(demanded.group(1)))
    sentences = len([part for part in re.split(r'[.!?;]\s*', answer or '') if len(part.strip()) >= 8])
    return min(1.0, sentences / wanted)


def grade_band(percentage: float) -> str:
    if percentage >= 90:
        return 'Excellent'
    if percentage >= 80:
        return 'Very Good'
    if percentage >= 65:
        return 'Good'
    if percentage >= 50:
        return 'Pass'
    return 'Needs Improvement'


# ---------------------------------------------------------------------------
# Offline answer composer
#
# Without a provider key the tutor must still answer the learner's actual
# question: these helpers retrieve the relevant passages of the learner's own
# documents, then build an answer around what the material really says and
# state plainly when the material covers nothing.
# ---------------------------------------------------------------------------

QUESTION_FILLERS = {
    'giải', 'thích', 'trình', 'bày', 'nêu', 'cho', 'ví', 'dụ', 'như', 'thế', 'nào', 'làm', 'sao',
    'tại', 'vì', 'cách', 'hãy', 'gì', 'định', 'nghĩa', 'khái', 'niệm', 'so', 'sánh', 'khác', 'nhau',
    'nó', 'này', 'đó', 'kia', 'ấy', 'thế', 'chúng', 'họ', 'tôi', 'em', 'anh', 'chị', 'cái', 'thứ',
    'giữa', 'bạn', 'mình', 'câu', 'hỏi', 'về', 'được', 'một', 'các', 'những', 'phần', 'theo', 'bao',
    # Accented forms of the stop words: tokenize() only strips the unaccented ones.
    'là', 'của', 'và', 'với', 'trong', 'có', 'không', 'thì', 'này', 'đó', 'cũng', 'khi', 'hay',
    'để', 'nhiêu', 'đâu', 'ai', 'ra', 'vào', 'sau', 'trước', 'bị', 'đang', 'rồi', 'ạ',
    'bằng', 'gợi', 'tóm', 'tắt', 'tài', 'liệu', 'muốn', 'đi', 'làm', 'giúp', 'nhé', 'giùm',
    'hộ', 'dùm', 'lại', 'thêm', 'giùm', 'nữa', 'chút', 'vậy', 'thì',
    'what', 'is', 'are', 'explain', 'how', 'why', 'give', 'example', 'examples', 'difference',
    'between', 'define', 'definition', 'compare', 'list', 'tell', 'about', 'meaning', 'mean',
}

INTENT_PATTERNS = (
    ('comparison', r'khác\s+nhau|khác\s+gì|khác\s+biệt|khác\s+ở|giống\s+nhau|so\s+sánh|phân\s+biệt|so\s+với|difference|different|compare|versus|\bvs\b'),
    ('procedure', r'\bcách\b|làm\s+(sao|thế\s+nào)|quy\s+trình|các\s+bước|thứ\s+tự|how\s+to|\bsteps?\b'),
    ('reason', r'tại\s+sao|vì\s+sao|\bwhy\b'),
    ('example', r'ví\s+dụ|\bexamples?\b'),
    ('computation', r'\d\s*[-+*/x×^]\s*\d|tính\s+giá\s+trị|tính\s+toán|bao\s+nhiêu|calculate|compute'),
    ('definition', r'\blà\s+gì\b|định\s+nghĩa|khái\s+niệm|\bwhat\s+is\b|\bdefine\b|\bdefinition\b|nghĩa\s+là'),
)

DEFINITION_MARKERS = (' là ', ' được ', ' gọi là ', ' nghĩa là ', ' dùng để ', ' cho phép ',
                      ' bao gồm ', ' gồm ', ' định nghĩa', ' khái niệm', ':')

EXAMPLE_MARKERS = ('ví dụ', 'chẳng hạn', 'example', 'e.g', '=>')

CONTRAST_MARKERS = r'khác|trong khi|nhưng|ngược lại|so with|whereas'


def question_intent(question: str) -> str:
    lowered = (question or '').lower()
    for name, pattern in INTENT_PATTERNS:
        if re.search(pattern, lowered):
            return name
    return 'general'


def focus_terms(question: str, limit: int = 8) -> list[str]:
    """Content terms of the question, without interrogative filler words."""
    ordered: list[str] = []
    for term in tokenize(question):
        if len(term) < 2 or term in QUESTION_FILLERS or term.isdigit():
            continue
        if term not in ordered:
            ordered.append(term)
    return ordered[:limit]


def focus_phrase(question: str) -> str:
    return ' '.join(focus_terms(question, 6))


def is_gibberish(question: str) -> bool:
    """True for input with no real word ('xxxx', 'aaaa bbbb')."""
    words = [word for word in tokenize(question) if any(ch.isalpha() for ch in word)]
    if not words:
        return False
    return all(len(set(word)) <= 1 for word in words)


FOLLOW_UP_WORDS = {'ví', 'dụ', 'sao', 'nào', 'thế', 'cách', 'bước', 'nữa', 'tiếp', 'thêm',
                   'nhỉ', 'vậy', 'giải', 'thích', 'nêu', 'trình', 'bày', 'ý', 'chi', 'tiết'}


def is_follow_up(question: str) -> bool:
    """True when the question asks for more about the previous topic, not a new one."""
    return not [term for term in focus_terms(question) if term not in FOLLOW_UP_WORDS]


LIBRARY_REQUEST = re.compile(r'(tóm\s+tắt|liệt\s+kê|quiz)\s+(toàn\s+bộ\s+|cả\s+)?(tài\s+liệu|kho|mọi)', re.I)


def effective_question(question: str, history) -> str:
    """A follow-up ('cho ví dụ đi') inherits the topic of the previous question.

    Requests about the whole library ('tóm tắt tài liệu') are not follow-ups.
    """
    if not is_follow_up(question) or LIBRARY_REQUEST.search(question or ''):
        return question
    for item in reversed(list(history or [])):
        if str(item.get('role')) == 'user' and focus_terms(str(item.get('content') or '')):
            return f"{question} {item['content']}"
    return question


def source_blocks(context: str) -> list[tuple[str, str]]:
    """Context is '<title>: <text>' blocks separated by a blank line."""
    blocks = []
    for raw in (context or '').split('\n\n'):
        part = raw.strip()
        if not part:
            continue
        title, sep, body = part.partition(':')
        if sep and len(title) <= 90 and body.strip():
            blocks.append((title.strip(), body.strip()))
        else:
            blocks.append(('', part))
    return blocks


def useful_blocks(context: str, min_length: int = 25) -> list[tuple[str, str]]:
    """Document blocks that carry real content (a title-only block carries none)."""
    return [(title, body) for title, body in source_blocks(context)
            if len(body.strip()) >= min_length and body.strip() != title.strip()]


def rank_passages(question: str, context: str, limit: int = 6) -> list[dict]:
    """Sentences of the learner's documents ranked by relevance to the question."""
    terms = focus_terms(question, 10)
    if not terms or not (context or '').strip():
        return []
    pool: list[dict] = []
    for title, body in useful_blocks(context):
        for sentence in sentences(body) or [body[:300]]:
            pool.append({'title': title, 'sentence': sentence, 'score': 0.0})
    if not pool:
        return []
    frequency: Counter = Counter()
    for item in pool:
        for token in set(tokenize(item['sentence'])):
            frequency[token] += 1
    total = len(pool)
    lowered_question = (question or '').lower()
    for item in pool:
        tokens = set(tokenize(item['sentence']))
        lowered = item['sentence'].lower()
        score = 0.0
        for term in terms:
            if term in tokens:
                score += 1.0 + math.log(total / (1 + frequency[term]))
            elif len(term) > 3 and term in lowered:
                score += 0.4
        if item['title'] and item['title'].lower() in lowered_question:
            score += 0.5
        item['score'] = score
    picked = sorted((item for item in pool if item['score'] > 0),
                    key=lambda item: (-item['score'], -len(item['sentence'])))
    unique: list[dict] = []
    seen: list[set[str]] = []
    for item in picked:
        tokens = set(tokenize(item['sentence']))
        if any(len(tokens & other) / max(1, len(tokens)) > 0.7 for other in seen):
            continue
        seen.append(tokens)
        unique.append(item)
        if len(unique) >= limit:
            break
    return unique


def first_definition(passages: list[dict], terms: list[str], focus: str = '') -> dict | None:
    """Best 'answer sentence': starts with the topic, else a definition, never a note."""
    phrase = [term for term in (focus or '').split() if term]

    def is_note(item: dict) -> bool:
        return bool(re.match(r'^(lưu ý|chú ý|ghi chú|ví dụ|trong khi|tuy nhiên|nếu)',
                             item['sentence'].strip().lower()))

    for item in passages:
        head = item['sentence'].strip().lower()
        if is_note(item) or not phrase or not all(term in head[:60] for term in phrase):
            continue
        if head.startswith(phrase[0]) and any(marker in head for marker in DEFINITION_MARKERS):
            return item
    for item in passages:
        head = item['sentence'].strip().lower()
        if not is_note(item) and phrase and head.startswith(phrase[0]):
            return item
    for item in passages:
        head = item['sentence'].strip().lower()[:60]
        if not is_note(item) and phrase and all(term in head for term in phrase):
            return item
    for item in passages:
        lowered = item['sentence'].lower()
        if is_note(item):
            continue
        if any(marker in lowered for marker in DEFINITION_MARKERS) and (
                not terms or any(term in lowered for term in terms[:2])):
            return item
    for item in passages:
        if not is_note(item):
            return item
    return passages[0] if passages else None


def example_passages(context: str, limit: int = 2) -> list[dict]:
    """Passages that really are examples, before merely numeric ones."""
    explicit: list[dict] = []
    numeric: list[dict] = []
    for title, body in useful_blocks(context):
        for sentence in sentences(body):
            lowered = sentence.lower()
            item = {'title': title, 'sentence': sentence}
            if any(marker in lowered for marker in EXAMPLE_MARKERS):
                explicit.append(item)
            elif re.search(r'\d', sentence):
                numeric.append(item)
    return (explicit + numeric)[:limit]


def source_tag(item: dict) -> str:
    return f" — *{item['title']}*" if item.get('title') else ''


def heading(text: str) -> str:
    text = (text or '').strip()
    return text[:1].upper() + text[1:] if text else text


def available_listing(titles: list[str] | None) -> str:
    """What the learner can ask about instead, from the documents already loaded."""
    titles = [title for title in (titles or []) if title][:5]
    if not titles:
        return ('\n\n**Kho học liệu đang trống.** Vào mục “Kho học liệu” tải tài liệu văn bản '
                '(txt/md/csv/log) lên trước.')
    return '\n\n**Tài liệu đang có trong kho:**\n' + '\n'.join(f'- {title}' for title in titles)


def missing_material(focus: str, titles: list[str] | None = None) -> str:
    return (f'## {heading(focus)}\n\n'
            f'Mình chưa tìm thấy nội dung nào về “{focus}” trong tài liệu bạn đã tải lên, '
            'nên mình không dựng câu trả lời từ chỗ không có dữ liệu.\n\n'
            '**Để có câu trả lời thật, chọn một trong hai cách:**\n'
            f'1. Tải tài liệu văn bản (txt/md/csv/log) có nội dung về “{focus}” rồi hỏi lại.\n'
            '2. Hỏi về một chủ đề có trong danh sách tài liệu bên dưới.'
            f'{available_listing(titles)}\n\n'
            f'**Dàn ý để bạn tự học “{focus}”:**\n'
            f'1. Định nghĩa: “{focus}” là gì, giải quyết vấn đề gì.\n'
            '2. Cơ chế: nó gồm những thành phần / bước nào.\n'
            '3. Một ví dụ tối thiểu bạn tự làm được.\n'
            f'4. Lỗi thường gặp khi dùng “{focus}”.\n'
            '5. Bài tự kiểm tra và cách kiểm chứng kết quả.')


def related_passages(context: str, shown: set[str], limit: int = 3) -> list[dict]:
    """Other statements of the material, closest to what was already shown."""
    reference = ' '.join(sorted(shown))
    ranked: list[dict] = []
    for title, body in useful_blocks(context):
        for sentence in sentences(body):
            key = sentence.strip()
            if not key or key in shown or len(key) < 30:
                continue
            ranked.append({'title': title, 'sentence': key, 'score': overlap_score(key, reference)})
    ranked.sort(key=lambda item: (-item['score'], item['sentence']))
    return ranked[:limit]


STEP_MARKERS = ('bước', 'đầu tiên', 'trước tiên', 'sau đó', 'tiếp theo', 'thứ nhất', 'thứ hai',
                'quy trình', 'các giai đoạn')


def looks_like_steps(text: str) -> bool:
    """Only label a list as a procedure when the material really spells out an order."""
    lowered = (text or '').lower()
    return any(marker in lowered for marker in STEP_MARKERS)


def compose_explain(question: str, context: str, follow_up: bool = False, history=None,
                    allow_compare: bool = True) -> str:
    focus = focus_phrase(question) or 'nội dung bạn hỏi'
    intent = question_intent(question)
    if intent == 'comparison' and allow_compare:
        return compose_comparison(question, context, focus, history)
    passages = rank_passages(question, context)
    if not passages:
        return missing_material(focus, [title for title, _ in source_blocks(context) if title])
    core = first_definition(passages, focus_terms(question), focus)
    examples = example_passages(context)
    blocks: list[str] = []
    # A follow-up ('còn ví dụ thì sao?') already got the definition: answer what was asked.
    if core and not (follow_up and intent in ('example', 'procedure', 'reason')):
        blocks.append(f"**Trả lời ngắn:** {core['sentence'].strip()}{source_tag(core)}")
    rest = [item for item in passages if item is not core]
    if intent == 'example' and examples:
        blocks.append('**Ví dụ trong tài liệu**\n' +
                      '\n'.join(f"- {item['sentence'].strip()}{source_tag(item)}" for item in examples))
    if rest:
        ordered = intent == 'procedure' and looks_like_steps(' '.join(item['sentence'] for item in rest[:3]))
        if ordered:
            body = '\n'.join(f"{index}. {item['sentence'].strip()}{source_tag(item)}"
                             for index, item in enumerate(rest[:4], start=1))
            blocks.append(f'**Trình tự trong tài liệu của bạn**\n{body}')
        else:
            body = '\n'.join(f"- {item['sentence'].strip()}{source_tag(item)}" for item in rest[:4])
            if intent == 'procedure':
                blocks.append('**Các ý liên quan trong tài liệu của bạn**\n'
                              '*(tài liệu chưa ghi thành các bước cụ thể — bạn tự sắp thứ tự khi làm bài)*\n' + body)
            else:
                blocks.append(f'**Chi tiết trong tài liệu của bạn**\n{body}')
    if examples and intent not in ('example', 'procedure'):
        blocks.append('**Ví dụ trong tài liệu**\n' +
                      '\n'.join(f"- {item['sentence'].strip()}{source_tag(item)}" for item in examples))
    elif intent == 'example' and not examples:
        blocks.append(f'**Lưu ý:** tài liệu bạn tải chưa có ví dụ nào về “{focus}”, '
                      'nên mình không tự bịa ví dụ ngoài tài liệu.')
    if len(passages) < 3:
        shown = {item['sentence'].strip() for item in passages}
        if core:
            shown.add(core['sentence'].strip())
        extra = related_passages(context, shown)
        if extra:
            blocks.append('**Liên quan trong tài liệu của bạn**\n' +
                          '\n'.join(f"- {item['sentence']}{source_tag(item)}" for item in extra))
    blocks.append(f'**Tự kiểm tra:** giải thích “{focus}” bằng 2–3 câu của bạn rồi gửi lại Nova để được chấm.')
    return f'## {heading(focus)}\n\n' + '\n\n'.join(blocks)


def comparison_sides(question: str, history=None) -> list[str]:
    """The two things a 'khác nhau giữa A và B' question compares."""
    cleaned = re.sub(r'[?!.]+$', '', (question or '').strip())
    cleaned = re.sub(r'^(giải thích|so sánh|phân biệt|trình bày|nêu|what is the difference between|compare)\s+', '', cleaned,
                     flags=re.I)
    cleaned = re.sub(r'^(sự\s+)?khác\s+nhau\s+(giữa|của)?\s*', '', cleaned, flags=re.I)
    # Bỏ đuôi câu hỏi để nhãn so sánh sạch: 'Stack và Queue khác nhau thế nào'.
    cleaned = re.sub(r'\s*(khác\s+nhau|khác\s+gì|khác\s+biệt|giống\s+nhau|so\s+sánh|như\s+thế\s+nào|ra\s+sao|thế\s+nào)\s*.*$',
                     '', cleaned, flags=re.I).strip(' ?.,:')
    parts = [part.strip(' ?.,:') for part in re.split(r'\s+(?:và|với|vs\.?|and|hay)\s+', cleaned, flags=re.I)]
    parts = [part for part in parts if part and focus_terms(part)]
    if len(parts) >= 2:
        return parts[:2]
    # Two topics named, no 'A và B' separator: 'Stack khác gì Queue?'
    terms = focus_terms(question, 3)
    if len(terms) >= 2:
        return terms[:2]
    # A follow-up comparison often names only one side: the other one is the
    # topic of the previous question ("Vậy nó khác gì Stack?").
    side = focus_phrase(question)
    for item in reversed(list(history or [])):
        if str(item.get('role')) != 'user':
            continue
        previous = focus_phrase(str(item.get('content') or ''))
        if side and previous and previous != side:
            return [previous, side]
        break
    return []


def contrast_passages(question: str, context: str, sides: list[str], limit: int = 3) -> list[dict]:
    """Passages that name both sides of the comparison and state a difference."""
    markers = [focus_terms(side, 2) for side in sides]
    markers = [terms[0] for terms in markers if terms]
    found = []
    for item in rank_passages(question, context, limit=8):
        lowered = item['sentence'].lower()
        if not re.search(CONTRAST_MARKERS, lowered):
            continue
        if markers and not all(marker in lowered for marker in markers):
            continue
        found.append(item)
    return found[:limit]


def compose_comparison(question: str, context: str, focus: str, history=None) -> str:
    sides = comparison_sides(question, history)
    if not sides:
        # Only one side is known: explain it (never re-enter the comparison path).
        return compose_explain(question, context, allow_compare=False)
    lines = [f'## So sánh: {" và ".join(sides)}', '']
    covered = 0
    for side in sides:
        lines.append(f'**{heading(side)}**')
        side_passages = rank_passages(side, context, limit=3)
        if side_passages:
            covered += 1
            lines += [f"- {item['sentence'].strip()}{source_tag(item)}" for item in side_passages]
        else:
            lines.append(f'- Tài liệu bạn tải không có nội dung về “{side}”.')
        lines.append('')
    contrast = contrast_passages(question, context, sides)
    if contrast:
        lines.append('**Câu nêu khác biệt trong tài liệu**')
        lines += [f"- {item['sentence'].strip()}{source_tag(item)}" for item in contrast]
        lines.append('')
    elif covered == len(sides):
        lines.append('Tài liệu có nội dung cho cả hai phía nhưng không có câu nào nêu trực tiếp khác biệt — '
                     'bạn ghép hai phần trên để rút ra kết luận.')
        lines.append('')
    lines.append(f'**Tự kiểm tra:** viết 2 câu nêu khác biệt chính giữa “{sides[0]}” và “{sides[1]}” rồi gửi Nova chấm.')
    return '\n'.join(lines).strip()


def arithmetic_expression(text: str) -> str | None:
    match = re.search(r'\d+(?:[.,]\d+)?(?:\s*[-+*/x×^]\s*\d+(?:[.,]\d+)?)+', text or '')
    return match.group(0).strip() if match else None


def evaluate_arithmetic(expression: str):
    """Deterministic evaluation of a numeric expression (no model guessing)."""
    cleaned = (expression or '').replace('×', '*').replace('x', '*').replace('^', '**').replace(',', '.')
    try:
        tree = ast.parse(cleaned, mode='eval')
    except SyntaxError:
        return None
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Add, ast.Sub,
               ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.USub, ast.UAdd)
    if not all(isinstance(node, allowed) for node in ast.walk(tree)):
        return None
    try:
        value = eval(compile(tree, '<arith>', 'eval'), {'__builtins__': {}}, {})  # noqa: S307 - AST whitelisted
    except (ArithmeticError, ValueError, TypeError):
        return None
    return value


def format_number(value) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return f'{value:g}' if isinstance(value, float) else str(value)


def compose_solve(question: str, context: str) -> str:
    focus = focus_phrase(question) or 'bài toán của bạn'
    expression = arithmetic_expression(question)
    lines = [f'## Hướng giải: {heading(focus)}', '']
    solved = False
    if expression:
        value = evaluate_arithmetic(expression)
        if value is not None:
            solved = True
            readable = expression.replace('*', '×').replace('x', '×').replace('/', ':')
            lines.append(f'**Kết quả:** {readable} = **{format_number(value)}**')
            lines.append('*(Backend tính trực tiếp biểu thức số học — không đoán kết quả.)*')
            lines.append('')
    passages = rank_passages(question, context)
    if passages:
        lines.append('**Dữ kiện liên quan trong tài liệu của bạn**')
        lines += [f"{index}. {item['sentence'].strip()}{source_tag(item)}"
                  for index, item in enumerate(passages[:4], start=1)]
        lines.append('')
    if not solved and not passages:
        lines.append('Mình chưa có dữ kiện để giải: câu hỏi không chứa biểu thức số học và '
                     'tài liệu bạn tải không có phần liên quan.')
        lines.append('')
        lines.append('**Khung giải để bạn điền:**\n'
                     '1. Dữ kiện đã cho và đại lượng cần tìm.\n'
                     '2. Công thức / định lý áp dụng.\n'
                     '3. Thay số và tính.\n'
                     '4. Kiểm tra lại đơn vị và điều kiện của bài.')
    elif not solved:
        lines.append('**Bước làm theo tài liệu:** làm theo thứ tự dữ kiện ở trên, '
                     'ghi lại chỗ còn phân vân rồi gửi lại Nova để chấm.')
    return '\n'.join(lines).strip()


def compose_hint(question: str, context: str) -> str:
    """A nudge, not the answer: what to re-read and what to write yourself."""
    focus = focus_phrase(question) or 'bài học'
    passages = rank_passages(question, context)
    lines = [f'## Gợi ý cho: {heading(focus)}', '']
    if passages:
        titles: list[str] = []
        for item in passages:
            title = item['title'] or 'tài liệu của bạn'
            if title not in titles:
                titles.append(title)
        opener = first_definition(passages, focus_terms(question), focus) or passages[0]
        lead = ' '.join(opener['sentence'].split()[:8])
        lines.append(f'1. Mở lại “{", ".join(titles[:2])}” và đọc kỹ câu bắt đầu bằng: *“{lead}…”*')
        lines.append(f'2. Tự trả lời: “{focus}” dùng để làm gì, và đâu là chi tiết dễ nhầm nhất?')
        related = [item for item in passages if item is not opener][:2]
        if related:
            pointers = '; '.join(' '.join(item['sentence'].split()[:6]) + '…' for item in related)
            lines.append(f'3. Đối chiếu thêm các câu: {pointers}')
        else:
            lines.append('3. Viết ra một ví dụ nhỏ bạn tự nghĩ, rồi kiểm tra lại với tài liệu.')
    else:
        terms = focus_terms(question, 5)
        lines.append(f'1. Viết ra định nghĩa “{focus}” bằng lời của bạn (chưa cần đúng).')
        lines.append(f'2. Liệt kê từ khoá liên quan: {", ".join(terms) if terms else focus}.')
        lines.append('3. Tìm trong Kho học liệu một đoạn nói về nội dung này và đối chiếu.')
    lines += ['', f'**Chưa đưa đáp án** cho “{focus}” — bạn thử viết 2–3 câu rồi gửi lại, mình sẽ chấm và chỉ chỗ thiếu.']
    return '\n'.join(lines)


def compose_summary(question: str, context: str) -> str:
    focus = focus_phrase(question)
    pool: list[dict] = []
    seen: set[str] = set()
    for title, body in useful_blocks(context):
        for position, sentence in enumerate(sentences(body)):
            fingerprint = ' '.join(tokenize(sentence))
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            pool.append({'title': title, 'sentence': sentence, 'position': position, 'score': 0.0})
    if not pool:
        return ('## Tóm tắt\n\nChưa có tài liệu để tóm tắt. Hãy tải tài liệu văn bản '
                '(txt/md/csv/log) vào Kho học liệu rồi yêu cầu lại.')
    frequency: Counter = Counter()
    for item in pool:
        for token in set(tokenize(item['sentence'])):
            frequency[token] += 1
    for item in pool:
        tokens = [token for token in tokenize(item['sentence']) if len(token) > 3]
        if not tokens:
            continue
        item['score'] = sum(frequency[token] for token in tokens) / math.sqrt(len(tokens)) - item['position'] * 0.15
    ranked = sorted(pool, key=lambda item: -item['score'])[:6]
    bullets = '\n'.join(f"- {item['sentence'].strip()}{source_tag(item)}" for item in ranked)
    terms = top_phrases([item['sentence'] for item in pool])
    scope = f' — {focus}' if focus else ''
    return (f'## Tóm tắt{scope}\n\n{bullets}\n\n'
            f'**Từ khoá chính:** {", ".join(terms) if terms else "không đủ dữ liệu"}\n'
            f'**Đã quét:** {len(pool)} câu từ {len(source_blocks(context))} tài liệu.')


def quiz_chunks(context: str, limit: int = 12) -> list[dict]:
    chunks: list[dict] = []
    seen: set[str] = set()
    for title, body in useful_blocks(context):
        for sentence in sentences(body):
            raw = [token for token in re.findall(r'\w+', sentence.lower()) if len(token) >= 3]
            words = re.findall(r'\w+', sentence.lower())
            tokens = [token for token in raw if token not in STOP_WORDS]
            if len(tokens) < 3:
                continue
            key = ' '.join(tokens[:3])
            if key in seen:
                continue
            seen.add(key)
            chunks.append({'title': title, 'sentence': sentence, 'tokens': tokens,
                           'raw': raw, 'words': words})
    return chunks[:limit]


def quiz_anchor(chunk: dict, chunks: list[dict], taken: set[str] | None = None) -> str | None:
    """A readable label for the chunk: its leading noun phrase (the sentence's topic)."""
    words = chunk.get('words') or chunk.get('raw') or chunk['tokens']
    terms = [token for token in words if token not in STOP_WORDS and len(token) >= 2]
    if not terms:
        return None
    taken = taken or set()
    for size in (2, 1, 3):
        label = ' '.join(terms[:size])
        if label and label not in taken:
            return label
    return None


def build_quiz(context: str, limit: int = 4) -> list[dict]:
    """Multiple-choice items whose correct option is a true statement of the material."""
    chunks = quiz_chunks(context, limit * 3)
    if len(chunks) < 4:
        return []
    items: list[dict] = []
    labels: set[str] = set()
    for chunk in chunks:
        if len(items) >= limit:
            break
        anchor = quiz_anchor(chunk, chunks, labels)
        if not anchor:
            continue
        correct = chunk['sentence'].strip()[:160]
        own = set(chunk['tokens'])
        others = [item for item in chunks if item is not chunk]
        # closest statements first would be too similar; least overlapping ones are the distractors
        others.sort(key=lambda item: (len(own & set(item['tokens'])), item['sentence']))
        distractors: list[str] = []
        for item in others:
            text = item['sentence'].strip()[:160]
            if text == correct or text in distractors:
                continue
            distractors.append(text)
            if len(distractors) == 3:
                break
        if len(distractors) < 3:
            continue
        labels.add(anchor)
        options = [correct] + distractors
        offset = sum(ord(char) for char in anchor) % len(options)
        options = options[offset:] + options[:offset]
        items.append({'question': f'Theo tài liệu của bạn, phát biểu nào đúng về “{anchor}”?',
                      'options': options, 'answer_index': options.index(correct), 'max_score': 2.5,
                      'anchor': anchor})
    return items


def compose_quiz(question: str, context: str) -> str:
    topic = focus_phrase(question) or 'tài liệu của bạn'
    items = build_quiz(context)
    if not items:
        return (f'## Quiz nhanh: {heading(topic)}\n\n'
                'Mình cần tài liệu văn bản để tạo câu hỏi có đáp án kiểm chứng được. '
                'Bạn hãy tải tài liệu (txt/md/csv/log) có nội dung cần ôn rồi yêu cầu lại.\n\n'
                '**Trong lúc đó, tự kiểm tra 3 câu này:**\n'
                f'1. “{topic}” là gì, dùng để làm gì?\n'
                f'2. Nêu một ví dụ áp dụng “{topic}”.\n'
                f'3. Khi nào KHÔNG nên dùng “{topic}”?')
    lines = [f'## Quiz nhanh: {heading(topic)}', '']
    for index, item in enumerate(items, start=1):
        lines.append(f"{index}. {item['question']}")
        for letter, option in zip('ABCD', item['options']):
            lines.append(f'   - **{letter}.** {option}')
    answers = ', '.join(f"{index}-{'ABCD'[item['answer_index']]}"
                        for index, item in enumerate(items, start=1))
    lines += ['', f'**Đáp án:** {answers}', '', '> Đáp án lấy trực tiếp từ tài liệu bạn đã tải.']
    return '\n'.join(lines)


class LocalEngine:
    """Deterministic, dependency-free engine used when no provider is configured."""

    name = 'local'
    uses_model = False

    # ---------------------------------------------------------------- chat ---
    def answer(self, *, mode: str, question: str, context: str, history: list | None = None) -> str:
        mode = mode if mode in MODES else 'explain'
        if is_gibberish(question):
            return ('## Mình chưa rõ câu hỏi\n\n'
                    'Câu bạn gửi chưa có nội dung để mình bám vào. Bạn gõ lại cụ thể hơn nhé — ví dụ '
                    '“Giải thích khái niệm X”, “Tóm tắt tài liệu vừa tải” hoặc “Cho ví dụ về X”.')
        asked = effective_question(question, history)
        follow_up = asked != question
        if mode == 'solve':
            return compose_solve(asked, context)
        if mode == 'hint':
            return compose_hint(asked, context)
        if mode == 'summarize':
            return compose_summary(asked, context)
        if mode == 'generate_quiz':
            return compose_quiz(asked, context)
        return compose_explain(asked, context, follow_up, history)

    # -------------------------------------------------------------- grading ---
    def complete_json(self, *, task: str, payload: dict) -> dict:
        if task == 'grading':
            return self._grading(payload)
        if task == 'roadmap':
            return self._roadmap(payload)
        if task == 'quiz':
            return self._quiz_json(payload)
        raise EngineError(f'unsupported local task: {task}')

    def _grading(self, payload: dict) -> dict:
        answer = str(payload.get('student_answer') or '')
        expected = str(payload.get('expected_answer') or '')
        rubric = str(payload.get('rubric') or '')
        kind = str(payload.get('exercise_type') or 'essay')
        coverage = overlap_score(answer, expected)
        rubric_ratio = overlap_score(answer, rubric) if rubric else coverage
        length_ok = len(tokenize(answer)) >= max(4, len(tokenize(expected)) // 6)
        strengths: list[str] = []
        weaknesses: list[str] = []
        hints: dict[str, bool] = {}
        structural = 0.0
        explanation = ''
        satisfied = None
        if kind == 'code':
            hints = {name: bool(re.search(pattern, answer)) for name, pattern in CODE_HINTS.items()}
            structural = sum(1 for present in hints.values() if present) / len(CODE_HINTS)
            ratio = round(0.60 * structural + 0.25 * rubric_ratio + 0.15 * coverage, 4)
            explanation = (f'Độ phủ ý chính đạt {round(coverage * 100)}%, '
                           f'mức khớp rubric {round(rubric_ratio * 100)}%.')
            if hints['class']:
                strengths.append('Có khai báo lớp/phương thức rõ ràng.')
            if hints['inheritance']:
                strengths.append('Thể hiện quan hệ kế thừa hoặc triển khai (extends/implements).')
            else:
                weaknesses.append('Chưa thấy từ khoá thể hiện kế thừa (extends/implements).')
            if not hints['body']:
                weaknesses.append('Mã thiếu khối lệnh/thân hàm hoàn chỉnh.')
            if not hints['return']:
                weaknesses.append('Mã chưa có dòng trả lời hoặc in kết quả.')
        else:
            # Offline essay heuristic: relevance to the question, rubric criteria
            # covered, presence of an example and answer length. A configured
            # provider engine gives a real rubric read; this keeps grading usable
            # without a key and never awards a perfect score without the model.
            graded_terms = content_only(str(payload.get('question') or ''))
            topic = str(payload.get('topic') or '')
            relevance = 0.6 * term_coverage(answer, topic) + 0.4 * (term_coverage(answer, graded_terms) if graded_terms else 0)
            criteria = rubric_criteria(rubric)
            covered = sum(1 for item in criteria if term_coverage(answer, item) >= 0.34)
            criteria_ratio = (covered / len(criteria)) if criteria else 0.5
            has_example = bool(re.search(r'ví dụ|=>|\d', answer.lower()))
            ratio = round(0.40 * relevance + 0.30 * criteria_ratio
                          + 0.15 * (1.0 if has_example else 0.0)
                          + 0.15 * (1.0 if length_ok else 0.3), 4)
            ratio = min(ratio * 1.2, 0.92)
            if relevance < 0.15:
                ratio = min(ratio, 0.4)  # form alone cannot pass an off-topic essay
            if relevance >= 0.4:
                strengths.append('Trả lời đúng trọng tâm câu hỏi.')
            else:
                weaknesses.append('Chưa bám sát trọng tâm câu hỏi.')
            if has_example:
                strengths.append('Có ví dụ minh hoạ cụ thể.')
            else:
                weaknesses.append('Nên thêm ví dụ minh hoạ cụ thể.')
            explanation = (f'Chấm offline theo rubric: độ liên quan {round(relevance * 100)}%, '
                           f'tiêu chí rubric đạt {covered}/{len(criteria)}.')
        if ratio >= 0.8 and length_ok:
            ratio = max(ratio, 0.9)
        if length_ok:
            strengths.append('Trả lời đủ ý, không quá ngắn.')
        else:
            weaknesses.append('Câu trả lời quá ngắn để thể hiện hiểu biết.')
        if kind == 'code':
            explanation += f" Kiểm tra tĩnh: {sum(1 for present in hints.values() if present)}/{len(CODE_HINTS)} dấu hiệu cấu trúc mã."
            if structural >= 0.6:
                satisfied = lambda item: any(word in item.lower() for word in ('cú pháp', 'syntax', 'nguy hiểm'))
        return {
            'ratio': min(ratio, 1.0),
            'is_correct': ratio >= 0.5,
            'strengths': strengths or ['Đã xác định đúng chủ đề cần trả lời.'],
            'weaknesses': weaknesses or ['Cần diễn đạt chặt chẽ hơn theo rubric.'],
            'missing_points': rubric_gaps(answer, rubric, expected, satisfied=satisfied),
            'suggested_answer': expected or 'Xem lại tài liệu để bổ sung đáp án chuẩn.',
            'recommended_review': (['Ôn lại phần lý thuyết liên quan trong tài liệu đã tải.']
                                   + ([rubric] if rubric else [])),
            'explanation': explanation,
        }

    def _quiz_json(self, payload: dict) -> dict:
        topic = str(payload.get('topic') or 'Kiến thức trọng tâm')
        context = str(payload.get('context') or '')
        items = build_quiz(context)
        if not items:
            return {'questions': [], 'error': 'not enough document text to build a verifiable quiz'}
        return {'questions': [{'question': item['question'], 'options': item['options'],
                               'answer_index': item['answer_index'], 'max_score': item['max_score']}
                              for item in items], 'topic': topic}

    def _roadmap(self, payload: dict) -> dict:
        subject = str(payload.get('subject') or 'Kiến thức nền')
        goal = str(payload.get('goal') or 'Nắm vững kiến thức cơ bản')
        level = str(payload.get('current_level') or 'beginner')
        target = str(payload.get('target_level') or 'intermediate')
        weaknesses = payload.get('weaknesses') or []
        study_time = int(payload.get('study_time') or 180)
        pace = str(payload.get('pace') or 'steady')
        topics = payload.get('topics') or []
        if not isinstance(topics, list) or not topics:
            topics = [f'Kiến thức nền về {subject}', f'Thực hành {subject}', f'Ứng dụng {subject}']
        lessons_per_module = {'slow': 2, 'steady': 3, 'fast': 4}.get(pace, 3)
        minutes_per_lesson = max(20, study_time // (lessons_per_module * 2))
        modules = []
        for module_index, topic in enumerate(topics[:5], start=1):
            lessons = []
            for lesson_index in range(1, lessons_per_module + 1):
                lessons.append({
                    'key': f'm{module_index}-l{lesson_index}',
                    'title': f'{topic} — phần {lesson_index}',
                    'objectives': [
                        f'Hiểu khái niệm chính của {topic}',
                        f'Áp dụng {topic} vào bài tập nhỏ',
                    ],
                    'examples': [f'Ví dụ minh hoạ cho {topic} (phần {lesson_index})'],
                    'estimated_minutes': minutes_per_lesson,
                })
            modules.append({
                'key': f'm{module_index}',
                'title': f'Chặng {module_index}: {topic}',
                'difficulty': level if module_index == 1 else ('intermediate' if module_index < 4 else target),
                'lessons': lessons,
                'quiz': {'question_count': 3, 'max_score': 10},
                'assessment': {'type': 'short_answer', 'max_score': 10},
            })
        return {
            'title': f'Lộ trình {subject} → {goal}',
            'summary': (f'Bắt đầu từ mức {LEVEL_LABELS.get(level, level)}, hướng tới '
                        f'{LEVEL_LABELS.get(target, target)}. Nhịp học {PACE_LABELS.get(pace, pace)}, '
                        f'khoảng {study_time} phút/tuần.'),
            'modules': modules,
            'topics': list(topics),
            'focus_weaknesses': list(weaknesses)[:3],
        }


class ProviderEngine:
    """OpenAI-compatible chat-completions provider (key stays server-side)."""

    name = 'provider'
    uses_model = True

    def __init__(self, *, base_url: str, api_key: str, model: str, timeout: int = 45):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def _chat(self, messages: list[dict], *, json_mode: bool = False) -> str:
        body = {'model': self.model, 'messages': messages, 'temperature': 0.2}
        if json_mode:
            body['response_format'] = {'type': 'json_object'}
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        request = urllib.request.Request(
            f'{self.base_url}/chat/completions',
            data=json.dumps(body).encode('utf-8'),
            headers=headers,
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            detail = ''
            try:
                detail = error.read().decode('utf-8', 'ignore')[:300]
            except Exception:  # noqa: BLE001 - body is best effort only
                detail = ''
            raise EngineError(f'AI provider error {error.code}: {detail or error.reason}') from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise EngineError(f'AI provider unavailable: {error}') from error
        choices = payload.get('choices') or []
        if not choices:
            raise EngineError('AI provider returned an empty response')
        return (choices[0].get('message') or {}).get('content') or ''

    def answer(self, *, mode: str, question: str, context: str, history: list | None = None) -> str:
        system = ('Bạn là Nova, gia sư AI của StudyHub. Trả lời bằng tiếng Việt, dùng Markdown gọn gàng. '
                  f'{MODE_INSTRUCTIONS.get(mode, MODE_INSTRUCTIONS["explain"])} '
                  'Ưu tiên ngữ cảnh tài liệu được cung cấp; nếu ngữ cảnh không có '
                  'thông tin cho câu hỏi, nói rõ là tài liệu chưa có phần đó rồi trả lời bằng kiến thức chung '
                  'và ghi chú rõ đó là kiến thức chung. Không bịa số liệu hay trích dẫn không có trong ngữ cảnh.')
        messages = [{'role': 'system', 'content': system}]
        for item in (history or [])[-6:]:
            role = 'assistant' if item.get('role') == 'assistant' else 'user'
            messages.append({'role': role, 'content': str(item.get('content') or '')[:2000]})
        messages.append({'role': 'user',
                         'content': f'Ngữ cảnh tài liệu:\n{context[:6000]}\n\nCâu hỏi: {question}'})
        text = self._chat(messages)
        if not text.strip():
            raise EngineError('AI provider returned an empty message')
        return text

    def complete_json(self, *, task: str, payload: dict) -> dict:
        instructions = {
            'grading': 'Chấm điểm theo rubric. Trả JSON với các khoá: ratio (0..1), is_correct, '
                       'strengths, weaknesses, missing_points, suggested_answer, recommended_review, explanation.',
            'roadmap': ('Tạo lộ trình học. Chỉ trả về JSON, không thêm chữ nào ngoài JSON. Cấu trúc bắt buộc:\n'
                        '{"title": str, "summary": str, "focus_weaknesses": [str], "modules": ['
                        '{"key": "m1", "title": str, "difficulty": "beginner|intermediate|advanced", '
                        '"lessons": [{"key": "m1-l1", "title": str, "objectives": [str], "examples": [str], '
                        '"estimated_minutes": int}], "quiz": {"question_count": int, "max_score": 10}, '
                        '"assessment": {"type": "short_answer", "max_score": 10}}]}\n'
                        'Mỗi module PHẢI có 2-4 lesson là object có "title"; không được để lessons rỗng '
                        'và không được trả lesson dạng chuỗi.'),
            'quiz': ('Tạo quiz trắc nghiệm bám sát tài liệu. Chỉ trả về JSON, không thêm chữ nào ngoài JSON. '
                     'Cấu trúc bắt buộc: {"questions": [{"question": str, "options": [str, str, str, str], '
                     '"answer_index": int (0..3, vị trí đáp án đúng), "max_score": int}], "topic": str}. '
                     'Tạo 3-5 câu, mỗi câu ĐÚNG 4 lựa chọn; nội dung câu hỏi và lựa chọn phải lấy từ tài liệu, '
                     'các lựa chọn sai phải hợp lý chứ không vô nghĩa.'),
        }
        text = self._chat([
            {'role': 'system', 'content': instructions.get(task, 'Trả về JSON hợp lệ.')},
            {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)[:8000]},
        ], json_mode=True)
        try:
            result = json.loads(text)
        except json.JSONDecodeError as error:
            raise EngineError(f'invalid JSON from provider: {error}') from error
        if not isinstance(result, dict):
            raise EngineError('provider JSON must be an object')
        return result


# Sức khoẻ provider gần nhất, dùng để báo cho UI biết Nova đang phải trả lời offline.
PROVIDER_HEALTH = {'ok': True, 'reason': '', 'code': None}


def provider_failure_reason(error: BaseException) -> str:
    """Vietnamese explanation for a provider failure (quota, key, network)."""
    text = str(error)
    status = re.search(r'error (\d{3})', text)
    code = int(status.group(1)) if status else None
    if code in (401, 403):
        return 'API key bị từ chối (sai, hết hạn hoặc đã thu hồi)'
    if code == 402:
        return 'tài khoản nhà cung cấp đã hết số dư'
    if code == 429:
        return 'đã hết hạn mức (quota) hoặc bị giới hạn tần suất gọi'
    if code and code >= 500:
        return 'nhà cung cấp đang lỗi'
    if 'timed out' in text or 'timeout' in text.lower():
        return 'kết nối tới nhà cung cấp quá lâu'
    return 'không kết nối được nhà cung cấp'


class ResilientEngine:
    """Provider first; when it fails (quota, key, network) answer offline.

    Nova must never become unusable just because a key ran out of tokens: the
    learner still gets an answer built from their own documents, with a visible
    note saying the model is temporarily unavailable.
    """

    name = 'provider-resilient'

    def __init__(self, primary, fallback=None):
        self.primary = primary
        self.fallback = fallback or LocalEngine()

    @property
    def uses_model(self) -> bool:
        """True khi engine thật sự có model (để bộ chấm quyết định cách chấm)."""
        return bool(getattr(self.primary, 'uses_model', False))

    def _degrade(self, error: BaseException) -> str:
        reason = provider_failure_reason(error)
        PROVIDER_HEALTH.update({'ok': False, 'reason': reason, 'code': None})
        return reason

    @staticmethod
    def _notice(reason: str) -> str:
        return (f'> ⚠️ Mô hình AI đang tạm không dùng được ({reason}). '
                'Câu trả lời dưới đây do Nova dựng từ tài liệu của bạn.\n\n')

    def answer(self, *, mode: str, question: str, context: str, history: list | None = None) -> str:
        try:
            text = self.primary.answer(mode=mode, question=question, context=context, history=history)
        except EngineError as error:
            reason = self._degrade(error)
            offline = self.fallback.answer(mode=mode, question=question, context=context, history=history)
            return self._notice(reason) + offline
        PROVIDER_HEALTH.update({'ok': True, 'reason': '', 'code': None})
        return text

    def complete_json(self, *, task: str, payload: dict) -> dict:
        try:
            result = self.primary.complete_json(task=task, payload=payload)
        except EngineError as error:
            self._degrade(error)
            return self.fallback.complete_json(task=task, payload=payload)
        PROVIDER_HEALTH.update({'ok': True, 'reason': '', 'code': None})
        return result


def get_engine():
    """Return the configured engine: provider with offline fallback, else offline."""
    settings = config.provider_settings()
    if not settings:
        return LocalEngine()
    return ResilientEngine(
        ProviderEngine(
            base_url=settings['base_url'],
            api_key=settings['api_key'],
            model=settings['model'],
        )
    )
