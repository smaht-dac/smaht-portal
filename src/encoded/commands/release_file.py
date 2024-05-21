import argparse
from typing import Dict, List, Any
import create_annotated_filenames as caf
import pprint
from dataclasses import dataclass

pp = pprint.PrettyPrinter(indent=2)

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager


##################################################################
##################################################################
##
##  The file release will do the following updates to the metadata
##  - Set file status to `released`
##  - Associate the file with the fileset that the corresponding
##    submitted files are in
##  - Adds `dataset`` and `access_status`` to the file
##  - Set the associated QualityMetrics item and the metrics.zip
##    file to status `released`
##  - Set corresponding FileSet to `released`
##  - Set FileSet associated libraries, and sequencing to `released`
##  - Set library associated assay and analyte to `released`
##  - Set analyte associated samples to `released`
##  - Set sample associated sample_source to `released`
##
##################################################################
##################################################################


class PC:  # PortalConstants
    ACCESSION = "accession"
    ACCESS_STATUS = "access_status"
    AGE = "age"
    ALIGNED_READS = "Aligned Reads"
    ALIGNMENT_DETAILS = "alignment_details"
    ANALYTE = "analytes"
    ANNOTATED_FILENAME = "annotated_filename"
    ASSAY = "assay"
    CONSORTIA = "consortia"
    CELL_LINE = "cell_line"
    CELL_CULTURE = "CellCulture"
    CELL_CULTURE_MIXTURE = "CellCultureMixture"
    COMPONENTS = "components"
    DATA_CATEGORY = "data_category"
    DATASET = "dataset"
    EXTRA_FILES = "extra_files"
    FILE_SETS = "file_sets"
    FILE_SET = "file_set"
    FILENAME = "filename"
    FINAL_OUTPUT = "Final Output"
    GERMLINE_VARIANT_CALLS = "Germline Variant Calls"
    IDENTIFIER = "identifier"
    LIBRARIES = "libraries"
    LIBRARY = "library"
    OUTPUT_STATUS = "output_status"
    OUTPUT_FILE = "OutputFile"
    OPEN = "Open"
    OBSOLETE = "obsolete"
    PROTECTED = "Protected"
    QUALITY_METRICS = "quality_metrics"
    QUALITY_METRIC = "quality_metric"
    RELEASED = "released"
    SAMPLE_SOURCES = "sample_sources"
    SAMPLES = "samples"
    SAMPLE = "sample"
    SEQUENCING = "sequencing"
    SEQUENCING_CENTER = "sequencing_center"
    SEQUENCING_READS = "Sequencing Reads"
    SOMATIC_VARIANT_CALLS = "Somatic Variant Calls"
    STATUS = "status"
    SUBMISSION_CENTERS = "submission_centers"
    SUBMITTER_ID = "submitter_id"
    SUBMITTED_ID = "submitted_id"
    TYPE = "@type"
    TISSUE = "Tissue"
    UPLOADED = "uploaded"
    UUID = "uuid"
    VARIANT_TYPE = "variant_type"
    VERSION = "version"


@dataclass(frozen=True)
class AnnotatedFilenameInfo:
    filename: str
    patch_dict: Dict[str, Any]


# dataset is required but comes in through input args for now
REQUIRED_FILE_PROPS = [PC.SEQUENCING_CENTER]


class FileRelease:

    def __init__(self, auth_key: dict):
        self.key = auth_key
        self.patch_infos = []
        self.patch_dicts = []
        self.warnings = []
        self.file_accession = ""

    def prepare(
        self, file_identifier: str, dataset: str, **kwargs
    ) -> None:

        file = self.get_metadata_object(file_identifier)
        self.file_accession = file[PC.ACCESSION]
        self.check_file_validity(file)
        fileset = self.get_fileset_from_file(file)
        self.add_file_patchdict(file, fileset, dataset)

        quality_metrics = self.get_quality_metrics_from_file(file)
        self.add_release_items_to_patchdict(quality_metrics, "QualityMetric")

        quality_metrics_zips = self.get_quality_metrics_zip_files(quality_metrics)
        self.add_release_items_to_patchdict(
            quality_metrics_zips, "Compressed QC metrics file"
        )

        # Get higher level items starting from file set in order to set them to released
        self.add_release_item_to_patchdict(
            fileset, f"FileSet - {fileset[PC.SUBMITTED_ID]}"
        )
        sequencing = self.get_metadata(fileset[PC.SEQUENCING])
        self.add_release_item_to_patchdict(
            sequencing, f"Sequencing - {sequencing[PC.SUBMITTED_ID]}"
        )

        if len(fileset[PC.LIBRARIES]) > 1:
            self.add_warning(
                f"Multiple libraries attached to file set {fileset[PC.ACCESSION]}"
            )

        for library_id in fileset[PC.LIBRARIES]:
            library = self.get_metadata(library_id)
            self.add_release_item_to_patchdict(
                library, f"Library - {library[PC.SUBMITTED_ID]}"
            )

            assay = self.get_metadata(library[PC.ASSAY])
            self.add_release_item_to_patchdict(assay, f"Assay - {assay[PC.IDENTIFIER]}")

            analyte_ids = library[PC.ANALYTES]
            for analyte_id in analyte_ids:
                analyte = self.get_metadata(analyte_id)
                self.add_release_item_to_patchdict(
                    analyte, f"Analyte - {analyte[PC.SUBMITTED_ID]}"
                )

                for sample_uuid in analyte[PC.SAMPLES]:
                    sample = self.get_metadata(sample_uuid)
                    self.add_release_item_to_patchdict(
                        sample, f"Sample - {sample[PC.SUBMITTED_ID]}"
                    )

                    sample_sources = sample[PC.SAMPLE_SOURCES]
                    for sample_source in sample_sources:
                        self.release_sample_source(sample_source)

        if "obsolete_file_identifier" in kwargs and kwargs["obsolete_file_identifier"]:
            obsolete_file = self.get_metadata_object(kwargs["obsolete_file_identifier"])
            self.add_obsolete_file_patchdict(obsolete_file, fileset)

        print("\nThe following metadata patches will be carried out in the next step:")
        for info in self.patch_infos:
            print(info)

        if len(self.warnings) > 0:
            print(
                f"\n{bcolors.WARNING}Please note the following warnings:{bcolors.ENDC}"
            )
            for warning in self.warnings:
                print(warning)

    def execute(self) -> None:
        print("Validating all patch dictionaries...")
        try:
            for patch_dict in self.patch_dicts:
                ff_utils.patch_metadata(
                    patch_dict,
                    obj_id=patch_dict[PC.UUID],
                    add_on="?check_only=true",
                    key=self.key,
                )
        except Exception as e:
            print(str(e))
            self.print_error_and_exit("Validation failed.")

        print("Validation done. Patching...")
        try:
            for patch_dict in self.patch_dicts:
                ff_utils.patch_metadata(
                    patch_dict,
                    obj_id=patch_dict[PC.UUID],
                    key=self.key,
                )
        except Exception as e:
            print(str(e))
            self.print_error_and_exit("Patching failed.")

        print(
            f"{bcolors.OKGREEN}Release of File {self.file_accession} completed.{bcolors.ENDC}"
        )

    def show_patch_dicts(self) -> None:
        print("\n")
        pp.pprint(self.patch_dicts)

    def is_output_file(self, file: dict) -> bool:
        return PC.OUTPUT_FILE in file[PC.TYPE]

    def release_sample_source(self, sample_source_id: dict) -> None:

        sample_source = self.get_metadata_object(sample_source_id)
        self.add_release_item_to_patchdict(
            sample_source,
            f"SampleSource - {sample_source[PC.SUBMITTED_ID]}",
        )

        if PC.CELL_CULTURE in sample_source[PC.TYPE]:
            cell_lines = (
                [sample_source[PC.CELL_LINE]]
                if isinstance(sample_source[PC.CELL_LINE], str)
                else sample_source[PC.CELL_LINE]
            )
            for cl in cell_lines:
                cell_line = self.get_metadata(cl)
                self.add_release_item_to_patchdict(
                    cell_line,
                    f"CellLine - {cell_line[PC.SUBMITTED_ID]}",
                )
        elif PC.TISSUE in sample_source[PC.TYPE] and PC.DONOR in sample_source:
            donor = self.get_metadata(sample_source[PC.DONOR])
            self.add_release_item_to_patchdict(
                donor,
                f"Donor - {donor[PC.SUBMITTED_ID]}",
            )
        elif PC.CELL_CULTURE_MIXTURE in sample_source[PC.TYPE]:
            for component in sample_source[PC.COMPONENTS]:
                cell_culture = self.get_metadata(component[PC.CELL_CULTURE][PC.UUID])
                self.add_release_item_to_patchdict(
                    cell_culture,
                    f"CellCulture - {cell_culture[PC.SUBMITTED_ID]}",
                )
                cell_line = self.get_metadata(cell_culture[PC.CELL_LINE])
                self.add_release_item_to_patchdict(
                    cell_line,
                    f"CellLine - {cell_line[PC.SUBMITTED_ID]}",
                )
        else:
            self.add_warning(
                f"Sample source type is unknown for {sample_source[PC.ACCESSION]}"
            )

    def add_release_item_to_patchdict(self, item: dict, item_desc: str) -> None:
        """Sets the status of the item to released and
        adds the corresponding patch dict

        Args:
            item (dict): Portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        self.patch_infos.append(f"\n{item_desc} ({item[PC.ACCESSION]}):")

        if item[PC.STATUS] == PC.RELEASED:
            self.patch_infos.append(
                f"  - {bcolors.OKBLUE}{PC.STATUS}{bcolors.ENDC} is already set to {bcolors.OKBLUE}{PC.RELEASED}{bcolors.ENDC}. Not patching."
            )
            return

        patch_body = {
            PC.UUID: item[PC.UUID],
            PC.STATUS: PC.RELEASED,
        }
        self.patch_infos.append(
            f"  - {bcolors.OKBLUE}{PC.STATUS}{bcolors.ENDC} is set to {bcolors.OKBLUE}{PC.RELEASED}{bcolors.ENDC}"
        )

        self.patch_dicts.append(patch_body)

    def add_release_items_to_patchdict(self, items: list, item_desc: str) -> None:
        """Sets the status to released in all items in the list and
        adds the corresponding patch dict

        Args:
            items (list): List of portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        for item in items:
            self.add_release_item_to_patchdict(item, item_desc)

    def add_file_patchdict(self, file: dict, fileset: dict, dataset: str) -> None:

        access_status = self.get_access_status(file, dataset)
        annotated_filename_info = self.get_annotated_filename_info(file)

        # Add file to file set and set status to released
        patch_body = {
            PC.UUID: file[PC.UUID],
            PC.STATUS: PC.RELEASED,
            PC.FILE_SETS: [fileset[PC.UUID]],
            PC.DATASET: dataset,
            PC.ACCESS_STATUS: access_status,
            PC.ANNOTATED_FILENAME: annotated_filename_info.filename,
        }

        # Take the extra files from the annotated filename object if available.
        # They will have the correct filenames
        if annotated_filename_info.patch_dict:
            extra_files = annotated_filename_info.patch_dict.get(PC.EXTRA_FILES)
            if extra_files:
                patch_body[PC.EXTRA_FILES] = extra_files

        self.patch_infos.extend(
            [
                f"\nFile ({file[PC.ACCESSION]}):",
                f"  - {bcolors.OKBLUE}{PC.STATUS}            {bcolors.ENDC} is set to {bcolors.OKBLUE}{PC.RELEASED}{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.DATASET}           {bcolors.ENDC} is set to {bcolors.OKBLUE}{dataset}{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.FILE_SET}          {bcolors.ENDC} is set to {bcolors.OKBLUE}[{fileset[PC.ACCESSION]}]{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.ACCESS_STATUS}     {bcolors.ENDC} is set to {bcolors.OKBLUE}{access_status}{bcolors.ENDC}",
                f"  - {bcolors.OKBLUE}{PC.ANNOTATED_FILENAME}{bcolors.ENDC} is set to {bcolors.OKBLUE}{annotated_filename_info.filename}{bcolors.ENDC}",
            ]
        )

        self.patch_dicts.append(patch_body)

    def get_annotated_filename_info(self, file: dict) -> AnnotatedFilenameInfo:
        if "annotated_filename" in file:
            return AnnotatedFilenameInfo(file["annotated_filename"], None)

        # Use function from create_annotated_filenames.py to get relevant information
        file_items = caf.get_file_items(
            search=None, identifiers=[file[PC.UUID]], auth_key=self.key
        )
        filenames_data = caf.get_filename_data(file_items, self.key)
        if len(filenames_data) != 1:
            self.print_error_and_exit(
                "Expected to get exactly one annotated file name object"
            )

        annotated_filename = caf.create_annotated_filename(filenames_data[0])
        if caf.has_errors(annotated_filename):
            errors = "; ".join(annotated_filename.errors)
            self.print_error_and_exit(
                f"Could not get annotated filename for {annotated_filename.uuid}: {errors}"
            )
        patch_body = caf.get_patch_body(annotated_filename, self.key)

        return AnnotatedFilenameInfo(annotated_filename.filename, patch_body)

    def get_access_status(self, file: dict, dataset: str) -> str:
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
            file (dict): File item from portal
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
            self.add_warning(f"File has multiple data categories. Check access_status.")

        data_category = file[PC.DATA_CATEGORY][0]

        if data_category not in access_status_mapping[dataset_category]:
            self.print_error_and_exit(
                f"Cannot get access_status from data_category {data_category}. PLease add it to access_status_mapping."
            )
        return access_status_mapping[dataset_category][data_category]

    def check_file_validity(self, file: dict) -> None:
        accession = file["accession"]

        for prop in REQUIRED_FILE_PROPS:
            if prop not in file:
                self.print_error_and_exit(
                    f"File {file[PC.ACCESSION]} does not have the required property `{prop}`."
                )

        if (
            self.is_output_file(file)
            and PC.FILE_SETS in file
            and len(file[PC.FILE_SETS]) > 0
        ):
            self.add_warning(
                f"File {accession} already has an associated file set. It will NOT be overwritten."
            )

        if not self.is_output_file(file) and (
            (PC.FILE_SETS not in file) or len(file[PC.FILE_SETS]) != 1
        ):
            self.print_error_and_exit(
                f"Submitted file {accession} has no or more than 1 filesets."
            )

        if self.is_output_file(file) and file.get(PC.OUTPUT_STATUS) != PC.FINAL_OUTPUT:
            self.add_warning(
                f"File {accession} does not have {PC.OUTPUT_STATUS}='{PC.FINAL_OUTPUT}'."
            )

        if file.get(PC.STATUS) != PC.UPLOADED:
            self.add_warning(
                f"File {accession} has status `{file.get(PC.STATUS)}`. Expected `{PC.UPLOADED}`."
            )

    def add_obsolete_file_patchdict(self, obsolete_file: dict, fileset: dict) -> None:

        if obsolete_file[PC.STATUS] != PC.RELEASED:
            self.add_warning(
                f"File {obsolete_file[PC.ACCESSION]} has status `{obsolete_file[PC.STATUS]}`. Expected `{PC.RELEASED}`."
            )
            return

        obsolete_file_fileset = self.get_fileset_from_file(obsolete_file)
        if obsolete_file_fileset[PC.UUID] != fileset[PC.UUID]:
            self.print_error_and_exit(
                "The obsolete file has a different FileSet than the new file."
            )

        self.patch_infos.extend(
            [
                f"\nPreviously released file {obsolete_file.get(PC.ANNOTATED_FILENAME)} ({obsolete_file[PC.ACCESSION]}):",
                f"  - {bcolors.OKBLUE}{PC.STATUS}{bcolors.ENDC} is set to {bcolors.OKBLUE}{PC.OBSOLETE}{bcolors.ENDC}",
            ]
        )
        patch_body = {
            PC.UUID: obsolete_file[PC.UUID],
            PC.STATUS: PC.OBSOLETE,
        }
        self.patch_dicts.append(patch_body)

    def print_error_and_exit(self, msg: str) -> None:
        print(f"{bcolors.FAIL}ERROR: {msg} Exiting.{bcolors.ENDC}")
        exit()

    def add_warning(self, msg: str) -> None:
        self.warnings.append(f"{bcolors.WARNING}WARNING:{bcolors.ENDC} {msg}")

    def get_quality_metrics_zip_files(self, quality_metrics: List[dict]) -> list:
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
                self.add_warning(
                    f"Could not find a metrics zip file for QualityMetrics {qm[PC.ACCESSION]}"
                )

        return zip_files

    def get_quality_metrics_from_file(self, file: dict) -> list:
        qms = file.get(PC.QUALITY_METRICS, [])
        if not qms:
            self.add_warning(
                f"File {file[PC.ACCESSION]} does not have an associated QualityMetrics item."
            )

        quality_metrics = []
        for qm in qms:
            quality_metrics.append(self.get_metadata(qm))
        return quality_metrics

    def get_fileset_from_file(self, file: dict) -> dict:

        # File already has a fileset for SubmittedFiles. We checked the existence earlier
        if PC.FILE_SETS in file:
            file_set_uuid = file[PC.FILE_SETS][0]
            return self.get_metadata(file_set_uuid)

        search_filter = f"/search/?type=MetaWorkflowRun&workflow_runs.output.file.uuid={file[PC.UUID]}"
        mwfrs = ff_utils.search_metadata(search_filter, key=self.key)
        if len(mwfrs) != 1:
            self.print_error_and_exit(
                f"Expected exactly one associated MetaWorkflowRun, got {len(mwfrs)}: {search_filter}"
            )

        mwfr = mwfrs[0]
        file_sets = mwfr[PC.FILE_SETS]
        # Might need to be more general in the future
        if len(file_sets) != 1:
            self.print_error_and_exit(
                f"Expected exactly one associated FileSet, got {len(file_sets)} from MetaWorkflowRun {mwfr[PC.ACCESSION]}"
            )

        file_set_uuid = file_sets[0][PC.UUID]
        return self.get_metadata(file_set_uuid)

    def get_metadata(self, identifier: str) -> dict:
        return ff_utils.get_metadata(
            identifier, add_on="frame=raw&datastore=database", key=self.key
        )

    def get_metadata_object(self, identifier: str) -> dict:
        return ff_utils.get_metadata(
            identifier, add_on="frame=object&datastore=database", key=self.key
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
    parser.add_argument(
        "--replace",
        "-r",
        help="Identifier of the file to replace (set to obsolete)",
        required=False,
    )

    args = parser.parse_args()

    auth_key = get_auth_key(args.env)

    file_release = FileRelease(auth_key=auth_key)
    file_release.prepare(file_identifier=args.file, dataset=args.dataset,  obsolete_file_identifier=args.replace)

    while True:
        resp = input(
            f"\nDo you want to proceed with the release and execute the metadata patches above? "
            f"This will patch data on {bcolors.WARNING}{auth_key['server']}.{bcolors.ENDC} "
            f"\nYou have the following options: "
            f"\ny - Proceed with release"
            f"\np - Show patch dictionaries "
            f"\nn - Abort "
            f"\n(y,p,n): "
        )

        if resp in ["y", "yes"]:
            file_release.execute()
            break
        elif resp in ["p"]:
            file_release.show_patch_dicts()
            continue
        else:
            print(f"{bcolors.FAIL}Aborted by user.{bcolors.ENDC}")
            exit()


if __name__ == "__main__":
    main()
