"""Offline regression tests for OC preflight, permission updates and HTTP safety."""

import csv
import json
from copy import deepcopy
from urllib.parse import parse_qs, unquote

import pytest
from requests import Response
from requests.exceptions import HTTPError, Timeout

from ..commands import load_users_from_oc as command
from .test_load_users_from_oc import _processor, _row

pytestmark = [pytest.mark.unit, pytest.mark.working]
EMAIL = 'alice@example.org'


def _http_error(status):
    response = Response()
    response.status_code = status
    response.url = 'https://portal.invalid/users/fixture'
    return HTTPError(f'HTTP {status}', response=response)


@pytest.fixture(autouse=True)
def no_real_credentials(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('Tests must not load real credentials')
    monkeypatch.setattr(command, 'SMaHTKeyManager', forbidden)


class PortalFixture:
    """Apply only the patch/delete semantics relevant here, without a server."""

    def __init__(self):
        self.users = {}
        self.gets = []
        self.posts = []
        self.patches = []
        self.links = {}

    def get(self, path, key):
        self.gets.append(path)
        if path.startswith('/users/'):
            email = unquote(path.removeprefix('/users/'))
            if email not in self.users:
                raise _http_error(404)
            return deepcopy(self.users[email])
        if path in self.links:
            return deepcopy(self.links[path])
        return {'identifier': path.rstrip('/').rsplit('/', 1)[-1]}

    def post(self, body, collection, key, add_on=''):
        assert collection == 'users'
        assert body['email'] not in self.users
        self.posts.append((deepcopy(body), add_on))
        if 'check_only=true' not in add_on:
            self.users[body['email']] = deepcopy(body)

    def patch(self, body, path, key, add_on=''):
        email = unquote(path.removeprefix('/users/'))
        assert email in self.users
        self.patches.append((deepcopy(body), add_on))
        if 'check_only=true' not in add_on:
            self.users[email].update(deepcopy(body))
            for field in parse_qs(add_on.lstrip('?')).get('delete_fields', [''])[0].split(','):
                self.users[email].pop(field, None)


@pytest.fixture
def portal(monkeypatch):
    portal = PortalFixture()
    monkeypatch.setattr(command, 'get_metadata', portal.get)
    monkeypatch.setattr(command, 'post_metadata', portal.post)
    monkeypatch.setattr(command, 'patch_metadata', portal.patch)
    return portal


def _run(rows, tmp_path, monkeypatch, mode='--update-changed', extra=()):
    path = tmp_path / 'users.csv'
    with path.open('w', newline='', encoding='utf-8-sig') as stream:
        csv.writer(stream).writerows([_row('Email')] + rows)
    monkeypatch.setattr('builtins.input', lambda: 'y')
    args = command.build_arg_parser().parse_args([str(path), mode, *extra])
    return _processor(key={}).main(args)


@pytest.mark.parametrize('flag', ['Yes', 'No', ''])
@pytest.mark.parametrize('mode', ['--create-new', '--update-changed', '--update-all'])
def test_dac_always_has_historical_submission_grant(flag, mode, portal, tmp_path, monkeypatch):
    if mode != '--create-new':
        portal.users[EMAIL] = {'consortia': ['smaht']}
    assert _run([_row(EMAIL, sc=' DAC ', submitter=flag)], tmp_path, monkeypatch, mode) == 0
    assert portal.users[EMAIL]['submits_for'] == ['smaht_dac']


@pytest.mark.parametrize('centers,expected', [
    (' DAC, ,nih, sc1,sc1,', ['smaht_dac', 'sc1']),
    ('/submission-centers/sc1/, SC2 ,sc1', ['sc1', 'sc2']),
    ('', []), (' NIH ', []), (' , , ', []),
])
def test_creation_normalizes_and_validates_exact_links(centers, expected, portal, tmp_path, monkeypatch):
    assert _run([_row(EMAIL, sc=centers, submitter='Yes')], tmp_path, monkeypatch, '--create-new') == 0
    created = portal.users[EMAIL]
    if expected:
        assert created['submission_centers'] == created['submits_for'] == expected
    else:
        assert 'submission_centers' not in created and 'submits_for' not in created
    assert [p for p in portal.gets if p.startswith('/submission-centers/')] == [
        f'/submission-centers/{sc}' for sc in expected]
    assert '/consortia/smaht_associate' not in portal.gets


def test_duplicate_and_revoked_rows_do_not_validate_unused_centers(portal, tmp_path, monkeypatch):
    rows = [_row(EMAIL, sc='bad'), _row(EMAIL, sc='bad', revoked=' yes '),
            _row('revoked@example.org', sc='bad', revoked='YES'), _row('valid@example.org', sc='sc1')]
    assert _run(rows, tmp_path, monkeypatch, '--create-new') == 0
    assert '/submission-centers/bad' not in portal.gets
    assert list(portal.users) == ['valid@example.org']


@pytest.mark.parametrize('column,value', [(3, 'perhaps'), (8, 'maybe'), (9, 'N/A'), (10, 'true'),
                                         (4, ''), (4, 'not an email'), (1, ''), (2, ' ')])
def test_malformed_row_aborts_all_preflight(column, value, portal, tmp_path, monkeypatch):
    bad = _row('bad@example.org')
    bad[column] = value
    with pytest.raises(command.UserCSVProcessorException, match='Row 3:'):
        _run([_row(EMAIL), bad], tmp_path, monkeypatch, '--create-new')
    assert portal.gets == portal.posts == portal.patches == []


def test_short_row_aborts_instead_of_leaving_partially_generated_users():
    processor = _processor()
    processor.generate_users([_row(EMAIL)])
    with pytest.raises(command.UserCSVProcessorException, match='Row 3: Expected at least 10 columns'):
        processor.generate_users([_row(EMAIL), ['too', 'short']])
    assert processor.user_dict == {}


def test_generation_is_fresh_and_row_numbers_include_blank_rows(capsys):
    processor = _processor()
    rows = [_row(EMAIL), [' ', ''], _row(' ALICE@EXAMPLE.ORG ')]
    assert processor.generate_users(rows) == {}
    out = capsys.readouterr().out
    assert 'row 2' in out and 'row 4' in out
    assert list(processor.generate_users([_row('new@example.org')])) == ['new@example.org']
    assert list(processor.generate_users([_row('new@example.org')])) == ['new@example.org']


@pytest.mark.parametrize('text', ['', 'no header\n', ',Last,First,No,alice@example.org,pi,grant,dac,No,No\n'])
def test_missing_header_rejected_without_portal_calls(text, portal, tmp_path):
    path = tmp_path / 'bad.csv'
    path.write_text(text)
    args = command.build_arg_parser().parse_args([str(path), '--create-new'])
    with pytest.raises(command.UserCSVProcessorException, match='header'):
        _processor(key={}).main(args)
    assert portal.gets == portal.posts == portal.patches == []


def test_broken_csv_rejected():
    with pytest.raises(csv.Error):
        # Exercise csv strict parsing with an unterminated quote via a file mock.
        from unittest.mock import mock_open, patch
        with patch('builtins.open', mock_open(read_data='"unterminated')):
            _processor().read_csv('fixture.csv')


def test_header_only_is_successful_noop(portal, tmp_path, monkeypatch):
    assert _run([], tmp_path, monkeypatch, '--create-new') == 0
    assert portal.gets == portal.posts == portal.patches == []


@pytest.mark.parametrize('error', [_http_error(401), _http_error(403), _http_error(429),
                                  _http_error(503), Timeout('fixture timeout')])
def test_create_lookup_failure_aborts_before_any_post(error, portal, tmp_path, monkeypatch):
    original_get = portal.get

    def fail_second(path, key):
        if path == '/users/bob@example.org':
            raise error
        return original_get(path, key)

    monkeypatch.setattr(command, 'get_metadata', fail_second)
    with pytest.raises(type(error)):
        _run([_row(EMAIL), _row('bob@example.org')], tmp_path, monkeypatch, '--create-new')
    assert portal.posts == portal.patches == []


@pytest.mark.parametrize('response', [None, {}, [], 'not an item'])
def test_malformed_lookup_is_not_treated_as_missing(response, monkeypatch):
    monkeypatch.setattr(command, 'get_metadata', lambda *a, **kw: response)
    with pytest.raises(command.UserCSVProcessorException, match='Invalid user response'):
        _processor(key={}).check_for_existing_user(command.User('A', 'B', 'No', EMAIL, 'sc1', 'No'))


def test_compound_invalid_link_stops_before_writes(portal, tmp_path, monkeypatch):
    original_get = portal.get

    def get(path, key):
        if path == '/submission-centers/bad':
            raise _http_error(404)
        return original_get(path, key)

    monkeypatch.setattr(command, 'get_metadata', get)
    with pytest.raises(HTTPError):
        _run([_row(EMAIL, sc='sc1,bad', submitter='Yes')], tmp_path, monkeypatch, '--create-new')
    assert '/submission-centers/sc1' in portal.gets
    assert portal.posts == portal.patches == []


@pytest.mark.parametrize('mode', ['--update-all', '--update-changed'])
@pytest.mark.parametrize('status', [None, 'inactive', 'revoked', 'deleted'])
def test_update_modes_skip_missing_and_noncurrent_users(status, mode, portal, tmp_path, monkeypatch):
    if status:
        portal.users[EMAIL] = {'status': status, 'consortia': ['smaht']}
    assert _run([_row(EMAIL)], tmp_path, monkeypatch, mode) == 0
    assert portal.posts == portal.patches == []


@pytest.mark.parametrize('flag,expected', [('', ['sc1']), ('Yes', ['sc1']), ('No', [])])
def test_blank_center_does_not_imply_removal(flag, expected, portal, tmp_path, monkeypatch, capsys):
    portal.users[EMAIL] = {'consortia': ['smaht'], 'submits_for': ['sc1']}
    assert _run([_row(EMAIL, sc='', submitter=flag)], tmp_path, monkeypatch,
                extra=['--verbose']) == 0
    assert portal.users[EMAIL].get('submits_for', []) == expected
    out = capsys.readouterr().out
    assert 'updating without submission_centers/submits_for' not in out
    if flag == 'No':
        assert 'delete_fields=submits_for' in out
    else:
        assert portal.patches == []


def test_blank_flags_and_missing_associate_column_preserve_managed_values(portal, tmp_path, monkeypatch):
    portal.users[EMAIL] = {'consortia': ['other', 'smaht', 'smaht_associate'], 'submits_for': ['sc1'],
                           'groups': ['admin', 'dbgap']}
    row = _row(EMAIL, dua='', sc='sc1', submitter='')[:10]
    assert _run([row], tmp_path, monkeypatch) == 0
    assert portal.patches == []


def test_deliberate_removals_are_idempotent_and_preserve_unmanaged_values(portal, tmp_path, monkeypatch):
    portal.users[EMAIL] = {'consortia': ['other', 'smaht_associate', 'smaht'], 'groups': ['admin', 'dbgap'],
                           'submits_for': ['sc1'], 'submission_centers': ['original'], 'first_name': 'Original'}
    rows = [_row(EMAIL, sc='sc2', submitter=' no ', dua='NO', associate='nO')]
    assert _run(rows, tmp_path, monkeypatch) == 0
    assert len(portal.patches) == 1
    updated = portal.users[EMAIL]
    assert updated['consortia'] == ['other', 'smaht']
    assert updated['groups'] == ['admin']
    assert 'submits_for' not in updated
    assert updated['submission_centers'] == ['original'] and updated['first_name'] == 'Original'
    assert _run(rows, tmp_path, monkeypatch) == 0
    assert len(portal.patches) == 1
    assert _run(rows, tmp_path, monkeypatch, '--update-all') == 0
    assert len(portal.patches) == 2


def test_create_then_change_then_no_change_is_bounded(portal, tmp_path, monkeypatch):
    rows = [_row(EMAIL, sc='sc1', dua=' yes ', submitter='YES', associate='Yes')]
    assert _run(rows, tmp_path, monkeypatch, '--create-new') == 0
    assert _run(rows, tmp_path, monkeypatch, '--create-new') == 0
    assert len(portal.posts) == 1
    assert portal.users[EMAIL]['consortia'] == ['smaht', 'smaht_associate']
    rows[0][7] = 'sc2,sc1,sc2'
    assert _run(rows, tmp_path, monkeypatch) == 0
    assert len(portal.patches) == 1
    rows[0][7] = 'sc1,sc2'  # ordering is not a permission change
    portal.users[EMAIL]['consortia'].reverse()
    assert _run(rows, tmp_path, monkeypatch) == 0
    assert len(portal.patches) == 1


@pytest.mark.parametrize('mode', ['--create-new', '--update-changed', '--update-all'])
def test_validation_never_persists_and_reports_exact_request(mode, portal, tmp_path, monkeypatch, capsys):
    if mode != '--create-new':
        portal.users[EMAIL] = {'consortia': ['smaht'], 'groups': ['dbgap'], 'submits_for': ['sc1']}
    before = deepcopy(portal.users)
    assert _run([_row(EMAIL, sc='sc1')], tmp_path, monkeypatch, mode,
                extra=['--validate-only', '--verbose']) == 0
    assert portal.users == before
    requests = portal.posts + portal.patches
    assert len(requests) == 1 and 'check_only=true' in requests[0][1]
    out = capsys.readouterr().out
    assert 'nothing was persisted' in out
    if mode != '--create-new':
        assert 'delete_fields=submits_for,groups' in out


@pytest.mark.parametrize('value,expected', [
    ({'identifier': 'sc1', '@id': '/submission-centers/other/'}, 'sc1'),
    ({'@id': '/submission-centers/sc1/'}, 'sc1'),
    (' /submission-centers/sc1/ ', 'sc1'), (' sc1 ', 'sc1'),
])
def test_link_normalization(value, expected):
    assert command.UserCSVProcessor._normalize_linked_item(value) == expected


@pytest.mark.parametrize('field,value', [('consortia', [{}]), ('submits_for', [None]),
                                        ('submits_for', 'sc1'), ('groups', None), ('groups', [None])])
def test_malformed_existing_data_is_not_patched(field, value, portal, tmp_path, monkeypatch):
    portal.users[EMAIL] = {'consortia': ['smaht'], field: value}
    assert _run([_row(EMAIL)], tmp_path, monkeypatch) == 1
    assert portal.patches == []


def test_uuid_only_links_resolve_once_and_do_not_trigger_false_updates(portal, tmp_path, monkeypatch):
    uuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    portal.links[f'/submission-centers/{uuid}'] = {'identifier': 'sc1'}
    for email in [EMAIL, 'bob@example.org']:
        portal.users[email] = {'consortia': [{'@id': '/consortia/smaht/'}],
                               'submits_for': [{'@id': f'/submission-centers/{uuid}/'}]}
    rows = [_row(email, sc='sc1', submitter='Yes') for email in portal.users]
    assert _run(rows, tmp_path, monkeypatch) == 0
    assert portal.patches == []
    assert portal.gets.count(f'/submission-centers/{uuid}') == 1


def test_update_failure_is_counted_without_aborting_next_user(portal, tmp_path, monkeypatch):
    for email in [EMAIL, 'bob@example.org']:
        portal.users[email] = {'consortia': ['smaht']}
    original_get = portal.get

    def get(path, key):
        if path == f'/users/{EMAIL}':
            raise _http_error(503)
        return original_get(path, key)

    monkeypatch.setattr(command, 'get_metadata', get)
    assert _run([_row(email) for email in portal.users], tmp_path, monkeypatch) == 1
    assert len(portal.patches) == 1


@pytest.mark.parametrize('verb', ['GET', 'POST', 'PATCH'])
@pytest.mark.parametrize('outcome', [404, 503, 302, 'timeout'])
def test_http_adapter_never_retries(verb, outcome, monkeypatch):
    attempts = []

    def request(url, **kwargs):
        attempts.append((url, kwargs))
        if outcome == 'timeout':
            raise Timeout('fixture timeout')
        response = Response()
        response.status_code = outcome
        response.url = url
        response._content = b'{}'
        return response

    monkeypatch.setitem(command.ff_utils.REQUESTS_VERBS, verb, request)
    key = {'server': 'https://portal.invalid', 'key': 'fixture', 'secret': 'fixture'}
    error_type = Timeout if outcome == 'timeout' else command.UserCSVProcessorException if outcome == 302 else HTTPError
    with pytest.raises(error_type):
        command._metadata(verb, '/users', key, body={} if verb != 'GET' else None)
    assert len(attempts) == 1
    assert attempts[0][1]['timeout'] == (10, 60)
    assert attempts[0][1]['allow_redirects'] is (verb == 'GET')


def test_http_adapter_get_reads_fresh_embedded_user_and_encodes_email(monkeypatch):
    attempts = []

    def request(url, **kwargs):
        attempts.append(url)
        response = Response()
        response.status_code = 200
        response._content = json.dumps({'consortia': ['smaht']}).encode()
        return response

    monkeypatch.setitem(command.ff_utils.REQUESTS_VERBS, 'GET', request)
    key = {'server': 'https://portal.invalid/', 'key': 'fixture', 'secret': 'fixture'}
    assert _processor(key=key)._get_user('alice+tag@example.org') == {'consortia': ['smaht']}
    assert attempts == ['https://portal.invalid/users/alice%2Btag@example.org?frame=embedded&datastore=database']


@pytest.mark.parametrize('result', [0, 1, command.UserCSVProcessorException('bad CSV')])
def test_cli_reports_exit_status(result, monkeypatch):
    processor = _processor()

    def run(args):
        if isinstance(result, Exception):
            raise result
        return result

    processor.main = run
    monkeypatch.setattr(command, 'UserCSVProcessor', lambda **kw: processor)
    monkeypatch.setattr('builtins.input', lambda: 'y')
    with pytest.raises(SystemExit) as exit_info:
        command.main(['fixture.csv', '--create-new'])
    assert exit_info.value.code == (1 if isinstance(result, Exception) else result)


def test_alias_and_uuid_spreadsheet_links_compare_as_identifiers(portal, tmp_path, monkeypatch):
    uuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    portal.links[f'/submission-centers/{uuid}'] = {'identifier': 'sc1'}
    portal.links['/submission-centers/old_alias'] = {'identifier': 'sc1'}
    portal.users[EMAIL] = {'consortia': ['smaht'], 'submits_for': [{'identifier': 'sc1'}]}
    assert _run([_row(EMAIL, sc=f'{uuid},old_alias', submitter='Yes')], tmp_path, monkeypatch) == 0
    assert portal.patches == []
    assert portal.gets.count(f'/submission-centers/{uuid}') == 1


def test_uuid_without_identifier_fails_closed(portal, tmp_path, monkeypatch):
    uuid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    portal.links[f'/submission-centers/{uuid}'] = {'@id': f'/submission-centers/{uuid}/'}
    portal.users[EMAIL] = {'consortia': ['smaht'], 'submits_for': [uuid]}
    assert _run([_row(EMAIL, sc='sc1', submitter='Yes')], tmp_path, monkeypatch) == 1
    assert portal.patches == []


@pytest.mark.parametrize('linked', [{}, [], {'identifier': ''}, {'identifier': '   '}])
def test_invalid_preflight_link_response_cannot_produce_empty_links(linked, portal, tmp_path, monkeypatch):
    portal.links['/submission-centers/sc1'] = linked
    with pytest.raises(command.UserCSVProcessorException, match='Missing identifier'):
        _run([_row(EMAIL, sc='sc1')], tmp_path, monkeypatch, '--create-new')
    assert portal.posts == portal.patches == []


def test_link_cache_initializes_for_direct_processor_use():
    processor = _processor()
    assert processor._cache_link('submission-centers', 'alias', {'identifier': ' sc1 '}) == 'sc1'
    assert processor._linked_identifier('alias', 'submission-centers') == 'sc1'


def test_update_all_omits_unchanged_fields(portal, tmp_path, monkeypatch):
    portal.users[EMAIL] = {'consortia': ['smaht'], 'submits_for': ['sc1'], 'groups': ['admin', 'dbgap']}
    row = _row(EMAIL, sc='sc1', submitter='', dua='', associate='')
    assert _run([row], tmp_path, monkeypatch, '--update-all') == 0
    assert portal.patches == [({}, '')]
    row[3] = 'No'
    assert _run([row], tmp_path, monkeypatch) == 0
    assert portal.patches[-1] == ({'groups': ['admin']}, '')


@pytest.mark.parametrize('verb,status', [('POST', 201), ('PATCH', 200)])
def test_http_write_adapters_preserve_body_and_validation_parameters(verb, status, monkeypatch):
    attempts = []

    def request(url, **kwargs):
        attempts.append((url, kwargs))
        response = Response()
        response.status_code = status
        response._content = b'{"status": "success"}'
        return response

    monkeypatch.setitem(command.ff_utils.REQUESTS_VERBS, verb, request)
    key = {'server': 'https://portal.invalid/', 'key': 'fixture', 'secret': 'fixture'}
    helper = command.post_metadata if verb == 'POST' else command.patch_metadata
    assert helper({'consortia': ['smaht']}, '/users', key,
                  add_on='?check_only=true&delete_fields=groups') == {'status': 'success'}
    assert len(attempts) == 1
    url, kwargs = attempts[0]
    assert url == 'https://portal.invalid/users?check_only=true&delete_fields=groups'
    assert json.loads(kwargs['data']) == {'consortia': ['smaht']}


def test_initialization_uses_only_requested_environment(monkeypatch):
    from types import SimpleNamespace
    requested = []
    monkeypatch.setattr(command, 'SMaHTKeyManager', lambda: SimpleNamespace(
        get_keydict_for_env=lambda env: requested.append(env) or {'fixture': True}))
    processor = command.UserCSVProcessor(env='fixture')
    assert requested == ['fixture']
    assert processor.key == {'fixture': True}
    assert processor.user_dict == {} and processor.submission_centers == []
    assert processor.verbose is False and processor.validate_only is False


def test_cancel_before_loading_credentials(monkeypatch):
    monkeypatch.setattr('builtins.input', lambda: 'n')
    with pytest.raises(SystemExit) as exit_info:
        command.main(['fixture.csv', '--create-new'])
    assert exit_info.value.code == 0


def test_cancel_batch_before_any_mutation(portal, tmp_path, monkeypatch):
    path = tmp_path / 'users.csv'
    with path.open('w', newline='') as stream:
        csv.writer(stream).writerows([_row('Email'), _row(EMAIL)])
    monkeypatch.setattr('builtins.input', lambda: 'n')
    args = command.build_arg_parser().parse_args([str(path), '--create-new'])
    assert _processor(key={}).main(args) == 0
    assert portal.posts == portal.patches == []
