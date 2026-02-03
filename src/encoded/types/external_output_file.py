from typing import Any, Dict, List, Optional, Union

from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_file import SubmittedFile
from .file import CalcPropConstants

from ..item_utils import (
    file as file_utils,
    external_output_file as eof_utils
)
from ..item_utils.utils import (
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
    get_unique_values,
    RequestHandler,
)

def _build_external_output_file_embedded_list():
    """Embeds for search on external output files."""
    return SubmittedFile.embedded_list + [
        "reference_genome.display_title",
    ]


@collection(
    name="external-output-files",
    unique_key="submitted_id",
    properties={
        "title": "External Output File",
        "description": "Submitted files that are the output of external analyses",
    },
)
class ExternalOutputFile(SubmittedFile):
    item_type = "external_output_file"
    schema = load_schema("encoded:schemas/external_output_file.json")
    embedded_list = _build_external_output_file_embedded_list()

    @calculated_property(schema=CalcPropConstants.SAMPLE_SOURCES_SCHEMA)
    def sample_sources(
       self,
       request: Request,
       file_sets: Optional[List[str]] = None,
    ) -> Union[List[str], None]:
        """Get sample sources from file sets or sample sources link, if present."""
        if (file_set_source := SubmittedFile.sample_sources(self, request, file_sets)):
            return file_set_source
        else:
            result = eof_utils.get_tissues(self.properties)
        return result or None
