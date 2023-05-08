from snovault.authentication import (
    NamespacedAuthenticationPolicy,
    BasicAuthAuthenticationPolicy,
    basic_auth_check,
    Auth0AuthenticationPolicy,
)


class SMAHTNamespacedAuthenticationPolicy(NamespacedAuthenticationPolicy):
    pass


class SMAHTBasicAuthAuthenticationPolicy(BasicAuthAuthenticationPolicy):
    pass


class SMAHTAuth0AuthenticationPolicy(Auth0AuthenticationPolicy):
    pass


def smaht_basic_auth_check(username, password, request):
    return basic_auth_check(username, password, request)

