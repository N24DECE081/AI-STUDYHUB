"""Central plan policy. Handlers must not trust plan, user id or limits from the client."""
from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timedelta, timezone

from ..timezone import VIETNAM_TZ, vietnam_now

PLAN_CODES = ('free', 'plus', 'pro')
ALIASES = {
    'free': 'free',
    'standard': 'plus',
    'plus': 'plus',
    'premium': 'pro',
    'pro': 'pro',
}
DISPLAY = {
    'free': 'Gói Khởi Động',
    'plus': 'Gói Pro Sinh Viên',
    'pro': 'Gói Master Thủ Khoa',
}
PRICES = {'free': 0, 'plus': 199000, 'pro': 299000}
RANKS = {'free': 0, 'plus': 1, 'pro': 2}
SEEDED_PLUS_MONTHLY = 199000
SEEDED_PLUS_DAILY_LIMIT = 100

# available means the workflow exists. allowed is decided per plan.
FEATURES = {
    'tutor_chat': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'document_metadata_preview': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'flashcard_ai_preview': {'available': True, 'plans': ('plus', 'pro'), 'required_plan': 'plus'},
    'document_quiz_generate': {'available': True, 'plans': ('plus', 'pro'), 'required_plan': 'plus'},
    'quiz_from_chat': {'available': True, 'plans': ('plus', 'pro'), 'required_plan': 'plus'},
    'manual_flashcards': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'basic_quiz': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'quiz_submit': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'flashcard_review': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'pronunciation': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'standard_roadmap': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'personalized_roadmap': {'available': True, 'plans': ('plus', 'pro'), 'required_plan': 'plus'},
    'basic_assessment': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'exercise_submit': {'available': True, 'plans': ('free', 'plus', 'pro'), 'required_plan': 'free'},
    'mock_exam': {'available': False, 'plans': ('pro',), 'required_plan': 'pro'},
    'knowledge_gap_analysis': {'available': False, 'plans': ('pro',), 'required_plan': 'pro'},
    'thesis_cv_advisor': {'available': False, 'plans': ('pro',), 'required_plan': 'pro'},
    'offline_export': {'available': False, 'plans': ('pro',), 'required_plan': 'pro'},
    'nova_voice': {'available': False, 'plans': (), 'required_plan': None},
}
DAILY_LIMITS = {'tutor_chat': {'free': 10, 'plus': None, 'pro': None}}
RESOURCE_LIMITS = {
    'documents': {'free': 5, 'plus': None, 'pro': None},
    'flashcards': {'free': 20, 'plus': None, 'pro': None},
    'quizzes': {'free': 2, 'plus': None, 'pro': None},
}
RESOURCE_FEATURES = {
    'documents': 'manual_flashcards',
    'flashcards': 'manual_flashcards',
    'quizzes': 'basic_quiz',
}
UNAVAILABLE_FEATURES = {
    'mock_exam': 'mock_exam',
    'knowledge_gap': 'knowledge_gap_analysis',
    'thesis_cv': 'thesis_cv_advisor',
    'offline_export': 'offline_export',
    'nova_voice': 'nova_voice',
}

_clock = None
_preview_hits: dict[int, list[datetime]] = {}
_preview_lock = threading.Lock()
RESERVATION_SECONDS = 120
PREVIEW_PER_MINUTE = 30


class EntitlementError(Exception):
    def __init__(self, status, payload, headers=None):
        super().__init__(payload.get('error') if isinstance(payload, dict) else str(payload))
        self.status = status
        self.payload = payload
        self.headers = headers or {}


class Reservation:
    def __init__(self, reservation_id, replay=None, in_progress=False):
        self.id = reservation_id
        self.replay = replay
        self.in_progress = in_progress


def set_clock(clock):
    """Test hook. Pass None to restore the Vietnam wall clock."""
    global _clock
    _clock = clock


def now():
    current = _clock() if _clock else vietnam_now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=VIETNAM_TZ)
    return current.astimezone(VIETNAM_TZ)


def usage_date(moment=None):
    return (moment or now()).astimezone(VIETNAM_TZ).date().isoformat()


def resets_at(moment=None):
    current = (moment or now()).astimezone(VIETNAM_TZ)
    nxt = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return nxt.isoformat(timespec='seconds')


def stamp(moment=None):
    return (moment or now()).astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')


def parse_timestamp(value):
    if value is None or value == '':
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip().replace('T', ' ')
        if text.endswith('Z'):
            text = text[:-1] + '+00:00'
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            parsed = datetime.strptime(text[:19], '%Y-%m-%d %H:%M:%S')
    if parsed.tzinfo is None:
        # Legacy columns are UTC wall time without an offset.
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def canonical_plan(name):
    return ALIASES.get(str(name or '').strip().lower(), 'free')


def fingerprint(payload):
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def normalize_request_key(value):
    text = str(value or '').strip()
    if not text:
        return ''
    if len(text) > 80 or any(ch.isspace() for ch in text):
        raise EntitlementError(400, {'error': 'Idempotency-Key không hợp lệ', 'code': 'invalid_idempotency_key'})
    return text


def _value(row, key, index=0):
    if row is None:
        return None
    try:
        return row[key]
    except (KeyError, IndexError, TypeError):
        if isinstance(row, dict):
            return next(iter(row.values()))
        return row[index]


def _dialect(connection):
    return getattr(connection, 'dialect', 'sqlite')


def _begin(connection):
    if not connection.in_transaction:
        connection.execute('START TRANSACTION' if _dialect(connection) == 'mysql' else 'BEGIN IMMEDIATE')


def _rollback(connection):
    try:
        connection.rollback()
    except Exception:
        pass


def migrate_catalog(connection):
    """Move the seeded Plus daily cap to unlimited without touching custom prices or limits.

    Rollback: set plans.ai_daily_limit back to 100 only for the Standard row whose
    price_monthly is still 199000 and whose limit is NULL because of this migration.
    Do not run that rollback if an administrator intentionally set another unlimited plan.
    """
    row = connection.execute(
        "SELECT id, ai_daily_limit, price_monthly FROM plans WHERE lower(name)='standard'"
    ).fetchone()
    if not row:
        return False
    limit = _value(row, 'ai_daily_limit', 1)
    price = _value(row, 'price_monthly', 2)
    if limit == SEEDED_PLUS_DAILY_LIMIT and int(price or 0) == SEEDED_PLUS_MONTHLY:
        connection.execute(
            "UPDATE plans SET ai_daily_limit=NULL WHERE id=? AND ai_daily_limit=? AND price_monthly=?",
            (_value(row, 'id', 0), SEEDED_PLUS_DAILY_LIMIT, SEEDED_PLUS_MONTHLY),
        )
        return True
    return False


def _system_failure(error):
    raise EntitlementError(503, {
        'error': 'Không kiểm tra được quyền gói. Yêu cầu chưa được thực hiện.',
        'code': 'entitlement_unavailable',
        'detail': error.__class__.__name__,
    }) from error


def apply_due_changes(connection, user_id, moment=None):
    """Apply a scheduled downgrade once its effective time has arrived. Idempotent."""
    moment = moment or now()
    try:
        _begin(connection)
        rows = connection.execute(
            '''SELECT sc.id, sc.target_plan_id, sc.effective_at, p.name, p.status AS plan_status
               FROM subscription_changes sc JOIN plans p ON p.id=sc.target_plan_id
               WHERE sc.user_id=? AND sc.status=? ORDER BY sc.id''',
            (user_id, 'scheduled'),
        ).fetchall()
        for row in rows:
            effective = parse_timestamp(_value(row, 'effective_at', 2))
            if effective is None or effective > moment.astimezone(timezone.utc):
                continue
            change_id = _value(row, 'id', 0)
            claimed = connection.execute(
                "UPDATE subscription_changes SET status='applied' WHERE id=? AND status='scheduled'",
                (change_id,),
            )
            if getattr(claimed, 'rowcount', 1) == 0:
                continue
            connection.execute(
                "UPDATE subscriptions SET status='expired' WHERE user_id=? AND status IN ('pending','active')",
                (user_id,),
            )
            target_code = canonical_plan(_value(row, 'name', 3))
            target_status = str(_value(row, 'plan_status', 4) or '')
            if target_code != 'free' and target_status == 'active':
                connection.execute(
                    "INSERT INTO subscriptions(user_id,plan_id,status,started_at,expires_at) VALUES(?,?,?,?,?)",
                    (user_id, _value(row, 'target_plan_id', 1), 'active', stamp(moment), None),
                )
        connection.commit()
    except EntitlementError:
        _rollback(connection)
        raise
    except Exception as error:
        _rollback(connection)
        _system_failure(error)


def resolve(connection, user_id, moment=None):
    moment = moment or now()
    try:
        apply_due_changes(connection, user_id, moment)
        connection.commit()
        row = connection.execute(
            '''SELECT s.id, s.status, s.started_at, s.expires_at, p.name, p.status AS plan_status
               FROM subscriptions s JOIN plans p ON p.id=s.plan_id
               WHERE s.user_id=? AND s.status='active' ORDER BY s.id DESC LIMIT 1''',
            (user_id,),
        ).fetchone()
        scheduled = connection.execute(
            '''SELECT p.name, sc.billing_cycle, sc.effective_at, sc.status
               FROM subscription_changes sc JOIN plans p ON p.id=sc.target_plan_id
               WHERE sc.user_id=? AND sc.status='scheduled' ORDER BY sc.id DESC LIMIT 1''',
            (user_id,),
        ).fetchone()
    except EntitlementError:
        raise
    except Exception as error:
        _system_failure(error)
    plan = 'free'
    status = 'active'
    started = None
    expires = None
    if row:
        started = parse_timestamp(_value(row, 'started_at', 2))
        expires = parse_timestamp(_value(row, 'expires_at', 3))
        plan_status = str(_value(row, 'plan_status', 5) or '')
        code = canonical_plan(_value(row, 'name', 4))
        utc_now = moment.astimezone(timezone.utc)
        valid = plan_status == 'active' and code in PLAN_CODES
        if started and started > utc_now:
            valid = False
            status = 'scheduled'
        if expires and expires <= utc_now:
            valid = False
            status = 'expired'
            connection.execute("UPDATE subscriptions SET status='expired' WHERE id=? AND status='active'", (_value(row, 'id', 0),))
            connection.commit()
        if valid and code != 'free':
            plan = code
            status = 'active'
        elif not valid:
            plan = 'free'
    change = None
    if scheduled:
        change = {
            'plan': canonical_plan(_value(scheduled, 'name', 0)),
            'billing_cycle': _value(scheduled, 'billing_cycle', 1) or 'month',
            'effective_at': _value(scheduled, 'effective_at', 2),
        }
        if status == 'active':
            status = 'scheduled_change'
    return {
        'plan': plan,
        'status': status,
        'started_at': started.isoformat(timespec='seconds') if started else None,
        'expires_at': expires.isoformat(timespec='seconds') if expires else None,
        'scheduled_change': change,
    }


def _feature_view(plan, feature):
    spec = FEATURES[feature]
    allowed = plan in spec['plans']
    available = bool(spec['available'])
    return {
        'allowed': allowed and available,
        'available': available,
        'required_plan': spec['required_plan'],
    }


def _usage_view(connection, user_id, plan, moment=None):
    moment = moment or now()
    day = usage_date(moment)
    usage = {}
    for feature, limits in DAILY_LIMITS.items():
        limit = limits[plan]
        try:
            used_row = connection.execute(
                'SELECT used_count FROM entitlement_usage WHERE user_id=? AND feature=? AND usage_date=?',
                (user_id, feature, day),
            ).fetchone()
            reserved_row = connection.execute(
                '''SELECT COUNT(*) AS reserved FROM entitlement_reservations
                   WHERE user_id=? AND feature=? AND usage_date=? AND status='reserved' AND expires_at>?''',
                (user_id, feature, day, stamp(moment)),
            ).fetchone()
        except Exception as error:
            _system_failure(error)
        used = int(_value(used_row, 'used_count', 0) or 0) if used_row else 0
        reserved = int(_value(reserved_row, 'reserved', 0) or 0)
        remaining = None if limit is None else max(0, limit - used - reserved)
        usage[feature] = {
            'limit': limit,
            'used': used,
            'reserved': reserved,
            'remaining': remaining,
            'resets_at': resets_at(moment),
        }
    for resource, limits in RESOURCE_LIMITS.items():
        limit = limits[plan]
        current = _resource_count(connection, user_id, resource)
        usage[resource] = {
            'limit': limit,
            'used': current,
            'reserved': 0,
            'remaining': None if limit is None else max(0, limit - current),
            'resets_at': None,
        }
    return usage


def snapshot(connection, user_id, moment=None):
    moment = moment or now()
    resolved = resolve(connection, user_id, moment)
    plan = resolved['plan']
    return {
        'plan': plan,
        'plan_code': plan,
        'display_name': DISPLAY[plan],
        'status': resolved['status'],
        'price_monthly': PRICES[plan],
        'started_at': resolved['started_at'],
        'expires_at': resolved['expires_at'],
        'billing_cycle': 'month',
        'scheduled_change': resolved['scheduled_change'],
        'capabilities': {name: _feature_view(plan, name) for name in FEATURES},
        'usage': _usage_view(connection, user_id, plan, moment),
        'authority': 'server',
    }


def require_feature(connection, user_id, feature, moment=None):
    if feature not in FEATURES:
        raise EntitlementError(400, {'error': 'Tính năng không hợp lệ', 'code': 'invalid_feature'})
    view = snapshot(connection, user_id, moment)
    spec = view['capabilities'][feature]
    if not spec['available']:
        raise unavailable(feature)
    if not spec['allowed']:
        raise EntitlementError(403, {
            'error': f"Cần {DISPLAY.get(spec['required_plan'] or 'plus', 'gói trả phí')} để dùng tính năng này.",
            'code': 'feature_not_in_plan',
            'feature': feature,
            'current_plan': view['plan'],
            'required_plan': spec['required_plan'],
        })
    return view


def unavailable(feature):
    spec = FEATURES.get(feature, {})
    return EntitlementError(501, {
        'error': 'Tính năng này chưa được triển khai.',
        'code': 'feature_unavailable',
        'feature': feature,
        'available': False,
        'required_plan': spec.get('required_plan'),
    })


def allow_metadata_preview(user_id, moment=None):
    moment = moment or now()
    cutoff = moment - timedelta(minutes=1)
    with _preview_lock:
        hits = [item for item in _preview_hits.get(user_id, []) if item > cutoff]
        if len(hits) >= PREVIEW_PER_MINUTE:
            _preview_hits[user_id] = hits
            raise EntitlementError(429, {
                'error': 'Bạn xem trước quá nhanh. Hãy nhập tay hoặc thử lại sau.',
                'code': 'rate_limited',
                'retry_after_seconds': 60,
            }, {'Retry-After': '60'})
        hits.append(moment)
        _preview_hits[user_id] = hits


def _resource_count(connection, user_id, resource, exclude_deck_id=None):
    if resource == 'documents':
        row = connection.execute('SELECT COUNT(*) AS total FROM documents WHERE uploaded_by=?', (user_id,)).fetchone()
        return int(_value(row, 'total', 0) or 0)
    if resource == 'quizzes':
        row = connection.execute(
            "SELECT COUNT(*) AS total FROM chat_sessions WHERE user_id=? AND title LIKE 'QUIZ_CARD:%'",
            (user_id,),
        ).fetchone()
        return int(_value(row, 'total', 0) or 0)
    if resource == 'flashcards':
        total = 0
        rows = connection.execute('SELECT id, payload FROM flashcard_decks WHERE user_id=?', (user_id,)).fetchall()
        for item in rows:
            if exclude_deck_id is not None and str(_value(item, 'id', 0)) == str(exclude_deck_id):
                continue
            try:
                payload = json.loads(_value(item, 'payload', 1) or '{}')
            except (TypeError, json.JSONDecodeError):
                payload = {}
            total += len(payload.get('cards') or [])
        return total
    return 0


def _resource_error(resource, limit, current, requested):
    labels = {'documents': 'tài liệu', 'flashcards': 'thẻ', 'quizzes': 'đề'}
    return EntitlementError(409, {
        'error': f"Đã đạt giới hạn {limit} {labels.get(resource, resource)} của gói hiện tại.",
        'code': 'resource_limit_exceeded',
        'resource': resource,
        'limit': limit,
        'current': current,
        'requested': requested,
    })


def _lock_and_check(connection, user_id, resource, requested_total, increasing):
    view = snapshot(connection, user_id)
    limit = RESOURCE_LIMITS[resource][view['plan']]
    _begin(connection)
    current = _resource_count(connection, user_id, resource)
    if limit is not None and increasing and requested_total > limit:
        _rollback(connection)
        raise _resource_error(resource, limit, current, requested_total)
    return view


def assert_document_capacity(connection, user_id, adding=1):
    if adding <= 0:
        return snapshot(connection, user_id)
    view = snapshot(connection, user_id)
    limit = RESOURCE_LIMITS['documents'][view['plan']]
    _begin(connection)
    current = _resource_count(connection, user_id, 'documents')
    if limit is not None and current + adding > limit:
        _rollback(connection)
        raise _resource_error('documents', limit, current, current + adding)
    return view


def assert_quiz_capacity(connection, user_id, adding=1):
    if adding <= 0:
        return snapshot(connection, user_id)
    view = snapshot(connection, user_id)
    limit = RESOURCE_LIMITS['quizzes'][view['plan']]
    _begin(connection)
    current = _resource_count(connection, user_id, 'quizzes')
    if limit is not None and current + adding > limit:
        _rollback(connection)
        raise _resource_error('quizzes', limit, current, current + adding)
    return view


def assert_card_capacity(connection, user_id, deck_id, new_count):
    view = snapshot(connection, user_id)
    limit = RESOURCE_LIMITS['flashcards'][view['plan']]
    _begin(connection)
    rows = connection.execute('SELECT id, payload FROM flashcard_decks WHERE user_id=?', (user_id,)).fetchall()
    old = 0
    others = 0
    for item in rows:
        try:
            payload = json.loads(_value(item, 'payload', 1) or '{}')
        except (TypeError, json.JSONDecodeError):
            payload = {}
        count = len(payload.get('cards') or [])
        if str(_value(item, 'id', 0)) == str(deck_id):
            old = count
        else:
            others += count
    projected = others + int(new_count)
    if limit is not None and int(new_count) > old and projected > limit:
        _rollback(connection)
        raise _resource_error('flashcards', limit, others + old, projected)
    return view


def _quota_error(limit, used, reserved, moment):
    remaining = max(0, limit - used - reserved)
    reset = resets_at(moment)
    retry = max(1, int((parse_timestamp(reset) - moment.astimezone(timezone.utc)).total_seconds()))
    return EntitlementError(429, {
        'error': 'Bạn đã dùng hết lượt Nova AI Tutor hôm nay.',
        'code': 'quota_exceeded',
        'feature': 'tutor_chat',
        'limit': limit,
        'used': used,
        'reserved': reserved,
        'remaining': remaining,
        'resets_at': reset,
    }, {'Retry-After': str(retry)})


def _recover(connection, user_id, feature, moment):
    connection.execute(
        '''UPDATE entitlement_reservations SET status='expired', updated_at=?
           WHERE user_id=? AND feature=? AND status='reserved' AND expires_at<=?''',
        (stamp(moment), user_id, feature, stamp(moment)),
    )


def _ensure_usage(connection, user_id, feature, day):
    if _dialect(connection) == 'mysql':
        connection.execute(
            'INSERT IGNORE INTO entitlement_usage(user_id,feature,usage_date,used_count) VALUES(?,?,?,0)',
            (user_id, feature, day),
        )
    else:
        connection.execute(
            '''INSERT INTO entitlement_usage(user_id,feature,usage_date,used_count) VALUES(?,?,?,0)
               ON CONFLICT(user_id,feature,usage_date) DO NOTHING''',
            (user_id, feature, day),
        )


def reserve(connection, user_id, feature, payload, request_key, moment=None):
    """Reserve one successful logical turn. Caller must finalize or release outside the model call."""
    moment = moment or now()
    if feature not in DAILY_LIMITS:
        raise EntitlementError(400, {'error': 'Quota không áp dụng cho tính năng này', 'code': 'invalid_feature'})
    view = require_feature(connection, user_id, feature, moment)
    limit = DAILY_LIMITS[feature][view['plan']]
    key = normalize_request_key(request_key) or f'auto-{fingerprint(payload)[:16]}-{stamp(moment)}'
    digest = fingerprint(payload)
    day = usage_date(moment)
    expires = stamp(moment + timedelta(seconds=RESERVATION_SECONDS))
    try:
        _begin(connection)
        _recover(connection, user_id, feature, moment)
        existing = connection.execute(
            '''SELECT id, fingerprint, status, result_json, expires_at FROM entitlement_reservations
               WHERE user_id=? AND request_key=?''',
            (user_id, key),
        ).fetchone()
        if existing:
            if _value(existing, 'fingerprint', 1) != digest:
                _rollback(connection)
                raise EntitlementError(409, {
                    'error': 'Idempotency-Key đã dùng cho một nội dung khác.',
                    'code': 'idempotency_conflict',
                })
            status = _value(existing, 'status', 2)
            if status == 'finalized' and _value(existing, 'result_json', 3):
                _rollback(connection)
                replay = json.loads(_value(existing, 'result_json', 3))
                replay['idempotent_replay'] = True
                return Reservation(_value(existing, 'id', 0), replay=replay)
            if status == 'reserved' and parse_timestamp(_value(existing, 'expires_at', 4)) > moment.astimezone(timezone.utc):
                _rollback(connection)
                raise EntitlementError(409, {
                    'error': 'Yêu cầu này đang được xử lý. Hãy thử lại để nhận kết quả đã lưu.',
                    'code': 'request_in_progress',
                    'feature': feature,
                }, {'Retry-After': '2'})
            _ensure_usage(connection, user_id, feature, day)
            used_row = connection.execute(
                'SELECT used_count FROM entitlement_usage WHERE user_id=? AND feature=? AND usage_date=?',
                (user_id, feature, day),
            ).fetchone()
            reserved_row = connection.execute(
                '''SELECT COUNT(*) AS reserved FROM entitlement_reservations
                   WHERE user_id=? AND feature=? AND usage_date=? AND status='reserved' AND expires_at>? AND id<>?''',
                (user_id, feature, day, stamp(moment), _value(existing, 'id', 0)),
            ).fetchone()
            used = int(_value(used_row, 'used_count', 0) or 0)
            reserved = int(_value(reserved_row, 'reserved', 0) or 0)
            if limit is not None and used + reserved >= limit:
                _rollback(connection)
                raise _quota_error(limit, used, reserved, moment)
            connection.execute(
                '''UPDATE entitlement_reservations
                   SET status='reserved', usage_date=?, fingerprint=?, result_json=NULL, expires_at=?, updated_at=?
                   WHERE id=?''',
                (day, digest, expires, stamp(moment), _value(existing, 'id', 0)),
            )
            connection.commit()
            return Reservation(_value(existing, 'id', 0))
        _ensure_usage(connection, user_id, feature, day)
        used_row = connection.execute(
            'SELECT used_count FROM entitlement_usage WHERE user_id=? AND feature=? AND usage_date=?',
            (user_id, feature, day),
        ).fetchone()
        reserved_row = connection.execute(
            '''SELECT COUNT(*) AS reserved FROM entitlement_reservations
               WHERE user_id=? AND feature=? AND usage_date=? AND status='reserved' AND expires_at>?''',
            (user_id, feature, day, stamp(moment)),
        ).fetchone()
        used = int(_value(used_row, 'used_count', 0) or 0)
        reserved = int(_value(reserved_row, 'reserved', 0) or 0)
        if limit is not None and used + reserved >= limit:
            _rollback(connection)
            raise _quota_error(limit, used, reserved, moment)
        if _dialect(connection) == 'mysql':
            connection.execute(
                '''INSERT INTO entitlement_reservations(
                       user_id,feature,usage_date,request_key,fingerprint,status,created_at,expires_at,updated_at
                   ) VALUES(?,?,?,?,?,'reserved',?,?,?)''',
                (user_id, feature, day, key, digest, stamp(moment), expires, stamp(moment)),
            )
            inserted = connection.execute('SELECT LAST_INSERT_ID() AS id').fetchone()
            reservation_id = _value(inserted, 'id', 0)
        else:
            cursor = connection.execute(
                '''INSERT INTO entitlement_reservations(
                       user_id,feature,usage_date,request_key,fingerprint,status,created_at,expires_at,updated_at
                   ) VALUES(?,?,?,?,?,'reserved',?,?,?)''',
                (user_id, feature, day, key, digest, stamp(moment), expires, stamp(moment)),
            )
            reservation_id = cursor.lastrowid
        connection.commit()
        return Reservation(reservation_id)
    except EntitlementError:
        raise
    except Exception as error:
        _rollback(connection)
        _system_failure(error)


def finalize(connection, reservation_id, result, moment=None):
    moment = moment or now()
    encoded = json.dumps(result, ensure_ascii=False)
    try:
        _begin(connection)
        row = connection.execute(
            'SELECT user_id, feature, usage_date, status FROM entitlement_reservations WHERE id=?',
            (reservation_id,),
        ).fetchone()
        if not row:
            _rollback(connection)
            return False
        if _value(row, 'status', 3) == 'finalized':
            _rollback(connection)
            return True
        updated = connection.execute(
            '''UPDATE entitlement_reservations SET status='finalized', result_json=?, updated_at=?
               WHERE id=? AND status='reserved' ''',
            (encoded, stamp(moment), reservation_id),
        )
        if getattr(updated, 'rowcount', 1) == 0:
            _rollback(connection)
            return False
        _ensure_usage(connection, _value(row, 'user_id', 0), _value(row, 'feature', 1), _value(row, 'usage_date', 2))
        connection.execute(
            '''UPDATE entitlement_usage SET used_count=used_count+1, updated_at=?
               WHERE user_id=? AND feature=? AND usage_date=?''',
            (stamp(moment), _value(row, 'user_id', 0), _value(row, 'feature', 1), _value(row, 'usage_date', 2)),
        )
        connection.commit()
        return True
    except Exception as error:
        _rollback(connection)
        _system_failure(error)


def release(connection, reservation_id, moment=None):
    if not reservation_id:
        return
    moment = moment or now()
    try:
        connection.execute(
            '''UPDATE entitlement_reservations SET status='released', updated_at=?
               WHERE id=? AND status='reserved' ''',
            (stamp(moment), reservation_id),
        )
        connection.commit()
    except Exception as error:
        _rollback(connection)
        _system_failure(error)


def basic_quiz(topic):
    from ..quizzes.basic import build
    return build(topic)
