import pytest
from dcicutils.qa_utils import notice_pytest_fixtures


pytestmark = [pytest.mark.indexing, pytest.mark.workbook]


class MockedRequest(object):
    """ Test object intended to be used to mock certain aspects of requests. Takes kwargs which
        will be passed as named fields to MockedRequest. More arguments could be added if other
        use is seen.
    """
    def __init__(self, **kwargs):
        if 'principals_allowed' not in kwargs:
            self.effective_principals = ['system.Everyone']
        else:
            self.effective_principals = kwargs['principals_allowed']  # note this is not exactly what the field is


def test_search_view(workbook, es_testapp):
    """ Test basic things about search view """
    res = es_testapp.get('/search/?type=Item').json
    assert res['@type'] == ['ItemSearchResults', 'Search']
    assert res['@id'] == '/search/?type=Item'
    assert res['@context'] == '/terms/'
    assert res['notification'] == 'Success'
    assert res['title'] == 'Search'
    assert res['total'] > 0
    assert 'facets' in res

    # type facet should always have > 1 option here, even when it is selected
    for facet in res['facets']:
        if facet['field'] == 'type':
            assert len(facet['terms']) > 1
            break
    assert 'filters' in res
    assert '@graph' in res


def test_search_with_no_query(workbook, es_testapp):
    """
    using /search/ (with no query) should default to /search/?type=Item
    thus, should satisfy same assertions as test_search_view
    """
    notice_pytest_fixtures(workbook)
    res = es_testapp.get('/search/').follow(status=200)
    assert res.json['@type'] == ['ItemSearchResults', 'Search']
    assert res.json['@id'] == '/search/?type=Item'
    assert res.json['@context'] == '/terms/'
    assert res.json['notification'] == 'Success'
    assert res.json['title'] == 'Search'
    assert res.json['total'] > 0
    assert 'facets' in res
    # test default facets (data type)
    default_facets = [facet['field'] for facet in res.json['facets']]
    assert 'type' in default_facets
    # assert 'status' in default_facets uncomment this if status is added back -Will 5/13/2020
    assert 'filters' in res
    assert '@graph' in res


def test_collections_redirect_to_search(workbook, es_testapp):
    """
    we removed the collections page and redirect to search of that type
    redirected_from is not used for search
    """
    res = es_testapp.get('/user/', status=301).follow(status=200)
    assert res.json['@type'] == ['UserSearchResults', 'ItemSearchResults', 'Search']
    assert res.json['@id'] == '/search/?type=User'
    assert 'redirected_from' not in res.json['@id']
    assert res.json['@context'] == '/terms/'
    assert res.json['notification'] == 'Success'
    assert res.json['title'] == 'Search'
    assert res.json['total'] > 0
    assert 'facets' in res
    assert 'filters' in res
    assert '@graph' in res


def test_collection_limit(workbook, es_testapp):
    res = es_testapp.get('/user/?limit=1', status=301)
    assert len(res.follow().json['@graph']) == 1


def test_collection_actions_filtered_by_permission(workbook, es_testapp, anon_es_testapp):
    res = es_testapp.get('/user/')
    assert any(action for action in res.follow().json.get('actions', []) if action['name'] == 'add')

    # users not visible
    res = anon_es_testapp.get('/user/', status=404)
    assert len(res.json['@graph']) == 0


def test_search_total(workbook, es_testapp, anon_es_testapp):
    """ Test that we can extract some search totals """
    search = {
        'type': 'File',
        'status': ['released', 'restricted', 'public'],
    }
    res = es_testapp.post_json('/search_total', search).json['total']
    assert res == 8
    anon_res = anon_es_testapp.post_json('/search_total', search).json['total']
    assert anon_res == 1