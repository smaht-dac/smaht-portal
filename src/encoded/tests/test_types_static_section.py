import pytest

from .helpers import workbook_lookup


@pytest.fixture
def static_help_page_default():
    return workbook_lookup(item_type='Page', name='about/what-is-smaht')


def test_get_about_page(workbook, es_testapp, static_help_page_default):
    """ Tests that we can get a static setion and that it is structured correctly """
    help_page_url = '/' + static_help_page_default['name']
    res = es_testapp.get(help_page_url, status=200)
    assert res.json['@id'] == help_page_url
    assert res.json['@context'] == help_page_url
    assert 'AboutPage' in res.json['@type']
    assert 'StaticPage' in res.json['@type']
    # assert res.json['content'] == help_page['content'] # No longer works latter is set to an @id of static_section
    # Instead lets check what we have embedded on GET request is inside our doc file (about_introduction.md).
    assert 'Coming soon!' in res.json['content'][0]['content']
    assert res.json['content'][0]['filetype'] == 'md'
    assert res.json['toc'] == static_help_page_default['table-of-contents']
