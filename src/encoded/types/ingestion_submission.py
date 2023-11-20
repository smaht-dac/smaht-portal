from snovault import collection, load_schema
from snovault.types.ingestion import IngestionSubmission as SnovaultIngestionSubmission
from .acl import SUBMISSION_CENTER_MEMBER_CREATE_ACL
from .base import Item as SMAHTItem


@collection(
    name="ingestion-submissions",
    acl=SUBMISSION_CENTER_MEMBER_CREATE_ACL,
    properties={
        "title": "Ingestion Submissions",
        "description": "List of Ingestion Submissions",
    },
)
class IngestionSubmission(SMAHTItem, SnovaultIngestionSubmission):
    """The IngestionSubmission class that holds info on requests to ingest data."""

    item_type = "ingestion_submission"
    schema = load_schema("encoded:schemas/ingestion_submission.json")
    embedded_list = []
