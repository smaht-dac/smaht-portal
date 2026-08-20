import io
import json
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from pyramid.config import Configurator
from pyramid.httpexceptions import HTTPForbidden, HTTPTemporaryRedirect
from webob.multidict import MultiDict

from snovault.types.access_key import AccessKey as SnovaultAccessKey
from snovault.resources import Item as SnovaultItem

from ..audit_logging import authenticated_actor_fields, result_subject_uuid
from ..browse import browse, protected_donor_search
from ..logging_config import _configure_structlog, make_console_formatter
from ..types.access_key import AccessKey, access_key_add, access_key_reset_secret
from ..types.file import download, download_cli
from ..types.protected_donor import protected_donor_item_view
from ..types.user import User, user_add


@pytest.fixture
def encoded_log_stream():
    """Capture the same parent logger used by the production encoded handler."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(make_console_formatter())
    logger_names = [
        "encoded",
        "encoded.authentication",
        "encoded.browse",
        "encoded.types.access_key",
        "encoded.types.file",
        "encoded.types.protected_donor",
        "encoded.types.user",
    ]
    loggers = [logging.getLogger(name) for name in logger_names]
    previous = [
        (list(logger.handlers), logger.level, logger.propagate)
        for logger in loggers
    ]

    encoded_logger = loggers[0]
    encoded_logger.handlers[:] = [handler]
    encoded_logger.setLevel(logging.WARNING)
    encoded_logger.propagate = False
    for logger in loggers[1:]:
        logger.handlers[:] = []
        logger.setLevel(logging.NOTSET)
        logger.propagate = True

    try:
        _configure_structlog(in_prod=True)
        yield stream
    finally:
        for logger, state in zip(loggers, previous):
            handlers, level, propagate = state
            logger.handlers[:] = handlers
            logger.setLevel(level)
            logger.propagate = propagate
        handler.close()


def _records(stream):
    return [json.loads(line) for line in stream.getvalue().splitlines() if line]


class SyntheticRegistry(dict):
    def __init__(self):
        super().__init__(aws_ipset={"198.51.100.10"})
        self.settings = {}


def test_actor_uuid_requires_one_canonical_uuid_principal():
    actor_uuid = "00000000-0000-4000-8000-000000000001"
    assert authenticated_actor_fields(SimpleNamespace(
        effective_principals=["system.Everyone", f"userid.{actor_uuid}"]
    )) == {"user_uuid": actor_uuid}
    assert authenticated_actor_fields(SimpleNamespace(
        effective_principals=["system.Everyone", "userid.not-a-uuid"]
    )) == {}
    assert authenticated_actor_fields(SimpleNamespace(
        effective_principals=["system.Everyone"]
    )) == {}
    assert result_subject_uuid({
        "@graph": ["/users/00000000-0000-4000-8000-000000000017/"]
    }) == "00000000-0000-4000-8000-000000000017"


def test_protected_donor_views_load_in_application_order():
    """The always-scanned type module must not require the late search route."""
    type_config = Configurator(settings={"testing": True})
    for module in (
        "snovault.calculated",
        "snovault.config",
        "snovault.typeinfo",
        "snovault.resources",
        "snovault.util",
        "snovault.server_defaults",
    ):
        type_config.include(module)
    type_config.scan("encoded.types.protected_donor")
    type_config.commit()
    type_views = [dict(item["introspectable"]) for item in type_config.introspector.get_category("views")]
    assert any(view.get("callable") is protected_donor_item_view for view in type_views)

    search_config = Configurator(settings={"testing": True})
    search_config.include("snovault.search.search")
    search_config.include("encoded.browse")
    search_config.commit()
    search_views = [
        dict(item["introspectable"])
        for item in search_config.introspector.get_category("views")
    ]
    assert any(
        view.get("route_name") == "search"
        and view.get("callable") is protected_donor_search
        for view in search_views
    )


def test_access_key_audit_events_include_actor_uuid_without_secrets(encoded_log_stream):
    create_result = {
        "access_key_id": "synthetic-access-key-id",
        "secret_access_key": "synthetic-create-secret",
    }
    reset_result = {
        "access_key_id": "synthetic-access-key-id",
        "secret_access_key": "synthetic-reset-secret",
    }

    actor_uuid = "00000000-0000-4000-8000-000000000002"
    request = SimpleNamespace(effective_principals=[f"userid.{actor_uuid}"])
    with patch("encoded.types.access_key.sno_access_key_add", return_value=create_result):
        assert access_key_add(MagicMock(), request) == create_result
    with patch("encoded.types.access_key.sno_access_key_reset_secret", return_value=reset_result):
        assert access_key_reset_secret(MagicMock(), request) == reset_result

    model = MagicMock(properties={"status": "current"})
    access_key = object.__new__(AccessKey)
    access_key.model = model
    with patch("encoded.types.access_key.get_current_request", return_value=request), \
            patch.object(SnovaultAccessKey, "update", return_value=None):
        access_key.update({"status": "deleted"})

    records = _records(encoded_log_stream)
    assert [(record["action"], record["outcome"]) for record in records] == [
        ("access_key_create", "success"),
        ("access_key_reset", "success"),
        ("access_key_revoke", "success"),
    ]
    assert all(record["event_type"] == "access_key" for record in records)
    assert all(record["user_uuid"] == actor_uuid for record in records)
    output = encoded_log_stream.getvalue()
    assert "synthetic-access-key-id" not in output
    assert "synthetic-create-secret" not in output
    assert "synthetic-reset-secret" not in output


def test_protected_donor_search_audit_omits_query_and_filter_values(encoded_log_stream):
    actor_uuid = "00000000-0000-4000-8000-000000000004"
    request = SimpleNamespace(
        effective_principals=[f"userid.{actor_uuid}"],
        params=MultiDict([
            ("type", "ProtectedDonor"),
            ("external_id", "synthetic-filter-value"),
        ]),
        has_permission=MagicMock(return_value=True),
    )
    result = {"total": 2, "@graph": [{"uuid": "synthetic-record"}]}
    with patch("encoded.browse.search", return_value=result):
        assert protected_donor_search(MagicMock(), request) == result

    browse_request = SimpleNamespace(
        effective_principals=[f"userid.{actor_uuid}"],
        params=MultiDict([
            ("type", "ProtectedDonor"),
            ("status", "synthetic-status-filter"),
        ]),
    )
    with patch("encoded.browse.search", return_value={"total": 3, "@graph": []}):
        browse(MagicMock(), browse_request)

    records = _records(encoded_log_stream)
    assert [(record["action"], record["outcome"], record["result_count"]) for record in records] == [
        ("protected_donor_search", "allowed", 2),
        ("protected_donor_search", "allowed", 3),
    ]
    assert all(record["event_type"] == "protected_donor_access" for record in records)
    assert all(record["user_uuid"] == actor_uuid for record in records)
    output = encoded_log_stream.getvalue()
    assert "synthetic-filter-value" not in output
    assert "synthetic-status-filter" not in output
    assert "synthetic-record" not in output


def test_protected_donor_search_and_record_denials_are_audited(encoded_log_stream):
    actor_uuid = "00000000-0000-4000-8000-000000000005"
    search_request = SimpleNamespace(
        effective_principals=[f"userid.{actor_uuid}"],
        params=MultiDict([( "type", "ProtectedDonor")]),
        has_permission=MagicMock(return_value=False),
    )
    with pytest.raises(HTTPForbidden):
        protected_donor_search(MagicMock(), search_request)

    record_uuid = "00000000-0000-4000-8000-000000000006"
    record_request = SimpleNamespace(
        effective_principals=[f"userid.{actor_uuid}"],
        has_permission=MagicMock(return_value=False),
    )
    with pytest.raises(HTTPForbidden):
        protected_donor_item_view(SimpleNamespace(uuid=record_uuid), record_request)

    records = _records(encoded_log_stream)
    assert [(record["action"], record["outcome"]) for record in records] == [
        ("protected_donor_search", "denied"),
        ("protected_donor_record_access", "denied"),
    ]
    assert records[0]["result_count"] == 0
    assert records[1]["target_uuid"] == record_uuid
    assert all(record["user_uuid"] == actor_uuid for record in records)


def test_protected_donor_allowed_record_access_has_target_uuid(encoded_log_stream):
    actor_uuid = "00000000-0000-4000-8000-000000000007"
    record_uuid = "00000000-0000-4000-8000-000000000008"
    request = SimpleNamespace(
        effective_principals=[f"userid.{actor_uuid}"],
        has_permission=MagicMock(return_value=True),
    )
    with patch("encoded.types.protected_donor.sno_item_view", return_value={"safe": True}):
        assert protected_donor_item_view(SimpleNamespace(uuid=record_uuid), request) == {"safe": True}
    record = _records(encoded_log_stream)[0]
    assert record["action"] == "protected_donor_record_access"
    assert record["outcome"] == "allowed"
    assert record["target_uuid"] == record_uuid
    assert record["user_uuid"] == actor_uuid


def test_user_account_creation_distinguishes_actor_and_subject(encoded_log_stream):
    actor_uuid = "00000000-0000-4000-8000-000000000009"
    subject_uuid = "00000000-0000-4000-8000-000000000010"
    request = SimpleNamespace(effective_principals=[f"userid.{actor_uuid}"])
    result = {
        "status": "success",
        "@graph": [{"uuid": subject_uuid, "email": "synthetic-user@example.invalid"}],
    }
    with patch("encoded.types.user.SnoUserAdd", return_value=result):
        assert user_add(MagicMock(), request) == result
    record = _records(encoded_log_stream)[0]
    assert record["action"] == "user_account_create"
    assert record["outcome"] == "success"
    assert record["user_uuid"] == actor_uuid
    assert record["subject_uuid"] == subject_uuid
    assert "synthetic-user@example.invalid" not in encoded_log_stream.getvalue()


def test_user_security_field_changes_have_safe_deltas_and_group_semantics(encoded_log_stream):
    actor_uuid = "00000000-0000-4000-8000-000000000011"
    subject_uuid = "00000000-0000-4000-8000-000000000012"
    old_center = "00000000-0000-4000-8000-000000000013"
    new_center = "00000000-0000-4000-8000-000000000014"
    old_submission = "00000000-0000-4000-8000-000000000015"
    new_submission = "00000000-0000-4000-8000-000000000016"
    request = SimpleNamespace(effective_principals=[f"userid.{actor_uuid}"])
    user = object.__new__(User)
    user.model = SimpleNamespace(
        properties={
            "email": "synthetic-subject@example.invalid",
            "status": "inactive",
            "groups": ["group.viewer"],
            "submits_for": [old_submission],
            "submission_centers": [old_center],
        },
        uuid=subject_uuid,
    )
    update = {
        "status": "current",
        "groups": ["group.admin"],
        "submits_for": [new_submission],
        "submission_centers": [new_center],
        "email": "synthetic-updated@example.invalid",
    }
    with patch("encoded.types.user.get_current_request", return_value=request), \
            patch.object(SnovaultItem, "update", return_value=None):
        user.update(update)

    records = _records(encoded_log_stream)
    assert [record["action"] for record in records] == [
        "user_record_change",
        "user_group_grant",
        "user_group_revoke",
    ]
    record = records[0]
    assert record["user_uuid"] == actor_uuid
    assert record["subject_uuid"] == subject_uuid
    assert record["changed_fields"] == [
        "status", "groups", "submits_for", "submission_centers", "email"
    ]
    assert record["changes"]["status"] == {"before": "inactive", "after": "current"}
    assert record["changes"]["groups"] == {
        "before": ["group.viewer"],
        "after": ["group.admin"],
    }
    assert record["changes"]["submits_for"] == {"before": [old_submission], "after": [new_submission]}
    assert record["changes"]["submission_centers"] == {
        "before": [old_center],
        "after": [new_center],
    }
    assert records[1]["granted_groups"] == ["group.admin"]
    assert records[2]["revoked_groups"] == ["group.viewer"]
    assert all(record["user_uuid"] == actor_uuid for record in records)
    assert all(record["subject_uuid"] == subject_uuid for record in records)
    output = encoded_log_stream.getvalue()
    assert "synthetic-subject@example.invalid" not in output
    assert "synthetic-updated@example.invalid" not in output


def test_download_audit_events_cover_signed_and_denied_paths(encoded_log_stream):
    request = SimpleNamespace(
        effective_principals=["userid.00000000-0000-4000-8000-000000000003"],
        registry=SyntheticRegistry(),
        client_addr="198.51.100.10",
        user_agent="synthetic-agent",
        remote_addr="198.51.100.11",
        path_info="/files/synthetic-file/@@download",
        headers={"Authorization": "Bearer synthetic-download-token"},
        subpath=(),
        range=None,
        datastore="database",
        params={},
        GET={},
    )
    context = MagicMock()
    context.properties = {"status": "released"}
    context.upgrade_properties.return_value = {
        "filename": "synthetic-download.bam",
        "file_size": 10,
    }
    context.propsheets = {"external": {"service": "s3"}}
    signed_url = "https://s3.example.invalid/synthetic-file?token=synthetic-signed-token"
    context.get_open_data_url_or_presigned_url_location.return_value = signed_url

    with patch("encoded.types.file.check_user_is_logged_in"), \
            patch("encoded.types.file.session_properties", return_value={
                "details": {"uuid": "synthetic-session-user", "groups": ["synthetic-group"]}
            }), \
            patch("encoded.types.file.get_item_or_none", return_value=None), \
            patch("encoded.types.file.is_file_to_download", return_value="synthetic-download.bam"):
        with pytest.raises(HTTPTemporaryRedirect):
            download(context, request)

    with patch("encoded.types.file.CoreDownloadCli", return_value={
        "download_credentials": {"SecretAccessKey": "synthetic-cli-secret"}
    }):
        result = download_cli(context, request)
    assert result["download_credentials"]["SecretAccessKey"] == "synthetic-cli-secret"

    denied_context = MagicMock()
    denied_context.properties = {"status": "protected"}
    denied_request = SimpleNamespace(effective_principals=[])
    with pytest.raises(HTTPForbidden):
        download_cli(denied_context, denied_request)

    records = _records(encoded_log_stream)
    assert (records[0]["action"], records[0]["outcome"]) == ("file_download", "success")
    assert (records[1]["action"], records[1]["outcome"]) == ("file_download_cli", "success")
    assert (records[2]["action"], records[2]["outcome"]) == ("file_download_cli", "failure")
    assert all(record["event_type"] == "file_download" for record in records)
    assert records[0]["user_uuid"] == "00000000-0000-4000-8000-000000000003"
    assert records[1]["user_uuid"] == "00000000-0000-4000-8000-000000000003"
    assert "user_uuid" not in records[2]
    output = encoded_log_stream.getvalue()
    for protected_value in [
        "synthetic-download-token",
        "synthetic-signed-token",
        "synthetic-cli-secret",
        "synthetic-session-user",
        "synthetic-download.bam",
    ]:
        assert protected_value not in output
