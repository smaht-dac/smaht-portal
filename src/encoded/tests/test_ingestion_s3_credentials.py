"""Which identity signs the ingestion metadata-bundle S3 calls.

Submissions to the SRCE portal failed with::

    An error occurred (InvalidAccessKeyId) when calling the PutObject operation:
    The AWS Access Key Id you provided does not exist in our records.

because snovault built the ingestion S3 client from the static ``S3_AWS_ACCESS_KEY_ID`` /
``S3_AWS_SECRET_ACCESS_KEY`` IAM-user keys carried in the global application configuration, and no
live key exists for that user. ``dcicsnovault`` 11.36.2.0b1 adds ``make_s3_client_for_ingestion``,
which leaves those keys alone and lets the boto3 default credential provider chain resolve the ECS
task role instead.

These tests drive the real ``submit_for_ingestion`` view, the real client factories and real SigV4
signing, and inspect the credential that actually reaches the wire. The HTTP transport is local and
synthetic: no network, no AWS, no SQS.
"""

import cgi
import io
import re
from unittest import mock

import boto3
import pytest
from botocore.awsrequest import AWSResponse
from botocore.exceptions import NoCredentialsError

import encoded.project_defs  # noqa: F401 - registers the app project before snovault schemas load

from snovault import util as snovault_util
from snovault.ingestion import ingestion_listener as listener_module
from snovault.ingestion import ingestion_message_handler_default as handler_module
from snovault.ingestion.exceptions import SubmissionFailure


# The legacy IAM user's key, as the global application configuration still carries it.
STATIC_USER_KEY = 'AKIATESTSTATICUSER00'
# What the ECS task role's temporary credentials look like.
TASK_ROLE_KEY = 'ASIATESTTASKROLE0000'
TASK_ROLE_TOKEN = 'FwoGZXIvYXdzEJr--test-session-token'

SUBMISSION_ID = '2a6e1c3e-0000-4000-8000-00000000beef'
BUNDLES_BUCKET = 'smaht-test-application-metadata-bundles'
KMS_KEY_ID = 'test-kms-key-id'

IDENTITY_WITH_STATIC_KEYS = {
    'S3_AWS_ACCESS_KEY_ID': STATIC_USER_KEY,
    'S3_AWS_SECRET_ACCESS_KEY': 'test-secret',
    'ENCODED_S3_ENCRYPT_KEY_ID': KMS_KEY_ID,
}

TASK_ROLE_ENVIRON = {
    'AWS_ACCESS_KEY_ID': TASK_ROLE_KEY,
    'AWS_SECRET_ACCESS_KEY': 'test-secret',
    'AWS_SESSION_TOKEN': TASK_ROLE_TOKEN,
    'AWS_DEFAULT_REGION': 'us-east-1',
}

ERROR_BODY = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<Error><Code>{code}</Code><Message>{message}</Message><RequestId>test</RequestId></Error>'
)


class _RawBody:
    """Minimal urllib3-HTTPResponse-ish object that botocore can read a body from."""

    def __init__(self, data):
        self._buf = io.BytesIO(data)

    def stream(self, amt=1024, **kwargs):
        while True:
            chunk = self._buf.read(amt)
            if not chunk:
                break
            yield chunk

    def read(self, amt=None):
        return self._buf.read() if amt is None else self._buf.read(amt)

    def close(self):
        self._buf.close()


def _decode(value):
    return value.decode() if isinstance(value, bytes) else value


class FakeS3Wire:
    """Answers signed S3 requests locally, recording the credential each one carried."""

    def __init__(self, allowed_key_ids=(TASK_ROLE_KEY,), deny_with=None):
        self.allowed_key_ids = set(allowed_key_ids)
        self.deny_with = deny_with
        self.requests = []

    def install(self, client):
        client.meta.events.register('before-send.s3.*', self._before_send)
        return client

    @property
    def signing_key_ids(self):
        return [record['access_key_id'] for record in self.requests]

    def _before_send(self, request, **kwargs):
        authorization = _decode(request.headers.get('Authorization')) or ''
        matched = re.search(r'Credential=([^/]+)/', authorization)
        self.requests.append({
            'method': request.method,
            'url': request.url,
            'access_key_id': matched.group(1) if matched else None,
            'session_token': _decode(request.headers.get('X-Amz-Security-Token')),
            'sse': _decode(request.headers.get('x-amz-server-side-encryption')),
            'sse_kms_key_id': _decode(request.headers.get('x-amz-server-side-encryption-aws-kms-key-id')),
        })
        if self.deny_with:
            code, message = self.deny_with
        elif self.requests[-1]['access_key_id'] not in self.allowed_key_ids:
            code, message = ('InvalidAccessKeyId',
                             'The AWS Access Key Id you provided does not exist in our records.')
        else:
            return AWSResponse(request.url, 200, {'ETag': '"test"'}, _RawBody(b''))
        body = ERROR_BODY.format(code=code, message=message).encode()
        return AWSResponse(request.url, 403,
                           {'Content-Type': 'application/xml', 'Content-Length': str(len(body))},
                           _RawBody(body))


class FakeRegistry(dict):
    def __init__(self, settings):
        super().__init__()
        self.settings = settings


class FakeRequest:
    def __init__(self, registry, post):
        self.registry = registry
        self.POST = post
        self.content_type = 'multipart/form-data'
        self.path_info = f'/ingestion-submissions/{SUBMISSION_ID}/submit_for_ingestion'
        self.authenticated_userid = 'test-user'


class FakeQueueManager:
    def __init__(self):
        self.added = []

    def add_uuids(self, uuids, ingestion_type=None):
        self.added.append((uuids, ingestion_type))
        return uuids, []


def _datafile(content=b'test\tmetadata\tbundle\n'):
    storage = cgi.FieldStorage()
    storage.filename = 'test_submission.tsv'
    storage.file = io.BytesIO(content)
    return storage


@pytest.fixture(autouse=True)
def fresh_default_session():
    """boto3 caches credentials on a module-global default session; don't leak them between tests."""
    boto3.DEFAULT_SESSION = None
    yield
    boto3.DEFAULT_SESSION = None


@pytest.fixture
def task_role_environ(monkeypatch):
    """Stand in for an ECS task: temporary role credentials, no ambient AWS configuration."""
    for name, value in TASK_ROLE_ENVIRON.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv('IDENTITY', 'test-identity')
    monkeypatch.setenv('AWS_EC2_METADATA_DISABLED', 'true')
    monkeypatch.delenv('AWS_PROFILE', raising=False)
    monkeypatch.delenv('AWS_SHARED_CREDENTIALS_FILE', raising=False)
    monkeypatch.delenv('AWS_CONFIG_FILE', raising=False)


@pytest.fixture
def no_credentials_environ(monkeypatch, tmp_path):
    """An environment where the default credential chain resolves nothing at all."""
    monkeypatch.setenv('IDENTITY', 'test-identity')
    monkeypatch.setenv('AWS_DEFAULT_REGION', 'us-east-1')
    monkeypatch.setenv('AWS_EC2_METADATA_DISABLED', 'true')
    monkeypatch.setenv('AWS_SHARED_CREDENTIALS_FILE', str(tmp_path / 'absent-credentials'))
    monkeypatch.setenv('AWS_CONFIG_FILE', str(tmp_path / 'absent-config'))
    for name in ('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
                 'AWS_PROFILE', 'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
                 'AWS_CONTAINER_CREDENTIALS_FULL_URI'):
        monkeypatch.delenv(name, raising=False)


def _submit(wire, *, identity=None, encrypt=True):
    """Drive the real submit_for_ingestion view once against the fake wire."""

    def client_factory(*args, **kwargs):
        # A fresh session per call, so each test resolves credentials from its own environment.
        return wire.install(boto3.session.Session().client(*args, **kwargs))

    settings = {'metadata_bundles_bucket': BUNDLES_BUCKET, 'env.name': 'smaht-test'}
    if encrypt:
        settings['s3_encrypt_key_id'] = KMS_KEY_ID
    registry = FakeRegistry(settings)
    queue_manager = FakeQueueManager()
    registry[listener_module.INGESTION_QUEUE] = queue_manager
    request = FakeRequest(registry, {'datafile': _datafile(), 'ingestion_type': 'metadata_bundle'})
    instance = {'ingestion_type': 'metadata_bundle', '@id': f'/ingestion-submissions/{SUBMISSION_ID}/'}

    with mock.patch.object(boto3, 'client', client_factory), \
            mock.patch('snovault.util.assume_identity',
                       return_value=identity if identity is not None else IDENTITY_WITH_STATIC_KEYS), \
            mock.patch.object(listener_module, 'app_project', return_value=mock.MagicMock()), \
            mock.patch.object(listener_module, 'subrequest_object', return_value=instance), \
            mock.patch.object(listener_module, 'beanstalk_env_from_request', return_value='smaht-test'), \
            mock.patch.object(listener_module, 'is_stg_or_prd_env', return_value=False), \
            mock.patch.object(listener_module, 'get_trusted_email', return_value='submitter@example.org'):
        listener_module.submit_for_ingestion(None, request)
    return queue_manager


def test_ingestion_client_factory_is_available():
    """The pinned dcicsnovault must expose the ingestion-specific client factory."""
    assert hasattr(snovault_util, 'make_s3_client_for_ingestion')
    assert listener_module.make_s3_client_for_ingestion is snovault_util.make_s3_client_for_ingestion
    assert handler_module.make_s3_client_for_ingestion is snovault_util.make_s3_client_for_ingestion


def test_submit_for_ingestion_signs_with_task_role_not_static_user_keys(task_role_environ):
    """The metadata-bundle write must use the task role even while static keys are configured."""
    wire = FakeS3Wire()
    queue_manager = _submit(wire)

    assert wire.signing_key_ids, "no S3 request reached the wire"
    assert STATIC_USER_KEY not in wire.signing_key_ids
    assert set(wire.signing_key_ids) == {TASK_ROLE_KEY}
    # Both the datafile and the manifest are written, and the submission is queued.
    assert [record['url'].rsplit('/', 1)[-1] for record in wire.requests] == ['datafile.tsv', 'manifest.json']
    assert queue_manager.added == [([SUBMISSION_ID], 'metadata_bundle')]


def test_submit_for_ingestion_carries_the_temporary_session_token(task_role_environ):
    """Temporary credentials are useless without their session token."""
    wire = FakeS3Wire()
    _submit(wire)

    assert wire.requests
    for record in wire.requests:
        assert record['session_token'] == TASK_ROLE_TOKEN


def test_submit_for_ingestion_preserves_sse_kms(task_role_environ):
    """Changing the credential source must not change encryption behavior."""
    wire = FakeS3Wire()
    _submit(wire)

    assert wire.requests
    for record in wire.requests:
        assert record['sse'] == 'aws:kms'
        assert record['sse_kms_key_id'] == KMS_KEY_ID


def test_submit_for_ingestion_without_kms_key_sends_no_encryption_headers(task_role_environ):
    """A deployment with no KMS key configured keeps working, unencrypted."""
    wire = FakeS3Wire()
    _submit(wire, identity={}, encrypt=False)

    assert wire.requests
    for record in wire.requests:
        assert record['sse'] is None
        assert record['sse_kms_key_id'] is None


def test_submit_for_ingestion_surfaces_authorization_failure(task_role_environ):
    """A denied role must fail the submission, never fall back to the static user keys."""
    wire = FakeS3Wire(deny_with=('AccessDenied', 'Access Denied'))

    with pytest.raises(SubmissionFailure) as raised:
        _submit(wire)

    assert 'AccessDenied' in str(raised.value)
    assert STATIC_USER_KEY not in wire.signing_key_ids
    assert set(wire.signing_key_ids) == {TASK_ROLE_KEY}


def test_submit_for_ingestion_without_credentials_does_not_fall_back(no_credentials_environ):
    """With nothing in the chain the call must fail outright rather than reuse static keys."""
    wire = FakeS3Wire()

    with pytest.raises(NoCredentialsError):
        _submit(wire)

    assert STATIC_USER_KEY not in wire.signing_key_ids


def test_ingester_manifest_read_uses_task_role(task_role_environ):
    """The ingester task's own first S3 call must use the same identity as the portal task."""
    wire = FakeS3Wire()

    def client_factory(*args, **kwargs):
        return wire.install(boto3.session.Session().client(*args, **kwargs))

    with mock.patch.object(boto3, 'client', client_factory), \
            mock.patch('snovault.util.assume_identity', return_value=IDENTITY_WITH_STATIC_KEYS):
        client = handler_module.make_s3_client_for_ingestion()
        client.get_object(Bucket=BUNDLES_BUCKET, Key=f'{SUBMISSION_ID}/manifest.json')

    assert wire.signing_key_ids == [TASK_ROLE_KEY]
    assert wire.requests[0]['session_token'] == TASK_ROLE_TOKEN


def test_download_client_still_uses_static_keys(task_role_environ):
    """Scope guard: presigned download URLs keep their long-lived credential, and their lifetime.

    ``make_s3_client`` also backs ``build_s3_presigned_get_url`` (ExpiresIn=36h). A URL signed with
    temporary credentials stops working when that session expires, so this change deliberately does
    not touch it. If someone later repoints ``make_s3_client`` at the default chain, this fails.
    """
    with mock.patch('snovault.util.assume_identity', return_value=IDENTITY_WITH_STATIC_KEYS):
        client = snovault_util.make_s3_client()

    assert client._request_signer._credentials.access_key == STATIC_USER_KEY
