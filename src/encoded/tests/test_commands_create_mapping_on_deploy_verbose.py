import logging
from pathlib import Path

import pytest
import structlog

import encoded.commands.create_mapping_on_deploy_verbose as verbose_command
from dcicutils.log_utils import set_logging


def _reset_logger_levels():
    for name in verbose_command.VERBOSE_LOGGER_NAMES:
        logging.getLogger(name).setLevel(logging.NOTSET)


def test_prior_configuration_suppresses_create_mapping_info():
    """Reproduces the exact prior defect: create_mapping_on_deploy.main()'s
    own set_logging() call elevates only its own module's logger, leaving
    snovault.elasticsearch.create_mapping - which owns almost all of the
    substantive mapping/reindex decision narration - at Python's default
    WARNING. If this ever stops reproducing (e.g. a future dcicsnovault
    release fixes set_logging upstream), this test should fail, signaling
    the wrapper below may no longer be necessary.
    """
    try:
        set_logging(
            in_prod=True,
            log_name="snovault.commands.create_mapping_on_deploy",
            level=logging.DEBUG,
        )
        assert (
            logging.getLogger("snovault.commands.create_mapping_on_deploy")
            .getEffectiveLevel()
            == logging.DEBUG
        )
        assert (
            logging.getLogger("snovault.elasticsearch.create_mapping")
            .getEffectiveLevel()
            == logging.WARNING
        )
    finally:
        set_logging(in_prod=False)
        _reset_logger_levels()


def test_elevate_verbose_loggers_exposes_previously_suppressed_create_mapping_info(
    caplog,
):
    try:
        set_logging(
            in_prod=True,
            log_name="snovault.commands.create_mapping_on_deploy",
            level=logging.DEBUG,
        )
        assert (
            logging.getLogger("snovault.elasticsearch.create_mapping")
            .getEffectiveLevel()
            == logging.WARNING
        )

        verbose_command._elevate_verbose_loggers()

        assert (
            logging.getLogger("snovault.elasticsearch.create_mapping")
            .getEffectiveLevel()
            == logging.INFO
        )

        caplog.set_level(logging.INFO)
        mapping_log = structlog.getLogger("snovault.elasticsearch.create_mapping")
        mapping_log.info(
            "MAPPING: using existing index for collection foo", collection="foo"
        )

        assert caplog.records
        assert any(
            "MAPPING: using existing index for collection foo" in record.getMessage()
            for record in caplog.records
        )
    finally:
        set_logging(in_prod=False)
        _reset_logger_levels()


def test_elevate_verbose_loggers_does_not_touch_root_or_unrelated_loggers():
    """The fix must not raise the root logger's level (which would also
    raise every OTHER logger without its own explicit level - SQLAlchemy,
    Pyramid, requests, the Elasticsearch client) to avoid turning unrelated
    dependency internals chatty, per this task's explicit scope.
    """
    root_level_before = logging.getLogger().level
    unrelated_names = (
        "sqlalchemy.engine",
        "elasticsearch",
        "urllib3",
        "boto3",
        "requests",
    )
    unrelated_levels_before = {
        name: logging.getLogger(name).level for name in unrelated_names
    }

    try:
        verbose_command._elevate_verbose_loggers()

        assert logging.getLogger().level == root_level_before
        for name in unrelated_names:
            assert logging.getLogger(name).level == unrelated_levels_before[name]
        for name in verbose_command.VERBOSE_LOGGER_NAMES:
            assert logging.getLogger(name).level == logging.INFO
    finally:
        _reset_logger_levels()


def test_compare_wrapper_matched_path_is_silent_and_transparent(monkeypatch):
    """Clean no-op path: the mapping/signature already matches."""
    calls = []
    logged = []

    def fake_original(es, index_name, in_type, this_index_record, live_mapping=False, selective_reindex=False):
        calls.append(
            (es, index_name, in_type, this_index_record, live_mapping, selective_reindex)
        )
        return True

    monkeypatch.setattr(
        verbose_command, "_original_compare_against_existing_mapping", fake_original
    )
    monkeypatch.setattr(verbose_command.logger, "info", lambda *a, **k: logged.append((a, k)))

    result = verbose_command._compare_against_existing_mapping_with_logging(
        "es-client", "workflow_index", "workflow", {"mappings": {"_meta": {}}},
        live_mapping=True, selective_reindex=True,
    )

    assert result is True
    assert calls == [
        ("es-client", "workflow_index", "workflow", {"mappings": {"_meta": {}}}, True, True)
    ]
    assert logged == []


def test_compare_wrapper_mismatch_path_logs_once_and_is_transparent(monkeypatch):
    """Signature/mapping mismatch path: the existing index will be rebuilt."""
    calls = []
    logged = []

    def fake_original(es, index_name, in_type, this_index_record, live_mapping=False, selective_reindex=False):
        calls.append(
            (es, index_name, in_type, this_index_record, live_mapping, selective_reindex)
        )
        return False

    monkeypatch.setattr(
        verbose_command, "_original_compare_against_existing_mapping", fake_original
    )
    monkeypatch.setattr(verbose_command.logger, "info", lambda *a, **k: logged.append((a, k)))

    result = verbose_command._compare_against_existing_mapping_with_logging(
        "es-client", "workflow_index", "workflow", {"mappings": {"_meta": {}}},
        live_mapping=True, selective_reindex=True,
    )

    assert result is False
    assert calls == [
        ("es-client", "workflow_index", "workflow", {"mappings": {"_meta": {}}}, True, True)
    ]
    assert logged == [
        (
            ("mapping_signature_mismatch_index_will_be_rebuilt",),
            {"collection": "workflow", "selective_reindex": True},
        )
    ]


def test_main_restores_original_compare_function_on_clean_exit(monkeypatch):
    monkeypatch.setattr(
        verbose_command._create_mapping_on_deploy,
        "main",
        lambda: (_ for _ in ()).throw(SystemExit(0)),
    )
    original = verbose_command._original_compare_against_existing_mapping

    with_raise = False
    try:
        verbose_command.main()
    except SystemExit as exit_info:
        with_raise = True
        assert exit_info.code == 0

    assert with_raise
    assert verbose_command._create_mapping.compare_against_existing_mapping is original


def test_main_restores_original_compare_function_on_exception(monkeypatch):
    monkeypatch.setattr(
        verbose_command._create_mapping_on_deploy,
        "main",
        lambda: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    original = verbose_command._original_compare_against_existing_mapping

    with_raise = False
    try:
        verbose_command.main()
    except RuntimeError:
        with_raise = True

    assert with_raise
    assert verbose_command._create_mapping.compare_against_existing_mapping is original


def test_main_installs_wrapper_before_delegating(monkeypatch):
    observed = {}

    def fake_main():
        observed["patched"] = (
            verbose_command._create_mapping.compare_against_existing_mapping
        )
        raise SystemExit(0)

    monkeypatch.setattr(verbose_command._create_mapping_on_deploy, "main", fake_main)

    with pytest.raises(SystemExit):
        verbose_command.main()

    assert observed["patched"] is verbose_command._compare_against_existing_mapping_with_logging


def test_deployment_invokes_verbose_create_mapping_command():
    deployment_entrypoint = Path("deploy/docker/production/entrypoint_deployment.sh")
    contents = deployment_entrypoint.read_text()
    cleanup_command = (
        "poetry run delete-revision-history production.ini --app-name app --prod"
    )
    mapping_command = (
        "poetry run create-mapping-on-deploy-verbose production.ini "
        "--app-name app --selective-reindex"
    )
    load_data_command = "poetry run load-data-by-type"

    assert cleanup_command in contents
    assert mapping_command in contents
    assert contents.index(cleanup_command) < contents.index(mapping_command)
    assert contents.index(mapping_command) < contents.index(load_data_command)


def test_pyproject_registers_verbose_create_mapping_script():
    pyproject_contents = Path("pyproject.toml").read_text()
    assert (
        'create-mapping-on-deploy-verbose = '
        '"encoded.commands.create_mapping_on_deploy_verbose:main"'
    ) in pyproject_contents
