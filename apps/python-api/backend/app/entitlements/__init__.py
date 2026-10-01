"""Plan entitlements: catalog, resolver, quotas and resource limits."""

from .service import (
    EntitlementError,
    allow_metadata_preview,
    assert_card_capacity,
    assert_document_capacity,
    assert_quiz_capacity,
    basic_quiz,
    finalize,
    migrate_catalog,
    release,
    require_feature,
    reserve,
    snapshot,
    unavailable,
)

__all__ = [
    'EntitlementError',
    'allow_metadata_preview',
    'assert_card_capacity',
    'assert_document_capacity',
    'assert_quiz_capacity',
    'basic_quiz',
    'finalize',
    'migrate_catalog',
    'release',
    'require_feature',
    'reserve',
    'snapshot',
    'unavailable',
]
