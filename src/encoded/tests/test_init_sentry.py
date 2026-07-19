from unittest import mock

import encoded
from encoded import (
    init_sentry,
    sentry_traces_sampler,
    SENTRY_TRACE_RATE,
    SENTRY_INDEX_TRACE_RATE,
    SENTRY_INDEX_TRANSACTION_PATH,
)


def _ctx(path):
    """ Build a sentry sampling_context the way the WSGI integration does. """
    return {'wsgi_environ': {'PATH_INFO': path}}


def test_index_transaction_is_downsampled():
    # The continuously-polled indexer endpoint is sampled at the very low nonzero rate.
    assert sentry_traces_sampler(_ctx('/index')) == SENTRY_INDEX_TRACE_RATE
    assert SENTRY_INDEX_TRACE_RATE == 0.001
    assert SENTRY_INDEX_TRANSACTION_PATH == '/index'


def test_normal_routes_keep_default_rate():
    # User-facing routes keep the normal performance sample rate.
    assert SENTRY_TRACE_RATE == 0.1
    for path in ('/search/', '/browse/', '/', '/pages/some-page', '/a-file-uuid/@@download'):
        assert sentry_traces_sampler(_ctx(path)) == SENTRY_TRACE_RATE


def test_index_lookalike_paths_are_not_suppressed():
    # Only the exact /index endpoint is down-sampled; lookalikes must keep the normal rate
    # so we never accidentally suppress real user/admin routes.
    for path in ('/index-abc', '/indexing_status', '/index/', '/reindex', '/xindex'):
        assert sentry_traces_sampler(_ctx(path)) == SENTRY_TRACE_RATE


def test_missing_or_alternate_context_is_not_suppressed_and_does_not_crash():
    # Missing/empty/None sampling context (e.g. a non-HTTP transaction) must fall through
    # to the normal rate rather than crashing or being accidentally suppressed.
    assert sentry_traces_sampler(None) == SENTRY_TRACE_RATE
    assert sentry_traces_sampler({}) == SENTRY_TRACE_RATE
    assert sentry_traces_sampler({'wsgi_environ': None}) == SENTRY_TRACE_RATE
    assert sentry_traces_sampler({'wsgi_environ': {}}) == SENTRY_TRACE_RATE
    # A completely unrelated context shape should also be safe.
    assert sentry_traces_sampler({'parent_sampled': None}) == SENTRY_TRACE_RATE


def test_init_sentry_preserves_error_capture_and_uses_sampler():
    # init_sentry must (1) keep error-event capture at the capture-all default, and
    # (2) drive performance sampling through the per-transaction sampler rather than a
    # flat traces_sample_rate (which the sampler would supersede anyway).
    with mock.patch.object(encoded.sentry_sdk, 'init') as mock_init:
        init_sentry('https://public@sentry.example.com/1')
    assert mock_init.called
    _args, kwargs = mock_init.call_args
    # Error/exception events remain captured at the existing effective default (1.0).
    assert kwargs['sample_rate'] == 1.0
    # Performance sampling is per-transaction via our sampler...
    assert kwargs['traces_sampler'] is sentry_traces_sampler
    # ...and the flat rate is intentionally not passed.
    assert 'traces_sample_rate' not in kwargs


def test_init_sentry_is_a_noop_without_dsn():
    # No DSN -> Sentry must not be initialized at all.
    with mock.patch.object(encoded.sentry_sdk, 'init') as mock_init:
        init_sentry(None)
    assert not mock_init.called
