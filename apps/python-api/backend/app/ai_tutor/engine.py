"""Server-side AI engine for the StudyHub AI Tutor.

Every AI call happens behind the HTTP API: the React client never holds a
provider key and never runs AI processing. When provider credentials are absent
the deterministic local engine answers instead, so chat, assessment, roadmaps,
exercises and grading all keep working offline.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

MODES = ('explain', 'solve', 'hint', 'summarize', 'generate_quiz')
LEVELS = ('beginner', 'intermediate', 'advanced')
DIFFICULTY_ORDER = {'beginner': 0, 'intermediate': 1, 'advanced': 2}

STOP_WORDS = {
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'you', 'your',
    'cua', 'cho', 'voi', 'nhung', 'trong', 'duoc', 'cac', 'mot', 'khi', 'hay', 'nhu', 'thi',
    'la', 'va', 'co', 'khong', 'cung', 'nay', 'do', 'ra', 'vao', 'sau', 'truoc', 'theo',
    'what', 'which', 'when', 'where', 'how', 'why', 'does', 'did', 'can', 'into', 'than',
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
    parts = re.split(r'(?<=[.!?;:])\s+|\n+', text or '')
    return [part.strip() for part in parts if len(part.strip()) >= 30]


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


class LocalEngine:
    """Deterministic, dependency-free engine used when no provider is configured."""

    name = 'local'

    # ---------------------------------------------------------------- chat ---
    def answer(self, *, mode: str, question: str, context: str, history: list | None = None) -> str:
        mode = mode if mode in MODES else 'explain'
        topic = question.strip()
        evidence = self._evidence(question, context)
        if mode == 'explain':
            return self._explain(topic, evidence)
        if mode == 'solve':
            return self._solve(topic, evidence)
        if mode == 'hint':
            return self._hint(topic, evidence)
        if mode == 'summarize':
            return self._summarize(topic, evidence)
        return self._quiz(topic, evidence)

    def _evidence(self, question: str, context: str) -> list[str]:
        terms = set(keywords(question, 10))
        found = sentences(context)
        if not found:
            compact = (context or '').strip()
            return [compact[:400]] if compact else []
        scored = []
        for sentence in found:
            lower = sentence.lower()
            hit = sum(1 for term in terms if term in lower)
            scored.append((hit, sentence))
        scored.sort(key=lambda item: (-item[0], -len(item[1])))
        picked = [sentence for hit, sentence in scored if hit][:4]
        return picked or [scored[0][1]]

    def _explain(self, topic: str, evidence: list[str]) -> str:
        if not evidence:
            return (f'## Giải thích: {topic}\n\n'
                    'Mình chưa tìm thấy nội dung tài liệu liên quan. Bạn hãy tải tài liệu (txt/md/csv/log) '
                    'hoặc hỏi cụ thể hơn để mình bám sát bài học.\n\n'
                    '**Gợi ý khung trả lời:** định nghĩa → cơ chế → ví dụ → lỗi thường gặp.')
        body = '\n'.join(f'- {item}' for item in evidence)
        return (f'## Giải thích: {topic}\n\n'
                f'**Nội dung bám theo tài liệu của bạn**\n{body}\n\n'
                '**Cách hiểu nhanh**\n'
                '1. Nắm định nghĩa cốt lõi trước.\n'
                '2. Xem cơ chế hoạt động bên trong.\n'
                '3. Liên hệ ví dụ đã có trong tài liệu.\n'
                '4. Tự kiểm tra bằng một câu hỏi nhỏ.')

    def _solve(self, topic: str, evidence: list[str]) -> str:
        steps = evidence or ['Xác định dữ kiện đã cho và yêu cầu cần tìm.']
        body = '\n'.join(f'{index}. {step}' for index, step in enumerate(steps, start=1))
        return (f'## Hướng giải: {topic}\n\n{body}\n\n'
                f'**Bước kiểm tra cuối**\n- Đối chiếu kết quả với đề bài.\n- Ghi lại chỗ còn phân vân để hỏi lại.')

    def _hint(self, topic: str, evidence: list[str]) -> str:
        seeds = evidence or [topic]
        lines = []
        for index, item in enumerate(seeds[:3], start=1):
            words = [word for word in item.split() if len(word) > 3][:5]
            lines.append(f'{index}. Chú ý các từ khoá: {", ".join(words) if words else item[:40]}')
        return (f'## Gợi ý cho: {topic}\n\n' + '\n'.join(lines) +
                '\n\nMình chưa đưa đáp án đầy đủ — bạn thử làm rồi gửi lại để mình chấm nhé.')

    def _summarize(self, topic: str, evidence: list[str]) -> str:
        if not evidence:
            return f'## Tóm tắt: {topic}\n\nChưa có tài liệu để tóm tắt. Hãy tải tài liệu trước.'
        bullets = '\n'.join(f'- {item[:280]}' for item in evidence)
        return f'## Tóm tắt: {topic}\n\n{bullets}\n\n**Số ý chính:** {len(evidence)}'

    def _quiz(self, topic: str, evidence: list[str]) -> str:
        pool = evidence or [topic]
        lines = []
        for index, item in enumerate(pool[:4], start=1):
            focus = ' '.join([word for word in item.split() if len(word) > 4][:3]) or topic
            lines.append(f'{index}. **Câu {index}:** Trình bày ngắn gọn về *{focus}* trong nội dung “{topic}”.')
        return ('## Quiz nhanh: ' + topic + '\n\n' + '\n'.join(lines) +
                '\n\n> Gửi câu trả lời để mình chấm theo rubric.')

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
        pool = sentences(context) or [topic]
        items = []
        for index, item in enumerate(pool[:4], start=1):
            items.append({
                'question': f'Câu {index}: Ý nào đúng nhất về {topic}?',
                'options': [item[:90], 'Không có phương án nào đúng', 'Cả ba phương án đều sai', 'Không xác định được'],
                'answer_index': 0,
                'max_score': 2.5,
            })
        return {'questions': items}

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
            'summary': (f'Bắt đầu từ mức {level}, hướng tới {target}. '
                        f'Pace {pace}, khoảng {study_time} phút/tuần.'),
            'modules': modules,
            'focus_weaknesses': list(weaknesses)[:3],
        }


class ProviderEngine:
    """OpenAI-compatible chat-completions provider (key stays server-side)."""

    name = 'provider'

    def __init__(self, *, base_url: str, api_key: str, model: str, timeout: int = 45):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def _chat(self, messages: list[dict], *, json_mode: bool = False) -> str:
        body = {'model': self.model, 'messages': messages, 'temperature': 0.2}
        if json_mode:
            body['response_format'] = {'type': 'json_object'}
        request = urllib.request.Request(
            f'{self.base_url}/chat/completions',
            data=json.dumps(body).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {self.api_key}'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode('utf-8'))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise EngineError(f'AI provider unavailable: {error}') from error
        choices = payload.get('choices') or []
        if not choices:
            raise EngineError('AI provider returned an empty response')
        return (choices[0].get('message') or {}).get('content') or ''

    def answer(self, *, mode: str, question: str, context: str, history: list | None = None) -> str:
        system = ('Bạn là Nova, AI Tutor của StudyHub. Trả lời bằng tiếng Việt, dùng Markdown, '
                  f'chế độ hiện tại: {mode}. Chỉ dựa trên ngữ cảnh tài liệu được cung cấp.')
        messages = [{'role': 'system', 'content': system}]
        for item in (history or [])[-6:]:
            role = 'assistant' if item.get('role') == 'assistant' else 'user'
            messages.append({'role': role, 'content': str(item.get('content') or '')[:2000]})
        messages.append({'role': 'user', 'content': f'Ngữ cảnh tài liệu:\n{context[:6000]}\n\nCâu hỏi: {question}'})
        text = self._chat(messages)
        if not text.strip():
            raise EngineError('AI provider returned an empty message')
        return text

    def complete_json(self, *, task: str, payload: dict) -> dict:
        instructions = {
            'grading': 'Chấm điểm theo rubric. Trả JSON với các khoá: ratio (0..1), is_correct, '
                       'strengths, weaknesses, missing_points, suggested_answer, recommended_review, explanation.',
            'roadmap': 'Tạo lộ trình học. Trả JSON với các khoá: title, summary, modules '
                       '(mỗi module có key, title, difficulty, lessons, quiz, assessment), focus_weaknesses.',
            'quiz': 'Tạo quiz. Trả JSON với khoá questions (question, options, answer_index, max_score).',
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


def get_engine():
    """Return the configured engine, falling back to the local one."""
    provider = os.environ.get('STUDYHUB_AI_PROVIDER', 'local').strip().lower()
    api_key = os.environ.get('STUDYHUB_AI_API_KEY', '').strip()
    if provider in ('', 'local') or not api_key:
        return LocalEngine()
    return ProviderEngine(
        base_url=os.environ.get('STUDYHUB_AI_BASE_URL', 'https://api.openai.com/v1'),
        api_key=api_key,
        model=os.environ.get('STUDYHUB_AI_MODEL', 'gpt-4o-mini'),
    )
