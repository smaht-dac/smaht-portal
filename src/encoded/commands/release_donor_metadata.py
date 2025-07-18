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


##################################################################
##################################################################
##
##  The donor release will do the following updates to the metadata
##  - Set donor status to PUBLIC_DONOR_RELEASE_STATUS
##  - Set associated protected donor status to PROTECTED_DONOR_RELEASE_STATUS
##  - Set the associated MedicalHistory, Demographic,
## DeathCircumstances, FamilyHistory, and TissueCollection status to
## PROTECTED_DONOR_RELEASE_STATUS
##  - Set the associated Exposure, MedicalTreatment, and Diagnosis 
## status to PROTECTED_DONOR_RELEASE_STATUS
##  - Set associated Tissue and NDRI TissueSample items to 
## PUBLIC_DONOR_RELEASE_STATUS
##
##################################################################
##################################################################

PUBLIC_DONOR_RELEASE_STATUS = "released" ## When portal becomes public, this will be "public"
PROTECTED_DONOR_RELEASE_STATUS = "released" ## When portal becomes public, this will be "public-restricted"

class DonorRelease:

    def __init__(self, auth_key: dict, donor_identifier: str, verbose: bool = True):
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

    @cached_property
    def protected_donor(self) -> dict:
        return self.get_links(self.donor, donor_utils.get_protected_donor)

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

    def get_links(self, items: List[Dict[str, Any]], getter: Callable) -> List[str]:
        """Get links from a list of items using a getter function.

        Handle link as a string or a list of strings.
        """
        result = []
        for item in items:
            links = getter(item)
            if isinstance(links, str):
                result.append(links)
            elif isinstance(links, list):
                result.extend(links)
        return result

    def get_tissues_from_donor(self) -> List[dict]:
        search_filter = (
            f"/search/?type=Tissue&donor.uuid="
            f"{item_utils.get_uuid(self.donor)}"
        )
        return ff_utils.search_metadata(search_filter, key=self.key)
    
    def get_tissue_samples_from_tissue(self) -> List[dict]:
        search_filter = "/search/?type=TissueSample&submission_centers.display_title=NDRI+TPC"
        for tissue in self.tissues:
            search_filter += f"{search_filter}&sample_sources.uuid={item_utils.get_uuid(tissue)}"
        return ff_utils.search_metadata((search_filter), key=self.key)
    
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
        return ff_utils.search_metadata(search_filter, key=self.key)

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
        self, dataset: str, **kwargs: Any
    ) -> None:
        self.validate_donor()
        # The main donor needs to be the first patchdict.
        # - set to PUBLIC_DONOR_RELEASE_STATUS
        self.add_release_donor_patchdict(self.donor, dataset)

        # Public release items - set to PUBLIC_DONOR_RELEASE_STATUS
        self.add_public_release_item_to_patchdict(
            self.tissues, "Tissue"
        ) 
        self.add_public_release_item_to_patchdict(
            self.tissue_samples, "TissueSample"
        )

        # Protected release items - set to PROTECTED_DONOR_RELEASE_STATUS
        self.add_protected_release_items_to_patchdict(self.protected_donor, "ProtectedDonor")
        self.add_protected_release_items_to_patchdict(self.demographic, "Demographic")
        self.add_protected_release_items_to_patchdict(self.death_circumstances, "DeathCircumstances")
        self.add_protected_release_items_to_patchdict(self.family_histories, "FamilyHistory")
        self.add_protected_release_items_to_patchdict(self.tissue_collection, "TissueCollection")
        self.add_protected_release_items_to_patchdict(self.medical_history, "MedicalHistory")
        self.add_protected_release_items_to_patchdict(self.diagnoses, "Diagnosis")
        self.add_protected_release_items_to_patchdict(self.exposures, "Exposure")
        self.add_protected_release_items_to_patchdict(self.medical_treatments, "MedicalTreatment")

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
            for patch_dict in self.patch_dicts[1:]:
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

    def add_public_release_item_to_patchdict(self, item: dict, item_desc: str) -> None:
        """Sets the status of the item to PUBLIC_DONOR_RELEASED_STATUS and
        adds the corresponding patch dict

        Args:
            item (dict): Portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        identifier_to_report = self.get_identifier_to_report(item)
        self.patch_infos.append(f"\n{item_desc} ({identifier_to_report}):")

        if item_utils.is_released(item):
            self.add_okay_message(
                item_constants.STATUS, PUBLIC_DONOR_RELEASE_STATUS, "Not patching."
            )
            return

        patch_body = {
            item_constants.UUID: item_utils.get_uuid(item),
            item_constants.STATUS: PUBLIC_DONOR_RELEASE_STATUS,
        }
        self.add_okay_message(item_constants.STATUS, PUBLIC_DONOR_RELEASE_STATUS)
        self.patch_dicts.append(patch_body)

    def add_protected_release_item_to_patchdict(self, item: dict, item_desc: str) -> None:
        """Sets the status of the item to PROTECTED_DONOR_RELEASE_STATUS and
        adds the corresponding patch dict

        Args:
            item (dict): Portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        identifier_to_report = self.get_identifier_to_report(item)
        self.patch_infos.append(f"\n{item_desc} ({identifier_to_report}):")

        if item_utils.is_released(item):
            self.add_okay_message(
                item_constants.STATUS,PROTECTED_DONOR_RELEASE_STATUS, "Not patching."
            )
            return

        patch_body = {
            item_constants.UUID: item_utils.get_uuid(item),
            item_constants.STATUS:PROTECTED_DONOR_RELEASE_STATUS,
        }
        self.add_okay_message(item_constants.STATUS,PROTECTED_DONOR_RELEASE_STATUS)
        self.patch_dicts.append(patch_body)

    def get_identifier_to_report(self, item: Dict[str, Any]) -> str:
        if submitted_id := item_utils.get_submitted_id(item):
            return submitted_id
        if identifier := item_utils.get_identifier(item):
            return identifier
        return item_utils.get_accession(item)

    def add_public_release_items_to_patchdict(self, items: list, item_desc: str) -> None:
        """Sets the status to PUBLIC_DONOR_RELEASE_STATUS in all items in the list and
        adds the corresponding patch dict

        Args:
            items (list): List of portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        for item in items:
            self.add_public_release_item_to_patchdict(item, item_desc)

    def add_protected_release_items_to_patchdict(self, items: list, item_desc: str) -> None:
        """Sets the status to PROTECTED_DONOR_RELEASE_STATUS in all items in the list and
        adds the corresponding patch dict

        Args:
            items (list): List of portal item
            item_desc (str): Just used for generating more usefuls patch infos
        """
        for item in items:
            self.add_protected_release_item_to_patchdict(item, item_desc)

    def add_release_donor_patchdict(
        self, donor: dict
    ) -> None:
        patch_body = {
            item_constants.UUID: item_utils.get_uuid(donor),
            item_constants.STATUS: PUBLIC_DONOR_RELEASE_STATUS
        }
        self.patch_infos.extend(
            [
                f"\nDonor ({self.donor_accession}):",
                self.get_okay_message(item_constants.STATUS, PUBLIC_DONOR_RELEASE_STATUS),
            ]
        )
        self.patch_dicts.append(patch_body)


    def validate_donor(self) -> None:
        self.validate_donor_output_status()
        self.validate_donor_status()


    def validate_donor_output_status(self) -> None:
        if not item_utils.get_type(
            self.donor
        ) != "Donor":
            self.add_warning(f"{self.donor_accession} is not a donor item.")

    def validate_donor_status(self) -> None:
        if not item_utils.get_status(self.donor) == "in-review":
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

    args = parser.parse_args()

    if not args.donor or len(args.donor) < 1:
        error = fail_text("Please specify at least one donor to release.")
        parser.error(error)

    mode = 'single' if len(args.donor) == 1 else 'bulk'
            

    auth_key = get_auth_key(args.env)
    server = auth_key.get("server")

    donors_to_release = args.donor
    verbose = mode == 'single' # Print more information in single mode

    donor_releases : List[DonorRelease] = []
    for donor_identifier in donors_to_release:
        donor_release = DonorRelease(auth_key=auth_key, donor_identifier=donor_identifier, verbose=verbose)
        donor_release.prepare(dataset=args.dataset)
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
            f"\np - Show patch dictionaries (only the first dictionary will be patched) "
            f"\nn - Abort "
            f"\n(y,p,n): "
        )
        if resp in ["y", "yes"]:
            for donor_release in donor_releases: 
                donor_release.execute()
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