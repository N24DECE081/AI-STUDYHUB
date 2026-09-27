"""StudyHub's user-facing clock."""
from datetime import datetime, timedelta, timezone

VIETNAM_TZ = timezone(timedelta(hours=7), "GMT+7")


def vietnam_now() -> datetime:
    return datetime.now(VIETNAM_TZ)
