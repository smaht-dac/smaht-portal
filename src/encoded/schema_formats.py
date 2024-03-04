import re
from pyramid.threadlocal import get_current_request
from snovault.schema_formats import FormatChecker
from snovault.server_defaults import test_accession
from .server_defaults import (
    ACCESSION_FACTORY,
    ACCESSION_PREFIX,
    ACCESSION_TEST_PREFIX
)


# Codes we allow for testing go here.
ACCESSION_TEST_CODES = "BS|ES|EX|FI|FS|IN|SR|WF"
accession_re = re.compile(r'^%s[A-Z]{2}[1-9A-Z]{7}$' % ACCESSION_PREFIX)
test_accession_re = re.compile(r'^%s(%s)[0-9]{4}([0-9][0-9][0-9]|[A-Z][A-Z][A-Z])$' % (
    ACCESSION_TEST_PREFIX, ACCESSION_TEST_CODES))


def is_accession(instance):
    """Just a pattern checker."""
    # Unfortunately we cannot access the accessionType here
    return (
        accession_re.match(instance) is not None or
        test_accession_re.match(instance) is not None
    )


@FormatChecker.cls_checks("accession")
def is_accession_for_server(instance):
    # Unfortunately we cannot access the accessionType here
    if accession_re.match(instance):
        return True
    request = get_current_request()
    if request.registry[ACCESSION_FACTORY] is test_accession:
        if test_accession_re.match(instance):
            return True
    return False
