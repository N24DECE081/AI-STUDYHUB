"""Bounded generation with exact counts and validated document evidence.

Never silently replace failed AI output with trivial sentence-matching questions.
"""
import re
from random import SystemRandom
from backend.app.ai_tutor.engine import EngineError

MAX_QUESTIONS = 100
BATCH_SIZE = 2  # Keep evidence and explanations within the provider task token budget.


class QuizGenerationError(ValueError):
    pass


def validate_count(value):
    if type(value) is not int or not 1 <= value <= MAX_QUESTIONS:
        raise ValueError('Số câu phải là số nguyên dương từ 1 đến 100.')
    return value


def normalize(value):
    return ' '.join(value.split()).casefold()


def clean_question(value):
    return re.sub(r'^\s*(?:(?:câu(?:\s+hỏi)?|question)\s*\d+\s*[:.)-]?|\d+\s*[.)])\s*', '', value, flags=re.I).strip()


def generate(documents, count, engine, difficulty="mixed"):
    validate_count(count)
    if difficulty not in ('easy', 'medium', 'hard', 'mixed'):
        raise ValueError('Độ khó không hợp lệ.')
    if not getattr(engine, 'uses_model', False):
        raise EngineError('Tạo Quiz phân hóa cần AI đang hoạt động. Hãy thử lại khi AI sẵn sàng.')
    sources = []
    for doc in documents:
        # Spread excerpts over each document instead of selecting only its opening.
        text = doc['text'].strip()
        chunks = [text[i:i + 1600] for i in range(0, len(text), 1600)]
        if len(chunks) > 24:
            chunks = [chunks[round(i * (len(chunks) - 1) / 23)] for i in range(24)]
        sources.extend({'document_id': doc['id'], 'title': doc['title'], 'text': chunk} for chunk in chunks)
    if not sources:
        raise QuizGenerationError('Không đọc được nội dung chữ trong tài liệu.')
    # Interleave documents to avoid starving later documents in short quizzes.
    grouped = [[s for s in sources if s['document_id'] == doc['id']] for doc in documents]
    sources = [group[i] for i in range(max(map(len, grouped))) for group in grouped if i < len(group)]
    source_budget = min(len(sources), ((count + BATCH_SIZE - 1) // BATCH_SIZE) * 3)
    if len(sources) > source_budget:
        sources = [sources[round(i * (len(sources) - 1) / (source_budget - 1))] for i in range(source_budget)]
    questions, seen = [], set()
    levels = (['understand'] * round(count * .3) + ['apply'] * round(count * .4))
    levels += ['analyze'] * (count - len(levels))
    if count == 1:
        levels = ['apply']
    if difficulty != 'mixed':
        levels = [{'easy':'understand','medium':'apply','hard':'analyze'}[difficulty]] * count
    for offset in range(0, count, BATCH_SIZE):
        size = min(BATCH_SIZE, count - offset)
        batch_sources = [sources[(offset // BATCH_SIZE * 3 + i) % len(sources)] for i in range(min(3, len(sources)))]
        payload = {'question_count': size, 'levels': levels[offset:offset + size],
                   'sources': batch_sources, 'avoid_questions': [q['question'][:180] for q in questions[-10:]]}
        valid = None
        for attempt in range(2):
            raw = engine.complete_json(task='document_quiz', payload=payload)
            try:
                valid = validate_batch(raw, size, batch_sources, seen, levels[offset:offset + size])
                break
            except QuizGenerationError as error:
                if attempt:
                    raise
                payload['correction'] = str(error)
        questions.extend(valid)
        seen.update(normalize(q['question']) for q in valid)
    # Do not rely on the model to distribute answer positions fairly.
    random = SystemRandom()
    for question in questions:
        choices = list(enumerate(question['options']))
        random.shuffle(choices)
        question['correct_index'] = next(i for i, (old, _) in enumerate(choices) if old == question['correct_index'])
        question['options'] = [text for _, text in choices]
    return questions


def validate_batch(raw, size, sources, seen, levels):
    rows = raw.get('questions') if isinstance(raw, dict) else None
    if not isinstance(rows, list) or len(rows) != size:
        raise QuizGenerationError('AI chưa tạo đủ số câu yêu cầu. Hãy giảm số câu hoặc bổ sung tài liệu rồi thử lại.')
    result, batch_seen = [], set(seen)
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise QuizGenerationError('AI trả về câu hỏi không hợp lệ.')
        question = clean_question(row.get('question', '')) if isinstance(row.get('question'), str) else ''
        options, answer = row.get('options'), row.get('answer_index')
        explanation, evidence = row.get('explanation'), row.get('evidence')
        source = next((s for s in sources if type(row.get('document_id')) is int and s['document_id'] == row['document_id']
                       and isinstance(evidence, str) and len(evidence.strip()) >= 15
                       and normalize(evidence) in normalize(s['text'])), None)
        if (len(question) < 15 or normalize(question) in batch_seen
            or not isinstance(options, list) or len(options) != 4
            or any(not isinstance(o, str) or not o.strip() for o in options)
            or len({normalize(o) for o in options}) != 4
            or type(answer) is not int or not 0 <= answer < 4
            or not isinstance(explanation, str) or len(explanation.strip()) < 20
            or row.get('difficulty') != levels[index] or source is None):
            raise QuizGenerationError('AI cần trả câu hỏi khác nhau, 4 lựa chọn riêng biệt, đáp án/giải thích đúng cấu trúc, đúng mức độ và trích dẫn nguyên văn từ nguồn.')
        batch_seen.add(normalize(question))
        result.append({'question': question, 'options': [o.strip() for o in options], 'correct_index': answer,
                       'explanation': explanation.strip(), 'difficulty': row['difficulty'],
                       'document_id': source['document_id'], 'source_title': source['title'],
                       'source_locator': evidence.strip()})
    return result


def content_limits(documents):
    words = sum(len(re.findall(r'\w+', doc['text'])) for doc in documents)
    if not words:
        raise QuizGenerationError('Không đọc được nội dung chữ trong tài liệu.')
    maximum = 20 if words < 800 else 50 if words < 3000 else 100
    return {'max_questions':maximum, 'max_flashcards':min(50,maximum),
            'suggested_flashcards':min(20,max(1,words // 70)), 'word_count':words}


def normalize_manual(payload):
    """Validate authored questions without a document or model dependency."""
    title = payload.get('title')
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 100:
        raise ValueError('Tên bài trắc nghiệm phải từ 1 đến 100 ký tự.')
    rows = payload.get('questions')
    if not isinstance(rows, list):
        raise ValueError('Danh sách câu hỏi không hợp lệ.')
    validate_count(len(rows))
    minutes = payload.get('time_limit', 0)
    if type(minutes) is not int or not 0 <= minutes <= 240:
        raise ValueError('Thời gian phải từ 0 đến 240 phút.')
    questions = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError('Câu hỏi không hợp lệ.')
        question = row.get('question')
        options = row.get('options')
        correct = row.get('correct_index')
        explanation = row.get('explanation', '')
        if not isinstance(question, str) or not question.strip() or len(question) > 2000:
            raise ValueError(f'Câu {index+1}: nhập câu hỏi, tối đa 2000 ký tự.')
        if (not isinstance(options, list) or len(options) != 4
                or any(not isinstance(option, str) or not option.strip() or len(option) > 1000 for option in options)):
            raise ValueError(f'Câu {index+1}: cần đủ 4 đáp án, mỗi đáp án tối đa 1000 ký tự.')
        options = [option.strip() for option in options]
        if len({option.casefold() for option in options}) != 4:
            raise ValueError(f'Câu {index+1}: các đáp án không được trùng nhau.')
        if type(correct) is not int or correct not in range(4):
            raise ValueError(f'Câu {index+1}: hãy chọn đáp án đúng.')
        if not isinstance(explanation, str) or len(explanation) > 4000:
            raise ValueError('Giải thích tối đa 4000 ký tự.')
        questions.append({'id': f'q{index+1}', 'question': question.strip(), 'options': options,
                          'correct_index': correct, 'explanation': explanation.strip() or 'Đáp án do người tạo bài lựa chọn.',
                          'difficulty': 'understand', 'document_id': None,
                          'source_title': 'Nội dung tự tạo', 'source_locator': ''})
    return {'kind': 'quiz', 'title': title.strip(), 'document_ids': [],
            'question_count': len(questions), 'questions': questions, 'time_limit': minutes, 'difficulty': 'mixed'}
