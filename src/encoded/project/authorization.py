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

        # SMaHT Specific stuff begins here (consortium and submission center)
        if 'submission_centers' in user_properties:
            add_principal('role.submission_center_member')  # for add/create permissions
            # for view permissions
            for submission_center in user_properties['submission_centers']:
                add_principal(f'role.submission_center_member.{submission_center}')
        if 'consortiums' in user_properties:
            add_principal('role.consortium_member')  # for add/create permissions
            for consortium in user_properties['consortiums']:
                add_principal(f'role.consortium_member.{consortium}')
        return principals
