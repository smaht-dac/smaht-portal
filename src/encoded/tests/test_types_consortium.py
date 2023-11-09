import pytest


def test_types_consortium(testapp, test_consortium):
    """ Tests we can post/get a consortium item in the most basic sense """
    testapp.get(f'/consortium/{test_consortium["uuid"]}')


@pytest.mark.parametrize('item', [
    {
        'identifier': 'SMaHT\Consortium',
        'title': 'SMaHT Test Consortium'
    },
    {
        'title': 'No identifier'
    },
    {
        'identifier': 'No title'
    },
    {
        'identifier': 'SMaHTConsortium',
        'title': 'TestConsortium',
        'additionalProp': True
    }
])
def test_types_consortium_failure(testapp, item):
    """ Tests some failure cases involved with consortium items """
    testapp.post_json('/consortium', item, status=422)
