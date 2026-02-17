from typing import Any, Dict, List, Optional, Union

from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_file import SubmittedFile
from .file import CalcPropConstants

from ..item_utils import (
    external_output_file as eof_utils,
    tissue as tissue_utils,
    item as item_utils,
)
from ..item_utils.utils import (
    get_property_values_from_identifiers,
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
        """Get sample sources from file sets or tissues link, if present."""
        if (file_set_source := SubmittedFile.sample_sources(self, request, file_sets)):
            return file_set_source
        else:
            result = eof_utils.get_tissues(self.properties)
        return result or None

    @calculated_property(schema=CalcPropConstants.DONORS_SCHEMA)
    def donors(
       self,
       request: Request,
       file_sets: Optional[List[str]] = None,
    ) -> Union[List[str], None]:
        """Get donors from file sets or tissues link, if present."""
        if (file_set_source := SubmittedFile.donors(self, request, file_sets)):
            return file_set_source
        else:
            request_handler = RequestHandler(request=request)
            result = eof_utils.get_donors(self.properties, request_handler)
        return result or None

    def _get_sample_summary_fields(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get sample summary for display on file overview page."""
        to_include = {
            CalcPropConstants.SAMPLE_SUMMARY_DONOR_IDS: get_property_values_from_identifiers(
                request_handler,
                eof_utils.get_donors(file_properties, request_handler),
                item_utils.get_external_id,
            ),
            CalcPropConstants.SAMPLE_SUMMARY_CATEGORY: eof_utils.get_tissue_category(file_properties, request_handler),
            CalcPropConstants.SAMPLE_SUMMARY_TISSUES: eof_utils.get_tissue_type(file_properties, request_handler),
            CalcPropConstants.SAMPLE_SUMMARY_TISSUE_SUBTYPES: get_property_values_from_identifiers(
                request_handler,
                eof_utils.get_uberon_ids(file_properties, request_handler),
                item_utils.get_display_title,
            ),
            CalcPropConstants.SAMPLE_SUMMARY_TISSUE_DETAILS: get_property_values_from_identifiers(
                request_handler,
                eof_utils.get_tissues(file_properties),
                tissue_utils.get_location,
            ),
            # CalcPropConstants.SAMPLE_SUMMARY_SAMPLE_NAMES: get_property_values_from_identifiers(
            #     request_handler,
            #     file_utils.get_samples(file_properties, request_handler),
            #     functools.partial(
            #         sample_utils.get_sample_names, request_handler=request_handler
            #     ),
            # ),
            # CalcPropConstants.SAMPLE_SUMMARY_SAMPLE_DESCRIPTIONS:
            #     get_property_values_from_identifiers(
            #         request_handler,
            #         file_utils.get_samples(file_properties, request_handler),
            #         functools.partial(
            #             sample_utils.get_sample_descriptions,
            #             request_handler=request_handler,
            #         ),
            #     ),
            # CalcPropConstants.SAMPLE_SUMMARY_STUDIES: get_property_values_from_identifiers(
            #     request_handler,
            #     file_utils.get_samples(file_properties, request_handler),
            #     functools.partial(
            #         sample_utils.get_studies, request_handler=request_handler
            #     ),
            # ),
            # CalcPropConstants.SAMPLE_SUMMARY_ANALYTES: get_property_values_from_identifiers(
            #     request_handler,
            #     file_utils.get_analytes(file_properties, request_handler),
            #     analyte_utils.get_molecule,
            # ),
        }
        result = {key: value for key, value in to_include.items() if value}
        return result

