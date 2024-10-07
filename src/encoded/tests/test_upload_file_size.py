from collections import namedtuple
import pytest
from unittest import mock
import encoded.types.file

pytestmark = [pytest.mark.setone, pytest.mark.working]


@pytest.fixture
def some_file_json(file_formats, test_consortium, test_submission_center):
    return {
        'file_format': file_formats.get('BAM').get('uuid'),
        'md5sum': '00000000000000000000000000000000',
        'content_md5sum': '00000000000000000000000000000000',
        'filename': 'my.bam',
        'status': 'released',
        'consortia': [test_consortium['uuid']],
        'data_category': ['Sequencing Reads'],
        'data_type': ['Aligned Reads']
    }


def test_upload_file_size(testapp, submission_center_user_app, anontestapp, registry, some_file_json):

    # Test for new (2024-08-22) /files/{uuid}/upload_file_size endpoint (for smaht-submitr usage).

    system_user_app = testapp
    authenticated_user_app = submission_center_user_app
    unauthenticated_user_app = anontestapp

    file_size = 12345
    file_object = system_user_app.post_json('/output_file', some_file_json).json['@graph'][0]
    file_uuid = file_object["uuid"]
    file_upload_key = file_object["upload_key"]
    file_upload_key_nonexistent = "1eacdf1a-5f88-4f8e-87b6-812a19d33d58"
    file_upload_bucket = registry.settings.get("file_upload_bucket")

    # Mock boto3 s3 client which is used by this endpoint (see types/file.py/upload_file_size).
    def boto_client(service):
        def head_object(Bucket, Key):
            nonlocal file_size
            return {"ContentLength": file_size}
        assert service == "s3"
        return namedtuple("boto_client", ["head_object"])(head_object)

    with mock.patch.object(encoded.types.file, "boto_client", boto_client):

        # Happy path.
        response = authenticated_user_app.get(f'/files/{file_uuid}/upload_file_size', status=200)
        assert response.status_code == 200
        assert response.json == {"bucket": file_upload_bucket, "key": file_upload_key, "size": file_size}

        # Make sure we get HTTP 404 (not found) for non-existent file.
        response = authenticated_user_app.get(f'/files/{file_upload_key_nonexistent}/upload_file_size', status=404)
        assert response.status_code == 404

        # Make sure we get HTTP 403 (forbidden) for an unauthenticated (not logged in) user.
        response = unauthenticated_user_app.get(f'/files/{file_uuid}/upload_file_size', status=403)
        assert response.status_code == 403
