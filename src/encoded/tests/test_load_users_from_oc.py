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


def _row(email, last='Last', first='First', dua='No', sc='dac', submitter='No', revoked='No', associate='No'):
    """ Builds an 11-column CSV row matching the format documented at the top of
        load_users_from_oc.py (indices 0-10). """
    return ['affiliation', last, first, dua, email, 'pi', 'grant', sc, submitter, revoked, associate]


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
# build_user_from_row - Associate Network Member column
# ---------------------------------------------------------------------------------

def test_build_user_from_row_reads_associate_flag():
    processor = _processor()

    user = processor.build_user_from_row(_row('alice@x.com', associate='Yes'))

    assert user.is_associate == 'Yes'


def test_build_user_from_row_defaults_is_associate_for_short_row():
    processor = _processor()
    short_row = _row('alice@x.com')[:10]  # no 11th (Associate Network Member) column

    user = processor.build_user_from_row(short_row)

    assert user.is_associate == ''


# ---------------------------------------------------------------------------------
# generate_submission_center_list - blank DAC code handling
# ---------------------------------------------------------------------------------

def test_generate_submission_center_list_ignores_blank_dac_code():
    processor = _processor()
    rows = [_row('alice@x.com', sc='dac'), _row('bob@x.com', sc='')]

    processor.generate_submission_center_list(rows)

    assert '' not in processor.submission_centers
    assert processor.submission_centers == ['dac']


# ---------------------------------------------------------------------------------
# post_users_to_portal - failure isolation, URL fix, validate-only
# ---------------------------------------------------------------------------------

def _user(email, submission_center='dac', is_associate='No'):
    return User(first_name='First', last_name='Last', dua_status='No', email=email,
                submission_center=submission_center, submits_for='No', is_associate=is_associate)


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


def test_post_users_to_portal_calls_post_metadata_with_correct_collection_name(monkeypatch):
    processor = _processor(user_dict={'alice@x.com': _user('alice@x.com')}, key={})
    calls = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        calls.append(schema_name)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    processor.post_users_to_portal()

    assert calls == ['users']


def test_post_users_to_portal_validate_only_passes_check_only_add_on(monkeypatch):
    processor = _processor(user_dict={'alice@x.com': _user('alice@x.com')}, key={}, validate_only=True)
    add_ons = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        add_ons.append(add_on)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    processor.post_users_to_portal()

    assert add_ons == ['?check_only=true']


def test_post_users_to_portal_omits_submission_centers_for_blank_dac_code(monkeypatch):
    processor = _processor(
        user_dict={'alice@x.com': _user('alice@x.com', submission_center='')}, key={})
    captured = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        captured.append(post_body)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    number_updated, number_failed = processor.post_users_to_portal()

    assert (number_updated, number_failed) == (1, 0)
    assert 'submission_centers' not in captured[0]
    assert 'submits_for' not in captured[0]


def test_post_users_to_portal_still_sets_submission_centers_when_present(monkeypatch):
    processor = _processor(user_dict={'alice@x.com': _user('alice@x.com')}, key={})
    captured = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        captured.append(post_body)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    processor.post_users_to_portal()

    assert captured[0]['submission_centers'] == ['smaht_dac']


def test_post_users_to_portal_sets_associate_consortium(monkeypatch):
    processor = _processor(
        user_dict={'alice@x.com': _user('alice@x.com', is_associate='Yes')}, key={})
    captured = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        captured.append(post_body)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    processor.post_users_to_portal()

    assert captured[0]['consortia'] == ['smaht_associate']


def test_post_users_to_portal_sets_default_consortium_for_non_associate(monkeypatch):
    processor = _processor(user_dict={'alice@x.com': _user('alice@x.com')}, key={})
    captured = []

    def fake_post_metadata(post_body, schema_name, key=None, add_on=''):
        captured.append(post_body)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'post_metadata', fake_post_metadata)

    processor.post_users_to_portal()

    assert captured[0]['consortia'] == ['smaht']


def test_update_submits_for_omits_submits_for_for_blank_dac_code(monkeypatch):
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', '', 'Yes'),
    }, key={})
    captured = []

    def fake_get_metadata(path, key=None):
        return {'groups': []}

    def fake_patch_metadata(patch_body, obj_id, key=None, add_on=''):
        captured.append(patch_body)

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata', fake_patch_metadata)

    number_updated, number_failed, number_unchanged = processor.update_submits_for()

    assert (number_updated, number_failed, number_unchanged) == (1, 0, 0)
    assert 'submits_for' not in captured[0]


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

    number_updated, number_failed, number_unchanged = processor.update_submits_for()

    assert len(attempted) == 2  # both users attempted despite alice failing
    assert (number_updated, number_failed, number_unchanged) == (1, 1, 0)


# ---------------------------------------------------------------------------------
# update_submits_for - --update-changed (only_if_changed) behavior
# ---------------------------------------------------------------------------------

def test_normalize_linked_item_handles_dict_and_path_and_bare_string():
    normalize = UserCSVProcessor._normalize_linked_item

    assert normalize({'identifier': 'smaht_dac', '@id': '/submission-centers/uuid-1/'}) == 'smaht_dac'
    assert normalize('/submission-centers/smaht_dac/') == 'smaht_dac'
    assert normalize('smaht_dac') == 'smaht_dac'


def test_update_submits_for_patches_consortia_for_associate_members(monkeypatch):
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', 'dac', 'Yes', 'Yes'),
    }, key={})
    captured = []

    def fake_get_metadata(path, key=None):
        return {'groups': ['dbgap'], 'submits_for': [{'identifier': 'smaht_dac'}],
                'consortia': [{'identifier': 'smaht'}]}  # wrong - should be smaht_associate

    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata',
                        lambda body, *a, **kw: captured.append(body))

    processor.update_submits_for()

    assert captured[0]['consortia'] == ['smaht_associate']


def test_update_submits_for_only_if_changed_skips_matching_user(monkeypatch):
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', 'dac', 'Yes'),
    }, key={})

    def fake_get_metadata(path, key=None):
        return {'groups': ['dbgap'], 'submits_for': [{'identifier': 'smaht_dac'}],
                'consortia': [{'identifier': 'smaht'}]}

    patched = []
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata',
                        lambda *a, **kw: patched.append(a))

    number_updated, number_failed, number_unchanged = processor.update_submits_for(only_if_changed=True)

    assert patched == []
    assert (number_updated, number_failed, number_unchanged) == (0, 0, 1)


def test_update_submits_for_only_if_changed_patches_when_submits_for_differs(monkeypatch):
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', 'dac', 'Yes'),
    }, key={})

    def fake_get_metadata(path, key=None):
        return {'groups': ['dbgap'], 'submits_for': [{'identifier': 'some_other_center'}],
                'consortia': [{'identifier': 'smaht'}]}

    patched = []
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata',
                        lambda *a, **kw: patched.append(a))

    number_updated, number_failed, number_unchanged = processor.update_submits_for(only_if_changed=True)

    assert len(patched) == 1
    assert (number_updated, number_failed, number_unchanged) == (1, 0, 0)


def test_update_submits_for_only_if_changed_patches_when_groups_differ(monkeypatch):
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', 'dac', 'Yes'),
    }, key={})

    def fake_get_metadata(path, key=None):
        return {'groups': [], 'submits_for': [{'identifier': 'smaht_dac'}],  # missing 'dbgap'
                'consortia': [{'identifier': 'smaht'}]}

    patched = []
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata',
                        lambda *a, **kw: patched.append(a))

    number_updated, number_failed, number_unchanged = processor.update_submits_for(only_if_changed=True)

    assert len(patched) == 1
    assert (number_updated, number_failed, number_unchanged) == (1, 0, 0)


def test_update_submits_for_only_if_changed_patches_when_only_consortia_differs(monkeypatch):
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', 'dac', 'Yes', 'Yes'),
    }, key={})

    def fake_get_metadata(path, key=None):
        return {'groups': ['dbgap'], 'submits_for': [{'identifier': 'smaht_dac'}],
                'consortia': [{'identifier': 'smaht'}]}  # wrong - should be smaht_associate

    patched = []
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata',
                        lambda *a, **kw: patched.append(a))

    number_updated, number_failed, number_unchanged = processor.update_submits_for(only_if_changed=True)

    assert len(patched) == 1
    assert (number_updated, number_failed, number_unchanged) == (1, 0, 0)


def test_update_submits_for_default_still_patches_unconditionally(monkeypatch):
    """ Plain --update (only_if_changed=False) must keep patching even when nothing changed. """
    processor = _processor(user_dict={
        'alice@x.com': User('First', 'Last', 'Yes', 'alice@x.com', 'dac', 'Yes'),
    }, key={})

    def fake_get_metadata(path, key=None):
        return {'groups': ['dbgap'], 'submits_for': [{'identifier': 'smaht_dac'}]}

    patched = []
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'get_metadata', fake_get_metadata)
    monkeypatch.setattr(load_users_from_oc_command.ff_utils, 'patch_metadata',
                        lambda *a, **kw: patched.append(a))

    number_updated, number_failed, number_unchanged = processor.update_submits_for()

    assert len(patched) == 1
    assert (number_updated, number_failed, number_unchanged) == (1, 0, 0)


# ---------------------------------------------------------------------------------
# main() - validate-only vs real-run summary wording
# ---------------------------------------------------------------------------------

def _main_processor(post_result):
    processor = _processor()
    monkeypatch_targets = {
        'read_csv': lambda self, path: [['header'], _row('alice@x.com')],
        'generate_submission_center_list': lambda self, rows: None,
        'validate_submission_center_list': lambda self: None,
        'validate_consortium_list': lambda self: None,
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
    args = SimpleNamespace(validate_only=True, create_new=True, update_changed=False, csv_file_path='x')

    processor.main(args)

    out = capsys.readouterr().out
    assert 'VALIDATE-ONLY' in out
    assert 'nothing was persisted' in out
    assert 'have been updated on the portal' not in out


def test_main_summary_reports_real_run_wording_and_failure_count(monkeypatch, capsys):
    processor = _main_processor(post_result=(2, 1))
    monkeypatch.setattr('builtins.input', lambda: 'y')
    args = SimpleNamespace(validate_only=False, create_new=True, update_changed=False, csv_file_path='x')

    processor.main(args)

    out = capsys.readouterr().out
    assert '2 users have been updated on the portal' in out
    assert 'WARNING' in out
    assert '1 users failed' in out


def test_main_update_changed_flag_calls_update_submits_for_with_only_if_changed_true(monkeypatch, capsys):
    processor = _processor()
    calls = []
    monkeypatch_targets = {
        'read_csv': lambda self, path: [['header'], _row('alice@x.com')],
        'generate_submission_center_list': lambda self, rows: None,
        'validate_submission_center_list': lambda self: None,
        'validate_consortium_list': lambda self: None,
        'generate_users': lambda self, rows: None,
        'update_submits_for': lambda self, only_if_changed=False: (calls.append(only_if_changed) or (1, 0, 0)),
    }
    for name, fn in monkeypatch_targets.items():
        setattr(processor, name, fn.__get__(processor))
    monkeypatch.setattr('builtins.input', lambda: 'y')
    args = SimpleNamespace(validate_only=False, create_new=False, update_changed=True, csv_file_path='x')

    processor.main(args)

    assert calls == [True]


# ---------------------------------------------------------------------------------
# build_arg_parser - required, mutually exclusive mode flags
# ---------------------------------------------------------------------------------

def test_build_arg_parser_requires_one_mode_flag():
    parser = load_users_from_oc_command.build_arg_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(['file.csv'])


def test_build_arg_parser_rejects_multiple_mode_flags():
    parser = load_users_from_oc_command.build_arg_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(['file.csv', '--create-new', '--update-all'])


@pytest.mark.parametrize('flag,attr', [
    ('--create-new', 'create_new'),
    ('--update-all', 'update_all'),
    ('--update-changed', 'update_changed'),
])
def test_build_arg_parser_accepts_each_mode_flag(flag, attr):
    parser = load_users_from_oc_command.build_arg_parser()

    args = parser.parse_args(['file.csv', flag])

    assert getattr(args, attr) is True
    other_attrs = {'create_new', 'update_all', 'update_changed'} - {attr}
    for other in other_attrs:
        assert getattr(args, other) is False
