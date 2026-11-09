# This code snippet is adapated from AWS ECS Documentation
# The plan is 'create' environments by uploading Secrets to AWS Secrets Manager
# and retrieve the secrets upon deployment.
# The idea is the container runner will have an assumed IAM role granting access
# specifically to the secret

import os
import logging
import io
from dcicutils.misc_utils import override_environ
from dcicutils.deployment_utils import BasicOrchestratedSMAHTIniFileManager
from dcicutils.secrets_utils import assume_identity


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__file__)
_MY_DIR = os.path.dirname(__file__)


class SMAHTDockerIniFileManager(BasicOrchestratedSMAHTIniFileManager):
    """This runs at top level, so path is slightly different.

    The released dcicutils version on current main predates the four public
    Okta template bindings. Keep that dependency unchanged and provide the
    bindings locally so startup can render the existing production template.
    """
    # should work but doesn't (missing cgap-portal): os.path.join(os.path.dirname(_MY_DIR), "pyproject.toml")
    # expected = <hardwired>
    # actual = <computed>
    # assert actual == expected, "The actual value %s was not what we expected, %s." % (actual, expected)
    TEMPLATE_DIR = '/home/nginx/smaht-portal/deploy/ini_files'
    PYPROJECT_FILE_NAME = '/home/nginx/smaht-portal/pyproject.toml'

    @classmethod
    def _okta_template_environment(cls, kwargs):
        """Map the identity environment to the template's public Okta fields."""
        values = {}
        for argument, variable in (
            ('okta_issuer', 'OKTA_ISSUER'),
            ('okta_client', 'OKTA_CLIENT'),
            ('okta_scopes', 'OKTA_SCOPES'),
            ('okta_require_email_verified', 'OKTA_REQUIRE_EMAIL_VERIFIED'),
        ):
            value = kwargs.pop(argument, None)
            if value is None:
                value = os.environ.get(f'ENCODED_{variable}', '')
            if argument == 'okta_require_email_verified' and isinstance(value, bool):
                value = 'true' if value else 'false'
            values[variable] = value or ''
        return values

    @classmethod
    def build_ini_stream_from_template(cls, template_file_name, init_file_stream, **kwargs):
        """Render stable dcicutils templates with the public Okta values."""
        okta_environment = cls._okta_template_environment(kwargs)
        with override_environ(**okta_environment):
            return super().build_ini_stream_from_template(
                template_file_name, init_file_stream, **kwargs
            )

    @classmethod
    def build_ini_file_from_template(cls, template_file_name, init_file_name, **kwargs):
        """Preserve the Okta keyword arguments on stable dcicutils releases."""
        with io.open(init_file_name, 'w') as init_file_stream:
            cls.build_ini_stream_from_template(template_file_name, init_file_stream, **kwargs)


def build_production_ini_from_global_application_configuration():
    """ This function makes a request to secrets manager for the identity passed to the container.
        See documentation on API in dcicutils.
    """
    identity = assume_identity()

    # build production.ini
    with override_environ(**identity):

        SMAHTDockerIniFileManager.build_ini_file_from_template(
            '/home/nginx/smaht-portal/deploy/docker/production/smaht_any_alpha.ini',
            '/home/nginx/smaht-portal/production.ini'
        )


if __name__ == '__main__':
    build_production_ini_from_global_application_configuration()
