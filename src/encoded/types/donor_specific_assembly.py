from typing import Union, List
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
    

    @calculated_property(
        schema={
            "title": "Chain Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "SupplementaryFile",
            },
        },
    )
    def chain_files(self,request:Request) -> Union[List[str], None]:
        """Get chain files from files."""
        results = self.rev_link_atids(request, "files")
        request_handler = RequestHandler(request = request)
        chain_files = dsa_utils.get_chain_files(request_handler,results)
        if chain_files:
            return chain_files
        return
