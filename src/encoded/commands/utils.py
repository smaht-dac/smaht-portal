from typing import Dict, Set

from dcicutils import ff_utils  # noqa
from dcicutils.creds_utils import SMaHTKeyManager


def get_auth_key(env: str) -> Dict[str, str]:
    """Get the auth key for the given environment."""
    return SMaHTKeyManager().get_keydict_for_env(env)

def extract_input_file_uuids_from_mwfr(mwfr: dict) -> Set[str]:
    """Extract all input file UUIDs from a MetaWorkflowRun."""
    return {
        file_uuid
        for input_item in mwfr.get("input", [])
        for input_file in input_item.get("files", [])
        if (file_uuid := input_file.get("file", {}).get("uuid"))
    }

def search_list(items, key):
    query = f"search/?type=Item"
    for item in items:
        query += f"&uuid={item}"
    return ff_utils.search_metadata(query, key=key)