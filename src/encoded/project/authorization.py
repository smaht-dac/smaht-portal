from dcicutils.misc_utils import PRINT
from snovault.authorization import DEBUG_PERMISSIONS
from snovault.project.authorization import SnovaultProjectAuthorization
from ..types.acl import (
    SUBMISSION_CENTER_RW, SUBMISSION_CENTER_MEMBER_CREATE,
    CONSORTIUM_MEMBER_RW, CONSORTIUM_MEMBER_CREATE
)


class SMaHTProjectAuthorization(SnovaultProjectAuthorization):

    def authorization_create_principals(self, login, user, collections):
        user_properties = user.properties
        principals = ['userid.%s' % user.uuid]

        def add_principal(principal):
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "adding", principal, "to principals.")
            principals.append(principal)

        # SMaHT Specific stuff begins here (consortium and submission center)
        if 'submission_centers' in user_properties:
            add_principal(SUBMISSION_CENTER_MEMBER_CREATE)  # for add/create permissions
            add_principal(CONSORTIUM_MEMBER_RW)  # all submission centers can read/write consortium level data
            # for view permissions
            for submission_center in user_properties['submission_centers']:
                add_principal(f'{SUBMISSION_CENTER_RW}.{submission_center}')
        if 'consortiums' in user_properties:
            add_principal(CONSORTIUM_MEMBER_CREATE)  # for add/create permissions
            for consortium in user_properties['consortiums']:
                add_principal(f'{CONSORTIUM_MEMBER_RW}.{consortium}')
        return principals
