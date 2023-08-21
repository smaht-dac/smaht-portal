import io
import json
import structlog
from dcicutils.misc_utils import ignored
from snovault.util import debuglog, s3_local_file
from snovault.ingestion.common import get_parameter
from snovault.ingestion.ingestion_processors import ingestion_processor
from snovault.types.ingestion import SubmissionFolio
#from ..submit import submit_metadata_bundle
#from ..submit_genelist import submit_genelist, submit_variant_update


log = structlog.getLogger(__name__)


def includeme(config):
    config.scan(__name__)


@ingestion_processor('metadata_bundle')
@ingestion_processor('family_history')
def handle_metadata_bundle(submission: SubmissionFolio):

    with submission.processing_context():

        s3_client = submission.s3_client
        submission_id = submission.submission_id
