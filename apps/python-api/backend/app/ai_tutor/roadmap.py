"""Learning-journey service: assessment -> level -> goal -> roadmap -> adaptive.

The backend decides the learner level and builds the roadmap; the React client
only collects answers and renders the result.
"""
from __future__ import annotations

import json

from .engine import DIFFICULTY_ORDER, EngineError, LEVELS

LEVEL_FROM_PERCENT = ((80, 'advanced'), (55, 'intermediate'), (0, 'beginner'))

ASSESSMENT_QUESTIONS = (
    {
        'key': 'q1',
        'type': 'multiple_choice',
        'prompt': 'Khi một lớp con kế thừa lớp cha trong lập trình hướng đối tượng, điều gì đúng nhất?',
        'options': [
            'Lớp con dùng lại được thuộc tính và phương thức của lớp cha',
            'Lớp con không thể ghi đè phương thức của lớp cha',
            'Lớp cha bắt buộc phải là abstract',
            'Lớp con không thể có thuộc tính riêng',
        ],
        'answer_index': 0,
        'max_score': 1,
        'topic': 'Kế thừa',
    },
    {
        'key': 'q2',
        'type': 'multiple_choice',
        'prompt': 'Đa hình tại runtime (runtime polymorphism) trong Java thể hiện rõ nhất qua?',
        'options': [
            'Nạp chồng phương thức (overloading)',
            'Ghi đè phương thức và biến tham chiếu kiểu lớp cha (upcasting)',
            'Khai báo hằng số bằng final',
            'Sử dụng mảng một chiều',
        ],
        'answer_index': 1,
        'max_score': 1,
        'topic': 'Đa hình',
    },
    {
        'key': 'q3',
        'type': 'short_answer',
        'prompt': 'Giải thích ngắn gọn sự khác nhau giữa overloading và overriding.',
        'expected': 'Overloading cùng tên khác tham số trong cùng lớp, overriding ghi đè phương thức của lớp cha ở lớp con với cùng chữ ký.',
        'max_score': 2,
        'topic': 'Overloading/Overriding',
    },
    {
        'key': 'q4',
        'type': 'short_answer',
        'prompt': 'Mục đích của phương thức toString() khi ghi đè ở lớp con là gì?',
        'expected': 'Cung cấp biểu diễn chuỗi của đối tượng để in ra dễ đọc và hỗ trợ gỡ lỗi.',
        'max_score': 2,
        'topic': 'toString()',
    },
    {
        'key': 'q5',
        'type': 'math',
        'prompt': 'Một mảng có 12 phần tử. Nếu truy cập phần tử cuối bằng chỉ số, chỉ số hợp lệ lớn nhất là bao nhiêu?',
        'expected': '11',
        'max_score': 2,
        'topic': 'Mảng',
    },
    {
        'key': 'q6',
        'type': 'short_answer',
        'prompt': 'Nêu một lợi ích của việc dùng biến tham chiếu lớp cha trỏ tới đối tượng lớp con.',
        'expected': 'Viết code tổng quát, dễ mở rộng, xử lý nhiều lớp con trong cùng một vòng lặp.',
        'max_score': 2,
        'topic': 'Upcasting',
    },
)

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


def start_assessment(payload: dict) -> dict:
    subject = str(payload.get('subject') or '').strip()
    goal = str(payload.get('goal') or '').strip()
    topics = payload.get('topics')
    if not isinstance(topics, list):
        topics = []
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
        'topics': [str(topic).strip() for topic in topics if str(topic).strip()][:6],
        'pace': pace,
        'study_time': min(study_time, 3000),
        'questions': [public_question(question) for question in ASSESSMENT_QUESTIONS],
    }


def summarize_answers(answers: list[dict]) -> dict:
    """Score the diagnostic answers and derive level, strengths and weaknesses."""
    lookup = {question['key']: question for question in ASSESSMENT_QUESTIONS}
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
        earned = 0.0
        if question['type'] == 'multiple_choice':
            try:
                picked = int(float(given))
            except (TypeError, ValueError):
                picked = -1
            if picked == int(question['answer_index']):
                earned = float(question['max_score'])
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
    """Ask the engine for a roadmap, then normalize it into the wire contract."""
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

    modules = raw.get('modules')
    if not isinstance(modules, list) or not modules:
        raise RoadmapError('roadmap must contain at least one module')
    cleaned = []
    for index, module in enumerate(modules[:6], start=1):
        if not isinstance(module, dict):
            continue
        lessons_raw = module.get('lessons')
        lessons = []
        for lesson_index, lesson in enumerate(lessons_raw if isinstance(lessons_raw, list) else [], start=1):
            if isinstance(lesson, dict):
                lessons.append({
                    'key': str(lesson.get('key') or f'm{index}-l{lesson_index}'),
                    'title': str(lesson.get('title') or f'Bài {lesson_index}'),
                    'objectives': [str(item) for item in (lesson.get('objectives') or [])][:4],
                    'examples': [str(item) for item in (lesson.get('examples') or [])][:3],
                    'estimated_minutes': int(lesson.get('estimated_minutes') or 40),
                })
        if not lessons:
            raise RoadmapError(f'module {index} has no lessons')
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
    return {
        'title': str(raw.get('title') or f'Lộ trình {subject}'),
        'summary': str(raw.get('summary') or ''),
        'subject': subject,
        'goal': goal,
        'current_level': current,
        'target_level': target,
        'pace': pace,
        'modules': cleaned,
        'focus_weaknesses': [str(item) for item in (raw.get('focus_weaknesses') or weaknesses)][:4],
    }


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


def build_exercises(roadmap: dict, payload: dict, *, engine) -> list[dict]:
    """Create one exercise per lesson plus a quiz item per module."""
    exercises: list[dict] = []
    for module in roadmap['modules']:
        for lesson in module['lessons']:
            title = lesson['title']
            objectives = lesson.get('objectives') or ['Nắm nội dung bài học']
            exercises.append({
                'module_key': module['key'],
                'lesson_key': lesson['key'],
                'topic': title,
                'exercise_type': 'multiple_choice',
                'difficulty': module['difficulty'],
                'prompt': f'Kiến thức nào đúng nhất với bài “{title}”?',
                'options': [
                    objectives[0],
                    'Không liên quan đến nội dung bài học',
                    'Chỉ áp dụng cho ngôn ngữ khác',
                    'Không có đáp án đúng',
                ],
                'answer_index': 0,
                'expected_answer': objectives[0],
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
