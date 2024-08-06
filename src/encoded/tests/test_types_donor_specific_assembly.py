import pytest
from webtest import TestApp
from typing import Dict, Any

from .utils import get_insert_identifier_for_item_type, get_search, get_item, post_item_and_return_location


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
        "cell_line": test_cell_line["uuid"],
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
def test_basecalling(
    testapp,
    test_submission_center
):
    item = {
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_BASECALLING_DORADO",
        "title": "Dorado",
        "model": "dna_r10.4.1_e8.2_400bps_fast@v4.3.0",
        "version": "0.1.0",
        "gpu": "NVIDIA A100",
        "modification_tags": [
            "5mCG_5hmCG"
        ]
    }
    return post_item_and_return_location(testapp, item, 'basecalling')


@pytest.fixture
def test_sequencing(
    testapp,
    test_submission_center,
    test_sequencer,
    test_basecalling
):
    item = {
        "read_type": "Paired-end",
        "sequencer": test_sequencer["uuid"],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_SEQUENCING_NOVASEQ-500X",
        "flow_cell": "R9",
        "target_coverage": 500,
        "target_read_length": 150,
        "basecalling": test_basecalling["uuid"]
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
    test_submission_center
):
    item = {
        "file_format": file_formats.get("FASTQ", {}).get("uuid", ""),
        "file_sets": [test_fileset["uuid"]],
        "submission_centers": [test_submission_center["uuid"]],
        "submitted_id": "TEST_UNALIGNED-READS_FASTQ",
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
        "flow_cell_lane": 1
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
        "submitted_id": "TEST_UNALIGNED-READS_FASTQ_R2",
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
    test_software
):
    item = {
        "submission_centers": [test_submission_center["uuid"]],
        "derived_from": [test_derived_from_file["uuid"]],
        "submitted_id": "TEST_DONOR-SPECIFIC-ASSEMBLY_HELA",
        "title": "Hela_DSA",
        "software": [
           test_software["uuid"]
        ],
        "genome_size": 3100000000,
        "total_ungapped_length": 2900000000,
        "number_of_chromosomes": 23,
        "number_of_scaffolds": 470,
        "number_of_contigs": 1000,
        "contig_n50": 50000000,
        "scaffold_n50": 67000000
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


####### FIXTURE TESTS ##### 
def test_sequence_files_rev_link(
    testapp: TestApp,
    test_chain_file: Dict[str, Any],
    test_sequence_file: Dict[str, Any],
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure sequence files rev link works."""
    item = get_item(
        testapp,
        donor_specific_assembly["uuid"],
        collection="DonorSpecificAssembly",
        frame="object"
    )
    assert len(item.get("sequence_files","")) == 1


def test_chain_files_rev_link(
    testapp: TestApp,
    test_chain_file: Dict[str, Any],
    test_sequence_file: Dict[str, Any],
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure sequence files rev link works."""
    item = get_item(
        testapp,
        donor_specific_assembly["uuid"],
        collection="DonorSpecificAssembly",
        frame="object"
    )
    assert len(item.get("chain_files","")) == 1


def test_cell_lines_calc_prop(
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure the cell line calcprop works."""
    assert len(donor_specific_assembly.get("cell_lines",[])) == 1


def test_donors_calc_prop(
    donor_specific_assembly: Dict[str, Any]
) -> None:
    """Ensure the cell line calcprop works."""
    assert len(donor_specific_assembly.get("donors",[])) == 1

####### WORKBOOK TESTS #####

@pytest.mark.workbook
def test_searchable_as_reference_genome(es_testapp: TestApp, workbook: None) -> None:
    """Ensure DonorSpecificAssemblies can be searched in ReferenceGenome.
    """

    uuid = get_insert_identifier_for_item_type(
        es_testapp,
        "DonorSpecificAssembly"
    )
    get_search(
        es_testapp,
        f"/search/?type=ReferenceGenome&uuid={uuid}",
        status=200
    )


@pytest.mark.workbook
def test_dsa_reference_genome_collection(es_testapp: TestApp, workbook: None) -> None:
    """Ensure DonorSpecificAssemblies can be found in the ReferenceGenome collection.
    """

    uuid = get_insert_identifier_for_item_type(
        es_testapp,
        "DonorSpecificAssembly"
    )
    get_item(
        es_testapp,
        uuid,
        collection="ReferenceGenome",
        status=301
    )


@pytest.mark.workbook
def test_es_sequence_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure sequence files rev link works."""
    fa_file_set_search = get_search(
        es_testapp,
        "?type=DonorSpecificAssembly&sequence_files.uuid!=No+value"
    )
    assert fa_file_set_search


@pytest.mark.workbook
def test_es_chain_files_rev_link(es_testapp: TestApp, workbook: None) -> None:
    """Ensure chain files rev link works."""
    chain_file_set_search = get_search(
        es_testapp,
        "?type=DonorSpecificAssembly&chain_files.uuid!=No+value"
    )
    assert chain_file_set_search


@pytest.mark.workbook
def test_es_donors_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure donors calcprop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"DonorSpecificAssembly")
    dsa=get_item(
        es_testapp,
        uuid,
        collection='DonorSpecificAssembly',
    )
    assert len(dsa.get("donors",[])) == 1


@pytest.mark.workbook
def test_es_cell_lines_calc_prop(es_testapp: TestApp, workbook: None) -> None:
    """Ensure the cell line calcprop works."""
    uuid=get_insert_identifier_for_item_type(es_testapp,"DonorSpecificAssembly")
    dsa=get_item(
        es_testapp,
        uuid,
        collection='DonorSpecificAssembly',
        frame="object"
    )
    assert len(dsa.get("cell_lines",[])) == 1

