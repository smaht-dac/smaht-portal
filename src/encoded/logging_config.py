"""Application logging configuration for the stdlib/structlog bridge.

The application uses structlog's standard-library integration, while Pyramid and
its dependencies write ordinary ``logging.LogRecord`` objects.  A
``ProcessorFormatter`` on the console handlers gives both paths the same JSON
shape.  JSON serialization is intentionally the final step so newlines in a
message, source line, or exception are escaped rather than written to the
container stream.

Exception chains are represented with the exception being logged at the top
level and a ``chain`` list containing its displayed ``cause`` or ``context``.
The context link is included only when Python would display it (an explicit
cause wins, and suppressed implicit context is omitted).  Each exception in a
chain gets its own first-five-frame view and truncation metadata.
"""

import json
import logging
import sys
import traceback
from typing import Any, Dict, Iterable, Optional, Set, Tuple

import structlog
from dcicutils.log_utils import (
    ElasticsearchLoggerFactory,
    add_log_uuid,
    set_logging,
    wrap_dict,
)


MAX_TRACEBACK_FRAMES = 5


def _exception_info(exc_info: Any) -> Optional[Tuple[type, BaseException, Any]]:
    """Normalize stdlib/structlog ``exc_info`` values to an exception tuple."""

    if exc_info is True:
        exc_info = sys.exc_info()
    elif isinstance(exc_info, BaseException):
        exc_info = (type(exc_info), exc_info, exc_info.__traceback__)

    if not isinstance(exc_info, tuple) or len(exc_info) != 3:
        return None
    exc_type, exc, traceback_obj = exc_info
    if not isinstance(exc, BaseException):
        return None
    return exc_type, exc, traceback_obj


def _frame_dict(frame: traceback.FrameSummary) -> Dict[str, Any]:
    """Return JSON-safe, useful fields for one traceback frame."""

    return {
        "file": frame.filename,
        "line": frame.lineno,
        "function": frame.name,
        "code": frame.line,
    }


def _exception_dict(
    exc: BaseException,
    traceback_obj: Any = None,
    seen: Optional[Set[int]] = None,
) -> Dict[str, Any]:
    """Serialize an exception without allowing its traceback to grow unbounded.

    The top-level exception remains complete even when its frames are capped:
    ``type`` and ``message`` are never removed.  Chained exceptions are nested
    in ``chain`` with an explicit ``relation`` so the causal direction is not
    lost.  A cycle is guarded defensively even though normal Python exception
    chains are acyclic.
    """

    if seen is None:
        seen = set()
    exception_id = id(exc)
    if exception_id in seen:
        return {
            "type": type(exc).__name__,
            "class": f"{type(exc).__module__}.{type(exc).__qualname__}",
            "message": str(exc),
            "frames": [],
            "truncated": False,
            "omitted_frame_count": 0,
            "chain": [],
            "cycle": True,
        }
    seen.add(exception_id)

    frames = traceback_obj
    if frames is None:
        frames = exc.__traceback__
    extracted_frames = list(traceback.extract_tb(frames)) if frames else []
    kept_frames = extracted_frames[:MAX_TRACEBACK_FRAMES]
    omitted_frame_count = max(0, len(extracted_frames) - len(kept_frames))

    result: Dict[str, Any] = {
        "type": type(exc).__name__,
        "class": f"{type(exc).__module__}.{type(exc).__qualname__}",
        "message": str(exc),
        "frames": [_frame_dict(frame) for frame in kept_frames],
        "truncated": omitted_frame_count > 0,
        "omitted_frame_count": omitted_frame_count,
        "chain": [],
    }

    chained_exception = None
    relation = None
    if exc.__cause__ is not None:
        chained_exception = exc.__cause__
        relation = "cause"
    elif exc.__context__ is not None and not exc.__suppress_context__:
        chained_exception = exc.__context__
        relation = "context"

    if chained_exception is not None:
        result["chain"].append(
            {
                "relation": relation,
                "exception": _exception_dict(chained_exception, seen=seen),
            }
        )
    return result


def format_exception(logger: Any, method_name: str, event_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ``exc_info`` into one bounded, structured exception field."""

    exc_info = event_dict.pop("exc_info", None)
    normalized = _exception_info(exc_info)
    if normalized is not None:
        _, exc, traceback_obj = normalized
        event_dict["exception"] = _exception_dict(exc, traceback_obj=traceback_obj)
    return event_dict


def add_message(logger: Any, method_name: str, event_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Expose the log event under the stable ``message`` field.

    ``event`` is retained for compatibility with existing structlog consumers;
    the new field is the canonical console message field.
    """

    if "message" not in event_dict:
        event_dict["message"] = event_dict.get("event", "")
    return event_dict


def add_timestamp_alias(logger: Any, method_name: str, event_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Retain the existing ``@timestamp`` convention without dropping ``timestamp``."""

    if "timestamp" in event_dict:
        event_dict.setdefault("@timestamp", event_dict["timestamp"])
    return event_dict


def _foreign_pre_chain() -> Iterable[Any]:
    """Processors used for ordinary stdlib records entering ProcessorFormatter."""

    return (
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        format_exception,
        structlog.processors.UnicodeDecoder(),
        add_message,
        add_timestamp_alias,
    )


def make_console_formatter() -> structlog.stdlib.ProcessorFormatter:
    """Build the single-line JSON formatter used by application console handlers."""

    return structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(serializer=json.dumps, default=str),
        foreign_pre_chain=list(_foreign_pre_chain()),
    )


def _configure_structlog(in_prod: bool) -> None:
    """Configure structlog to hand event dictionaries to ProcessorFormatter."""

    timestamper = structlog.processors.TimeStamper(fmt="iso")
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        timestamper,
        add_timestamp_alias,
        add_log_uuid,
        structlog.processors.StackInfoRenderer(),
        format_exception,
        structlog.processors.UnicodeDecoder(),
        add_message,
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ]

    structlog.configure(
        processors=processors,
        context_class=wrap_dict(dict),
        logger_factory=ElasticsearchLoggerFactory(in_prod=in_prod),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def _console_handlers() -> Iterable[logging.Handler]:
    """Yield configured stream handlers without touching file handlers."""

    seen = set()
    loggers = [logging.getLogger()]
    loggers.extend(
        logger
        for logger in logging.Logger.manager.loggerDict.values()
        if isinstance(logger, logging.Logger)
    )
    for logger in loggers:
        for handler in logger.handlers:
            if isinstance(handler, logging.StreamHandler) and not isinstance(handler, logging.FileHandler):
                if id(handler) not in seen:
                    seen.add(id(handler))
                    yield handler


def configure_application_logging(in_prod: bool = False) -> None:
    """Install the project's logging levels, structlog bridge, and JSON handlers."""

    # Keep dcicutils' established logger-level behavior, then replace its
    # renderer/exception path with the stdlib-compatible bounded JSON path.
    set_logging(in_prod=in_prod)
    _configure_structlog(in_prod)
    formatter = make_console_formatter()
    for handler in _console_handlers():
        handler.setFormatter(formatter)
