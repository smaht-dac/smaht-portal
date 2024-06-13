import argparse
import pprint
from dataclasses import dataclass
from functools import cached_property
from typing import Dict, List, Any

from dcicutils import ff_utils  # noqa
from dcicutils.creds_utils import SMaHTKeyManager  # noqa

from encoded.commands import create_annotated_filenames as caf
from encoded.commands.utils import get_auth_key
from encoded.item_utils import (
    cell_culture_mixture as cell_culture_mixture_utils,
    file as file_utils,
    item as item_utils,
    meta_workflow_run as meta_workflow_run_utils,
    quality_metric as quality_metric_utils,
)
from encoded.item_utils.constants import (
    file as file_constants,
    item as item_constants,
)
from encoded.item_utils.utils import RequestHandler

pp = pprint.PrettyPrinter(indent=2)

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
##  - Set donors and/or cell lines to `released`
##
##################################################################
##################################################################


@dataclass(frozen=True)
class AnnotatedFilenameInfo:
    filename: str
    patch_dict: Dict[str, Any]


# dataset is required but comes in through input args for now
REQUIRED_FILE_PROPS = [file_constants.SEQUENCING_CENTER]


class FileRelease:

    def __init__(self, auth_key: dict, file_identifier: str):
        self.key = auth_key
        self.request_handler = self.get_request_handler()
        self.file = self.get_metadata(file_identifier)
        self.file_accession = item_utils.get_accession(self.file)
        self.patch_infos = []
        self.patch_dicts = []
        self.warnings = []

    @cached_property
    def file_sets(self) -> List[dict]:
        return self.get_file_sets_from_file()

    @cached_property
    def quality_metrics(self) -> List[dict]:
        quality_metrics = self.request_handler.get_items(
            file_utils.get_quality_metrics(self.file)
        )
        if not quality_metrics:
            self.add_warning(
                f"File {self.file_accession} does not have an associated QualityMetrics"
                " item."
            )
        return quality_metrics

    @cached_property
    def quality_metrics_zips(self) -> List[dict]:
        return self.get_quality_metrics_zip_files(self.quality_metrics)

    @cached_property
    def libraries(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_libraries(self.file, self.request_handler)
        )

    @cached_property
    def assays(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_assays(self.file, self.request_handler)
        )

    @cached_property
    def sequencings(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_sequencings(self.file, self.request_handler)
        )

    @cached_property
    def analytes(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_analytes(self.file, self.request_handler)
        )

    @cached_property
    def samples(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_samples(self.file, self.request_handler)
        )

    @cached_property
    def sample_sources(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_sample_sources(self.file, self.request_handler)
        )

    @cached_property
    def cell_cultures_from_mixtures(self) -> List[dict]:
        cell_culture_mixtures = file_utils.get_cell_culture_mixtures(
            self.file, self.request_handler
        )
        cell_cultures = [
            culture
            for cell_culture_mixture in cell_culture_mixtures
            for culture in cell_culture_mixture_utils.get_cell_cultures(
                self.get_metadata(cell_culture_mixture)
            )
        ]
        if cell_cultures:
            return self.request_handler.get_items(set(cell_cultures))
        return []

    @cached_property
    def cell_lines(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_cell_lines(self.file, self.request_handler)
        )

    @cached_property
    def donors(self) -> List[dict]:
        return self.request_handler.get_items(
            file_utils.get_donors(self.file, self.request_handler)
        )

    def get_request_handler(self) -> RequestHandler:
        return RequestHandler(auth_key=self.key, frame="raw", datastore="database")

    def get_metadata(self, identifier: str) -> dict:
        return self.request_handler.get_item(identifier)

    def get_file_sets_from_file(self) -> List[dict]:
        if file_sets := file_utils.get_file_sets(self.file):
            return [self.get_metadata(file_set) for file_set in file_sets]
        search_filter = (
            f"/search/?type=MetaWorkflowRun&workflow_runs.output.file.uuid="
            f"{item_utils.get_uuid(self.file)}"
        )
        mwfrs = ff_utils.search_metadata(search_filter, key=self.key)
        if len(mwfrs) != 1:
            self.print_error_and_exit(
                (
                    f"Expected exactly one associated MetaWorkflowRun, got"
                    f" {len(mwfrs)}: {search_filter}"
                )
            )
        mwfr = mwfrs[0]
        file_sets = meta_workflow_run_utils.get_file_sets(mwfr)
        # Might need to be more general in the future
        if len(file_sets) != 1:
            self.print_error_and_exit(
                f"Expected exactly one associated FileSet, got {len(file_sets)} from"
                f" MetaWorkflowRun {item_utils.get_accession(mwfr)}"
            )

        return self.get_metadata(file_sets[0])

    def get_quality_metrics_zip_files(self) -> List[dict]:
        zip_files = []
        for quality_metric in self.quality_metrics:
            zip_accession = quality_metric_utils.get_zip_file_accession(quality_metric)
            if zip_accession.startswith("SMA"):
                zip_file = self.get_metadata(zip_accession)
                zip_files.append(zip_file)
            else:
                self.add_warning(
                    f"Could not find a metrics zip file for QualityMetric"
                    f" {item_utils.get_accession(quality_metric)}"
                )
        return zip_files

    def prepare(
        self, dataset: str, obsolete_file_identifier: str = None, **kwargs: Any
    ) -> None:
        self.validate_file()
        self.add_file_patchdict(dataset)
        self.add_release_items_to_patchdict(self.quality_metrics, "QualityMetric")
        self.add_release_items_to_patchdict(
            self.quality_metrics_zips, "Compressed QC metrics file"
        )
        self.add_release_items_to_patchdict(self.file_sets, "FileSet")
        self.add_release_items_to_patchdict(self.sequencings, "Sequencing")
        self.add_release_items_to_patchdict(self.libraries, "Library")
        self.add_release_items_to_patchdict(self.assays, "Assay")
        self.add_release_items_to_patchdict(self.analytes, "Analyte")
        self.add_release_items_to_patchdict(self.samples, "Sample")
        self.add_release_items_to_patchdict(self.sample_sources, "SampleSource")
        self.add_release_items_to_patchdict(
            self.cell_cultures_from_mixtures, "CellCulture"
        )
        self.add_release_items_to_patchdict(self.cell_lines, "CellLine")
        self.add_release_items_to_patchdict(self.donors, "Donor")

        if obsolete_file_identifier:
            obsolete_file = self.get_metadata(obsolete_file_identifier)
            self.add_obsolete_file_patchdict(obsolete_file)

        print("\nThe following metadata patches will be carried out in the next step:")
        for info in self.patch_infos:
            print(info)

        if len(self.warnings) > 0:
            warning_message = "Please note the following warnings:"
            print(f"\n{warning_text(warning_message)}")
            for warning in self.warnings:
                print(warning)

    def execute(self) -> None:
        print("Validating all patch dictionaries...")
        try:
            for patch_dict in self.patch_dicts:
                self.validate_patch(patch_dict)
        except Exception as e:
            print(str(e))
            self.print_error_and_exit("Validation failed.")

        print("Validation done. Patching...")
        try:
            for patch_dict in self.patch_dicts:
                self.patch_metadata(patch_dict)
        except Exception as e:
            print(str(e))
            self.print_error_and_exit("Patching failed.")

        to_print = f"Release of File {self.file_accession} completed."
        print(ok_green_text(to_print))

    def validate_patch(self, patch_body: Dict[str, Any]) -> None:
        uuid = item_utils.get_uuid(patch_body)
        ff_utils.patch_metadata(
            patch_body, obj_id=uuid, add_on="?check_only=true", key=self.key
        )

    def patch_metadata(self, patch_body: Dict[str, Any]) -> None:
        uuid = item_utils.get_uuid(patch_body)
        ff_utils.patch_metadata(patch_body, obj_id=uuid, key=self.key)

    def get_patch_body(self, patch_dict: Dict[str, Any]) -> Dict[str, Any]:
        return {
            key: value
            for key, value in patch_dict.items()
            if key != item_constants.UUID
        }

    def show_patch_dicts(self) -> None:
        print("\n")
        pp.pprint(self.patch_dicts)

    def add_release_item_to_patchdict(self, item: dict, item_desc: str) -> None:
        """Sets the status of the item to released and
        adds the corresponding patch dict

        Args:
            item (dict): Portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        identifier_to_report = self.get_identifier_to_report(item)
        self.patch_infos.append(f"\n{item_desc} ({identifier_to_report}):")

        if item_utils.is_released(item):
            self.add_okay_message(
                item_constants.STATUS, item_constants.STATUS_RELEASED, "Not patching."
            )
            return

        patch_body = {
            item_constants.UUID: item_utils.get_uuid(item),
            item_constants.STATUS: item_constants.STATUS_RELEASED,
        }
        self.add_okay_message(item_constants.STATUS, item_constants.STATUS_RELEASED)
        self.patch_dicts.append(patch_body)

    def get_identifier_to_report(self, item: Dict[str, Any]) -> str:
        if submitted_id := item_utils.get_submitted_id(item):
            return submitted_id
        if identifier := item_utils.get_identifier(item):
            return identifier
        return item_utils.get_accession(item)

    def add_release_items_to_patchdict(self, items: list, item_desc: str) -> None:
        """Sets the status to released in all items in the list and
        adds the corresponding patch dict

        Args:
            items (list): List of portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        for item in items:
            self.add_release_item_to_patchdict(item, item_desc)

    def add_file_patchdict(self, dataset: str) -> None:
        access_status = self.get_access_status(dataset)
        file_set_accessions = [
            item_utils.get_accession(file_set) for file_set in self.file_sets
        ]
        annotated_filename_info = self.get_annotated_filename_info()

        # Add file to file set and set status to released
        patch_body = {
            item_constants.UUID: item_utils.get_uuid(self.file),
            item_constants.STATUS: item_constants.STATUS_RELEASED,
            file_constants.FILE_SETS: file_set_accessions,
            file_constants.DATASET: dataset,
            file_constants.ACCESS_STATUS: access_status,
            file_constants.ANNOTATED_FILENAME: annotated_filename_info.filename,
        }

        # Take the extra files from the annotated filename object if available.
        # They will have the correct filenames
        if annotated_filename_info.patch_dict:
            extra_files = annotated_filename_info.patch_dict.get(
                file_constants.EXTRA_FILES
            )
            if extra_files:
                patch_body[file_constants.EXTRA_FILES] = extra_files

        self.patch_infos.extend(
            [
                f"\nFile ({self.file_accession}):",
                self.get_okay_message(
                    item_constants.STATUS, item_constants.STATUS_RELEASED
                ),
                self.get_okay_message(file_constants.DATASET, dataset),
                self.get_okay_message(
                    file_constants.FILE_SETS, ",".join(file_set_accessions)
                ),
                self.get_okay_message(file_constants.ACCESS_STATUS, access_status),
                self.get_okay_message(
                    file_constants.ANNOTATED_FILENAME, annotated_filename_info.filename
                ),
            ]
        )
        self.patch_dicts.append(patch_body)

    def get_annotated_filename_info(self) -> AnnotatedFilenameInfo:
        annotated_filename = file_utils.get_annotated_filename(self.file)
        if annotated_filename:
            return AnnotatedFilenameInfo(annotated_filename, {})

        annotated_filename = caf.get_annotated_filename(self.file, self.request_handler)
        if caf.has_errors(annotated_filename):
            errors = "; ".join(annotated_filename.errors)
            self.print_error_and_exit(
                f"Could not get annotated filename for {self.file_accession}: {errors}"
            )
        patch_body = caf.get_patch_body(annotated_filename, self.key)
        return AnnotatedFilenameInfo(str(annotated_filename), patch_body)

    def get_access_status(self, dataset: str) -> str:
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
                file_constants.SEQUENCING_READS: file_constants.ACCESS_STATUS_OPEN,
                file_constants.GERMLINE_VARIANT_CALLS: (
                    file_constants.ACCESS_STATUS_OPEN
                ),
                file_constants.SOMATIC_VARIANT_CALLS: file_constants.ACCESS_STATUS_OPEN,
            },
            IPSC: {
                file_constants.SEQUENCING_READS: file_constants.ACCESS_STATUS_PROTECTED,
                file_constants.GERMLINE_VARIANT_CALLS: (
                    file_constants.ACCESS_STATUS_PROTECTED
                ),
                file_constants.SOMATIC_VARIANT_CALLS: (
                    file_constants.ACCESS_STATUS_PROTECTED
                ),
            },
            TISSUE: {
                file_constants.SEQUENCING_READS: file_constants.ACCESS_STATUS_PROTECTED,
                file_constants.GERMLINE_VARIANT_CALLS: (
                    file_constants.ACCESS_STATUS_PROTECTED
                ),
                file_constants.SOMATIC_VARIANT_CALLS: file_constants.ACCESS_STATUS_OPEN,
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

        access_status = self.get_access_status_from_data_categories(
            dataset_category, access_status_mapping.get(dataset_category, {})
        )
        return access_status

    def get_access_status_from_data_categories(
        self, data_category_to_access_status: Dict[str, str]
    ) -> str:
        missing_data_categories = []
        access_statuses = set()
        data_categories = file_utils.get_data_category(self.file)
        if not data_categories:
            self.print_error_and_exit(
                f"File {self.file_accession} does not have any data category."
            )
        for data_category in data_categories:
            access_status = data_category_to_access_status.get(data_category)
            if not access_status:
                missing_data_categories.append(data_category)
            else:
                access_statuses.add(access_status)
        if missing_data_categories:
            self.print_error_and_exit(
                f"Cannot get access_status for data_categories:"
                f" {missing_data_categories}."
                f" Please add them to access_status_mapping."
            )
        if len(access_statuses) > 1:
            self.print_error_and_exit(
                f"Cannot get access_status for data_categories: {data_categories}."
                f" Multiple access_statuses found: {access_statuses}."
            )
        return access_statuses.pop()

    def validate_file(self) -> None:
        self.validate_required_file_props()
        self.validate_existing_file_sets()
        self.validate_file_output_status()
        self.validate_file_status()

    def validate_required_file_props(self) -> None:
        for prop in REQUIRED_FILE_PROPS:
            if prop not in self.file:
                self.print_error_and_exit(
                    f"File {self.file_accession} does not have the required property"
                    f" `{prop}`."
                )

    def validate_existing_file_sets(self) -> None:
        existing_file_sets = file_utils.get_file_sets(self.file)
        if file_utils.is_output_file(self.file):
            self.add_warning(
                f"File {self.file_accession} already has an associated file set."
                " It will NOT be overwritten."
            )
        if file_utils.is_submitted_file(self.file) and not existing_file_sets:
            self.print_error_and_exit(
                f"Submitted file {self.file_accession} has no associated file set."
            )

    def validate_file_output_status(self) -> None:
        if file_utils.is_output_file(self.file) and file_utils.is_final_output(
            self.file
        ):
            self.add_warning(f"File {self.file_accession} is not a final output file.")

    def validate_file_status(self) -> None:
        if not file_utils.is_uploaded(self.file):
            self.add_warning(
                f"File {self.file_accession} has status"
                f" `{file_utils.get_status(self.file)}`."
                f" Expected `{item_constants.STATUS_UPLOADED}`."
            )

    def add_obsolete_file_patchdict(self, obsolete_file: dict) -> None:
        if not item_utils.is_released(obsolete_file):
            self.add_warning(
                f"File {item_utils.get_accession(obsolete_file)} has status"
                f" `{item_utils.get_status(obsolete_file)}`. Expected"
                f" `{item_constants.STATUS_RELEASED}`."
            )
            return

        obsolete_file_file_sets = self.get_file_sets_from_file(obsolete_file)
        if not self.has_same_file_sets(obsolete_file_file_sets):
            self.print_error_and_exit(
                "The obsolete file has different FileSet(s) than the new file."
            )

        self.patch_infos.extend(
            [
                (
                    f"\nPreviously released file"
                    f" {file_utils.get_annotated_filename(obsolete_file)}"
                    f" ({item_utils.get_accession(obsolete_file)}):"
                ),
                self.get_okay_message(
                    item_constants.STATUS, item_constants.STATUS_OBSOLETE
                ),
            ]
        )
        patch_body = {
            item_constants.UUID: item_utils.get_uuid(obsolete_file),
            item_constants.STATUS: item_constants.STATUS_OBSOLETE,
        }
        self.patch_dicts.append(patch_body)

    def has_same_file_sets(self, obsolete_file_file_sets: List[Dict[str, Any]]) -> bool:
        if len(obsolete_file_file_sets) != len(self.file_sets):
            return False
        for file_set in self.file_sets:
            if item_utils.get_accession(file_set) not in [
                item_utils.get_accession(obsolete_file_file_set)
                for obsolete_file_file_set in obsolete_file_file_sets
            ]:
                return False
        return True

    def print_error_and_exit(self, msg: str) -> None:
        error_message = f"ERROR: {msg} Exiting."
        print(f"{fail_text(error_message)}")
        exit()

    def add_warning(self, msg: str) -> None:
        self.warnings.append(f"{warning_text('WARNING')} {msg}")

    def add_okay_message(
        self, property_name: str, property_value: str, add_on: str = ""
    ) -> None:
        okay_message = self.get_okay_message(property_name, property_value, add_on)
        self.patch_infos.append(okay_message)

    def get_okay_message(
        self, property_name: str, property_value: str, add_on: str = ""
    ) -> str:
        okay_message = (
            f"  - {ok_blue_text(property_name)} is set to"
            f" {ok_blue_text(property_value)}."
        )
        return f"{okay_message} {add_on}" if add_on else okay_message


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


def ok_blue_text(text: str) -> str:
    return f"{bcolors.OKBLUE}{text}{bcolors.ENDC}"


def ok_green_text(text: str) -> str:
    return f"{bcolors.OKGREEN}{text}{bcolors.ENDC}"


def bold_text(text: str) -> str:
    return f"{bcolors.BOLD}{text}{bcolors.ENDC}"


def warning_text(text: str) -> str:
    return f"{bcolors.WARNING}{text}{bcolors.ENDC}"


def fail_text(text: str) -> str:
    return f"{bcolors.FAIL}{text}{bcolors.ENDC}"


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
    server = auth_key.get("server")

    file_release = FileRelease(auth_key=auth_key, file_identifier=args.file)
    file_release.prepare(dataset=args.dataset, obsolete_file_identifier=args.replace)

    while True:
        resp = input(
            f"\nDo you want to proceed with release and execute patches above? "
            f"Data will be patched on {warning_text(server)}."
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
            print(f"{warning_text('Aborted by user.')}")
            exit()


if __name__ == "__main__":
    main()
