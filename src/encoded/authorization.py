import json

from dcicutils.misc_utils import PRINT
from snovault import COLLECTIONS
from pyramid.security import Authenticated
from snovault.authorization import DEBUG_PERMISSIONS
from structlog import getLogger


log = getLogger(__name__)


def smaht_groupfinder(login, request):
    """ Specialized groupfinder for SMaHT
        TODO: refactor snovault.authorization.groupfinder so most of this can be re-used
    """
    if '.' not in login:
        if DEBUG_PERMISSIONS:
            PRINT("groupfinder sees no '.' in %s, returning None" % login)
        return None
    namespace, localname = login.split('.', 1)
    user = None

    collections = request.registry[COLLECTIONS]

    """ At least part of this stanza seems mainly for testing purposes
        should the testing bits be refactored elsewhere???
        20-09-08 changed permission model requires import of Authenticated
        is that kosher
    """
    # TODO (C4-332): Consolidate permissions all in one perms.py file once this all stabilizes.
    if namespace == 'remoteuser':

        # These names are used in testing or special service situations to force the permissions result
        # to known values without any need to go through lookup of any particular user and process
        # their groups or project_roles.

        synthetic_result = None

        if localname in ['EMBED', 'INDEXER']:
            synthetic_result = []
        elif localname in ['TEST', 'IMPORT', 'UPGRADE', 'INGESTION']:
            synthetic_result = ['group.admin']
        elif localname in ['TEST_SUBMITTER']:
            synthetic_result = ['group.submitter']
        elif localname in ['TEST_AUTHENTICATED']:
            synthetic_result = [Authenticated]

        if synthetic_result is not None:
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "returning synthetic result:", synthetic_result)
            return synthetic_result

        # Note that the above 'if' has no final 'else', and the remainder of cases,
        # having the form remoteuser.<username>, are processed in the next 'if' below.

    if namespace in ('mailto', 'remoteuser', 'auth0'):
        users = collections.by_item_type['user']
        try:
            user = users[localname]
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "found user", localname)
        except KeyError:
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "failed to find user", localname)
            return None

    elif namespace == 'accesskey':

        access_keys = collections.by_item_type['access_key']
        try:
            access_key = access_keys[localname]
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "found access key", localname)
        except KeyError:
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "failed to find access key", localname)
            return None

        access_key_status = access_key.properties.get('status')
        if access_key_status in ('deleted', 'revoked'):
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "found", access_key_status, "access key", localname)
            return None

        userid = access_key.properties['user']
        user = collections.by_item_type['user'][userid]

        if DEBUG_PERMISSIONS:
            PRINT("groupfinder for", login, "decoded access key", localname, "as user", user)

    if user is None:
        PRINT("groupfinder for", login, "returning None because user is None")
        return None

    user_properties = user.properties

    if user_properties.get('status') in ('deleted'):
        if DEBUG_PERMISSIONS:
            PRINT("groupfinder for %s found user %s, but that user has status deleted." % (login, user))
        return None

    principals = ['userid.%s' % user.uuid]
    if DEBUG_PERMISSIONS:
        PRINT("groupfinder starting with principals", principals)

    def add_principal(principal):
        if DEBUG_PERMISSIONS:
            PRINT("groupfinder for", login, "adding", principal, "to principals.")
        principals.append(principal)

    for group in user_properties.get('groups', []):
        add_principal('group.%s' % group)

    if DEBUG_PERMISSIONS:
        PRINT("groupfinder for", login, "returning principals", json.dumps(principals, indent=2))

    # SMaHT Specific stuff begins here (consortium and submission center)
    submission_centers = user_properties.get('submission_centers', [])
    submits_for = user_properties.get('submits_for', [])
    if submits_for:
        principals.append('group.submitter')
        principals.extend(f'submits_for.{submission_center}' for submission_center in submits_for)
    if submission_centers:
        add_principal('role.consortium_member_rw')  # all submission centers can read consortium level data
        # for view permissions
        for submission_center in submission_centers:
            add_principal(f'role.submission_center_member_rw.{submission_center}')
    consortia = user_properties.get('consortia', [])
    if consortia:
        add_principal('role.consortium_member_create')  # for add/create permissions
        for consortium in consortia:
            add_principal(f'role.consortium_member_rw.{consortium}')

    return principals
