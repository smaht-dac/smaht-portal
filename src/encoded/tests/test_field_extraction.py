import pytest
from types import SimpleNamespace
from src.encoded.metadata import extract_values, descend_field


@pytest.fixture
def mock_request():
    return SimpleNamespace(scheme='https', host='example.org')


def test_extract_values_flat_dict():
    data = {'a': {'b': 'value'}}
    assert extract_values(data, ['a', 'b']) == ['value']


def test_extract_values_nested_list_of_dicts():
    data = {'a': [{'b': 'v1'}, {'b': 'v2'}]}
    assert sorted(extract_values(data, ['a', 'b'])) == ['v1', 'v2']


def test_extract_values_mixed_nested_structures():
    data = {
        'a': [
            {'b': {'c': 'v1'}},
            {'b': {'c': 'v2'}},
            {'b': {'x': 'ignore'}}
        ]
    }
    assert sorted(extract_values(data, ['a', 'b', 'c'])) == ['v1', 'v2']


def test_extract_values_list_of_primitives():
    data = {'a': {'b': ['x', 'y', 'z']}}
    assert sorted(extract_values(data, ['a', 'b'])) == ['x', 'y', 'z']


def test_extract_values_missing_keys():
    data = {'a': {'x': 'nope'}}
    assert extract_values(data, ['a', 'b']) == []


def test_descend_field_flat_value(mock_request):
    data = {'top': {'key': 'result'}}
    fields = ['top.key']
    assert descend_field(mock_request, data, fields) == 'result'


def test_descend_field_nested_list(mock_request):
    data = {
        'items': [
            {'val': 'A'},
            {'val': 'B'},
        ]
    }
    fields = ['items.val']
    assert descend_field(mock_request, data, fields) == 'A,B'


def test_descend_field_handles_missing(mock_request):
    data = {'not_relevant': 'skip'}
    fields = ['some.deep.path']
    assert descend_field(mock_request, data, fields) is None


def test_descend_field_href(mock_request):
    data = {'href': '/@@download/somefile.txt'}
    fields = ['href']
    assert descend_field(mock_request, data, fields) == 'https://example.org/@@download/somefile.txt'


def test_descend_field_href_cli(mock_request):
    data = {'href': '/@@download/somefile.txt'}
    fields = ['href']
    result = descend_field(mock_request, data, fields, cli=True)
    assert result == 'https://example.org/@@download_cli/somefile.txt'


def test_descend_field_file_sets_file_group(mock_request):
    data = {
        'file_sets': [
            {'file_group': 'FG1'},
            {'file_group': 'FG2'}
        ]
    }
    fields = ['file_sets.file_group']
    assert descend_field(mock_request, data, fields) == 'FG1'
