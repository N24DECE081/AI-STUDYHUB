"""Persistence helpers for the AI Tutor learning journey.

Answer keys stay server-side: `to_public` strips expected answers and rubrics
before an exercise is sent to the browser.
"""
from __future__ import annotations

import json


def _row_to_dict(row) -> dict:
    return dict(row) if row is not None else {}


def _decode_payload(raw) -> dict | None:
    """Quiz sinh trong chat được lưu kèm tin nhắn để mở lại hội thoại vẫn bấm được."""
    value = _loads(raw, None)
    return value if isinstance(value, dict) and value.get('questions') else None


def _loads(value, fallback):
    if not value:
        return fallback
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return fallback
    return parsed


# ------------------------------------------------------------- conversations ---
def conversation_for(conn, user_id: int, client_key: str, *, mode: str = 'explain', title: str | None = None):
    row = conn.execute(
        'SELECT * FROM tutor_conversations WHERE user_id=? AND client_key=?',
        (user_id, client_key),
    ).fetchone()
    if row:
        return row
    cursor = conn.execute(
        'INSERT INTO tutor_conversations(user_id,client_key,title,mode) VALUES(?,?,?,?)',
        (user_id, client_key, title or 'Cuộc hội thoại mới', mode),
    )
    conn.commit()
    return conn.execute('SELECT * FROM tutor_conversations WHERE id=?', (cursor.lastrowid,)).fetchone()


def add_message(conn, conversation_id: int, role: str, content: str, mode: str | None = None,
                payload: dict | None = None) -> int:
    cursor = conn.execute(
        'INSERT INTO tutor_messages(conversation_id,role,content,mode,payload) VALUES(?,?,?,?,?)',
        (conversation_id, role, content, mode,
         json.dumps(payload, ensure_ascii=False) if payload else None),
    )
    conn.execute(
        'UPDATE tutor_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?',
        (conversation_id,),
    )
    conn.commit()
    return int(cursor.lastrowid)


def history(conn, conversation_id: int, limit: int = 8) -> list[dict]:
    rows = conn.execute(
        'SELECT role, content FROM tutor_messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?',
        (conversation_id, limit),
    ).fetchall()
    return [dict(row) for row in reversed(rows)]


def rename_conversation(conn, conversation_id: int, title: str) -> None:
    conn.execute('UPDATE tutor_conversations SET title=? WHERE id=?', (title[:120], conversation_id))
    conn.commit()


def conversations_for(conn, user_id: int, limit: int = 20, messages_each: int = 40) -> list[dict]:
    """The learner's tutor conversations with their messages, newest first.

    The browser keeps a local copy for instant rendering; this is the durable one,
    so a cleared localStorage or a new device still gets the chat history back.
    """
    rows = conn.execute(
        """SELECT id, client_key, title, mode, updated_at FROM tutor_conversations
           WHERE user_id=? ORDER BY updated_at DESC, id DESC LIMIT ?""",
        (user_id, limit),
    ).fetchall()
    conversations = []
    for row in rows:
        messages = conn.execute(
            'SELECT id, role, content, mode, payload, created_at FROM tutor_messages WHERE conversation_id=? ORDER BY id LIMIT ?',
            (row['id'], messages_each),
        ).fetchall()
        conversations.append({
            'conversation_id': str(row['client_key'] or row['id']),
            'title': row['title'],
            'mode': row['mode'],
            'updated_at': row['updated_at'],
            'messages': [{
                'message_id': str(message['id']),
                'role': message['role'],
                'content': message['content'],
                'mode': message['mode'],
                'quiz': _decode_payload(message['payload']),
                'created_at': message['created_at'],
            } for message in messages],
        })
    return conversations


# --------------------------------------------------------------- assessments ---
def create_assessment(conn, user_id: int, *, subject: str, goal: str, current_level: str,
                      target_level: str, study_time: int, pace: str, strengths: list,
                      weaknesses: list, score_percent: int, answers: list, status: str = 'completed') -> int:
    cursor = conn.execute(
        """INSERT INTO tutor_assessments(
               user_id,subject,goal,current_level,target_level,study_time,pace,
               strengths,weaknesses,score_percent,answers,status)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (user_id, subject[:200], goal[:200], current_level, target_level, int(study_time), pace,
         json.dumps(strengths, ensure_ascii=False), json.dumps(weaknesses, ensure_ascii=False),
         int(score_percent), json.dumps(answers, ensure_ascii=False), status),
    )
    conn.commit()
    return int(cursor.lastrowid)


def latest_assessment(conn, user_id: int) -> dict:
    row = conn.execute(
        'SELECT * FROM tutor_assessments WHERE user_id=? ORDER BY id DESC LIMIT 1', (user_id,)
    ).fetchone()
    data = _row_to_dict(row)
    if data:
        data['strengths'] = _loads(data.get('strengths'), [])
        data['weaknesses'] = _loads(data.get('weaknesses'), [])
    return data


# ------------------------------------------------------------------ roadmaps ---
def create_roadmap(conn, user_id: int, assessment_id, *, subject: str, goal: str, difficulty: str,
                   title: str, summary: str, payload: dict, adaptation_note: str | None = None) -> int:
    cursor = conn.execute(
        """INSERT INTO tutor_roadmaps(user_id,assessment_id,subject,goal,difficulty,title,summary,payload,adaptation_note)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (user_id, assessment_id, subject[:200], goal[:200], difficulty, title[:250], summary[:500],
         json.dumps(payload, ensure_ascii=False), adaptation_note),
    )
    conn.commit()
    return int(cursor.lastrowid)


def latest_roadmap(conn, user_id: int) -> dict:
    row = conn.execute(
        'SELECT * FROM tutor_roadmaps WHERE user_id=? ORDER BY id DESC LIMIT 1', (user_id,)
    ).fetchone()
    data = _row_to_dict(row)
    if data:
        data['payload'] = _loads(data.get('payload'), {})
    return data


def update_roadmap(conn, roadmap_id: int, payload: dict, adaptation_note: str | None = None) -> None:
    conn.execute(
        """UPDATE tutor_roadmaps SET payload=?, adaptation_note=?, version=version+1,
               updated_at=CURRENT_TIMESTAMP WHERE id=?""",
        (json.dumps(payload, ensure_ascii=False), adaptation_note, roadmap_id),
    )
    conn.commit()


# ---------------------------------------------------------------- exercises ---
def replace_exercises(conn, roadmap_id: int, user_id: int, exercises: list[dict]) -> None:
    conn.execute('DELETE FROM tutor_exercises WHERE roadmap_id=?', (roadmap_id,))
    for exercise in exercises:
        conn.execute(
            """INSERT INTO tutor_exercises(
                   roadmap_id,user_id,module_key,lesson_key,topic,exercise_type,difficulty,
                   prompt,options,answer_index,expected_answer,rubric,max_score)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (roadmap_id, user_id, exercise.get('module_key') or 'm1', exercise.get('lesson_key') or 'm1-l1',
             exercise.get('topic') or '', exercise['exercise_type'], exercise.get('difficulty') or 'beginner',
             exercise['prompt'], json.dumps(exercise.get('options'), ensure_ascii=False)
             if exercise.get('options') else None,
             exercise.get('answer_index'), exercise.get('expected_answer'), exercise.get('rubric'),
             float(exercise.get('max_score') or 10)),
        )
    conn.commit()


def exercises_for_roadmap(conn, roadmap_id: int) -> list[dict]:
    rows = conn.execute(
        'SELECT * FROM tutor_exercises WHERE roadmap_id=? ORDER BY id', (roadmap_id,)
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def get_exercise(conn, exercise_id: int) -> dict:
    row = conn.execute('SELECT * FROM tutor_exercises WHERE id=?', (exercise_id,)).fetchone()
    return _row_to_dict(row)


def to_public(row: dict) -> dict:
    """Client-safe exercise view: never exposes the answer key or rubric."""
    options = _loads(row.get('options'), None)
    if row.get('exercise_type') == 'multiple_choice' and not options:
        options = []
    return {
        'id': row.get('id'),
        'roadmap_id': row.get('roadmap_id'),
        'module_key': row.get('module_key'),
        'lesson_key': row.get('lesson_key'),
        'topic': row.get('topic'),
        'exercise_type': row.get('exercise_type'),
        'difficulty': row.get('difficulty'),
        'prompt': row.get('prompt'),
        'options': options,
        'choice_count': len(options) if isinstance(options, list) else 0,
        'max_score': float(row.get('max_score') or 10),
    }


# -------------------------------------------------------------- submissions ---
def add_submission(conn, exercise_id: int, user_id: int, *, answer: str, answer_type: str, result: dict) -> int:
    cursor = conn.execute(
        """INSERT INTO tutor_submissions(
               exercise_id,user_id,answer,answer_type,score,max_score,percentage,grade,is_correct,
               feedback,strengths,weaknesses,missing_points,suggested_answer,recommended_review)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (exercise_id, user_id, answer[:5000], answer_type, float(result['score']), float(result['max_score']),
         int(result['percentage']), str(result['grade']), int(bool(result['is_correct'])),
         str(result['feedback']), json.dumps(result['strengths'], ensure_ascii=False),
         json.dumps(result['weaknesses'], ensure_ascii=False),
         json.dumps(result['missing_points'], ensure_ascii=False),
         str(result['suggested_answer']),
         json.dumps(result['recommended_review'], ensure_ascii=False)),
    )
    conn.commit()
    return int(cursor.lastrowid)


def submissions_for_roadmap(conn, roadmap_id: int, user_id: int) -> list[dict]:
    rows = conn.execute(
        """SELECT s.*, e.exercise_type, e.topic, e.difficulty
           FROM tutor_submissions s JOIN tutor_exercises e ON e.id=s.exercise_id
           WHERE e.roadmap_id=? AND s.user_id=? ORDER BY s.id""",
        (roadmap_id, user_id),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def progress_for_roadmap(conn, roadmap_id: int, user_id: int) -> dict:
    """Learner progress: one entry per exercise, keeping the best attempt so far."""
    rows = submissions_for_roadmap(conn, roadmap_id, user_id)
    total = conn.execute(
        'SELECT COUNT(*) AS count FROM tutor_exercises WHERE roadmap_id=?', (roadmap_id,)
    ).fetchone()
    best: dict[int, int] = {}
    for row in rows:
        try:
            exercise_id = int(row['exercise_id'])
        except (TypeError, ValueError):
            continue
        percentage = max(0, min(100, int(row.get('percentage') or 0)))
        if percentage > best.get(exercise_id, -1):
            best[exercise_id] = percentage
    graded = len(best)
    total_count = int(total['count']) if total else 0
    return {
        'total_exercises': total_count,
        'graded': graded,
        'average_percentage': round(sum(best.values()) / graded) if graded else 0,
        'completed': graded >= total_count > 0,
    }


def to_public_assessment(row: dict):
    """Learner-facing assessment summary (JSON columns decoded, no answer keys)."""
    if not row or not row.get('id'):
        return None
    return {
        'assessment_id': str(row['id']),
        'subject': row.get('subject'),
        'goal': row.get('goal'),
        'current_level': row.get('current_level'),
        'target_level': row.get('target_level'),
        'study_time': row.get('study_time'),
        'pace': row.get('pace'),
        'score_percent': row.get('score_percent'),
        'strengths': _loads(row.get('strengths'), []),
        'weaknesses': _loads(row.get('weaknesses'), []),
        'created_at': row.get('created_at'),
    }


def recent_submissions(conn, user_id: int, limit: int = 20) -> list[dict]:
    """Latest submissions for a learner across every roadmap."""
    rows = conn.execute(
        """
        SELECT s.*, e.exercise_type, e.topic, e.difficulty
        FROM tutor_submissions s
        JOIN tutor_exercises e ON e.id = s.exercise_id
        WHERE s.user_id = ?
        ORDER BY s.id DESC
        LIMIT ?
        """,
        (user_id, limit),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def submission_payload(submission_id: int, exercise: dict, result: dict) -> dict:
    """Wire payload returned to the client after grading (plan §6 contract)."""
    return {
        'submission_id': str(submission_id),
        'exercise_id': str(exercise.get('id')),
        'exercise_type': exercise.get('exercise_type'),
        'topic': exercise.get('topic'),
        'difficulty': exercise.get('difficulty'),
        'score': result['score'],
        'max_score': result['max_score'],
        'percentage': result['percentage'],
        'grade': result['grade'],
        'is_correct': result['is_correct'],
        'graded_by': result.get('graded_by', 'backend'),
        'feedback': result['feedback'],
        'strengths': result['strengths'],
        'weaknesses': result['weaknesses'],
        'missing_points': result['missing_points'],
        'suggested_answer': result['suggested_answer'],
        'recommended_review': result['recommended_review'],
    }
