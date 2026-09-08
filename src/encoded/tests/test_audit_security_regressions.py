"""Approved PR 729 audit corrections, without database/network dependencies."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from pyramid.httpexceptions import HTTPForbidden
from pyramid.authentication import RemoteUserAuthenticationPolicy
from pyramid.authorization import ACLAuthorizationPolicy
from pyramid.config import Configurator
from pyramid.renderers import JSON
from pyramid.security import Allow, Everyone
from snovault import AbstractCollection
from webtest import TestApp
from snovault import TYPES
from snovault.resources import Item as SnovaultItem
from webob.multidict import MultiDict

from encoded.browse import browse, protected_donor_search
from encoded.types.protected_donor import is_protected_donor_search
from encoded.types.user import User
from .test_audit_logging import encoded_log_stream, _records  # noqa: F401

ACTOR = "00000000-0000-4000-8000-000000000011"
SUBJECT = "00000000-0000-4000-8000-000000000012"


def request_for(types=()):
    return SimpleNamespace(
        effective_principals=[f"userid.{ACTOR}"],
        params=MultiDict([("type", name) for name in types]),
        has_permission=MagicMock(return_value=True),
        registry={TYPES: {
            "AbstractDonor": SimpleNamespace(subtypes=["Donor", "ProtectedDonor"]),
            "protected_donor": SimpleNamespace(subtypes=["ProtectedDonor"]),
            "File": SimpleNamespace(subtypes=["OutputFile"]),
            "Donor": SimpleNamespace(subtypes=["Donor"]),
        }},
    )


@pytest.mark.parametrize("types,expected", [
    ([], True), (["Item"], True), (["*"], True),
    (["AbstractDonor"], True), (["protected_donor"], True),
    (["File", "AbstractDonor"], True), (["ProtectedDonor"], True),
    (["File"], False), (["Donor"], False), (["NotAType"], False),
])
def test_search_scope_predicate(types, expected):
    assert is_protected_donor_search(None, request_for(types)) is expected


@pytest.mark.parametrize("types", [[], ["Item"], ["*"], ["AbstractDonor"]])
def test_broad_search_preserves_permission_checks_and_audits(types, encoded_log_stream):  # noqa: F811
    request = request_for(types)
    assert is_protected_donor_search(None, request)
    with patch("encoded.browse.search", return_value={"total": 1}) as search:
        assert protected_donor_search(None, request) == {"total": 1}
        search.assert_called_once_with(None, request, forced_type="Search")
        request.has_permission.return_value = False
        with pytest.raises(HTTPForbidden):
            protected_donor_search(None, request)
        assert search.call_count == 1
    assert [r["outcome"] for r in _records(encoded_log_stream)] == ["allowed", "denied"]


@pytest.mark.parametrize('allowed', [True, False])
@pytest.mark.parametrize('query', ['', '?type=File'])
def test_abstract_collection_dispatch_preserves_list_permission(allowed, query, encoded_log_stream):
    registry_types = request_for().registry[TYPES]
    config = Configurator()
    collection = AbstractCollection(
        config.registry, 'abstract-donors',
        SimpleNamespace(name='AbstractDonor'),
        acl=[(Allow, Everyone, 'list' if allowed else 'search')],
    )
    collection.__parent__ = None
    config.set_root_factory(lambda request: {'abstract-donors': collection})
    config.set_authentication_policy(RemoteUserAuthenticationPolicy())
    config.set_authorization_policy(ACLAuthorizationPolicy())
    config.add_renderer(None, JSON())
    config.registry[TYPES] = registry_types
    config.include('snovault.search.search')
    config.include('encoded.browse')
    app = TestApp(config.make_wsgi_app())
    with patch('encoded.browse.search', return_value={'total': 1}) as search:
        response = app.get('/abstract-donors/' + query, status=200 if allowed else 403)
    if allowed:
        assert response.json == {'total': 1}
        context, forwarded_request = search.call_args.args
        assert context is collection
        assert forwarded_request.effective_principals == [Everyone]
        assert search.call_args.kwargs == {
            'search_type': 'AbstractDonor', 'return_generator': False, 'forced_type': 'Search',
        }
    else:
        search.assert_not_called()
    record, = _records(encoded_log_stream)
    assert record['outcome'] == ('allowed' if allowed else 'denied')
    assert record['result_count'] == (1 if allowed else 0)


def test_browse_uses_its_actual_type_not_search_default(encoded_log_stream):  # noqa: F811
    with patch("encoded.browse.search", return_value={"total": 3}):
        browse(None, request_for())  # File by default, not Item.
        browse(None, request_for(["AbstractDonor", "File"]))  # MultiDict.get uses the last type.
        assert _records(encoded_log_stream) == []
        browse(None, request_for(["AbstractDonor"]))
    assert len(_records(encoded_log_stream)) == 1


@pytest.mark.parametrize("groups", [[], ["admin", "read-protected-donor"]])
def test_creation_audits_initial_persisted_grants(groups, encoded_log_stream):  # noqa: F811
    item = SimpleNamespace(properties={"groups": groups}, uuid=SUBJECT)
    with patch.object(SnovaultItem, "create", return_value=item), \
            patch("encoded.types.user.get_current_request", return_value=request_for()):
        assert User.create({}, SUBJECT, {"email": "private@example.invalid"}) is item
    records = _records(encoded_log_stream)
    if groups:
        assert len(records) == 1
        assert records[0]["action"] == "user_group_grant"
        assert records[0]["granted_groups"] == groups
        assert records[0]["user_uuid"] == ACTOR
        assert records[0]["subject_uuid"] == SUBJECT
    else:
        assert not records
    assert "private@example.invalid" not in encoded_log_stream.getvalue()


def test_failed_creation_does_not_audit_grants(encoded_log_stream):  # noqa: F811
    with patch.object(SnovaultItem, "create", side_effect=ValueError("failed")):
        with pytest.raises(ValueError):
            User.create({}, SUBJECT, {"groups": ["admin"]})
    assert not _records(encoded_log_stream)


@pytest.mark.parametrize("replacement", [{}, {"groups": []}])
def test_omitted_or_empty_groups_revoke_all_on_replacement(replacement, encoded_log_stream):  # noqa: F811
    user = object.__new__(User)
    user.model = SimpleNamespace(properties={"groups": ["admin"]}, uuid=SUBJECT)

    def persist(properties, sheets):
        user.model.properties = properties.copy()

    with patch.object(SnovaultItem, "update", side_effect=persist), \
            patch("encoded.types.user.get_current_request", return_value=request_for()):
        user.update(replacement)
    record, = _records(encoded_log_stream)
    assert record["action"] == "user_group_revoke"
    assert record["revoked_groups"] == ["admin"]
    assert record["changes"] == {"groups": {"before": ["admin"], "after": []}}
    assert record["user_uuid"] == ACTOR
    assert record["subject_uuid"] == SUBJECT


def test_failed_update_does_not_audit_revocations(encoded_log_stream):  # noqa: F811
    user = object.__new__(User)
    user.model = SimpleNamespace(properties={"groups": ["admin"]}, uuid=SUBJECT)
    with patch.object(SnovaultItem, "update", side_effect=ValueError("failed")):
        with pytest.raises(ValueError):
            user.update({})
    assert not _records(encoded_log_stream)
