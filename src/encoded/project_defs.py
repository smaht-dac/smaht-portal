from dcicutils.project_utils import C4ProjectRegistry
from snovault.project_defs import SnovaultProject
from encoded.project_env import APPLICATION_NAME, APPLICATION_PYPROJECT_NAME
from encoded.project.access_key import SMAHTProjectAccessKey
from encoded.project.authentication import SMAHTProjectAuthentication
from encoded.project.authorization import SMaHTProjectAuthorization
from encoded.project.ingestion import SMaHTProjectIngestion
from encoded.project.loadxl import SMaHTProjectLoadxl
from encoded.project.schema_views import SMaHTProjectSchemaViews


@C4ProjectRegistry.register(APPLICATION_PYPROJECT_NAME)
class SMaHTProject(SMAHTProjectAccessKey,
                   SMAHTProjectAuthentication,
                   SMaHTProjectAuthorization,
                   SMaHTProjectIngestion,
                   SMaHTProjectLoadxl,
                   SMaHTProjectSchemaViews,
                   SnovaultProject):
    NAMES = {'NAME': APPLICATION_NAME, 'PYPI_NAME': APPLICATION_PYPROJECT_NAME}
    ACCESSION_PREFIX = "SMA"
