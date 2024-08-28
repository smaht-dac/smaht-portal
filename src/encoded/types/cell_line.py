from typing import Dict, Optional, Any, Union, List

from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_item import SubmittedItem
from ..item_utils.utils import RequestHandler
from ..item_utils import (
    cell_line as cell_line_utils
)

@collection(
    name="cell-lines",
    unique_key="submitted_id",
    properties={
        "title": "Cell Lines",
        "description": "Cell lines",
    },
)
class CellLine(SubmittedItem):
    item_type = "cell_line"
    schema = load_schema("encoded:schemas/cell_line.json")
    embedded_list = []

    
    @calculated_property(
        schema={
            "title": "Source Donor",
            "type": "string",
            "linkTo": "Donor"
        }
    )
    def source_donor(
        self,
        request: Request,
        donor: Optional[str] = None,
        tissue_samples: Optional[List[str]] = None,
        parent_cell_lines: Optional[List[str]] = None,
    ) -> Union[str, None]:
        """Donor for the cell line.

        If the donor property has a value, return that, else grab donor from tissue_samples or parent_cell_lines.tissue_samples.
        """
        import pdb; pdb.set_trace()
        return self._get_source_donor(request, donor, tissue_samples, parent_cell_lines)
    
    def _get_source_donor(
        self,
        request: Request,
        donor: Optional[str] = None,
        tissue_samples: Optional[List[str]] = None,
        parent_cell_lines: Optional[List[str]] = None,
    ) -> Union[str, None]:
        """"Get donor calc_prop"""
        request_handler = RequestHandler(request=request)
        return cell_line_utils.get_donor(request_handler, self.properties)