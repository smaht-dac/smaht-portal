from pyramid.security import (
    Allow, Deny, Everyone, Authenticated
)
from snovault import abstract_collection
from snovault.types.base import (
    Item,
    Collection,
    DELETED_ACL,
    Acl
)


# ACLs for SMaHT Portal
# Names should be self-explanatory
ONLY_ADMIN_VIEW_ACL: Acl = [
    (Allow, 'group.admin', ['view', 'edit']),
    (Allow, 'group.read-only-admin', ['view']),
    (Allow, 'remoteuser.INDEXER', ['view']),
    (Allow, 'remoteuser.EMBED', ['view']),
    (Deny, Everyone, ['view', 'edit'])
]


ALLOW_EVERYONE_VIEW_ACL: Acl = [
    (Allow, Everyone, ['view']),
] + ONLY_ADMIN_VIEW_ACL


ALLOW_AUTHENTICATED_VIEW_ACL: Acl = [
    (Allow, Authenticated, ['view']),
] + ONLY_ADMIN_VIEW_ACL


ALLOW_OWNER_EDIT_ACL: Acl = [
    (Allow, 'role.owner', ['edit', 'view', 'view_details']),
]


ALLOW_CONSORTIUM_MEMBER_VIEW_ACL: Acl = [
    (Allow, 'role.consortium_member', ['view'])
] + ONLY_ADMIN_VIEW_ACL


ALLOW_CONSORTIUM_MEMBER_EDIT_ACL: Acl = [
    (Allow, 'role.consortium_member', ['view', 'edit'])
] + ONLY_ADMIN_VIEW_ACL


ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL: Acl = [
    (Allow, 'role.submission_center_member', ['view'])
] + ONLY_ADMIN_VIEW_ACL


ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL: Acl = [
    (Allow, 'role.submission_center_member', ['view', 'edit'])
] + ONLY_ADMIN_VIEW_ACL


def mixin_smaht_permission_types(schema: dict) -> dict:
    """ Runs a manual 'mixin' of attribution entries for SMaHT types """
    schema['properties']['submission_centers'] = {
        'type': 'array',
        'items': {
            'linkTo': 'SubmissionCenter'
        }
    }
    schema['properties']['consortiums'] = {
        'type': 'array',
        'items': {
            'linkTo': 'Consortiums'
        }
    }
    return schema


class SMAHTCollection(Collection):
    pass


@abstract_collection(
    name='smaht-items',
    properties={
        'title': "SMaHT Item Listing",
        'description': 'Abstract collection of all SMaHT Items.',
    }
)
class SMAHTItem(Item):
    # This value determines the default status mapping of permissions
    # Ie: if an item status = public, then the ACL ALLOW_EVERYONE_VIEW applies to its permissions,
    # so anyone (even unauthenticated users) can view it
    STATUS_ACL = {
        'shared': ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'obsolete': ALLOW_CONSORTIUM_MEMBER_VIEW_ACL,
        'current': ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'inactive': ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'in review': ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'uploaded': ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'uploading': ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL,
        'archived': ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL,
        'deleted': DELETED_ACL,
        'replaced': ONLY_ADMIN_VIEW_ACL,
        # Everyone can view - restricted to specific items via schemas.
        'public': ALLOW_EVERYONE_VIEW_ACL,
        # Only creator can view - restricted to specific items via schemas.
        'draft': ALLOW_OWNER_EDIT_ACL
    }

    def __ac_local_roles__(self):
        """ Overrides the default permissioning to add some additional roles to the item based on
            properties it may have.
        """
        roles = {}
        properties = self.upgrade_properties()
        if 'submission_centers' in properties:
            for submission_center in properties['submission_centers']:
                center = f'submission_center.{submission_center}'
                roles[center] = 'role.submission_center_member'
        if 'consortiums' in properties:
            for consortium in properties['consortiums']:
                consortium_identifier = f'consortium.{consortium}'
                roles[consortium_identifier] = 'role.consortium_member'
        if 'submitted_by' in properties:
            submitter = 'userid.%s' % properties['submitted_by']
            roles[submitter] = 'role.owner'
        return roles
