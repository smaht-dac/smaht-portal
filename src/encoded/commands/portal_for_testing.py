from typing import List, Optional
from encoded.ingestion.structured_data import Portal
from dcicutils.zip_utils import temporary_file
from snovault.loadxl import create_testapp


def create_portal_for_testing(ini_file: Optional[str] = None, schemas: Optional[List[dict]] = None) -> Portal:
    if isinstance(ini_file, str):
        return Portal(create_testapp(ini_file), schemas=schemas)
    minimal_ini_for_unit_testing = "[app:app]\nuse = egg:encoded\nsqlalchemy.url = postgresql://dummy\n"
    with temporary_file(content=minimal_ini_for_unit_testing, suffix=".ini") as ini_file:
        return Portal(create_testapp(ini_file), schemas=schemas)


def create_portal_for_local_testing(ini_file: Optional[str] = None, schemas: Optional[List[dict]] = None) -> Portal:
    if isinstance(ini_file, str):
        return Portal(create_testapp(ini_file), schemas=schemas)
    minimal_ini_for_local_testing = "\n".join([
        "[app:app]\nuse = egg:encoded\nfile_upload_bucket = dummy",
        "sqlalchemy.url = postgresql://postgres@localhost:5441/postgres?host=/tmp/snovault/pgdata",
        "multiauth.groupfinder = encoded.authorization.smaht_groupfinder",
        "multiauth.policies = auth0 session remoteuser accesskey",
        "multiauth.policy.session.namespace = mailto",
        "multiauth.policy.session.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.session.base = pyramid.authentication.SessionAuthenticationPolicy",
        "multiauth.policy.remoteuser.namespace = remoteuser",
        "multiauth.policy.remoteuser.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.remoteuser.base = pyramid.authentication.RemoteUserAuthenticationPolicy",
        "multiauth.policy.accesskey.namespace = accesskey",
        "multiauth.policy.accesskey.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.accesskey.base = encoded.authentication.BasicAuthAuthenticationPolicy",
        "multiauth.policy.accesskey.check = encoded.authentication.basic_auth_check",
        "multiauth.policy.auth0.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.auth0.namespace = auth0",
        "multiauth.policy.auth0.base = encoded.authentication.Auth0AuthenticationPolicy"
    ])
    with temporary_file(content=minimal_ini_for_local_testing, suffix=".ini") as ini_file:
        return Portal(create_testapp(ini_file), schemas=schemas)

