import pytest
from ..homepage import extract_desired_facet_from_search


def test_extract_desired_facet():
    """ Test a small helper function """
    example_facets = [
        {'field': 'type', 'title': 'Data Type', 'total': 0, 'hide_from_view': True, 'aggregation_type': 'terms',
         'terms': [{'key': 'File', 'doc_count': 7}, {'key': 'Item', 'doc_count': 7}]}
    ]
    assert extract_desired_facet_from_search(example_facets, 'type') is not {}
    assert extract_desired_facet_from_search(example_facets, 'not-found') is {}


@pytest.mark.workbook
def test_home_page_workbook(es_testapp, workbook):
    """ Tests that we get appropriate counts based on workbook inserts """
    home = es_testapp.get('/home').json
    # Validate some basic structure
    assert home['@context'] == '/home'
    assert 'EST' in home['date']
    assert '@graph' in home
    assert 'categories' in home['@graph'][0]
    assert 'figures' in home['@graph'][0]['categories'][0]
    # check file generated counts
    # from workbook inserts, not including 1 output files and 1 reference file
    assert home['@graph'][0]['categories'][0]['figures'][-1]['value'] == 6
    assert home['@graph'][0]['categories'][0]['figures'][-1]['unit'] == 'Files Generated'
    # check assay count (should be 4 as of right now)
    assert home['@graph'][0]['categories'][0]['figures'][1]['value'] == 4
    assert home['@graph'][0]['categories'][0]['figures'][1]['unit'] == 'Assays'
