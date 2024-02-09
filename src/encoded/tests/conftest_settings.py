import os
from random import randint


REPOSITORY_ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))


_app_settings = {
    "env.name": f"smaht-{randint(1000, 100000)}",
    "collection_datastore": "database",
    "item_datastore": "database",
    "multiauth.policies": "session remoteuser accesskey auth0",
    "multiauth.groupfinder": "encoded.authorization.smaht_groupfinder",
    "multiauth.policy.session.use": "encoded.authentication.SMAHTNamespacedAuthenticationPolicy",
    "multiauth.policy.session.base": "pyramid.authentication.SessionAuthenticationPolicy",
    "multiauth.policy.session.namespace": "mailto",
    "multiauth.policy.remoteuser.use": "encoded.authentication.SMAHTNamespacedAuthenticationPolicy",
    "multiauth.policy.remoteuser.namespace": "remoteuser",
    "multiauth.policy.remoteuser.base": "pyramid.authentication.RemoteUserAuthenticationPolicy",
    "multiauth.policy.accesskey.use": "encoded.authentication.SMAHTNamespacedAuthenticationPolicy",
    "multiauth.policy.accesskey.namespace": "accesskey",
    "multiauth.policy.accesskey.base": "encoded.authentication.SMAHTBasicAuthAuthenticationPolicy",
    "multiauth.policy.accesskey.check": "encoded.authentication.smaht_basic_auth_check",
    "multiauth.policy.auth0.use": "encoded.authentication.SMAHTNamespacedAuthenticationPolicy",
    "multiauth.policy.auth0.namespace": "auth0",
    "multiauth.policy.auth0.base": "encoded.authentication.SMAHTAuth0AuthenticationPolicy",
    "load_test_only": True,
    "testing": True,
    "indexer": True,
    "mpindexer": False,
    "production": True,
    "pyramid.debug_authorization": True,
    "postgresql.statement_timeout": 20,
    "sqlalchemy.url": "dummy@dummy",
    "retry.attempts": 3,
    # some file specific stuff for testing
    "file_upload_bucket": "smaht-unit-testing-files",
    "file_wfout_bucket": "smaht-unit-testing-wfout",
    "file_upload_profile_name": "test-profile",
    "metadata_bundles_bucket": "smaht-unit-testing-metadata-bundles",
}


def make_app_settings_dictionary():
    return _app_settings.copy()


ORDER = []
