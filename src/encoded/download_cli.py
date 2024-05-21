from re import match
from pyramid.view import view_config
from pyramid.response import Response
from pyramid.httpexceptions import HTTPTemporaryRedirect
from urllib.parse import urlparse
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from encoded_core.types.file import external_creds, File
from structlog import getLogger


log = getLogger(__name__)


def includeme(config):
    config.add_route('download_cli', '/download_cli/')
    config.scan(__name__)


def extract_bucket_and_key(url: str) -> (str, str):
    """ Takes an HTTPS URL to S3 and extracts the bucket and key """
    parsed_url = urlparse(url)
    bucket = parsed_url.netloc.split('.')[0]
    key = parsed_url.path.strip('/')
    if '?' in key:  # remove query params
        key = key.split('?', 1)[0]
    return bucket, key


def generate_creds(e: HTTPTemporaryRedirect) -> dict:
    """ Processes HTTPTemporary redirect response from the app, grabbing the bucket/key
        and calling external_creds with upload=False
    """
    url = e.location
    bucket, key = extract_bucket_and_key(url)
    return external_creds(bucket, key, name=f'DownloadCredentials', upload=False)


@view_config(name='download_cli', context=File, permission='view', request_method=['GET'])
@debug_log
def download_cli(context, request):
    """ Runs the external_creds function with upload=False assuming user passes auth check """
    ignored(context)
    path = request.path
    # Direct to @@download to track via GA and run perm check
    try:  # this call will raise HTTPTemporary redirect if successful
        uri = path.replace('@@download_cli', '@@download')
        request.embed(uri, as_user=True)
    except HTTPTemporaryRedirect as e:
        return generate_creds(e)
    return Response('Could not retrieve creds', status=400)
