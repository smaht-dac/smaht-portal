import re
from pyramid.threadlocal import get_current_request
from snovault.schema_utils import format_checker
from snovault.server_defaults import ACCESSION_FACTORY, test_accession
from .server_defaults import (
    ACCESSION_PREFIX,
    ACCESSION_TEST_PREFIX
)


# Codes we allow for testing go here.
accession_re = re.compile(r'^%s[A-Z]{2}[1-9A-Z]{7}$' % ACCESSION_PREFIX)
test_accession_re = re.compile(r"^%s[A-Z]{2}[0-9]{7}$" % ACCESSION_TEST_PREFIX)


def is_accession(instance):
    """Just a pattern checker."""
    # Unfortunately we cannot access the accessionType here
    return (
        accession_re.match(instance) is not None or
        test_accession_re.match(instance) is not None
    )


@format_checker.checks("accession")
def is_accession_for_server(instance):
    # Unfortunately we cannot access the accessionType here
    if accession_re.match(instance):
        return True
    request = get_current_request()
    if request.registry[ACCESSION_FACTORY] is test_accession:
        if test_accession_re.match(instance):
            return True
    return False
