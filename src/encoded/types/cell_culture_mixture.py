from typing import Any, Dict, List, Optional, Union

from pyramid.request import Request
from snovault import calculated_property, collection, load_schema

from .cell_culture import CellCulture
from .utils import get_item


def _build_cell_culture_mixture_embedded_list():
    """Embeds for CellCultureMixture."""
    return CellCulture.embedded_list


@collection(
    name="cell-culture-mixtures",
    unique_key="submitted_id",
    properties={
        "title": "Cell Culture Mixtures",
        "description": "Mixtures of cell cultures for further study",
    },
)
class CellCultureMixture(CellCulture):
    item_type = "cell_culture_mixture"
    schema = load_schema("encoded:schemas/cell_culture_mixture.json")
    base_types = ["CellCulture"] + CellCulture.base_types
    embedded_list = _build_cell_culture_mixture_embedded_list()

    @calculated_property(
        schema={
            "title": "Cell Lines",
            "type": "array",
            "items": {
                "type": "string",
                "linkTo": "CellLine",
            },
        }
    )
    def cell_line(
        self, request: Request, components: Optional[List[Dict[str, Any]]] = None
    ) -> Union[List[str], None]:
        """Cell lines that make up the mixture.

        Though this is expected to be multiple cell lines, leaving
        property singular to match that on CellCulture.
        """
        result = None
        if components:
            cell_culture_ids = set(
                [component.get("cell_culture") for component in components]
            )
            cell_cultures = [
                get_item(request, cell_culture_id, collection="CellCulture")
                for cell_culture_id in cell_culture_ids
            ]
            cell_lines = set(
                [cell_culture.get("cell_line") for cell_culture in cell_cultures]
            )
            result = [cell_line for cell_line in cell_lines if cell_line]
        return result
