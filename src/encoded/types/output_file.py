from typing import List, Dict, Any, Optional, Union

from snovault import collection, load_schema, calculated_property
# from snovault.snovault.calculated import calculated_property
from pyramid.request import Request

from .acl import ONLY_ADMIN_VIEW_ACL
from .file import File
from .file import CalcPropConstants


from ..item_utils.utils import (
    get_property_values_from_identifiers,
    RequestHandler,
)

from ..item_utils import (
    analysis_run as analysis_run_utils,
    tissue as tissue_utils,
    item as item_utils,
    file as file_utils,
    output_file as of_utils,
    donor as donor_utils
)


def _build_output_file_embedded_list():
    """Embeds for search on cell cultures."""
    return File.embedded_list + [
        "annotation.code",
        "annotation.version",
        "annotation.title",
    ]


@collection(
    name="output-files",
    acl=ONLY_ADMIN_VIEW_ACL,
    properties={
        "title": "SMaHT Output Files",
        "description": "Listing of SMaHT Output Files",
    },
)
class OutputFile(File):
    item_type = "output_file"
    schema = load_schema("encoded:schemas/output_file.json")
    embedded_list = _build_output_file_embedded_list()

    # processed files don't want md5 as unique key
    def unique_keys(self, properties):
        keys = super(OutputFile, self).unique_keys(properties)
        if keys.get('alias'):
            keys['alias'] = [k for k in keys['alias'] if not k.startswith('md5:')]
        return keys

    @classmethod
    def get_bucket(cls, registry):
        """ Output files live in the wfoutput bucket """
        return registry.settings['file_wfout_bucket']

    @calculated_property(schema=CalcPropConstants.SAMPLE_SOURCES_SCHEMA)
    def sample_sources(
       self,
       request: Request,
    ) -> Union[List[str], None]:
        """Get sample sources from file sets or analysis runs."""
        request_handler = RequestHandler(request=request)
        result = of_utils.get_sample_sources_from_associated_items(
            self.properties,
            request_handler
        )
        return result or None

    @calculated_property(schema=CalcPropConstants.DONORS_SCHEMA)
    def donors(
       self,
       request: Request,
    ) -> Union[List[str], None]:
        """Get donors from file sets or analysis_runs."""
        request_handler = RequestHandler(request=request)
        result = of_utils.get_donors_from_associated_items(
            self.properties,
            request_handler
        )
        return result or None

    def _get_sample_summary_fields(
        self, request_handler: RequestHandler,
        file_properties: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get sample summary for display on file overview page."""
        to_include = {
            CalcPropConstants.SAMPLE_SUMMARY_DONOR_IDS: get_property_values_from_identifiers(
                request_handler,
                of_utils.get_donors_from_associated_items(
                    file_properties, request_handler
                ),
                item_utils.get_external_id,
            ),
            CalcPropConstants.SAMPLE_SUMMARY_CATEGORY: of_utils.get_tissue_category(
                file_properties, request_handler),
            CalcPropConstants.SAMPLE_SUMMARY_TISSUES: of_utils.get_tissue_type(
                file_properties, request_handler),
            CalcPropConstants.SAMPLE_SUMMARY_TISSUE_SUBTYPES: get_property_values_from_identifiers(
                request_handler,
                of_utils.get_uberon_ids(file_properties, request_handler),
                item_utils.get_display_title,
            ),
            CalcPropConstants.SAMPLE_SUMMARY_TISSUE_DETAILS: get_property_values_from_identifiers(
                request_handler,
                of_utils.get_sample_sources_from_associated_items(
                    file_properties, request_handler),
                tissue_utils.get_location,
            ),
            CalcPropConstants.SAMPLE_SUMMARY_STUDIES: get_property_values_from_identifiers(
                request_handler,
                of_utils.get_donors_from_associated_items(
                    file_properties, request_handler),
                donor_utils.get_study
            ),
            }
        result = {key: value for key, value in to_include.items() if value}
        return result
