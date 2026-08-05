"""Run ``create-mapping-on-deploy`` with its decision narration actually visible.

``dcicutils.log_utils.set_logging()`` only elevates the single logger named
by its ``log_name`` argument (see the ``elif level:`` branch in
``dcicutils/log_utils.py``). ``create_mapping_on_deploy.main()`` passes its
own module's ``__name__``, so it elevates
``snovault.commands.create_mapping_on_deploy`` but never
``snovault.elasticsearch.create_mapping`` - the module that owns essentially
all of the substantive per-type mapping/reindex decision narration
(``___CREATE-MAPPING___``, ``MAPPING: using existing index for collection
...``, DB/ES count comparisons, queueing decisions, ``___FINISHED
CREATE-MAPPING___``). That logger is left at Python's default ``WARNING``,
so every one of its ``.info()`` calls is silently dropped everywhere -
terminal or CloudWatch - regardless of what the command actually decided or
did. ``create_mapping.py`` itself has carried a ``TODO`` acknowledging this
since January 2022. This module does not patch ``dcicsnovault`` (a separate,
pinned dependency); it configures logging and adds one narrow, transparent,
behavior-preserving log line before delegating everything else - argument
parsing, mapping comparison, index deletion/recreation, reindex selection,
queueing, and exit codes - unchanged to the real command.
"""
import logging

import structlog

from snovault.commands import create_mapping_on_deploy as _create_mapping_on_deploy
from snovault.elasticsearch import create_mapping as _create_mapping


logger = structlog.getLogger(__name__)

# The narrowest namespaces that carry this command's own decision narration.
# Framework/HTTP/boto/SQL/Elasticsearch-client internals are left untouched.
VERBOSE_LOGGER_NAMES = (
    "snovault.elasticsearch.create_mapping",
    "snovault.commands.create_mapping_on_deploy",
)

_original_compare_against_existing_mapping = (
    _create_mapping.compare_against_existing_mapping
)


def _elevate_verbose_loggers() -> None:
    """Raise only this command's own decision-narration loggers to INFO.

    Deliberately does not call `logging.basicConfig(level=...)` or otherwise
    touch the root logger's level: `create_mapping_on_deploy.main()`'s own
    `set_logging()` call already installs a root handler before any of this
    command's narration runs, and a handler existing is all `.info()` calls
    on the two loggers below need to actually surface. Bumping the *root*
    level would also raise every *other* logger that has no explicit level
    of its own (`sqlalchemy.engine`, `pyramid`, `requests`, the Elasticsearch
    client, etc.) to the same level - exactly the noisy dependency-logging
    outcome this command must avoid. Only the two named loggers below are
    touched; every other namespace is left exactly as the rest of the
    application configured it.
    """
    for logger_name in VERBOSE_LOGGER_NAMES:
        logging.getLogger(logger_name).setLevel(logging.INFO)


def _compare_against_existing_mapping_with_logging(
    es, index_name, in_type, this_index_record, live_mapping=False, selective_reindex=False
):
    """Transparent wrapper: identical inputs, return value, and behavior.

    ``build_index()`` only reaches this call after it has already confirmed
    the collection's index exists (the surrounding ``and`` short-circuits on
    that check first), so a ``False`` result unambiguously means an
    *existing* index's mapping and/or calculated-property signature did not
    match and will be deleted and rebuilt - a distinction ``build_index()``'s
    own delete/create messages never make on their own (they read
    identically whether the index didn't exist yet or existed but didn't
    match). Logs only on that not-matched branch: the matched branch is
    already narrated by ``build_index()``'s own "using existing index" line,
    so logging here too would just duplicate it.
    """
    matched = _original_compare_against_existing_mapping(
        es,
        index_name,
        in_type,
        this_index_record,
        live_mapping=live_mapping,
        selective_reindex=selective_reindex,
    )
    if not matched:
        logger.info(
            "mapping_signature_mismatch_index_will_be_rebuilt",
            collection=in_type,
            selective_reindex=selective_reindex,
        )
    return matched


def main() -> None:
    _elevate_verbose_loggers()
    _create_mapping.compare_against_existing_mapping = (
        _compare_against_existing_mapping_with_logging
    )
    try:
        _create_mapping_on_deploy.main()
    finally:
        _create_mapping.compare_against_existing_mapping = (
            _original_compare_against_existing_mapping
        )


if __name__ == "__main__":
    main()
