from dcicutils.misc_utils import ignored
from jsonschema_serialize_fork import NO_DEFAULT
from snovault.schema_utils import server_default
from snovault.server_defaults import get_user_resource


ACCESSION_FACTORY = __name__ + ':accession_factory'
ACCESSION_PREFIX = 'SMA'
ACCESSION_TEST_PREFIX = 'TST'


def includeme(config):
    config.scan(__name__)


@server_default
def user_submission_centers(instance, subschema):
    ignored(instance, subschema)
    user = get_user_resource()
    if user == NO_DEFAULT:
        return NO_DEFAULT
    submission_centers = user.properties.get('submission_centers', [])
    if len(submission_centers) > 0:
        return submission_centers
    return NO_DEFAULT


@server_default
def user_consortia(instance, subschema):
    ignored(instance, subschema)
    user = get_user_resource()
    if user == NO_DEFAULT:
        return NO_DEFAULT
    consortia = user.properties.get('consortia', [])
    if len(consortia) > 0:
        return consortia
    return NO_DEFAULT
