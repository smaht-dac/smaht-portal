from contextlib import contextmanager
import os
import pdb
from typing import List, Optional, Union
from unittest import mock
from dcicutils.bundle_utils import RefHint
from dcicutils.misc_utils import to_camel_case
from dcicutils.validation_utils import SchemaManager  # noqa
from encoded.ingestion.structured_data import Portal, Schema, Utils  # noqa
from encoded.ingestion.ingestion_processors import parse_structured_data

THIS_TEST_MODULE_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TEST_FILES_DIR = f"{THIS_TEST_MODULE_DIRECTORY}/data/test-files"


def test_parse_structured_data_1():
    _test_parse_structured_data(file = "test.csv", noschemas = True, sheet_utils_also = True, rows = [
        "uuid,status,principals_allowed.view,principals_allowed.edit,other_allowed_extension#,data",
        "some-uuid-a,public,pav-a,pae-a,alfa|bravo|charlie,123.4",
        "some-uuid-b,public,pav-b,pae-a,delta|echo|foxtrot|golf,xyzzy"
    ],
    expected = {
      "Test": [
        {
          "uuid": "some-uuid-a",
          "status": "public",
          "principals_allowed": { "view": "pav-a", "edit": "pae-a"
          },
          "other_allowed_extension": [ "alfa", "bravo", "charlie" ],
          "data": "123.4"
        },
        {
          "uuid": "some-uuid-b",
          "status": "public",
          "principals_allowed": { "view": "pav-b", "edit": "pae-a" },
          "other_allowed_extension": [ "delta", "echo", "foxtrot", "golf" ],
          "data": "xyzzy"
        }
      ]
    })


def test_parse_structured_data_2():
    _test_parse_structured_data(file = f"submission_test_file_from_doug_20231106.xlsx", sheet_utils_also = True,
        expected_refs = [
            "/Consortium/smaht",
            "/FileFormat/fastq",
            "/Software/SMAHT_SOFTWARE_VEP",
            "/Software/SMAHT_SOFTWARE_FASTQC",
            "/Workflow/smaht:workflow-basic"
        ],
        expected = {
            "FileFormat": [
              {
                "identifier": "fastq",
                "standard_file_extension": "fastq",
                "consortia": [ "smaht" ]
              }
            ],
            "ReferenceFile": [
              {
                "aliases": [ "smaht:reference_file-fastq1" ],
                "file_format": "fastq",
                "data_category": [ "Sequencing Reads" ],
                "data_type": [ "Unaligned Reads" ],
                "filename": "first_file.fastq",
                "consortia": [ "smaht" ]
              },
              {
                "aliases": [ "smaht:reference_file-fastq2", "smaht:reference_file-fastq_alt" ],
                "file_format": "fastq",
                "data_category": [ "Sequencing Reads" ],
                "data_type": [ "Unaligned Reads" ],
                "filename": "second_file.fastq",
                "consortia": [ "smaht" ]
              }
            ],
            "Software": [
              {
                "submitted_id": "SMAHT_SOFTWARE_VEP",
                "name": "vep",
                "category": [ "Variant Annotation" ],
                "title": "VEP",
                "version": "1.0.1",
                "source_url": "https://grch37.ensembl.org/info/docs/tools/vep/index.html",
                "consortia": [ "smaht" ]
              },
              {
                "submitted_id": "SMAHT_SOFTWARE_FASTQC",
                "name": "fastqc",
                "category": [ "Quality Control", "Alignment" ],
                "title": "FastQC",
                "version": "3.5.1",
                "consortia": [ "smaht" ]
              }
            ],
            "Workflow": [
              {
                "aliases": [ "smaht:workflow-basic" ],
                "name": "basic_workflow",
                "title": "A Basic Workflow",
                "software": [ "SMAHT_SOFTWARE_VEP" ],
                "category": [ "Annotation" ],
                "language": "CWL",
                "tibanna_config": { "instance_type": [ "c5.4xlarge" ], "run_name": "vep" },
                "consortia": [ "smaht" ]
              },
              {
                "aliases": [ "smaht:workflow-complex" ],
                "name": "complex_workflow",
                "title": "A Complex Workflow",
                "software": [ "SMAHT_SOFTWARE_VEP", "SMAHT_SOFTWARE_FASTQC" ],
                "category": [ "Annotation", "Quality Control" ],
                "language": "WDL",
                "tibanna_config": { "instance_type": [ "c5.4xlarge" ], "run_name": "fastqc" },
                "previous_versions": [ "smaht:workflow-basic" ],
                "consortia": [ "smaht" ]
              }
            ]
        }
    )

def test_parse_structured_data_3():
    _test_parse_structured_data(file = f"uw_gcc_colo829bl_submission_20231117.xlsx",
                                novalidate = True, sheet_utils_also = False,
        expected_refs = [
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_FiberSeq_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_FiberSeq_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_gDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_gDNA_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HMWgDNA_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_bulkKinnex_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_bulkKinnex_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829T_HiC_2",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BL_HiC_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_FiberSeq_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_gDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_HMWgDNA_1",
            "/Analyte/UW-GCC_ANALYTE_COLO-829BLT-50to1_1_bulkKinnex_1",
            "/FileSet/UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1",
            "/FileSet/UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1",
            "/Library/UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_1",
            "/Library/UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_2",
            "/Library/UW-GCC_LIBRARY_COLO-829T_FIBERSEQ_1",
            "/Sequencing/UW-GCC_SEQUENCING_PACBIO-HIFI-150x",
            "/Sequencing/UW-GCC_SEQUENCING_PACBIO-HIFI-60x",
            "/Software/UW-GCC_SOFTWARE_FIBERTOOLS-RS",
            "/FileSet/UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2",
        ],
        expected = {
    "Software": [
        {
            "submitted_id": "UW-GCC_SOFTWARE_FIBERTOOLS-RS",
            "category": [
                "Base Modification Caller"
            ],
            "name": "fibertools-rs",
            "version": "0.3.1",
            "source_url": "https://github.com/fiberseq/fibertools-rs",
            "description": "fibertools-rs adds m6A modifications to each PacBio molecule."
        },
        {
            "submitted_id": "UW-GCC_SOFTWARE_REVIO_ICS",
            "category": [
                "Basecaller, consensus caller, base modification caller"
            ],
            "name": "Revio Instrument Control Software",
            "version": "12.0.0.183503",
            "source_url": "https://www.pacb.com/support/software-downloads/",
            "description": "Revio software controls the instrument and the primary and post-primary analyses (basecalling, consensus calling, CpG methylation)"
        }
    ],
    "CellLine": [
        {
            "submitted_id": "UW-GCC_CELL-LINE_COLO-829BL",
            "category": [
                "Immortalized"
            ],
            "name": "COLO 829BL",
            "source": "ATCC",
            "description": "COLO 829BL lymphoblastoid cells",
            "url": "https://www.atcc.org/products/crl-1980"
        },
        {
            "submitted_id": "UW-GCC_CELL-LINE_COLO-829T",
            "category": [
                "Immortalized"
            ],
            "name": "COLO 829",
            "source": "ATCC",
            "description": "COLO 829 tumor cells",
            "url": "https://www.atcc.org/products/crl-1974"
        }
    ],
    "CellSample": [
        {
            "submitted_id": "UW-GCC_SAMPLE_COLO-829BL_1",
            "passage_number": "NA",
            "description": "Immortaliized lymphoblastoid cell line",
            "growth_medium": "RPMI-1640 with 15% FBS",
            "culture_duration": "17 days",
            "culture_start_date": "2023-06-29 00:00:00",
            "culture_harvest_date": "2023-07-16 00:00:00",
            "lot_number": "ATCC-70022927\nSCRI-07162023",
            "Cell density and volume": "3 million cells/mL\n2 mL/vial",
            "doubling_time": "24 hours",
            "karyotype": "92,XXYY[4]/46,XY[20]",
            "biosources": "UW-GCC_CELL-LINE_COLO-829BL",
            "protocol": "Thaw in recovery media: 1:1 RPMI:FBS 24 hours then split into RPMI-1640 15% FBS.\nCulture in media depth of .2ml/cm2 splitting by dilution until volume reaches 100 mL.\nTransfer to erlenmeyer style 500 mL shaker flask with 200 mL volume shaking at 90 rpm.\nFreeze in RPMI-1640 15% FBS with final volume 10% DMSO."
        },
        {
            "submitted_id": "UW-GCC_SAMPLE_COLO-829T_1",
            "passage_number": "5",
            "description": "Adherent melanoma derived cell line",
            "growth_medium": "RPMI-1640 with 10% FBS",
            "culture_duration": "39 days",
            "culture_start_date": "2023-06-29 00:00:00",
            "culture_harvest_date": "2023-08-07 00:00:00",
            "lot_number": "ATCC-70024393\nSCRI-08072023",
            "Cell density and volume": "3 million cells/mL\n2 mL/vial",
            "doubling_time": "~3-4 days",
            "karyotype": "Not performed",
            "biosources": "UW-GCC_CELL-LINE_COLO-829T",
            "protocol": "Culture in RPMI-1640 10% FBS. Split by rinsing with PBS and trypsininzing with 0.05% trypsin-EDTA.\nFreeze in RPMI-1640 10% FBS with final volume 10% DMSO."
        },
        {
            "submitted_id": "UW-GCC_SAMPLE_COLO-829T_2",
            "passage_number": "4",
            "description": "Adherent melanoma derived cell line",
            "growth_medium": "RPMI-1640 with 10% FBS",
            "culture_duration": "30 days",
            "culture_start_date": "2023-09-19 00:00:00",
            "culture_harvest_date": "2023-10-19 00:00:00",
            "lot_number": "ATCC-70024393\nSCRI-10192023",
            "Cell density and volume": "3 million cells/mL\n2 mL/vial",
            "doubling_time": "~3-4 days",
            "karyotype": "64~69,XX,+X,+1,+1,dic(1;3)(p12;p21)x2,add(2)(p13),add(2)(p21),+4,i(4)(q10),+6,add(\n6)(q13),+7,+7,add(7)(q32)x2,+8,i(8)(q10),+9,\ndel(9)(p21),+12,+13,+13,+13,+14,+15,+17,+19,+19,+20,+20,",
            "biosources": "UW-GCC_CELL-LINE_COLO-829T",
            "protocol": "Culture in RPMI-1640 10% FBS. Split by rinsing with PBS and trypsininzing with 0.05% trypsin-EDTA.\nFreeze in RPMI-1640 10% FBS with final volume 10% DMSO."
        },
        {
            "submitted_id": "UW-GCC_SAMPLE_COLO-829BLT-50to1_1",
            "passage_number": "N/A",
            "description": "50-to-1 mixture of COLO829BL and COLO829T cells",
            "growth_medium": "N/A",
            "culture_duration": "N/A",
            "culture_start_date": "N/A",
            "culture_harvest_date": "2023-10-25 00:00:00",
            "lot_number": "ATCC-70022927\nATCC-70024393\nSCRI-10252023",
            "Cell density and volume": "2.55 million cells/mL\n2 mL/vial",
            "doubling_time": "N/A",
            "karyotype": "N/A",
            "biosources": "UW-GCC_CELL-LINE_COLO-829BL\nUW-GCC_CELL-LINE_COLO-829T",
            "protocol": "Bulk hand mixture of UW-GCC_SAMPLE_COLO-829BL_1 and UW-GCC_SAMPLE_COLO-829T_2 cells in a 50:1 ratio.\nFreeze in RPMI-1640 10% FBS with final volume 10% DMSO."
        }
    ],
    "Analyte": [
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BL_FiberSeq_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Fiber-seq DNA"
            ],
            "treatments": "100U Hia5/million cells, 10min 25C",
            "concentration": "111 ng/ul",
            "volume": "50 ul",
            "sample_quantity": "6 million cells",
            "a260_a280_ratio": 2.06,
            "biosample": "UW-GCC_SAMPLE_COLO-829BL_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BL_FiberSeq_2",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Fiber-seq DNA"
            ],
            "treatments": "100U Hia5/million cells, 10min 25C",
            "concentration": "220 ng/ul",
            "volume": "55 ul",
            "sample_quantity": "6 million cells",
            "a260_a280_ratio": 2.0,
            "biosample": "UW-GCC_SAMPLE_COLO-829BL_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BL_gDNA_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Genomic DNA"
            ],
            "treatments": "N/A",
            "biosample": "UW-GCC_SAMPLE_COLO-829BL_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BL_HMWgDNA_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "HMW genomic DNA"
            ],
            "treatments": "N/A",
            "concentration": "92 ng/uL",
            "volume": "25 ul",
            "biosample": "UW-GCC_SAMPLE_COLO-829BL_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BL_bulkKinnex_1",
            "molecule": [
                "RNA"
            ],
            "components": [
                "cDNA"
            ],
            "concentration": "449 ng/ul",
            "sample_quantity": "3 million cells",
            "a260_a280_ratio": 2.05,
            "biosample": "UW-GCC_SAMPLE_COLO-829BL_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BL_HiC_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Arima HiC library"
            ],
            "concentration": "11.4ng/ul",
            "volume": "25 ul",
            "sample_quantity": "3 million cells",
            "biosample": "UW-GCC_SAMPLE_COLO-829BL_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829T_FiberSeq_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Fiber-seq DNA"
            ],
            "treatments": "100U Hia5/million cells, 10min 25C",
            "concentration": "180 ng/ul",
            "volume": "50 ul",
            "sample_quantity": "6 million cells",
            "a260_a280_ratio": 2.09,
            "biosample": "UW-GCC_SAMPLE_COLO-829T_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829T_FiberSeq_2",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Fiber-seq DNA"
            ],
            "treatments": "100U Hia5/million cells, 10min 25C",
            "concentration": "56.4 ng/ul",
            "volume": "50 ul",
            "sample_quantity": "6 million cells",
            "biosample": "UW-GCC_SAMPLE_COLO-829T_2"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829T_HMWgDNA_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "HMW genomic DNA"
            ],
            "treatments": "N/A",
            "concentration": "96 ng/ul",
            "volume": "50 ul",
            "biosample": "UW-GCC_SAMPLE_COLO-829T_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829T_HMWgDNA_2",
            "molecule": [
                "DNA"
            ],
            "components": [
                "HMW genomic DNA"
            ],
            "biosample": "UW-GCC_SAMPLE_COLO-829T_2"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829T_gDNA_2",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Genomic DNA"
            ],
            "biosample": "UW-GCC_SAMPLE_COLO-829T_2"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829T_bulkKinnex_2",
            "molecule": [
                "RNA"
            ],
            "components": [
                "cDNA"
            ],
            "concentration": "552 ng/ul",
            "volume": "50 ul",
            "sample_quantity": "3 million cells",
            "a260_a280_ratio": 2.1,
            "biosample": "UW-GCC_SAMPLE_COLO-829T_2"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829T_HiC_2",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Arima HiC library"
            ],
            "biosample": "UW-GCC_SAMPLE_COLO-829T_2"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_FiberSeq_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Fiber-seq DNA"
            ],
            "treatments": "100U Hia5/million cells, 10min 25C",
            "concentration": "110 ng/ul",
            "volume": "50 ul",
            "sample_quantity": "3 million cells",
            "biosample": "UW-GCC_SAMPLE_COLO-829BLT-50to1_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_gDNA_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "Genomic DNA"
            ],
            "biosample": "UW-GCC_SAMPLE_COLO-829BLT-50to1_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_HMWgDNA_1",
            "molecule": [
                "DNA"
            ],
            "components": [
                "HMW genomic DNA"
            ],
            "treatments": "N/A",
            "concentration": "90.2 ng/ul",
            "volume": "50 ul",
            "sample_quantity": "3 million cells",
            "biosample": "UW-GCC_SAMPLE_COLO-829BLT-50to1_1"
        },
        {
            "submitted_id": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_bulkKinnex_1",
            "molecule": [
                "RNA"
            ],
            "components": [
                "cDNA"
            ],
            "concentration": "470 ng/ul",
            "volume": "50 ul",
            "sample_quantity": "3 million cells",
            "a260_a280_ratio": 2.05,
            "biosample": "UW-GCC_SAMPLE_COLO-829BLT-50to1_1"
        }
    ],
    "Library": [
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_1",
            "name": "COLO-829BL (Replicate 1)",
            "sample_name": "PS00338",
            "preparation_date": "2023-07-28 00:00:00",
            "target_insert_minimum_length": "17 kb",
            "target_insert_avg_length": "20 kb",
            "target_insert_maximum_length": "N/A",
            "insert_mean_length": 21870.0,
            "insert_%_CV": "27.4",
            "amplification_cycles": "N/A",
            "barcode_sequences": "bc2025",
            "analyte": "UW-GCC_ANALYTE_COLO-829BL_FiberSeq_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_2",
            "name": "COLO-829BL (Replicate 2)",
            "sample_name": "PS00356",
            "preparation_date": "2023-09-01 00:00:00",
            "target_insert_minimum_length": "17 kb",
            "target_insert_avg_length": "20 kb",
            "target_insert_maximum_length": "N/A",
            "insert_mean_length": 25734.0,
            "insert_%_CV": "23.26",
            "amplification_cycles": "N/A",
            "barcode_sequences": "bc2055",
            "analyte": "UW-GCC_ANALYTE_COLO-829BL_FiberSeq_2"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_FIBERSEQ_1",
            "name": "COLO-829T (Batch 1 - Replicate 1)",
            "sample_name": "PS00357",
            "preparation_date": "2023-08-27 00:00:00",
            "target_insert_minimum_length": "17 kb",
            "target_insert_avg_length": "20 kb",
            "target_insert_maximum_length": "N/A",
            "insert_mean_length": 22616.0,
            "insert_%_CV": "17.4",
            "amplification_cycles": "N/A",
            "barcode_sequences": "bc2051",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_FiberSeq_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_FIBERSEQ_2",
            "name": "COLO-829T (Batch 2 - Replicate 1)",
            "sample_name": "PS00418",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_FiberSeq_2"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BL_NOVASEQX_1",
            "name": "COLO-829BL (Replicate 1)",
            "sample_name": "PS00340",
            "analyte": "UW-GCC_ANALYTE_COLO-829BL_gDNA_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BL_ONT_1",
            "name": "COLO-829BL (Replicate 1)",
            "sample_name": "PS00342",
            "analyte": "UW-GCC_ANALYTE_COLO-829BL_HMWgDNA_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BL_ULONT_1",
            "name": "COLO-829BL (Replicate 1)",
            "sample_name": "PS00339",
            "analyte": "UW-GCC_ANALYTE_COLO-829BL_HMWgDNA_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BL_bulkKinnex_1",
            "name": "COLO-829BL (Replicate 1)",
            "sample_name": "PS00419",
            "analyte": "UW-GCC_ANALYTE_COLO-829BL_bulkKinnex_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BL_HiC_1",
            "name": "COLO-829BL (Replicate 1)",
            "sample_name": "PS00341",
            "analyte": "UW-GCC_ANALYTE_COLO-829BL_HiC_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_ONT_1",
            "name": "COLO-829T (Batch 1 - Replicate 1)",
            "sample_name": "PS00361",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_HMWgDNA_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_ONT_2",
            "name": "COLO-829T (Batch 2 - Replicate 1)",
            "sample_name": "PS00421",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_HMWgDNA_2"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_ULONT_2",
            "name": "COLO-829T (Batch 2 - Replicate 1)",
            "sample_name": "PS00358",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_HMWgDNA_2"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_NOVASEQX_2",
            "name": "COLO-829T (Batch 2 - Replicate 1)",
            "sample_name": "PS00359",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_gDNA_2"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_bulkKinnex_2",
            "name": "COLO-829T (Batch 2 - Replicate 1)",
            "sample_name": "PS00420",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_bulkKinnex_2"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829T_HiC_2",
            "name": "COLO-829T (Batch 2 - Replicate 1)",
            "sample_name": "PS00360",
            "analyte": "UW-GCC_ANALYTE_COLO-829T_HiC_2"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BLT-50to1_1_FIBERSEQ_1",
            "name": "COLO-829BL-T 1-50mix (Replicate 1)",
            "sample_name": "PS00433",
            "analyte": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_FiberSeq_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BLT-50to1_1_NOVASEQX_1",
            "name": "COLO-829BL-T 1-50mix (Replicate 1)",
            "sample_name": "PS00431",
            "analyte": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_gDNA_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BLT-50to1_1_ONT_1",
            "name": "COLO-829BL-T 1-50mix (Replicate 1)",
            "sample_name": "PS00432",
            "analyte": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_HMWgDNA_1"
        },
        {
            "submitted_id": "UW-GCC_LIBRARY_COLO-829BLT-50to1_1_bulkKinnex_1",
            "name": "COLO-829BL-T 1-50mix (Replicate 1)",
            "sample_name": "PS00434",
            "analyte": "UW-GCC_ANALYTE_COLO-829BLT-50to1_1_bulkKinnex_1"
        }
    ],
    "Sequencing": [
        {
            "submitted_id": "UW-GCC_SEQUENCING_PACBIO-HIFI-150x",
            "category": [
                "HiFi Long Read WGS"
            ],
            "platform": "PacBio",
            "instrument_model": "Revio",
            "instrument_cycles": "24 hr movie",
            "sequencing_kit": "BINDINGKIT=102-739-100;SEQUENCINGKIT=102-118-800",
            "read_type": "Single-end",
            "target_read_length": "20 kb",
            "target_coverage": "150x"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_PACBIO-HIFI-60x",
            "category": [
                "HiFi Long Read WGS"
            ],
            "platform": "PacBio",
            "instrument_model": "Revio",
            "instrument_cycles": "24 hr movie",
            "sequencing_kit": "BINDINGKIT=102-739-100;SEQUENCINGKIT=102-118-800",
            "read_type": "Single-end",
            "target_read_length": "20 kb",
            "target_coverage": "60x"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_NOVASEQX-2000x",
            "platform": "Illumina",
            "instrument_model": "NovaSeqX"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_NOVASEQX-200x",
            "platform": "Illumina",
            "instrument_model": "NovaSeqX"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_NOVASEQX-HiC-60x",
            "platform": "Illumina",
            "instrument_model": "NovaSeqX"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_ONT-R10-300x",
            "platform": "ONT",
            "instrument_model": "Promethion"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_ONT-R10-30x",
            "platform": "ONT",
            "instrument_model": "Promethion"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_UL-ONT-R10",
            "platform": "ONT",
            "instrument_model": "Promethion"
        },
        {
            "submitted_id": "UW-GCC_SEQUENCING_PACBIO-BULK-KINNEX",
            "platform": "PacBio",
            "instrument_model": "Revio",
            "instrument_cycles": "24 hr movie"
        }
    ],
    "FileSet": [
        {
            "submitted_id": "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1",
            "sequencing": "UW-GCC_SEQUENCING_PACBIO-HIFI-150x",
            "libraries": [
                "UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_1"
            ]
        },
        {
            "submitted_id": "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2",
            "sequencing": "UW-GCC_SEQUENCING_PACBIO-HIFI-150x",
            "libraries": [
                "UW-GCC_LIBRARY_COLO-829BL_FIBERSEQ_2"
            ]
        },
        {
            "submitted_id": "UW-GCC_FILE-SET_COLO-829_FIBERSEQ_1",
            "sequencing": "UW-GCC_SEQUENCING_PACBIO-HIFI-60x",
            "libraries": [
                "UW-GCC_LIBRARY_COLO-829T_FIBERSEQ_1"
            ]
        }
    ],
    "UnalignedReads": [
        {
            "submitted_id": "UW-GCC_FILE_PS00338.M84046_230825_191347_S3.BC2025.FT.BAM",
            "file_name": "PS00338.m84046_230825_191347_s3.bc2025.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "3940092",
            "10%ile_read_length": "15150",
            "median_read_length": "18140",
            "90%ile_read_length": "24120",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "45eea8352e2b8a3ad11feeccd4fea2bc"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00338.M84046_230828_212510_S3.BC2025.FT.BAM",
            "file_name": "PS00338.m84046_230828_212510_s3.bc2025.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "5750093",
            "10%ile_read_length": "15280",
            "median_read_length": "18560",
            "90%ile_read_length": "25000",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "9396dde111d9f719f7d94b98802ae68f"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00338.M84046_230828_215531_S4.BC2025.FT.BAM",
            "file_name": "PS00338.m84046_230828_215531_s4.bc2025.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "5540842",
            "10%ile_read_length": "15270",
            "median_read_length": "18540",
            "90%ile_read_length": "24950",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "c292f2a92316f09eba13e515eaf7c6e5"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00338.M84046_230828_222637_S1.BC2025.FT.BAM",
            "file_name": "PS00338.m84046_230828_222637_s1.bc2025.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "5142752",
            "10%ile_read_length": "15340",
            "median_read_length": "18700",
            "90%ile_read_length": "25150",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "d0daf2811713ce0f18ed4cd38862a509"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00338.M84046_230828_225743_S2.BC2025.FT.BAM",
            "file_name": "PS00338.m84046_230828_225743_s2.bc2025.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "5092420",
            "10%ile_read_length": "15320",
            "median_read_length": "18650",
            "90%ile_read_length": "25080",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_1"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "48319442da9d28eb6d44822cfb8bda67"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00356.M84046_230913_211559_S4.BC2055.FT.BAM",
            "file_name": "PS00356.m84046_230913_211559_s4.bc2055.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "5049023",
            "10%ile_read_length": "16720",
            "median_read_length": "20630",
            "90%ile_read_length": "27640",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "2f39b216ccf0de536e099e83841b8f55"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00356.M84046_230916_212004_S3.BC2055.FT.BAM",
            "file_name": "PS00356.m84046_230916_212004_s3.bc2055.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "4912815",
            "10%ile_read_length": "16740",
            "median_read_length": "20690",
            "90%ile_read_length": "27710",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "a91d464af7f868b3291767df3d6f6aea"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00356.M84046_230916_215110_S4.BC2055.FT.BAM",
            "file_name": "PS00356.m84046_230916_215110_s4.bc2055.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "4866279",
            "10%ile_read_length": "16790",
            "median_read_length": "20840",
            "90%ile_read_length": "27980",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "8d3b24b021d5d4dd4c8aaa4106999987"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00356.M84046_230916_225322_S2.BC2055.FT.BAM",
            "file_name": "PS00356.m84046_230916_225322_s2.bc2055.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "4749101",
            "10%ile_read_length": "16810",
            "median_read_length": "20890",
            "90%ile_read_length": "28060",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "98be0640495b9a66328a02fce08704cd"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00356.M84046_230919_203620_S1.BC2055.FT.BAM",
            "file_name": "PS00356.m84046_230919_203620_s1.bc2055.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "4694509",
            "10%ile_read_length": "16670",
            "median_read_length": "20510",
            "90%ile_read_length": "27380",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829BL_FIBERSEQ_2"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "c3a68e07c776276bd95221e5adffb2a4"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00357.M84046_230913_214705_S1.BC2051.FT.BAM",
            "file_name": "PS00357.m84046_230913_214705_s1.bc2051.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "5072026",
            "10%ile_read_length": "16880",
            "median_read_length": "19830",
            "90%ile_read_length": "25180",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "c8e0d9d49294139a6dfa37aa3b9f2448"
        },
        {
            "submitted_id": "UW-GCC_FILE_PS00357.M84046_230913_221811_S2.BC2051.FT.BAM",
            "file_name": "PS00357.m84046_230913_221811_s2.bc2051.ft.bam",
            "file_format": "BAM",
            "data_category": [
                "Sequencing Reads"
            ],
            "data_type": [
                "Unaligned Reads"
            ],
            "sequenced_read_count": "5873988",
            "10%ile_read_length": "16840",
            "median_read_length": "19750",
            "90%ile_read_length": "25090",
            "file_sets": [
                "UW-GCC_FILE-SET_COLO-829T_FIBERSEQ_1"
            ],
            "software": [
                "UW-GCC_SOFTWARE_FIBERTOOLS-RS"
            ],
            "checksum": "ce95b0c1fcb48e26cb991aebaa429e29"
        }
    ]
        }
    )


def _test_parse_structured_data(file: str,
                                expected: Union[dict, list],
                                rows: Optional[List[str]] = None,
                                expected_refs: Optional[List[str]] = None,
                                expected_errors: Optional[Union[dict, list]] = None,
                                noschemas: bool = False,
                                novalidate: bool = False,
                                norefs: bool = False,
                                sheet_utils: bool = False,
                                sheet_utils_also: bool = False,
                                debug: bool = False) -> None:
    refs_actual = set()

    def assert_parse_structured_data():
        nonlocal file, expected, expected_errors, noschemas, sheet_utils, debug
        portal = Portal.create_for_unit_testing() if not noschemas else None  # But see mocked_schemas below.
        if rows:
            if os.path.exists(file) or os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                raise Exception("Attempt to create temporary file with same name as existing test file: {file}")
            with Utils.temporary_file(name=file, content=rows) as tmp_file_name:
                structured_data, validation_errors = parse_structured_data(file=tmp_file_name,
                                                                           portal=portal,
                                                                           novalidate=novalidate,
                                                                           sheet_utils=sheet_utils)
        else:
            if os.path.exists(os.path.join(TEST_FILES_DIR, file)):
                file = os.path.join(TEST_FILES_DIR, file)
            elif not os.path.exists(file):
                raise Exception(f"Cannot find input test file: {file}")
            structured_data, validation_errors = parse_structured_data(file=file,
                                                                       portal=portal,
                                                                       novalidate=novalidate,
                                                                       sheet_utils=sheet_utils)
        if debug:
            pdb.set_trace()
        if sheet_utils:
            structured_data = {to_camel_case(key): value for key, value in structured_data.items()}
        assert structured_data == expected
        if expected_errors:
            assert validation_errors == expected_errors

    @contextmanager
    def mocked_schemas():
        # The sheet_utils implementation does not deal well with no portal, as opposed to structured_data
        # which which reacts by not attempting to load schems (nor resolving refs), so we mock it out here.
        nonlocal sheet_utils
        if sheet_utils:
            with mock.patch("dcicutils.validation_utils.SchemaManager.get_schema", return_value=None):
                yield
        else:
            yield

    @contextmanager
    def mocked_refs():
        nonlocal sheet_utils
        if sheet_utils:
            def mocked_ref_hint(self, value, src):
                nonlocal expected_refs, refs_actual
                for item in (value if isinstance(value, list) else [value]):
                    refs_actual.add(ref := f"/{self.schema_name}/{item}")
                    if expected_refs and ref not in expected_refs:
                        raise Exception(f"Reference not found: {ref}")
                return value
            with mock.patch.object(RefHint, "_apply_ref_hint", side_effect=mocked_ref_hint, autospec=True):
                yield
        else:
            def mocked_ref_exists(type_name, value):
                nonlocal expected_refs, refs_actual
                refs_actual.add(ref := f"/{type_name}/{value}")
                return not expected_refs or ref in expected_refs
            with mock.patch("encoded.ingestion.structured_data.Portal.ref_exists", side_effect=mocked_ref_exists):
                yield

    def run_this_function():
        nonlocal expected_refs, noschemas, norefs, refs_actual
        refs_actual = set()
        if noschemas:
            if norefs or expected_refs:
                with mocked_schemas():
                    with mocked_refs():
                        assert_parse_structured_data()
            else:
                with mocked_schemas():
                    assert_parse_structured_data()
        elif norefs or expected_refs:
            with mocked_refs():
                assert_parse_structured_data()
        else:
            assert_parse_structured_data()
        if expected_refs:
            # Make sure any/all listed refs were actually referenced.
            assert refs_actual == set(expected_refs)

    run_this_function()
    if not sheet_utils and sheet_utils_also:
        sheet_utils = True
        run_this_function()
