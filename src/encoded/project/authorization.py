from dcicutils.misc_utils import PRINT
from snovault.authorization import DEBUG_PERMISSIONS
from snovault.project.authorization import SnovaultProjectAuthorization


class SMaHTProjectAuthorization(SnovaultProjectAuthorization):

    def authorization_create_principals(self, login, user, collections):
        user_properties = user.properties
        principals = ['userid.%s' % user.uuid]

        def add_principal(principal):
            if DEBUG_PERMISSIONS:
                PRINT("groupfinder for", login, "adding", principal, "to principals.")
            principals.append(principal)

        if 'submission_centers' in user_properties:
            add_principal('role.submission_center_member')
        if 'consortium' in user_properties:
            add_principal('role.consortium_member')
        return principals
