from typing import Optional, Union

import structlog
from pyramid.threadlocal import get_current_request
from pyramid.view import view_config
from snovault import calculated_property, collection, display_title_schema, load_schema
from snovault.types.user import User as SnovaultUser
from snovault.types.user import user_page_view as SnoUserPageView
from snovault.types.user import user_add as SnoUserAdd
from snovault.util import debug_log

from .acl import ONLY_ADMIN_VIEW_ACL, ONLY_OWNER_VIEW_PROFILE_ACL, DELETED_USER_ACL
from .base import Item
from ..audit_logging import (
    authenticated_actor_fields,
    result_subject_uuid,
    safe_user_field_value,
    subject_uuid_fields,
)


log = structlog.getLogger(__name__)
AUDITED_USER_FIELDS = ("status", "groups", "submits_for", "submission_centers")
USER_ARRAY_FIELDS = frozenset(AUDITED_USER_FIELDS) - {"status"}


def _user_audit_snapshot(properties):
    return {
        field_name: safe_user_field_value(field_name, properties.get(
            field_name, [] if field_name in USER_ARRAY_FIELDS else None
        ))
        for field_name in AUDITED_USER_FIELDS
    }


def _log_user_record_event(action, actor_fields, subject_fields, changed_fields, changes,
                           **extra_fields):
    log.warning(
        "User record audit event",
        event_type="user_account",
        action=action,
        outcome="success",
        changed_fields=changed_fields,
        changes=changes,
        **actor_fields,
        **subject_fields,
        **extra_fields,
    )


@collection(
    name='users',
    unique_key="user:email",  # Required to GET via /users/{email}/
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Users",
        "description": "Listing of current SMaHT users",
    }
)
class User(Item, SnovaultUser):
    item_type = "user"
    schema = load_schema("encoded:schemas/user.json")
    embedded_list = [
        # Consortia linkTo
        'consortia.identifier',

        # Submission Center linkTo
        'submission_centers.identifier',

        # Submission Center linkTo
        'submits_for.identifier'
    ]

    STATUS_ACL = {
        'current': ONLY_OWNER_VIEW_PROFILE_ACL,
        'deleted': DELETED_USER_ACL,
        'revoked': DELETED_USER_ACL,
        'inactive': ONLY_OWNER_VIEW_PROFILE_ACL,
    }

    def __acl__(self):
        """ Note that in smaht-portal, because of how __acl__ is written in base.py, this function
            MUST be overridden in order to trigger custom behavior (unlike in CGAP/Fourfront where one
            can simply override STATUS_ACL
        """
        properties = self.upgrade_properties().copy()
        status = properties.get('status')
        return self.STATUS_ACL.get(status, ONLY_ADMIN_VIEW_ACL)

    @calculated_property(schema=display_title_schema)
    def display_title(
        self, first_name: Optional[str], last_name: Optional[str]
    ) -> Union[str, None]:
        if first_name and last_name:
            return SnovaultUser.display_title(self, first_name, last_name)

    @calculated_property(schema={"title": "Title", "type": "string"})
    def title(self, first_name: Optional[str], last_name: Optional[str]) -> Union[str, None]:
        if first_name and last_name:
            return SnovaultUser.title(self, first_name, last_name)

    @calculated_property(
        schema={"title": "Contact Email", "type": "string", "format": "email"}
    )
    def contact_email(
        self, email: Optional[str] = None, preferred_email: Optional[str] = None
    ) -> Union[str, None]:
        return SnovaultUser.contact_email(self, email, preferred_email=preferred_email)

    def __ac_local_roles__(self):
        """return the owner user."""
        roles = super().__ac_local_roles__()
        owner = 'userid.%s' % self.uuid
        roles[owner] = 'role.owner'
        return roles

    def update(self, properties, sheets=None):
        """Audit security-relevant User changes after the persistence update succeeds."""
        update_properties = dict(properties or {})
        before = dict(self.properties or {})
        before_snapshot = _user_audit_snapshot(before)
        result = super().update(properties, sheets)
        after = before.copy()
        after.update(update_properties)
        after_snapshot = _user_audit_snapshot(after)

        changes = {
            field_name: {
                "before": before_snapshot[field_name],
                "after": after_snapshot[field_name],
            }
            for field_name in AUDITED_USER_FIELDS
            if field_name in update_properties
            and before_snapshot[field_name] != after_snapshot[field_name]
        }
        changed_fields = list(changes)
        for field_name in update_properties:
            if field_name in AUDITED_USER_FIELDS or field_name == "uuid":
                continue
            if before.get(field_name) != after.get(field_name):
                changed_fields.append(field_name)
        if not changed_fields:
            return result

        actor_fields = authenticated_actor_fields(get_current_request())
        subject_fields = subject_uuid_fields(getattr(self, "uuid", None))
        if set(changed_fields) - {"groups"}:
            _log_user_record_event(
                "user_record_change",
                actor_fields,
                subject_fields,
                changed_fields,
                changes,
            )

        if "groups" in changes:
            before_groups = set(before_snapshot["groups"])
            after_groups = set(after_snapshot["groups"])
            granted_groups = sorted(after_groups - before_groups)
            revoked_groups = sorted(before_groups - after_groups)
            if granted_groups:
                _log_user_record_event(
                    "user_group_grant",
                    actor_fields,
                    subject_fields,
                    ["groups"],
                    {"groups": changes["groups"]},
                    granted_groups=granted_groups,
                )
            if revoked_groups:
                _log_user_record_event(
                    "user_group_revoke",
                    actor_fields,
                    subject_fields,
                    ["groups"],
                    {"groups": changes["groups"]},
                    revoked_groups=revoked_groups,
                )
        return result


USER_PAGE_VIEW_ATTRIBUTES = ['@id', '@type', 'uuid', 'title', 'display_title', 'email', 'consortia',
                             'submission_centers']


@view_config(context=User, permission='view', request_method='GET', name='page')
@debug_log
def user_page_view(context, request, user_page_view_attributes=USER_PAGE_VIEW_ATTRIBUTES):
    """smth."""
    return SnoUserPageView(context, request, user_page_view_attributes=user_page_view_attributes)


@view_config(context=User.Collection, permission='add', request_method='POST',
             physical_path="/users")
@debug_log
def user_add(context, request):
    actor_fields = authenticated_actor_fields(request)
    try:
        result = SnoUserAdd(context, request)
    except Exception:
        log.warning(
            "User account creation failed",
            event_type="user_account",
            action="user_account_create",
            outcome="failure",
            **actor_fields,
        )
        raise
    if isinstance(result, dict) and result.get("status") == "success":
        log.warning(
            "User account created",
            event_type="user_account",
            action="user_account_create",
            outcome="success",
            **actor_fields,
            **subject_uuid_fields(result_subject_uuid(result)),
        )
    return result


@calculated_property(context=User, category='user_action')
def impersonate(context, request):
    """smth."""
    # This is assuming the user_action calculated properties
    # will only be fetched from the current_user view,
    # which ensures that the user represented by 'context' is also an effective principal
    if request.has_permission('impersonate'):
        return {
            'id': 'impersonate',
            'title': 'Impersonate User',
            'href': request.resource_path(context) + '?currentAction=impersonate-user',
        }


@calculated_property(context=User, category='user_action')
def profile(context, request):
    """smth."""
    return {
        'id': 'profile',
        'title': 'Profile',
        'href': request.resource_path(context),
    }


# @calculated_property(context=User, category='user_action')
# def submissions(request):
#     """smth."""
#     return {
#         'id': 'submissions',
#         'title': 'Submissions',
#         'href': '/submissions',
#     }
