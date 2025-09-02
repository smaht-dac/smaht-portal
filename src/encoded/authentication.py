from snovault.authentication import (
    NamespacedAuthenticationPolicy,
    BasicAuthAuthenticationPolicy,
    basic_auth_check,
    Auth0AuthenticationPolicy,
    LoginDenied
)
from snovault import COLLECTIONS
from snovault.calculated import calculate_properties
from operator import itemgetter
from dcicutils.misc_utils import ignored
from pyramid.security import NO_PERMISSION_REQUIRED
from pyramid.view import view_config
from snovault.util import debug_log


def includeme(config):
    config.scan(__name__)


def get_basic_properties_for_user(request, userid):
    """ Adapted for SMaHT to include attribution related fields """
    user = request.registry[COLLECTIONS]['user'][userid]
    user_dict = user.__json__(request)

    # Only include certain/applicable fields from profile
    include_detail_fields = ['email', 'first_name', 'last_name', 'groups', 'status', 'timezone',
                             'consortia', 'submission_centers', 'submits_for']
    user_actions = calculate_properties(user, request, category='user_action')

    properties = {
        'details': {p: v for p, v in user_dict.items() if p in include_detail_fields},
        'user_actions': [v for k, v in sorted(user_actions.items(), key=itemgetter(0))]
    }

    # add uuid to user details
    properties['details']['uuid'] = userid

    return properties


@view_config(route_name='session-properties', request_method='GET',
             permission=NO_PERMISSION_REQUIRED)
@debug_log
def session_properties(context, request):
    """ Overridden from snovault to include extra information """
    ignored(context)
    for principal in request.effective_principals:
        if principal.startswith('userid.'):
            break
    else:
        # NOTE: returning details below allows internal remoteuser (TEST for example) to run DELETE requests
        # previously in downstream portal applications, the LoginDenied error was raised, preventing such
        # DELETE requests from occurring within unit testing. This can be re-enabled if desired in downstream
        # applications, but for now should stay like this so we can unit test DELETEs - Will April 6 2023
        if 'group.admin' in request.effective_principals:
            return {
                'details': {
                    'groups': [
                        'admin'
                    ]
                }
            }
        else:
            raise LoginDenied(domain=request.domain)

    namespace, userid = principal.split('.', 1)
    properties = get_basic_properties_for_user(request, userid)
    return properties


class SMAHTNamespacedAuthenticationPolicy(NamespacedAuthenticationPolicy):
    pass


class SMAHTBasicAuthAuthenticationPolicy(BasicAuthAuthenticationPolicy):
    pass


class SMAHTAuth0AuthenticationPolicy(Auth0AuthenticationPolicy):
    pass


def smaht_basic_auth_check(username, password, request):
    return basic_auth_check(username, password, request)

