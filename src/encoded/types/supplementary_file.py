from typing import Union, List, Optional, Dict, Any
from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_file import SubmittedFile
from .file import CalcPropConstants
from ..item_utils.utils import (
    get_property_value_from_identifier,
    RequestHandler,
)
from ..item_utils import (
    file as file_utils,
    item as item_utils
)


def _build_supplementary_file_embedded_list():
    """Embeds for search on supplementary files."""
    return SubmittedFile.embedded_list + [
        "reference_genome.display_title",
    ]


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

    @calculated_property(schema=CalcPropConstants.RELEASE_TRACKER_DESCRIPTION)
    def release_tracker_description(
        self,
        request: Request,
        file_sets: Optional[List[str]] = None
    ) -> Union[str, None]:
        """Get file release tracker description for display on home page."""
        if (file_set_source := SubmittedFile.release_tracker_description(self, request, file_sets)):
            return file_set_source
        request_handler = RequestHandler(request=request)
        result = self._get_release_tracker_description(
            request_handler,
            file_properties=self.properties
        )
        return result

    def _get_release_tracker_description(
            self,
            request_handler: RequestHandler,
            file_properties: Dict[str, Any],
        ) -> Union[str, None]:
        """Get release tracker description for display on the home page."""
        to_include = None
        file_format_title = get_property_value_from_identifier(
            request_handler,
            file_utils.get_file_format(file_properties),
            item_utils.get_display_title,
        )
        if "donor_specific_assembly" in file_properties:
            to_include = [
                "DSA",
                file_format_title
            ]
        if "override_release_tracker_description" in file_properties:
            to_include = [
                file_utils.get_override_release_tracker_description(file_properties),
                file_format_title
            ]
        return " ".join(to_include) if to_include else None
