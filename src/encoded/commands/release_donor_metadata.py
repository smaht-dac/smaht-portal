"""
Script to release donor and related records to open or protected statuses in SMaHT portal.

This script is for the release of donor metadata and associated
items in the SMaHT data portal. It transitions Donor and related
linked records (e.g., ProtectedDonor, MedicalHistory, Demographic,
FamilyHistory, Exposures, Treatments, Tissues, TissueSamples) from their
current status (typically `in review`) into a specified release status.

The script supports both "network release" (with a temporary "-early" status)
and "external release" (full public release, stripping the "-early" suffix),
as well as a dry-run mode for previewing changes before execution.

Core behavior:
- Updates the donor item to the chosen open release status.
- Updates the associated protected donor and related items to the protected
  release status.
- Optionally skips updates linked Tissue and TissueSample records.
- Validates and patches metadata on the target server.
- Provides an interactive prompt for confirmation before patching.

Usage:
    python donor_release.py --donor DONOR_ID --env ENV [options]

Options:
    --donor, -d DONOR_ID
        One or more identifiers of donors to release. Required.
        Accepts accessions, UUIDs, or submitted identifiers.

    --env, -e ENV
        Name of the environment as defined in the local keys file.
        Required. Used to retrieve authentication credentials.

    --dry-run
        If provided, patch dictionaries will be prepared and displayed but
        not executed to allow review prior to updating the metadata.

    --exclude-tissues
        If provided, Tissue and TissueSample items associated with the donor
        will not be updated to the open release status. By default,
        tissues are included.

    --external
        If provided, removes the "-early" suffix from release statuses
        and performs a full public release (visible to all users, not just
        within the consortium network). By default, donors are released
        with the "-early" suffix to limit visibility to only network.

Output:
    - Prints detailed patch information in single-donor mode, or a
      condensed summary in bulk mode.
    - Warns if donor status is not as expected.
    - Displays errors and aborts if validation fails.

Caveats:
    - Does not currently handle CellSamples even if they are linked to tissues.

Examples:
    # Dry run a single donor release in a dev environment
    python donor_release.py --donor 72205a8a-8480-43a6-84fe-c2d2bf8263a5 --env devtest --dry-run

    # Release multiple donors externally with tissues included
    python donor_release.py -d SMADODDZCLFE -d SMADOGYU231H -e data --include-tissues --external
"""

import argparse
import pprint
from functools import cached_property
from typing import Callable, Dict, List, Any

from dcicutils import ff_utils  # noqa
from dcicutils.creds_utils import SMaHTKeyManager  # noqa

from encoded.commands.utils import get_auth_key
from encoded.item_utils import (
    donor as donor_utils,
    item as item_utils,

)
from encoded.item_utils.constants import (
    item as item_constants,
)
from encoded.item_utils.utils import RequestHandler

pp = pprint.PrettyPrinter(indent=2)


NETWORK_DONOR_RELEASE_STATUS = item_constants.STATUS_OPEN_EARLY
NETWORK_PROTECTED_DONOR_RELEASE_STATUS = item_constants.STATUS_PROTECTED_EARLY


class DonorRelease:
    def __init__(self, auth_key: dict, donor_identifier: str, verbose: bool = True, exclude_tissues: bool = False,
                 open_release_status: str = NETWORK_DONOR_RELEASE_STATUS,
                 protected_release_status: str = NETWORK_PROTECTED_DONOR_RELEASE_STATUS,
                 force_status_change: bool = False) -> None:
        self.key = auth_key
        self.request_handler = self.get_request_handler()
        self.request_handler_embedded = self.get_request_handler_embedded()
        self.donor = self.get_metadata_embedded(donor_identifier)
        self.donor_accession = item_utils.get_accession(self.donor)
        self.patch_infos = []
        self.patch_infos_minimal = []
        self.patch_dicts = []
        self.warnings = []
        self.verbose = verbose
        self.open_release_status = open_release_status
        self.protected_release_status = protected_release_status
        self.exclude_tissues = exclude_tissues
        self.force_status_change = force_status_change
    """
        Initialize a DonorRelease object to manage the release of a donor
        and associated linked records.

        Args:
            auth_key (dict):
                Authentication key dictionary retrieved from get_auth_key().
                Must contain at least 'server' and token information.
            donor_identifier (str):
                Identifier of the donor item to release. May be an accession,
                UUID, or submitted identifier.
            verbose (bool, optional):
                If True, prints detailed patch information and messages.
                Defaults to True. In bulk release mode this is typically False.
            exclude_tissues (bool, optional):
                If True, excludes associated Tissue and TissueSample records
                in the release operation. Defaults to False.
            open_release_status (str, optional):
                Status string to set for the main Donor and Tissue/TissueSample
                items. Defaults to the consortium "network release" status
                (e.g., "open-early").
            protected_release_status (str, optional):
                Status string to set for protected donor and related items
                (e.g., Demographic, MedicalHistory, Diagnosis).
                Defaults to the consortium "protected-early" status.
            force_status_change (bool, optional):
                If True, forces the status update even if the item is already
                in a terminal status (e.g., already open or protected). Use with caution.
    """

    @cached_property
    def protected_donor(self) -> dict:
        return self.get_protected_donor_from_donor()

    @cached_property
    def tissues(self) -> List[dict]:
        return self.get_tissues_from_donor()

    @cached_property
    def tissue_samples(self) -> List[dict]:
        return self.get_tissue_samples_from_tissues()

    @cached_property
    def demographic(self) -> List[dict]:
        return self.get_demographic_from_protected_donor()

    @cached_property
    def death_circumstances(self) -> List[dict]:
        return self.get_death_circumstances_from_protected_donor()

    @cached_property
    def family_histories(self) -> List[dict]:
        return self.get_family_histories_from_protected_donor()

    @cached_property
    def tissue_collection(self) -> List[dict]:
        return self.get_tissue_collection_from_protected_donor()

    @cached_property
    def medical_history(self) -> List[dict]:
        return self.get_medical_history_from_protected_donor()

    @cached_property
    def diagnoses(self) -> List[dict]:
        return self.get_diagnoses_from_medical_history()

    @cached_property
    def exposures(self) -> List[dict]:
        return self.get_exposures_from_medical_history()

    @cached_property
    def medical_treatments(self) -> List[dict]:
        return self.get_medical_treatments_from_medical_history()

    def get_request_handler(self) -> RequestHandler:
        return RequestHandler(auth_key=self.key, frame="object", datastore="database")

    def get_request_handler_embedded(self) -> RequestHandler:
        return RequestHandler(auth_key=self.key, frame="embedded", datastore="database")

    def get_metadata(self, identifier: str) -> dict:
        return self.request_handler.get_item(identifier)

    def get_metadata_embedded(self, identifier: str) -> dict:
        return self.request_handler_embedded.get_item(identifier)

    def get_items(self, identifiers: List[str]) -> List[dict]:
        """Get metadata for a list of identifiers."""
        return self.request_handler.get_items(identifiers)

    def get_protected_donor_from_donor(self) -> List[dict]:
        protected_donor = donor_utils.get_protected_donor(self.donor)
        return self.get_metadata(protected_donor)

    def get_tissues_from_donor(self) -> List[dict]:
        search_filter = (
            f"/search/?type=Tissue&donor.uuid="
            f"{item_utils.get_uuid(self.donor)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_tissue_samples_from_tissues(self) -> List[dict]:
        search_filter = "/search/?type=TissueSample&submission_centers.display_title=NDRI+TPC"
        if not self.tissues:
            return []
        for tissue in self.tissues:
            search_filter += f"&sample_sources.uuid={item_utils.get_uuid(tissue)}"
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_demographic_from_protected_donor(self) -> List[dict]:
        search_filter = (
            f"/search/?type=Demographic&donor.uuid="
            f"{item_utils.get_uuid(self.protected_donor)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_death_circumstances_from_protected_donor(self) -> List[dict]:
        search_filter = (
            f"/search/?type=DeathCircumstances&donor.uuid="
            f"{item_utils.get_uuid(self.protected_donor)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_family_histories_from_protected_donor(self) -> List[dict]:
        search_filter = (
            f"/search/?type=FamilyHistory&donor.uuid="
            f"{item_utils.get_uuid(self.protected_donor)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_tissue_collection_from_protected_donor(self) -> List[dict]:
        search_filter = (
            f"/search/?type=TissueCollection&donor.uuid="
            f"{item_utils.get_uuid(self.protected_donor)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_medical_history_from_protected_donor(self) -> List[dict]:
        search_filter = (
            f"/search/?type=MedicalHistory&donor.uuid="
            f"{item_utils.get_uuid(self.protected_donor)}"
        )
        return result[0] if (result := ff_utils.search_metadata(search_filter, key=self.key)) else []

    def get_diagnoses_from_medical_history(self) -> List[dict]:
        search_filter = (
            f"/search/?type=Diagnosis&medical_history.uuid="
            f"{item_utils.get_uuid(self.medical_history)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_exposures_from_medical_history(self) -> List[dict]:
        search_filter = (
            f"/search/?type=Exposure&medical_history.uuid="
            f"{item_utils.get_uuid(self.medical_history)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def get_medical_treatments_from_medical_history(self) -> List[dict]:
        search_filter = (
            f"/search/?type=MedicalTreatment&medical_history.uuid="
            f"{item_utils.get_uuid(self.medical_history)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)

    def prepare(
        self, **kwargs: Any
    ) -> None:
        self.validate_donor()
        # The main donor needs to be the first patchdict.
        self.add_release_item_to_patchdict(self.donor, "Donor", self.open_release_status, self.force_status_change)
        if self.exclude_tissues:
            self.add_warning(
                f"Not changing status of Tissue and TissueSample for Donor {self.donor_accession}."
            )
        else:
            self.add_release_items_to_patchdict(
                self.tissues, "Tissue",
                self.open_release_status,
                self.force_status_change
            )
            if not self.tissues:
                self.add_warning(
                    f"Donor {self.donor_accession} does not have linked Tissues - skipping TissueSamples."
                )
            else:
                self.add_release_items_to_patchdict(
                    self.tissue_samples, "TissueSample",
                    self.open_release_status,
                    self.force_status_change
                )
        # Protected release items - set to PROTECTED_DONOR_RELEASE_STATUS
        if not self.protected_donor:
            self.add_warning(
                f"Donor {self.donor_accession} does not have a linked ProtectedDonor."
            )
        else:
            self.add_release_item_to_patchdict(
                self.protected_donor, "ProtectedDonor", self.protected_release_status,
                self.force_status_change)
            self.add_release_items_to_patchdict(
                self.demographic, "Demographic", self.protected_release_status,
                self.force_status_change)
            self.add_release_items_to_patchdict(
                self.death_circumstances, "DeathCircumstances", self.protected_release_status,
                self.force_status_change)
            self.add_release_items_to_patchdict(
                self.family_histories, "FamilyHistory", self.protected_release_status,
                self.force_status_change)
            self.add_release_items_to_patchdict(
                self.tissue_collection, "TissueCollection", self.protected_release_status,
                self.force_status_change)
            self.add_release_item_to_patchdict(
                self.medical_history, "MedicalHistory", self.protected_release_status,
                self.force_status_change)
            self.add_release_items_to_patchdict(
                self.diagnoses, "Diagnosis", self.protected_release_status,
                self.force_status_change)
            self.add_release_items_to_patchdict(
                self.exposures, "Exposure", self.protected_release_status,
                self.force_status_change)
            self.add_release_items_to_patchdict(
                self.medical_treatments, "MedicalTreatment", self.protected_release_status,
                self.force_status_change)

        if self.verbose:
            print("\nThe following metadata patches will be carried out in the next step:")
            for info in self.patch_infos:
                print(info)
        else:
            for info in self.patch_infos_minimal:
                print(info)

        if len(self.warnings) > 0:
            warning_message = "Please note the following warnings:"
            print(f"\n{warning_text(warning_message)}")
            for warning in self.warnings:
                print(warning)

    def execute(self) -> None:
        if self.verbose:
            print("Validating all patch dictionaries...")
        self.donor = self.get_metadata(item_utils.get_uuid(self.donor))
        try:
            for patch_dict in self.patch_dicts:
                self.validate_patch(patch_dict)
        except Exception as e:
            print(str(e))
            self.print_error_and_exit(f"Validation failed for donor {self.donor_accession}.")

        if self.verbose:
            print("Validation done. Patching...")
        try:
            for patch_dict in self.patch_dicts:  #[1:]:
                self.patch_metadata(patch_dict)
        except Exception as e:
            print(str(e))
            self.print_error_and_exit(f"Patching failed for donor {self.donor_accession}.")

        to_print = f"Release of Donor {self.donor_accession} completed."
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
        pp.pprint(self.patch_dicts)

    def item_has_same_or_terminal_status(self, item: dict, new_status: str) -> bool:
        """Check if the item already has the new status or is in a terminal status.
        """
        current_status = item_utils.get_status(item)
        chk_statuses = [item_constants.STATUS_OPEN, item_constants.STATUS_PROTECTED, new_status]
        if current_status in chk_statuses:
            self.add_okay_message(
                item_constants.STATUS, current_status, "Not patching."
            )
            return True
        return False

    def add_release_item_to_patchdict(
        self,
        item: dict,
        item_desc: str,
        status: str,
        force_status_change: bool = False,
    ) -> None:
        """
        Sets the status of the item to the specified release status and
        adds the corresponding patch dict.

        Args:
            item (dict): Portal item
            item_desc (str): Just used for generating more useful patch infos
            status (str): Status to set the item to.
            force_status_change (bool): If True, patch even if item already has same or terminal status.
        """
        identifier_to_report = self.get_identifier_to_report(item)
        self.patch_infos.append(f"\n{item_desc} ({identifier_to_report}):")

        if not force_status_change and self.item_has_same_or_terminal_status(item, status):
            return

        patch_body = {
            item_constants.UUID: item_utils.get_uuid(item),
            item_constants.STATUS: status,
        }

        self.add_okay_message(item_constants.STATUS, status)
        self.patch_dicts.append(patch_body)


    def get_identifier_to_report(self, item: Dict[str, Any]) -> str:
        if submitted_id := item_utils.get_submitted_id(item):
            return submitted_id
        if identifier := item_utils.get_identifier(item):
            return identifier
        return item_utils.get_accession(item)


    def add_release_items_to_patchdict(self, items: list, item_desc: str,
                                       status: str, force_status_change: bool = False) -> None:
        """Sets the status to provided status in all items in the list and
        adds the corresponding patch dict

        Args:
            items (list): List of portal item
            item_desc (str): Just used for generating more usefuls patch infos
            status (str): Status to set the items to.
            force_status_change (bool): If True, patch even if items already have
            same or terminal status.
        """
        for item in items:
            self.add_release_item_to_patchdict(item, item_desc, status, force_status_change)

    def validate_donor(self) -> None:
        self.validate_donor_type()
        self.validate_donor_status()

    def validate_donor_type(self) -> None:
        if item_utils.get_type(
            self.donor
        ) != "Donor":
            self.print_error_and_exit(f"{self.donor_accession} is not a Donor item.")

    def validate_donor_status(self) -> None:
        if item_utils.get_status(self.donor) != "in review":
            self.add_warning(
                f"Donor {self.donor_accession} has status"
                f" `{item_utils.get_status(self.donor)}`."
                f" Expected in-review."
            )

    def print_error_and_exit(self, msg: str) -> None:
        error_message = f"ERROR: {msg} Exiting."
        print(f"{fail_text(error_message)}")
        exit()

    def add_warning(self, msg: str) -> None:
        warning_message = "WARNING"
        self.warnings.append(f"{warning_text(warning_message)} {msg}")

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
    """
    Parses arguments, validates donors, prepares release patch dictionaries,
    and either shows the planned updates (dry-run) or prompts the user to
    confirm patching metadata on the target server.

    Command-line options:
        --donor, -d
            One or more donor identifiers (required).
        --env, -e
            Environment name from keys file (required).
        --dry-run
            Preview patches without executing them.
        --include-tissues
            Include Tissue and TissueSample items in the release.
        --external
            Perform full public release by removing the "-early" suffix.

    Exits with an error message if required arguments are missing,
    donors fail validation, or patching fails.
    """
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--donor", "-d", action='append', help="Identifier of the donor to release", required=True
    )
    parser.add_argument("--env", "-e", help="Environment from keys file", required=True)
    parser.add_argument(
        "--dry-run",
        help="Dry run, show patches but do not execute",
        action="store_true",
    )
    parser.add_argument(
        "--exclude-tissues",
        help="Exclude tissues and tissue samples in the operation",
        action="store_true",
    )
    parser.add_argument(
        "--external",
        help="Default False - Release donor to all users - not just within network",
        action="store_true",
    )
    parser.add_argument(
        "--force-status-change",
        help="Default False - force update statuses even if they are terminal statuses. Use with caution.",
        action="store_true",
    )
    args = parser.parse_args()
    if not args.donor or len(args.donor) < 1:
        error = fail_text("Please specify at least one donor to release.")
        parser.error(error)

    mode = 'single' if len(args.donor) == 1 else 'bulk'

    auth_key = get_auth_key(args.env)
    server = auth_key.get("server")

    open_release_status = None
    protected_release_status = None
    if args.external:
        open_release_status = NETWORK_DONOR_RELEASE_STATUS.removesuffix("-early")
        protected_release_status = NETWORK_PROTECTED_DONOR_RELEASE_STATUS.removesuffix("-early")
    else:
        open_release_status = NETWORK_DONOR_RELEASE_STATUS
        protected_release_status = NETWORK_PROTECTED_DONOR_RELEASE_STATUS
    donors_to_release = args.donor
    if args.force_status_change:
        print(warning_text("Forcing status change even if item is already released or in terminal status."))
    verbose = mode == 'single'  # Print more information in single mode
    donor_releases: List[DonorRelease] = []
    for donor_identifier in donors_to_release:
        donor_release = DonorRelease(auth_key=auth_key, donor_identifier=donor_identifier, verbose=verbose,
                                     exclude_tissues=args.exclude_tissues, open_release_status=open_release_status,
                                     protected_release_status=protected_release_status,
                                     force_status_change=args.force_status_change)
        donor_release.prepare()
        donor_releases.append(donor_release)

    if args.dry_run:
        for donor_release in donor_releases: 
            print(f"\nPatch dicts for donor {warning_text(donor_release.donor_accession)}:\n")
            donor_release.show_patch_dicts()
        exit()

    while True:
        resp = input(
            f"\nDo you want to proceed with patching the main donor(s) above? "
            f"Data will be patched on {warning_text(server)}."
            f"\nYou have the following options: "
            f"\ny - Proceed with release"
            f"\np - Show patch dictionaries"
            f"\nn - Abort "
            f"\n(y,p,n): "
        )
        if resp in ["y", "yes"]:
            for donor_release in donor_releases: 
                donor_release.execute()
            break
        elif resp in ["p"]:
            for donor_release in donor_releases:
                print(f"\nPatch dicts for donor {warning_text(donor_release.donor_accession)}:")
                donor_release.show_patch_dicts()
            continue
        else:
            print(f"{warning_text('Aborted by user.')}")
            exit()


if __name__ == "__main__":
    main()
