"""Tests for the load-users-from-oc command.

`UserCSVProcessor.__init__` talks to `SMaHTKeyManager` for real portal credentials, so
every test here builds instances via `UserCSVProcessor.__new__(...)` and sets only the
attributes it needs, never invoking `__init__`. The only external boundary this command
has is `dcicutils.ff_utils` (post/patch/get metadata calls), which is monkeypatched
through the `load_users_from_oc` module reference. No test here contacts the portal.
"""

from types import SimpleNamespace

import pytest

from ..commands import load_users_from_oc as load_users_from_oc_command
from ..commands.load_users_from_oc import User, UserCSVProcessor

pytestmark = [pytest.mark.unit, pytest.mark.working]


def _row(email, last='Last', first='First', dua='No', sc='dac', submitter='No', revoked='No'):
    """ Builds a 10-column CSV row matching the format documented at the top of
        load_users_from_oc.py (indices 0-9). """
    return ['affiliation', last, first, dua, email, 'pi', 'grant', sc, submitter, revoked]


def _processor(**attrs):
    processor = UserCSVProcessor.__new__(UserCSVProcessor)
    processor.submission_centers = []
    processor.user_dict = {}
    processor.validate_only = False
    for name, value in attrs.items():
        setattr(processor, name, value)
    return processor


# ---------------------------------------------------------------------------------
# generate_users - duplicate email handling
# ---------------------------------------------------------------------------------

def test_generate_users_no_duplicates_baseline():
    processor = _processor()
    rows = [_row('alice@x.com'), _row('bob@x.com'), _row('carol@x.com')]

    result = processor.generate_users(rows)

    assert set(result.keys()) == {'alice@x.com', 'bob@x.com', 'carol@x.com'}
    alice = result['alice@x.com']
    assert isinstance(alice, User)
    assert alice.email == 'alice@x.com'
    assert alice.first_name == 'First'
    assert alice.last_name == 'Last'


def test_generate_users_duplicate_email_warns_and_excludes_both_rows(capsys):
    processor = _processor()
    rows = [_row('alice@x.com'), _row('bob@x.com'), _row('alice@x.com')]  # rows 2, 3, 4

    result = processor.generate_users(rows)

    assert 'alice@x.com' not in result
    assert set(result.keys()) == {'bob@x.com'}
    out = capsys.readouterr().out
    assert 'alice@x.com' in out
    assert 'row 2' in out
    assert 'row 4' in out


def test_generate_users_third_occurrence_of_duplicate_also_excluded(capsys):
    processor = _processor()
    rows = [_row('alice@x.com'), _row('bob@x.com'), _row('alice@x.com'), _row('alice@x.com')]

    result = processor.generate_users(rows)

    assert 'alice@x.com' not in result
    assert set(result.keys()) == {'bob@x.com'}
    out = capsys.readouterr().out
    assert out.count('alice@x.com') == 2  # one warning for row 4, one for row 5


def test_generate_users_duplicate_does_not_abort_subsequent_unique_rows():
    processor = _processor()
    rows = [_row('alice@x.com'), _row('alice@x.com'), _row('carol@x.com'), _row('dave@x.com')]

    result = processor.generate_users(rows)

    assert set(result.keys()) == {'carol@x.com', 'dave@x.com'}


def test_generate_users_ignores_revoked_users_and_duplicates_among_revoked(capsys):
    processor = _processor()
    rows = [_row('alice@x.com'), _row('alice@x.com', revoked='Yes')]

    result = processor.generate_users(rows)

    assert set(result.keys()) == {'alice@x.com'}
    assert 'WARNING' not in capsys.readouterr().out


def test_generate_users_does_not_raise_exception():
    processor = _processor()
    rows = [_row('alice@x.com'), _row('alice@x.com')]

    # previously this raised UserCSVProcessorException - must no longer do so
    processor.generate_users(rows)


# ---------------------------------------------------------------------------------
# post_users_to_portal - failure isolation, URL fix, validate-only
# ---------------------------------------------------------------------------------

def _user(email):
    return User(first_name='First', last_name='Last', dua_status='No', email=email,
                submission_center='dac', submits_for='No')


def test_post_users_to_portal_continues_past_failed_user_and_counts_correctly(monkeypatch, capsys):
    processor = _processor(user_dict={
        'alice@x.com': _user('alice@x.com'),
        'bob@x.com': _user('bob@x.com'),
        'carol@x.com': _user('carol@x.com'),
    }, key={})
    attempted = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        attempted.append(post_body['email'])
        if post_body['email'] == 'bob@x.com':
            raise Exception('Bad status code for POST request: 502')

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    number_updated, number_failed = processor.post_users_to_portal()

    assert attempted == ['alice@x.com', 'bob@x.com', 'carol@x.com']  # all 3 attempted, not aborted at bob
    assert (number_updated, number_failed) == (2, 1)
    out = capsys.readouterr().out
    assert 'bob@x.com' in out
    assert 'Exiting' not in out


def test_post_users_to_portal_calls_post_metadata_without_leading_slash(monkeypatch):
    processor = _processor(user_dict={'alice@x.com': _user('alice@x.com')}, key={})
    calls = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        calls.append(schema_name)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    processor.post_users_to_portal()

    assert calls == ['User']


def test_post_users_to_portal_validate_only_passes_check_only_add_on(monkeypatch):
    processor = _processor(user_dict={'alice@x.com': _user('alice@x.com')}, key={}, validate_only=True)
    add_ons = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        add_ons.append(add_on)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    processor.post_users_to_portal()

    assert add_ons == ['?check_only=true']


def test_update_submits_for_continues_past_failed_user(monkeypatch):
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', 'dac', 'Yes'),
        'bob@x.com': User('First', 'Last', 'Yes', 'bob@x.com', 'dac', 'Yes'),
    }, key={})
    attempted = []

    def fake_get_metadata(path, key=None):
        return {'groups': []}

    def fake_patch_metadata(patch_body, obj_id, key=None, add_on=''):
        attempted.append(obj_id)
        if 'alice' in obj_id:
            raise Exception('Bad status code for PATCH request: 502')

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata', fake_patch_metadata)

    number_updated, number_failed = processor.update_submits_for()

    assert len(attempted) == 2  # both users attempted despite alice failing
    assert (number_updated, number_failed) == (1, 1)


# ---------------------------------------------------------------------------------
# main() - validate-only vs real-run summary wording
# ---------------------------------------------------------------------------------

def _main_processor(post_result):
    processor = _processor()
    monkeypatch_targets = {
        'read_csv': lambda self, path: [['header'], _row('alice@x.com')],
        'generate_submission_center_list': lambda self, rows: None,
        'validate_submission_center_list': lambda self: None,
        'generate_users': lambda self, rows: None,
        'ignore_existing_users': lambda self: None,
        'post_users_to_portal': lambda self: post_result,
    }
    for name, fn in monkeypatch_targets.items():
        setattr(processor, name, fn.__get__(processor))
    return processor


def test_main_summary_reports_validate_only_wording(monkeypatch, capsys):
    processor = _main_processor(post_result=(2, 0))
    monkeypatch.setattr('builtins.input', lambda: 'y')
    args = SimpleNamespace(validate_only=True, update=False, csv_file_path='x')

    processor.main(args)

    out = capsys.readouterr().out
    assert 'VALIDATE-ONLY' in out
    assert 'nothing was persisted' in out
    assert 'have been updated on the portal' not in out


def test_main_summary_reports_real_run_wording_and_failure_count(monkeypatch, capsys):
    processor = _main_processor(post_result=(2, 1))
    monkeypatch.setattr('builtins.input', lambda: 'y')
    args = SimpleNamespace(validate_only=False, update=False, csv_file_path='x')

    processor.main(args)

    out = capsys.readouterr().out
    assert '2 users have been updated on the portal' in out
    assert 'WARNING' in out
    assert '1 users failed' in out
