import pytest
import io
import csv
from itertools import permutations
from ..metadata import descend_field, TSV_WIDTH


class TestMetadataTSVHelper:


    @staticmethod
    def read_tsv_from_bytestream(bytestream):
        data = []
        bytestream = io.BytesIO(bytestream)
        with io.TextIOWrapper(bytestream, encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter='\t')
            for row in reader:
                data.append(row)
        return data

    @classmethod
    def check_key_and_length(cls, part, expected_key):
        assert expected_key in part
        assert len(part) == TSV_WIDTH

    @staticmethod
    def check_extra_file_name(rows):
        # Select by file identity and format, independently of the filename column.
        # The export sorts parents by UUID; this extra file is not necessarily last.
        download_path = '/output-files/76abf602-c1e6-4cbd-af3b-2c8b9a3dc31b/@@download/'
        matches = [row for row in rows if download_path in row[0] and row[0].endswith('.bai')]
        assert len(matches) == 1, 'Expected exactly one BAI extra-file row in the manifest'
        assert matches[0][2] == 'a_second_bam_bai.bai', (
            'NOTE: if you failed this test you changed the File manifest structure! Do NOT do so!'
        )

    @classmethod
    def check_type_length(cls, es_testapp, item_type, expected_count):
        res = es_testapp.post_json('/metadata/', {'type': item_type})
        tsv = res._app_iter[0]
        parsed = cls.read_tsv_from_bytestream(tsv)
        assert len(parsed[3:]) == expected_count


def _manifest_extra_row(filename='a_second_bam_bai.bai'):
    row = [''] * TSV_WIDTH
    row[0] = 'http://localhost/output-files/76abf602-c1e6-4cbd-af3b-2c8b9a3dc31b/@@download/SMAFI8LOZ6MU.bai'
    row[2] = filename
    return row


@pytest.mark.parametrize('filename', ['', 'wrong.bai', 'a_second_bam_bai.bai'])
def test_manifest_extra_filename_assertion(filename):
    rows = [_manifest_extra_row(filename)]
    if filename == 'a_second_bam_bai.bai':
        TestMetadataTSVHelper.check_extra_file_name(rows)
    else:
        with pytest.raises(AssertionError, match='File manifest structure'):
            TestMetadataTSVHelper.check_extra_file_name(rows)


@pytest.mark.parametrize('order', list(permutations(range(3))))
def test_manifest_extra_filename_independent_of_row_order(order):
    extra = _manifest_extra_row()
    parent = list(extra)
    parent[0] = parent[0].replace('.bai', '.bam')
    parent[2] = 'parent.bam'
    other = list(extra)
    other[0] = 'http://localhost/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/@@download/TSTFI2115172.vcf'
    other[2] = 'TSTFI2115172.vcf'  # The actual last row in the UUID-sorted workbook export.
    rows = [extra, parent, other]
    TestMetadataTSVHelper.check_extra_file_name([rows[index] for index in order])


@pytest.mark.parametrize('count', [0, 2])
def test_manifest_extra_filename_requires_one_matching_row(count):
    with pytest.raises(AssertionError, match='exactly one BAI extra-file row'):
        TestMetadataTSVHelper.check_extra_file_name([_manifest_extra_row() for _ in range(count)])


def test_manifest_extra_filename_rejects_moved_column():
    row = _manifest_extra_row()
    row[1], row[2] = row[2], ''
    with pytest.raises(AssertionError, match='File manifest structure'):
        TestMetadataTSVHelper.check_extra_file_name([row])


class DummyRequest:
    scheme = 'http'
    host = 'localhost'


class TestMetadataTSVWorkbook:

    @staticmethod
    @pytest.mark.parametrize('field_dict,list_of_names,expected', [
        ({
            'simple': 1
        }, ['simple'], 1),
        ({
             'href': '/download',
         }, ['href'], 'http://localhost/download'),
        ({
             'simple': 1
         }, ['not_simple', 'simple'], 1),
        ({
             'simple': 1
         }, ['not_simple'], None),
        ({
             'simple': {
                 'simple2': 1
             }
         }, ['simple.simple2'], 1),
        ({
             'simple': {
                 'simple2': 1
             }
         }, ['simple.simple3', 'simple.simple2'], 1),
        ({
            'simple': {
                'simple2': {
                    'dict': 1
                }
            }
        }, ['simple.simple2'], {'dict': 1}),  # this behavior, while generally undesirable, is easily spotted
        ({
             'simple': {
                 'simple2': ['array']
             }
         }, ['simple.simple2'], 'array'),
        ({
             'simple': {
                 'simple2': ['array1', 'array2']
             }
         }, ['simple.simple2'], 'array1,array2'),
        ({
             'simple': {
                 'simple2': [{'key': 'val1'}]
             }
         }, ['simple.simple2.key'], 'val1'),
        ({
             'simple': {
                 'simple2': [{'key': 'val1'}, {'key': 'val2'}]
             }
         }, ['simple.simple2.key'], 'val1,val2'),
        ({
             'simple': {
                 'simple2': {
                     'simple3': [{'key': 'val1'}, {'key': 'val2'}]
                 }
             }
         }, ['simple.simple2.simple3.key'], 'val1,val2'),
    ])
    def test_descend_field(field_dict, list_of_names, expected):
        """ Helper that tests that we can retrieve fields in various expected scenarios """
        assert descend_field(DummyRequest, field_dict, list_of_names) == expected

    @pytest.mark.workbook
    def test_metadata_tsv_workbook2(self, workbook, es_testapp):
        """ Tests we can process regular files in multiples in the workbook """
        es_testapp.post_json('/index', {})  # index the files
        res = es_testapp.post_json('/metadata/',
                                   {'type': 'File', 'include_extra_files': True})
        tsv = res._app_iter[0]
        assert b'Metadata TSV Download' in tsv
        assert b'/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/@@download' in tsv
        # parse and ensure structurally sound
        parsed = TestMetadataTSVHelper.read_tsv_from_bytestream(tsv)
        header1, header2, header3 = parsed[0], parsed[1], parsed[2]
        for row in parsed:  # check all rows got populated
            assert len(row) == TSV_WIDTH
        TestMetadataTSVHelper.check_key_and_length(header1, 'Metadata TSV Download')
        TestMetadataTSVHelper.check_key_and_length(header2, 'Suggested command to download: ')
        TestMetadataTSVHelper.check_key_and_length(header3, 'FileDownloadURL')
        assert len(parsed[3:]) == 26  # there are 26 entries in the workbook right now, including extra files
        # test for various types
        TestMetadataTSVHelper.check_type_length(es_testapp, 'AlignedReads', 4)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'UnalignedReads', 6)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'VariantCalls', 2)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'ReferenceFile', 2)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'OutputFile', 3)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'SupplementaryFile', 2)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'HistologyImage', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'ResourceFile', 1)
        TestMetadataTSVHelper.check_type_length(es_testapp, 'ExternalOutputFile', 1)


        res = es_testapp.post_json('/metadata/', {'type': 'OutputFile', 'include_extra_files': True})
        tsv = res._app_iter[0]
        parsed = TestMetadataTSVHelper.read_tsv_from_bytestream(tsv)
        # Keep filename in the third manifest column, without assuming which file sorts last.
        TestMetadataTSVHelper.check_extra_file_name(parsed[3:])
        # check an entire row that is mostly representative
        for row in parsed:
            if '303985cf-f1db-4dea-9782-2e68092d603d' in row[0]:  # this is the row
                assert row[2] == 'SMHT-FOO-BAR-M45-B003-DAC_SMAURF3ETDQJ_bwamem0.1.2_GRCh38.aligned.sorted.bam' # NOTE: This row should not be changed. Needed for file download
                assert row[9] == '1000'  # size
                assert row[11] == 'Aligned Reads'  # category
                assert row[12] == 'BAM'  # format
                assert row[13] == 'SMHT-0001'  # sample
                assert row[14] == 'Production'  # data set
                assert row[15] == 'Liver'  # tissue type
                assert row[16] == 'SMHT001'  # sample
                assert row[17] == 'Core'
                assert row[18] == 'DNA'
                assert row[19] == 'Illumina NovaSeq X'  # sequencing
                assert row[20] == 'Bulk WGS'  # assay
                assert row[21] == 'VEP (3.1.1)'  # software
                assert row[22] == 'GRCh38'  # reference genome
                assert row[26] == 'smaht-TEST_TISSUE_LIVER-illumina_novaseqx-Paired-end-150-R9-bulk_wgs'  # merge grp
                break

        # check download links are now download_cli
        res = es_testapp.post_json(
            "/metadata/", {"type": "File", "include_extra_files": True, "cli": True}
        )
        tsv = res._app_iter[0]
        assert b"Metadata TSV Download" in tsv
        assert (
            b"/output-files/cca15caa-bc11-4a6a-8998-ea0c69df8b9d/@@download_cli" in tsv
        )
        assert not (  # check that all URLs are @@download_cli
            b"/@@download/" in tsv
        )
        parsed = TestMetadataTSVHelper.read_tsv_from_bytestream(tsv)
        header_command_part = 'jq -r ".download_credentials | {AccessKeyId'
        assert header_command_part in parsed[1][3]  # this is where suggested command is

        # Manifest expansions
        # These rely on the same mechanisms as the file manifest, but
        # should probably still be tested more carefully...
        es_testapp.post_json('/metadata/', {
            'type': 'File',
            'include_extra_files': False,
            'manifest_enum': 2
        })
        es_testapp.post_json('/metadata/', {
            'type': 'File',
            'include_extra_files': False,
            'manifest_enum': 4
        })
        es_testapp.post_json('/metadata/', {
            'type': 'File',
            'include_extra_files': False,
            'manifest_enum': 5
        })

    @pytest.mark.workbook
    def test_peak_metadata_workbook(self, workbook, es_testapp):
        """ Tests we can peak at metadata for files and get facet information (just file size for now) """
        es_testapp.post_json('/index', {})  # index the files
        # check all types
        res = es_testapp.post_json('/peek-metadata/',
                                   {'type': 'File', 'include_extra_files': False}).json
        for facet in res:
            if facet['field'] == 'file_size':
                assert facet['count'] == 11
                assert facet['min'] == 1000.0
                assert facet['max'] == 100000.0
                assert facet['sum'] == 286000.0
            if facet['field'] == 'extra_files.file_size':
                raise AssertionError('Extra files information present when not desired')
        # check an individual type (with extra files)
        res = es_testapp.post_json('/peek-metadata/',
                                   {'type': 'OutputFile', 'include_extra_files': True}).json
        for facet in res:
            if facet['field'] == 'extra_files.file_size':
                assert facet['count'] == 3  # 2 + 1 extra files
                assert facet['min'] == 3000.0
                assert facet['max'] == 6000.0
                assert facet['sum'] == 14000.0
            if facet['field'] == 'file_size':
                assert facet['count'] == 2
                assert facet['min'] == 5000.0
                assert facet['max'] == 10000.0
                assert facet['sum'] == 15000.0
