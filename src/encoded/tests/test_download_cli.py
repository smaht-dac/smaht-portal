import pytest
from ..download_cli import extract_bucket_and_key


@pytest.mark.parametrize('url, expected', [
    ('https://test-bucket.s3.com/file.bam',
     ('test-bucket', 'file.bam')),
    ('http://test-bucket.s3.amazonaws.com/file.bam',
     ('test-bucket', 'file.bam')),
    ('https://test-bucket.s3.amazonaws.com/file.bam',
     ('test-bucket', 'file.bam')),
    ('https://smaht-unit-testing-wfout.s3.amazonaws.com/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/TSTFI0211073.bam',
     ('smaht-unit-testing-wfout', 'cca15caa-bc11-4a6a-8998-ea0c69df8b9d/TSTFI0211073.bam'))
])
def test_extract_bucket_and_key(url, expected):
    """ Tests the helper function for pulling bucket/key information from a URL """
    bucket, key = extract_bucket_and_key(url)
    assert bucket == expected[0]
    assert key == expected[1]


def _test_uri_get(es_testapp, uri):
    """ Helper functions that tests that we can get back download creds via GET """
    res = es_testapp.get(f'/download_cli/?item={uri}').json['upload_credentials']
    assert 'AccessKeyId' in res
    assert 'ASIA' in res['AccessKeyId']  # only real check we can do that this key is real
    assert 'SecretAccessKey' in res
    assert 'SessionToken' in res


def _test_uri_post(es_testapp, uri):
    """ Helper functions that tests that we can get back download creds via POST """
    res = es_testapp.post_json('/download_cli/', {
        'item': f'{uri}'
    }).json['upload_credentials']
    assert 'AccessKeyId' in res
    assert 'ASIA' in res['AccessKeyId']  # only real check we can do that this key is real
    assert 'SecretAccessKey' in res
    assert 'SessionToken' in res


@pytest.mark.workbook
def test_download_cli_workbook_post(workbook, es_testapp):
    """ Tests that we can retrieve federation tokens for regular and extra files """
    item = es_testapp.get('/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/').json
    atid, uuid, accession = item['@id'], item['uuid'], item['accession']
    # test failure cases
    es_testapp.post_json('/download_cli/', {
        'not_item': 'doesnt matter'
    }, status=400)
    es_testapp.post_json('/download_cli/', {}, status=400)
    # test with @@download
    _test_uri_post(es_testapp, f'{atid}@@download')
    _test_uri_post(es_testapp, f'/{uuid}/@@download')
    _test_uri_post(es_testapp, f'/{accession}/@@download')
    # test without @@download
    _test_uri_post(es_testapp, f'{atid}')
    _test_uri_post(es_testapp, f'/{uuid}')
    _test_uri_post(es_testapp, f'/{accession}')
    # test extra file 1 with @@download
    # NOTE: dummy data that doesn't use the accession as the file name
    # does NOT work to download!
    _test_uri_post(es_testapp, f'{atid}@@download/TSTFI2115172.bai')
    _test_uri_post(es_testapp, f'/{uuid}/@@download/TSTFI2115172.bai')
    _test_uri_post(es_testapp, f'/{accession}/@@download/TSTFI2115172.bai')
    # test extra file 2 with @@download
    _test_uri_post(es_testapp, f'{atid}@@download/TSTFI2115172.vcf')
    _test_uri_post(es_testapp, f'/{uuid}/@@download/TSTFI2115172.vcf')
    _test_uri_post(es_testapp, f'/{accession}/@@download/TSTFI2115172.vcf')


@pytest.mark.workbook
def test_download_cli_workbook_get(workbook, es_testapp):
    """ Runs the above tests using the GET version of the API """
    item = es_testapp.get('/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/').json
    atid, uuid, accession = item['@id'], item['uuid'], item['accession']
    # test failure cases
    es_testapp.get(f'/download_cli/?not_item=blah', status=400)
    es_testapp.get(f'/download_cli/', status=400)
    # test with @@download
    _test_uri_get(es_testapp, f'{atid}@@download')
    _test_uri_get(es_testapp, f'/{uuid}/@@download')
    _test_uri_get(es_testapp, f'/{accession}/@@download')
    # test without @@download
    _test_uri_get(es_testapp, f'{atid}')
    _test_uri_get(es_testapp, f'/{uuid}')
    _test_uri_get(es_testapp, f'/{accession}')
    # test extra file 1 with @@download
    # NOTE: dummy data that doesn't use the accession as the file name
    # does NOT work to download!
    _test_uri_get(es_testapp, f'{atid}@@download/TSTFI2115172.bai')
    _test_uri_get(es_testapp, f'/{uuid}/@@download/TSTFI2115172.bai')
    _test_uri_get(es_testapp, f'/{accession}/@@download/TSTFI2115172.bai')
    # test extra file 2 with @@download
    _test_uri_get(es_testapp, f'{atid}@@download/TSTFI2115172.vcf')
    _test_uri_get(es_testapp, f'/{uuid}/@@download/TSTFI2115172.vcf')
    _test_uri_get(es_testapp, f'/{accession}/@@download/TSTFI2115172.vcf')