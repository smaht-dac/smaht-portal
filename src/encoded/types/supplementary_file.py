from typing import Dict, Any, List, Union, Optional
import functools

from snovault import (
    collection,
    load_schema,
    calculated_property
)
from pyramid.request import Request

from .submitted_file import SubmittedFile
from .file import CalcPropConstants

from ..item_utils.utils import (
    get_property_value_from_identifier,
    get_property_values_from_identifiers,
    RequestHandler,
)

from ..item_utils import (
    supplementary_file as supp_file_utils,
    tissue as tissue_utils,
    sample as sample_utils,
    analyte as analyte_utils,
    item as item_utils,
    sequencing as sequencing_utils,
    file as file_utils
)

def _build_supplementary_file_embedded_list():
    """Embeds for search on supplementary files."""
    return SubmittedFile.embedded_list


@collection(
    name="supplementary-files",
    unique_key="submitted_id",
    properties={
        "title": "Supplementary File",
        "description": "Supplementary submitted files",
    },
)
class SupplementaryFile(SubmittedFile):
    item_type = "supplementary_file"
    schema = load_schema("encoded:schemas/supplementary_file.json")
    embedded_list = _build_supplementary_file_embedded_list()

    @calculated_property(schema=CalcPropConstants.DATA_GENERATION_SCHEMA)
    def data_generation_summary(
        self, request: Request, donor_specific_assembly: Optional[str] = None
    ) -> Union[Dict[str, Any], None]:
        """Get data generation summary for display on file overview page."""
        return self._get_data_generation_summary(request, donor_specific_assembly=donor_specific_assembly)

    @calculated_property(schema=CalcPropConstants.SAMPLE_SUMMARY_SCHEMA)
    def sample_summary(
        self, request: Request, donor_specific_assembly: Optional[str] = None
    ) -> Union[Dict[str, Any], None]:
        """Get sample summary for display on file overview page."""
        return self._get_sample_summary(request,donor_specific_assembly=donor_specific_assembly)

    def _get_sample_summary(self, request: Request, donor_specific_assembly: Optional[str] = None) -> Union[Dict[str, Any], None]:
        """Get sample summary for display on file overview page."""
        result = None
        if donor_specific_assembly: 
            request_handler = RequestHandler(request=request)
            result = self._get_sample_summary_fields(
                request_handler, self.properties
            )
        return result or None

    def _get_sample_summary_fields(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get sample summary for display on file overview page."""
        constants = CalcPropConstants
        to_include = {
            constants.SAMPLE_SUMMARY_DONOR_IDS: get_property_values_from_identifiers(
                request_handler,
                supp_file_utils.get_donors(file_properties, request_handler),
                item_utils.get_external_id,
            ),
            constants.SAMPLE_SUMMARY_TISSUES: get_property_values_from_identifiers(
                request_handler,
                supp_file_utils.get_tissues(file_properties, request_handler),
                tissue_utils.get_location,
            ),
            constants.SAMPLE_SUMMARY_SAMPLE_NAMES: get_property_values_from_identifiers(
                request_handler,
                supp_file_utils.get_samples(file_properties, request_handler),
                functools.partial(
                    sample_utils.get_sample_names, request_handler=request_handler
                ),
            ),
            constants.SAMPLE_SUMMARY_SAMPLE_DESCRIPTIONS:
                get_property_values_from_identifiers(
                    request_handler,
                    supp_file_utils.get_samples(file_properties, request_handler),
                    functools.partial(
                        sample_utils.get_sample_descriptions,
                        request_handler=request_handler,
                    ),
                ),
            constants.SAMPLE_SUMMARY_STUDIES: get_property_values_from_identifiers(
                request_handler,
                supp_file_utils.get_samples(file_properties, request_handler),
                functools.partial(
                    sample_utils.get_studies, request_handler=request_handler
                ),
            ),
            constants.SAMPLE_SUMMARY_ANALYTES: get_property_values_from_identifiers(
                request_handler,
                supp_file_utils.get_analytes(file_properties, request_handler),
                analyte_utils.get_molecule,
            ),
        }
        return {key: value for key, value in to_include.items() if value}

    def _get_data_generation_summary(
        self, request: Request, donor_specific_assembly: Optional[str] = None
    ) -> Union[Dict[str, Any], None]:
        """Get data generation summary for display on file overview page."""
        request_handler = RequestHandler(request=request)
        result = self._get_data_generation_summary_fields(
            request_handler, self.properties
        )
        return result or None

    def _get_data_generation_summary_fields(
        self, request_handler: RequestHandler, file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get data generation summary for display on file overview page."""
        constants = CalcPropConstants
        to_include = {
            constants.DATA_GENERATION_DATA_CATEGORY: file_utils.get_data_category(
                file_properties
            ),
            constants.DATA_GENERATION_DATA_TYPE: file_utils.get_data_type(
                file_properties
            ),
            constants.DATA_GENERATION_SEQUENCING_CENTER: (
                get_property_value_from_identifier(
                    request_handler,
                    file_utils.get_sequencing_center(file_properties),
                    item_utils.get_display_title,
                )
            ),
            constants.DATA_GENERATION_SUBMISSION_CENTERS: (
                get_property_values_from_identifiers(
                    request_handler,
                    item_utils.get_submission_centers(file_properties),
                    item_utils.get_display_title,
                )
            ),
            constants.DATA_GENERATION_ASSAYS: get_property_values_from_identifiers(
                request_handler,
                supp_file_utils.get_assays(file_properties, request_handler),
                item_utils.get_display_title,
            ),
            constants.DATA_GENERATION_SEQUENCING_PLATFORMS: (
                get_property_values_from_identifiers(
                    request_handler,
                    supp_file_utils.get_sequencers(file_properties, request_handler),
                    item_utils.get_display_title,
                )
            ),
            constants.DATA_GENERATION_TARGET_COVERAGE: (
                get_property_values_from_identifiers(
                    request_handler,
                    supp_file_utils.get_sequencings(file_properties, request_handler),
                    sequencing_utils.get_target_coverage
                )
            ),
            constants.DATA_GENERATION_TARGET_READ_COUNT: (
                get_property_values_from_identifiers(
                    request_handler,
                    supp_file_utils.get_sequencings(file_properties, request_handler),
                    sequencing_utils.get_target_read_count
                )
            )
        }
        return {
            key: value for key, value in to_include.items() if value
        }
