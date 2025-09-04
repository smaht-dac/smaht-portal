from __future__ import annotations

import argparse
import logging
from typing import Any, Dict, List, Union

from dcicutils import ff_utils

from encoded.commands.utils import get_auth_key
from encoded.item_utils import (
    constants,
    donor as donor_utils,
    file as file_utils,
    item as item_utils,
)
from encoded.item_utils.utils import RequestHandler

RELEASED_FILE_DONOR_TAG = "has_released_files"
DEFAULT_QUERY = "search/?type=File&status=released&dataset=tissue&field=donors"

logger = logging.getLogger(__name__)


def get_items(
    identifiers: Union[str, Dict[str, Any]], request_handler: RequestHandler
) -> List[Dict[str, Any]]:
    """Get items from identifiers."""
    return request_handler.get_items(identifiers)


def get_files_from_search(search_query: str, auth_key: Dict[str, str]) -> List[str]:
    """Get file items from given search query."""
    if search_query:
        return get_files_from_search_query(search_query, auth_key)
    return []


def get_files_from_search_query(
    search_query: str, auth_key: Dict[str, str]
) -> List[str]:
    """Get file items from given search query."""
    try:
        search_result = ff_utils.search_metadata(search_query, key=auth_key)
        result = filter_files(search_result)
    except Exception as e:
        logger.error(f"Error searching for files: {e}")
        result = []
    return result


def filter_files(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Get files from given items."""
    return [item for item in items if file_utils.is_file(item)]


def get_files_from_identifiers(
    identifiers: List[str], request_handler: RequestHandler
) -> List[str]:
    """Get file items from given identifiers."""
    items = request_handler.get_items(identifiers)
    return filter_files


def filter_for_production_donors(donors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Filter donors for production status."""
    return [donor for donor in donors if donor_utils.is_production(donor)]


def patch_donors_with_released_file_tag(
    search: str,
    identifiers: List[str],
    auth_key: Dict[str, str],
    dbupdate: bool = False,
) -> None:
    """Tag donors associated with released files from given identifiers, search query or default query."""
    request_handler = RequestHandler(auth_key=auth_key)
    files = []
    if identifiers:
        files = get_files_from_identifiers(identifiers, request_handler)
    else:
        files = get_files_from_search(search, auth_key)

    if not files:
        logger.warning("No files found.")
        return
    unique_donor_ids = list({d["uuid"] for f in files for d in f.get("donors", []) if "uuid" in d})
    print(len(unique_donor_ids))
    donors = get_items(unique_donor_ids, request_handler)
    production_donors = filter_for_production_donors(donors)
    print(len(production_donors))
    for pd in production_donors:
        pd_id = item_utils.get_uuid(pd)
        pd_accession = item_utils.get_accession(pd)
        pd_tags = item_utils.get_tags(pd)
        if RELEASED_FILE_DONOR_TAG in pd_tags:
            logger.info(f"Donor {pd_accession} already has tag {RELEASED_FILE_DONOR_TAG}. Skipping.")
            continue
        patch_body = {
            "tags": pd_tags + [RELEASED_FILE_DONOR_TAG]
        }
        if not dbupdate:
            logger.info(
                f"Would patch donor {pd_accession} with: {patch_body}"
            )
        else:
            try:
                ff_utils.patch_metadata(
                    patch_body,
                    obj_id=pd_id,
                    key=auth_key,
                )
                logger.info(f"Patched donor {pd_accession} with tag {RELEASED_FILE_DONOR_TAG}.")
            except Exception as e:
                logger.error(f"Error patching donor {pd_accession}: {e}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--search",
        "-s",
        help="Search query for files to get donors from to tag",
        default=DEFAULT_QUERY
    )
    parser.add_argument(
        "--identifiers",
        "-i",
        nargs="*",
        help="File identifiers to get donors from to tag",
        default=[],
    )
    parser.add_argument(
        "--env",
        "-e",
        help="Environment from keys file",
        default="data",
    )
    parser.add_argument(
        "--dbupdate",
        "-d",
        action="store_true",
        default=False,
        help="Do the actual addition of tags to donors",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        default=False,
        help="Increase logging verbosity",
    )
    args = parser.parse_args()
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    auth_key = get_auth_key(args.env)
    if not args.identifiers and args.search == DEFAULT_QUERY:
        logger.warning(f"Running with default search query: {DEFAULT_QUERY}")
    patch_donors_with_released_file_tag(
        args.search,
        args.identifiers,
        auth_key,
        dbupdate=args.dbupdate,
    )


if __name__ == "__main__":
    main()
