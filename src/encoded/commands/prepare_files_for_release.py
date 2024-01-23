import argparse
import logging
from dataclasses import dataclass
from typing import Any, Dict, List

from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FileLinks:

    assays: List[str]
    sequencing: List[str]


def prepare_files_for_release(
    search_query: str, identifiers: List[str], key: Dict[str, str]
) -> None:
    """Prepare files for release by adding links.

    Big idea is to walk through the data model for given files, collect
    relevant items to add as links, and patch the file with links if
    all are found.

    If unable to find all required links, missing data is logged and
    links will not be added.

    This is highly dependent on the data model, obviously, so prone to
    break and will require updates.
    """
    file_uuids = get_file_uuids(search_query, identifiers, key)


def get_file_uuids(
    search_query: str, identifiers: List[str], key: Dict[str, str]
) -> List[str]:
    """Get file UUIDs from search query or identifiers."""
    uuids_from_search = get_file_uuids_from_search(search_query, key)
    uuids_from_identifiers = get_file_uuids_from_identifiers(identifiers, key)
    return uuids_from_search + uuids_from_identifiers


def get_file_uuids_from_search(search_query: str, key: Dict[str, str]) -> List[str]:
    """Get file UUIDs from search query."""
    if search_query:
        logger.info(f"Searching for files with query: {search_query}")
        search_response = ff_utils.search_metadata(search_query, key)
        uuids = [get_uuid(item) for item in search_response]
        logger.info(f"Found {len(uuids)} files from search")
        return uuids
    else:
        return []


def get_file_uuids_from_identifiers(
    identifiers: List[str], key: Dict[str, str]
) -> List[str]:
    """Get file UUIDs from given identifiers."""
    if identifiers:
        logger.info(f"Getting files from identifiers: {identifiers}")
        uuids = []
        for identifier in identifiers:
            file_uuid = get_file_uuid_from_identifier(identifier, key)
            if file_uuid:
                uuids.append(file_uuid)
        logger.info(f"Found {len(uuids)} files from identifiers")
        return uuids
    else:
        return []


def get_file_uuid_from_identifier(identifier: str, key: Dict[str, str]) -> str:
    """Get file UUID from given identifier."""
    try:
        response = ff_utils.get_metadata(identifier, key)
    except Exception as error:
        logger.warning(f"Unable to get file from identifier {identifier}: {error}")
        response = {}
    return get_uuid(response)


def get_uuid(item: Dict[str, Any]) -> str:
    """Get UUID from item."""
    return item.get("uuid", "")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--env",
        "-e",
        help="Environment to use",
        default="staging",
        required=True,
    )
    parser.add_argument(
        "--search",
        "-s",
        help="Search query to use",
        default="",
    )
    parser.add_argument(
        "--identifiers",
        "-i",
        help="List of identifiers to use",
        nargs="*",
        default="",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        help="Toggle verbose logging on",
        action="store_true",
        default=False,
    )
    args = parser.parse_args()
    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.WARNING)
    key = SMaHTKeyManager.get_keydict_for_env(args.env)
    if not args.search and not args.identifiers:
        logger.warning("Must provide either a search query or a list of identifiers")
    else:
        prepare_files_for_release(args.search, args.identifiers, key)


if __name__ == "__main__":
    main()
