from typing import Any, Dict
from uuid import uuid4

from webtest import TestApp
import pytest

from .utils import post_item, post_item_and_return_location


@pytest.fixture
def file_formats(testapp, test_consortium):
    """ Consortia attribute file formats taken from fourfront, could be pared down eventually """
    formats = {}
    ef_format_info = {
        'pairs_px2': {'standard_file_extension': 'pairs.gz.px2'},
        'pairsam_px2': {'standard_file_extension': 'sam.pairs.gz.px2'},
        'bai': {'standard_file_extension': 'bam.bai'},
        'beddb': {"standard_file_extension": "beddb"},
    }
    format_info = {
        'FASTQ': {
            'standard_file_extension': 'fastq.gz',
            'other_allowed_extensions': ['fq.gz'],
        },
        'pairs': {
            'standard_file_extension': 'pairs.gz',
            "extra_file_formats": ['pairs_px2', 'pairsam_px2'],
        },
        'BAM': {
            'standard_file_extension': 'bam',
            'extra_file_formats': ['bai'],
        },
        "CHAIN": {
            'standard_file_extension': 'chain.gz',
        },
        "FASTA": {
            'standard_file_extension': 'fasta',
            'other_allowed_extensions': ['fa']
        },
        'VCF': {"standard_file_extension": "vcf",},
        'mcool': {'standard_file_extension': 'mcool'},
        'zip': {'standard_file_extension': 'zip'},
        'chromsizes': {'standard_file_extension': 'chrom.sizes'},
        'other': {'standard_file_extension': ''},
        'bw': {'standard_file_extension': 'bw'},
        'bg': {'standard_file_extension': 'bedGraph.gz'},
        'bigbed': {'standard_file_extension': 'bb'},
        'bed': {"standard_file_extension": "bed.gz",
                "extra_file_formats": ['beddb']},
    }

    all_file_item_types = [
        "OutputFile",
        "ReferenceFile",
        "AlignedReads",
        "UnalignedReads",
        "VariantCalls",
        "SupplementaryFile"
    ]
    for eff, info in ef_format_info.items():
        info['identifier'] = eff
        info['uuid'] = str(uuid4())
        info['consortia'] = [test_consortium['@id']]
        if not info.get("valid_item_types"):
            info["valid_item_types"] = all_file_item_types
        formats[eff] = testapp.post_json('/file_format', info, status=201).json['@graph'][0]
    for ff, info in format_info.items():
        info['identifier'] = ff
        info['uuid'] = str(uuid4())
        if info.get('extra_file_formats'):
            eff2add = []
            for eff in info.get('extra_file_formats'):
                eff2add.append(formats[eff].get('@id'))
            info['extra_file_formats'] = eff2add
        info['consortia'] = [test_consortium['@id']]
        if not info.get("valid_item_types"):
            info["valid_item_types"] = all_file_item_types
        formats[ff] = testapp.post_json('/file_format', info, status=201).json['@graph'][0]
    return formats


def remote_user_testapp(app, remote_user: str) -> TestApp:
    '''Use this to generate testapp fixtures acting as different users (pass uuid) '''
    environ = {
        'HTTP_ACCEPT': 'application/json',
        'REMOTE_USER': str(remote_user),
    }
    return TestApp(app, environ)


TEST_SUBMISSION_CENTER_CODE = "test"
TEST_SECOND_SUBMISSION_CENTER_CODE = "secondtest"
TEST_SECOND_CENTER_SUBMITTED_ID_CODE = (
    TEST_SECOND_SUBMISSION_CENTER_CODE.upper()
)


@pytest.fixture
def test_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'identifier': 'SMaHTTestGCC',
        'title': 'SMaHT Test GCC',
        'code': TEST_SUBMISSION_CENTER_CODE,
    }
    return post_item_and_return_location(testapp, item, 'submission_center')


@pytest.fixture
def test_second_submission_center(testapp):
    """ Tests the posting of a submission center """
    item = {
        'identifier': 'SecondSMaHTTestGCC',
        'title': 'Second SMaHT Test GCC',
        'code': TEST_SECOND_SUBMISSION_CENTER_CODE,
    }
    return post_item_and_return_location(testapp, item, 'submission_center')


@pytest.fixture
def test_consortium(testapp):
    """ Tests the posting of a consortium """
    item = {
        'identifier': 'SMaHTConsortium',
        'title': 'SMaHT Test Consortium'
    }
    return post_item_and_return_location(testapp, item, 'consortium')


@pytest.fixture
def test_protected_consortium(testapp):
    """ Tests the posting of a consortium """
    item = {
        'identifier': 'SMaHTProtectedConsortium',
        'title': 'SMaHT Protected Test Consortium'
    }
    return post_item_and_return_location(testapp, item, 'consortium')


@pytest.fixture
def admin(testapp):
    item = {
        'first_name': 'Test',
        'last_name': 'Admin',
        'email': 'admin@example.org',
        'groups': ['admin'],
        'status': 'current'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_admin(testapp):
    item = {
        'first_name': 'Test',
        'last_name': 'Admin',
        'email': 'smaht_admin@example.org',
        'groups': ['admin'],
        'status': 'current'
    }
    # User @@object view has keys omitted.
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def blank_user(testapp):
    item = {
        'first_name': 'Unaffiliated',
        'last_name': 'User',
        'email': 'unaffiliated@example.org',
        'status': 'current'
    }
    # User @@object view has keys omitted.
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_gcc_user(testapp, test_submission_center, test_consortium):
    """ A GCC user would be a consortia member and a submission center member """
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'gcc_user@example.org',
        'status': 'current',
        'submission_centers': [
            test_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid']
        ],
        'submits_for': [
            test_submission_center['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188308'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_gcc_user_2(testapp, test_second_submission_center, test_consortium):
    """ A GCC user would be a consortia member and a submission center member """
    item = {
        'first_name': 'Test2',
        'last_name': 'User',
        'email': 'gcc_user2@example.org',
        'status': 'current',
        'submission_centers': [
            test_second_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid']
        ],
        'submits_for': [
            test_second_submission_center['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188309'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_consortium_user(testapp, test_consortium):
    """ Simulates a user who is a member of the consortia """
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'consortium_user@example.org',
        'status': 'current',
        'consortia': [
            test_consortium['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188309'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_consortium_protected_user(testapp, test_consortium, test_protected_consortium):
    """ Simulates a user with access to protected data """
    item = {
        'first_name': 'TestProtected',
        'last_name': 'User',
        'email': 'protected_user@example.org',
        'status': 'current',
        'consortia': [
            test_consortium['uuid'],
            test_protected_consortium['uuid']  # use of the protected consortia is obsolete but remains for
                                               # demonstration purposes if we do want to have "hidden" data
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188310',
        'groups': [  # This group now indicates "protected" access via the ability to download restricted files
            'dbgap'
        ]
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_consortium_protected_submitter(testapp, test_consortium, test_protected_consortium,
                                         test_submission_center):
    """ Simulates a user with access to protected data who is part of a submission center """
    item = {
        'first_name': 'TestProtected',
        'last_name': 'User',
        'email': 'protected_user@example.org',
        'status': 'current',
        'submission_centers': [
            test_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid'],
            test_protected_consortium['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188310'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_protected_gcc_user(testapp, test_submission_center, test_consortium, test_protected_consortium):
    """ A GCC user would be a consortia member and a submission center member """
    item = {
        'first_name': 'Test',
        'last_name': 'User',
        'email': 'user@example.org',
        'status': 'current',
        'submission_centers': [
            test_submission_center['uuid']
        ],
        'consortia': [
            test_consortium['uuid'],
            test_protected_consortium['uuid']
        ],
        'uuid': '47be2cf5-4e19-47ff-86cb-b7b3c4188311'
    }
    return post_item_and_return_location(testapp, item, 'user')


@pytest.fixture
def smaht_admin_app(testapp, smaht_admin):
    """ App associated with a consortia member who is a submitter """
    return remote_user_testapp(testapp.app, smaht_admin['uuid'])


@pytest.fixture
def submission_center_user_app(testapp, test_submission_center, smaht_gcc_user):
    """ App associated with a consortia member who is a submitter """
    return remote_user_testapp(testapp.app, smaht_gcc_user['uuid'])


@pytest.fixture
def submission_center2_user_app(testapp, test_second_submission_center, smaht_gcc_user_2):
    """ App associated with a consortia member who is a submitter """
    return remote_user_testapp(testapp.app, smaht_gcc_user_2['uuid'])


@pytest.fixture
def consortium_user_app(testapp, test_consortium, smaht_consortium_user):
    """ App associated with a normal consortia member """
    return remote_user_testapp(testapp.app, smaht_consortium_user['uuid'])


@pytest.fixture
def protected_consortium_user_app(testapp, smaht_consortium_protected_user, test_consortium, test_protected_consortium):
    """ App associated with a user who has access to consortia and protected data """
    return remote_user_testapp(testapp.app, smaht_consortium_protected_user['uuid'])


@pytest.fixture
def protected_consortium_submitter_app(testapp, smaht_consortium_protected_submitter, test_consortium,
                                       test_protected_consortium, test_submission_center):
    """ App associated with a user who has access to consortia and protected data and submission center """
    return remote_user_testapp(testapp.app, smaht_consortium_protected_submitter['uuid'])


@pytest.fixture
def unassociated_user_app(testapp, blank_user):
    """ App associated with a user who has no associations """
    return remote_user_testapp(testapp.app, blank_user['uuid'])


@pytest.fixture
def admin_user_app(testapp: TestApp, admin: Dict[str, Any]) -> TestApp:
    """ App associated with an admin user """
    return remote_user_testapp(testapp.app, admin['uuid'])


@pytest.fixture
def workflow(testapp: TestApp, test_consortium: Dict[str, Any]) -> Dict[str, Any]:
    item = {
        "name": "simply-the-best",
        "title": "A Great Workflow",
        "category": ["Annotation"],
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "workflow")


OUTPUT_FILE_UUID = "f99fe12f-79f9-4c2c-b0b5-07fc20d7ce1d"


@pytest.fixture
def output_file(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    file_formats: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    item = {
        "uuid": OUTPUT_FILE_UUID,
        "file_format": file_formats.get("BAM", {}).get("uuid", ""),
        "md5sum": "00000000000000000000000000000001",
        "filename": "my.bam",
        "status": "uploaded",
        "data_category": ["Sequencing Reads"],
        "data_type": ["Unaligned Reads"],
        "consortia": [test_consortium["uuid"]],
    }
    return post_item_and_return_location(testapp, item, "output_file")


@pytest.fixture
def access_key(testapp: TestApp) -> Dict[str, Any]:
    item = {
        "access_key_id": "abcd1234",
        "expiration_date": "2024-01-11T10:00:33.554416",
    }
    return post_item_and_return_location(testapp, item, "AccessKey")


@pytest.fixture
def meta_workflow(
    testapp: TestApp, test_consortium: Dict[str, Any], workflow: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "name": "a_beautiful_workflow",
        "title": "A beauty",
        "category": ["Alignment"],
        "version": "1.0.0",
        "workflows": [
            {
                "name": "some_workflow",
                "workflow": workflow["uuid"],
                "input": [
                    {"argument_name": "arg1", "argument_type": "parameter"},
                ],
                "config": {"instance_type": ["c5.4xlarge"], "run_name": "some_workflow"},
            },
        ]
    }
    return post_item_and_return_location(testapp, item, "MetaWorkflow")


@pytest.fixture
def higlass_view_config(
    testapp: TestApp,
    test_consortium: Dict[str, Any],
    test_submission_center: Dict[str, Any],
) -> Dict[str, Any]:
    item = {
        "consortia": [test_consortium["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "identifier": "some_view_config",
        "title": "A great view config",
        "view_config": {
            "whatever props": "anything",
        },
        "instance_height": 500,
    }
    return post_item(testapp, item, "HiglassViewConfig")


@pytest.fixture
def donor_properties(test_second_submission_center: Dict[str, Any]) -> Dict[str, Any]:
    """Donor properties not added to database.

    Useful for testing posting permissions.
    """
    return {
        "submission_centers": [test_second_submission_center["uuid"]],
        "submitted_id": f"{TEST_SECOND_CENTER_SUBMITTED_ID_CODE}_DONOR_1234",
        "age": 35,
        "sex": "Male",
        "tpc_submitted": "False",
        "external_id": "1234"
    }


@pytest.fixture
def donor(testapp: TestApp, donor_properties: Dict[str, Any]) -> Dict[str, Any]:
    return post_item(testapp, donor_properties, "Donor")


@pytest.fixture
def test_ontology(
    testapp,
    test_consortium
):
    item = {
        "identifier": "UBERON",
        "title": "Uberon",
        "consortia": [
            test_consortium["uuid"]
        ]
    }
    return post_item_and_return_location(testapp, item, 'ontology')


@pytest.fixture
def test_ontology_term(
    testapp,
    test_consortium,
    test_ontology
):
    item = {
        "identifier": "UBERON:0008952",
        "ontologies": [test_ontology["uuid"]],
        "title": "upper lobe of left lung",
        "consortia": [
           test_consortium["uuid"]
        ]
    }
    return post_item_and_return_location(testapp, item, 'ontology_term')


@pytest.fixture
def test_cell_line(
    testapp,
    test_submission_center,
    donor
):
    item = {
        "source": "test_source",
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_CELL-LINE_HELA",
        "title": "HeLa",
        "url": "https://www.atcc.org/products/ccl-2",
        "code": "HELA",
        "donor": donor["uuid"]
    }
    return post_item_and_return_location(testapp, item, 'cell_line')


@pytest.fixture
def test_cell_culture(
    testapp,
    test_submission_center,
    test_cell_line
):
    item = {
        "cell_line": [test_cell_line["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_CELL-CULTURE_HELA",
        "culture_duration": 15,
        "culture_start_date": "2023-12-25",
        "growth_medium": "EMEM",
        "passage_number": 14
    }
    return post_item_and_return_location(testapp, item, 'cell_culture')


@pytest.fixture
def test_cell_culture_sample(
    testapp,
    test_submission_center,
    test_cell_culture
):
    item = {
        "sample_sources": [test_cell_culture["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_CELL-CULTURE-SAMPLE_HELA",
        "preservation_type": "Frozen",
        "tags": [
            "test_sample_names",
            "sample_names-SMHTHELA",
            "test_sample_descriptions",
            "sample_descriptions-HELA",
            "test_sample_studies",
            "sample_studies-Benchmarking"
        ]
    }
    return post_item_and_return_location(testapp, item, 'cell_culture_sample')



@pytest.fixture
def test_assay(
    testapp,
    test_submission_center
):
    item = {
        "identifier": "bulk_wgs",
        "title": "Bulk WGS",
        "code": "002",
        "submission_centers": [test_submission_center["uuid"]],
        "valid_molecules": ["DNA"]
        }
    return post_item_and_return_location(testapp, item, 'assay')



@pytest.fixture
def test_analyte(
    testapp,
    test_submission_center,
    test_cell_culture_sample
):
    item = {
        "submitted_id": "TEST_ANALYTE_HELA_ONLY",
        "molecule_detail": [
            "Total DNA"
        ],
        "molecule": [
            "DNA"
        ],
        "a260_a280_ratio": 3.2,
        "concentration": 6.2,
        "concentration_unit": "ng/uL",
        "samples": [test_cell_culture_sample["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
    }
    return post_item_and_return_location(testapp, item, 'analyte')

@pytest.fixture
def test_sequencer(
    testapp,
    test_submission_center
):
    item = {
        "submission_centers": [test_submission_center["uuid"]],
        "identifier": "illumina_novaseqx",
        "platform": "Illumina",
        "model": "NovaSeq X",
        "read_length_category": [
            "Short-read"
        ],
        "code": "X"
    }
    return post_item_and_return_location(testapp, item, 'sequencer')


@pytest.fixture
def test_sequencing(
    testapp,
    test_submission_center,
    test_sequencer
):
    item = {
        "read_type": "Paired-end",
        "sequencer": test_sequencer["uuid"],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_SEQUENCING_NOVASEQ-500X",
        "flow_cell": "R9",
        "target_coverage": 500,
        "target_read_length": 150
    }
    return post_item_and_return_location(testapp, item, 'sequencing')


@pytest.fixture
def test_library(
    testapp,
    test_analyte,
    test_assay,
    test_submission_center
):
    item = {
        "analytes": [test_analyte["uuid"]],
        "assay": test_assay["uuid"],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_LIBRARY_HELA",
        "a260_a280_ratio": 3.2,
        "fragment_mean_length": 150.7,
        "insert_mean_length": 150.2,
    }
    return post_item_and_return_location(testapp, item, 'library')



@pytest.fixture
def test_fileset(
    testapp,
    test_library,
    test_sequencing,
    test_submission_center):
    item = {
        "libraries": [test_library["uuid"]],
        "sequencing": test_sequencing["uuid"],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_FILE-SET_HELA"
    }
    return post_item_and_return_location(testapp, item, 'file_set')


@pytest.fixture
def test_derived_paired_with(
    testapp,
    file_formats,
    test_fileset,
    test_submission_center,
    test_software
):
    item = {
        "file_format": file_formats.get("FASTQ", {}).get("uuid", ""),
        "file_sets": [test_fileset["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_UNALIGNED-READS_LIVER-FASTQ-R1",
        "data_category": [
            "Sequencing Reads"
        ],
        "data_type": [
            "Unaligned Reads"
        ],
        "filename": "some_fastq.fastq.gz",
        "read_pair_number": "R1",
        "file_size": 10000,
        "status": "released",
        "dataset": "colo829t",
        "flow_cell_barcode": "HAWT3ADXX",
        "flow_cell_lane": 1,
        "software": [test_software["uuid"]]
    }
    return post_item_and_return_location(testapp, item, 'unaligned_reads')


@pytest.fixture
def test_derived_from_file(
    testapp,
    file_formats,
    test_fileset,
    test_submission_center,
    test_derived_paired_with
):
    item = {
        "file_format": file_formats.get("FASTQ", {}).get("uuid", ""),
        "file_sets": [test_fileset["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_UNALIGNED-READS_LIVER-FASTQ-R2",
        "data_category": [
            "Sequencing Reads"
        ],
        "data_type": [
            "Unaligned Reads"
        ],
        "filename": "some_fastq_R2.fastq.gz",
        "read_pair_number": "R2",
        "file_size": 20000,
        "paired_with": test_derived_paired_with["uuid"],
        "status": "released",
        "sequencing_center": test_submission_center["uuid"],
        "annotated_filename": "SMHTHELA-X-X-F65-X002-test-SMAURV9YIJWF-X.fastq.gz",
        "dataset": "colo829t"
    }
    return post_item_and_return_location(testapp, item, 'unaligned_reads')


@pytest.fixture
def test_software(
    testapp,
    test_submission_center
):
    item = {
        "submission_centers": [
            test_submission_center["uuid"]
        ],
        "submitted_id": "TEST_SOFTWARE_BWA-MEM",
        "category": [
            "Alignment"
        ],
        "name": "bwa_mem_v1",
        "title": "BWA-MEM",
        "code": "bwamem",
        "version": "1.2.3"
    }
    return post_item_and_return_location(testapp, item, 'software')


@pytest.fixture
def donor_specific_assembly(
    testapp,
    test_submission_center,
    test_derived_from_file,
):
    item = {
        "submission_centers": [test_submission_center["uuid"]],
        "derived_from": [test_derived_from_file["uuid"]],
        "submitted_id": "TEST_DONOR-SPECIFIC-ASSEMBLY_HELA",
        "title": "Hela_DSA",
        "genome_size": 3100000000
    }
    return post_item_and_return_location(testapp, item, 'donor_specific_assembly')



@pytest.fixture
def test_chain_file(
    testapp,
    test_submission_center,
    file_formats,
    test_software,
    donor_specific_assembly
):
    item = {
        "submitted_id": "TEST_SUPPLEMENTARY-FILE_HELA_GRCH38",
        "data_category": [
            "Reference Conversion"
        ],
        "data_type": [
            "Chain File"
        ],
        "filename": "test_DSA_to_GRCh38.chain.gz",
        "file_format": file_formats.get("CHAIN", {}).get("uuid", ""),
        "submission_centers": [
            test_submission_center["uuid"]
        ],
        "software": [
            test_software["uuid"]
        ],
        "file_size": 1000,
        "sequencing_center": test_submission_center["uuid"],
        "donor_specific_assembly": donor_specific_assembly["uuid"],
        "target_assembly": "GRCh38",
        "source_assembly": "Hela_DSA"
    }
    return post_item_and_return_location(testapp, item, 'supplementary_file')


@pytest.fixture
def test_sequence_file(
    testapp,
    test_submission_center,
    file_formats,
    test_software,
    donor_specific_assembly
):
    item = {
        "submitted_id": "TEST_SUPPLEMENTARY-FILE_HELA_FASTA",
        "data_category": [
            "Reference Genome"
        ],
        "data_type": [
            "Reference Sequence"
        ],
        "filename": "test_hela.fasta",
        "file_format": file_formats.get("FASTA", {}).get("uuid", ""),
         "submission_centers": [
            test_submission_center["uuid"]
        ],
        "software": [
            test_software["uuid"]
        ],
        "sequencing_center": test_submission_center["uuid"],
        "file_size": 1000,
        "md5sum": "00000000000000000000000000000001",
        "donor_specific_assembly": donor_specific_assembly["uuid"],
    }
    return post_item_and_return_location(testapp, item, 'supplementary_file')
