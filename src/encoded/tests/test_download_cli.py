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
    if '@@download_cli' not in uri:
        uri = f'{uri}@@download_cli'
    res = es_testapp.get(uri).json['download_credentials']
    assert 'AccessKeyId' in res
    assert 'ASIA' in res['AccessKeyId']  # only real check we can do that this key is real
    assert 'SecretAccessKey' in res
    assert 'SessionToken' in res


@pytest.mark.workbook
def test_download_cli_workbook_get(workbook, es_testapp):
    """ Runs the above tests using the GET version of the API """
    item = es_testapp.get('/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/').json
    atid, uuid, accession = item['@id'], item['uuid'], item['accession']
    # test failure cases
    es_testapp.get(f'/blah/download_cli/', status=404)
    es_testapp.get(f'//download_cli/', status=404)
    # test with @@download
    _test_uri_get(es_testapp, f'{atid}')
    _test_uri_get(es_testapp, f'/{uuid}/')
    _test_uri_get(es_testapp, f'/{accession}/')
    # test without @@download
    _test_uri_get(es_testapp, f'{atid}')
    _test_uri_get(es_testapp, f'/{uuid}/')
    _test_uri_get(es_testapp, f'/{accession}/')
    # test extra file 1 with @@download
    # NOTE: dummy data that doesn't use the accession as the file name
    # does NOT work to download!
    _test_uri_get(es_testapp, f'{atid}@@download_cli/TSTFI2115172.bai')
    _test_uri_get(es_testapp, f'/{uuid}/@@download_cli/TSTFI2115172.bai')
    _test_uri_get(es_testapp, f'/{accession}/@@download_cli/TSTFI2115172.bai')
    # test extra file 2 with @@download
    _test_uri_get(es_testapp, f'{atid}@@download_cli/TSTFI2115172.vcf')
    _test_uri_get(es_testapp, f'/{uuid}/@@download_cli/TSTFI2115172.vcf')
    _test_uri_get(es_testapp, f'/{accession}/@@download_cli/TSTFI2115172.vcf')
