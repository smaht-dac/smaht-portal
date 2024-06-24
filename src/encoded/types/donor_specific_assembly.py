from typing import Any, Dict, List, Union

from pyramid.request import Request

# from pyramid.view import view_config
from snovault import calculated_property, collection, load_schema
# from snovault.util import debug_log, get_item_or_none

from .submitted_item import SubmittedItem
# from .base import item_edit
# from ..item_utils.file_set import get_libraries
# from ..item_utils.library import get_sample_sources


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
class DonorSpecificAssembly(SubmittedItem):
    item_type = "donor_specific_assembly"
    schema = load_schema("encoded:schemas/donor_specific_assembly.json")
    embedded_list = _build_dsa_embedded_list()

    rev = {"files": ("GeneralFile", "donor_specific_assembly")}

    @calculated_property(
        schema={
            "title": "Files",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "GeneralFile",
            },
        },
    )
    def files(self, request: Request) -> Union[List[str], None]:
        result = self.rev_link_atids(request, "files")
        if result:
            return result
        return


## Add a validator to check that the donor value is the same both for
# the file calc_prop and the donor link provided
# def validate_donor_matches_expected(context, request):
#     """Check if the donor link is the same as the calc_prop from file_sets."""
#     data = request.json
#     if "donor" in data:
#         donor_name = get_item_or_none(request, data["donor"], "display_title")

#         if not donor_name:
#             # item level validation will take care of generating the error
#             return
#         file_sets = data["file_sets"]
#         file_set_donors = [get_sample_sources(file_set) for file_set in file_sets]
#         if donor_name not in file_set_donors:
#             msg = "Inconsistent sample source between donor {} and file set {}".format(
#                 donor_name, file_set_donors
#             )
#             request.errors.add("body", "DonorSpecificAssembly: invalid format", msg)
#         else:
#             request.validated.update({})


# def validate_cell_line_matches_expected(context, request):
#     """Check if the cell_line link is the same as the calc_prop from file_sets."""
#     data = request.json
#     import pdb

#     pdb.set_trace()
#     if "cell_line" in data:
#         # cell_line_name = get_item_or_none(request, data["cell_line"], "display_title")
#         cell_line_name = data["cell_line"]
#         if not cell_line_name:
#             # item level validation will take care of generating the error
#             return
#         file_sets = []
#         for file_set in data["file_sets"]:
#             file_sets += [get_item_or_none(request, file_set, "libraries")]

#         file_set_cell_lines = [
#             get_sample_sources(library)
#             for library in get_libraries(file_set)
#             for file_set in file_sets
#         ]
#         if cell_line_name not in file_set_cell_lines:
#             msg = "Inconsistent sample source between cell line {} and file set {}".format(
#                 cell_line_name, file_set_cell_lines
#             )
#             request.errors.add("body", "DonorSpecificAssembly: invalid format", msg)
#         else:
#             request.validated.update({})


# DSA_EDIT_PATCH_VALIDATORS = [
#     validate_donor_matches_expected,
#     validate_cell_line_matches_expected,
# ]


# @view_config(
#     context=DonorSpecificAssembly,
#     permission="edit",
#     request_method="PATCH",
#     validators=DSA_EDIT_PATCH_VALIDATORS,
# )
# @debug_log
# def dsa_edit(context, request, render=None):
#     return item_edit(context, request, render)
