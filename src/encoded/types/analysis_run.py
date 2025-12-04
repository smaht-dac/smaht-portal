from typing import Any, Dict, List, Union
import functools

from pyramid.view import view_config
from pyramid.request import Request
from snovault import calculated_property, collection, load_schema
from snovault.util import debug_log, get_item_or_none
from encoded.validator_decorators import link_related_validator
import structlog

from .submitted_item import (
    SUBMITTED_ITEM_ADD_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PATCH_VALIDATORS,
    SUBMITTED_ITEM_EDIT_PUT_VALIDATORS,
    SubmittedItem,
)
from ..item_utils import (
    assay as assay_utils,
    file_set as file_set_utils,
    item as item_utils,
    library as library_utils,
    sequencing as sequencing_utils,
    analyte as analyte_utils,
    sample as sample_utils,
    tissue_sample as tissue_sample_utils,
    tissue as tissue_utils,
)
from ..item_utils.utils import (
    RequestHandler,
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
)
from ..utils import load_extended_descriptions_in_schemas


from .base import collection_add, item_edit, Item

from .utils import get_properties, get_property_for_validation

log = structlog.getLogger(__name__)


def _build_analysis_run_embedded_list():
    """Embeds for search on file sets."""
    return [
        "meta_workflow_runs.meta_workflow.display_title",
        "meta_workflow_runs.meta_workflow.category",
        "meta_workflow_runs.meta_workflow.name",
        "meta_workflow_runs.accession",
        "meta_workflow_runs.final_status",
        "meta_workflow_runs.date_created",
        "tissues.donor",
        "tissues.tissue_type",
    ]


@collection(
    name="analysis-runs",
    unique_key="analysis_run:identifier",
    properties={
        "title": "Analysis Runs",
        "description": "Collection of analysis runs",
    },
)
class AnalysisRun(Item):
    item_type = "analysis_run"
    schema = load_schema("encoded:schemas/analysis_run.json")
    embedded_list = _build_analysis_run_embedded_list()
    rev = {
        "meta_workflow_runs": ("MetaWorkflowRun", "analysis_runs"),
    }

    class Collection(Item.Collection):
        pass

    @calculated_property(
        schema={
            "title": "MetaWorkflowRuns",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "MetaWorkflowRun",
            },
        },
    )
    def meta_workflow_runs(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "meta_workflow_runs")
        if result:
            return result
        return
