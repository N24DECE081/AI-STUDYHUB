"""Quiz metadata and server-clock attempts in the existing chat storage.

assistant=quiz definition, system=run, user=completed attempt. Old rows remain readable.
"""
import json
import time


def owned_quiz(connection, user_id, quiz_id):
    session = connection.execute("SELECT id FROM chat_sessions WHERE id=? AND user_id=? AND title LIKE 'QUIZ_CARD:%'", (quiz_id, user_id)).fetchone()
    if not session:
        raise LookupError('Bài trắc nghiệm không tồn tại.')
    row = connection.execute("SELECT id,content FROM chat_messages WHERE session_id=? AND role='assistant' ORDER BY id DESC LIMIT 1", (quiz_id,)).fetchone()
    if not row:
        raise LookupError('Bài trắc nghiệm không tồn tại.')
    return row, json.loads(row['content'])


def start(connection, user_id, quiz_id):
    _, quiz = owned_quiz(connection, user_id, quiz_id)
    now = time.time()
    run = {'kind': 'quiz_run', 'started_at': now, 'deadline': now + quiz.get('time_limit', 0) * 60 if quiz.get('time_limit') else None,
           'answers': {}, 'revision': 0, 'result': None}
    run_id = connection.execute("INSERT INTO chat_messages(session_id,role,content) VALUES(?,?,?)", (quiz_id, 'system', json.dumps(run))).lastrowid
    return {'run_id': run_id, 'started_at': now, 'deadline': run['deadline'], 'server_now': now}


def load_run(connection, quiz_id, run_id):
    if type(run_id) is not int:
        raise ValueError('Hãy bắt đầu lượt làm bài trước khi nộp.')
    row = connection.execute("SELECT id,content FROM chat_messages WHERE id=? AND session_id=? AND role='system'", (run_id, quiz_id)).fetchone()
    if not row:
        raise LookupError('Lượt làm bài không tồn tại.')
    run = json.loads(row['content'])
    if run.get('kind') != 'quiz_run':
        raise LookupError('Lượt làm bài không tồn tại.')
    return row, run


def validate_answers(quiz, answers):
    if not isinstance(answers, dict):
        raise ValueError('Đáp án không hợp lệ.')
    ids = {q['id'] for q in quiz['questions']}
    if any(key not in ids or type(value) is not int or not 0 <= value < 4 for key, value in answers.items()):
        raise ValueError('Đáp án không hợp lệ.')
    return answers


def save_answers(connection, user_id, quiz_id, payload):
    _, quiz = owned_quiz(connection, user_id, quiz_id)
    answers = validate_answers(quiz, payload.get('answers'))
    revision = payload.get('revision')
    if type(revision) is not int or not 1 <= revision <= 100000:
        raise ValueError('Phiên bản đáp án không hợp lệ.')
    for _ in range(3):
        row, run = load_run(connection, quiz_id, payload.get('run_id'))
        if run.get('result') or (run.get('deadline') and time.time() >= run['deadline']):
            return {'saved': False, 'expired': True}
        if revision <= run.get('revision', 0):
            return {'saved': True, 'revision': run['revision']}
        run.update(answers=answers, revision=revision)
        if replace_run(connection, row, run):
            return {'saved': True, 'revision': revision}
    raise ValueError('Đáp án đang được lưu. Vui lòng thử lại.')


def replace_run(connection, row, run):
    return connection.execute('UPDATE chat_messages SET content=? WHERE id=? AND content=?',
                              (json.dumps(run, ensure_ascii=False), row['id'], row['content'])).rowcount == 1
