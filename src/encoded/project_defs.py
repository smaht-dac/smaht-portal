from dcicutils.project_utils import C4ProjectRegistry
from snovault.project_defs import SnovaultProject
from .project_env import APPLICATION_NAME, APPLICATION_PYPROJECT_NAME
from .project.authentication import SMAHTProjectAuthentication
from .project.authorization import SMaHTProjectAuthorization
from .project.ingestion import SMaHTProjectIngestion
from .project.loadxl import SMaHTProjectLoadxl
from .project.schema_views import SMaHTProjectSchemaViews


@C4ProjectRegistry.register(APPLICATION_PYPROJECT_NAME)
class SMaHTProject(SMAHTProjectAuthentication,
                   SMaHTProjectAuthorization,
                   SMaHTProjectIngestion,
                   SMaHTProjectLoadxl,
                   SMaHTProjectSchemaViews,
                   SnovaultProject):
    NAMES = {'NAME': APPLICATION_NAME, 'PYPI_NAME': APPLICATION_PYPROJECT_NAME}
    ACCESSION_PREFIX = "SMA"
