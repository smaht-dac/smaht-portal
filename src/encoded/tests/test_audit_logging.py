import io
import json
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from pyramid.httpexceptions import HTTPForbidden, HTTPTemporaryRedirect

from snovault.types.access_key import AccessKey as SnovaultAccessKey

from ..logging_config import _configure_structlog, make_console_formatter
from ..types.access_key import AccessKey, access_key_add, access_key_reset_secret
from ..types.file import download, download_cli


@pytest.fixture
def encoded_log_stream():
    """Capture the same parent logger used by the production encoded handler."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(make_console_formatter())
    logger_names = ["encoded", "encoded.types.access_key", "encoded.types.file"]
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


def test_access_key_audit_events_are_structured_and_identity_free(encoded_log_stream):
    create_result = {
        "access_key_id": "synthetic-access-key-id",
        "secret_access_key": "synthetic-create-secret",
    }
    reset_result = {
        "access_key_id": "synthetic-access-key-id",
        "secret_access_key": "synthetic-reset-secret",
    }

    with patch("encoded.types.access_key.sno_access_key_add", return_value=create_result):
        assert access_key_add(MagicMock(), MagicMock()) == create_result
    with patch("encoded.types.access_key.sno_access_key_reset_secret", return_value=reset_result):
        assert access_key_reset_secret(MagicMock(), MagicMock()) == reset_result

    model = MagicMock(properties={"status": "current"})
    access_key = object.__new__(AccessKey)
    access_key.model = model
    with patch.object(SnovaultAccessKey, "update", return_value=None):
        access_key.update({"status": "deleted"})

    records = _records(encoded_log_stream)
    assert [(record["action"], record["outcome"]) for record in records] == [
        ("access_key_create", "success"),
        ("access_key_reset", "success"),
        ("access_key_revoke", "success"),
    ]
    assert all(record["event_type"] == "access_key" for record in records)
    output = encoded_log_stream.getvalue()
    assert "synthetic-access-key-id" not in output
    assert "synthetic-create-secret" not in output
    assert "synthetic-reset-secret" not in output


def test_download_audit_events_cover_signed_and_denied_paths(encoded_log_stream):
    request = SimpleNamespace(
        effective_principals=["userid.synthetic-user"],
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
                "details": {"uuid": "synthetic-user", "groups": ["synthetic-group"]}
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
    output = encoded_log_stream.getvalue()
    for protected_value in [
        "synthetic-download-token",
        "synthetic-signed-token",
        "synthetic-cli-secret",
        "synthetic-user",
        "synthetic-download.bam",
    ]:
        assert protected_value not in output
