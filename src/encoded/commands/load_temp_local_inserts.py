"""One-off loader for src/encoded/tests/data/temp-local-inserts into a portal.

Items are written in two phases because some links cannot be satisfied by any
single order (e.g. user <-> submission_center):
  1. POST new items without their non-required links to other inserts.
  2. PATCH the held-back links onto new items, and the full body onto items
     that already existed on the portal.

Modes:
  (default)   dry run: only GETs, prints what would be done
  --validate  sends writes with check_only=true&skip_links=true (nothing persists)
  --execute   real writes (asks for confirmation of the server)

Usage:
  python -m encoded.commands.load_temp_local_inserts --env <env> [--validate | --execute]
"""
import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from dcicutils import ff_utils  # noqa

from encoded.commands.utils import get_auth_key
from encoded.project.loadxl import ITEM_INDEX_ORDER

DEFAULT_INSERTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "tests", "data", "temp-local-inserts",
)
UUID_REGEX = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
VALIDATE_ADD_ON = "check_only=true&skip_links=true"


class LoadError(Exception):
    pass


@dataclass
class Insert:
    item_type: str  # snake_case, from the file name
    collection: str  # e.g. FileSet
    item: Dict[str, Any]
    exists: bool = False
    post_body: Dict[str, Any] = field(default_factory=dict)
    patch_body: Dict[str, Any] = field(default_factory=dict)

    @property
    def uuid(self) -> str:
        return self.item["uuid"]

    @property
    def label(self) -> str:
        identifier = (
            self.item.get("accession")
            or self.item.get("submitted_id")
            or self.item.get("identifier")
            or self.item.get("email")
            or self.uuid
        )
        return f"{self.collection} {identifier}"


def single_request(request_fxn, url, auth, verb, **kwargs):
    """Replacement for ff_utils' retry function: one attempt, never raises on status.

    The default retries 5xx responses, which must not happen for POST/PATCH.
    """
    return request_fxn(url, auth=auth, **kwargs)


def request(
    key: Dict[str, str], verb: str, path: str,
    body: Optional[Dict[str, Any]] = None, add_on: str = "",
) -> Tuple[int, Any]:
    url = f"{key['server']}/{path.lstrip('/')}" + ff_utils.process_add_on(add_on)
    kwargs = {"data": json.dumps(body)} if body is not None else {}
    response = ff_utils.authorized_request(
        url, auth=key, verb=verb, retry_fxn=single_request, **kwargs
    )
    try:
        content = response.json()
    except ValueError:
        content = response.text
    return response.status_code, content


def load_inserts(inserts_dir: str) -> Dict[str, List[Dict[str, Any]]]:
    result = {}
    for file_name in sorted(os.listdir(inserts_dir)):
        if file_name.endswith(".json"):
            with open(os.path.join(inserts_dir, file_name)) as f:
                result[file_name[:-len(".json")]] = json.load(f)
    order = {item_type: idx for idx, item_type in enumerate(ITEM_INDEX_ORDER)}
    return dict(
        sorted(result.items(), key=lambda kv: order.get(kv[0], len(order)))
    )


def get_type_info(
    key: Dict[str, str], item_types: List[str]
) -> Dict[str, Tuple[str, Set[str]]]:
    """Map snake_case type -> (collection name, required properties) from deployed profiles."""
    schemas = ff_utils.get_schemas(key=key)
    by_snake = {}
    for name, schema in schemas.items():
        schema_id = schema.get("$id", "")
        snake = schema_id.replace("/profiles/", "").replace(".json", "")
        required = set(schema.get("required", []))
        # Conditionally required properties (anyOf/oneOf) must also be sent on POST
        for keyword in ("anyOf", "oneOf"):
            for option in schema.get(keyword, []):
                required.update(option.get("required", []))
        by_snake[snake] = (name, required)
    missing = [item_type for item_type in item_types if item_type not in by_snake]
    if missing:
        raise LoadError(f"No profile on the portal for insert types: {missing}")
    return {item_type: by_snake[item_type] for item_type in item_types}


def get_uuids(value: Any) -> Set[str]:
    if isinstance(value, str):
        return {value} if UUID_REGEX.match(value) else set()
    if isinstance(value, list):
        return set().union(*[get_uuids(v) for v in value]) if value else set()
    return set()


def item_exists(key: Dict[str, str], uuid: str) -> bool:
    status, content = request(key, "GET", uuid, add_on="frame=object")
    if status == 200:
        return True
    if status == 404:
        return False
    raise LoadError(f"Unexpected {status} on GET {uuid}: {content}")


def build_plan(key: Dict[str, str], inserts_dir: str) -> List[Insert]:
    raw_inserts = load_inserts(inserts_dir)
    type_info = get_type_info(key, list(raw_inserts))
    inserts = [
        Insert(item_type, type_info[item_type][0], item)
        for item_type, items in raw_inserts.items()
        for item in items
    ]
    local_uuids = {insert.uuid for insert in inserts}

    external_uuids = set()
    for insert in inserts:
        for prop, value in insert.item.items():
            if prop != "uuid":
                external_uuids |= get_uuids(value) - local_uuids
    missing = sorted(uuid for uuid in external_uuids if not item_exists(key, uuid))
    if missing:
        raise LoadError(
            f"Items referenced by the inserts do not exist on the portal: {missing}"
        )

    for insert in inserts:
        insert.exists = item_exists(key, insert.uuid)

    created = {insert.uuid for insert in inserts if insert.exists}
    for insert in inserts:
        if insert.exists:
            insert.patch_body = {
                k: v for k, v in insert.item.items() if k != "uuid"
            }
            continue
        required = type_info[insert.item_type][1]
        for prop, value in insert.item.items():
            linked = get_uuids(value) & local_uuids if prop != "uuid" else set()
            not_yet_created = linked - created
            if not not_yet_created:
                insert.post_body[prop] = value
            elif prop in required:
                raise LoadError(
                    f"{insert.label}: required property '{prop}' links to"
                    f" {sorted(not_yet_created)}, which would not be created yet."
                    " Fix the insert order."
                )
            else:
                insert.patch_body[prop] = value
        created.add(insert.uuid)
    return inserts


def print_plan(inserts: List[Insert]) -> None:
    print("Phase 1 (POST new items):")
    for insert in inserts:
        if not insert.exists:
            held_back = sorted(insert.patch_body)
            suffix = f"  (held back for phase 2: {held_back})" if held_back else ""
            print(f"  POST  {insert.label}{suffix}")
    print("Phase 2 (PATCH):")
    for insert in inserts:
        if insert.patch_body:
            kind = "existing, full body" if insert.exists else "links"
            print(f"  PATCH {insert.label}  ({kind}: {sorted(insert.patch_body)})")


def write(
    key: Dict[str, str], verb: str, path: str,
    body: Dict[str, Any], label: str, add_on: str,
) -> None:
    status, content = request(key, verb, path, body=body, add_on=add_on)
    if status >= 400:
        raise LoadError(
            f"{verb} {label} failed with {status}:\n{json.dumps(content, indent=2)}"
        )
    print(f"  {verb:<5} {label}  -> {status}")


def run(key: Dict[str, str], inserts: List[Insert], validate: bool) -> int:
    """Perform the writes; return the number of failures.

    Real writes stop at the first failure since later items depend on earlier
    ones. Validation continues and reports every failure.
    """
    add_on = VALIDATE_ADD_ON if validate else ""
    new_uuids = {insert.uuid for insert in inserts if not insert.exists}
    failures = 0

    def attempt(verb: str, path: str, body: Dict[str, Any], insert: Insert) -> None:
        nonlocal failures
        try:
            write(key, verb, path, body, insert.label, add_on)
        except LoadError as e:
            if not validate:
                raise
            failures += 1
            print(f"  ERROR {e}")
            unsaved = sorted(
                set().union(*[get_uuids(v) for k, v in body.items() if k != "uuid"])
                & new_uuids
            )
            if unsaved:
                # e.g. submitted_id validation reads submission centers from the DB
                print(
                    "        NOTE: links to inserts not saved in validate mode"
                    f" {unsaved}; this failure may not occur with --execute."
                )

    print("Phase 1 (POST new items):")
    for insert in inserts:
        if not insert.exists:
            # check_only never persists, so later links can't resolve; send the
            # full item and let skip_links defer link checks.
            body = insert.item if validate else insert.post_body
            attempt("POST", insert.collection, body, insert)
    print("Phase 2 (PATCH):")
    for insert in inserts:
        if insert.patch_body and (insert.exists or not validate):
            attempt("PATCH", insert.uuid, insert.patch_body, insert)
    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--env", "-e", required=True, help="Environment from keys file")
    parser.add_argument("--inserts-dir", default=DEFAULT_INSERTS_DIR)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--validate", action="store_true",
        help="Send writes with check_only=true&skip_links=true (nothing persists)",
    )
    mode.add_argument("--execute", action="store_true", help="Perform real writes")
    args = parser.parse_args()

    key = get_auth_key(args.env)
    server = key["server"].rstrip("/")
    key["server"] = server
    print(f"Server: {server}\nInserts: {args.inserts_dir}\n")
    try:
        inserts = build_plan(key, args.inserts_dir)
        if args.execute:
            print_plan(inserts)
            answer = input(f"\nType the server URL to write to {server}: ").strip()
            if answer.rstrip("/") != server:
                print("Aborted.")
                sys.exit(1)
            run(key, inserts, validate=False)
        elif args.validate:
            failures = run(key, inserts, validate=True)
        else:
            print_plan(inserts)
            print("\nDry run: nothing was written. Use --validate or --execute.")
            return
    except LoadError as e:
        print(f"\nERROR: {e}")
        sys.exit(1)
    posted = sum(not insert.exists for insert in inserts)
    patched = sum(
        bool(insert.patch_body) and (insert.exists or not args.validate)
        for insert in inserts
    )
    if args.validate:
        print(f"\nValidated {posted} posts, {patched} patches: {failures} failed.")
        sys.exit(1 if failures else 0)
    print(f"\nDone: {posted} posts, {patched} patches.")


if __name__ == "__main__":
    main()
