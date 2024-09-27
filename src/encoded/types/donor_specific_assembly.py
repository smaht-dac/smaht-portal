from typing import Union, List, Optional
from snovault import collection, load_schema, calculated_property
from pyramid.request import Request

from .submitted_item import SubmittedItem
from .reference_genome import ReferenceGenome

from ..item_utils.utils import RequestHandler
from ..item_utils import donor_specific_assembly as dsa_utils

def _build_dsa_embedded_list():
    """Embeds for search on general files."""
    return SubmittedItem.embedded_list


@collection(
    name="donor-specific-assemblies",
    unique_key="submitted_id",
    properties={
        "title": "Donor Specific Assembly",
        "description": "Donor-specific assembly",
    },
)
class DonorSpecificAssembly(SubmittedItem, ReferenceGenome):
    item_type = "donor_specific_assembly"
    base_types = ["ReferenceGenome"] + SubmittedItem.base_types
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()

    rev = {
        "files": ("SupplementaryFile", "donor_specific_assembly")
    }

    @calculated_property(
        schema = {
            "title": "Cell Line",
            "description": "Cell line source the assembly is derived from, if applicable",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "CellLine",
            },
        },
    )
    def cell_lines(self, request: Request, derived_from: Optional[List[str]] = None
    ) -> Union[str, None]:
        """Get Cell Lines associated with the assembly."""
        return self._get_cell_lines(request, derived_from=derived_from)

    @calculated_property(
        schema={
            "title": "Supplementary Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "SupplementaryFile",
            },
        },
    )
    def supplementary_files(self,request:Request) -> Union[List[str], None]:
        """Get supplementary files from files."""
        results = self.rev_link_atids(request, "files")
        request_handler = RequestHandler(request = request)
        supp_files = dsa_utils.get_supplementary_files(request_handler,results)
        if supp_files:
            return supp_files
        return

    @calculated_property(
        schema = {
            "title": "Donor",
            "description": "Donor source the assembly is derived from",
            "type": "array",
            "uniqueItems": True,
            "items": {
                "type": "string",
                "linkTo": "Donor",
            },
        },
    )
    def donors(self, request: Request, derived_from: Optional[List[str]] = None
    ) -> Union[str, None]:
        """Get Donors associated with the assembly."""
        return self._get_donors(request, derived_from=derived_from)

    @calculated_property(
        schema={
            "title": "Sequence Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "SupplementaryFile",
            },
        },
    )
    def sequence_files(self, request: Request) -> Union[List[str], None]:
        """Get fasta sequence files from files."""
        results = self.rev_link_atids(request, "files")
        request_handler = RequestHandler(request = request)
        seq_files = dsa_utils.get_sequence_files(request_handler,results)
        if seq_files:
            return seq_files
        return

    def _get_cell_lines(
        self, request: Request, derived_from: List[str]
    ) -> List[str]:
        """Get the cell line source associated with the assembly, if applicable."""
        request_handler = RequestHandler(request=request)
        return dsa_utils.get_cell_lines(self.properties,request_handler)

    def _get_donors(
        self, request: Request, derived_from: List[str]
    ) -> List[str]:
        """Get the donor source associated with the assembly."""
        request_handler = RequestHandler(request=request)
        return dsa_utils.get_donors(self.properties,request_handler)

