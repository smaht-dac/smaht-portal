from __future__ import annotations

import argparse
from typing import Any, Dict, List, Union, Tuple
from copy import deepcopy
import pprint

pp = pprint.PrettyPrinter(indent=2)

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager


##################################################################
##################################################################
##
##  The file release will do the following updates to the metadata
##  - Set file (and extra file) status to `released`
##  - Associate the file with the fileset that the corresponding
##    submitted files are in
##  - Adds `dataset`` and `access_status`` to the file
##  - Set the associated QualityMetrics item and the metrics.zip
##    file to status `released`
##  - Set corresponding FileSet to `released`
##  - Set FileSet associated libraries, and sequencing to `released`
##  - Set library associated assay and analyte to `released`
##  - Set analyte associated samples to `released`
##
##################################################################
##################################################################


class PC: # PortalConstants
    ACCESSION = "accession"
    ACCESS_STATUS = "access_status"
    AGE = "age"
    ALIGNED_READS = "Aligned Reads"
    ALIGNMENT_DETAILS = "alignment_details"
    ANALYTE = "analyte"
    ANNOTATED_FILENAME = "annotated_filename"
    ASSAY = "assay"
    CELL_CULTURE = "cell_culture"
    CELL_CULTURE_MIXTURE_TYPE = "CellCultureMixture"
    CELL_CULTURE_TYPE = "CellCulture"
    CELL_LINE = "cell_line"
    CODE = "code"
    COMPONENTS = "components"
    CONSORTIA = "consortia"
    COPY_NUMBER_VARIANT = "Copy Number Variant"
    DATA_TYPE = "data_type"
    DATA_CATEGORY = "data_category"
    DATASET = "dataset"
    DONOR = "donor"
    EXTRA_FILES = "extra_files"
    FEMALE_SEX = "Female"
    FILE_FORMAT = "file_format"
    FILE_SETS = "file_sets"
    FILE_SET = "file_set"
    FILENAME = "filename"
    FINAL_OUTPUT = "Final Output"
    GERMLINE_VARIANT_CALLS = "Germline Variant Calls"
    IDENTIFIER = "identifier"
    LIBRARIES = "libraries"
    LIBRARY = "library"
    MALE_SEX = "Male"
    MOBILE_ELEMENT_INSERTION = "Mobile Element Insertion"
    OUTPUT_STATUS= "output_status"
    OPEN = "Open"
    PHASED = "Phased"
    PROTECTED = "Protected"
    QUALITY_METRICS = "quality_metrics"
    QUALITY_METRIC = "quality_metric"
    REFERENCE_GENOME = "reference_genome"
    RELEASED = "released"
    SAMPLE_SOURCES = "sample_sources"
    SAMPLES = "samples"
    SAMPLE = "sample"
    SEQUENCER = "sequencer"
    SEQUENCING = "sequencing"
    SEQUENCING_CENTER = "sequencing_center"
    SEQUENCING_READS = "Sequencing Reads"
    SEX = "sex"
    SINGLE_NUCLEOTIDE_VARIANT = "Single Nucleotide Variant"
    SOMATIC_VARIANT_CALLS = "Somatic Variant Calls"
    SOFTWARE = "software"
    SORTED = "Sorted"
    STANDARD_FILE_EXTENSION = "standard_file_extension"
    STATUS = "status"
    STRUCTURAL_VARIANT = "Structural Variant"
    SUBMISSION_CENTERS = "submission_centers"
    SUBMITTER_ID = "submitter_id"
    SUBMITTED_ID = "submitted_id"
    TISSUE_TYPE = "Tissue"
    TYPE = "@type"
    UUID = "uuid"
    VARIANT_TYPE = "variant_type"
    VERSION = "version"


# TODO: ACTIVATE
# dataset is required but comes in through input args for now
#REQUIRED_FILE_PROPS = [PC.SEQUENCING_CENTER]
REQUIRED_FILE_PROPS = []


class FileRelease:

    def __init__(self, auth_key):
        self.key = auth_key
        self.patch_infos = []
        self.patch_dicts = []
        self.warnings = []

    def prepare(self, file_identifier: str, dataset: str):

        file = self.get_metadata(file_identifier)
        self.check_file_validity(file)
        fileset = self.get_fileset_from_file(file)
        self.add_file_patchdict(file, fileset, dataset)

        quality_metrics = self.get_quality_metrics_from_file(file)
        self.add_release_items_to_patchdict(quality_metrics, "QualityMetric")

        quality_metrics_zips = self.get_quality_metrics_zip_files(quality_metrics)
        self.add_release_items_to_patchdict(
            quality_metrics_zips, f"Compressed QC metrics file"
        )

        # Get higher level items starting from file set in order to set them to released
        self.add_release_item_to_patchdict(fileset, f"FileSet - {fileset[PC.SUBMITTED_ID]}")
        sequencing = self.get_metadata(fileset[PC.SEQUENCING])
        self.add_release_item_to_patchdict(sequencing, f"Sequencing - {sequencing[PC.SUBMITTED_ID]}")

        if len(fileset[PC.LIBRARIES]) > 1:
            self.warnings.append(
                f"{bcolors.WARNING}WARNING:{bcolors.ENDC} Multiple libraries attached to file set {fileset[PC.ACCESSION]}"
            )

        for library_id in fileset[PC.LIBRARIES]:
            library = self.get_metadata(library_id)
            self.add_release_item_to_patchdict(library, f"Library - {library[PC.SUBMITTED_ID]}")

            assay = self.get_metadata(library[PC.ASSAY])
            self.add_release_item_to_patchdict(assay, f"Assay - {assay[PC.IDENTIFIER]}")

            analyte = self.get_metadata(library[PC.ANALYTE])
            self.add_release_item_to_patchdict(analyte, f"Analyte - {analyte[PC.SUBMITTED_ID]}")

            for sample_uuid in analyte[PC.SAMPLES]:
                sample = self.get_metadata(sample_uuid)
                self.add_release_item_to_patchdict(sample, f"Sample - {sample[PC.SUBMITTED_ID]}")

                sample_sources = sample[PC.SAMPLE_SOURCES]
                for sample_source_id in sample_sources:
                    sample_source = self.get_metadata(sample_source_id)
                    self.add_release_item_to_patchdict(sample_source, f"SampleSource - {sample_source[PC.SUBMITTED_ID]}")

        print("\nThe following metadata patches will be carried out in the next step:")
        for info in self.patch_infos:
            print(info)

        if len(self.warnings) > 0:
            print(f"\n{bcolors.WARNING}Please note the following warnings:{bcolors.ENDC}")
            for warning in self.warnings:
                print(warning)

        # pp.pprint(file)
        # pp.pprint(fileset)
        # pp.pprint(quality_metrics)
        # pp.pprint(quality_metrics_zips)
        # pp.pprint(self.patch_infos)
        # pp.pprint(self.patch_dicts)

    def execute(self, patch_dict):
        pass

    def add_release_item_to_patchdict(self, item: Dict, item_desc: str):
        """Sets the status of the item to released and
        adds the corresponding patch dict

        Args:
            item (Dict): Portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        self.patch_infos.append(f"\n{item_desc} ({item[PC.ACCESSION]}):")

        if item[PC.STATUS] == PC.RELEASED:
            self.patch_infos.append(f"  - {bcolors.OKBLUE}{PC.STATUS}{bcolors.ENDC} is already set to {bcolors.OKBLUE}{PC.RELEASED}{bcolors.ENDC}. Not patching.")
            return

        patch_body = {
            PC.UUID: item[PC.UUID],
            PC.STATUS: PC.RELEASED,
        }
        self.patch_infos.append(f"  - {bcolors.OKBLUE}{PC.STATUS}{bcolors.ENDC} is set to {bcolors.OKBLUE}{PC.RELEASED}{bcolors.ENDC}")

        self.patch_dicts.append(patch_body)

    def add_release_items_to_patchdict(self, items: List, type: str):
        """Sets the status to released in all items in the list and
        adds the corresponding patch dict

        Args:
            items (List): List of portal item
            type (str): Type of the items to patch. Just used for generating
            more usefuls patch infos
        """
        for item in items:
            self.add_release_item_to_patchdict(item, type)

    def add_file_patchdict(self, file, fileset, dataset):

        access_status = self.get_access_status(file, dataset)
        annotated_filename = self.get_annotated_filename(file)
        # Add file to file set and set status to released
        patch_body = {
            PC.UUID: file[PC.UUID],
            PC.STATUS: PC.RELEASED,
            PC.FILE_SETS: [fileset[PC.UUID]],
            PC.DATASET: dataset,
            PC.ACCESS_STATUS: access_status,
            PC.ANNOTATED_FILENAME: annotated_filename
        }
        self.patch_infos.extend(
            [
                f"\nFile ({file[PC.ACCESSION]}):",
                f"  - {bcolors.OKBLUE}{PC.STATUS}            {bcolors.ENDC} is set to {bcolors.OKBLUE}{PC.RELEASED}{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.DATASET}           {bcolors.ENDC} is set to {bcolors.OKBLUE}{dataset}{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.FILE_SET}          {bcolors.ENDC} is set to {bcolors.OKBLUE}[{fileset[PC.ACCESSION]}]{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.ACCESS_STATUS}     {bcolors.ENDC} is set to {bcolors.OKBLUE}{access_status}{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.ANNOTATED_FILENAME}{bcolors.ENDC} is set to {bcolors.OKBLUE}{annotated_filename}{bcolors.ENDC}",
            ]
        )

        if PC.EXTRA_FILES in file:
            extra_files = deepcopy(file[PC.EXTRA_FILES])
            for ef in extra_files:
                ef[PC.STATUS] = PC.RELEASED
            patch_body[PC.EXTRA_FILES] = extra_files
            self.patch_infos.append(
                f"  - Setting {bcolors.OKBLUE}{PC.STATUS}{bcolors.ENDC} of {bcolors.OKBLUE}{len(extra_files)} extra files{bcolors.ENDC} to {bcolors.OKBLUE}{PC.RELEASED}{bcolors.ENDC}"
            )
        self.patch_dicts.append(patch_body)

    def get_annotated_filename(self, file):
        return "TO BE IMPLEMENTED"

    def get_access_status(self, file: Dict, dataset: str):
        """
        Currently applied mapping from dataset to access_status.
        MAPPING IS NOT IMPLEMENTED FOR EPIGENETIC DATA YET

        COLO829:
            BAM, FASTQ = Open
            Files with somatic variants = Open
            Files with germline variants = Open
            Files with expression or epigenetic data = Open
        HapMap and “HG***”
            BAM, FASTQ = Open
            Files with somatic variants = Open
            Files with germline variants = Open
            Files with expression or epigenetic data = Open
        iPSC / Fibroblast (i.e. LB-LA)
            BAM, FASTQ = Protected
            Files with somatic variants = Protected
            Files with germline variants = Protected
            Files with expression or epigenetic data = Open
        Tissues
            BAM, FASTQ = Protected
            Files with somatic variants = Open
            Files with germline variants = Protected
            Files with expression or epigenetic data = Open

        Args:
            file (Dict): File item from portal
            dataset (str): dataset
        """

        # function internal dataset categories:
        COLO829_HAPMAP = "colo829_hapmap"
        IPSC = "ipsc"
        TISSUE = "tissue"

        access_status_mapping = {
            COLO829_HAPMAP: {
                PC.SEQUENCING_READS: PC.OPEN,
                PC.GERMLINE_VARIANT_CALLS: PC.OPEN,
                PC.SOMATIC_VARIANT_CALLS: PC.OPEN,
            },
            IPSC: {
                PC.SEQUENCING_READS: PC.PROTECTED,
                PC.GERMLINE_VARIANT_CALLS: PC.PROTECTED,
                PC.SOMATIC_VARIANT_CALLS: PC.PROTECTED,
            },
            TISSUE: {
                PC.SEQUENCING_READS: PC.PROTECTED,
                PC.GERMLINE_VARIANT_CALLS: PC.PROTECTED,
                PC.SOMATIC_VARIANT_CALLS: PC.OPEN,
            },
        }

        if dataset in [
            "colo829bl",
            "colo829t",
            "colo829blt_50to1",
            "hapmap",
            "hg002",
            "hg00438",
            "hg005",
            "hg02257",
            "hg02486",
            "hg02622",
        ]:
            dataset_category = COLO829_HAPMAP
        elif dataset in [
            "lb_fibroblast",
            "lb_ipsc_1",
            "lb_ipsc_2",
            "lb_ipsc_4",
            "lb_ipsc_52",
            "lb_ipsc_60",
        ]:
            dataset_category = IPSC
        else:
            self.print_error_and_exit(
                f"Cannot get access_status from dataset {dataset}. Unknown dataset."
            )

        if len(file[PC.DATA_CATEGORY]) > 1:
            self.warnings.append(
                f"{bcolors.WARNING}WARNING:{bcolors.ENDC} File has multiple data categories. Check access_status."
            )
        data_category = file[PC.DATA_CATEGORY][0]

        if data_category not in access_status_mapping[dataset_category]:
            self.print_error_and_exit(
                f"Cannot get access_status from data_category {data_category}. PLease add it to access_status_mapping."
            )
        return access_status_mapping[dataset_category][data_category]

    def check_file_validity(self, file):
        accession = file["accession"]

        for prop in REQUIRED_FILE_PROPS:
            if prop not in file:
                self.print_error_and_exit(
                    f"File {file[PC.ACCESSION]} does not have the required property `{prop}`."
                )

        if PC.FILE_SETS in file and len(file[PC.FILE_SETS]) > 0:
            self.warnings.append(
                f"{bcolors.WARNING}WARNING:{bcolors.ENDC} File {accession} already has an associated file set. It will be overwritten."
            )

        if file.get(PC.OUTPUT_STATUS) != PC.FINAL_OUTPUT:
            self.warnings.append(
                f"{bcolors.WARNING}WARNING:{bcolors.ENDC} File {accession} does not have {PC.OUTPUT_STATUS}='{PC.FINAL_OUTPUT}'."
            )

    def print_error_and_exit(self, msg):
        print(f"{bcolors.FAIL}ERROR: {msg} Exiting.{bcolors.ENDC}")
        exit()

    def get_quality_metrics_zip_files(self, quality_metrics) -> List:
        zip_files = []
        for qm in quality_metrics:
            url = qm.get("url", "")
            # Parsing the URL here. Not ideal.
            zip_accession = url.split("/")[-1]
            zip_accession = zip_accession.split(".")[0]
            if zip_accession.startswith("SMA"):
                zip_file = self.get_metadata(zip_accession)
                zip_files.append(zip_file)
            else:
                print(
                    f"{bcolors.WARNING}WARNING:{bcolors.ENDC} Could not find a metrics zip file for QualityMetrics {qm[PC.ACCESSION]}"
                )
        return zip_files

    def get_quality_metrics_from_file(self, file) -> List:
        qms = file.get(PC.QUALITY_METRICS, [])
        if not qms:
            self.warnings.append(
                f"{bcolors.WARNING}WARNING:{bcolors.ENDC} File {file[PC.ACCESSION]} does not have an associated QualityMetrics item."
            )
        quality_metrics = []
        for qm in qms:
            quality_metrics.append(self.get_metadata(qm))
        return quality_metrics

    def get_fileset_from_file(self, file):
        search_filter = f"/search/?type=MetaWorkflowRun&workflow_runs.output.file.uuid={file[PC.UUID]}"
        mwfrs = ff_utils.search_metadata(search_filter, key=self.key)
        if len(mwfrs) != 1:
            self.print_error_and_exit(
                f"Expected exactly one associated MetaWorkflowRun, got {len(mwfrs)}: {search_filter}"
            )

        mwfr = mwfrs[0]
        file_sets = mwfr[PC.FILE_SETS]
        if len(file_sets) != 1:
            self.print_error_and_exit(
                f"Expected exactly one associated FileSet, got {len(file_sets)} from MetaWorkflowRun {mwfr[PC.ACCESSION]}"
            )

        file_set_uuid = file_sets[0][PC.UUID]
        return self.get_metadata(file_set_uuid)

    def get_metadata(self, identifier):
        return ff_utils.get_metadata(
            identifier, add_on="frame=raw&datastore=database", key=self.key
        )


class bcolors:
    HEADER = "\033[95m"
    OKBLUE = "\033[94m"
    OKCYAN = "\033[96m"
    OKGREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"
    UNDERLINE = "\033[4m"


# def get_user_confirmation(msg, yes_value="y"):
#     val = input(msg)
#     if val != yes_value:
#         print(f"{bcolors.FAIL}Aborted by user.{bcolors.ENDC}")
#         exit()
    
def get_auth_key(env: str) -> Dict[str, str]:
    """Get auth key for given environment."""
    key_manager = SMaHTKeyManager()
    return key_manager.get_keydict_for_env(env)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file", "-f", help="Identifier of the file to release", required=True
    )
    parser.add_argument("--dataset", "-d", help="Associated dataset", required=True)
    parser.add_argument("--env", "-e", help="Environment from keys file", required=True)

    args = parser.parse_args()

    auth_key = get_auth_key(args.env)

    file_release = FileRelease(auth_key=auth_key)
    file_release.prepare(args.file, args.dataset)

    resp = input(
        "\nDo you want to proceed with the release and execute the metadata patches above? (y,n) "
    )
    if resp not in ["y", "yes"]:
        print(f"{bcolors.FAIL}Aborted by user.{bcolors.ENDC}")
        exit()
    print("EXECUTING")


if __name__ == "__main__":
    main()
