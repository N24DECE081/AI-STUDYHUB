"""Grading service for AI Tutor exercises.

The backend owns every score: the client only renders what the service returns.
Results are validated against a strict schema (score within range, required
fields, list shapes) before they leave this module, and a failed AI call raises
instead of inventing a score so the client can offer Retry.
"""
from __future__ import annotations

import math
import re

from .engine import (EngineError, concept_ratio, depth_factor, grade_band, keyword_ratio,
                     overlap_score, rubric_gaps, tokenize)

EXERCISE_TYPES = ('multiple_choice', 'short_answer', 'essay', 'code', 'math')
ANSWER_TYPES = ('text', 'choice', 'code', 'math')
# Bài viết/lập trình: model chấm tốt hơn hẳn cách đếm từ khoá (khi có model).
MODEL_GRADED_TYPES = ('short_answer', 'essay', 'code')

REQUIRED_FIELDS = ('score', 'feedback')

LIST_FIELDS = ('strengths', 'weaknesses', 'missing_points', 'recommended_review')

CODE_RISK_PATTERNS = (
    r'\b(import\s+os|import\s+sys|import\s+subprocess|import\s+socket|import\s+shutil)\b',
    r'\b(eval|exec|compile|__import__)\s*\(',
    r'\bopen\s*\(',
)


class GradingError(RuntimeError):
    """Raised when a submission cannot be graded safely."""


def _numbers(text: str) -> list[float]:
    return [float(match) for match in re.findall(r'-?\d+(?:[.,]\d+)?', (text or '').replace(',', '.'))]


def _normalize(text: str) -> str:
    return ' '.join(tokenize(text))


def _as_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()][:8]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _resolve_ratio(raw, *, fallback: float) -> float:
    """Accept ratio (0..1), percentage (0..100) or score/max pairs from a provider."""
    if isinstance(raw, dict):
        score = raw.get('score')
        maximum = raw.get('max_score') or raw.get('max') or 10
        if score is None or not isinstance(score, (int, float, str)):
            return fallback
        if not isinstance(maximum, (int, float, str)):
            maximum = 10
        try:
            score_value = float(score)
            max_value = float(maximum)
        except (TypeError, ValueError):
            return fallback
        if max_value <= 0:
            return fallback
        return max(0.0, min(1.0, score_value / max_value))
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return fallback
    if value > 1.0:
        value = value / 100.0
    return max(0.0, min(1.0, value))


def _objective_result(exercise: dict, answer: str) -> dict | None:
    """Grading that never needs an AI call: choice, short answer and math."""
    kind = exercise['exercise_type']
    expected = (exercise.get('expected_answer') or '').strip()
    options = exercise.get('options') or []

    if kind == 'multiple_choice':
        if not options:
            raise GradingError('exercise has no options to grade')
        picked = answer.strip()
        target = expected.strip()
        is_right = picked.lower() == target.lower()
        return {
            'ratio': 1.0 if is_right else 0.0,
            'is_correct': is_right,
            'strengths': ['Chọn đúng đáp án.'] if is_right else [],
            'weaknesses': [] if is_right else [f'Đáp án đúng là: {target or "chưa cấu hình"}.'],
            'missing_points': [] if is_right else [target] if target else [],
            'suggested_answer': target,
            'recommended_review': [] if is_right else ['Ôn lại phần lý thuyết của bài này.'],
            'explanation': 'Backend so khớp trực tiếp với đáp án đúng.',
        }

    if kind == 'short_answer':
        if not expected:
            raise GradingError('exercise has no expected answer to grade')
        student = _normalize(answer)
        target = _normalize(expected)
        if student and student == target:
            ratio = 1.0
            strengths = ['Khớp đáp án mong đợi.']
            weaknesses = []
            explanation = 'Backend so khớp trực tiếp với đáp án đúng.'
        else:
            # Offline paraphrase grading: the key terms of the expected answer should be
            # reused, the question's concept must be named, and the answer should be as
            # detailed as the question asks for.
            concept = concept_ratio(exercise.get('prompt') or '', exercise.get('topic') or '', student)
            terms_present = keyword_ratio(expected, student)
            depth = depth_factor(exercise.get('prompt') or '', answer)
            ratio = round(0.45 * terms_present + 0.25 * concept + 0.30 * depth, 4)
            if ratio >= 0.85 and len(tokenize(answer)) < 12:
                ratio = 0.8
            strengths = []
            weaknesses = []
            if concept >= 0.6:
                strengths.append('Nêu đúng khái niệm trọng tâm của câu hỏi.')
            else:
                weaknesses.append('Chưa nêu đúng khái niệm trọng tâm của câu hỏi.')
            if terms_present >= 0.4:
                strengths.append('Dùng đúng thuật ngữ chính của bài học.')
            else:
                weaknesses.append('Cần nêu đúng thuật ngữ chính trong đáp án.')
            if depth >= 0.99:
                strengths.append('Trả lời đủ độ chi tiết mà câu hỏi yêu cầu.')
            else:
                weaknesses.append('Trả lời còn ngắn so với yêu cầu của câu hỏi.')
            explanation = (f'Chấm offline: thuật ngữ chính {round(terms_present * 100)}%, '
                           f'khái niệm trọng tâm {round(concept * 100)}%, '
                           f'độ chi tiết {round(depth * 100)}%.')
        return {
            'ratio': ratio,
            'is_correct': ratio >= 0.5,
            'strengths': strengths,
            'weaknesses': weaknesses,
            'missing_points': rubric_gaps(answer, exercise.get('rubric') or '', expected),
            'suggested_answer': expected,
            'recommended_review': [] if ratio >= 0.85 else ['Đọc lại định nghĩa và ví dụ trong tài liệu.'],
            'explanation': f'Mức khớp ngữ nghĩa đạt {round(ratio * 100)}%.',
        }

    if kind == 'math':
        expected_numbers = _numbers(expected)
        student_numbers = _numbers(answer)
        if expected_numbers:
            hit = any(
                math.isclose(value, target, rel_tol=1e-6, abs_tol=1e-6)
                for value in student_numbers
                for target in expected_numbers
            )
            ratio = 1.0 if hit else (0.3 if student_numbers else 0.0)
            return {
                'ratio': ratio,
                'is_correct': hit,
                'strengths': ['Kết quả số khớp đáp án.'] if hit else [],
                'weaknesses': [] if hit else ['Kết quả số chưa khớp đáp án mong đợi.'],
                'missing_points': [] if hit else [f'Đáp án đúng: {expected.strip()}'],
                'suggested_answer': expected,
                'recommended_review': [] if hit else ['Kiểm tra lại từng bước biến đổi.'],
                'explanation': 'Backend kiểm tra số học trực tiếp (deterministic validation).',
            }
        return None

    return None


def _code_static_review(answer: str, expected: str) -> tuple[float, list[str]]:
    """Static review for code answers: no sandbox execution is attempted."""
    warnings = []
    for pattern in CODE_RISK_PATTERNS:
        if re.search(pattern, answer):
            warnings.append(f'Cẩn trọng với đoạn mã khớp mẫu nguy hiểm: {pattern}')
    coverage = overlap_score(answer, expected) if expected else 0.5
    return max(0.0, min(1.0, coverage)), warnings


def validate_result(result: dict, max_score: float) -> dict:
    """Enforce the wire schema; raise GradingError on anything unusable.

    Only score and feedback are taken from the model: percentage, grade and
    is_correct are derived here so a model can never report numbers that
    contradict the score it awarded (plan §6, §7).
    """
    if not isinstance(result, dict):
        raise GradingError('grading result must be an object')
    for field in REQUIRED_FIELDS:
        if field not in result:
            raise GradingError(f'grading result missing field: {field}')
    if max_score <= 0:
        raise GradingError('max_score must be greater than zero')
    try:
        score = float(result['score'])
    except (TypeError, ValueError):
        raise GradingError('score must be a number')
    if math.isnan(score) or math.isinf(score):
        raise GradingError('score must be a finite number')
    if score < 0:
        raise GradingError('score cannot be negative')
    if score > max_score:
        raise GradingError('score cannot exceed max_score')
    if not isinstance(result['feedback'], str) or not result['feedback'].strip():
        raise GradingError('feedback is required')
    normalized = dict(result)
    normalized['score'] = round(score, 2)
    normalized['max_score'] = float(max_score)
    normalized['percentage'] = max(0, min(100, int(round(score / max_score * 100))))
    normalized['grade'] = grade_band(normalized['percentage'])
    normalized['is_correct'] = bool(result['is_correct']) if 'is_correct' in result else normalized['percentage'] >= 60
    for field in LIST_FIELDS:
        normalized[field] = _as_list(result.get(field))
    suggested = result.get('suggested_answer') or ''
    normalized['suggested_answer'] = suggested if isinstance(suggested, str) else str(suggested)
    return normalized


def grade_exercise(exercise: dict, answer: str, *, answer_type: str, engine) -> dict:
    """Grade one submission and return a validated result payload.

    Trắc nghiệm và bài tính toán luôn do backend chấm (so đáp án/số, không thể sai).
    Bài viết và bài lập trình thì khi có model, model chấm theo rubric để nhận xét
    sâu hơn; không có model (hoặc model lỗi) thì quay về cách chấm theo từ khoá.
    """
    kind = exercise['exercise_type']
    if kind not in EXERCISE_TYPES:
        raise GradingError(f'unsupported exercise type: {kind}')
    if answer_type not in ANSWER_TYPES:
        raise GradingError(f'unsupported answer type: {answer_type}')
    text = (answer or '').strip()
    if not text:
        raise GradingError('answer must not be empty')
    max_score = float(exercise.get('max_score') or 10)

    warnings: list[str] = []
    static_ratio = 0.0
    graded_by_model = False
    objective = _objective_result(exercise, text)
    if objective is not None and kind in MODEL_GRADED_TYPES and getattr(engine, 'uses_model', False):
        objective = None  # để model chấm theo rubric, nhận xét cụ thể hơn
    if objective is not None:
        payload = objective
    else:
        graded_by_model = True
        if kind == 'code':
            static_ratio, warnings = _code_static_review(text, exercise.get('expected_answer') or '')
        try:
            raw = engine.complete_json(task='grading', payload={
                'question': exercise.get('prompt') or '',
                'student_answer': text,
                'expected_answer': exercise.get('expected_answer') or '',
                'rubric': exercise.get('rubric') or '',
                'max_score': max_score,
                'exercise_type': kind,
                'topic': exercise.get('topic') or '',
            })
        except EngineError as error:
            raise GradingError(f'AI grading failed: {error}') from error
        fallback = static_ratio if kind == 'code' else 0.0
        ratio = _resolve_ratio(raw.get('ratio', raw.get('score')), fallback=fallback)
        payload = {
            'ratio': ratio,
            'is_correct': bool(raw.get('is_correct', ratio >= 0.65)),
            'strengths': _as_list(raw.get('strengths')),
            'weaknesses': _as_list(raw.get('weaknesses')),
            'missing_points': _as_list(raw.get('missing_points')),
            'suggested_answer': str(raw.get('suggested_answer') or exercise.get('expected_answer') or ''),
            'recommended_review': _as_list(raw.get('recommended_review')),
            'explanation': str(raw.get('explanation') or 'AI chấm theo rubric tài liệu.'),
        }
        if kind == 'code':
            payload['is_correct'] = bool(raw.get('is_correct', ratio >= 0.65)) and not warnings
            payload['explanation'] = (payload['explanation'] +
                                      ' Backend chỉ chạy kiểm tra tĩnh, không thực thi mã sinh viên.')

    ratio = max(0.0, min(1.0, float(payload.get('ratio') or 0.0)))
    score = round(ratio * max_score, 2)
    result = {
        'score': score,
        'max_score': max_score,
        'percentage': int(round(ratio * 100)),
        'grade': grade_band(ratio * 100),
        'is_correct': bool(payload.get('is_correct')),
        'graded_by': 'ai' if graded_by_model else 'backend',
        'feedback': (payload.get('explanation') or 'Đã chấm theo rubric.') +
                    (f" Lưu ý: {'; '.join(warnings)}" if warnings else ''),
        'strengths': _as_list(payload.get('strengths')),
        'weaknesses': _as_list(payload.get('weaknesses')),
        'missing_points': _as_list(payload.get('missing_points')),
        'suggested_answer': str(payload.get('suggested_answer') or ''),
        'recommended_review': _as_list(payload.get('recommended_review')),
    }
    return validate_result(result, max_score)


def adaptation_for(percentage: int, *, difficulty: str) -> dict:
    """Adaptive-learning decision used to update a roadmap after grading."""
    order = ['beginner', 'intermediate', 'advanced']
    index = order.index(difficulty) if difficulty in order else 0
    if percentage < 50:
        return {
            'action': 'review',
            'next_difficulty': order[max(0, index - 1)],
            'extra_exercises': 2,
            'message': 'Điểm dưới 50% — cần ôn lại bài hiện tại, giảm độ khó và thêm bài tập.',
        }
    if percentage < 80:
        return {
            'action': 'practice',
            'next_difficulty': order[index],
            'extra_exercises': 1,
            'message': 'Điểm trung bình — giữ độ khó và thêm bài tập luyện tập.',
        }
    return {
        'action': 'advance',
        'next_difficulty': order[min(len(order) - 1, index + 1)],
        'extra_exercises': 0,
        'message': 'Kết quả tốt — tăng độ khó và chuyển sang chủ đề tiếp theo.',
    }
