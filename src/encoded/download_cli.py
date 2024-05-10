from json import JSONDecodeError
from pyramid.view import view_config
from pyramid.response import Response
from pyramid.httpexceptions import HTTPTemporaryRedirect
from urllib.parse import urlparse
from snovault.util import debug_log
from dcicutils.misc_utils import ignored
from encoded_core.types.file import external_creds
from structlog import getLogger


log = getLogger(__name__)


def includeme(config):
    config.add_route('download_cli', '/download_cli/')
    config.scan(__name__)


def extract_bucket_and_key(url):
    """ Takes an HTTPS URL to S3 and extracts the bucket and key """
    parsed_url = urlparse(url)
    bucket = parsed_url.netloc.split('.')[0]
    key = parsed_url.path.strip('/')
    if '?' in key:  # remove query params
        key = key.split('?', 1)[0]
    return bucket, key


def generate_creds(e):
    """ Processes HTTPTemporary redirect response from the app, grabbing the bucket/key
        and calling external_creds with upload=False
    """
    url = e.location
    bucket, key = extract_bucket_and_key(url)
    return external_creds(bucket, key, name=f'DownloadCredentials')


@view_config(route_name='download_cli', request_method=['GET', 'POST'])
@debug_log
def get_download_federation_token(context, request):
    """ Runs the external_creds function with upload=False assuming user passes auth check """
    ignored(context)
    # TODO: refactor to helper
    if request.content_type == 'application/json':
        try:
            atid = request.json_body['item']
        except (JSONDecodeError, KeyError):
            return Response('Invalid JSON format or no item key present', status=400)
    else:
        atid = request.GET.get('item')
        if not atid:
            return Response('No item query parameter present', status=400)

    # Direct to @@download to track via GA and run perm check
    if '@@download' in atid:  # allow direct pass
        try:  # this call will raise HTTPTemporary redirect if successful
            request.embed(f'{atid}', as_user=True)
        except HTTPTemporaryRedirect as e:
            return generate_creds(e)
    else:  # otherwise, try something reasonable
        try:
            request.embed(f'{atid}/@@download', as_user=True)
        except HTTPTemporaryRedirect as e:
            return generate_creds(e)
    return Response('Could not retrieve creds')
