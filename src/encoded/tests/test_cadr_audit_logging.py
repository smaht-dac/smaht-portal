"""Behavioral coverage for the NIH CADR audit event schema.

These tests exercise the real builder, the real tween and the real view
functions. They assert what a CADR reviewer needs to be able to trust: that
every line is one parseable JSON object, that the stable names and constants
do not drift, that identity is taken from the verified credential rather than
from whatever cookie happened to arrive, that fields the portal cannot know
are omitted rather than guessed, and that no token, cookie, signature or
presigned-URL parameter ever reaches the log stream.
"""

import io
import json
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import webtest
from pyramid.config import Configurator
from pyramid.httpexceptions import HTTPForbidden, HTTPTemporaryRedirect
from pyramid.request import Request
from pyramid.response import Response
from snovault.resources import Item as SnovaultItem

from .test_audit_logging import encoded_log_stream  # noqa: F401 - pytest fixture
from ..audit_logging import (
    APP_NAME,
    AUDIT_EVENT_FIELDS,
    CADR_NAME,
    EVENT_TYPE_AUTHORIZATION,
    NIH_ICO,
    UNAVAILABLE_CADR_FIELDS,
    AuditFieldError,
    build_audit_event,
    client_ip,
    connection_fields,
    destination_port,
    file_resource_fields,
    identity_fields,
    record_audit_event,
    record_verified_claims,
    study_accession_for_dataset,
)
from ..logging_config import _configure_structlog, make_console_formatter
from ..types.file import FILE_STATUS_AUDIT_EVENTS, File, get_upload, post_upload
from ..types.user import User


ACTOR = "00000000-0000-4000-8000-00000000000a"
RESOURCE = "00000000-0000-4000-8000-00000000000b"

# Strings that must never appear anywhere in the audit stream.
SECRETS = (
    "synthetic-id-token-value",
    "jwtToken=synthetic-cookie-value",
    "Bearer synthetic-id-token-value",
    "X-Amz-Signature=deadbeef",
    "synthetic-recaptcha-secret",
    "synthetic-secret-access-key",
)


def records(stream):
    """Parse the captured stream, proving each event is one JSON line."""
    parsed = []
    for line in stream.getvalue().splitlines():
        assert line.strip(), "audit stream must not contain blank lines"
        parsed.append(json.loads(line))
    return parsed


def assert_no_secrets(stream):
    text = stream.getvalue()
    for secret in SECRETS:
        assert secret not in text
    assert "X-Amz-" not in text
    assert "Signature=" not in text


def request_for(path="/audited", principals=(f"userid.{ACTOR}",), settings=None,
                headers=None, registry=None):
    """A minimal request stand-in for the builder's request-level fields."""
    return SimpleNamespace(
        effective_principals=list(principals),
        path_url=f"http://portal.example.invalid{path}",
        user_agent="synthetic-agent/1.0",
        method="GET",
        remote_addr="10.0.0.9",
        headers=dict(headers or {}),
        registry=registry or SimpleNamespace(settings=dict(settings or {})),
    )


# --------------------------------------------------------------------------
# Field schema, constants and the omission convention
# --------------------------------------------------------------------------

def test_every_event_carries_the_stable_application_constants():
    event = build_audit_event(
        request_for(), "Audited", EVENT_TYPE_AUTHORIZATION, "synthetic_action", "success"
    )["fields"]
    assert event["app"] == APP_NAME == "smaht-portal"
    assert event["nih_ico"] == NIH_ICO == "NIDA"
    assert event["cadr_name"] == CADR_NAME == "SMaHT"
    assert event["event_type"] == EVENT_TYPE_AUTHORIZATION
    assert event["action"] == "synthetic_action"
    assert event["outcome"] == "success"


@pytest.mark.parametrize("bad", [
    {"event_type": "not_a_cadr_family"},
    {"outcome": "probably"},
])
def test_unknown_event_type_or_outcome_is_refused(bad):
    kwargs = {"event_type": EVENT_TYPE_AUTHORIZATION, "action": "a", "outcome": "success"}
    kwargs.update(bad)
    with pytest.raises(AuditFieldError):
        build_audit_event(request_for(), "Audited", **kwargs)


def test_field_outside_the_whitelist_is_refused():
    with pytest.raises(AuditFieldError, match="whitelist"):
        build_audit_event(
            request_for(), "Audited", EVENT_TYPE_AUTHORIZATION, "a", "success",
            **{"raw_authorization_header": "Bearer synthetic-id-token-value"},
        )


def test_fields_the_portal_cannot_know_are_omitted_not_nulled():
    event = build_audit_event(
        request_for(), "Audited", EVENT_TYPE_AUTHORIZATION, "a", "success",
        associated_study=None, resource_accession=None,
    )["fields"]
    for field in UNAVAILABLE_CADR_FIELDS:
        assert field not in event
    assert "associated_study" not in event
    assert "resource_accession" not in event
    assert None not in event.values()


def test_unavailable_fields_are_not_even_in_the_whitelist():
    assert not (UNAVAILABLE_CADR_FIELDS & AUDIT_EVENT_FIELDS)


# --------------------------------------------------------------------------
# Connection fields and the trusted-proxy contract
# --------------------------------------------------------------------------

def test_url_excludes_query_string_and_fragment():
    request = request_for(path="/files/SMAFI1/@@download")
    request.path_url = "http://portal.example.invalid/files/SMAFI1/@@download"
    fields = connection_fields(request)
    assert fields["url"] == "http://portal.example.invalid/files/SMAFI1/@@download"
    assert "?" not in fields["url"] and "#" not in fields["url"]


@pytest.mark.parametrize("hops,forwarded,expected", [
    # One trusted hop (container nginx only): the entry nginx appended.
    (1, "203.0.113.7", "203.0.113.7"),
    (1, "198.51.100.1, 203.0.113.7", "203.0.113.7"),
    # Two trusted hops (edge load balancer + nginx): the entry the LB appended,
    # never the client-supplied value in front of it.
    (2, "198.51.100.1, 203.0.113.7, 10.0.0.2", "203.0.113.7"),
    # A spoofed leading entry cannot displace the trusted one.
    (2, "not-an-ip, 203.0.113.7, 10.0.0.2", "203.0.113.7"),
])
def test_src_ip_counts_trusted_hops_from_the_right(hops, forwarded, expected):
    request = request_for(
        settings={"audit.trusted_proxy_hops": hops},
        headers={"X-Forwarded-For": forwarded},
    )
    assert client_ip(request) == expected


def test_src_ip_falls_back_to_the_unforgeable_peer_address():
    request = request_for(headers={"X-Forwarded-For": "definitely-not-an-ip"})
    assert client_ip(request) == "10.0.0.9"
    assert client_ip(request_for()) == "10.0.0.9"


def test_dest_port_is_ignored_unless_an_edge_proxy_is_declared_trusted():
    spoofed = request_for(headers={"X-Forwarded-Port": "443"})
    assert destination_port(spoofed) is None
    assert "dest_port" not in connection_fields(spoofed)

    trusted = request_for(
        settings={"audit.trusted_proxy_hops": 2},
        headers={"X-Forwarded-Port": "443"},
    )
    assert destination_port(trusted) == 443
    assert connection_fields(trusted)["dest_port"] == 443


# --------------------------------------------------------------------------
# Identity: verified credential only
# --------------------------------------------------------------------------

def test_identity_resolves_the_portal_user_not_an_incoming_cookie():
    user = SimpleNamespace(properties={
        "first_name": "Ada", "last_name": "Lovelace",
        "email": "ada@example.invalid", "institution": "Synthetic University",
        "groups": ["dbgap"],
    })
    registry = {"collections": {"user": {ACTOR: user}}}
    request = request_for(
        principals=[f"userid.{ACTOR}", "group.dbgap", "system.Authenticated"],
        headers={"Cookie": "jwtToken=synthetic-cookie-value"},
        registry=SimpleNamespace(settings={}, __getitem__=registry.__getitem__),
    )
    request.registry = MagicMock()
    request.registry.settings = {}
    request.registry.__getitem__.return_value = {"user": {ACTOR: user}}

    fields = identity_fields(request)
    assert fields["user_id"] == ACTOR
    assert fields["user_name"] == "Ada Lovelace"
    assert fields["user_email"] == "ada@example.invalid"
    assert fields["user_org"] == "Synthetic University"
    assert fields["user_permission_group"] == ["dbgap"]
    assert "synthetic-cookie-value" not in json.dumps(fields)


def test_provider_and_session_come_only_from_verified_claims():
    request = request_for(principals=[])
    assert "user_id_provider" not in identity_fields(request)
    assert "session_id" not in identity_fields(request)

    record_verified_claims(request, {
        "iss": "https://synthetic.okta.invalid/oauth2/default",
        "sid": "synthetic-session-id",
        "sub": "google-oauth2|synthetic-subject",
        "email": "Ada@Example.Invalid",
    })
    fields = identity_fields(request)
    assert fields["user_id_provider"] == "https://synthetic.okta.invalid/oauth2/default"
    assert fields["session_id"] == "synthetic-session-id"
    assert fields["user_federated_source"] == "google-oauth2"


def test_legacy_subject_supplies_the_federated_source_without_hardcoding_it():
    request = request_for(principals=[])
    record_verified_claims(request, {"iss": "https://legacy.invalid/", "sub": "auth0|x"})
    assert identity_fields(request)["user_federated_source"] == "auth0"


# --------------------------------------------------------------------------
# associated_study
# --------------------------------------------------------------------------

@pytest.mark.parametrize("dataset,expected", [
    ("colo829bl", "phs004193"),
    ("hg002", "phs004193"),
    ("lb_ipsc_1", "phs004193"),
    # A tissue dataset belongs to either study depending on its donor, which
    # the stored File properties do not record, so nothing is claimed.
    ("tissue", None),
    (None, None),
    ("unrecognized_dataset", None),
])
def test_associated_study_only_when_the_resource_determines_one(dataset, expected):
    assert study_accession_for_dataset(dataset) == expected
    context = SimpleNamespace(
        uuid=RESOURCE,
        properties={"accession": "SMAFI1", "status": "open", "dataset": dataset},
        type_info=SimpleNamespace(item_type="file"),
    )
    fields = file_resource_fields(context)
    if expected is None:
        assert "associated_study" not in fields
    else:
        assert fields["associated_study"] == expected
    assert fields["resource_accession"] == "SMAFI1"
    assert fields["resource_uuid"] == RESOURCE


# --------------------------------------------------------------------------
# The tween: response fields and the transitions no view owns
# --------------------------------------------------------------------------

@pytest.fixture
def tween_app(encoded_log_stream):  # noqa: F811
    """A real Pyramid app whose routes exercise the audit tween end to end."""

    def audited_view(request):
        record_audit_event(
            request,
            "Audited view",
            EVENT_TYPE_AUTHORIZATION,
            "synthetic_read",
            "allowed",
            resource_uuid=RESOURCE,
        )
        return Response(json_body={"ok": True}, content_type="application/json")

    def denied_view(request):
        raise HTTPForbidden("synthetic denial")

    def expired_view(request):
        request.set_property(lambda r: True, "auth0_expired")
        return Response(json_body={"expired": True}, content_type="application/json")

    config = Configurator(settings={})
    config.include("encoded.audit_tween")
    config.add_route("audited", "/audited")
    config.add_route("denied", "/denied")
    config.add_route("expired", "/expired")
    config.add_view(audited_view, route_name="audited")
    config.add_view(denied_view, route_name="denied")
    config.add_view(expired_view, route_name="expired")
    return webtest.TestApp(config.make_wsgi_app()), encoded_log_stream


CREDENTIAL_HEADERS = {
    "Authorization": "Bearer synthetic-id-token-value",
    "User-Agent": "synthetic-agent/1.0",
}


def test_queued_event_is_completed_with_response_only_fields(tween_app):
    app, stream = tween_app
    response = app.get("/audited?secret=synthetic-recaptcha-secret",
                       headers=CREDENTIAL_HEADERS)
    record, = records(stream)
    assert record["action"] == "synthetic_read"
    assert record["status"] == 200
    assert record["http_content_type"] == "application/json"
    # The portal's own response length - never a file size or an S3 transfer.
    assert record["bytes"] == len(response.body)
    assert isinstance(record["duration"], (int, float)) and record["duration"] >= 0
    assert record["http_user_agent"] == "synthetic-agent/1.0"
    # The query string never reaches the event, secret or not.
    assert record["url"].endswith("/audited")
    assert_no_secrets(stream)


def test_credentialed_denial_is_recorded_when_no_view_recorded_one(tween_app):
    app, stream = tween_app
    app.get("/denied", headers=CREDENTIAL_HEADERS, status=403)
    record, = records(stream)
    assert record["event_type"] == "authorization"
    assert record["action"] == "access_denied"
    assert record["outcome"] == "denied"
    assert record["status"] == 403
    assert_no_secrets(stream)


def test_anonymous_login_prompt_is_not_recorded_as_a_denied_attempt(tween_app):
    app, stream = tween_app
    app.get("/denied", status=403)
    assert records(stream) == []


def test_expired_session_is_recorded_as_an_automatic_logout(tween_app):
    app, stream = tween_app
    app.get("/expired", headers=CREDENTIAL_HEADERS)
    record, = records(stream)
    assert record["event_type"] == "authentication"
    assert record["action"] == "session_expired"
    assert record["outcome"] == "expired"
    assert record["reason"] == "token_expired"
    assert_no_secrets(stream)


def test_expiry_without_a_presented_credential_is_not_invented(tween_app):
    app, stream = tween_app
    app.get("/expired")
    assert records(stream) == []


def test_a_failing_audit_flush_never_breaks_the_response(tween_app):
    app, stream = tween_app
    with patch("encoded.audit_tween.emit_audit_event", side_effect=RuntimeError("boom")):
        response = app.get("/audited", headers=CREDENTIAL_HEADERS)
    assert response.status_code == 200


def test_events_are_emitted_immediately_without_the_tween(encoded_log_stream):  # noqa: F811
    """A management command or a directly called view still audits."""
    record_audit_event(
        request_for(), "Audited", EVENT_TYPE_AUTHORIZATION, "synthetic_action", "success"
    )
    record, = records(encoded_log_stream)
    assert record["action"] == "synthetic_action"
    # The response-only fields are absent rather than fabricated.
    for field in ("status", "bytes", "duration", "http_content_type"):
        assert field not in record


# --------------------------------------------------------------------------
# Data-access lifecycle
# --------------------------------------------------------------------------

def file_context(status="uploading", dataset="colo829bl"):
    item = object.__new__(File)
    item.model = SimpleNamespace(
        properties={"status": status, "accession": "SMAFI1", "dataset": dataset},
        uuid=RESOURCE,
    )
    return item


@pytest.mark.parametrize("status,event_type,action", [
    ("uploaded", "upload", "file_upload_complete"),
    ("upload failed", "upload", "file_upload_failed"),
    ("archived", "archival", "file_archive"),
    ("deleted", "deletion", "file_delete"),
])
def test_file_lifecycle_transitions_map_to_cadr_families(status, event_type, action,
                                                         encoded_log_stream):  # noqa: F811
    item = file_context()

    def persist(properties, sheets):
        item.model.properties = dict(properties)

    with patch.object(SnovaultItem, "update", side_effect=persist), \
            patch("encoded.types.file.get_current_request", return_value=request_for()):
        item.update({"status": status, "accession": "SMAFI1", "dataset": "colo829bl"})

    record, = records(encoded_log_stream)
    assert (record["event_type"], record["action"]) == (event_type, action)
    assert record["resource_status"] == status
    assert record["resource_uuid"] == RESOURCE
    assert record["associated_study"] == "phs004193"


def test_release_status_change_is_not_claimed_as_a_lifecycle_event(encoded_log_stream):  # noqa: F811
    item = file_context()

    def persist(properties, sheets):
        item.model.properties = dict(properties)

    with patch.object(SnovaultItem, "update", side_effect=persist), \
            patch("encoded.types.file.get_current_request", return_value=request_for()):
        item.update({"status": "released", "accession": "SMAFI1"})
    assert records(encoded_log_stream) == []
    assert "released" not in FILE_STATUS_AUDIT_EVENTS


def test_upload_credential_events_never_carry_the_credentials(encoded_log_stream):  # noqa: F811
    context = file_context(status="uploading")
    request = request_for(path="/files/SMAFI1/@@upload")
    credentials = {"upload_credentials": {
        "SecretAccessKey": "synthetic-secret-access-key",
        "SessionToken": "synthetic-id-token-value",
    }}
    with patch("encoded.types.file.CorePostUpload", return_value=credentials), \
            patch("encoded.types.file.CoreGetUpload", return_value=credentials):
        assert post_upload.__wrapped__(context, request) == credentials
        assert get_upload.__wrapped__(context, request) == credentials

    actions = [record["action"] for record in records(encoded_log_stream)]
    assert actions == ["file_upload_initiate", "file_upload_credentials_read"]
    assert all(record["event_type"] == "upload" for record in records(encoded_log_stream))
    assert_no_secrets(encoded_log_stream)


def test_download_records_authorization_and_issuance_not_the_transfer(
        encoded_log_stream):  # noqa: F811
    """The portal issues a redirect; S3 performs the transfer it cannot see."""
    from ..types.file import download

    request = request_for(path="/files/SMAFI1/@@download")
    request.subpath = ()
    request.range = None
    request.datastore = "database"
    request.params = {}
    request.GET = {}
    request.path_info = "/files/SMAFI1/@@download"
    request.client_addr = "203.0.113.7"
    request.headers = dict(CREDENTIAL_HEADERS)
    request.registry = MagicMock()
    request.registry.settings = {}
    request.registry.__getitem__.return_value = {"user": {}}

    context = MagicMock()
    context.uuid = RESOURCE
    context.properties = {"status": "open", "accession": "SMAFI1", "dataset": "colo829bl"}
    context.type_info.item_type = "file"
    context.upgrade_properties.return_value = {
        "filename": "synthetic.bam", "file_size": 123456789,
    }
    context.propsheets = {"external": {"service": "s3"}}
    context.get_open_data_url_or_presigned_url_location.return_value = (
        "https://s3.example.invalid/synthetic.bam"
        "?X-Amz-Signature=deadbeef&Expires=1999999999"
    )

    with patch("encoded.types.file.check_user_is_logged_in"), \
            patch("encoded.types.file.session_properties", return_value={"details": {}}), \
            patch("encoded.types.file.get_item_or_none", return_value=None), \
            patch("encoded.types.file.is_file_to_download", return_value="synthetic.bam"):
        with pytest.raises(HTTPTemporaryRedirect):
            download(context, request)

    record, = records(encoded_log_stream)
    assert record["event_type"] == "download"
    assert (record["action"], record["outcome"]) == ("file_download", "success")
    assert record["delivery"] == "presigned_redirect"
    assert record["resource_uuid"] == RESOURCE
    assert record["resource_status"] == "open"
    assert record["associated_study"] == "phs004193"
    # The file's own size is never reported as transferred bytes.
    assert record.get("bytes") != 123456789
    assert_no_secrets(encoded_log_stream)
    assert "synthetic.bam" not in encoded_log_stream.getvalue()


def test_denied_download_records_no_delivery(encoded_log_stream):  # noqa: F811
    from ..types.file import download_cli

    context = MagicMock()
    context.uuid = RESOURCE
    context.properties = {"status": "protected", "accession": "SMAFI1",
                          "dataset": "colo829bl"}
    context.type_info.item_type = "file"
    with pytest.raises(HTTPForbidden):
        download_cli.__wrapped__(context, request_for(principals=[]))
    record, = records(encoded_log_stream)
    assert (record["action"], record["outcome"]) == ("file_download_cli", "failure")
    assert "delivery" not in record
    assert record["resource_status"] == "protected"


def test_failed_upload_initiation_is_audited_as_a_failure(encoded_log_stream):  # noqa: F811
    context = file_context(status="uploading")
    with patch("encoded.types.file.CorePostUpload", side_effect=ValueError("synthetic")):
        with pytest.raises(ValueError):
            post_upload.__wrapped__(context, request_for())
    record, = records(encoded_log_stream)
    assert (record["action"], record["outcome"]) == ("file_upload_initiate", "failure")


def test_purge_is_audited_as_destruction_and_delete_is_not_double_counted(
        encoded_log_stream):  # noqa: F811
    from ..types.base import item_delete_full

    context = SimpleNamespace(
        uuid=RESOURCE,
        properties={"accession": "SMAFI1"},
        type_info=SimpleNamespace(item_type="file"),
        AUDITS_OWN_DELETION=True,
    )
    success = {"status": "success", "@graph": [RESOURCE]}

    purge_request = request_for()
    purge_request.GET = {"purge": "true"}
    plain_request = request_for()
    plain_request.GET = {}

    with patch("encoded.types.base.sno_item_delete_full", return_value=success):
        item_delete_full.__wrapped__(context, purge_request)
        item_delete_full.__wrapped__(context, plain_request)

    record, = records(encoded_log_stream)
    assert record["event_type"] == "destruction"
    assert record["action"] == "item_purge"
    assert record["resource_uuid"] == RESOURCE


def test_plain_delete_of_a_type_without_model_auditing_is_recorded(encoded_log_stream):  # noqa: F811
    from ..types.base import item_delete_full

    context = SimpleNamespace(
        uuid=RESOURCE,
        properties={},
        type_info=SimpleNamespace(item_type="software"),
        AUDITS_OWN_DELETION=False,
    )
    request = request_for()
    request.GET = {}
    with patch("encoded.types.base.sno_item_delete_full",
               return_value={"status": "success", "@graph": [RESOURCE]}):
        item_delete_full.__wrapped__(context, request)
    record, = records(encoded_log_stream)
    assert (record["event_type"], record["action"]) == ("deletion", "item_delete")
    assert record["resource_type"] == "software"


# --------------------------------------------------------------------------
# Re-check of the two established findings against this head
# --------------------------------------------------------------------------

def test_group_removal_via_delete_fields_is_audited(encoded_log_stream):  # noqa: F811
    """A ``?delete_fields=groups`` PATCH revokes access, so it must be logged.

    The replacement properties are produced by snovault's own ``delete_fields``
    validator rather than hand-written, so the audit is proven against the real
    shape a removal request persists.
    """
    from snovault.validators import delete_fields

    stored = {"groups": ["admin", "dbgap"], "email": "ada@example.invalid",
              "status": "current"}
    patch_request = MagicMock()
    patch_request.params = {"delete_fields": "groups"}
    patch_request.errors = []
    with patch("snovault.validators.validate",
               return_value=({k: v for k, v in stored.items() if k != "groups"}, [])):
        replacement = delete_fields(patch_request, dict(stored), User.schema)
    assert "groups" not in replacement

    user = object.__new__(User)
    user.model = SimpleNamespace(properties=dict(stored), uuid=ACTOR)

    def persist(properties, sheets):
        user.model.properties = dict(properties)

    with patch.object(SnovaultItem, "update", side_effect=persist), \
            patch("encoded.types.user.get_current_request", return_value=request_for()):
        user.update(replacement)

    revocations = [
        record for record in records(encoded_log_stream)
        if record["action"] == "user_group_revoke"
    ]
    revoke, = revocations
    assert revoke["revoked_groups"] == ["admin", "dbgap"]
    assert revoke["changes"]["groups"] == {"before": ["admin", "dbgap"], "after": []}
    assert revoke["event_type"] == "authorization"


def test_disabling_an_account_is_audited_as_an_authorization_change(
        encoded_log_stream):  # noqa: F811
    user = object.__new__(User)
    user.model = SimpleNamespace(properties={"status": "current"}, uuid=ACTOR)

    def persist(properties, sheets):
        user.model.properties = dict(properties)

    with patch.object(SnovaultItem, "update", side_effect=persist), \
            patch("encoded.types.user.get_current_request", return_value=request_for()):
        user.update({"status": "revoked"})

    actions = [record["action"] for record in records(encoded_log_stream)]
    assert "user_account_disable" in actions
    assert all(record["event_type"] == "authorization"
               for record in records(encoded_log_stream))


def test_logout_is_audited_against_the_verified_identity(encoded_log_stream):  # noqa: F811
    from ..project.authentication import SMAHTProjectAuthentication

    request = Request.blank("/logout")
    request.registry = MagicMock()
    request.registry.settings = {}
    request.registry.__getitem__.return_value = {"user": {}}

    with patch.object(Request, "effective_principals",
                      [f"userid.{ACTOR}", "group.dbgap"]):
        SMAHTProjectAuthentication().logout(None, request)
    record, = records(encoded_log_stream)
    assert (record["event_type"], record["action"]) == ("authentication", "logout")
    assert record["user_id"] == ACTOR
    assert record["user_permission_group"] == ["dbgap"]


def test_log_stream_survives_a_configured_formatter_round_trip():
    """The audit path must keep producing one physical line per event."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(make_console_formatter())
    logger = logging.getLogger("encoded")
    previous = (list(logger.handlers), logger.level, logger.propagate)
    logger.handlers[:] = [handler]
    logger.setLevel(logging.WARNING)
    logger.propagate = False
    try:
        _configure_structlog(in_prod=True)
        record_audit_event(
            request_for(), "Multi\nline\rmessage", EVENT_TYPE_AUTHORIZATION,
            "synthetic_action", "success", reason="embedded\nnewline",
        )
    finally:
        logger.handlers[:] = previous[0]
        logger.setLevel(previous[1])
        logger.propagate = previous[2]
        handler.close()

    lines = stream.getvalue().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["reason"] == "embedded\nnewline"
