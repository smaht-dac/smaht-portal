from pyramid.request import Request
from typing import Any, Optional
from dcicutils.misc_utils import str_to_bool
from snovault import collection, load_schema
from snovault.types.ingestion import IngestionSubmission as SnovaultIngestionSubmission
from snovault import calculated_property, display_title_schema
from .base import Item


@collection(
    name="ingestion-submissions",
    properties={
        "title": "Ingestion Submissions",
        "description": "List of Ingestion Submissions",
    },
)
class IngestionSubmission(Item, SnovaultIngestionSubmission):
    """The IngestionSubmission class that holds info on requests to ingest data."""

    item_type = "ingestion_submission"
    schema = load_schema("encoded:schemas/ingestion_submission.json")
    embedded_list = []

    @calculated_property(schema=display_title_schema)
    def display_title(
        self,
        request: Request,
        parameters: Optional[dict] = None
    ) -> str:
        if isinstance(parameters, dict) and _to_bool(parameters.get("validate_only")) is True:
            # TODO: Look into why validate_only is sometimes a bool and sometimes a string.
            return f"Validation:{self.uuid}"
        return f"Submission:{self.uuid}"


def _to_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    elif isinstance(value, str):
        return str_to_bool(value)
    else:
        return fallback
