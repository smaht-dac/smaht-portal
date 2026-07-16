"""Behavior-locking tests for the /peek-metadata POST count/existence mode.

`peek_metadata` gained a lightweight POST mode: a body carrying
`search_query_params` runs a facet-free `snovault.search` (via
`skip_default_facets`) and returns just `{'total': N}`. This replaces the
`ProtectedDonorViewDataCards` DSA check, which previously issued a GET and read
the `type` facet's `File` doc_count. Because the query already filters
`type=File`, that doc_count equals the total hit count — so the POST count and
the old GET read return the same existence answer.

The ES round-trip (`snovault.search.search` + `make_search_subreq`) is mocked;
these tests assert dispatch and the forwarded query, not live ES behavior.
"""

import json
from unittest.mock import patch

from pyramid.response import Response
from webob.multidict import MultiDict

from encoded import metadata


class FakeRequest:
    def __init__(self, method='POST', json_body=None, content_type='application/json',
                 params=None):
        self.method = method
        self._json_body = json_body
        self.content_type = content_type
        self.params = MultiDict(params or {})

    @property
    def json_body(self):
        if self._json_body is None:
            raise json.JSONDecodeError('no body', '', 0)
        return self._json_body


# The real DSA query the frontend sends, in search_query_params dict form.
_DSA_PARAMS = {
    'data_type': ['DSA', 'Chain File', 'Sequence Interval'],
    'dataset!': ['No value'],
    'donors.display_title': ['SMHT001'],
    'sample_summary.studies': ['Production'],
    'status': ['open', 'open-early', 'open-network',
               'protected', 'protected-early', 'protected-network'],
    'type': ['File'],
}


def _run_count_mode(json_body, search_return):
    """Invoke peek_metadata with search()/make_search_subreq mocked; capture the
    forwarded /search path."""
    captured = {}

    def fake_make_subreq(request, path, inherit_user=False):
        captured['path'] = path
        captured['inherit_user'] = inherit_user
        return 'SUBREQ'

    def fake_search(context, subreq):
        assert subreq == 'SUBREQ'
        return search_return

    request = FakeRequest(method='POST', json_body=json_body)
    with patch.object(metadata, 'make_search_subreq', side_effect=fake_make_subreq), \
            patch.object(metadata, 'search', side_effect=fake_search):
        result = metadata.peek_metadata(None, request)
    return result, captured


def test_peek_metadata_count_mode_returns_total():
    result, captured = _run_count_mode(
        {'search_query_params': _DSA_PARAMS},
        {'total': 7, 'facets': []},
    )
    assert result == {'total': 7}

    path = captured['path']
    # Facet-free + no hit fetch, controlled by us regardless of caller input.
    assert 'skip_default_facets=true' in path
    assert 'limit=0' in path
    assert captured['inherit_user'] is True
    # Real filters are forwarded to snovault (which builds the correct query).
    assert 'data_type=DSA' in path
    assert 'data_type=Chain+File' in path
    assert 'dataset%21=No+value' in path          # dataset!=No value (negation)
    assert 'donors.display_title=SMHT001' in path
    assert 'sample_summary.studies=Production' in path
    assert 'type=File' in path


def test_peek_metadata_post_count_matches_old_get_type_facet_read():
    """The new POST count returns the same existence answer the old GET read did.

    Old GET read: facets -> field 'type' -> term 'File' -> doc_count.
    Since type=File is a filter, that doc_count == total hits, which is exactly
    what the count mode returns.
    """
    total = 4
    # What snovault's faceted GET would have returned for the same query:
    get_style_facets = [
        {'field': 'type', 'terms': [{'key': 'File', 'doc_count': total}]},
    ]
    old_get_doc_count = next(
        t['doc_count']
        for f in get_style_facets if f['field'] == 'type'
        for t in f['terms'] if t['key'] == 'File'
    )

    result, _ = _run_count_mode(
        {'search_query_params': _DSA_PARAMS},
        {'total': total, 'facets': []},
    )
    assert result['total'] == old_get_doc_count
    # The frontend only cares about existence (> 0); both agree.
    assert (result['total'] > 0) == (old_get_doc_count > 0)


def test_peek_metadata_count_mode_zero_hits():
    result, _ = _run_count_mode(
        {'search_query_params': {'type': ['File'], 'donors.display_title': ['NOBODY']}},
        {'total': 0, 'facets': []},
    )
    assert result == {'total': 0}
    assert (result['total'] > 0) is False


def test_peek_metadata_count_mode_ignores_caller_supplied_limit_and_skip():
    """A caller can't override the facet-free/limit=0 controls."""
    _, captured = _run_count_mode(
        {'search_query_params': {'type': ['File'], 'limit': ['50'],
                                 'from': ['10'], 'skip_default_facets': ['false']}},
        {'total': 2, 'facets': []},
    )
    path = captured['path']
    assert 'skip_default_facets=true' in path
    assert 'skip_default_facets=false' not in path
    assert 'limit=0' in path
    assert 'limit=50' not in path
    assert 'from=10' not in path


# The donor browse row-summary GET query, mirroring what
# BrowseDonorPeekMetadata.js's buildDonorPeekMetadataHref actually sends
# (`additional_facet=type` intentionally excluded — see that file for why).
_DONOR_BROWSE_GET_PARAMS = MultiDict([
    ('skip_default_facets', 'true'),
    ('additional_facet', 'sample_summary.tissues'),
    ('additional_facet', 'assays.display_title'),
    ('additional_facet', 'file_size'),
    ('status', 'open'),
    ('dataset!', 'No value'),
    ('type', 'File'),
    ('donors.display_title', 'SMHT001'),
])


def test_facets_via_search_returns_facets_and_total():
    """`_facets_via_search` (the donor-browse GET path) must surface `total`
    alongside `facets` so callers can read the File count from `total`
    instead of requesting `additional_facet=type` under
    `skip_default_facets=true` — that combination makes snovault infer an
    invalid `stats` aggregation on the `embedded.@type.raw` keyword field and
    the search 400s (the confirmed PR #712 regression)."""
    captured = {}

    def fake_make_subreq(request, path, inherit_user=False):
        captured['path'] = path
        captured['inherit_user'] = inherit_user
        return 'SUBREQ'

    fake_facets = [{'field': 'file_size', 'sum': 2048}]

    def fake_search(context, subreq):
        assert subreq == 'SUBREQ'
        return {'total': 7, 'facets': fake_facets}

    with patch.object(metadata, 'make_search_subreq', side_effect=fake_make_subreq), \
            patch.object(metadata, 'search', side_effect=fake_search):
        result = metadata._facets_via_search(FakeRequest(), _DONOR_BROWSE_GET_PARAMS)

    assert result == {'facets': fake_facets, 'total': 7}

    # Regression guard: the request built for the donor-browse GET must never
    # combine skip_default_facets=true with additional_facet=type.
    path = captured['path']
    assert 'skip_default_facets=true' in path
    assert 'additional_facet=type' not in path
    assert 'limit=0' in path


def test_peek_metadata_get_dispatches_to_facets_via_search():
    """The GET branch of peek_metadata (donor-browse row-summary path) must
    return the {facets, total} dict as-is, not a bare facets array."""
    request = FakeRequest(method='GET', params=dict(_DONOR_BROWSE_GET_PARAMS))
    fake_result = {'facets': [{'field': 'file_size', 'sum': 15}], 'total': 3}

    with patch.object(metadata, 'handle_metadata_arguments',
                       return_value=Response('x', status=415)), \
            patch.object(metadata, '_facets_via_search',
                         return_value=fake_result) as facets_mock:
        result = metadata.peek_metadata(None, request)

    assert facets_mock.called
    assert result == fake_result


def test_peek_metadata_post_without_search_query_params_uses_filesize_path():
    """A POST body without search_query_params must NOT enter count mode; it
    falls through to the existing file-size/manifest handling."""
    request = FakeRequest(method='POST',
                          json_body={'type': 'File', 'include_extra_files': False})

    count_called = []

    def fake_count(*args, **kwargs):
        count_called.append(True)
        return {'total': 999}

    # Short-circuit handle_metadata_arguments to the GET-ish facets branch so we
    # don't need live ES/TSV machinery — we only assert dispatch here.
    with patch.object(metadata, '_count_via_search', side_effect=fake_count), \
            patch.object(metadata, 'handle_metadata_arguments',
                         return_value=Response('x', status=415)), \
            patch.object(metadata, '_facets_via_search',
                         return_value={'facets': [{'field': 'file_size', 'sum': 15}],
                                       'total': 3}) as facets_mock:
        result = metadata.peek_metadata(None, request)

    assert count_called == []                      # count mode NOT taken
    assert facets_mock.called
    assert result == {'facets': [{'field': 'file_size', 'sum': 15}], 'total': 3}
