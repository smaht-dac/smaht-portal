import re
import pytest
from pyramid import testing
from .. import homepage
from ..homepage import (
    extract_desired_facet_from_search,
    extract_total_from_search,
    extract_unique_facet_count_from_search,
    format_release_date,
    home,
    SEARCH_ERROR_SENTINEL,
)


def test_extract_desired_facet():
    """ Test a small helper function """
    example_facets = [
        {'field': 'type', 'title': 'Data Type', 'total': 0, 'hide_from_view': True, 'aggregation_type': 'terms',
         'terms': [{'key': 'File', 'doc_count': 7}, {'key': 'Item', 'doc_count': 7}]}
    ]
    assert extract_desired_facet_from_search(example_facets, 'type') == example_facets[0]
    # not-found returns an empty dict (falsy)
    assert not extract_desired_facet_from_search(example_facets, 'not-found')


def test_extract_desired_facet_original_terms():
    """ When a facet carries a group_by_field, original_terms is promoted to terms """
    example_facets = [
        {'field': 'assays.display_title', 'title': 'Assay',
         'terms': [{'key': 'grouped', 'doc_count': 1}],
         'original_terms': [
             {'key': 'bulk_wgs', 'doc_count': 3},
             {'key': 'bulk_rna_seq', 'doc_count': 2},
         ]}
    ]
    facet = extract_desired_facet_from_search(example_facets, 'assays.display_title')
    assert facet['terms'] == example_facets[0]['original_terms']


def test_extract_total_from_search():
    """ total is read from a dict result, sentinel/non-dict coerces to 0 """
    assert extract_total_from_search({'total': 42}) == 42
    assert extract_total_from_search({}) == 0
    # F3: the error sentinel never renders as -1
    assert extract_total_from_search(SEARCH_ERROR_SENTINEL) == 0
    assert extract_total_from_search(None) == 0


def _facet_result(field, term_keys):
    return {'total': 0, 'facets': [
        {'field': field, 'terms': [{'key': k, 'doc_count': 1} for k in term_keys]}
    ]}


def test_extract_unique_facet_count_basic():
    """ Counts unique facet terms """
    result = _facet_result('assays.display_title', ['bulk_wgs', 'bulk_rna_seq', 'bulk_mas_iso_seq'])
    assert extract_unique_facet_count_from_search(result, 'assays.display_title') == 3


def test_extract_unique_facet_count_excludes_no_value():
    """ 'No value' is not counted as a real term """
    result = _facet_result('donors.display_title', ['ST001', 'ST002', 'No value'])
    assert extract_unique_facet_count_from_search(result, 'donors.display_title') == 2


def test_extract_unique_facet_count_missing_facet():
    """ F4: a facet absent from the response degrades to 0, not a KeyError """
    result = _facet_result('assays.display_title', ['bulk_wgs'])
    assert extract_unique_facet_count_from_search(result, 'donors.display_title') == 0


def test_extract_unique_facet_count_sentinel():
    """ F3: sentinel/non-dict result yields 0 rather than crashing """
    assert extract_unique_facet_count_from_search(SEARCH_ERROR_SENTINEL, 'assays.display_title') == 0
    assert extract_unique_facet_count_from_search(None, 'assays.display_title') == 0


def test_format_release_date():
    """ F5/F6: plain YYYY-MM-DD (no ' EST'), and safe on bad/missing/sentinel input """
    assert format_release_date('2024-03-28') == '2024-03-28'
    assert format_release_date('2024-03-28T12:00:00') == '2024-03-28'
    # F5: no timezone suffix appended
    assert ' EST' not in format_release_date('2024-03-28')
    # F6: sentinel / non-str / unparseable degrade to None instead of raising
    assert format_release_date(SEARCH_ERROR_SENTINEL) is None
    assert format_release_date(None) is None
    assert format_release_date('not-a-date') is None


def test_home_dedupes_searches_and_never_returns_sentinel(monkeypatch):
    """ F1/F3: home() runs exactly one search per distinct param dict (6 total: 1 date +
        5 result dicts, down from 14), and no figure value is ever the -1 sentinel. """
    calls = []
    canned = {
        'total': 7,
        'facets': [
            {'field': 'assays.display_title', 'terms': [{'key': 'a'}, {'key': 'b'}]},
            {'field': 'donors.display_title', 'terms': [{'key': 'd1'}]},
            {'field': 'sample_summary.tissues', 'terms': [{'key': 't1'}, {'key': 'No value'}]},
        ],
        '@graph': [
            {'file_status_tracking': {'release_dates': {'initial_release_date': '2024-03-28'}}}
        ],
    }

    def fake_search(context, request, search_param):
        calls.append(dict(search_param))
        return canned

    monkeypatch.setattr(homepage, 'generate_admin_search_given_params', fake_search)
    response = home(None, testing.DummyRequest())

    # exactly 6 ES searches (1 release date + 5 per-dict result searches)
    assert len(calls) == 6
    # every result search is a limit=0 search (the date search uses the dict's own limit=1)
    assert sum(1 for c in calls if c.get('limit') == 0) == 5
    # F5: date is a bare YYYY-MM-DD with no timezone suffix
    assert response['date'] == '2024-03-28'

    def assert_no_sentinel(node):
        if isinstance(node, dict):
            for value in node.values():
                assert_no_sentinel(value)
        elif isinstance(node, list):
            for value in node:
                assert_no_sentinel(value)
        else:
            assert node != SEARCH_ERROR_SENTINEL

    assert_no_sentinel(response)


@pytest.mark.workbook
def test_home_page_workbook(es_testapp, workbook):
    """ Tests that we get appropriate counts based on workbook inserts """
    home = es_testapp.get('/home').json
    # Validate some basic structure
    assert home['@context'] == '/home'
    assert home['date'] is None or re.match(r'^\d{4}-\d{2}-\d{2}$', home['date'])
    assert '@graph' in home
    assert 'categories' in home['@graph'][0]
    assert 'figures' in home['@graph'][0]['categories'][0]
    # check file generated counts
    # from workbook inserts with open/open-early/protected-early status and colo829t dataset,
    # not including 1 released output file (status excluded) and 1 reference file (no dataset)
    assert home['@graph'][0]['categories'][0]['figures'][-1]['value'] == 5
    assert home['@graph'][0]['categories'][0]['figures'][-1]['unit'] == 'Files Generated'
    # check assay count for colo829 (bulk_wgs, bulk_mas_iso_seq, bulk_rna_seq)
    assert home['@graph'][0]['categories'][0]['figures'][1]['value'] == 3
    assert home['@graph'][0]['categories'][0]['figures'][1]['unit'] == 'Assays'
    # no figure value should ever be the error sentinel (F3)
    for section in home['@graph']:
        for category in section['categories']:
            for figure in category['figures']:
                assert figure['value'] != SEARCH_ERROR_SENTINEL
