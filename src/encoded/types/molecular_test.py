from snovault import collection, load_schema

from .base import Item


@collection(
    name="molecular-tests",
    unique_key="submitted_id",
    properties={
        "title": "Molecular Tests",
        "description": "Molecular tests performed on donors",
    },
)
class MolecularTest(Item):
    item_type = "molecular_test"
    schema = load_schema("encoded:schemas/molecular_test.json")
    embedded_list = []
