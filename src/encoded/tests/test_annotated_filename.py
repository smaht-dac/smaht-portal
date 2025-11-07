from unittest import mock
from contextlib import contextmanager
from typing import Any, Dict, List, Tuple

import pytest
from webtest import TestApp

from .utils import get_search
from ..commands.create_annotated_filenames import (
    DEFAULT_ABSENT_FIELD,
    DEFAULT_PROJECT_ID,
    FILENAME_SEPARATOR,
    AnnotatedFilename,
    FilenamePart,
    collect_errors,
    get_aliquot_id,
    get_analysis,
    get_annotated_filename,
    get_donor_sex_and_age,
    get_exclusive_filename_part,
    get_file_extension,
    get_filename_part,
    get_filename_part_for_values,
    get_project_id,
    get_protocol_id,
    get_sample_source_id,
    get_sequencing_and_assay_codes,
    get_sequencing_center_code,
    get_software_and_versions,
)
from ..item_utils import constants, file as file_utils, item as item_utils
from ..item_utils.utils import RequestHandler


def get_request_handler(testapp: TestApp) -> RequestHandler:
    return RequestHandler(test_app=testapp)


def get_submitted_files_with_annotated_filenames(
    testapp: TestApp,
) -> List[Dict[str, Any]]:
    """Get submitted files with annotated filenames.

    Presence of annotated filename indicates file is to be used for
    tests.
    """
    return get_search(testapp, "?type=File&annotated_filename!=No+value")


def parse_annotated_filename(file: Dict[str, Any]) -> AnnotatedFilename:
    """Parse annotated filename."""
    annotated_filename = file_utils.get_annotated_filename(file)
    filename_parts = annotated_filename.split(FILENAME_SEPARATOR)
    assert len(filename_parts) == 8, (
        f"Expected 8 parts in annotated filename for file {item_utils.get_uuid(file)}"
        f" but found {len(filename_parts)} parts."
    )
    project_and_sample_source_part = filename_parts[0]
    project_id, sample_source_id = parse_project_and_sample_source_part(
        project_and_sample_source_part
    )
    analysis, extension = parse_analysis_and_extension_part(filename_parts[-1])
    return AnnotatedFilename(
        project_id=project_id,
        sample_source_id=sample_source_id,
        protocol_id=filename_parts[1],
        aliquot_id=filename_parts[2],
        donor_sex_and_age=filename_parts[3],
        sequencing_and_assay_codes=filename_parts[4],
        sequencing_center_code=filename_parts[5],
        accession=filename_parts[6],
        analysis_info=analysis,
        file_extension=extension,
        errors=[],
    )


def parse_project_and_sample_source_part(
    project_and_sample_source_part: str,
) -> Tuple[str, str]:
    """Parse project and sample source IDs from annotated filename."""
    if project_and_sample_source_part.startswith(constants.BENCHMARKING_PREFIX):
        project_id = constants.BENCHMARKING_PREFIX
        sample_source_id = remove_prefix(
            project_and_sample_source_part, constants.BENCHMARKING_PREFIX
        )
    elif project_and_sample_source_part.startswith(constants.PRODUCTION_PREFIX):
        project_id = constants.PRODUCTION_PREFIX
        sample_source_id = remove_prefix(
            project_and_sample_source_part, constants.PRODUCTION_PREFIX
        )
    else:
        project_id = ""
        sample_source_id = project_and_sample_source_part
    return project_id, sample_source_id


def remove_prefix(string: str, prefix: str) -> str:
    """Remove prefix from string."""
    return string[len(prefix) :]


def parse_analysis_and_extension_part(
    analysis_and_extension_part: str,
) -> Tuple[str, str]:
    """Parse analysis and extension from annotated filename."""
    if analysis_and_extension_part.startswith("."):
        analysis = ""
        extension = analysis_and_extension_part
    else:
        parts = analysis_and_extension_part.split(".")
        analysis = ""
        extension = ""
        for index, part in enumerate(parts):
            if index == 0:
                to_add = part
                analysis += to_add
            else:
                to_add = f".{part}"
                if has_starting_digit(part):
                    analysis += to_add
                elif extension:
                    extension += to_add
                else:
                    extension = part
    return analysis, extension


def has_starting_digit(string: str) -> bool:
    """Check if string has starting digit."""
    return string[0].isdigit()


@pytest.mark.workbook
def test_get_annotated_filename(es_testapp: TestApp, workbook: None) -> None:
    """Test annotated filename creation.

    Assume here that the annotated filenames on workbook files are
    correct.

    Serves as integrated test for the annotated filename creation.
    """
    request_handler = get_request_handler(es_testapp)
    files = get_submitted_files_with_annotated_filenames(es_testapp)
    assert files, "No files with annotated filenames found."
    for file in files:
        expected_string = file_utils.get_annotated_filename(file)
        expected = parse_annotated_filename(file)
        result = get_annotated_filename(file, request_handler)
        assert not result.errors
        errors = collect_differences(result, expected)
        if errors:
            errors_string = "\n".join(errors)
            assert False, (
                f"Expected annotated filename {expected} for file"
                f" {item_utils.get_uuid(file)} but found {result}."
                f" Differences:\n{errors_string}"
            )
        assert str(result) == expected_string, (
            f"Expected annotated filename {expected_string} for file"
            f" {item_utils.get_uuid(file)} but found {result}."
        )


def collect_differences(
    result: AnnotatedFilename, expected: AnnotatedFilename
) -> List[str]:
    """Collect differences between annotated filenames."""
    errors = []
    if result.project_id != expected.project_id:
        errors.append(f"Project ID: {expected.project_id} != {result.project_id}")
    if result.sample_source_id != expected.sample_source_id:
        errors.append(
            f"Sample source ID: {expected.sample_source_id} !="
            f" {result.sample_source_id}"
        )
    if result.protocol_id != expected.protocol_id:
        errors.append(f"Protocol ID: {expected.protocol_id} != {result.protocol_id}")
    if result.aliquot_id != expected.aliquot_id:
        errors.append(f"Aliquot ID: {expected.aliquot_id} != {result.aliquot_id}")
    if result.donor_sex_and_age != expected.donor_sex_and_age:
        errors.append(
            f"Donor sex and age: {expected.donor_sex_and_age} !="
            f" {result.donor_sex_and_age}"
        )
    if result.sequencing_and_assay_codes != expected.sequencing_and_assay_codes:
        errors.append(
            f"Sequencing and assay codes: {expected.sequencing_and_assay_codes} !="
            f" {result.sequencing_and_assay_codes}"
        )
    if result.sequencing_center_code != expected.sequencing_center_code:
        errors.append(
            f"Sequencing center code: {expected.sequencing_center_code} !="
            f" {result.sequencing_center_code}"
        )
    if result.accession != expected.accession:
        errors.append(f"Accession: {expected.accession} != {result.accession}")
    if result.analysis_info != expected.analysis_info:
        errors.append(
            f"Analysis info: {expected.analysis_info} != {result.analysis_info}"
        )
    if result.file_extension != expected.file_extension:
        errors.append(
            f"File extension: {expected.file_extension} != {result.file_extension}"
        )
    return errors


@pytest.mark.parametrize(
    "filename_parts,expected_value,expected_errors",
    [
        ([], "", True),
        ([get_filename_part(value="foo")], "foo", False),
        ([get_filename_part(value="foo"), get_filename_part(value="bar")], "", True),
        (
            [get_filename_part(value="foo"), get_filename_part(value="foo")],
            "foo",
            False,
        ),
    ],
)
def test_get_exclusive_filename_part(
    filename_parts: List[FilenamePart], expected_value: str, expected_errors: bool
) -> None:
    """Test exclusive filename part retrieval."""
    part_name = "test"
    result = get_exclusive_filename_part(filename_parts, part_name)
    assert_filename_part_matches(result, expected_value, expected_errors)
    if expected_errors:
        assert any(part_name in error for error in result.errors)


def assert_filename_part_matches(
    part: FilenamePart, expected_value: str, expected_errors: bool
) -> None:
    """Assert filename part matches expected value and errors."""
    assert isinstance(part, FilenamePart)
    assert part.value == expected_value
    assert bool(part.errors) == expected_errors


@pytest.mark.parametrize(
    "values,expected_value,expected_errors",
    [
        ([], "", True),
        (["foo"], "foo", False),
        (["foo", "bar"], "", True),
        (["foo", "foo"], "foo", False),
    ],
)
def test_get_filename_part_for_values(
    values: List[str], expected_value: str, expected_errors: bool
) -> None:
    """Test filename part retrieval for values."""
    part_name = "test"
    result = get_filename_part_for_values(values, part_name)
    assert_filename_part_matches(result, expected_value, expected_errors)
    if expected_errors:
        assert any(part_name in error for error in result.errors)


SOME_ITEM = {"uuid": "some-uuid"}
MIXTURE_CODE = "mixture_code"
SOME_CELL_CULTURE_MIXTURE = {"uuid": "some-uuid", "code": MIXTURE_CODE}
CELL_LINE_CODE = "cell_line_code"
SOME_CELL_LINE = {"uuid": "some-uuid", "code": CELL_LINE_CODE}
TISSUE_PROJECT_ID = "ST"
TISSUE_DONOR_KIT_ID = "100"
TISSUE_PROTOCOL_ID = "1A"
TISSUE_EXTERNAL_ID = f"{TISSUE_PROJECT_ID}{TISSUE_DONOR_KIT_ID}-{TISSUE_PROTOCOL_ID}"
SOME_TISSUE = {"uuid": "some-uuid", "external_id": TISSUE_EXTERNAL_ID}
ANOTHER_TISSUE = {"uuid": "another-uuid", "external_id": "SMHT100-1B"}


@pytest.mark.parametrize(
    "cell_culture_mixtures,cell_lines,tissues,expected,errors",
    [
        ([], [], [], "", True),
        ([SOME_CELL_CULTURE_MIXTURE], [], [], DEFAULT_PROJECT_ID, False),
        ([], [SOME_CELL_LINE], [], DEFAULT_PROJECT_ID, False),
        ([SOME_CELL_CULTURE_MIXTURE], [SOME_CELL_LINE], [], DEFAULT_PROJECT_ID, False),
        ([], [], [SOME_TISSUE], TISSUE_PROJECT_ID, False),
        ([SOME_CELL_CULTURE_MIXTURE], [], [SOME_TISSUE], "", True),
        ([], [SOME_CELL_LINE], [SOME_TISSUE], "", True),
        ([], [], [SOME_TISSUE, SOME_TISSUE], TISSUE_PROJECT_ID, False),
        (
            [SOME_CELL_CULTURE_MIXTURE],
            [SOME_CELL_LINE],
            [ANOTHER_TISSUE],
            DEFAULT_PROJECT_ID,
            False,
        ),
        ([], [], [SOME_TISSUE, ANOTHER_TISSUE], "", True),
        ([], [], [SOME_TISSUE, SOME_ITEM], "", True),
    ],
)
def test_get_project_id(
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissues: List[Dict[str, Any]],
    expected: str,
    errors: bool,
) -> None:
    """Test project ID retrieval for annotated filenames."""
    result = get_project_id(cell_culture_mixtures, cell_lines, tissues)
    assert_filename_part_matches(result, expected, errors)


@contextmanager
def patch_is_only_cell_culture_mixture_derived(value: bool) -> mock.MagicMock:
    """Patch is_only_cell_culture_mixture_derived."""
    with mock.patch(
        (
            "encoded.commands.create_annotated_filenames"
            ".is_only_cell_culture_mixture_derived"
        ),
        return_value=value,
    ) as mock_is_only_cell_culture_mixture_derived:
        yield mock_is_only_cell_culture_mixture_derived


@pytest.mark.parametrize(
    "only_mixture_derived,cell_culture_mixtures,cell_lines,tissues,expected,errors",
    [
        (False, [], [], [], "", True),
        (True, [SOME_CELL_CULTURE_MIXTURE], [], [], MIXTURE_CODE, False),
        (True, [SOME_CELL_CULTURE_MIXTURE, SOME_ITEM], [], [], "", True),
        (False, [], [SOME_CELL_LINE], [], CELL_LINE_CODE, False),
        (False, [], [SOME_CELL_LINE, SOME_ITEM], [], "", True),
        (False, [], [], [SOME_TISSUE], TISSUE_DONOR_KIT_ID, False),
        (False, [], [], [SOME_TISSUE, SOME_ITEM], "", True),
        (False, [SOME_CELL_CULTURE_MIXTURE], [SOME_CELL_LINE], [SOME_TISSUE], "", True),
    ],
)
def test_get_sample_source_id(
    only_mixture_derived: bool,
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissues: List[Dict[str, Any]],
    expected: str,
    errors: bool,
) -> None:
    """Test sample source ID retrieval for annotated filenames."""
    with patch_is_only_cell_culture_mixture_derived(only_mixture_derived):
        result = get_sample_source_id([], cell_culture_mixtures, cell_lines, tissues)
        assert_filename_part_matches(result, expected, errors)


@pytest.mark.parametrize(
    "cell_culture_mixtures,cell_lines,tissues,expected,errors",
    [
        ([], [], [], "", True),
        ([SOME_CELL_CULTURE_MIXTURE], [], [], DEFAULT_ABSENT_FIELD, False),
        ([], [SOME_CELL_LINE], [], DEFAULT_ABSENT_FIELD, False),
        (
            [SOME_CELL_CULTURE_MIXTURE],
            [SOME_CELL_LINE],
            [],
            DEFAULT_ABSENT_FIELD,
            False,
        ),
        ([], [], [SOME_TISSUE], TISSUE_PROTOCOL_ID, False),
        ([], [], [SOME_TISSUE, ANOTHER_TISSUE], "", True),
        ([], [], [SOME_TISSUE, SOME_ITEM], "", True),
        ([SOME_CELL_CULTURE_MIXTURE], [], [SOME_TISSUE], "", True),
        ([], [SOME_CELL_LINE], [SOME_TISSUE], "", True),
    ],
)
def test_get_protocol_id(
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissues: List[Dict[str, Any]],
    expected: str,
    errors: bool,
) -> None:
    """Test protocol ID retrieval for annotated filenames."""
    result = get_protocol_id(cell_culture_mixtures, cell_lines, tissues)
    assert_filename_part_matches(result, expected, errors)


TISSUE_SAMPLE_ALIQUOT_ID = "100A3"
TISSUE_SAMPLE_ALIQUOT_ID2 = "101B2"
TISSUE_SAMPLE_ALIQUOT_ID3 = "100B2"

TISSUE_SAMPLE_EXTERNAL_ID = f"{TISSUE_EXTERNAL_ID}-{TISSUE_SAMPLE_ALIQUOT_ID}"
TISSUE_SAMPLE_EXTERNAL_ID2 = f"{TISSUE_EXTERNAL_ID}-{TISSUE_SAMPLE_ALIQUOT_ID2}"
TISSUE_SAMPLE_EXTERNAL_ID3 = f"{TISSUE_EXTERNAL_ID}-{TISSUE_SAMPLE_ALIQUOT_ID3}"

SOME_CORE_TISSUE_SAMPLE = {"category": "Core", "external_id": TISSUE_SAMPLE_EXTERNAL_ID}
CORE_TISSUE_SAMPLE2 = {"category": "Core", "external_id": TISSUE_SAMPLE_EXTERNAL_ID2}
CORE_TISSUE_SAMPLE3 = {"category": "Core", "external_id": TISSUE_SAMPLE_EXTERNAL_ID3}

TPC_TISSUE_SAMPLE = {
    "category": "Core", 
    "external_id": TISSUE_SAMPLE_EXTERNAL_ID
}

SOME_HOMOGENATE_TISSUE_SAMPLE = {
    "category": "Homogenate",
    "external_id": TISSUE_SAMPLE_EXTERNAL_ID,
}
SOME_LIQUID_TISSUE_SAMPLE = {
    "category": "Liquid",
    "external_id": TISSUE_SAMPLE_EXTERNAL_ID,
}
SOME_OTHER_TISSUE_SAMPLE = {"category": "Core", "external_id": "SN001-01-010A1"}

@pytest.mark.parametrize(
    "cell_culture_mixtures,cell_lines,tissue_samples,expected,errors",
    [
        ([], [], [], "", True),
        ([SOME_CELL_CULTURE_MIXTURE], [], [], DEFAULT_ABSENT_FIELD, False),
        ([], [SOME_CELL_LINE], [], DEFAULT_ABSENT_FIELD, False),
        (
            [SOME_CELL_CULTURE_MIXTURE],
            [SOME_CELL_LINE],
            [],
            DEFAULT_ABSENT_FIELD,
            False,
        ),
        ([], [], [SOME_OTHER_TISSUE_SAMPLE, SOME_CORE_TISSUE_SAMPLE], "", True),
        ([], [], [SOME_CORE_TISSUE_SAMPLE], TISSUE_SAMPLE_ALIQUOT_ID, False),
        ([], [], [SOME_CORE_TISSUE_SAMPLE,CORE_TISSUE_SAMPLE2], "MAMC", False),
        ([], [], [SOME_CORE_TISSUE_SAMPLE,CORE_TISSUE_SAMPLE3], "100MC", False),
        ([], [], [SOME_CORE_TISSUE_SAMPLE,CORE_TISSUE_SAMPLE3], "100MC", False),
        ([], [], [SOME_CORE_TISSUE_SAMPLE,TPC_TISSUE_SAMPLE], TISSUE_SAMPLE_ALIQUOT_ID, False),
        ([], [], [SOME_HOMOGENATE_TISSUE_SAMPLE], DEFAULT_ABSENT_FIELD * 2, False),
        ([], [], [SOME_LIQUID_TISSUE_SAMPLE], DEFAULT_ABSENT_FIELD * 2, False),
        ([], [], [SOME_CORE_TISSUE_SAMPLE, SOME_HOMOGENATE_TISSUE_SAMPLE], "MAMC", False),
        ([SOME_CELL_CULTURE_MIXTURE], [], [SOME_CORE_TISSUE_SAMPLE], "", True),
        ([], [SOME_CELL_LINE], [SOME_CORE_TISSUE_SAMPLE], "", True),
    ],
)
def test_get_aliquot_id(
    cell_culture_mixtures: List[Dict[str, Any]],
    cell_lines: List[Dict[str, Any]],
    tissue_samples: List[Dict[str, Any]],
    expected: str,
    errors: bool,
) -> None:
    """Test aliquot ID retrieval for annotated filenames."""
    result = get_aliquot_id(cell_culture_mixtures, cell_lines, tissue_samples)
    assert_filename_part_matches(result, expected, errors)


SOME_AGE = 30
SOME_SEX = "Male"
SOME_DONOR = {"age": SOME_AGE, "sex": SOME_SEX}
ANOTHER_DONOR = {"age": 35, "sex": "Female"}


@pytest.mark.parametrize(
    "donors,only_mixture_derived,expected,errors",
    [
        ([], False, "", True),
        ([], True, "NN", False),
        ([SOME_DONOR], False, "M30", False),
        ([ANOTHER_DONOR], False, "F35", False),
        ([SOME_DONOR, ANOTHER_DONOR], False, "", True),
        ([SOME_DONOR], True, "M30", False),
        ([SOME_DONOR, ANOTHER_DONOR], True, "NN", False),
    ],
)
def test_get_donor_sex_and_age_parts(
    donors: List[Dict[str, Any]],
    only_mixture_derived: bool,
    expected: str,
    errors: bool,
) -> None:
    """Test sex and age retrieval for annotated filenames."""
    with patch_is_only_cell_culture_mixture_derived(only_mixture_derived):
        result = get_donor_sex_and_age(donors, [])
        assert_filename_part_matches(result, expected, errors)


SOME_FILE = {"data_category": ["Aligned Reads"]}
REFERENCE_FILE = {"data_category": ["Genome Assembly"]}
SEQUENCER_CODE = "A"
SOME_SEQUENCER = {"code": SEQUENCER_CODE}
ANOTHER_SEQUENCER = {"code": "B"}
ASSAY_CODE = "001"
SOME_ASSAY = {"code": ASSAY_CODE, "identifier": "bulk_wgs_pcr_free", "category": "Bulk WGS"}
ANOTHER_ASSAY = {"code": "002", "identifier": "bulk_wgs", "category": "Bulk WGS"}


@pytest.mark.parametrize(
    "file,sequencers,assays,expected,errors",
    [
        (SOME_FILE,[], [], "", True),
        (SOME_FILE,[SOME_SEQUENCER], [], "", True),
        (SOME_FILE,[], [SOME_ASSAY], "", True),
        (SOME_FILE,[SOME_SEQUENCER], [SOME_ASSAY], f"{SEQUENCER_CODE}{ASSAY_CODE}", False),
        (SOME_FILE,[SOME_SEQUENCER, ANOTHER_SEQUENCER], [SOME_ASSAY], "", True),
        (REFERENCE_FILE,[SOME_SEQUENCER, ANOTHER_SEQUENCER], [SOME_ASSAY, ANOTHER_ASSAY], "XX", False),
        (SOME_FILE,[SOME_SEQUENCER], [SOME_ASSAY, ANOTHER_ASSAY], "", True),
        (SOME_FILE,[SOME_SEQUENCER, SOME_ITEM], [SOME_ASSAY], "", True),
    ],
)
def test_get_sequencing_and_assay_codes(
    file: Dict[str, Any],
    sequencers: List[Dict[str, Any]],
    assays: List[Dict[str, Any]],
    expected: str,
    errors: bool,
) -> None:
    """Test sequencing and assay codes retrieval for annotated filenames."""
    result = get_sequencing_and_assay_codes(file, sequencers, assays)
    assert_filename_part_matches(result, expected, errors)


SEQUENCING_CENTER_CODE = "dac"
SOME_SEQUENCING_CENTER = {"code": SEQUENCING_CENTER_CODE}


@pytest.mark.parametrize(
    "sequencing_center,expected,errors",
    [
        ({}, "", True),
        (SOME_SEQUENCING_CENTER, SEQUENCING_CENTER_CODE, False),
        (SOME_ITEM, "", True),
    ],
)
def test_get_sequencing_center_code(
    sequencing_center: Dict[str, Any], expected: str, errors: bool
) -> None:
    """Test sequencing center code retrieval for annotated filenames."""
    result = get_sequencing_center_code(sequencing_center)
    assert_filename_part_matches(result, expected, errors)


SOFTWARE_CODE = "foo"
SOFTWARE_VERSION = "1.2.3"
SOME_SOFTWARE = {"code": SOFTWARE_CODE, "version": SOFTWARE_VERSION}
ANOTHER_SOFTWARE_CODE = "bar"
ANOTHER_SOFTWARE_VERSION = "2.3.4"
ANOTHER_SOFTWARE = {"code": ANOTHER_SOFTWARE_CODE, "version": ANOTHER_SOFTWARE_VERSION}
REFERENCE_GENOME_CODE = "GRCh38"
DSA_CODE = "Hela_DSA"
DSA_VALUE = "DSA"
HAPLOTYPE_CODE = "hapX"

KINNEX_ASSAY_CODE = "102"
KINNEX_ASSAY = {"code": KINNEX_ASSAY_CODE, "identifier": "bulk_mas_iso_seq", "category": "Bulk RNA-seq"}
DUPLEX_ASSAY_CODE = "007"
DUPLEX_ASSAY = {"code": DUPLEX_ASSAY_CODE, "identifier": "codec", "category": "Duplex-seq WGS"}
SOME_DUPLEX_ASSAY_CODE = "017"
SOME_DUPLEX_ASSAY = {"code": SOME_DUPLEX_ASSAY_CODE, "identifier": "compduplex_seq", "category": "Duplex-seq WGS"}

GENE_ANNOTATION_CODE = "gencode"
GENE_ANNOTATION_VERSION = "v45"
SOME_REFERENCE_GENOME = {"code": REFERENCE_GENOME_CODE}
SOME_GENE_ANNOTATION = [{"code": GENE_ANNOTATION_CODE, "version": GENE_ANNOTATION_VERSION}]
SOME_UNALIGNED_READS = {"data_type": ["Unaligned Reads"]}
SOME_ALIGNED_READS = {"data_category": "Sequencing Reads", "data_type": ["Aligned Reads"]}
RNA_ALIGNED_READS = {"data_type": ["Aligned Reads"], "data_category": ["RNA Quantification"]}

SOME_TARGET_ASSEMBLY = {
    "@type": ["ReferenceGenome"],
    "code": REFERENCE_GENOME_CODE
}
SOME_SOURCE_ASSEMBLY = {
    "@type": ["DonorSpecificAssembly"],
    "code": DSA_CODE
}
SOME_CHAIN_FILE = {
    "data_category": ["Reference Conversion"],
    "data_type": ["Chain File"],
    "source_assembly": DSA_CODE,
    "target_assembly":  REFERENCE_GENOME_CODE
}
SOME_FASTA_FILE = {
    "data_type": ["DSA"],
    "data_category": ["Genome Assembly"],
    "donor_specific_assembly": "Some_DSA",
    "haplotype": HAPLOTYPE_CODE
}

ANOTHER_FASTA_FILE = {
    "data_category": ["Genome Assembly"],
    "data_type": ["Reference Sequence"],
}
SOME_TSV_FILE = {
    "data_category": ["RNA Quantification"],
    "data_type": ["Gene Expression"],
}
SOME_OTHER_FILE = {
    "data_category": ["RNA Quantification"]
}
SOME_ISOFORM_TSV_FILE = {
    "data_category": ["RNA Quantification"],
    "data_type": ["Transcript Expression"],
}
SOME_SOMATIC_VARIANT_CALLS = {"data_category": ["Somatic Variant Calls"]}
SOME_VARIANT_CALLS = {
    "data_category": ["Somatic Variant Calls"],
    "data_type": ["SNV", "CNV", "MEI", "SV", "Indel"],
}
SOME_CONSENSUS_BAM_FILE = {
    "data_category": ["Consensus Reads"],
    "data_type": ["Aligned Reads"],
}
SOME_ISOFORM_FASTA_FILE = {
    "data_category": ["RNA Quantification"],
    "data_type": ["Transcript Sequence"],
}
SOME_KINNEX_FILE = {
    "data_category": ["RNA Quantification"],
    "data_type": ["Transcript Expression"],
}
SOME_JUNCTION_ANNOTATIONS_TXT_FILE = {
    "data_category": ["RNA Quantification"],
    "data_type": ["Transcript Model"],
}
SOME_FILE_EXTENSION = {
    "identifier": "BAM",
    "standard_file_extension": "bam",
    "valid_item_types": ["AlignedReads"]
}
VCF_FILE_EXTENSION = {
    "identifier": "VCF",
    "standard_file_extension": "vcf.gz",
    "valid_item_types": ["VariantCalls"]
}
CHAIN_FILE_EXTENSION = {
    "identifier": "CHAIN",
    "standard_file_extension": "chain.gz",
    "valid_item_types": ["SupplementaryFile"]
}
FASTA_FILE_EXTENSION = {
    "identifier": "FASTA",
    "standard_file_extension": "fa",
    "valid_item_types": ["SupplementaryFile"]
}
TSV_FILE_EXTENSION = {
    "identifier": "TSV",
    "standard_file_extension": "tsv",
    "valid_item_types": ["SupplementaryFile", "OutputFile"]
}


@pytest.mark.parametrize(
    "file,assay,software,reference_genome,annotation,file_extension,target_assembly,source_assembly,dsa,expected,errors",
    [
        ({}, [], [], {}, {}, {}, {}, {}, {}, "" , True),
        (SOME_UNALIGNED_READS, [], [], {}, {}, SOME_FILE_EXTENSION,  {}, {}, {}, DEFAULT_ABSENT_FIELD, False),
        (
            SOME_UNALIGNED_READS,
            [SOME_ASSAY],
            [SOME_SOFTWARE],
            {},
            {},
            SOME_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}",
            False,
        ),
        (SOME_UNALIGNED_READS, [SOME_ASSAY], [SOME_SOFTWARE], SOME_REFERENCE_GENOME, {}, SOME_FILE_EXTENSION,  {}, {}, {}, "", True),
        (SOME_ALIGNED_READS, [], [], {}, {}, {}, {}, {}, {}, "", True),
        (SOME_ALIGNED_READS, [SOME_ASSAY], [SOME_SOFTWARE], {}, {}, SOME_FILE_EXTENSION, {}, {}, {}, "", True),
        (
            SOME_ALIGNED_READS,
            [],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            SOME_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}",
            False,
        ),
        (
            SOME_SOMATIC_VARIANT_CALLS,
            [],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            VCF_FILE_EXTENSION,
            {},
            {},
            {}, 
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}", 
            False
        ),
        (
            SOME_VARIANT_CALLS,
            [],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            VCF_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}",
            False,
        ),
        (
            SOME_ALIGNED_READS,
            [],
            [SOME_SOFTWARE, ANOTHER_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            SOME_FILE_EXTENSION,
            {},
            {},
            {}, 
            f"{ANOTHER_SOFTWARE_CODE}_{ANOTHER_SOFTWARE_VERSION}_{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}",
            False,
        ),
        (
            SOME_ALIGNED_READS,
            [],
            [SOME_SOFTWARE, SOME_ITEM],
            SOME_REFERENCE_GENOME,
            {},
            SOME_FILE_EXTENSION,
            {},
            {}, 
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}",
            False,
        ),
        (
            SOME_CHAIN_FILE,
            [],
            [SOME_SOFTWARE, SOME_ITEM],
            {},
            {},
            CHAIN_FILE_EXTENSION,
            SOME_TARGET_ASSEMBLY,
            SOME_SOURCE_ASSEMBLY,
            SOME_SOURCE_ASSEMBLY,
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{DSA_VALUE}To{REFERENCE_GENOME_CODE}",
            False,
        ),
        (
            SOME_CHAIN_FILE,
            [],
            [SOME_SOFTWARE, SOME_ITEM],
            {},
            {},
            CHAIN_FILE_EXTENSION,
            {},
            {},
            SOME_SOURCE_ASSEMBLY,
            "",
            True,
        ),
        (
            SOME_FASTA_FILE,
            [],
            [SOME_SOFTWARE, SOME_ITEM],
            {},
            {},
            FASTA_FILE_EXTENSION,
            {},
            {},
            SOME_SOURCE_ASSEMBLY, 
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{HAPLOTYPE_CODE}",
            False,
        ),
        (
            ANOTHER_FASTA_FILE,
            [],
            [SOME_SOFTWARE, SOME_ITEM],
            {},
            {},
            FASTA_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}",
            False,
        ),
        (
            SOME_TSV_FILE,
            [],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            SOME_GENE_ANNOTATION,
            TSV_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_{GENE_ANNOTATION_CODE}_{GENE_ANNOTATION_VERSION}_gene",
            False,
        ),
        (
            SOME_ISOFORM_TSV_FILE,
            [],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            SOME_GENE_ANNOTATION,
            TSV_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_{GENE_ANNOTATION_CODE}_{GENE_ANNOTATION_VERSION}_isoform",
            False
        ),
        (
            SOME_OTHER_FILE,
            [],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            SOME_GENE_ANNOTATION,
            TSV_FILE_EXTENSION,
            {},
            {},
            {},
            "",
            True
        ),
        (
            SOME_ALIGNED_READS,
            [],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            SOME_GENE_ANNOTATION,
            SOME_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_{GENE_ANNOTATION_CODE}_{GENE_ANNOTATION_VERSION}",
            False
        ),
        (
            RNA_ALIGNED_READS,
            [SOME_ASSAY],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            SOME_FILE_EXTENSION,
            {},
            {},
            {},
            "",
            True
        ),
        (
            SOME_CONSENSUS_BAM_FILE,
            [KINNEX_ASSAY],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            {},
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}",
            False
        ), # Kinnex aligned transcripts BAM
        (
            SOME_ISOFORM_FASTA_FILE,
            [KINNEX_ASSAY],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            FASTA_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_isoform",
            False
        ), # Kinnex FASTA with isoform sequences
        (
            SOME_KINNEX_FILE,
            [KINNEX_ASSAY],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            SOME_GENE_ANNOTATION,
            FASTA_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_{GENE_ANNOTATION_CODE}_{GENE_ANNOTATION_VERSION}_isoform",
            False
        ), # Kinnex per-isoform classification results
        (
            SOME_JUNCTION_ANNOTATIONS_TXT_FILE,
            [KINNEX_ASSAY],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            SOME_GENE_ANNOTATION,
            {},
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_{GENE_ANNOTATION_CODE}_{GENE_ANNOTATION_VERSION}_junction",
            False
        ), # Kinnex junction annotations
        (
            SOME_KINNEX_FILE,
            [KINNEX_ASSAY],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            SOME_GENE_ANNOTATION,
            {},
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_{GENE_ANNOTATION_CODE}_{GENE_ANNOTATION_VERSION}_isoform",
            False
        ), # Kinnex exonic structure gff file
        (
            SOME_ALIGNED_READS,
            [KINNEX_ASSAY],
            [SOME_SOFTWARE],
            SOME_REFERENCE_GENOME,
            {},
            SOME_FILE_EXTENSION,
            {},
            {},
            {},
            f"{SOFTWARE_CODE}_{SOFTWARE_VERSION}_{REFERENCE_GENOME_CODE}_flnc",
            False
        ), # Kinnex aligned raw FLNC reads
        (
            SOME_CONSENSUS_BAM_FILE,
            [DUPLEX_ASSAY],
            [],
            SOME_REFERENCE_GENOME,
            {},
            {},
            {},
            {},
            {},
            f"{REFERENCE_GENOME_CODE}_consensus",
            False
        ), # Duplex-seq consensus BAM
        (
            SOME_CONSENSUS_BAM_FILE,
            [],
            [],
            SOME_REFERENCE_GENOME,
            {},
            {},
            {},
            {},
            {},
            "",
            True
        ), # Consensus BAM without assay
    ],
)
def test_get_analysis(
    file: Dict[str, Any],
    assay: List[Dict[str, Any]],
    software: List[Dict[str, Any]],
    reference_genome: Dict[str, Any],
    annotation: Dict[str, Any],
    file_extension: Dict[str, Any],
    target_assembly: Dict[str, Any],
    source_assembly: Dict[str, Any],
    dsa: Dict[str, Any],
    expected: str,
    errors: bool,
) -> None:
    """Test analysis info retrieval for annotated filenames."""
    result = get_analysis(file, assay, software, reference_genome, annotation, file_extension, target_assembly, source_assembly, dsa)
    assert_filename_part_matches(result, expected, errors)


@pytest.mark.parametrize(
    "software,expected",
    [
        ([], ""),
        ([{"version": "2.3.4"}], ""),
        ([{"code": "foo", "version": "1.2.3"}], "foo_1.2.3"),
        ([{"code": "foo", "version": "1.2.3"}, {"version": "2.3.4"}], "foo_1.2.3"),
        (
            [
                {"code": "foo", "version": "1.2.3"},
                {"version": "2.3.4"},
                {"code": "bar", "version": "3.4.5"},
            ],
            "bar_3.4.5_foo_1.2.3",
        ),
    ],
)
def test_get_software_and_versions(
    software: List[Dict[str, Any]],
    expected: str
) -> None:
    """Test software names and versions retrieval."""
    result = get_software_and_versions(software)
    assert result == expected


FILE_EXTENSION = "foo"
SOME_FILE_FORMAT = {"standard_file_extension": FILE_EXTENSION}


@pytest.mark.parametrize(
    "file,file_format,expected,errors",
    [
        ({}, {}, "", True),
        ({}, SOME_FILE_FORMAT, "foo", False),
        (
            {"data_type": ["Aligned Reads"], "alignment_details": ["Phased", "Sorted"]},
            SOME_FILE_FORMAT,
            "aligned.sorted.phased.foo",
            False,
        ),
        (
            {"alignment_details": ["Sorted"]},
            SOME_FILE_FORMAT,
            "sorted.foo",
            False,
        ),
    ],
)
def test_get_file_extension(
    file: Dict[str, Any], file_format: Dict[str, Any], expected: str, errors: bool
) -> None:
    """Test file extension retrieval for annotated filenames."""
    result = get_file_extension(file, file_format)
    assert_filename_part_matches(result, expected, errors)


@pytest.mark.parametrize(
    "errors,expected",
    [
        ([], []),
        (
            [
                get_filename_part("foo", errors=["a", "b"]),
                get_filename_part("bar"),
                get_filename_part("baz", errors=["c", "d"]),
            ],
            ["a", "b", "c", "d"],
        ),
    ],
)
def test_collect_errors(errors: List[FilenamePart], expected: List[str]) -> None:
    """Test error collection across filename parts."""
    result = collect_errors(*errors)
    assert result == expected
