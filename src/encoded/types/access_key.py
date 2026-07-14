from typing import Dict, List, Tuple

from pyramid.authorization import Allow
from pyramid.view import view_config
from snovault import collection, load_schema
from snovault.types.access_key import (
    AccessKey as SnovaultAccessKey,
    access_key_add as sno_access_key_add,
    access_key_reset_secret as sno_access_key_reset_secret,
    access_key_view_raw as sno_access_key_view_raw
)
from snovault.util import debug_log
from snovault.validators import validate_item_content_post

from .acl import ALLOW_AUTHENTICATED_CREATE_ACL, ONLY_ADMIN_VIEW_ACL
from .base import DELETED_ACL
from .base import Item


@collection(
    name='access-keys',
    unique_key="access_key:access_key_id",  # Required for GET via /access-keys/{access_key_id}/
    acl=ALLOW_AUTHENTICATED_CREATE_ACL,
    properties={
        "title": "Access keys",
        "description": "Programmatic access keys",
    },
)
class AccessKey(Item, SnovaultAccessKey):
    """AccessKey class."""
    ACCESS_KEY_EXPIRATION_TIME = 30  # days
    item_type = "access_key"
    schema = load_schema("encoded:schemas/access_key.json")
    # Access keys are rotated/reset rather than meaningfully revised;
    # retaining every Postgres revision adds storage growth without useful
    # audit value. The plaintext secret is never persisted (only returned
    # once, transiently, at creation/reset time); secret_access_key_hash IS
    # part of the persisted properties, so a superseded (rotated) hash can
    # appear in an old, non-current propsheet row. The cleanup's existing
    # current-row exclusion guarantees only already-superseded hashes -
    # never the live one needed for authentication - are ever eligible for
    # deletion; see test_access_key_cleanup_preserves_current_secret_hash.
    track_revisions = False
    embedded_list = []

    STATUS_ACL = {
        "current": [(Allow, "role.owner", ["view", "edit"])] + ONLY_ADMIN_VIEW_ACL,
        "deleted": DELETED_ACL,
    }

    class Collection(Item.Collection):
        pass

    def __acl__(self) -> List[Tuple[str, str, List[str]]]:
        return SnovaultAccessKey.__acl__(self)

    def __ac_local_roles__(self) -> Dict[str, str]:
        return SnovaultAccessKey.__ac_local_roles__(self)


@view_config(context=AccessKey.Collection, request_method="POST",
             permission="add",
             validators=[validate_item_content_post])
@debug_log
def access_key_add(context, request):
    return sno_access_key_add(context, request)


@view_config(name="reset-secret", context=AccessKey,
             permission="add",
             request_method="POST", subpath_segments=0)
@debug_log
def access_key_reset_secret(context, request):
    return sno_access_key_reset_secret(context, request)


@view_config(context=AccessKey, permission="view_raw", request_method="GET",
             name="raw")
@debug_log
def access_key_view_raw(context, request):
    return sno_access_key_view_raw(context, request)
