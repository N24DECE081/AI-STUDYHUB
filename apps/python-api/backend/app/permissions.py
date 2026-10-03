"""Subscription policy and durable, atomic AI Tutor quotas."""
from .timezone import vietnam_now

PLAN_CODES = {'free': 'free', 'standard': 'plus', 'plus': 'plus', 'premium': 'pro', 'pro': 'pro'}
PLAN_LIMITS = {
    'free': {'max_documents': 10, 'storage_bytes': 200 * 1024**2, 'tutor_limit': 5, 'tutor_period': 'day'},
    'plus': {'max_documents': 50, 'storage_bytes': 2 * 1024**3, 'tutor_limit': 200, 'tutor_period': 'month'},
    'pro': {'max_documents': 200, 'storage_bytes': 5 * 1024**3, 'tutor_limit': None, 'tutor_period': 'month'},
}
PAID_FEATURES = {'advanced_quiz', 'ai_analytics', 'personalized_roadmap'}
MASTER_FEATURES = {'multiple_models', 'deep_analysis', 'advanced_roadmap'}
CHAT_PATHS = {'/api/ai-tutor/chat', '/api/ai/chat', '/api/chat'}


class PermissionDenied(Exception):
    def __init__(self, message, code='plan_required', status=403):
        super().__init__(message)
        self.code, self.status = code, status


def initialize(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS plan_usage (
        user_id INTEGER NOT NULL,
        period_key VARCHAR(20) NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, period_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )''')
    conn.commit()


def plan_for(conn, user_id):
    row = conn.execute('''SELECT p.name FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=? AND s.status='active' ORDER BY s.id DESC LIMIT 1''', (user_id,)).fetchone()
    return PLAN_CODES.get(str(row['name']).lower(), 'free') if row else 'free'


def allowed(plan, feature):
    if feature in MASTER_FEATURES:
        return plan == 'pro'
    if feature in PAID_FEATURES:
        return plan in ('plus', 'pro')
    return feature in {'basic_quiz', 'basic_progress', 'deep_focus', 'upload', 'ai_tutor'}


def require_feature(plan, feature):
    if not allowed(plan, feature):
        name = 'Master Thủ Khoa' if feature in MASTER_FEATURES else 'Pro Sinh Viên'
        raise PermissionDenied(f'Nâng cấp lên Gói {name} để sử dụng tính năng này.')


def period_keys(now=None):
    now = now or vietnam_now()
    return 'day:' + now.strftime('%Y-%m-%d'), 'month:' + now.strftime('%Y-%m')


def snapshot(conn, user_id, now=None):
    plan = plan_for(conn, user_id)
    limits = PLAN_LIMITS[plan]
    day, month = period_keys(now)
    key = day if limits['tutor_period'] == 'day' else month
    row = conn.execute('SELECT used FROM plan_usage WHERE user_id=? AND period_key=?', (user_id, key)).fetchone()
    storage = conn.execute('SELECT COUNT(*) AS count, COALESCE(SUM(file_size),0) AS bytes FROM documents WHERE uploaded_by=?', (user_id,)).fetchone()
    return {**limits, 'features': {feature: allowed(plan, feature) for feature in PAID_FEATURES | MASTER_FEATURES | {'deep_focus', 'basic_quiz', 'basic_progress'}},
            'tutor_used': int(row['used']) if row else 0, 'period_key': key,
            'document_count': int(storage['count']), 'storage_used_bytes': int(storage['bytes'])}


def reserve_tutor(conn, user_id, plan, now=None):
    """Reserve both periods so switching plans cannot reset consumed requests."""
    keys = period_keys(now)
    limits = PLAN_LIMITS[plan]
    key = keys[0] if limits['tutor_period'] == 'day' else keys[1]
    insert = 'INSERT IGNORE' if getattr(conn, 'dialect', '') == 'mysql' else 'INSERT OR IGNORE'
    for period in keys:
        conn.execute(f'{insert} INTO plan_usage(user_id,period_key,used) VALUES(?,?,0)', (user_id, period))
    limit = limits['tutor_limit']
    if limit is not None:
        changed = conn.execute('UPDATE plan_usage SET used=used+1 WHERE user_id=? AND period_key=? AND used<?', (user_id, key, limit))
        if not changed.rowcount:
            conn.rollback()
            unit = 'hôm nay' if limits['tutor_period'] == 'day' else 'tháng này'
            raise PermissionDenied(f'Đã dùng hết {limit} lượt AI Tutor {unit}. Nâng cấp để sử dụng tiếp.', 'tutor_quota_exceeded', 429)
    for period in keys:
        if period != key or limit is None:
            conn.execute('UPDATE plan_usage SET used=used+1 WHERE user_id=? AND period_key=?', (user_id, period))
    conn.commit()
    return user_id, keys


def refund_tutor(conn, reservation):
    user_id, keys = reservation
    for key in keys:
        conn.execute('UPDATE plan_usage SET used=used-1 WHERE user_id=? AND period_key=? AND used>0', (user_id, key))
    conn.commit()


def check_upload(conn, user_id, size):
    # Serialize quota check + existing upload insert in the same transaction.
    if getattr(conn, 'dialect', '') == 'mysql':
        # Discard the read-only subject preflight's repeatable-read snapshot.
        conn.rollback()
        conn.execute('SELECT id FROM users WHERE id=? FOR UPDATE', (user_id,)).fetchone()
    else:
        conn.execute('BEGIN IMMEDIATE')
    policy = snapshot(conn, user_id)
    if policy['document_count'] >= policy['max_documents']:
        raise PermissionDenied(f"Đã đạt giới hạn {policy['max_documents']} tài liệu. Nâng cấp để tải lên thêm.", 'document_quota_exceeded')
    if policy['storage_used_bytes'] + size > policy['storage_bytes']:
        raise PermissionDenied('Dung lượng lưu trữ của gói đã hết. Nâng cấp hoặc xóa tài liệu để tải lên thêm.', 'storage_quota_exceeded')


def request_feature(path, payload):
    if path in {'/api/flashcards/generate', '/api/quizzes/generate', '/api/flashcards/preview'}:
        return 'advanced_quiz'
    if path in {'/api/ai-tutor/roadmap', '/api/ai-tutor/assessment/start', '/api/ai-tutor/assessment/submit'}:
        return 'advanced_roadmap' if payload.get('advanced') or str(payload.get('target_level') or '').strip().lower() == 'advanced' else 'personalized_roadmap'
    if path in {'/api/ai-tutor/assessment', '/api/ai-tutor/exercises', '/api/ai-tutor/submissions'} or (path.startswith('/api/ai-tutor/exercises/') and path.endswith('/submit')):
        return 'personalized_roadmap'
    if path in {'/api/ai-tutor/memory', '/api/ai-tutor/analytics'}:
        return 'ai_analytics'
    if path in CHAT_PATHS:
        if str(payload.get('model') or 'auto').strip() != 'auto':
            return 'multiple_models'
        if str(payload.get('depth') or '').strip().lower() == 'deep':
            return 'deep_analysis'
    return None
