import io
import json
import logging
import os
import subprocess
import sys
import textwrap
import traceback

from ..logging_config import make_console_formatter


def _emit_exception(logger):
    def raise_deep(depth):
        if depth:
            return raise_deep(depth - 1)
        raise ValueError("terminal failure")

    try:
        raise_deep(8)
    except ValueError:
        traceback_obj = traceback.extract_tb(sys.exc_info()[2])
        logger.exception("deep failure")
    return traceback_obj


def _logger_with_stream():
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(make_console_formatter())
    logger = logging.getLogger("encoded.tests.logging_config")
    logger.handlers[:] = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    return logger, stream


def test_exception_is_one_json_line_with_bounded_traceback():
    logger, stream = _logger_with_stream()
    expected_frames = None
    try:
        expected_frames = _emit_exception(logger)
        output = stream.getvalue()
    finally:
        logger.handlers.clear()

    assert len(output.splitlines()) == 1
    record = json.loads(output)
    exception = record["exception"]

    assert record["timestamp"]
    assert record["level"] == "error"
    assert record["logger"] == "encoded.tests.logging_config"
    assert record["message"] == "deep failure"
    assert exception["type"] == "ValueError"
    assert exception["message"] == "terminal failure"
    assert exception["truncated"] is True
    assert exception["omitted_frame_count"] == len(expected_frames) - 5
    assert len(exception["frames"]) == 5
    assert exception["frames"] == [
        {
            "file": frame.filename,
            "line": frame.lineno,
            "function": frame.name,
            "code": frame.line,
        }
        for frame in expected_frames[:5]
    ]
    assert "Traceback (most recent call last):" not in output


def test_exception_chain_is_explicit_and_messages_are_preserved():
    logger, stream = _logger_with_stream()
    try:
        try:
            raise KeyError("inner")
        except KeyError as exc:
            raise RuntimeError("outer") from exc
    except RuntimeError:
        logger.exception("chained failure")
    finally:
        logger.handlers.clear()

    record = json.loads(stream.getvalue())
    exception = record["exception"]
    assert exception["type"] == "RuntimeError"
    assert exception["message"] == "outer"
    assert exception["chain"][0]["relation"] == "cause"
    assert exception["chain"][0]["exception"]["type"] == "KeyError"
    assert exception["chain"][0]["exception"]["message"] == "'inner'"


def test_one_line_messages_remain_json_and_physical_single_line():
    logger, stream = _logger_with_stream()
    try:
        logger.info("ordinary message")
        logger.warning("message with\nembedded newline")
    finally:
        logger.handlers.clear()

    lines = stream.getvalue().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["message"] == "ordinary message"
    assert json.loads(lines[1])["message"] == "message with\nembedded newline"


def test_uncaught_process_exception_uses_one_json_line_and_keeps_failure_status():
    """Exercise the real interpreter hook in a pserve-worker equivalent child."""

    child = textwrap.dedent(
        """
        import logging
        import sys
        from encoded.logging_config import configure_application_logging

        handler = logging.StreamHandler(sys.stderr)
        root_logger = logging.getLogger()
        root_logger.handlers[:] = [handler]
        root_logger.setLevel(logging.INFO)
        configure_application_logging()

        logging.getLogger("encoded.tests.ordinary").error("ordinary application error")

        def raise_deep(depth):
            if depth:
                return raise_deep(depth - 1)
            raise ValueError("uncaught terminal failure")

        raise_deep(8)
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", child],
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        check=False,
    )

    assert result.returncode != 0
    lines = result.stderr.splitlines()
    assert len(lines) == 2

    ordinary = json.loads(lines[0])
    assert ordinary["message"] == "ordinary application error"
    assert "exception" not in ordinary

    uncaught = json.loads(lines[1])
    exception = uncaught["exception"]
    assert uncaught["message"] == "Uncaught exception"
    assert exception["type"] == "ValueError"
    assert exception["class"] == "builtins.ValueError"
    assert exception["message"] == "uncaught terminal failure"
    assert len(exception["frames"]) == 5
    assert exception["truncated"] is True
    assert exception["omitted_frame_count"] == 5
    assert "Traceback (most recent call last):" not in result.stderr


def test_uncaught_thread_exception_uses_one_json_line_without_changing_thread_semantics():
    """The sibling interpreter hook has the same physical-line guarantee."""

    child = textwrap.dedent(
        """
        import logging
        import sys
        import threading
        from encoded.logging_config import install_uncaught_exception_logging, make_console_formatter

        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(make_console_formatter())
        root_logger = logging.getLogger()
        root_logger.handlers[:] = [handler]
        root_logger.setLevel(logging.INFO)
        install_uncaught_exception_logging()

        def worker():
            raise RuntimeError("uncaught thread failure")

        thread = threading.Thread(target=worker, name="uncaught-test-worker")
        thread.start()
        thread.join()
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", child],
        capture_output=True,
        text=True,
        env=os.environ.copy(),
        check=False,
    )

    assert result.returncode == 0
    lines = result.stderr.splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["message"] == "Uncaught exception"
    assert record["exception"]["type"] == "RuntimeError"
    assert record["exception"]["class"] == "builtins.RuntimeError"
    assert record["exception"]["message"] == "uncaught thread failure"
