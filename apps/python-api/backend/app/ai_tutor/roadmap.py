"""Learning-journey service: assessment -> level -> goal -> roadmap -> adaptive.

The backend decides the learner level and builds the roadmap; the React client
only collects answers and renders the result.
"""
from __future__ import annotations

import json
import math
import re

from .engine import DIFFICULTY_ORDER, EngineError, LEVELS, tokenize

LEVEL_FROM_PERCENT = ((80, 'advanced'), (55, 'intermediate'), (0, 'beginner'))

# The diagnostic asks the learner to place themselves on each of their own topics
# instead of pretending to know the subject: offline there is no model to author
# and verify knowledge questions, and a fixed question bank would ask about a
# subject the learner never typed.
FAMILIARITY_OPTIONS = (
    'Chưa từng nghe tới',
    'Đã đọc nhưng chưa áp dụng',
    'Đã làm được bài tập cơ bản',
    'Dùng thành thạo trong bài tập/dự án',
)
FAMILIARITY_POINTS = (0, 1, 2, 3)
REFLECTION_MIN_WORDS = 20
WARMUP_EXPRESSION = (7, 6, 4)

PACE_MINUTES = {'slow': 120, 'steady': 240, 'fast': 420}


class RoadmapError(RuntimeError):
    """Raised when a roadmap cannot be produced."""


def normalize_level(value, default: str = 'beginner') -> str:
    level = str(value or '').strip().lower()
    return level if level in LEVELS else default


def normalize_pace(value, default: str = 'steady') -> str:
    pace = str(value or '').strip().lower()
    return pace if pace in PACE_MINUTES else default


def level_from_percentage(percent: float) -> str:
    for threshold, level in LEVEL_FROM_PERCENT:
        if percent >= threshold:
            return level
    return 'beginner'


PUBLIC_QUESTION_FIELDS = ('key', 'type', 'prompt', 'options', 'max_score', 'topic')


def public_question(question: dict) -> dict:
    """Assessment question without its answer key — the client never grades."""
    return {field: question[field] for field in PUBLIC_QUESTION_FIELDS if field in question}


def assessment_topics(payload: dict) -> list[str]:
    """Topics the diagnostic is built around: the learner's own list plus the subject."""
    explicit = [str(item).strip() for item in (payload.get('topics') or []) if str(item).strip()]
    subject = str(payload.get('subject') or '').strip()
    topics = explicit[:2] if subject else explicit[:3]
    if subject and subject not in topics:
        topics.append(subject)
    if not topics:
        topics = ['Kiến thức nền']
    return topics[:3]


def build_assessment_questions(payload: dict) -> list[dict]:
    """Deterministic diagnostic for any subject: self-placement, recall and a warm-up."""
    topics = assessment_topics(payload)
    subject = str(payload.get('subject') or '').strip() or topics[0]
    first, second, third = WARMUP_EXPRESSION
    questions = []
    for topic in topics:
        questions.append({
            'key': f'q{len(questions) + 1}',
            'type': 'scale',
            'prompt': f'Hiện tại bạn đang ở mức nào với “{topic}”?',
            'options': list(FAMILIARITY_OPTIONS),
            'points': list(FAMILIARITY_POINTS),
            'max_score': 3,
            'topic': topic,
        })
    questions.append({
        'key': f'q{len(questions) + 1}',
        'type': 'reflection',
        'prompt': f'Viết 2–3 câu giải thích “{topics[0]}” bằng lời của bạn '
                  '(chưa cần đúng hoàn toàn — Nova dùng để đo mức nền).',
        'max_score': 3,
        'topic': topics[0],
    })
    questions.append({
        'key': f'q{len(questions) + 1}',
        'type': 'math',
        'prompt': f'Khởi động tính toán: {first} + {second} × {third} bằng bao nhiêu?',
        'expected': str(first + second * third),
        'max_score': 2,
        'topic': 'Kỹ năng tính toán',
    })
    questions.append({
        'key': f'q{len(questions) + 1}',
        'type': 'reflection',
        'prompt': f'Bạn đã từng làm bài tập hoặc dự án nào với {subject}? '
                  'Mô tả ngắn 2–3 câu và phần bạn thấy khó nhất.',
        'max_score': 3,
        'topic': subject,
    })
    questions.append({
        'key': f'q{len(questions) + 1}',
        'type': 'reflection',
        'prompt': 'Mục tiêu cụ thể của bạn trong 4 tuần tới là gì? Viết 2–3 câu, càng cụ thể càng tốt '
                  '(Nova dùng để chia nhỏ lộ trình).',
        'max_score': 3,
        'topic': 'Mục tiêu',
    })
    return questions


def start_assessment(payload: dict) -> dict:
    subject = str(payload.get('subject') or '').strip()
    goal = str(payload.get('goal') or '').strip()
    pace = normalize_pace(payload.get('pace'))
    study_time = payload.get('study_time')
    try:
        study_time = int(study_time)
    except (TypeError, ValueError):
        study_time = PACE_MINUTES[pace]
    if study_time <= 0:
        study_time = PACE_MINUTES[pace]
    return {
        'assessment_id': None,
        'subject': subject,
        'goal': goal,
        'topics': assessment_topics(payload),
        'pace': pace,
        'study_time': min(study_time, 3000),
        'questions': [public_question(question) for question in build_assessment_questions(payload)],
    }


def choice_index(question: dict, given: str) -> int:
    """Resolve the chosen option from the option text the UI sends or an index."""
    options = question.get('options') or []
    text = str(given or '').strip()
    if not text:
        return -1
    for index, option in enumerate(options):
        if text.lower() == str(option).strip().lower():
            return index
    try:
        value = int(float(text))
    except (TypeError, ValueError):
        return -1
    return value if 0 <= value < len(options) else -1


NUMBER_PATTERN = re.compile(r'-?\d+(?:[.,]\d+)?')


def numbers_in(text: str) -> list[float]:
    return [float(match.replace(',', '.')) for match in NUMBER_PATTERN.findall(text or '')]


def grade_reflection(answer: str, topic: str, max_score: float) -> tuple[float, list[str]]:
    """Deterministic effort score for a free-text self report (not a knowledge claim)."""
    text = (answer or '').strip()
    sentences = [chunk for chunk in re.split(r'[.!?;\n]+', text) if len(chunk.strip()) >= 8]
    notes: list[str] = []
    earned = 0.0
    if sentences:
        earned += 1.0
    else:
        notes.append('Chưa thấy câu trả lời hoàn chỉnh.')
    if topic and topic.lower() in text.lower():
        earned += 1.0
    else:
        notes.append(f'Nên nhắc trực tiếp tới “{topic}” trong câu trả lời.')
    if len(tokenize(text)) >= REFLECTION_MIN_WORDS:
        earned += 1.0
    else:
        notes.append(f'Viết dài hơn (khoảng {REFLECTION_MIN_WORDS} từ) để Nova đo được mức nền.')
    ratio = 1.0 if max_score <= 0 else min(1.0, earned / 3.0)
    return round(ratio * float(max_score), 2), notes


def summarize_answers(answers: list[dict], questions: list[dict] | None = None) -> dict:
    """Score the diagnostic answers and derive level, strengths and weaknesses."""
    bank = questions if questions else build_assessment_questions({})
    lookup = {question['key']: question for question in bank}
    total = 0.0
    maximum = 0.0
    correct_topics: list[str] = []
    weak_topics: list[str] = []
    detail: list[dict] = []
    for item in answers if isinstance(answers, list) else []:
        if not isinstance(item, dict):
            continue
        question = lookup.get(str(item.get('key')))
        if not question:
            continue
        maximum += float(question['max_score'])
        given = str(item.get('answer') or '').strip()
        kind = question['type']
        earned = 0.0
        notes: list[str] = []
        if kind == 'scale':
            picked = choice_index(question, given)
            points = question.get('points') or list(FAMILIARITY_POINTS)
            earned = float(points[picked]) if 0 <= picked < len(points) else 0.0
        elif kind == 'multiple_choice':
            earned = float(question['max_score']) if choice_index(question, given) == int(question['answer_index']) else 0.0
        elif kind == 'math':
            expected = numbers_in(str(question.get('expected') or ''))
            student = numbers_in(given)
            hit = any(math.isclose(value, target, rel_tol=1e-6, abs_tol=1e-6)
                      for value in student for target in expected)
            earned = float(question['max_score']) if hit else 0.0
            if not hit:
                notes.append('Kết quả tính toán chưa khớp.')
        elif kind == 'reflection':
            earned, notes = grade_reflection(given, str(question.get('topic') or ''), float(question['max_score']))
        else:
            from .engine import overlap_score
            ratio = overlap_score(given, str(question.get('expected') or ''))
            if ratio >= 0.6:
                earned = float(question['max_score'])
            elif ratio >= 0.35:
                earned = round(float(question['max_score']) * 0.5, 2)
        total += earned
        hit = earned >= float(question['max_score']) * 0.6
        if hit:
            correct_topics.append(str(question['topic']))
        else:
            weak_topics.append(str(question['topic']))
        detail.append({
            'key': question['key'],
            'topic': question['topic'],
            'score': earned,
            'max_score': float(question['max_score']),
            'is_correct': hit,
            'notes': notes,
        })
    percent = round((total / maximum) * 100) if maximum else 0
    return {
        'score': round(total, 2),
        'max_score': round(maximum, 2),
        'percentage': percent,
        'level': level_from_percentage(percent),
        'strengths': sorted(set(correct_topics)),
        'weaknesses': sorted(set(weak_topics)),
        'detail': detail,
    }


def build_roadmap(payload: dict, *, engine) -> dict:
    """Ask the engine for a roadmap, then normalize it into the wire contract.

    A model can answer with a half-formed JSON (a module without lessons, an
    empty list…). Such a payload is unusable, so the offline engine is asked
    instead of failing the request — the learner still gets a roadmap.
    """
    try:
        return _roadmap_from_engine(payload, engine=engine)
    except (RoadmapError, EngineError) as error:
        fallback = getattr(engine, 'fallback', None)
        if fallback is None:
            raise
        return _roadmap_from_engine(payload, engine=fallback)


def _as_text_list(value) -> list[str]:
    """Chấp nhận cả `['a','b']` và `'a, b'` — model trả đủ kiểu."""
    if isinstance(value, str):
        parts = [part.strip(' -–•\t') for part in re.split(r'[\n;]|(?<=[.!?])\s+(?=[A-ZÀ-Ỹ])', value)]
        return [part for part in (p.strip() for p in parts) if part][:4]
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item or '').strip()][:4]
    return []


def _lesson_from(raw, module_index: int, lesson_index: int) -> dict | None:
    """Một bài học, dù model trả dict đầy đủ hay chỉ một dòng tiêu đề."""
    if isinstance(raw, str):
        title, objectives, examples, minutes = raw.strip(), [], [], 40
    elif isinstance(raw, dict):
        title = str(raw.get('title') or raw.get('name') or raw.get('topic') or '').strip()
        objectives = _as_text_list(raw.get('objectives') or raw.get('goals')
                                   or raw.get('outcomes') or raw.get('content'))
        examples = _as_text_list(raw.get('examples') or raw.get('example'))
        try:
            minutes = int(raw.get('estimated_minutes') or raw.get('duration') or raw.get('minutes') or 40)
        except (TypeError, ValueError):
            minutes = 40
    else:
        return None
    if not title:
        title = f'Bài {lesson_index}'
    return {
        'key': f'm{module_index}-l{lesson_index}',
        'title': title[:160],
        'objectives': objectives,
        'examples': examples,
        'estimated_minutes': minutes,
    }


def _roadmap_from_engine(payload: dict, *, engine) -> dict:
    subject = str(payload.get('subject') or '').strip() or 'Kiến thức nền'
    goal = str(payload.get('goal') or '').strip() or 'Nắm vững kiến thức cơ bản'
    current = normalize_level(payload.get('current_level'))
    target = normalize_level(payload.get('target_level'), 'intermediate')
    if DIFFICULTY_ORDER[target] < DIFFICULTY_ORDER[current]:
        target = current
    pace = normalize_pace(payload.get('pace'))
    strengths = payload.get('strengths') if isinstance(payload.get('strengths'), list) else []
    weaknesses = payload.get('weaknesses') if isinstance(payload.get('weaknesses'), list) else []
    topics = payload.get('topics') if isinstance(payload.get('topics'), list) else []
    try:
        raw = engine.complete_json(task='roadmap', payload={
            'subject': subject,
            'goal': goal,
            'current_level': current,
            'target_level': target,
            'pace': pace,
            'study_time': payload.get('study_time') or PACE_MINUTES[pace],
            'strengths': strengths,
            'weaknesses': weaknesses,
            'topics': topics,
        })
    except EngineError as error:
        raise RoadmapError(f'roadmap generation failed: {error}') from error

    modules = raw.get('modules') if isinstance(raw, dict) else None
    if not isinstance(modules, list) or not modules:
        for alternative in ('stages', 'phases', 'roadmap', 'lessons'):
            candidate = raw.get(alternative) if isinstance(raw, dict) else None
            if isinstance(candidate, list) and candidate:
                modules = candidate
                break
    if not isinstance(modules, list) or not modules:
        raise RoadmapError('roadmap must contain at least one module')
    cleaned = []
    for index, module_raw in enumerate(modules[:6], start=1):
        module = {'title': module_raw} if isinstance(module_raw, str) else module_raw
        if not isinstance(module, dict):
            continue
        lessons_raw = module.get('lessons')
        if not isinstance(lessons_raw, list):
            for alternative in ('items', 'topics', 'sessions', 'steps'):
                candidate = module.get(alternative)
                if isinstance(candidate, list) and candidate:
                    lessons_raw = candidate
                    break
        lessons = []
        for lesson_index, lesson_raw in enumerate(lessons_raw if isinstance(lessons_raw, list) else [], start=1):
            lesson = _lesson_from(lesson_raw, index, lesson_index)
            if lesson:
                lessons.append(lesson)
        if not lessons:
            # Module rỗng: bỏ qua thay vì làm hỏng cả lộ trình.
            continue
        difficulty = normalize_level(module.get('difficulty'), current)
        quiz = module.get('quiz') if isinstance(module.get('quiz'), dict) else {}
        assessment = module.get('assessment') if isinstance(module.get('assessment'), dict) else {}
        cleaned.append({
            'key': str(module.get('key') or f'm{index}'),
            'title': str(module.get('title') or f'Chặng {index}'),
            'difficulty': difficulty,
            'lessons': lessons,
            'quiz': {
                'question_count': int(quiz.get('question_count') or 3),
                'max_score': float(quiz.get('max_score') or 10),
            },
            'assessment': {
                'type': str(assessment.get('type') or 'short_answer'),
                'max_score': float(assessment.get('max_score') or 10),
            },
        })
    if not cleaned:
        raise RoadmapError('roadmap modules were unusable')
    cleaned = _renumber(cleaned)
    return {
        'title': str(raw.get('title') or f'Lộ trình {subject}'),
        'summary': str(raw.get('summary') or ''),
        'subject': subject,
        'goal': goal,
        'current_level': current,
        'target_level': target,
        'pace': pace,
        'topics': list(topics),
        'modules': cleaned,
        'focus_weaknesses': [str(item) for item in (raw.get('focus_weaknesses') or weaknesses)][:4],
    }


def _renumber(modules: list[dict]) -> list[dict]:
    """Sau khi bỏ module rỗng, đánh số lại chặng/bài để khoá không nhảy cóc."""
    for index, module in enumerate(modules, start=1):
        module['key'] = f'm{index}'
        for lesson_index, lesson in enumerate(module['lessons'], start=1):
            lesson['key'] = f'm{index}-l{lesson_index}'
    return modules


def _extra_exercise(kind: str, module: dict, lesson: dict, roadmap: dict, index: int) -> dict:
    """Templated fallback exercise so every roadmap covers all five types (§5)."""
    title = lesson['title']
    objectives = lesson.get('objectives') or ['Nắm nội dung bài học']
    base = {
        'module_key': module['key'],
        'lesson_key': lesson['key'],
        'topic': title,
        'exercise_type': kind,
        'difficulty': module['difficulty'],
        'options': None,
        'max_score': 10,
    }
    if kind == 'code':
        return dict(base, **{
            'prompt': f'Viết đoạn mã ngắn minh hoạ “{title}” bằng {roadmap["subject"]} và giải thích 1–2 dòng.',
            'expected_answer': ' '.join(objectives),
            'rubric': 'Mã đúng cú pháp, thể hiện đúng nội dung bài học, không dùng hàm nguy hiểm.',
        })
    if kind == 'math':
        expected = str(5 + 6 * index)
        return dict(base, **{
            'prompt': f'Bài tập tính toán của “{title}”: cho biểu thức 5 + 6 × {index}, hãy trả lời bằng một con số.',
            'expected_answer': expected,
            'rubric': f'Kết quả số đúng là {expected}, trình bày cách tính.',
        })
    return dict(base, **{
        'prompt': f'Trình bày hiểu biết của bạn về “{title}” trong 3–5 câu.',
        'expected_answer': ' '.join(objectives),
        'rubric': 'Đúng trọng tâm, diễn đạt rõ ràng, dùng thuật ngữ chính xác.',
    })


def _unique(items: list[str]) -> list[str]:
    """De-duplicated list preserving order (lesson objectives repeat across modules)."""
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = (item or '').strip()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def _rotate(options: list[str], correct: str, seed: str) -> tuple[list[str], int]:
    """Deterministic option order so the right answer is not always option A."""
    offset = sum(ord(char) for char in seed) % len(options)
    rotated = options[offset:] + options[:offset]
    return rotated, rotated.index(correct)


def build_exercises(roadmap: dict, payload: dict, *, engine) -> list[dict]:
    """Create one exercise per lesson plus a quiz item per module."""
    exercises: list[dict] = []
    all_objectives = _unique([objective for module in roadmap['modules'] for lesson in module['lessons']
                              for objective in (lesson.get('objectives') or [])])
    for module in roadmap['modules']:
        for lesson in module['lessons']:
            title = lesson['title']
            objectives = _unique(lesson.get('objectives') or []) or ['Nắm nội dung bài học']
            correct = objectives[0]
            distractors = _unique([item for item in all_objectives if item != correct])[:3]
            for filler in ('Không liên quan đến nội dung bài học',
                           'Chỉ đúng với một ngôn ngữ khác',
                           'Không có phương án nào đúng'):
                if len(distractors) >= 3:
                    break
                if filler != correct and filler not in distractors:
                    distractors.append(filler)
            options, answer_index = _rotate([correct] + distractors[:3], correct,
                                            f"{module['key']}-{lesson['key']}")
            exercises.append({
                'module_key': module['key'],
                'lesson_key': lesson['key'],
                'topic': title,
                'exercise_type': 'multiple_choice',
                'difficulty': module['difficulty'],
                'prompt': f'Kiến thức nào đúng nhất với bài “{title}”?',
                'options': options,
                'answer_index': answer_index,
                'expected_answer': correct,
                'rubric': 'Chọn đúng mục tiêu của bài học.',
                'max_score': 10,
            })
            exercises.append({
                'module_key': module['key'],
                'lesson_key': lesson['key'],
                'topic': title,
                'exercise_type': 'short_answer',
                'difficulty': module['difficulty'],
                'prompt': f'Trình bày ngắn gọn (3–5 câu) nội dung chính của “{title}”.',
                'options': None,
                'expected_answer': ' '.join(objectives),
                'rubric': 'Nêu đủ mục tiêu bài học, diễn đạt rõ ràng, có ví dụ nếu cần.',
                'max_score': 10,
            })
        exercises.append({
            'module_key': module['key'],
            'lesson_key': module['lessons'][-1]['key'],
            'topic': f"Quiz {module['title']}",
            'exercise_type': 'essay',
            'difficulty': module['difficulty'],
            'prompt': f"Viết đoạn phân tích ngắn (100–150 từ) về vai trò của {module['title']} trong mục tiêu “{roadmap['goal']}”.",
            'options': None,
            'expected_answer': ' '.join(
                objective for lesson in module['lessons'] for objective in lesson.get('objectives', [])
            ),
            'rubric': 'Đúng trọng tâm, lập luận rõ, dùng thuật ngữ chính xác, có ví dụ.',
            'max_score': 10,
        })
    produced = {exercise['exercise_type'] for exercise in exercises}
    for missing in ('code', 'math', 'essay'):
        if missing in produced:
            continue
        module = roadmap['modules'][len(produced) % len(roadmap['modules'])]
        lesson = module['lessons'][-1]
        exercises.append(_extra_exercise(missing, module, lesson, roadmap, len(produced)))
        produced.add(missing)
    return exercises


def adapt(roadmap: dict, submissions: list[dict], *, engine=None) -> dict:
    """Apply adaptive-learning rules to a roadmap from graded submissions."""
    from .grading import adaptation_for
    if not submissions:
        return roadmap
    percents = [int(item.get('percentage') or 0) for item in submissions]
    average = round(sum(percents) / len(percents))
    modules = [dict(module) for module in roadmap['modules']]
    decision = adaptation_for(average, difficulty=modules[0]['difficulty'] if modules else 'beginner')
    notes = [decision['message']]
    if decision['action'] == 'review':
        for module in modules[:2]:
            module['difficulty'] = decision['next_difficulty']
            module['extra_practice'] = decision['extra_exercises']
        notes.append('Ưu tiên ôn lại các chặng đầu trước khi sang chặng mới.')
    elif decision['action'] == 'advance':
        for module in modules:
            module['difficulty'] = decision['next_difficulty']
        notes.append('Chặng tiếp theo đã được nâng độ khó.')
    else:
        for module in modules:
            module['extra_practice'] = decision['extra_exercises']
        notes.append('Giữ nguyên độ khó, tăng bài tập luyện tập.')
    updated = dict(roadmap)
    updated['modules'] = modules
    updated['adaptation_note'] = ' '.join(notes)
    updated['average_score'] = average
    return updated


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)
